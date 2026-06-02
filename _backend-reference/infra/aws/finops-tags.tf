# Wave 6.I — FinOps tagging par défaut sur TOUTES les ressources AWS.
#
# Activé via `provider "aws" { default_tags { tags = local.common_tags } }`.
# Cost Allocation Tags à activer dans la console Billing après le 1er deploy
# (delay 24 h avant apparition dans Cost Explorer).

locals {
  common_tags = {
    Project       = "mp-ai-assistant"
    Environment   = var.environment        # dev | prod
    Owner         = "data-platform-team"
    CostCenter    = "CC-AI-INTERNAL-2026"
    ManagedBy     = "terraform"
    Repository    = "migso-pcubed/mp-ai-assistant"
    DataClass     = "internal-confidential" # ne PAS mettre PII (audit RGPD)
    Compliance    = "internal-only"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = local.common_tags
  }
}

# Outputs utiles pour reporting FinOps (export hebdo CSV → S3 → QuickSight)
output "cost_allocation_tags" {
  value       = keys(local.common_tags)
  description = "Tags à activer dans Billing → Cost Allocation Tags (User-defined)"
}
