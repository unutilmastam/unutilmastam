import { z } from 'zod';
import type { Config } from '../../config';
import { MODEL_PRICES } from '../../domain/sales';
import { type AiDrafter, AnthropicDrafter, pingAnthropic } from '../../integrations/ai';
import { SecretBox } from '../../lib/crypto';
import type { Db } from '../../lib/db';
import { AppError, badRequest } from '../../lib/errors';
import { redactText } from '../../lib/logger';
import { writeAudit } from '../audit';
import { markIntegration } from '../integrations/service';

// The owner pastes the Anthropic API key in the app (Integratsiyalar page) instead of the hosting
// panel (D-017). It is stored sealed with APP_SECRET_KEY, never returned, only its last 4 characters
// are shown. ANTHROPIC_API_KEY from the environment remains a fallback.

export const INTEGRATION_AI = 'ai';
const SETTING_KEY = 'ai.provider';

export type Drafters = { fast: AiDrafter | null; strong: AiDrafter | null };
export type AiPing = (apiKey: string, model: string) => Promise<{ inputTokens: number; outputTokens: number }>;
export type DrafterFactory = (apiKey: string, model: string) => AiDrafter;

/** Models with known prices, so every call can be costed (A6). */
export const AI_MODELS = Object.keys(MODEL_PRICES) as [string, ...string[]];
const modelSchema = z.enum(AI_MODELS);

export const aiKeyInputSchema = z.object({
  apiKey: z.string().trim().max(300).optional(),
  model: modelSchema,
  strongModel: modelSchema,
});
const KEY_FORMAT = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;

export type AiKeyInput = z.infer<typeof aiKeyInputSchema>;

const storedSchema = z.object({
  sealedKey: z.string().min(10),
  last4: z.string().max(4),
  model: modelSchema,
  strongModel: modelSchema,
  savedAt: z.string(),
});

interface Resolved {
  source: 'app' | 'env' | 'none' | 'unreadable';
  key: string | null;
  last4: string | null;
  model: string;
  strongModel: string;
  savedAt: string | null;
}

export class AiProviderService {
  readonly #box: SecretBox;
  readonly #ping: AiPing;
  readonly #factory: DrafterFactory;
  #cache: { sig: string; drafters: Drafters } | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly now: () => Date = () => new Date(),
    opts: { ping?: AiPing; factory?: DrafterFactory; fixed?: Drafters } = {},
  ) {
    this.#box = new SecretBox(config.APP_SECRET_KEY, 'ai-api-key');
    this.#ping = opts.ping ?? pingAnthropic;
    this.#factory = opts.factory ?? ((key, model) => new AnthropicDrafter(key, model));
    this.fixed = opts.fixed ?? null;
  }

  /** Test override: when set, these drafters are used regardless of the stored key. */
  readonly fixed: Drafters | null;

  async #resolve(): Promise<Resolved> {
    const row = await this.db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    const stored = storedSchema.safeParse(row?.value);
    if (stored.success) {
      try {
        const key = this.#box.open(stored.data.sealedKey);
        return { source: 'app', key, ...stored.data };
      } catch {
        // APP_SECRET_KEY changed: the sealed key cannot be read; the owner must paste it again.
        return { source: 'unreadable', key: null, ...stored.data };
      }
    }
    const env = this.config.ANTHROPIC_API_KEY;
    return {
      source: env ? 'env' : 'none',
      key: env ?? null,
      last4: env ? env.slice(-4) : null,
      model: this.config.AI_MODEL,
      strongModel: this.config.AI_MODEL_STRONG,
      savedAt: null,
    };
  }

  /** Drafters for the current key; rebuilt only when the key or a model changes (no restart needed). */
  async drafters(): Promise<Drafters> {
    if (this.fixed) return this.fixed;
    const r = await this.#resolve();
    if (!r.key) return { fast: null, strong: null };
    const sig = `${r.key}|${r.model}|${r.strongModel}`;
    if (this.#cache?.sig !== sig) {
      this.#cache = {
        sig,
        drafters: { fast: this.#factory(r.key, r.model), strong: this.#factory(r.key, r.strongModel) },
      };
    }
    return this.#cache.drafters;
  }

  async configured(): Promise<boolean> {
    return !!(await this.drafters()).fast;
  }

  async status() {
    const r = await this.#resolve();
    const row = await this.db.integration.findUnique({ where: { key: INTEGRATION_AI } });
    const status =
      r.source === 'unreadable'
        ? 'ERROR'
        : !r.key
          ? 'NOT_CONFIGURED'
          : row && row.status !== 'NOT_CONFIGURED'
            ? row.status
            : 'CONFIGURED';
    return {
      provider: 'anthropic',
      source: r.source,
      keyLast4: r.last4,
      savedAt: r.savedAt,
      model: r.model,
      strongModel: r.strongModel,
      models: AI_MODELS,
      status,
      lastSuccessAt: row?.lastSuccessAt ?? null,
      lastError:
        r.source === 'unreadable'
          ? "Saqlangan kalitni o'qib bo'lmadi — kalitni qayta kiriting"
          : (row?.lastError ?? null),
    };
  }

  /**
   * Saves the key (or only the models, keeping the saved key) after a real test call.
   * Nothing is stored when the test fails, so a wrong key never replaces a working one.
   */
  async save(input: AiKeyInput, actorUserId: string) {
    const current = await this.#resolve();
    const key = input.apiKey || (current.source === 'app' ? current.key : null);
    if (!key) throw badRequest('api_key_required', 'API kalitni kiriting');
    if (!KEY_FORMAT.test(key)) throw badRequest('invalid_key', 'Kalit "sk-ant-" bilan boshlanishi kerak');
    try {
      await this.#ping(key, input.model);
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err)).slice(0, 300);
      await writeAudit(this.db, {
        actor: { type: 'user', id: actorUserId },
        action: 'integration.ai_key_rejected',
        details: { error: message },
      });
      throw new AppError(422, 'ai_key_rejected', `Kalit ishlamadi: ${message}`);
    }
    const value = {
      sealedKey: this.#box.seal(key),
      last4: key.slice(-4),
      model: input.model,
      strongModel: input.strongModel,
      savedAt: this.now().toISOString(),
    };
    await this.db.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value, updatedById: actorUserId },
      update: { value, updatedById: actorUserId },
    });
    await markIntegration(this.db, INTEGRATION_AI, { ok: true, at: this.now() });
    await writeAudit(this.db, {
      actor: { type: 'user', id: actorUserId },
      action: input.apiKey ? 'integration.ai_key_saved' : 'integration.ai_models_changed',
      details: { last4: value.last4, model: value.model, strongModel: value.strongModel },
    });
    return this.status();
  }

  async remove(actorUserId: string) {
    await this.db.systemSetting.deleteMany({ where: { key: SETTING_KEY } });
    this.#cache = null;
    await this.db.integration.deleteMany({ where: { key: INTEGRATION_AI } });
    await writeAudit(this.db, { actor: { type: 'user', id: actorUserId }, action: 'integration.ai_key_removed' });
    return this.status();
  }

  async test(actorUserId: string) {
    const r = await this.#resolve();
    if (!r.key) throw new AppError(409, 'not_configured', 'AI provayder sozlanmagan');
    try {
      const usage = await this.#ping(r.key, r.model);
      await markIntegration(this.db, INTEGRATION_AI, { ok: true, at: this.now() });
      await writeAudit(this.db, { actor: { type: 'user', id: actorUserId }, action: 'integration.ai_tested' });
      return { ok: true, model: r.model, ...usage };
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err)).slice(0, 300);
      await markIntegration(this.db, INTEGRATION_AI, { ok: false, error: message, at: this.now() });
      throw new AppError(502, 'ai_failed', message);
    }
  }
}
