output "kms_key_arn" {
  value = aws_kms_key.secrets.arn
}

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

output "cognito_user_pool_arn" {
  value = aws_cognito_user_pool.main.arn
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "ai_provider_secret_arns" {
  value = { for k, s in aws_secretsmanager_secret.ai_provider_keys : k => s.arn }
}

output "database_url_secret_arn" {
  value     = aws_secretsmanager_secret.database_url.arn
  sensitive = true
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_url" {
  value = "http://${aws_lb.main.dns_name}"
}

output "cloudfront_domain" {
  value = length(aws_cloudfront_distribution.web) > 0 ? aws_cloudfront_distribution.web[0].domain_name : null
}

output "app_url" {
  description = "Public URL to access the deployed app"
  value = length(aws_cloudfront_distribution.web) > 0 ? "https://${aws_cloudfront_distribution.web[0].domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "aoss_collection_endpoint" {
  value = aws_opensearchserverless_collection.vectors.collection_endpoint
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
