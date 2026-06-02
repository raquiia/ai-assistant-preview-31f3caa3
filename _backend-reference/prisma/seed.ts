import { PrismaClient } from "@prisma/client";
import { createDemoState } from "@mp/shared";

const prisma = new PrismaClient();
const state = createDemoState();

async function main() {
  await prisma.retrievalEvent.deleteMany();
  await prisma.aiUsage.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.adminComment.deleteMany();
  await prisma.knowledgeCorrection.deleteMany();
  await prisma.aiResponse.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.documentChunk.deleteMany();
  await prisma.document.deleteMany();
  await prisma.managerProfile.deleteMany();
  await prisma.promptVersion.deleteMany();
  await prisma.aiProviderConfig.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.user.deleteMany();

  for (const user of state.users) {
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        managerId: user.managerId,
        language: user.language,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  }
  for (const profile of state.managerProfiles) {
    await prisma.managerProfile.create({ data: profile });
  }
  for (const prompt of state.prompts) {
    await prisma.promptVersion.create({ data: prompt });
  }
  for (const provider of state.providerConfigs) {
    await prisma.aiProviderConfig.create({
      data: {
        id: provider.id,
        provider: provider.provider,
        encryptedApiKeyRef: provider.encryptedApiKeyRef,
        model: provider.model,
        configJson: provider.configJson,
        active: provider.active,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt
      }
    });
  }
  for (const document of state.documents) {
    await prisma.document.create({ data: document });
  }
  for (const chunk of state.chunks) {
    await prisma.documentChunk.create({
      data: {
        id: chunk.id,
        documentId: chunk.documentId,
        version: chunk.version,
        text: chunk.text,
        language: chunk.language,
        page: chunk.page,
        section: chunk.section,
        paragraph: chunk.paragraph,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        timeStart: chunk.timeStart,
        timeEnd: chunk.timeEnd,
        industryTags: chunk.industryTags,
        pmDomainTags: chunk.pmDomainTags,
        vectorId: chunk.vectorId,
        sourceUri: chunk.sourceUri,
        createdAt: chunk.createdAt
      }
    });
  }
  for (const conversation of state.conversations) {
    await prisma.conversation.create({ data: conversation });
  }
  for (const message of state.messages) {
    await prisma.message.create({ data: message });
  }
  for (const response of state.responses) {
    await prisma.aiResponse.create({ data: response });
  }
  for (const usage of state.usages) {
    await prisma.aiUsage.create({ data: usage });
  }
  for (const event of state.retrievalEvents) {
    await prisma.retrievalEvent.create({ data: event });
  }
  for (const audit of state.auditEvents) {
    await prisma.auditEvent.create({ data: audit });
  }
  for (const metric of state.metrics) {
    await prisma.systemMetricDaily.create({ data: { ...metric, date: new Date(metric.date) } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
