variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-3"
}

variable "project_name" {
  description = "Short project identifier"
  type        = string
  default     = "migso-pcubed"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

# ---- Network ----
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# ---- Web / CORS / OAuth ----
variable "web_allowed_origins" {
  description = "Frontend origins allowed for CORS + S3 presigned uploads"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "web_callback_urls" {
  description = "Cognito hosted UI callback URLs"
  type        = list(string)
  default     = ["http://localhost:5173/callback"]
}

variable "web_logout_urls" {
  description = "Cognito hosted UI logout URLs"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "web_domain" {
  description = "Public domain for the web app (empty = use ALB DNS, skip CloudFront/WAF)"
  type        = string
  default     = ""
}

variable "cloudfront_certificate_arn" {
  description = "ACM cert ARN in us-east-1 for CloudFront (required if web_domain is set)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM cert ARN in the project region for the ALB (empty = HTTP only)"
  type        = string
  default     = ""
}

# ---- RDS ----
variable "rds_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "rds_multi_az" {
  type    = bool
  default = true
}

variable "rds_deletion_protection" {
  type    = bool
  default = true
}

# ---- ECS image tags (overridden by deploy.sh) ----
variable "api_image_tag" {
  type    = string
  default = "latest"
}

variable "web_image_tag" {
  type    = string
  default = "latest"
}

variable "worker_image_tag" {
  type    = string
  default = "latest"
}

# ---- ECS sizing ----
variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "api_max_capacity" {
  type    = number
  default = 6
}

variable "worker_cpu" {
  type    = number
  default = 512
}

variable "worker_memory" {
  type    = number
  default = 1024
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

# ---- Observability ----
variable "alarm_email" {
  description = "Email to subscribe to SNS alarms topic (empty = no subscription)"
  type        = string
  default     = ""
}
