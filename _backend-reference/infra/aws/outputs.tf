output "knowledge_bucket" {
  value = aws_s3_bucket.knowledge.bucket
}

output "ingestion_queue_url" {
  value = aws_sqs_queue.ingestion.url
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "ai_provider_secret_arn" {
  value     = aws_secretsmanager_secret.ai_provider_keys.arn
  sensitive = true
}
