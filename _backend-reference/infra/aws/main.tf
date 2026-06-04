terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name = "${var.project_name}-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
  ai_providers = ["mistral", "openai", "tavily", "serpapi"]
}

# ---------------------------------------------------------------------------
# KMS
# ---------------------------------------------------------------------------

resource "aws_kms_key" "secrets" {
  description             = "KMS key for MIGSO-PCUBED AI Assistant secrets and data encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootPermissions"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.aws_region}.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:*"
          }
        }
      }
    ]
  })
  tags = local.tags
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${local.name}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# ---------------------------------------------------------------------------
# S3 - Knowledge base bucket (PDF/DOCX/media uploads)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "knowledge" {
  bucket = "${local.name}-knowledge"
  tags   = local.tags

  # Garde-fou anti-suppression accidentelle (bucket = données utilisateurs).
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "knowledge" {
  bucket                  = aws_s3_bucket.knowledge.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.secrets.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_cors_configuration" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id

  # Presigned PUT for KB document upload from the admin UI.
  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = var.web_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {
      prefix = ""
    }
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ---------------------------------------------------------------------------
# SQS - Ingestion queue + DLQ + age alarm
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "ingestion_dlq" {
  name                      = "${local.name}-ingestion-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.secrets.arn
  tags                      = local.tags
}

resource "aws_sqs_queue" "ingestion" {
  name                       = "${local.name}-ingestion"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 1209600
  kms_master_key_id          = aws_kms_key.secrets.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ingestion_dlq.arn
    maxReceiveCount     = 5
  })
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ingestion_age" {
  alarm_name          = "${local.name}-ingestion-age"
  alarm_description   = "Oldest ingestion message exceeded SLA — worker may be stuck."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 600
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.ingestion.name
  }
  tags = local.tags
}

# ---------------------------------------------------------------------------
# Cognito - Users + RBAC groups
# ---------------------------------------------------------------------------

resource "aws_cognito_user_pool" "main" {
  name                     = "${local.name}-users"
  mfa_configuration        = "OPTIONAL"
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 3
  }

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = local.tags
}

resource "aws_cognito_user_group" "roles" {
  for_each     = toset(["CONSULTANT", "MANAGER", "SUPER_ADMIN", "AUDITOR"])
  name         = each.key
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = var.web_callback_urls
  logout_urls                          = var.web_logout_urls
  supported_identity_providers         = ["COGNITO"]
  prevent_user_existence_errors        = "ENABLED"
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}

# ---------------------------------------------------------------------------
# Secrets Manager - One secret per AI / search provider
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "ai_provider_keys" {
  for_each   = toset(local.ai_providers)
  name       = "${local.name}/ai-providers/${each.key}"
  kms_key_id = aws_kms_key.secrets.arn
  tags       = local.tags
}

# Bootstrap empty placeholder versions so the app can read the secret even
# before an operator rotates it manually. Replace with real rotation lambda.
resource "aws_secretsmanager_secret_version" "ai_provider_keys_placeholder" {
  for_each      = aws_secretsmanager_secret.ai_provider_keys
  secret_id     = each.value.id
  secret_string = jsonencode({ apiKey = "REPLACE_ME" })
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# CloudWatch - Log groups for ECS services
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = 90
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name}/worker"
  retention_in_days = 90
  tags              = local.tags
}

# ---------------------------------------------------------------------------
# Network, RDS, AOSS, ECR, ECS, IAM, CloudFront and CloudWatch are declared in
# their own files (network.tf, rds.tf, aoss.tf, ecr.tf, ecs.tf, iam.tf,
# cloudfront.tf, cloudwatch.tf, security.tf).
# ---------------------------------------------------------------------------
