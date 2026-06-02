###############################################################################
# Wave 4 — Compliance & threat detection
#   - CloudTrail (multi-region) → S3 + CW Logs
#   - AWS Config (rules baseline)
#   - GuardDuty
#   - Security Hub (CIS + AWS FSBP standards)
#   - SNS topic ops-alerts (PagerDuty/Slack subscribers added manually)
###############################################################################

# ── Ops alerting SNS topic ───────────────────────────────────────────────────
resource "aws_sns_topic" "ops_alerts" {
  name              = "mp-ops-alerts"
  kms_master_key_id = aws_kms_key.main.arn
  tags              = var.common_tags
}

# ── CloudTrail ───────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "cloudtrail" {
  bucket        = "${var.bucket_prefix}-cloudtrail"
  force_destroy = false
  tags          = var.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket                  = aws_s3_bucket.cloudtrail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  rule {
    id     = "transition-to-glacier"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration { days = 400 }
  }
}

resource "aws_cloudtrail" "main" {
  name                          = "mp-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.main.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["${aws_s3_bucket.knowledge.arn}/"]
    }
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail]
  tags       = var.common_tags
}

data "aws_iam_policy_document" "cloudtrail_bucket" {
  statement {
    sid     = "AllowCloudTrail"
    actions = ["s3:GetBucketAcl", "s3:PutObject"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    resources = [aws_s3_bucket.cloudtrail.arn, "${aws_s3_bucket.cloudtrail.arn}/*"]
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  policy = data.aws_iam_policy_document.cloudtrail_bucket.json
}

# ── AWS Config ───────────────────────────────────────────────────────────────
resource "aws_config_configuration_recorder" "main" {
  name     = "mp-config"
  role_arn = aws_iam_role.config.arn
  recording_group { all_supported = true }
}

resource "aws_config_delivery_channel" "main" {
  name           = "mp-config"
  s3_bucket_name = aws_s3_bucket.cloudtrail.id
  depends_on     = [aws_config_configuration_recorder.main]
}

resource "aws_config_configuration_recorder_status" "main" {
  name       = aws_config_configuration_recorder.main.name
  is_enabled = true
  depends_on = [aws_config_delivery_channel.main]
}

locals {
  config_rules = {
    s3-public-read-prohibited = "S3_BUCKET_PUBLIC_READ_PROHIBITED"
    rds-storage-encrypted     = "RDS_STORAGE_ENCRYPTED"
    iam-password-policy       = "IAM_PASSWORD_POLICY"
    restricted-ssh            = "INCOMING_SSH_DISABLED"
    root-mfa                  = "ROOT_ACCOUNT_MFA_ENABLED"
    cloudtrail-enabled        = "CLOUD_TRAIL_ENABLED"
  }
}

resource "aws_config_config_rule" "managed" {
  for_each = local.config_rules
  name     = each.key
  source {
    owner             = "AWS"
    source_identifier = each.value
  }
  depends_on = [aws_config_configuration_recorder_status.main]
}

# ── GuardDuty ────────────────────────────────────────────────────────────────
resource "aws_guardduty_detector" "main" {
  enable = true
  datasources {
    s3_logs { enable = true }
    kubernetes { audit_logs { enable = false } }
    malware_protection { scan_ec2_instance_with_findings { ebs_volumes { enable = false } } }
  }
  tags = var.common_tags
}

resource "aws_cloudwatch_event_rule" "guardduty" {
  name        = "mp-guardduty-findings"
  description = "Route GuardDuty findings of severity >= MEDIUM to ops SNS"
  event_pattern = jsonencode({
    source        = ["aws.guardduty"]
    "detail-type" = ["GuardDuty Finding"]
    detail        = { severity = [{ numeric = [">=", 4] }] }
  })
}

resource "aws_cloudwatch_event_target" "guardduty_sns" {
  rule = aws_cloudwatch_event_rule.guardduty.name
  arn  = aws_sns_topic.ops_alerts.arn
}

# ── Security Hub ─────────────────────────────────────────────────────────────
resource "aws_securityhub_account" "main" {}

resource "aws_securityhub_standards_subscription" "cis" {
  standards_arn = "arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0"
  depends_on    = [aws_securityhub_account.main]
}

resource "aws_securityhub_standards_subscription" "fsbp" {
  standards_arn = "arn:aws:securityhub:${var.aws_region}::standards/aws-foundational-security-best-practices/v/1.0.0"
  depends_on    = [aws_securityhub_account.main]
}
