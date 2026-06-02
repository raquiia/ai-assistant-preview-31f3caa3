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
