variable "project_name" {
  type    = string
  default = "mp-ai-assistant"
}

variable "aws_region" {
  type    = string
  default = "eu-west-3"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "container_image_api" {
  type    = string
  default = "replace-me-api"
}

variable "container_image_web" {
  type    = string
  default = "replace-me-web"
}

variable "container_image_worker" {
  type    = string
  default = "replace-me-worker"
}

variable "web_allowed_origins" {
  description = "Origins allowed to PUT presigned KB uploads to the S3 knowledge bucket."
  type        = list(string)
  default     = ["https://localhost:5173"]
}

variable "web_callback_urls" {
  description = "Cognito Hosted UI callback URLs for apps/web."
  type        = list(string)
  default     = ["https://localhost:5173/auth/callback"]
}

variable "web_logout_urls" {
  description = "Cognito Hosted UI logout URLs for apps/web."
  type        = list(string)
  default     = ["https://localhost:5173/auth/logout"]
}
