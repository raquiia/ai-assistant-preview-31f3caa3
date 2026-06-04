###############################################################################
# Textract async extraction — SNS callback topic + SQS callback queue + IAM.
#
# Wires:
#   Textract (StartDocumentTextDetection)
#     └─ NotificationChannel SNS  ──▶  SQS callback queue
#                                          └─ Worker SqsConsumer drains it
#                                                └─ persists status=PUBLISHED
###############################################################################

# ----- SNS topic Textract publishes job completion events to ----------------
resource "aws_sns_topic" "textract_callback" {
  name              = "${local.name}-textract-callback"
  kms_master_key_id = "alias/aws/sns"
  tags              = local.tags
}

# ----- SQS callback queue (with DLQ) ----------------------------------------
resource "aws_sqs_queue" "ingestion_callback_dlq" {
  name                       = "${local.name}-ingestion-callback-dlq"
  message_retention_seconds  = 1209600 # 14 days
  kms_master_key_id          = "alias/aws/sqs"
  tags                       = local.tags
}

resource "aws_sqs_queue" "ingestion_callback" {
  name                       = "${local.name}-ingestion-callback"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 345600 # 4 days
  kms_master_key_id          = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ingestion_callback_dlq.arn
    maxReceiveCount     = 5
  })

  tags = local.tags
}

# Allow SNS to deliver into the queue.
data "aws_iam_policy_document" "ingestion_callback_queue_policy" {
  statement {
    sid     = "AllowSNSDelivery"
    actions = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.ingestion_callback.arn]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.textract_callback.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ingestion_callback" {
  queue_url = aws_sqs_queue.ingestion_callback.id
  policy    = data.aws_iam_policy_document.ingestion_callback_queue_policy.json
}

resource "aws_sns_topic_subscription" "ingestion_callback" {
  topic_arn            = aws_sns_topic.textract_callback.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.ingestion_callback.arn
  raw_message_delivery = false
}

# ----- IAM role assumed by Textract to publish to SNS -----------------------
data "aws_iam_policy_document" "textract_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["textract.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "textract_service" {
  name               = "${local.name}-textract-service"
  assume_role_policy = data.aws_iam_policy_document.textract_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "textract_publish" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.textract_callback.arn]
  }
}

resource "aws_iam_role_policy" "textract_publish" {
  name   = "${local.name}-textract-publish"
  role   = aws_iam_role.textract_service.id
  policy = data.aws_iam_policy_document.textract_publish.json
}

# ----- Worker task policy: call Textract + drain the callback queue --------
data "aws_iam_policy_document" "worker_textract" {
  statement {
    sid = "TextractJobs"
    actions = [
      "textract:StartDocumentTextDetection",
      "textract:GetDocumentTextDetection",
      "textract:StartDocumentAnalysis",
      "textract:GetDocumentAnalysis",
    ]
    resources = ["*"]
  }

  statement {
    sid = "CallbackQueueDrain"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
    ]
    resources = [
      aws_sqs_queue.ingestion_callback.arn,
      aws_sqs_queue.ingestion_callback_dlq.arn,
    ]
  }

  statement {
    sid       = "PassTextractRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.textract_service.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["textract.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "worker_textract" {
  # The worker task role is created in ecs.tf — referenced by name here so
  # this file can be applied independently.
  name   = "${local.name}-worker-textract"
  role   = aws_iam_role.task_role_worker.id
  policy = data.aws_iam_policy_document.worker_textract.json
}

# ----- Outputs (injected into worker env via ecs.tf) -----------------------
output "textract_sns_topic_arn"          { value = aws_sns_topic.textract_callback.arn }
output "textract_service_role_arn"       { value = aws_iam_role.textract_service.arn }
output "sqs_ingestion_callback_url"      { value = aws_sqs_queue.ingestion_callback.url }
output "sqs_ingestion_callback_dlq_url"  { value = aws_sqs_queue.ingestion_callback_dlq.url }
