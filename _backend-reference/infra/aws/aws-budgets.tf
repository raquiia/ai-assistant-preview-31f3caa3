# Wave 6.I — AWS Budgets : alertes coût + tokens IA.
#
# 3 budgets superposés :
#   1. Budget mensuel global (toutes ressources tagguées Project=mp-ai-assistant)
#   2. Budget Bedrock/LLM seulement (filtre service)
#   3. Budget OpenSearch Serverless (souvent le poste #1)
#
# Notifications : 50% / 80% / 100% → SNS topic → email ops + Slack via Lambda.
# Couplé avec _backend-reference/.../budgets.ts (Wave 5) côté app pour cut-off
# côté code quand un user dépasse son enveloppe individuelle.

variable "monthly_budget_eur" {
  type    = number
  default = 1500
}

resource "aws_sns_topic" "budget_alerts" {
  name = "mp-ai-budget-alerts"
}

resource "aws_sns_topic_subscription" "budget_email" {
  topic_arn = aws_sns_topic.budget_alerts.arn
  protocol  = "email"
  endpoint  = var.budget_alert_email # ex: ops@migso-pcubed.com
}

# 1) Budget global mensuel
resource "aws_budgets_budget" "global_monthly" {
  name              = "mp-ai-global-monthly"
  budget_type       = "COST"
  limit_amount      = tostring(var.monthly_budget_eur)
  limit_unit        = "EUR"
  time_unit         = "MONTHLY"
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$mp-ai-assistant"]
  }
  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      notification_type          = notification.value == 100 ? "FORECASTED" : "ACTUAL"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      subscriber_sns_topic_arns  = [aws_sns_topic.budget_alerts.arn]
    }
  }
}

# 2) Budget Bedrock dédié (visibilité coût IA)
resource "aws_budgets_budget" "bedrock_monthly" {
  name         = "mp-ai-bedrock-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_eur * 0.4) # ~40% du global
  limit_unit   = "EUR"
  time_unit    = "MONTHLY"
  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    subscriber_sns_topic_arns  = [aws_sns_topic.budget_alerts.arn]
  }
}

# 3) Budget OpenSearch Serverless
resource "aws_budgets_budget" "aoss_monthly" {
  name         = "mp-ai-aoss-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_eur * 0.3)
  limit_unit   = "EUR"
  time_unit    = "MONTHLY"
  cost_filter {
    name   = "Service"
    values = ["Amazon OpenSearch Service"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    subscriber_sns_topic_arns  = [aws_sns_topic.budget_alerts.arn]
  }
}

variable "budget_alert_email" {
  type        = string
  description = "Email recevant les alertes AWS Budgets"
}
