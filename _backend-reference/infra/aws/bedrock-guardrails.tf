###############################################################################
# Wave 4 — Bedrock Guardrails
#
# Creates a single managed guardrail applied to every InvokeModel call via the
# `BEDROCK_GUARDRAIL_ID` env var (read by bedrock-guardrails.ts).
###############################################################################

resource "aws_bedrock_guardrail" "main" {
  name                      = "mp-guardrail"
  description               = "MP default safety + PII guardrail (FR/EN)"
  blocked_input_messaging   = "Désolé, votre requête contient du contenu non autorisé."
  blocked_outputs_messaging = "Désolé, la réponse a été filtrée par la politique de sécurité."

  content_policy_config {
    filters_config {
      input_strength  = "HIGH"
      output_strength = "HIGH"
      type            = "SEXUAL"
    }
    filters_config {
      input_strength  = "HIGH"
      output_strength = "HIGH"
      type            = "VIOLENCE"
    }
    filters_config {
      input_strength  = "HIGH"
      output_strength = "HIGH"
      type            = "HATE"
    }
    filters_config {
      input_strength  = "HIGH"
      output_strength = "HIGH"
      type            = "INSULTS"
    }
    filters_config {
      input_strength  = "HIGH"
      output_strength = "NONE"
      type            = "PROMPT_ATTACK"
    }
  }

  sensitive_information_policy_config {
    dynamic "pii_entities_config" {
      for_each = ["EMAIL", "PHONE", "CREDIT_DEBIT_CARD_NUMBER", "US_SOCIAL_SECURITY_NUMBER", "IP_ADDRESS", "PASSWORD"]
      content {
        type   = pii_entities_config.value
        action = "ANONYMIZE"
      }
    }
  }

  topic_policy_config {
    topics_config {
      name       = "legal-advice"
      definition = "Fournir un avis juridique nominatif présenté comme officiel."
      type       = "DENY"
      examples   = ["Suis-je obligé de signer ce contrat ?"]
    }
    topics_config {
      name       = "medical-advice"
      definition = "Donner un diagnostic médical ou une prescription."
      type       = "DENY"
      examples   = ["Quel médicament prendre pour mon mal de tête ?"]
    }
  }

  tags = var.common_tags
}

output "bedrock_guardrail_id" {
  value = aws_bedrock_guardrail.main.guardrail_id
}
