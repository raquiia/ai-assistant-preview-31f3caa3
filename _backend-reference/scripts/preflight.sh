#!/usr/bin/env bash
# Préflight check — vérifie que tout est prêt AVANT de lancer deploy.sh.
# À exécuter depuis _backend-reference/ : ./scripts/preflight.sh

set -u
GREEN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅${NC} $1"; }
ko()   { echo -e "${RED}❌${NC} $1"; FAIL=1; }
warn() { echo -e "${YEL}⚠️ ${NC} $1"; }

FAIL=0
echo "=== Préflight AWS deployment ==="
echo

# 1. Outils
for tool in aws terraform docker jq git; do
  if command -v "$tool" >/dev/null 2>&1; then
    ok "$tool installé ($(${tool} --version 2>&1 | head -1))"
  else
    ko "$tool manquant — voir QUICKSTART_AWS.md § Installer les outils"
  fi
done

# 2. Docker actif
if docker info >/dev/null 2>&1; then
  ok "Docker daemon démarré"
else
  ko "Docker daemon arrêté — ouvre Docker Desktop"
fi

# 3. AWS credentials
if aws sts get-caller-identity >/dev/null 2>&1; then
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  USER=$(aws sts get-caller-identity --query Arn --output text)
  ok "AWS connecté — compte $ACCOUNT ($USER)"
else
  ko "AWS non configuré — lance: aws configure --profile mp-deployer"
fi

# 4. Région
REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || echo '')}"
if [[ -n "$REGION" ]]; then
  ok "Région: $REGION"
else
  warn "AWS_REGION non défini — export AWS_REGION=eu-west-3"
fi

# 5. Droits admin (test indicatif)
if aws iam list-roles --max-items 1 >/dev/null 2>&1; then
  ok "Droits IAM OK"
else
  ko "Pas de droits IAM — il faut un user avec AdministratorAccess"
fi

# 6. terraform.tfvars
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/infra/aws/terraform.tfvars" ]]; then
  ok "terraform.tfvars présent"
  if grep -q 'alarm_email\s*=\s*""' "$ROOT/infra/aws/terraform.tfvars"; then
    warn "alarm_email vide dans terraform.tfvars (alertes coûts désactivées)"
  fi
else
  warn "terraform.tfvars absent — sera créé depuis l'exemple au 1er deploy"
fi

# 7. Quota service (ENI / vCPU Fargate) — info seulement
echo
echo "=== Quotas à vérifier dans la console AWS (Service Quotas) si tu as un compte tout neuf ==="
echo "  • VPC: Elastic IPs ≥ 5"
echo "  • Fargate: vCPU on-demand ≥ 6"
echo "  • RDS: db instances ≥ 1"

echo
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}=== Tout est OK — tu peux lancer ./scripts/deploy.sh ===${NC}"
  exit 0
else
  echo -e "${RED}=== Corrige les ❌ avant de lancer le deploy ===${NC}"
  exit 1
fi
