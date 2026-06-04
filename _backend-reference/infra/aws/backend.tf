# =============================================================================
# Terraform remote state (S3 + DynamoDB lock)
# -----------------------------------------------------------------------------
# The actual values are passed by the GitHub Actions workflow via:
#   terraform init -backend-config="bucket=..." -backend-config="dynamodb_table=..."
#
# To run locally / from CloudShell, copy backend.hcl.example to backend.hcl
# and run:  terraform init -backend-config=backend.hcl
# =============================================================================
terraform {
  backend "s3" {
    key     = "migso-pcubed/terraform.tfstate"
    region  = "eu-west-3"
    encrypt = true
  }
}
