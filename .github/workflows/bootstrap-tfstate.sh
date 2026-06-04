#!/usr/bin/env bash
# =============================================================================
# Bootstrap Terraform backend + GitHub OIDC role
# -----------------------------------------------------------------------------
# Run this script ONCE from AWS CloudShell (no install needed).
#
# Usage (in AWS CloudShell):
#   curl -sSL https://raw.githubusercontent.com/raquiia/ai-assistant-preview-31f3caa3/main/.github/workflows/bootstrap-tfstate.sh -o bootstrap.sh
#   chmod +x bootstrap.sh
#   ./bootstrap.sh
#
# Creates:
#   - S3 bucket   : <project>-tfstate-<account-id>     (Terraform state)
#   - DynamoDB    : <project>-tfstate-lock             (state locking)
#   - IAM OIDC    : token.actions.githubusercontent.com (if missing)
#   - IAM Role    : github-actions-<project>-deploy    (assumed by GH Actions)
#
# At the end it prints the AWS_ROLE_TO_ASSUME ARN to copy into GitHub secrets.
# =============================================================================
set -euo pipefail

# --- Config (edit only if you change region / repo) --------------------------
AWS_REGION="eu-west-3"
PROJECT_NAME="migso-pcubed"
GITHUB_OWNER="raquiia"
GITHUB_REPO="ai-assistant-preview-31f3caa3"
ROLE_NAME="github-actions-${PROJECT_NAME}-deploy"
# -----------------------------------------------------------------------------

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET_NAME="${PROJECT_NAME}-tfstate-${ACCOUNT_ID}"
TABLE_NAME="${PROJECT_NAME}-tfstate-lock"
OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "=============================================="
echo "  Account     : ${ACCOUNT_ID}"
echo "  Region      : ${AWS_REGION}"
echo "  S3 bucket   : ${BUCKET_NAME}"
echo "  DynamoDB    : ${TABLE_NAME}"
echo "  IAM role    : ${ROLE_NAME}"
echo "  GitHub repo : ${GITHUB_OWNER}/${GITHUB_REPO}"
echo "=============================================="
echo ""

# --- 1. S3 bucket for Terraform state ----------------------------------------
echo "[1/4] Creating S3 bucket for Terraform state..."
if aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
  echo "      Bucket already exists, skipping."
else
  aws s3api create-bucket \
    --bucket "${BUCKET_NAME}" \
    --region "${AWS_REGION}" \
    --create-bucket-configuration LocationConstraint="${AWS_REGION}"
  aws s3api put-bucket-versioning \
    --bucket "${BUCKET_NAME}" \
    --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption \
    --bucket "${BUCKET_NAME}" \
    --server-side-encryption-configuration '{
      "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]
    }'
  aws s3api put-public-access-block \
    --bucket "${BUCKET_NAME}" \
    --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  echo "      Bucket created and secured."
fi

# --- 2. DynamoDB lock table ---------------------------------------------------
echo "[2/4] Creating DynamoDB lock table..."
if aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "      Table already exists, skipping."
else
  aws dynamodb create-table \
    --table-name "${TABLE_NAME}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${AWS_REGION}" >/dev/null
  echo "      Table created."
fi

# --- 3. GitHub OIDC identity provider ----------------------------------------
echo "[3/4] Ensuring GitHub OIDC provider exists..."
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_PROVIDER_ARN}" >/dev/null 2>&1; then
  echo "      OIDC provider already exists, skipping."
else
  aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" >/dev/null
  echo "      OIDC provider created."
fi

# --- 4. IAM role assumed by GitHub Actions -----------------------------------
echo "[4/4] Creating IAM role for GitHub Actions..."
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "${OIDC_PROVIDER_ARN}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:${GITHUB_OWNER}/${GITHUB_REPO}:*"
      }
    }
  }]
}
EOF
)

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo "      Role exists, updating trust policy..."
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "${TRUST_POLICY}"
else
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    --description "Assumed by GitHub Actions to deploy ${PROJECT_NAME}" >/dev/null
  echo "      Role created."
fi

# Attach AdministratorAccess (to restrict later)
aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess" 2>/dev/null || true

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo ""
echo "=============================================="
echo "  ✅  Bootstrap done."
echo "=============================================="
echo ""
echo "  Copy this value into GitHub secrets:"
echo ""
echo "    Name  : AWS_ROLE_TO_ASSUME"
echo "    Value : ${ROLE_ARN}"
echo ""
echo "  GitHub URL:"
echo "    https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/settings/secrets/actions/new"
echo ""
echo "  Terraform backend config (already match infra/aws/main.tf):"
echo "    bucket         = \"${BUCKET_NAME}\""
echo "    key            = \"${PROJECT_NAME}/terraform.tfstate\""
echo "    region         = \"${AWS_REGION}\""
echo "    dynamodb_table = \"${TABLE_NAME}\""
echo "    encrypt        = true"
echo "=============================================="
