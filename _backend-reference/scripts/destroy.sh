#!/usr/bin/env bash
# Tear down everything. Use with care — RDS deletion protection is disabled
# beforehand. ECR images are deleted to allow repo destroy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="$ROOT/infra/aws"

: "${AWS_REGION:=eu-west-3}"
export AWS_REGION

read -p "This will DELETE all AWS resources for this stack. Type 'destroy' to confirm: " confirm
[[ "$confirm" == "destroy" ]] || { echo "Aborted."; exit 1; }

# Empty ECR repos
for repo in $(terraform -chdir="$INFRA_DIR" output -json ecr_repository_urls 2>/dev/null | jq -r '.[]'); do
  name="${repo#*/}"
  echo "→ Emptying ECR $name"
  aws ecr batch-delete-image --repository-name "$name" --region "$AWS_REGION" \
    --image-ids "$(aws ecr list-images --repository-name "$name" --region "$AWS_REGION" --query 'imageIds[*]' --output json)" \
    >/dev/null 2>&1 || true
done

# Disable RDS deletion protection then destroy
terraform -chdir="$INFRA_DIR" apply -auto-approve -var "rds_deletion_protection=false"
terraform -chdir="$INFRA_DIR" destroy -auto-approve -var "rds_deletion_protection=false"

echo "✅ Stack destroyed."
