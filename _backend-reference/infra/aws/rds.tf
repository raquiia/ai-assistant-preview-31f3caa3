# ---------------------------------------------------------------------------
# RDS Postgres 16 — Multi-AZ, encrypted, master password in Secrets Manager.
# ---------------------------------------------------------------------------

resource "random_password" "rds_master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "rds_master" {
  name       = "${local.name}/rds/master"
  kms_key_id = aws_kms_key.secrets.arn
  tags       = local.tags
}

resource "aws_secretsmanager_secret_version" "rds_master" {
  secret_id = aws_secretsmanager_secret.rds_master.id
  secret_string = jsonencode({
    username = "mpadmin"
    password = random_password.rds_master.result
  })
  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = local.private_subnet_ids
  tags       = local.tags
}

resource "aws_db_parameter_group" "postgres16" {
  name   = "${local.name}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_statement"
    value = "ddl"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
  tags = local.tags
}

resource "aws_db_instance" "postgres" {
  identifier                      = "${local.name}-postgres"
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = var.rds_instance_class
  allocated_storage               = 50
  max_allocated_storage           = 200
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.secrets.arn
  db_name                         = "mpassistant"
  username                        = "mpadmin"
  password                        = random_password.rds_master.result
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.rds.id]
  parameter_group_name            = aws_db_parameter_group.postgres16.name
  multi_az                        = var.rds_multi_az
  backup_retention_period         = 14
  backup_window                   = "03:00-04:00"
  maintenance_window              = "sun:04:00-sun:05:00"
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.secrets.arn
  deletion_protection             = var.rds_deletion_protection
  skip_final_snapshot             = !var.rds_deletion_protection
  final_snapshot_identifier       = "${local.name}-postgres-final"
  enabled_cloudwatch_logs_exports = ["postgresql"]
  tags                            = local.tags

  # Garde-fou anti-suppression accidentelle : tout `terraform destroy` ciblant
  # cette instance échouera tant que ce bloc est présent. Pour supprimer
  # volontairement la BDD, retirer ce bloc dans un PR dédié puis re-apply.
  lifecycle {
    prevent_destroy = true
  }
}

# DATABASE_URL exposed via Secrets Manager — referenced by ECS task envs.
resource "aws_secretsmanager_secret" "database_url" {
  name       = "${local.name}/rds/database_url"
  kms_key_id = aws_kms_key.secrets.arn
  tags       = local.tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql://%s:%s@%s/%s?sslmode=require",
    "mpadmin",
    random_password.rds_master.result,
    aws_db_instance.postgres.endpoint,
    "mpassistant"
  )
}
