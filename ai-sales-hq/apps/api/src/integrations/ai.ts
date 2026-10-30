import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// Provider-independent drafting interface (MASTER_SPEC §16). The AI only phrases messages; the
// deterministic quality gate in domain/sales.ts decides whether a draft can be used.

export interface DraftRequest {
  purpose: 'outreach' | 'reply';
  businessName: string;
  category: string;
  district: string | null;
  // Pre-formatted product lines with CONFIRMED prices only.
  productLines: string[];
  signature: string;
  language: 'uz' | 'ru';
  // For replies: the conversation so far, with phone numbers already masked.
  history?: { direction: 'OUTBOUND' | 'INBOUND'; body: string }[];
}

export interface DraftResult {
  text: string;
  language: 'uz' | 'ru';
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiDrafter {
  readonly provider: string;
  readonly model: string;
  draft(req: DraftRequest): Promise<DraftResult>;
}

export class AiRefusedError extends Error {}

const OutputSchema = z.object({
  message: z.string().describe('The message text, ready to send'),
  language: z.enum(['uz', 'ru']),
});

const SYSTEM = `You write short sales messages for Unutilmas Ta'm, a producer of frozen Uzbek semi-finished food (chuchvara, lag'mon, somsa dough and similar) in Surxondaryo region, Uzbekistan. The owner sends each message himself from his own phone or Telegram after reading it, so write as the company, politely and briefly.

Rules that a code check enforces after you; a draft that breaks them is thrown away:
- Mention prices only exactly as given in the product list. If no price is given, say the price will be told on request.
- No discounts, promotions, free items, delivery dates, guarantees, credit or payment terms: only the owner decides those. If the customer asks for any of them, say the manager will contact them about it.
- No links and no phone numbers.
- At most 600 characters. Plain text, no Markdown.
- Write in Uzbek (Latin script) unless the requested language is Russian.`;

function userPrompt(req: DraftRequest): string {
  const lines = [
    `Task: ${req.purpose === 'outreach' ? 'first message offering our products to this shop' : "reply to the shop's last message"}`,
    `Language: ${req.language === 'ru' ? 'Russian' : 'Uzbek (Latin)'}`,
    `Shop: ${req.businessName} (${req.category}${req.district ? `, ${req.district}` : ''})`,
    `Sign as: ${req.signature}`,
    'Products (only these, only these prices):',
    ...(req.productLines.length ? req.productLines.map((l) => `- ${l}`) : ['- (no confirmed prices yet)']),
  ];
  if (req.history?.length) {
    lines.push('Conversation so far (oldest first):');
    for (const m of req.history.slice(-8)) lines.push(`${m.direction === 'INBOUND' ? 'Shop' : 'Us'}: ${m.body}`);
  }
  return lines.join('\n');
}

export class AnthropicDrafter implements AiDrafter {
  readonly provider = 'anthropic';
  readonly #client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    client?: Anthropic,
  ) {
    // Short timeout: drafting is a small request; the SDK retries 429/5xx twice.
    this.#client = client ?? new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async draft(req: DraftRequest): Promise<DraftResult> {
    const response = await this.#client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt(req) }],
      output_config: { effort: 'low', format: zodOutputFormat(OutputSchema) },
    });
    if (response.stop_reason === 'refusal') throw new AiRefusedError('The model declined to write this message');
    const out = response.parsed_output;
    if (!out) throw new Error(`No structured output (stop_reason ${response.stop_reason})`);
    return {
      text: out.message.trim(),
      language: out.language,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

/** Small real call used by "test connection" (CONNECTED only after it succeeds). */
export async function pingAnthropic(
  apiKey: string,
  model: string,
): Promise<{ inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  const r = await client.messages.create({
    model,
    max_tokens: 64,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
  });
  return { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
}
