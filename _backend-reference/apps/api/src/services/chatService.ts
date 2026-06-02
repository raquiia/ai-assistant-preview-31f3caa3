import { MistralProvider, MockSearchProvider, ModelRouter, NoopSearchProvider, OpenAIHostedWebSearchProvider, OpenAIProvider, SerpApiSearchProvider, TavilySearchProvider, type SearchProvider } from "@mp/ai";
import { chunkDocument } from "@mp/rag";
import {
  canViewConversation,
  canWriteConversation,
  detectLanguage,
  estimateTokens,
  humanEscalationMessage,
  isAllowedUploadMimeType,
  type ChatAnswer,
  type Conversation,
  type DocumentRecord,
  type FeedbackRating,
  type Message,
  type SourceCitation,
  type User
} from "@mp/shared";
import { env } from "@mp/config";
import type { AppRepository } from "../state.js";

export class ChatService {
  private readonly router = new ModelRouter();

  constructor(private readonly repo: AppRepository) {}

  createConversation(actor: User, title?: string, language?: string, channel: "WEB" | "EMBED" | "API" = "WEB"): Conversation {
    if (actor.role !== "CONSULTANT") throw new Error("Only consultants can create conversations");
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: `conv-${crypto.randomUUID()}`,
      userId: actor.id,
      managerId: actor.managerId ?? null,
      title: title?.trim() || "Nouvelle conversation",
      language: language ?? actor.language,
      channel,
      createdAt: now,
      updatedAt: now
    };
    this.repo.state.conversations.unshift(conversation);
    this.repo.audit({
      actorId: actor.id,
      action: "CONVERSATION_CREATED",
      entityType: "Conversation",
      entityId: conversation.id,
      metadataJson: { channel },
      ip: null,
      userAgent: null
    });
    return conversation;
  }

  async answer(actor: User, conversationId: string, content: string, forceFallback = false): Promise<ChatAnswer> {
    const conversation = this.repo.state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (!canWriteConversation(actor, conversation) && !forceFallback) throw new Error("Access denied");
    if (!canViewConversation(actor, conversation)) throw new Error("Access denied");

    const language = detectLanguage(content, actor.language);
    const message: Message = {
      id: `msg-${crypto.randomUUID()}`,
      conversationId,
      role: "user",
      content,
      language,
      createdAt: new Date().toISOString()
    };
    this.repo.state.messages.push(message);

    const prompt = this.repo.activePrompt();
    let sources = await this.repo.retriever.retrieve(content, {
      topK: this.repo.state.settings.topK,
      minScore: this.repo.state.settings.minRelevanceScore
    });

    if (sources.length === 0) {
      const provider = this.searchProvider();
      sources = await provider.search(content, language);
    }

    const adminGuidance = this.repo.state.corrections.filter((correction) => correction.status === "ACTIVE").map((correction) => correction.content);
    const routed = await this.router.answer({
      user: actor,
      question: content,
      language,
      prompt,
      sources,
      adminGuidance,
      primaryProvider: new MistralProvider(process.env.MISTRAL_API_KEY),
      fallbackProvider: new OpenAIProvider(process.env.OPENAI_API_KEY),
      settings: {
        mistralModel: this.repo.state.settings.mistralModel,
        openAiModel: this.repo.state.settings.openAiModel,
        temperature: this.repo.state.settings.temperature,
        maxTokens: this.repo.state.settings.maxTokens,
        qualityThreshold: this.repo.state.settings.qualityThreshold
      },
      forceFallback
    });

    routed.response.messageId = message.id;
    routed.usage.responseId = routed.response.id;
    this.repo.state.responses.push(routed.response);
    this.repo.state.usages.push(routed.usage);
    this.repo.state.messages.push({
      id: `msg-${crypto.randomUUID()}`,
      conversationId,
      role: "assistant",
      content: routed.content,
      language,
      createdAt: new Date().toISOString()
    });

    const retrievalEvents = sources.map((source, index) => ({
      id: `ret-${crypto.randomUUID()}`,
      responseId: routed.response.id,
      chunkId: source.chunkId,
      score: source.score,
      rank: index + 1,
      usedInAnswer: !routed.response.escalationTriggered
    }));
    this.repo.state.retrievalEvents.push(...retrievalEvents);
    conversation.updatedAt = new Date().toISOString();
    if (conversation.title === "Nouvelle conversation") conversation.title = content.slice(0, 64);

    this.repo.audit({
      actorId: actor.id,
      action: routed.response.escalationTriggered ? "CHAT_ESCALATED" : "CHAT_ANSWERED",
      entityType: "AiResponse",
      entityId: routed.response.id,
      metadataJson: {
        provider: routed.response.provider,
        model: routed.response.model,
        confidence: routed.response.confidence,
        qualityReasons: routed.qualityReasons
      },
      ip: null,
      userAgent: null
    });

    return {
      response: routed.response,
      usage: routed.usage,
      answer: routed.content,
      sources,
      retrievalEvents,
      escalationMessage: routed.response.escalationTriggered ? humanEscalationMessage(language) : undefined
    };
  }

  async retryFallback(actor: User, responseId: string): Promise<ChatAnswer> {
    const response = this.repo.state.responses.find((item) => item.id === responseId);
    if (!response) throw new Error("Response not found");
    const message = this.repo.state.messages.find((item) => item.id === response.messageId);
    if (!message) throw new Error("Original message not found");
    return this.answer(actor, message.conversationId, message.content, true);
  }

  addFeedback(actor: User, responseId: string, rating: FeedbackRating, comment?: string | null) {
    const response = this.repo.state.responses.find((item) => item.id === responseId);
    if (!response) throw new Error("Response not found");
    const message = this.repo.state.messages.find((item) => item.id === response.messageId);
    const conversation = message ? this.repo.state.conversations.find((item) => item.id === message.conversationId) : null;
    if (!conversation || !canViewConversation(actor, conversation)) throw new Error("Access denied");
    const feedback = {
      id: `fb-${crypto.randomUUID()}`,
      responseId,
      userId: actor.id,
      rating,
      comment,
      createdAt: new Date().toISOString()
    };
    this.repo.state.feedback.push(feedback);
    this.repo.audit({
      actorId: actor.id,
      action: "FEEDBACK_CREATED",
      entityType: "Feedback",
      entityId: feedback.id,
      metadataJson: { responseId, rating, retryAvailable: isNegativeRating(rating) },
      ip: null,
      userAgent: null
    });
    return { feedback, retryAvailable: isNegativeRating(rating) };
  }

  async ingestKnowledge(actor: User, input: { title: string; text: string; mimeType: string; objectKey?: string }): Promise<{ document: DocumentRecord; chunks: SourceCitation[] }> {
    if (!isAllowedUploadMimeType(input.mimeType)) throw new Error("Unsupported file type");
    const now = new Date().toISOString();
    const document: DocumentRecord = {
      id: `doc-${crypto.randomUUID()}`,
      title: input.title,
      ownerId: actor.id,
      objectKey: input.objectKey ?? `local/${crypto.randomUUID()}-${input.title}`,
      mimeType: input.mimeType,
      status: actor.role === "SUPER_ADMIN" && input.mimeType !== "application/pdf" ? "PUBLISHED" : "NEEDS_REVIEW",
      version: 1,
      checksum: `local-${estimateTokens(input.text)}-${input.text.length}`,
      language: detectLanguage(input.text, actor.language),
      createdAt: now
    };
    const text = input.text.trim() || `Extraction ${input.mimeType} a finaliser. Document ${input.title} cree pour validation manuelle avant publication.`;
    const chunks = chunkDocument({ documentId: document.id, title: document.title, version: document.version, text, language: document.language });
    this.repo.state.documents.unshift(document);
    this.repo.state.chunks.push(...chunks);
    await this.repo.retriever.indexAll();
    this.repo.audit({
      actorId: actor.id,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: document.id,
      metadataJson: { title: document.title, mimeType: document.mimeType, chunks: chunks.length },
      ip: null,
      userAgent: null
    });
    return {
      document,
      chunks: chunks.map((chunk) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        title: chunk.title,
        page: chunk.page,
        section: chunk.section,
        paragraph: chunk.paragraph,
        timeStart: chunk.timeStart,
        timeEnd: chunk.timeEnd,
        excerpt: chunk.text,
        score: 100,
        sourceUri: chunk.sourceUri
      }))
    };
  }

  private searchProvider(): SearchProvider {
    const configured = this.repo.state.settings.searchProvider || env.searchProvider;
    if (configured === "mock") return new MockSearchProvider();
    if (configured === "tavily") return new TavilySearchProvider(process.env.TAVILY_API_KEY);
    if (configured === "serpapi") return new SerpApiSearchProvider(process.env.SERPAPI_API_KEY);
    if (configured === "openai_hosted") return new OpenAIHostedWebSearchProvider(process.env.OPENAI_API_KEY, this.repo.state.settings.openAiModel);
    return new NoopSearchProvider();
  }
}

function isNegativeRating(rating: FeedbackRating): boolean {
  return rating === "DOWN" || rating === "ONE" || rating === "TWO";
}
