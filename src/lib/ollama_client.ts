/**
 * Minimal Ollama HTTP client. Uses only global `fetch` — no SDK dependency.
 *
 * Timeouts are enforced with AbortSignal so a stalled local runtime can never
 * hang an HTTP request to the studio. All URLs are derived from a single,
 * environment-controlled base and never from user input.
 */

const BASE_URL = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');

export interface OllamaStatus {
  online: boolean;
  baseUrl: string;
  version?: string;
  models: string[];
  checkedAt: string;
  error?: string;
}

export interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  system?: string;
  jsonMode?: boolean;
  numCtx?: number;
  numThread?: number;
  numPredict?: number;
  temperature?: number;
  keepAlive?: string;
  timeoutMs?: number;
}

export interface OllamaGenerateResult {
  ok: boolean;
  text: string;
  model: string;
  error?: string;
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1000, ms));
}

/** Probe /api/tags and /api/version concurrently. Never throws. */
export async function probeOllama(timeoutMs = 2500): Promise<OllamaStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const [tagsRes, versionRes] = await Promise.allSettled([
      fetch(`${BASE_URL}/api/tags`, { signal: withTimeout(timeoutMs) }),
      fetch(`${BASE_URL}/api/version`, { signal: withTimeout(timeoutMs) }),
    ]);
    if (tagsRes.status !== 'fulfilled' || !tagsRes.value.ok) {
      return {
        online: false,
        baseUrl: BASE_URL,
        models: [],
        checkedAt,
        error: 'Ollama /api/tags unreachable',
      };
    }
    const tags = (await tagsRes.value.json()) as { models?: Array<{ name?: string }> };
    const version =
      versionRes.status === 'fulfilled' && versionRes.value.ok
        ? (((await versionRes.value.json()) as { version?: string }).version || undefined)
        : undefined;
    return {
      online: true,
      baseUrl: BASE_URL,
      version,
      models: (tags.models || []).map((m) => m.name || '').filter(Boolean),
      checkedAt,
    };
  } catch (err) {
    return {
      online: false,
      baseUrl: BASE_URL,
      models: [],
      checkedAt,
      error: err instanceof Error ? err.message : 'Ollama probe failed',
    };
  }
}

/** Single-response text generation. JSON mode uses Ollama's structured output. */
export async function generateWithOllama(params: OllamaGenerateOptions): Promise<OllamaGenerateResult> {
  const {
    model,
    prompt,
    system,
    jsonMode = false,
    numCtx = 4096,
    numThread,
    numPredict = 3072,
    temperature = 0.2,
    keepAlive = '2m',
    timeoutMs = 90000,
  } = params;

  if (!model || !prompt.trim()) {
    return { ok: false, text: '', model, error: 'model and prompt are required' };
  }

  try {
    const response = await fetch(`${BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: withTimeout(timeoutMs),
      body: JSON.stringify({
        model,
        prompt,
        system,
        stream: false,
        format: jsonMode ? 'json' : undefined,
        keep_alive: keepAlive,
        options: {
          temperature,
          num_ctx: numCtx,
          num_predict: numPredict,
          ...(numThread ? { num_thread: numThread } : {}),
        },
      }),
    });
    if (!response.ok) {
      return { ok: false, text: '', model, error: `Ollama HTTP ${response.status}` };
    }
    const data = (await response.json()) as { response?: string; error?: string };
    if (data.error) {
      return { ok: false, text: '', model, error: data.error };
    }
    return { ok: true, text: data.response || '', model };
  } catch (err) {
    return {
      ok: false,
      text: '',
      model,
      error: err instanceof Error ? err.message : 'Ollama generation failed',
    };
  }
}

/**
 * Explicit, opt-in model pull. The caller must validate the tag against the
 * curated catalog — this function never builds a URL from untrusted input
 * beyond a JSON body field, and downloads are gated by OMEGA_ALLOW_MODEL_PULL.
 */
export async function pullOllamaModel(name: string, timeoutMs = 600000): Promise<{ ok: boolean; error?: string }> {
  if (process.env.OMEGA_ALLOW_MODEL_PULL !== '1') {
    return { ok: false, error: 'pull disabled — set OMEGA_ALLOW_MODEL_PULL=1' };
  }
  try {
    const response = await fetch(`${BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: withTimeout(timeoutMs),
      body: JSON.stringify({ name, stream: false }),
    });
    if (!response.ok) return { ok: false, error: `Ollama HTTP ${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pull failed' };
  }
}

export const OLLAMA_BASE_URL = BASE_URL;
