###############################################################################
# Wave 4 — VPC Interface & Gateway Endpoints (PrivateLink)
#
# Goal: keep ALL AWS API traffic from ECS tasks INSIDE the VPC. Saves NAT
# egress $$ and removes a public Internet hop for sensitive calls (Bedrock,
# Secrets Manager, KMS, AOSS, Textract, Transcribe).
#
# Pre-req: VPC + private subnets defined in network.tf with the symbolic names
#   aws_vpc.main, aws_subnet.private[*], aws_security_group.endpoints
###############################################################################

locals {
  interface_endpoints = toset([
    "bedrock-runtime",
    "bedrock",
    "secretsmanager",
    "kms",
    "sqs",
    "sns",
    "textract",
    "transcribe",
    "logs",
    "monitoring",        # CloudWatch metrics (PutMetricData)
    "states",            # Step Functions
    "ecr.api",
    "ecr.dkr",
    "sts",
    "events",            # EventBridge
    "lambda",            # invoke from API
    "xray",
  ])
}

# Interface endpoints — one ENI per AZ per service.
resource "aws_vpc_endpoint" "interface" {
  for_each            = local.interface_endpoints
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true

  tags = merge(var.common_tags, {
    Name      = "mp-vpce-${each.value}"
    Component = "network"
  })
}

# Gateway endpoints (free, no ENI) — S3 + DynamoDB.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
  tags              = merge(var.common_tags, { Name = "mp-vpce-s3", Component = "network" })
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
  tags              = merge(var.common_tags, { Name = "mp-vpce-dynamodb", Component = "network" })
}

# AOSS (OpenSearch Serverless) uses a private VPC endpoint resource (distinct).
resource "aws_opensearchserverless_vpc_endpoint" "aoss" {
  name               = "mp-aoss-vpce"
  vpc_id             = aws_vpc.main.id
  subnet_ids         = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.endpoints.id]
}

# SG dedicated to VPC endpoints — only accepts HTTPS from ECS task SG.
resource "aws_security_group" "endpoints" {
  name        = "mp-vpc-endpoints"
  description = "Allow ECS tasks to reach AWS APIs via PrivateLink"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
    description     = "HTTPS from ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, { Name = "mp-vpc-endpoints" })
}

output "vpc_endpoint_ids" {
  value = { for k, v in aws_vpc_endpoint.interface : k => v.id }
}
