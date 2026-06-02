# AWS migration skeleton

This folder contains a coherent Terraform skeleton for the future AWS deployment target. It is intentionally not applied by the local MVP and expects real account, domain, network and security decisions before use.

Target services:

- VPC with private subnets and VPC endpoints
- ECS Fargate services for web/api/worker
- RDS PostgreSQL
- S3 knowledge buckets with versioning
- OpenSearch Serverless vector collection
- Cognito User Pool groups matching RBAC roles
- Secrets Manager with KMS key
- SQS queues for ingestion
- CloudWatch logs, dashboards and alarms

Run only after filling variables and reviewing IAM boundaries.
