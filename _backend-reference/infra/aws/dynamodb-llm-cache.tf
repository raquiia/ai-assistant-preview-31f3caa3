# Wave 6.E — DynamoDB table backing the LLM response cache.
#
# On-demand billing + TTL on the `ttl` attribute (7-day retention by default,
# overridable per-write via the service). PITR enabled for safety, KMS
# encryption with the project-managed CMK.

resource "aws_dynamodb_table" "llm_cache" {
  name         = "${var.project}-llm-cache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "cacheKey"

  attribute {
    name = "cacheKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.main.arn
  }

  tags = merge(local.common_tags, {
    Name      = "${var.project}-llm-cache"
    Component = "llm-cache"
  })
}

# IAM policy snippet to attach to the API task role.
data "aws_iam_policy_document" "llm_cache_rw" {
  statement {
    sid    = "LlmCacheReadWrite"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
    ]
    resources = [aws_dynamodb_table.llm_cache.arn]
  }
}

resource "aws_iam_policy" "llm_cache_rw" {
  name   = "${var.project}-llm-cache-rw"
  policy = data.aws_iam_policy_document.llm_cache_rw.json
}

resource "aws_iam_role_policy_attachment" "api_llm_cache_rw" {
  role       = aws_iam_role.api_task.name
  policy_arn = aws_iam_policy.llm_cache_rw.arn
}

# Surface table name to the API container.
output "llm_cache_table_name" {
  value = aws_dynamodb_table.llm_cache.name
}
