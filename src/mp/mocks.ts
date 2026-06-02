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

function mockSources(): SourceCitation[] {
  return [
    {
      chunkId: "ch-1",
      documentId: "d-1",
      title: "Guide WBS MIGSO-PCUBED",
      page: 12,
      section: "3.2 Découpage",
      excerpt:
        "Un découpage WBS efficace pour l'aéronautique s'appuie sur les jalons certifiants et les lots systèmes…",
      score: 0.91,
      sourceUri: "s3://kb/wbs-guide.pdf",
    },
    {
      chunkId: "ch-2",
      documentId: "d-2",
      title: "Référentiel PMI – PMBOK 7",
      section: "Principes",
      excerpt: "Les principes de découpage hiérarchique restent applicables, en alignement avec les domaines de performance…",
      score: 0.84,
      sourceUri: "s3://kb/pmbok7.pdf",
    },
  ];
}

const documents: DocumentRecord[] = [
  {
    id: "d-1",
    title: "Guide WBS MIGSO-PCUBED",
    ownerId: "u-mgr",
    objectKey: "kb/wbs-guide.pdf",
    mimeType: "application/pdf",
    status: "PUBLISHED",
    version: 3,
    checksum: "abc",
    language: "fr",
    createdAt: now(),
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

function buildAnswer(question: string): ChatAnswerPayload {
  const responseId = id("r");
  return {
    response: {
      id: responseId,
      messageId: id("m"),
      provider: "mistral",
      model: "mistral-large-latest",
      promptVersionId: "p-1",
      content: `Réponse mockée à : "${question.slice(0, 80)}". Brancher VITE_USE_MOCKS=false pour utiliser l'API Fastify.`,
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
    answer: `Réponse mockée à : "${question.slice(0, 80)}". Brancher VITE_USE_MOCKS=false pour utiliser l'API Fastify.`,
    sources: mockSources(),
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
    const content = (body as { content?: string })?.content ?? "";
    const list = (messagesByConv[m.id] ??= []);
    list.push({
      id: id("m"),
      conversationId: m.id,
      role: "user",
      content,
      language: "fr",
      createdAt: now(),
    });
    const answer = buildAnswer(content);
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
    const payload: DashboardPayload = {
      kpis: {
        questions: 142,
        activeUsers: 18,
        fallbackRate: 0.06,
        escalationRate: 0.02,
        latencyP50: 380,
        latencyP95: 920,
        estimatedCost: 4.21,
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
    const title = body instanceof FormData ? String(body.get("title") ?? "Document") : "Document";
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
    };
    documents.unshift(doc);
    return { document: doc } as T;
  }
  m = match(path, "/kb/documents/:id");
  if (method === "PATCH" && m) {
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
  if (method === "GET" && path === "/admin/providers") return { providers } as T;
  m = match(path, "/admin/providers/:id");
  if (method === "PATCH" && m) {
    const prov = providers.find((p) => p.id === m!.id);
    if (prov) Object.assign(prov, body ?? {});
    return { provider: prov } as T;
  }
  if (method === "GET" && path === "/admin/settings")
    return {
      settings: {
        topK: 6,
        minRelevanceScore: 0.65,
        qualityThreshold: 0.7,
        temperature: 0.2,
        maxTokens: 800,
        reasoningEffort: "medium",
        verbosity: "balanced",
        allowedEmbedOrigins: ["https://intranet.migso-pcubed.local"],
        mistralModel: "mistral-large-latest",
        openAiModel: "gpt-4o-mini",
        searchProvider: "mock",
      },
    } as T;
  if (method === "PATCH" && path === "/admin/settings") return { ok: true } as T;

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
    const doc = documents.find((d) => d.id === m!.id);
    if (doc) doc.status = "PUBLISHED";
    return { ok: true } as T;
  }
  m = match(path, "/kb/documents/:id/reindex");
  if (method === "POST" && m) {
    return { ok: true } as T;
  }
  if (method === "POST" && path === "/kb/upload") {
    const title =
      body instanceof FormData
        ? String(body.get("title") ?? "Document")
        : ((body as { title?: string })?.title ?? "Document");
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
  if (method === "GET" && path === "/admin/compliance/export") {
    return { url: "data:text/plain;base64,TUlHU08tUENVQkVE", expiresIn: 3600 } as T;
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

  // Fallback no-op
  return {} as T;
}

