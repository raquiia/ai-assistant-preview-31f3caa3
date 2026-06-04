# ---------------------------------------------------------------------------
# CloudFront + WAF.
# - var.enable_cloudfront = false → skipped, ALB is the public entrypoint
# - var.enable_cloudfront = true + var.web_domain = ""  → CloudFront with default *.cloudfront.net cert
# - var.enable_cloudfront = true + var.web_domain set   → CloudFront with custom domain + ACM cert
# ---------------------------------------------------------------------------

locals {
  cf_enabled    = var.enable_cloudfront
  cf_has_domain = var.enable_cloudfront && var.web_domain != ""
}

resource "aws_wafv2_web_acl" "main" {
  count    = local.cf_enabled ? 1 : 0
  provider = aws.us_east_1
  name     = "${local.name}-waf"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimit"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-waf"
    sampled_requests_enabled   = true
  }

  tags = local.tags
}

resource "aws_cloudfront_response_headers_policy" "secure" {
  count = local.cf_enabled ? 1 : 0
  name  = "${local.name}-secure-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

resource "aws_cloudfront_distribution" "web" {
  count      = local.cf_enabled ? 1 : 0
  enabled    = true
  comment    = "${local.name} web"
  aliases    = local.cf_has_domain ? [var.web_domain] : []
  web_acl_id = aws_wafv2_web_acl.main[0].arn

  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "alb"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.secure[0].id

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host", "Origin"]
      cookies { forward = "all" }
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.cf_has_domain ? [1] : []
    content {
      acm_certificate_arn      = var.cloudfront_certificate_arn
      minimum_protocol_version = "TLSv1.2_2021"
      ssl_support_method       = "sni-only"
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.cf_has_domain ? [] : [1]
    content {
      cloudfront_default_certificate = true
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  price_class = "PriceClass_100"
  tags        = local.tags
}

# us-east-1 provider alias for CloudFront/WAF (required scope).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

