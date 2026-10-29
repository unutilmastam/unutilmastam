// The logical agents (MASTER_SPEC §9). One backend, several roles; orchestration is code (A6).

export const AGENT_KEYS = [
  'director',
  'market_research',
  'business_analyst',
  'sales',
  'communication',
  'order_manager',
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const ROOMS = ['hq', 'director', 'research', 'sales', 'communication', 'orders'] as const;
export type Room = (typeof ROOMS)[number];

export interface AgentDefinition {
  key: AgentKey;
  name: string; // Uzbek display name
  role: string; // one-line Uzbek description
  room: Room;
  // Job types this agent may run; the worker refuses anything else (MASTER_SPEC §9 "enforce roles").
  jobTypes: readonly string[];
  // Phase in which the agent's work is implemented. Until then it stays DRAFT and cannot start.
  availableFromPhase: number;
  defaultDailyTaskLimit: number;
}

export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  {
    key: 'director',
    name: 'Direktor',
    role: 'Ishni muvofiqlashtiradi, katalogni yangilab turadi, egaga hisobot beradi',
    room: 'director',
    jobTypes: ['catalog.sync', 'director.daily_report'],
    availableFromPhase: 3,
    defaultDailyTaskLimit: 500,
  },
  {
    key: 'market_research',
    name: 'Bozor tadqiqotchisi',
    role: "Ruxsat etilgan manbalardan do'kon va supermarketlarni topadi",
    room: 'research',
    jobTypes: ['discovery.firestore_stores', 'discovery.places_search', 'discovery.places_refresh'],
    availableFromPhase: 5,
    defaultDailyTaskLimit: 200,
  },
  {
    key: 'business_analyst',
    name: 'Biznes tahlilchi',
    role: 'Mijozlarni baholaydi va nima uchun shunday baho berganini tushuntiradi',
    room: 'research',
    jobTypes: ['prospects.score'],
    availableFromPhase: 5,
    defaultDailyTaskLimit: 1000,
  },
  {
    key: 'sales',
    name: 'Sotuv menejeri',
    role: 'Tasdiqlangan narxlar asosida taklif tayyorlaydi',
    room: 'sales',
    jobTypes: ['sales.followups'],
    availableFromPhase: 6,
    defaultDailyTaskLimit: 100,
  },
  {
    key: 'communication',
    name: 'Muloqot mutaxassisi',
    role: 'Xabar loyihalarini tayyorlaydi; egasi tasdiqlab yuboradi',
    room: 'communication',
    jobTypes: ['outreach.draft'],
    availableFromPhase: 6,
    defaultDailyTaskLimit: 100,
  },
  {
    key: 'order_manager',
    name: 'Buyurtma menejeri',
    role: "Buyurtmani yig'adi, hisoblaydi va egaga topshiradi",
    room: 'orders',
    jobTypes: [],
    availableFromPhase: 7,
    defaultDailyTaskLimit: 100,
  },
];

export const CURRENT_PHASE = 6;

export function definitionFor(key: string): AgentDefinition | undefined {
  return AGENT_DEFINITIONS.find((d) => d.key === key);
}

export function isAvailable(def: AgentDefinition, phase = CURRENT_PHASE): boolean {
  return def.availableFromPhase <= phase;
}

/** Which agent owns a job type (null = no agent may run it). */
export function agentForJobType(type: string): AgentKey | null {
  return AGENT_DEFINITIONS.find((d) => d.jobTypes.includes(type))?.key ?? null;
}
