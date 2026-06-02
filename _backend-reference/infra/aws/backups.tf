###############################################################################
# Wave 4 — Backups & Disaster Recovery
#   - RDS PITR 14j + cross-region automated backup replication
#   - S3 knowledge bucket versioning + lifecycle + cross-region replication
#   - AOSS snapshot via Lambda cron (no native snapshot for Serverless)
#   - Secrets Manager: 30-day recovery window (configured on each secret)
#
# RPO target: 1h, RTO target: 4h. See docs/runbooks/dr-restore.md.
###############################################################################

provider "aws" {
  alias  = "dr"
  region = var.dr_region
}

variable "dr_region" {
  type        = string
  default     = "eu-west-1"
  description = "Disaster-recovery region (primary is var.aws_region, e.g. eu-west-3)."
}

# ── RDS PITR + cross-region replication ──────────────────────────────────────
resource "aws_db_instance_automated_backups_replication" "rds" {
  source_db_instance_arn = aws_db_instance.main.arn
  retention_period       = 14
  kms_key_id             = aws_kms_key.dr.arn
  provider               = aws.dr
}

resource "aws_kms_key" "dr" {
  provider                = aws.dr
  description             = "MP DR KMS key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = var.common_tags
}

# ── S3 knowledge bucket — versioning + lifecycle + replication ───────────────
resource "aws_s3_bucket_versioning" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "knowledge" {
  bucket = aws_s3_bucket.knowledge.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }

  rule {
    id     = "transition-cold"
    status = "Enabled"
    transition {
      days          = 60
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 180
      storage_class = "GLACIER"
    }
  }
}

resource "aws_s3_bucket" "knowledge_dr" {
  provider      = aws.dr
  bucket        = "${var.bucket_prefix}-knowledge-dr"
  force_destroy = false
  tags          = merge(var.common_tags, { Purpose = "dr-replica" })
}

resource "aws_s3_bucket_versioning" "knowledge_dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.knowledge_dr.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_replication_configuration" "knowledge" {
  role   = aws_iam_role.s3_replication.arn
  bucket = aws_s3_bucket.knowledge.id

  rule {
    id     = "replicate-all"
    status = "Enabled"
    filter {}
    delete_marker_replication { status = "Enabled" }
    destination {
      bucket        = aws_s3_bucket.knowledge_dr.arn
      storage_class = "STANDARD_IA"
      encryption_configuration { replica_kms_key_id = aws_kms_key.dr.arn }
    }
    source_selection_criteria {
      sse_kms_encrypted_objects { status = "Enabled" }
    }
  }

  depends_on = [aws_s3_bucket_versioning.knowledge]
}

# ── AOSS snapshot Lambda (cron daily) ────────────────────────────────────────
resource "aws_lambda_function" "aoss_snapshot" {
  function_name = "mp-aoss-snapshot"
  role          = aws_iam_role.aoss_snapshot.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda.repository_url}:aoss-snapshot-${var.lambda_image_tag}"
  timeout       = 300
  memory_size   = 512

  environment {
    variables = {
      AOSS_ENDPOINT   = aws_opensearchserverless_collection.knowledge.collection_endpoint
      SNAPSHOT_BUCKET = aws_s3_bucket.knowledge_dr.bucket
      SNAPSHOT_ROLE   = aws_iam_role.aoss_snapshot_repo.arn
    }
  }

  tags = var.common_tags
}

resource "aws_cloudwatch_event_rule" "aoss_snapshot_daily" {
  name                = "mp-aoss-snapshot-daily"
  schedule_expression = "cron(0 3 * * ? *)"   # 03:00 UTC
}

resource "aws_cloudwatch_event_target" "aoss_snapshot" {
  rule = aws_cloudwatch_event_rule.aoss_snapshot_daily.name
  arn  = aws_lambda_function.aoss_snapshot.arn
}

resource "aws_lambda_permission" "aoss_snapshot_events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.aoss_snapshot.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.aoss_snapshot_daily.arn
}

# Alarm: missed snapshot = no Lambda invocation in 25h
resource "aws_cloudwatch_metric_alarm" "aoss_snapshot_missed" {
  alarm_name          = "mp-aoss-snapshot-missed"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Invocations"
  namespace           = "AWS/Lambda"
  period              = 90000   # 25h
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "breaching"
  dimensions          = { FunctionName = aws_lambda_function.aoss_snapshot.function_name }
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
}
