import type {
  AiResponse,
  AiUsage,
  Conversation,
  DocumentRecord,
  FeedbackRating,
  Message,
  SourceCitation,
  User,
} from "./shared";

export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  responses: AiResponse[];
}

export interface ChatAnswerPayload {
  response: AiResponse;
  usage: AiUsage;
  answer: string;
  sources: SourceCitation[];
  escalationMessage?: string;
  appliedFilters?: { industryTags: string[]; pmDomainTags: string[] };
}

export interface HistoryRow {
  responseId: string;
  conversationId: string;
  userName: string;
  managerId: string;
  question: string;
  answer: string;
  language: string;
  model: string;
  provider: string;
  confidence: number;
  fallbackUsed: boolean;
  escalationTriggered: boolean;
  latencyMs: number;
  createdAt: string;
}

export interface DashboardPayload {
  kpis: {
    questions: number;
    activeUsers: number;
    fallbackRate: number;
    escalationRate: number;
    latencyP50: number;
    latencyP95: number;
    estimatedCost: number;
    satisfactionRate: number;
    feedbackCount: number;
    averageStars: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
  };
  metrics: Array<{ metricName: string; value: number; dimensionsJson: Record<string, unknown> }>;
}

export interface KnowledgePayload {
  documents: DocumentRecord[];
}

export type ViewKey =
  | "chat"
  | "history"
  | "dashboard"
  | "users"
  | "kb"
  | "prompts"
  | "audit"
  | "embed"
  | "approvals";


export interface FeedbackRequest {
  rating: FeedbackRating;
  comment?: string;
}

export { DocumentRecord };
