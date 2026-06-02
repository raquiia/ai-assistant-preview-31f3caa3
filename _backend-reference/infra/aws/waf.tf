###############################################################################
# Wave 4 — AWS WAFv2 (regional) attached to the ALB.
#
# Layers:
#   1. AWS managed rule groups (Core, KnownBadInputs, SQLi)
#   2. Rate limit 1000 req/5min/IP on /auth/* and /chat
#   3. Optional geo restriction (set var.waf_allowed_countries)
###############################################################################

resource "aws_wafv2_web_acl" "main" {
  name        = "mp-web-acl"
  description = "MP application WAF"
  scope       = "REGIONAL"

  default_action { allow {} }

  ##### Managed rules #####################################################
  rule {
    name     = "AWS-CommonRuleSet"
    priority = 10
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "mp-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-KnownBadInputs"
    priority = 20
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "mp-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-SQLi"
    priority = 30
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "mp-sqli"
      sampled_requests_enabled   = true
    }
  }

  ##### Rate limit on auth + chat ##########################################
  rule {
    name     = "RateLimit-Auth-Chat"
    priority = 100
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
        scope_down_statement {
          or_statement {
            statement {
              byte_match_statement {
                field_to_match { uri_path {} }
                positional_constraint = "STARTS_WITH"
                search_string         = "/auth/"
                text_transformation { priority = 0 type = "LOWERCASE" }
              }
            }
            statement {
              byte_match_statement {
                field_to_match { uri_path {} }
                positional_constraint = "STARTS_WITH"
                search_string         = "/chat"
                text_transformation { priority = 0 type = "LOWERCASE" }
              }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "mp-rate-auth-chat"
      sampled_requests_enabled   = true
    }
  }

  ##### Optional: geo allowlist ############################################
  dynamic "rule" {
    for_each = length(var.waf_allowed_countries) > 0 ? [1] : []
    content {
      name     = "GeoAllowList"
      priority = 200
      action { block {} }
      statement {
        not_statement {
          statement {
            geo_match_statement { country_codes = var.waf_allowed_countries }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "mp-geo"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "mp-web-acl"
    sampled_requests_enabled   = true
  }

  tags = var.common_tags
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

variable "waf_allowed_countries" {
  type    = list(string)
  default = []
  description = "ISO-2 country codes to allow. Empty list disables geo-blocking."
}
