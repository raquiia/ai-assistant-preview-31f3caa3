output "knowledge_bucket" {
  value = aws_s3_bucket.knowledge.bucket
}

output "knowledge_bucket_arn" {
  value = aws_s3_bucket.knowledge.arn
}

output "ingestion_queue_url" {
  value = aws_sqs_queue.ingestion.url
}

output "ingestion_dlq_url" {
  value = aws_sqs_queue.ingestion_dlq.url
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "kms_key_arn" {
  value     = aws_kms_key.secrets.arn
  sensitive = true
}

output "ai_provider_secret_arns" {
  value = {
    for k, s in aws_secretsmanager_secret.ai_provider_keys : k => s.arn
  }
  sensitive = true
}
