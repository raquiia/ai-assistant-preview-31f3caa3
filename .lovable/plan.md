# Plan — Extraction documentaire Textract (auto NEEDS_REVIEW → PUBLISHED)

## Objectif
Quand un PDF scanné ou une image est uploadé dans la KB, déclencher Textract, attendre la fin via callback SNS→SQS, ré-injecter le texte dans `runIngestion`, et mettre à jour le `Document` en `PUBLISHED` (ou `NEEDS_REVIEW` si extraction vide / score OCR faible) — sans intervention manuelle.

## État actuel
- `ingestionPipeline.ts` sait déjà router PDF/image → `TextractProvider.startJob()` et retourne `status: PROCESSING` + `externalJobId`. ✅
- `TextractProvider` (start/fetch) existe. ✅
- `ingestion-callback.ts` existe mais dépend de deux hooks non implémentés : `loadJob(externalJobId)` et `persist(job, text)`. ❌
- Le `worker.ts` actuel n'utilise que la queue in-memory : le consumer SQS de callback n'est **jamais démarré**. ❌
- Le schéma Prisma `Document` n'a **ni `externalJobId` ni statut `PROCESSING`** ; le pipeline retourne `NEEDS_REVIEW` à la place. ❌
- L'infra Terraform Textract (topic SNS, queue SQS callback, rôle IAM) n'est pas câblée dans `_backend-reference/infra/aws/`. ❌
- L'UI `KnowledgeBaseAdmin` ne sait pas afficher l'état `PROCESSING` en cours.

## Découpage

### 1. Schéma & repo (Prisma)
- Ajouter à `Document` : `externalJobId String? @unique`, `extractionEngine String?` (`textract|transcribe|native`), `extractionConfidence Float?`.
- Ajouter `PROCESSING` à l'enum `DocumentStatus`.
- Migration SQL + régénération du client.
- Étendre `prisma-repo.ts` : `findByExternalJobId()`, `updateStatus(documentId, { status, text, confidence })`, `markProcessing(documentId, externalJobId, engine)`.

### 2. Pipeline d'ingestion
- `runIngestion` : quand `extractSync` renvoie `async`, persister `status=PROCESSING` + `externalJobId` (au lieu de juste retourner l'objet en mémoire).
- Implémenter `finalizeAsyncJob` complet : charger Document par `externalJobId`, ré-exécuter chunk+embed+index, calculer le statut final :
  - texte vide ou confiance < seuil (env `TEXTRACT_MIN_CONFIDENCE`, défaut 0.7) → `NEEDS_REVIEW`,
  - sinon → `PUBLISHED`.
- Étendre `TextractProvider.fetchResult` pour renvoyer aussi la confiance moyenne des blocs LINE.

### 3. Callback worker
- Implémenter `loadJob` (via `findByExternalJobId`) et `persist` (via repo + `markStatus`) dans `ingestion-callback.ts`.
- Démarrer **deux** consumers dans `worker.ts` quand `AWS_REGION` est défini :
  - queue d'ingestion principale (existante),
  - queue callback Textract/Transcribe → `startIngestionCallbackConsumer`.
- Gérer les `Status: FAILED` / `PARTIAL_SUCCESS` Textract : marquer `NEEDS_REVIEW` avec `warnings`.

### 4. Infra AWS (Terraform)
Nouveau fichier `infra/aws/textract.tf` :
- SNS topic `mp-textract-callback`,
- SQS queue `mp-ingestion-callback` + DLQ + subscription SNS,
- IAM role `TextractServiceRole` (assumé par `textract.amazonaws.com`, policy `sns:Publish` sur le topic),
- Policy ECS task : `textract:StartDocumentTextDetection`, `textract:GetDocumentTextDetection`, `sqs:ReceiveMessage/DeleteMessage/ChangeMessageVisibility` sur la callback queue.
- Variables `.env` : `TEXTRACT_SNS_TOPIC_ARN`, `TEXTRACT_ROLE_ARN`, `SQS_INGESTION_CALLBACK_URL`, `TEXTRACT_MIN_CONFIDENCE`.

### 5. API & UI
- `KnowledgeBaseAdmin` : afficher badge `Processing OCR…` pour `PROCESSING`, polling 10 s via endpoint existant `/admin/kb/documents` jusqu'à `PUBLISHED`/`NEEDS_REVIEW`.
- Tooltip avec `extractionEngine` + confiance quand disponible.

### 6. Tests & validation
- Test unitaire `ingestionPipeline.test.ts` : mock TextractProvider `async` → vérifie `PROCESSING` + `externalJobId` persistés.
- Test `finalizeAsyncJob` : texte > seuil → `PUBLISHED`, vide → `NEEDS_REVIEW`.
- Test `ingestion-callback` : message SNS Textract `SUCCEEDED` → repo.updateStatus appelé avec `PUBLISHED`.
- Script `ingestSample.ts` étendu avec un PDF scanné de test (LocalStack `textract` mock optionnel).

### 7. Documentation
- Mise à jour `DEPLOYMENT.md` : variables d'env, ordre `terraform apply`, comment vérifier dans CloudWatch.
- Section troubleshooting (callback non reçu, IAM, DLQ).

## Estimation
~1,5 j dev + 0,5 j infra/test = **2 jours**.

## Hors scope (volontaire)
- Tables/forms Textract (uniquement `DetectText` plain). À ouvrir comme item séparé si besoin (factures, bons de commande).
- Transcribe : déjà câblé dans le même callback, mais validation end-to-end audio sera traitée dans son propre chantier.
- Migration vers Step Functions (`stepfunctions/ingestion.asl.json` existe) : reportée — ce plan garde le chemin SQS direct, plus simple à livrer maintenant.
