// Données fictives + routeur de requêtes pour le mode preview.
// Reproduit le contrat HTTP de l'API Fastify côté apps/api du repo mp-ai-assistant.

import type {
  AiProviderConfig,
  AuditEvent,
  Conversation,
  DocumentRecord,
  Message,
  PromptVersion,
  Role,
  SourceCitation,
  User,
} from "./shared";
import type {
  ChatAnswerPayload,
  ConversationDetail,
  DashboardPayload,
  HistoryRow,
  KnowledgePayload,
  Session,
} from "./types";

const now = () => new Date().toISOString();

const users: User[] = [
  {
    id: "u-super",
    email: "superadmin@migso-pcubed.local",
    name: "Sophie Admin",
    role: "SUPER_ADMIN",
    language: "fr",
    status: "ACTIVE",
    department: "Gouvernance IA",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "u-mgr",
    email: "manager.a@migso-pcubed.local",
    name: "Marc Manager",
    role: "MANAGER",
    language: "fr",
    status: "ACTIVE",
    department: "Aerospace",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "u-consult",
    email: "consultant1@migso-pcubed.local",
    name: "Clara Consultante",
    role: "CONSULTANT",
    managerId: "u-mgr",
    language: "fr",
    status: "ACTIVE",
    department: "Aerospace",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "u-audit",
    email: "auditor@migso-pcubed.local",
    name: "Adrien Auditeur",
    role: "AUDITOR",
    language: "fr",
    status: "ACTIVE",
    department: "Conformité",
    createdAt: now(),
    updatedAt: now(),
  },
];

const conversations: Conversation[] = [
  {
    id: "c-1",
    userId: "u-consult",
    managerId: "u-mgr",
    title: "Cadrage WBS programme A350",
    language: "fr",
    channel: "WEB",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "c-2",
    userId: "u-consult",
    managerId: "u-mgr",
    title: "Modèle RACI gouvernance projet",
    language: "fr",
    channel: "WEB",
    createdAt: now(),
    updatedAt: now(),
  },
];

const messagesByConv: Record<string, Message[]> = {
  "c-1": [
    {
      id: "m-1",
      conversationId: "c-1",
      role: "user",
      content: "Comment construire un WBS pour un programme avionique de 18 mois ?",
      language: "fr",
      createdAt: now(),
    },
    {
      id: "m-2",
      conversationId: "c-1",
      role: "assistant",
      content:
        "Un WBS robuste pour un programme avionique de 18 mois s'articule en 4 niveaux : objectifs programme, livrables systèmes, lots de travaux, tâches. Voici une trame… (réponse mockée pour preview UI).",
      language: "fr",
      createdAt: now(),
    },
  ],
  "c-2": [],
};

let nextId = 100;
function id(prefix: string) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

const ALL_MOCK_SOURCES: SourceCitation[] = [
  {
    chunkId: "ch-1",
    documentId: "d-1",
    title: "Guide WBS MIGSO-PCUBED — Aéronautique",
    page: 12,
    section: "3.2 Découpage",
    excerpt:
      "Un découpage WBS efficace pour l'aéronautique s'appuie sur les jalons certifiants et les lots systèmes…",
    score: 0.91,
    sourceUri: "s3://kb/wbs-guide.pdf",
    industryTags: ["aeronautique", "defense"],
    pmDomainTags: ["planning/scheduling", "scope/requirements"],
  },
  {
    chunkId: "ch-2",
    documentId: "d-2",
    title: "Référentiel PMI – PMBOK 7",
    section: "Principes",
    excerpt:
      "Les principes de découpage hiérarchique restent applicables, en alignement avec les domaines de performance…",
    score: 0.84,
    sourceUri: "s3://kb/pmbok7.pdf",
    industryTags: [],
    pmDomainTags: [],
  },
  {
    chunkId: "ch-3",
    documentId: "d-4",
    title: "Risk Management Pharma — Validation GxP",
    page: 7,
    section: "4. Mitigation",
    excerpt:
      "Les risques projet en pharma sont indissociables des contraintes GxP et de la traçabilité des changes…",
    score: 0.78,
    sourceUri: "s3://kb/risk-pharma.pdf",
    industryTags: ["pharma"],
    pmDomainTags: ["risk management", "change control", "quality"],
  },
  {
    chunkId: "ch-4",
    documentId: "d-5",
    title: "Cost Control Nucléaire — EVM long cycle",
    page: 24,
    section: "EVM",
    excerpt:
      "Sur les programmes nucléaires, l'Earned Value sur des cycles longs nécessite une rebaseline annuelle structurée…",
    score: 0.73,
    sourceUri: "s3://kb/cost-nuke.pdf",
    industryTags: ["nucleaire", "energie"],
    pmDomainTags: ["cost control", "earned value", "reporting/KPI"],
  },
  {
    chunkId: "ch-5",
    documentId: "d-6",
    title: "Outillage Agile IT — Jira & Smartsheet",
    section: "Bonnes pratiques",
    excerpt:
      "Pour un programme IT, l'orchestration Jira ↔ Smartsheet permet de connecter delivery agile et planning portefeuille…",
    score: 0.7,
    sourceUri: "s3://kb/tools-it.md",
    industryTags: ["IT/digital"],
    pmDomainTags: ["agile/delivery", "tools P6/MS Project/Jira/Smartsheet"],
  },
];

function filterSources(filters?: { industryTags?: string[]; pmDomainTags?: string[] }): SourceCitation[] {
  const ind = filters?.industryTags ?? [];
  const dom = filters?.pmDomainTags ?? [];
  return ALL_MOCK_SOURCES.filter((s) => {
    const sInd = s.industryTags ?? [];
    const sDom = s.pmDomainTags ?? [];
    // Documents génériques (sans tag) sont toujours candidats.
    const indOk = ind.length === 0 || sInd.length === 0 || ind.some((t) => sInd.includes(t));
    const domOk = dom.length === 0 || sDom.length === 0 || dom.some((t) => sDom.includes(t));
    return indOk && domOk;
  });
}

function mockSources(filters?: { industryTags?: string[]; pmDomainTags?: string[] }): SourceCitation[] {
  return filterSources(filters);
}

function extractUploadFields(body: unknown): { title: string; industryTags: string[]; pmDomainTags: string[] } {
  if (body instanceof FormData) {
    const title = String(body.get("title") ?? body.get("file") ?? "Document");
    const ind = body.getAll("industryTags").map(String).filter(Boolean);
    const dom = body.getAll("pmDomainTags").map(String).filter(Boolean);
    return { title, industryTags: ind, pmDomainTags: dom };
  }
  const b = (body ?? {}) as { title?: string; industryTags?: string[]; pmDomainTags?: string[] };
  return {
    title: b.title ?? "Document",
    industryTags: Array.isArray(b.industryTags) ? b.industryTags : [],
    pmDomainTags: Array.isArray(b.pmDomainTags) ? b.pmDomainTags : [],
  };
}

const documents: DocumentRecord[] = [
  {
    id: "d-1",
    title: "Guide WBS MIGSO-PCUBED — Aéronautique",
    ownerId: "u-mgr",
    objectKey: "kb/wbs-guide.pdf",
    mimeType: "application/pdf",
    status: "PUBLISHED",
    version: 3,
    checksum: "abc",
    language: "fr",
    createdAt: now(),
    industryTags: ["aeronautique", "defense"],
    pmDomainTags: ["planning/scheduling", "scope/requirements"],
  },
  {
    id: "d-2",
    title: "Référentiel PMI – PMBOK 7",
    ownerId: "u-super",
    objectKey: "kb/pmbok7.pdf",
    mimeType: "application/pdf",
    status: "PUBLISHED",
    version: 1,
    checksum: "def",
    language: "en",
    createdAt: now(),
    industryTags: [],
    pmDomainTags: [],
  },
  {
    id: "d-3",
    title: "Note interne gouvernance — DRAFT",
    ownerId: "u-mgr",
    objectKey: "kb/governance-draft.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    status: "NEEDS_REVIEW",
    version: 1,
    checksum: "ghi",
    language: "fr",
    createdAt: now(),
    industryTags: [],
    pmDomainTags: ["PMO governance"],
  },
  {
    id: "d-4",
    title: "Risk Management Pharma — Validation GxP",
    ownerId: "u-super",
    objectKey: "kb/risk-pharma.pdf",
    mimeType: "application/pdf",
    status: "PUBLISHED",
    version: 2,
    checksum: "jkl",
    language: "fr",
    createdAt: now(),
    industryTags: ["pharma"],
    pmDomainTags: ["risk management", "change control", "quality"],
  },
  {
    id: "d-5",
    title: "Cost Control Nucléaire — EVM long cycle",
    ownerId: "u-super",
    objectKey: "kb/cost-nuke.pdf",
    mimeType: "application/pdf",
    status: "PUBLISHED",
    version: 1,
    checksum: "mno",
    language: "fr",
    createdAt: now(),
    industryTags: ["nucleaire", "energie"],
    pmDomainTags: ["cost control", "earned value", "reporting/KPI"],
  },
  {
    id: "d-6",
    title: "Outillage Agile IT — Jira & Smartsheet",
    ownerId: "u-mgr",
    objectKey: "kb/tools-it.md",
    mimeType: "text/markdown",
    status: "PUBLISHED",
    version: 1,
    checksum: "pqr",
    language: "fr",
    createdAt: now(),
    industryTags: ["IT/digital"],
    pmDomainTags: ["agile/delivery", "tools P6/MS Project/Jira/Smartsheet"],
  },
];

const prompts: PromptVersion[] = [
  {
    id: "p-1",
    name: "system.assistant.consultant",
    content:
      "Tu es l'assistant interne MIGSO-PCUBED. Réponds toujours en t'appuyant sur les sources fournies…",
    configJson: { temperature: 0.2, maxTokens: 800 },
    createdById: "u-super",
    active: true,
    createdAt: now(),
  },
];

const providers: AiProviderConfig[] = [
  {
    id: "ai-1",
    provider: "mistral",
    model: "mistral-large-latest",
    configJson: { region: "eu-west-3" },
    active: true,
    createdAt: now(),
    updatedAt: now(),
    maskedKey: "sk-***-MOCK",
  },
  {
    id: "ai-2",
    provider: "openai",
    model: "gpt-4o-mini",
    configJson: {},
    active: false,
    createdAt: now(),
    updatedAt: now(),
    maskedKey: null,
  },
];

const appSettings: import("./shared").AppSettings = {
  topK: 6,
  minRelevanceScore: 0.65,
  qualityThreshold: 0.7,
  rerankerEnabled: true,
  rerankerModel: "cohere-rerank-3",
  embeddingModel: "text-embedding-3-large",
  contextWindowTokens: 8000,
  maxHistoryTurns: 8,
  webFallbackEnabled: false,
  temperature: 0.2,
  topP: 0.95,
  maxTokens: 800,
  presencePenalty: 0,
  frequencyPenalty: 0,
  seed: null,
  stopSequences: [],
  streaming: true,
  responseFormat: "text",
  timeoutMs: 30000,
  reasoningEffort: "medium",
  verbosity: "balanced",
  defaultModel: "google/gemini-3-flash-preview",
  fallbackModel: "openai/gpt-5-mini",
  fallbackTriggers: ["timeout", "rate_limit", "credit_exhausted"],
  mistralModel: "mistral-large-latest",
  openAiModel: "gpt-4o-mini",
  searchProvider: "mock",
  forbiddenTopics: ["données personnelles clients", "secrets commerciaux non publics"],
  piiRedaction: true,
  piiRedactionLevel: "standard",
  safetyThreshold: "medium",
  refusalTemplate:
    "Je ne peux pas répondre à cette demande. Contactez votre manager pour une assistance humaine.",
  logUserMessagesPlaintext: false,
  dailyTokenBudget: 2_000_000,
  monthlyCostCapEur: 1500,
  requestsPerMinutePerUser: 20,
  budgetAlertThreshold: 80,
  allowedModelsByRole: {
    CONSULTANT: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"],
    MANAGER: ["google/gemini-3-flash-preview", "openai/gpt-5-mini", "google/gemini-2.5-pro"],
    SUPER_ADMIN: ["*"],
    AUDITOR: ["google/gemini-3-flash-preview"],
  },
  allowedEmbedOrigins: ["https://intranet.migso-pcubed.local"],
};


const auditEvents: AuditEvent[] = [
  {
    id: "a-1",
    actorId: "u-super",
    action: "USER_LOGIN",
    entityType: "User",
    entityId: "u-super",
    metadataJson: {},
    createdAt: now(),
  },
  {
    id: "a-2",
    actorId: "u-mgr",
    action: "DOCUMENT_PUBLISH",
    entityType: "Document",
    entityId: "d-1",
    metadataJson: { version: 3 },
    createdAt: now(),
  },
];

// Feedback consultants + commentaires admin persistent entre les appels.
const historyFeedback: Record<
  string,
  Array<{ id: string; userId: string; userName: string; rating: string; comment?: string | null; createdAt: string }>
> = {
  "r-1": [
    {
      id: "fb-1",
      userId: "u-consult",
      userName: "Clara Consultante",
      rating: "UP",
      comment: "Réponse claire et structurée, j'ai pu la réutiliser telle quelle.",
      createdAt: new Date().toISOString(),
    },
  ],
  "r-2": [
    {
      id: "fb-2",
      userId: "u-consult",
      userName: "Clara Consultante",
      rating: "DOWN",
      comment: "Manque d'exemple concret sur un projet réel.",
      createdAt: new Date().toISOString(),
    },
  ],
  "r-3": [
    {
      id: "fb-3",
      userId: "u-consult-2",
      userName: "Lucas Consultant",
      rating: "THREE",
      comment: "Formule correcte mais aurait pu citer la source PMBOK.",
      createdAt: new Date().toISOString(),
    },
  ],
};

const historyAdminComments: Record<
  string,
  Array<{ id: string; adminId: string; adminName: string; comment: string; status: string; createdAt: string }>
> = {};



function sessionFor(email: string): Session | null {
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  return {
    user,
    accessToken: `mock-token-${user.id}`,
  };
}

function buildAnswer(
  question: string,
  filters?: { industryTags?: string[]; pmDomainTags?: string[] },
): ChatAnswerPayload {
  const responseId = id("r");
  const sources = mockSources(filters);
  const orientation =
    filters && ((filters.industryTags?.length ?? 0) + (filters.pmDomainTags?.length ?? 0) > 0)
      ? ` (orientée ${[...(filters.industryTags ?? []), ...(filters.pmDomainTags ?? [])].join(", ")})`
      : "";
  return {
    response: {
      id: responseId,
      messageId: id("m"),
      provider: "mistral",
      model: "mistral-large-latest",
      promptVersionId: "p-1",
      content: `Réponse mockée${orientation} à : "${question.slice(0, 80)}". Brancher VITE_USE_MOCKS=false pour utiliser l'API Fastify.`,
      confidence: 0.78,
      latencyMs: 420,
      fallbackUsed: false,
      escalationTriggered: false,
      createdAt: now(),
    },
    usage: {
      id: id("u"),
      responseId,
      inputTokens: 320,
      outputTokens: 180,
      reasoningTokens: 0,
      cachedTokens: 0,
      estimatedCost: 0.0021,
      currency: "EUR",
    },
    answer: `Réponse mockée${orientation} à : "${question.slice(0, 80)}". Brancher VITE_USE_MOCKS=false pour utiliser l'API Fastify.`,
    sources,
    appliedFilters: {
      industryTags: filters?.industryTags ?? [],
      pmDomainTags: filters?.pmDomainTags ?? [],
    },
  };
}

// path matcher helpers
function match(path: string, pattern: string): Record<string, string> | null {
  const pp = pattern.split("/");
  const ap = path.split("?")[0]!.split("/");
  if (pp.length !== ap.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i += 1) {
    const p = pp[i]!;
    const a = ap[i]!;
    if (p.startsWith(":")) params[p.slice(1)] = a;
    else if (p !== a) return null;
  }
  return params;
}

export function handleMock<T>(
  method: string,
  path: string,
  body: unknown,
  session: Session | null,
): T {
  // Normalise les chemins "modernes" du front vers les chemins du mock historique.
  path = path
    .replace(/^\/superadmin\/users/, "/admin/users")
    .replace(/^\/superadmin\/ai-providers/, "/admin/providers")
    .replace(/^\/superadmin\/prompts/, "/admin/prompts")
    .replace(/^\/superadmin\/audit\/events/, "/admin/audit")
    .replace(/^\/superadmin\/compliance\/system-card/, "/admin/compliance/system-card")
    .replace(/^\/superadmin\/compliance\/export/, "/admin/compliance/export")
    .replace(/^\/superadmin\/corrections/, "/admin/corrections")
    .replace(/^\/admin\/kb\//, "/kb/")
    .replace(/^\/managers\/active$/, "/users/managers")
    .replace(/^\/auth\/first-visit\/manager$/, "/users/me/manager")
    .replace(/^\/embed\/token$/, "/admin/embed");

  // AUTH
  if (method === "POST" && path === "/auth/login") {
    const email = (body as { email?: string })?.email ?? "";
    const sess = sessionFor(email);
    if (!sess) throw new Error("Identifiants inconnus (mode mock)");
    return sess as T;
  }

  if (method === "POST" && path === "/auth/register") {
    const payload = (body ?? {}) as {
      email?: string;
      name?: string;
      password?: string;
      managerId?: string;
      department?: string;
      language?: string;
    };
    const email = (payload.email ?? "").trim().toLowerCase();
    const name = (payload.name ?? "").trim();
    const managerId = payload.managerId ?? null;
    if (!email || !name) throw new Error("Nom et email sont requis");
    if (!payload.password || payload.password.length < 6)
      throw new Error("Mot de passe trop court (6 caractères minimum)");
    if (users.some((u) => u.email.toLowerCase() === email))
      throw new Error("Un compte avec cet email existe déjà");
    if (!managerId || !users.some((u) => u.id === managerId && u.role === "MANAGER"))
      throw new Error("Manager invalide");
    const manager = users.find((u) => u.id === managerId)!;
    const newUser: User = {
      id: id("u"),
      email,
      name,
      role: "CONSULTANT",
      managerId,
      language: payload.language ?? "fr",
      status: "PENDING_MANAGER",
      department: payload.department ?? manager.department ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    users.push(newUser);
    return { user: newUser, accessToken: `mock-token-${newUser.id}` } as T;
  }

  // MANAGER APPROVALS — consultants en attente rattachés au manager courant
  if (method === "GET" && path === "/managers/me/pending-consultants") {
    const me = session?.user;
    if (!me) return { consultants: [] } as T;
    const list = users.filter(
      (u) => u.role === "CONSULTANT" && u.status === "PENDING_MANAGER" && u.managerId === me.id,
    );
    return { consultants: list } as T;
  }

  let approve = match(path, "/managers/consultants/:id/approve");
  if (method === "POST" && approve) {
    const me = session?.user;
    const target = users.find((u) => u.id === approve!.id);
    if (!target) throw new Error("Consultant introuvable");
    if (me && me.role === "MANAGER" && target.managerId !== me.id)
      throw new Error("Ce consultant n'est pas rattaché à votre périmètre");
    target.status = "ACTIVE";
    target.updatedAt = now();
    return { user: target } as T;
  }

  let reject = match(path, "/managers/consultants/:id/reject");
  if (method === "POST" && reject) {
    const me = session?.user;
    const target = users.find((u) => u.id === reject!.id);
    if (!target) throw new Error("Consultant introuvable");
    if (me && me.role === "MANAGER" && target.managerId !== me.id)
      throw new Error("Ce consultant n'est pas rattaché à votre périmètre");
    target.status = "DISABLED";
    target.updatedAt = now();
    return { user: target } as T;
  }

  // Notifications minimales (compteur pour le badge sidebar)
  if (method === "GET" && path === "/notifications/pending-count") {
    const me = session?.user;
    if (!me) return { count: 0 } as T;
    if (me.role === "MANAGER") {
      const c = users.filter(
        (u) => u.role === "CONSULTANT" && u.status === "PENDING_MANAGER" && u.managerId === me.id,
      ).length;
      return { count: c } as T;
    }
    if (me.role === "SUPER_ADMIN") {
      const c = users.filter((u) => u.role === "CONSULTANT" && u.status === "PENDING_MANAGER").length;
      return { count: c } as T;
    }
    return { count: 0 } as T;
  }

  // GET courant pour rafraîchir la session côté front (statut, managerId)
  if (method === "GET" && path === "/auth/me") {
    const me = session?.user;
    if (!me) throw new Error("Non authentifié");
    const stored = users.find((u) => u.id === me.id) ?? me;
    return { user: stored } as T;
  }







  // CHAT
  if (method === "GET" && path === "/chat/conversations") {
    return { conversations } as T;
  }
  let m = match(path, "/chat/conversations/:id");
  if (method === "GET" && m) {
    const conv = conversations.find((c) => c.id === m!.id);
    if (!conv) throw new Error("Conversation introuvable");
    const detail: ConversationDetail = {
      conversation: conv,
      messages: messagesByConv[conv.id] ?? [],
      responses: [],
    };
    return detail as T;
  }
  if (method === "POST" && path === "/chat/conversations") {
    const title = (body as { title?: string })?.title ?? "Nouvelle conversation";
    const lang = (body as { language?: string })?.language ?? "fr";
    const conv: Conversation = {
      id: id("c"),
      userId: session?.user.id ?? "u-consult",
      managerId: session?.user.managerId ?? "u-mgr",
      title,
      language: lang,
      channel: "WEB",
      createdAt: now(),
      updatedAt: now(),
    };
    conversations.unshift(conv);
    messagesByConv[conv.id] = [];
    return { conversation: conv } as T;
  }
  m = match(path, "/chat/conversations/:id/messages");
  if (method === "POST" && m) {
    const payload = (body as { content?: string; industryTags?: string[]; pmDomainTags?: string[] }) ?? {};
    const content = payload.content ?? "";
    const filters = {
      industryTags: Array.isArray(payload.industryTags) ? payload.industryTags : [],
      pmDomainTags: Array.isArray(payload.pmDomainTags) ? payload.pmDomainTags : [],
    };
    const list = (messagesByConv[m.id] ??= []);
    list.push({
      id: id("m"),
      conversationId: m.id,
      role: "user",
      content,
      language: "fr",
      createdAt: now(),
    });
    const answer = buildAnswer(content, filters);
    list.push({
      id: answer.response.messageId,
      conversationId: m.id,
      role: "assistant",
      content: answer.answer,
      language: "fr",
      createdAt: now(),
    });
    return answer as T;
  }
  m = match(path, "/chat/responses/:id/retry-fallback");
  if (method === "POST" && m) {
    return buildAnswer("(retry fallback)") as T;
  }
  m = match(path, "/chat/responses/:id/feedback");
  if (method === "POST" && m) {
    return { ok: true } as T;
  }

  // FIRST VISIT MANAGER SELECTION
  if (method === "GET" && path === "/users/managers") {
    const mgrs = users.filter((u) => u.role === "MANAGER");
    return { managers: mgrs } as T;
  }
  if (method === "POST" && path === "/users/me/manager") {
    const managerId = (body as { managerId?: string })?.managerId ?? null;
    const current = session?.user;
    if (current) {
      const stored = users.find((u) => u.id === current.id);
      if (stored) {
        stored.managerId = managerId;
        stored.status = "ACTIVE";
        stored.updatedAt = now();
        return { user: stored } as T;
      }
      return { user: { ...current, managerId, status: "ACTIVE" } } as T;
    }
    return { user: users[0] } as T;
  }


  // HISTORY — scope par rôle :
  //  - SUPER_ADMIN / AUDITOR : voit tout
  //  - MANAGER : voit uniquement les Q/R de ses consultants
  //  - CONSULTANT : non autorisé (renvoie vide)
  const allHistoryRows: HistoryRow[] = [
    {
      responseId: "r-1",
      conversationId: "c-1",
      userName: "Clara Consultante",
      managerId: "u-mgr",
      question: "Comment construire un WBS pour un programme avionique de 18 mois ?",
      answer:
        "Un WBS robuste s'articule en 4 niveaux : objectifs programme, livrables systèmes, lots de travaux, tâches.",
      language: "fr",
      model: "mistral-large-latest",
      provider: "mistral",
      confidence: 0.78,
      fallbackUsed: false,
      escalationTriggered: false,
      latencyMs: 420,
      createdAt: now(),
    },
    {
      responseId: "r-2",
      conversationId: "c-2",
      userName: "Clara Consultante",
      managerId: "u-mgr",
      question: "Quel modèle RACI utiliser pour une gouvernance projet à 5 parties prenantes ?",
      answer:
        "Le RACI doit identifier R (Responsible), A (Accountable), C (Consulted), I (Informed) pour chaque livrable clé.",
      language: "fr",
      model: "mistral-large-latest",
      provider: "mistral",
      confidence: 0.82,
      fallbackUsed: false,
      escalationTriggered: false,
      latencyMs: 510,
      createdAt: now(),
    },
    {
      responseId: "r-3",
      conversationId: "c-3",
      userName: "Lucas Consultant",
      managerId: "u-mgr-2",
      question: "Comment estimer la charge d'un lot de travaux en méthode PERT ?",
      answer:
        "La méthode PERT utilise (O + 4M + P) / 6 où O = optimiste, M = plus probable, P = pessimiste.",
      language: "fr",
      model: "gpt-4o-mini",
      provider: "openai",
      confidence: 0.65,
      fallbackUsed: true,
      escalationTriggered: false,
      latencyMs: 680,
      createdAt: now(),
    },
  ];




  if (method === "GET" && path === "/admin/history") {
    const role = session?.user.role;
    let rows = allHistoryRows;
    if (role === "MANAGER") {
      rows = allHistoryRows.filter((r) => r.managerId === session?.user.id);
    } else if (role === "CONSULTANT") {
      rows = [];
    }
    return { rows } as T;
  }

  m = match(path, "/admin/history/:id");
  if (method === "GET" && m) {
    const row = allHistoryRows.find((r) => r.responseId === m!.id);
    if (!row) throw new Error("Réponse introuvable");
    return {
      ...row,
      feedback: historyFeedback[row.responseId] ?? [],
      adminComments: historyAdminComments[row.responseId] ?? [],
      sources: mockSources().map((s) => ({
        chunk: { title: s.title, section: s.section, page: s.page, text: s.excerpt },
        score: Math.round(s.score * 100),
      })),
    } as T;
  }

  m = match(path, "/admin/history/:id/comment");
  if (method === "POST" && m) {
    const payload = (body as { comment?: string; status?: string }) ?? {};
    const list = (historyAdminComments[m.id] ??= []);
    const entry = {
      id: id("ac"),
      adminId: session?.user.id ?? "u-super",
      adminName: session?.user.name ?? "Super admin",
      comment: payload.comment ?? "",
      status: payload.status ?? "DRAFT",
      createdAt: now(),
    };
    list.push(entry);
    return { comment: entry } as T;
  }

  m = match(path, "/admin/history/:id/translate");
  if (method === "POST" && m) {
    const row = allHistoryRows.find((r) => r.responseId === m!.id);
    const lang = (body as { language?: string })?.language ?? "en";
    return {
      question: `[${lang.toUpperCase()}] ${row?.question ?? ""}`,
      answer: `[${lang.toUpperCase()}] ${row?.answer ?? ""}`,
    } as T;
  }


  // DASHBOARD
  if (method === "GET" && path.startsWith("/admin/dashboard")) {
    const POSITIVE = new Set(["UP", "FOUR", "FIVE"]);
    const NEGATIVE = new Set(["DOWN", "ONE", "TWO"]);
    const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    let starSum = 0;
    let starCount = 0;
    for (const list of Object.values(historyFeedback)) {
      for (const fb of list) {
        if (POSITIVE.has(fb.rating)) positive += 1;
        else if (NEGATIVE.has(fb.rating)) negative += 1;
        else neutral += 1;
        const star = STAR_MAP[fb.rating];
        if (star) {
          starSum += star;
          starCount += 1;
        }
      }
    }
    const feedbackCount = positive + negative + neutral;
    const satisfactionRate = feedbackCount ? Math.round((positive / feedbackCount) * 100) : 0;
    const averageStars = starCount ? Math.round((starSum / starCount) * 10) / 10 : 0;
    const payload: DashboardPayload = {
      kpis: {
        questions: 142,
        activeUsers: 18,
        fallbackRate: 6,
        escalationRate: 2,
        latencyP50: 380,
        latencyP95: 920,
        estimatedCost: 4.21,
        satisfactionRate,
        feedbackCount,
        averageStars,
        positiveCount: positive,
        neutralCount: neutral,
        negativeCount: negative,
      },
      metrics: [],
    };
    return payload as T;
  }

  // KB
  if (method === "GET" && path.startsWith("/kb/documents")) {
    const payload: KnowledgePayload = { documents };
    return payload as T;
  }
  if (method === "POST" && path === "/kb/documents") {
    if (session?.user.role !== "SUPER_ADMIN") throw new Error("403 — Seul le Super Admin peut alimenter la base de connaissance");
    const { title, industryTags, pmDomainTags } = extractUploadFields(body);
    const doc: DocumentRecord = {
      id: id("d"),
      title,
      ownerId: session?.user.id ?? "u-mgr",
      objectKey: `kb/${title}`,
      mimeType: "application/octet-stream",
      status: "PROCESSING",
      version: 1,
      checksum: "mock",
      language: "fr",
      createdAt: now(),
      industryTags,
      pmDomainTags,
    };
    documents.unshift(doc);
    return { document: doc } as T;
  }
  m = match(path, "/kb/documents/:id");
  if (method === "PATCH" && m) {
    if (session?.user.role !== "SUPER_ADMIN") throw new Error("403 — Réservé au Super Admin");
    const doc = documents.find((d) => d.id === m!.id);
    if (doc) Object.assign(doc, body ?? {});
    return { document: doc } as T;
  }

  // USERS
  if (method === "GET" && path === "/admin/users") {
    return { users } as T;
  }
  if (method === "POST" && path === "/admin/users") {
    const payload = (body as Partial<User>) ?? {};
    const u: User = {
      id: id("u"),
      email: payload.email ?? "new@migso-pcubed.local",
      name: payload.name ?? "Nouvel utilisateur",
      role: (payload.role as Role) ?? "CONSULTANT",
      language: payload.language ?? "fr",
      status: "ACTIVE",
      department: payload.department ?? null,
      managerId: payload.managerId ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    users.push(u);
    return { user: u } as T;
  }
  m = match(path, "/admin/users/:id");
  if (method === "PATCH" && m) {
    const u = users.find((x) => x.id === m!.id);
    if (u) Object.assign(u, body ?? {});
    return { user: u } as T;
  }

  // PROMPTS & PROVIDERS
  if (method === "GET" && path === "/admin/prompts") return { prompts } as T;
  if (method === "POST" && path === "/admin/prompts") {
    const p: PromptVersion = {
      id: id("p"),
      name: (body as PromptVersion)?.name ?? "prompt",
      content: (body as PromptVersion)?.content ?? "",
      configJson: (body as PromptVersion)?.configJson ?? {},
      createdById: session?.user.id ?? "u-super",
      active: false,
      createdAt: now(),
    };
    prompts.push(p);
    return { prompt: p } as T;
  }
  if (method === "GET" && path === "/admin/providers") {
    const masked = providers.map((p) => ({
      provider: p.provider,
      model: p.model,
      configJson: p.configJson,
      maskedKey: p.maskedKey ?? null,
      updatedAt: p.updatedAt,
    }));
    return { providers: masked } as T;
  }
  if (method === "POST" && path === "/admin/providers") {
    const payload = (body ?? {}) as {
      provider?: string;
      apiKey?: string;
      model?: string;
      configJson?: Record<string, unknown>;
    };
    if (!payload.provider || !payload.apiKey) throw new Error("provider et apiKey requis");
    const existing = providers.find((p) => p.provider === payload.provider);
    const masked = `••••••${payload.apiKey.slice(-4)}`;
    if (existing) {
      existing.model = payload.model ?? existing.model;
      existing.configJson = payload.configJson ?? existing.configJson;
      existing.maskedKey = masked;
      existing.active = true;
      existing.updatedAt = now();
    } else {
      providers.push({
        id: `ai-${providers.length + 1}`,
        provider: payload.provider as AiProviderConfig["provider"],
        model: payload.model ?? "",
        configJson: payload.configJson ?? {},
        active: true,
        maskedKey: masked,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    pushProviderHistory(payload.provider, "set", session);
    return { ok: true } as T;
  }
  m = match(path, "/admin/providers/:id/rotate");
  if (method === "PATCH" && m) {
    const payload = (body ?? {}) as {
      apiKey?: string;
      model?: string;
      configJson?: Record<string, unknown>;
    };
    if (!payload.apiKey) throw new Error("apiKey requis");
    const prov = providers.find((p) => p.provider === m!.id);
    if (!prov) throw new Error("Provider introuvable");
    prov.maskedKey = `••••••${payload.apiKey.slice(-4)}`;
    if (payload.model) prov.model = payload.model;
    if (payload.configJson) prov.configJson = payload.configJson;
    prov.updatedAt = now();
    pushProviderHistory(m.id, "rotate", session);
    return { ok: true } as T;
  }
  m = match(path, "/admin/providers/:id/history");
  if (method === "GET" && m) {
    return { events: providerHistory[m.id] ?? [] } as T;
  }
  m = match(path, "/admin/providers/:id/test");
  if (method === "POST" && m) {
    const prov = providers.find((p) => p.provider === m!.id);
    if (!prov) return { ok: false, latencyMs: 0, checkedAt: now() } as T;
    const ok = Boolean(prov.maskedKey);
    return { ok, latencyMs: 120 + Math.floor(Math.random() * 240), checkedAt: now() } as T;
  }
  m = match(path, "/admin/providers/:id");
  if (method === "DELETE" && m) {
    const prov = providers.find((p) => p.provider === m!.id);
    if (prov) {
      prov.maskedKey = null;
      prov.active = false;
      prov.updatedAt = now();
    }
    pushProviderHistory(m.id, "delete", session);
    return { ok: true } as T;
  }
  if (method === "PATCH" && m) {
    const prov = providers.find((p) => p.provider === m!.id);
    if (prov) Object.assign(prov, body ?? {});
    return { provider: prov } as T;
  }
  if (method === "GET" && path === "/admin/settings")
    return { settings: appSettings } as T;
  if (method === "PATCH" && path === "/admin/settings") {
    Object.assign(appSettings, (body ?? {}) as Record<string, unknown>);
    return { ok: true, settings: appSettings } as T;
  }



  // AUDIT
  if (method === "GET" && path.startsWith("/admin/audit")) {
    return { events: auditEvents } as T;
  }

  // EMBED
  if (method === "GET" && path === "/admin/embed") {
    return {
      snippet:
        '<script src="https://app.migso-pcubed.local/embed.js" data-token="MOCK"></script>',
      allowedOrigins: ["https://intranet.migso-pcubed.local"],
    } as T;
  }

  // KB — détail, publication, réindexation, upload
  m = match(path, "/kb/documents/:id");
  if (method === "GET" && m) {
    const doc = documents.find((d) => d.id === m!.id) ?? documents[0]!;
    return {
      document: doc,
      chunks: [
        {
          id: "ch-1",
          title: doc.title,
          text: "Extrait simulé pour la prévisualisation UI. Brancher l'API réelle pour les contenus exacts.",
          page: 1,
          section: "Intro",
          paragraph: 1,
        },
      ],
    } as T;
  }
  m = match(path, "/kb/documents/:id/publish");
  if (method === "POST" && m) {
    if (session?.user.role !== "SUPER_ADMIN") throw new Error("403 — Réservé au Super Admin");
    const doc = documents.find((d) => d.id === m!.id);
    if (doc) doc.status = "PUBLISHED";
    return { ok: true } as T;
  }
  m = match(path, "/kb/documents/:id/reindex");
  if (method === "POST" && m) {
    if (session?.user.role !== "SUPER_ADMIN") throw new Error("403 — Réservé au Super Admin");
    return { ok: true } as T;
  }
  if (method === "POST" && path === "/kb/upload") {
    if (session?.user.role !== "SUPER_ADMIN") throw new Error("403 — Seul le Super Admin peut uploader des documents");
    const { title, industryTags, pmDomainTags } = extractUploadFields(body);
    const doc: DocumentRecord = {
      id: id("d"),
      title,
      ownerId: session?.user.id ?? "u-mgr",
      objectKey: `kb/${title}`,
      mimeType: "application/octet-stream",
      status: "NEEDS_REVIEW",
      version: 1,
      checksum: "mock",
      language: "fr",
      createdAt: now(),
      industryTags,
      pmDomainTags,
    };
    documents.unshift(doc);
    return { document: doc } as T;
  }

  // PROMPTS — rollback
  m = match(path, "/admin/prompts/:id/rollback");
  if (method === "POST" && m) {
    prompts.forEach((p) => {
      p.active = p.id === m!.id;
    });
    return { ok: true } as T;
  }

  // COMPLIANCE / CORRECTIONS
  if (method === "GET" && path === "/admin/compliance/system-card") {
    return {
      systemCard: {
        version: "1.0.0",
        updatedAt: now(),
        model: "mistral-large-latest",
        provider: "mistral",
        purpose:
          "Assistant interne MIGSO-PCUBED dédié à la production de livrables PMO sur base de la knowledge base validée.",
        dataSources: ["KB interne", "Référentiels PMI", "Notes validées superadmin"],
        risks: ["Hallucination", "Citations imprécises", "Drift modèle"],
        mitigations: ["RAG strict", "Citations forcées", "Revue humaine"],
        owners: ["Gouvernance IA", "Direction Conformité"],
      },
    } as T;
  }
  if ((method === "GET" || method === "POST") && path === "/admin/compliance/export") {
    return {
      exportedAt: now(),
      url: "data:text/plain;base64,TUlHU08tUENVQkVE",
      expiresIn: 3600,
    } as T;
  }
  if (method === "GET" && path === "/admin/corrections") {
    return { corrections: [] } as T;
  }

  // SOURCE
  m = match(path, "/source/:chunkId");
  if (method === "GET" && m) {
    return {
      chunk: {
        id: m.chunkId,
        title: "Source simulée",
        text: "Aperçu du contenu de la source pour la prévisualisation UI.",
      },
    } as T;
  }

  // ============================================================
  // VAGUE 5 — Budget / Usage / Models / Ingestion Status
  // ============================================================

  if (method === "GET" && path === "/me/budget") {
    const used = 47.32;
    const limit = 80;
    return {
      period: "2026-06",
      currency: "USD",
      limit,
      used,
      remaining: Math.max(0, limit - used),
      ratio: used / limit,
      status: used / limit < 0.7 ? "ok" : used / limit < 0.9 ? "warn" : "blocked",
      breakdown: { chat: 38.4, embeddings: 3.2, ocr: 4.1, transcription: 1.62 },
      resetAt: "2026-07-01T00:00:00Z",
    } as T;
  }

  if (method === "GET" && path.startsWith("/me/usage")) {
    const days = 14;
    const series = Array.from({ length: days }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const base = 2.4 + Math.sin(i / 2) * 1.1 + Math.random() * 0.6;
      return {
        date: d.toISOString().slice(0, 10),
        cost: Number(base.toFixed(2)),
        tokensIn: Math.round(8000 + Math.random() * 6000),
        tokensOut: Math.round(2000 + Math.random() * 3000),
        requests: Math.round(20 + Math.random() * 40),
      };
    });
    const totals = series.reduce(
      (acc, d) => ({
        cost: acc.cost + d.cost,
        tokensIn: acc.tokensIn + d.tokensIn,
        tokensOut: acc.tokensOut + d.tokensOut,
        requests: acc.requests + d.requests,
      }),
      { cost: 0, tokensIn: 0, tokensOut: 0, requests: 0 },
    );
    return {
      series,
      totals: { ...totals, cost: Number(totals.cost.toFixed(2)) },
      byModel: [
        { model: "anthropic.claude-3-5-sonnet", cost: 28.4, tokens: 412_000, requests: 124, share: 0.6 },
        { model: "anthropic.claude-3-haiku", cost: 9.1, tokens: 287_000, requests: 96, share: 0.19 },
        { model: "amazon.titan-embed-text-v2", cost: 3.2, tokens: 1_240_000, requests: 412, share: 0.07 },
        { model: "mistral.mistral-large", cost: 6.62, tokens: 84_000, requests: 21, share: 0.14 },
      ],
    } as T;
  }

  if (method === "GET" && path === "/me/models") {
    const role = session?.user.role ?? "CONSULTANT";
    const all = [
      { id: "anthropic.claude-3-haiku", label: "Claude 3 Haiku", provider: "AWS Bedrock", tier: "fast", contextWindow: 200_000, pricePer1kIn: 0.00025, pricePer1kOut: 0.00125, roles: ["CONSULTANT", "MANAGER", "SUPER_ADMIN"] },
      { id: "anthropic.claude-3-5-sonnet", label: "Claude 3.5 Sonnet", provider: "AWS Bedrock", tier: "balanced", contextWindow: 200_000, pricePer1kIn: 0.003, pricePer1kOut: 0.015, roles: ["MANAGER", "SUPER_ADMIN"] },
      { id: "anthropic.claude-3-opus", label: "Claude 3 Opus", provider: "AWS Bedrock", tier: "premium", contextWindow: 200_000, pricePer1kIn: 0.015, pricePer1kOut: 0.075, roles: ["SUPER_ADMIN"] },
      { id: "mistral.mistral-large", label: "Mistral Large", provider: "AWS Bedrock", tier: "balanced", contextWindow: 32_000, pricePer1kIn: 0.004, pricePer1kOut: 0.012, roles: ["MANAGER", "SUPER_ADMIN"] },
    ];
    const allowed = all.filter((mm) => mm.roles.includes(role));
    return {
      defaultModel: allowed[0]?.id ?? null,
      models: allowed.map((mm) => ({ ...mm, allowed: true })),
      restricted: all.filter((mm) => !mm.roles.includes(role)).map((mm) => ({ ...mm, allowed: false })),
      quotas: {
        rpm: role === "SUPER_ADMIN" ? 120 : role === "MANAGER" ? 60 : 20,
        tpm: role === "SUPER_ADMIN" ? 200_000 : role === "MANAGER" ? 100_000 : 40_000,
      },
    } as T;
  }

  if (method === "GET" && path.startsWith("/admin/usage")) {
    return {
      totals: { cost: 1284.55, tokensIn: 12_400_000, tokensOut: 3_800_000, requests: 4820, activeUsers: 38 },
      topUsers: [
        { userId: "u1", name: "Léa M.", cost: 142.3, requests: 380, model: "anthropic.claude-3-5-sonnet" },
        { userId: "u2", name: "Karim B.", cost: 98.1, requests: 220, model: "anthropic.claude-3-5-sonnet" },
        { userId: "u3", name: "Sofia P.", cost: 76.4, requests: 198, model: "anthropic.claude-3-haiku" },
        { userId: "u4", name: "Nathan R.", cost: 61.8, requests: 142, model: "mistral.mistral-large" },
      ],
      byOrg: [
        { orgId: "org-pcb-fr", name: "PCUBED France", cost: 612.3, share: 0.48 },
        { orgId: "org-pcb-uk", name: "PCUBED UK", cost: 401.1, share: 0.31 },
        { orgId: "org-migso", name: "MIGSO Group", cost: 271.15, share: 0.21 },
      ],
    } as T;
  }

  m = match(path, "/kb/documents/:id/execution");
  if (method === "GET" && m) {
    const states = [
      { name: "Classify", status: "SUCCEEDED", startedAt: -120, durationMs: 480 },
      { name: "RouteHeavy", status: "SUCCEEDED", startedAt: -115, durationMs: 60 },
      { name: "TextractAsync", status: "SUCCEEDED", startedAt: -113, durationMs: 38_400 },
      { name: "Chunk", status: "SUCCEEDED", startedAt: -74, durationMs: 920 },
      { name: "EmbedParallelMap", status: "RUNNING", startedAt: -72, durationMs: null },
      { name: "IndexAOSS", status: "PENDING", startedAt: null, durationMs: null },
      { name: "Notify", status: "PENDING", startedAt: null, durationMs: null },
    ];
    return {
      documentId: m.id,
      executionArn: `arn:aws:states:eu-west-3:111122223333:execution:mp-ingestion:${m.id}-exec`,
      stateMachine: "mp-ingestion",
      status: "RUNNING",
      startedAt: new Date(Date.now() - 120_000).toISOString(),
      states,
      progress: 4 / states.length,
      cost: { textractPages: 32, embeddingsTokens: 184_000, estimatedUsd: 0.42 },
    } as T;
  }

  // Fallback no-op
  return {} as T;
}


