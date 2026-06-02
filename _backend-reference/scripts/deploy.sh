#!/usr/bin/env bash
# MIGSO-PCUBED AI Assistant — one-shot AWS deployment.
#
# Workflow:
#   1. terraform apply (pass 1) — creates VPC, ECR, RDS, AOSS, IAM. ECS tasks
#      reference :latest images that don't exist yet → services stay at 0
#      tasks until pass 2.
#   2. docker build + push for api / web / worker to ECR.
#   3. terraform apply (pass 2) with image tags → ECS rolls out.
#   4. prisma migrate deploy via ECS run-task (one-shot container).
#
# Re-run anytime — idempotent. New code → builds new tag → second apply rolls.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="$ROOT/infra/aws"

# --- prereqs ---
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1"; exit 1; }; }
need aws; need terraform; need docker; need jq

: "${AWS_REGION:=eu-west-3}"
: "${AWS_PROFILE:=default}"
export AWS_REGION AWS_PROFILE

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "→ Using AWS account ${ACCOUNT_ID} in ${AWS_REGION} (profile=${AWS_PROFILE})"

if [[ ! -f "$INFRA_DIR/terraform.tfvars" ]]; then
  echo "→ Copying terraform.tfvars.example → terraform.tfvars (edit before re-running)"
  cp "$INFRA_DIR/terraform.tfvars.example" "$INFRA_DIR/terraform.tfvars"
  echo "✋  Stopped: edit $INFRA_DIR/terraform.tfvars then re-run ./scripts/deploy.sh"
  exit 0
fi

# --- pass 1: infra ---
echo "→ terraform init"
terraform -chdir="$INFRA_DIR" init -upgrade

echo "→ terraform apply (pass 1 — infra only, image tags default to :latest)"
terraform -chdir="$INFRA_DIR" apply -auto-approve

ECR_API=$(terraform -chdir="$INFRA_DIR" output -json ecr_repository_urls | jq -r '.api')
ECR_WEB=$(terraform -chdir="$INFRA_DIR" output -json ecr_repository_urls | jq -r '.web')
ECR_WORKER=$(terraform -chdir="$INFRA_DIR" output -json ecr_repository_urls | jq -r '.worker')
CLUSTER=$(terraform -chdir="$INFRA_DIR" output -raw ecs_cluster_name)
DB_SECRET=$(terraform -chdir="$INFRA_DIR" output -raw database_url_secret_arn)
ALB_URL=$(terraform -chdir="$INFRA_DIR" output -raw alb_url)

# --- docker build + push ---
TAG=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
echo "→ Logging into ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

build_push() {
  local repo=$1 dockerfile=$2 service=$3
  echo "→ Building ${service} (${TAG})"
  docker buildx build \
    --platform linux/amd64 \
    --file "$ROOT/$dockerfile" \
    --tag "${repo}:${TAG}" \
    --tag "${repo}:latest" \
    --push \
    "$ROOT"
}

build_push "$ECR_API"    "apps/api/Dockerfile"    "api"
build_push "$ECR_WEB"    "apps/web/Dockerfile"    "web"
build_push "$ECR_WORKER" "apps/worker/Dockerfile" "worker"

# --- pass 2: redeploy with real image tags ---
echo "→ terraform apply (pass 2 — image tags = ${TAG})"
terraform -chdir="$INFRA_DIR" apply -auto-approve \
  -var "api_image_tag=${TAG}" \
  -var "web_image_tag=${TAG}" \
  -var "worker_image_tag=${TAG}"

# Force a new deployment so ECS pulls the just-pushed tag even if the task
# definition revision didn't otherwise change.
for svc in api web worker; do
  aws ecs update-service \
    --cluster "$CLUSTER" --service "$svc" \
    --force-new-deployment --region "$AWS_REGION" >/dev/null
done

# --- prisma migrate deploy (one-shot) ---
echo "→ Running prisma migrate deploy via ECS run-task"
SUBNETS=$(aws ec2 describe-subnets --region "$AWS_REGION" \
  --filters "Name=tag:Tier,Values=private" \
  --query 'Subnets[*].SubnetId' --output text | tr '\t' ',')
SG=$(aws ec2 describe-security-groups --region "$AWS_REGION" \
  --filters "Name=group-name,Values=*ecs-api" \
  --query 'SecurityGroups[0].GroupId' --output text)

TASK_DEF_ARN=$(aws ecs register-task-definition --region "$AWS_REGION" \
  --family migrate \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 512 --memory 1024 \
  --execution-role-arn "$(aws iam get-role --role-name "$(terraform -chdir="$INFRA_DIR" output -raw ecs_cluster_name)-ecs-execution" --query 'Role.Arn' --output text 2>/dev/null || echo "")" \
  --container-definitions "$(jq -n --arg img "${ECR_API}:${TAG}" --arg sec "$DB_SECRET" '[{name:"migrate",image:$img,essential:true,command:["npx","prisma","migrate","deploy","--schema","prisma/schema.prisma"],secrets:[{name:"DATABASE_URL",valueFrom:$sec}],logConfiguration:{logDriver:"awslogs",options:{"awslogs-group":"/ecs/migrate","awslogs-region":env.AWS_REGION,"awslogs-stream-prefix":"migrate","awslogs-create-group":"true"}}}]')" \
  --query 'taskDefinition.taskDefinitionArn' --output text 2>/dev/null) || echo "(migrate task registration skipped — review IAM role name if this fails)"

if [[ -n "${TASK_DEF_ARN:-}" && "$TASK_DEF_ARN" != "None" ]]; then
  aws ecs run-task --region "$AWS_REGION" \
    --cluster "$CLUSTER" \
    --launch-type FARGATE \
    --task-definition "$TASK_DEF_ARN" \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" >/dev/null
  echo "→ Migrate task launched. Check CloudWatch log group /ecs/migrate."
else
  echo "⚠️  Skipped migrate run-task. You can run it manually:"
  echo "   aws ecs run-task --cluster $CLUSTER --task-definition migrate ..."
fi

echo ""
echo "✅ Deployment complete"
echo "   API + Web:  $ALB_URL"
echo "   Image tag:  $TAG"
echo "   Cluster:    $CLUSTER"
echo ""
echo "Next:"
echo "  1. Create your first admin: aws cognito-idp admin-create-user --user-pool-id <id> ..."
echo "     (see DEPLOYMENT.md § 'Bootstrap an admin user')"
echo "  2. Set VITE_API_URL=$ALB_URL in your Lovable frontend env."
