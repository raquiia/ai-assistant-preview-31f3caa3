# ---------------------------------------------------------------------------
# IAM — ECS task execution + per-service task roles (least privilege).
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

# ---- ECS task execution role (used to pull images, ship logs, read secrets at start) ----
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "secrets-read"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = concat(
          [aws_secretsmanager_secret.database_url.arn, aws_secretsmanager_secret.rds_master.arn],
          [for s in aws_secretsmanager_secret.ai_provider_keys : s.arn]
        )
      },
      {
        Effect = "Allow"
        Action = ["kms:Decrypt"]
        Resource = [aws_kms_key.secrets.arn]
      }
    ]
  })
}

# ---- API task role ----
resource "aws_iam_role" "task_role_api" {
  name               = "${local.name}-task-api"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "task_role_api" {
  name = "app-perms"
  role = aws_iam_role.task_role_api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.knowledge.arn,
          "${aws_s3_bucket.knowledge.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.ingestion.arn]
      },
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = concat(
          [aws_secretsmanager_secret.database_url.arn],
          [for s in aws_secretsmanager_secret.ai_provider_keys : s.arn]
        )
      },
      {
        Effect = "Allow"
        Action = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.secrets.arn]
      },
      {
        Effect = "Allow"
        Action = ["aoss:APIAccessAll"]
        Resource = [aws_opensearchserverless_collection.vectors.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminListGroupsForUser"
        ]
        Resource = [aws_cognito_user_pool.main.arn]
      }
    ]
  })
}

# ---- Worker task role ----
resource "aws_iam_role" "task_role_worker" {
  name               = "${local.name}-task-worker"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "task_role_worker" {
  name = "app-perms"
  role = aws_iam_role.task_role_worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.knowledge.arn,
          "${aws_s3_bucket.knowledge.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
        Resource = [aws_sqs_queue.ingestion.arn]
      },
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = concat(
          [aws_secretsmanager_secret.database_url.arn],
          [for s in aws_secretsmanager_secret.ai_provider_keys : s.arn]
        )
      },
      {
        Effect = "Allow"
        Action = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.secrets.arn]
      },
      {
        Effect = "Allow"
        Action = ["aoss:APIAccessAll"]
        Resource = [aws_opensearchserverless_collection.vectors.arn]
      }
      # Uncomment when enabling heavy extraction:
      # ,{
      #   Effect = "Allow"
      #   Action = ["textract:DetectDocumentText", "textract:AnalyzeDocument",
      #             "transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"]
      #   Resource = ["*"]
      # }
    ]
  })
}
