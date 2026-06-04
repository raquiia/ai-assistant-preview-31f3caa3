variable "use_default_vpc" {
  description = "Use the account default VPC instead of creating a dedicated VPC. Useful when the account VPC quota is already reached."
  type        = bool
  default     = true
}
