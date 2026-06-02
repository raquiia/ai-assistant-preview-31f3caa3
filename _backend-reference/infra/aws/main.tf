terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
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
}

resource "aws_kms_key" "secrets" {
  description             = "KMS key for MIGSO-PCUBED AI Assistant secrets and data encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_s3_bucket" "knowledge" {
  bucket = "${local.name}-knowledge"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_sqs_queue" "ingestion" {
  name                       = "${local.name}-ingestion"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 1209600
  kms_master_key_id          = aws_kms_key.secrets.arn
  tags                       = local.tags
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.name}-users"
  tags = local.tags
}

resource "aws_cognito_user_group" "roles" {
  for_each     = toset(["CONSULTANT", "MANAGER", "SUPER_ADMIN", "AUDITOR"])
  name         = each.key
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_secretsmanager_secret" "ai_provider_keys" {
  name       = "${local.name}/ai-provider-keys"
  kms_key_id = aws_kms_key.secrets.arn
  tags       = local.tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.secrets.arn
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name}/worker"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.secrets.arn
  tags              = local.tags
}

# Placeholders for VPC, ECS Fargate, RDS PostgreSQL and OpenSearch Serverless.
# In a real environment, add private subnets, least-privilege task roles,
# security groups, RDS subnet groups, AOSS encryption/network/access policies,
# and CloudWatch alarms/dashboards.
