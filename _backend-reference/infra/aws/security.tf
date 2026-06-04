# ---------------------------------------------------------------------------
# Security groups — least privilege per tier.
# ---------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public ALB"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTPS from the world"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP (redirects to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${local.name}-alb" })
}

resource "aws_security_group" "ecs_api" {
  name        = "${local.name}-ecs-api"
  description = "ECS API tasks"
  vpc_id      = local.vpc_id

  ingress {
    description     = "ALB to api"
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description     = "ALB to web"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${local.name}-ecs-api" })
}

resource "aws_security_group" "ecs_worker" {
  name        = "${local.name}-ecs-worker"
  description = "ECS worker tasks (no ingress)"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${local.name}-ecs-worker" })
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "Postgres — accessible from ECS only"
  vpc_id      = local.vpc_id

  ingress {
    description     = "Postgres from api"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_api.id, aws_security_group.ecs_worker.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${local.name}-rds" })
}

resource "aws_security_group" "aoss" {
  name        = "${local.name}-aoss"
  description = "AOSS — accessible from ECS"
  vpc_id      = local.vpc_id

  ingress {
    description     = "HTTPS from api/worker"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_api.id, aws_security_group.ecs_worker.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${local.name}-aoss" })
}

resource "aws_security_group" "vpce" {
  name        = "${local.name}-vpce"
  description = "VPC endpoints"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${local.name}-vpce" })
}
