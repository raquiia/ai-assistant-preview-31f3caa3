###############################################################################
# Wave 4 — Centralised log groups + metric filters + alarms.
###############################################################################

locals {
  log_groups = {
    "/mp/ecs/api"           = 30
    "/mp/ecs/worker"        = 30
    "/mp/api/audit"         = 90
    "/mp/lambda/billing"    = 30
    "/mp/lambda/aoss-snap"  = 30
    "/mp/lambda/cognito"    = 30
    "/mp/lambda/rotation"   = 30
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = local.log_groups
  name              = each.key
  retention_in_days = each.value
  kms_key_id        = aws_kms_key.main.arn
  tags              = var.common_tags
}

# ── Metric filters → alarms ────────────────────────────────────────────────
resource "aws_cloudwatch_log_metric_filter" "budget_exceeded" {
  name           = "mp-budget-exceeded"
  log_group_name = aws_cloudwatch_log_group.app["/mp/ecs/api"].name
  pattern        = "{ $.error = \"budget_exceeded\" }"
  metric_transformation {
    name      = "BudgetExceededCount"
    namespace = "MP/App"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "rate_limited" {
  name           = "mp-rate-limited"
  log_group_name = aws_cloudwatch_log_group.app["/mp/ecs/api"].name
  pattern        = "{ $.error = \"rate_limited\" }"
  metric_transformation {
    name      = "RateLimitedCount"
    namespace = "MP/App"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "model_not_allowed" {
  name           = "mp-model-not-allowed"
  log_group_name = aws_cloudwatch_log_group.app["/mp/ecs/api"].name
  pattern        = "{ $.error = \"model_not_allowed\" }"
  metric_transformation {
    name      = "ModelNotAllowedCount"
    namespace = "MP/App"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "pii_redacted" {
  name           = "mp-pii-redacted"
  log_group_name = aws_cloudwatch_log_group.app["/mp/api/audit"].name
  pattern        = "{ $.action = \"pii.redacted\" }"
  metric_transformation {
    name      = "PIIRedactedCount"
    namespace = "MP/App"
    value     = "$.count"
    unit      = "Count"
  }
}

# ── Alarms ────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "budget_exceeded_burst" {
  alarm_name          = "mp-budget-exceeded-burst"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BudgetExceededCount"
  namespace           = "MP/App"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rate_limited_burst" {
  alarm_name          = "mp-rate-limited-burst"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RateLimitedCount"
  namespace           = "MP/App"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
}

# ── Subscription filter → Firehose → S3 (long-term Athena queries) ─────────
resource "aws_kinesis_firehose_delivery_stream" "logs_archive" {
  name        = "mp-logs-archive"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn           = aws_iam_role.firehose.arn
    bucket_arn         = aws_s3_bucket.cloudtrail.arn   # reuse the audit bucket
    prefix             = "app-logs/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/"
    error_output_prefix = "app-logs-errors/"
    buffering_size     = 64
    buffering_interval = 300
    compression_format = "GZIP"
  }
  tags = var.common_tags
}

resource "aws_cloudwatch_log_subscription_filter" "api_to_firehose" {
  name            = "mp-api-to-firehose"
  log_group_name  = aws_cloudwatch_log_group.app["/mp/ecs/api"].name
  filter_pattern  = ""
  destination_arn = aws_kinesis_firehose_delivery_stream.logs_archive.arn
  role_arn        = aws_iam_role.logs_to_firehose.arn
}
