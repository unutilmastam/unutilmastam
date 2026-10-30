export interface ProspectContact {
  id: string;
  kind: 'PHONE' | 'TELEGRAM' | 'EMAIL' | 'WEBSITE';
  value: string;
  isVerified: boolean;
  sourceType?: string;
}

export interface ProspectRow {
  id: string;
  name: string;
  category: string;
  district: string | null;
  address: string | null;
  stage: string;
  isExistingCustomer: boolean;
  score: number | null;
  scoreReasons: { points: number; text: string }[] | null;
  locationQuality: string;
  rating: number | null;
  ratingCount: number | null;
  discoveredAt: string;
  contacts: ProspectContact[];
  sources?: string[];
}

/** "+998901234567" -> "+998 90 123-45-67" */
export function phone(e164: string): string {
  const d = e164.replace(/^\+998/, '');
  return d.length === 9 ? `+998 ${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7)}` : e164;
}

export const STAGE_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted' | 'gold'> = {
  NEW: 'muted',
  NEEDS_VERIFICATION: 'warn',
  QUALIFIED: 'gold',
  CONTACT_PENDING: 'gold',
  CONTACTED: 'gold',
  INTERESTED: 'ok',
  NEGOTIATION: 'ok',
  WON: 'ok',
  LOST: 'muted',
  DO_NOT_CONTACT: 'bad',
};

// Stages an owner can choose by hand (A10); DO_NOT_CONTACT has its own button.
export const NEXT_STAGES: Record<string, string[]> = {
  NEW: ['NEEDS_VERIFICATION', 'QUALIFIED', 'LOST'],
  NEEDS_VERIFICATION: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['CONTACT_PENDING', 'NEEDS_VERIFICATION', 'LOST'],
  CONTACT_PENDING: ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED: ['INTERESTED', 'CONTACT_PENDING', 'LOST'],
  INTERESTED: ['NEGOTIATION', 'WON', 'LOST'],
  NEGOTIATION: ['WON', 'LOST', 'INTERESTED'],
  WON: [],
  LOST: ['NEW'],
  DO_NOT_CONTACT: [],
};
