import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { isSafeRelativePath } from './security';
import { isLocalModelId } from './routing';
import { generateWithOllama } from './ollama_client';
import { resolveGeminiTextModel } from './gemini_models';
import type { EcosystemMeta, GovernorStats, ModelRoutingConfig, VaultEntry } from './types';

export interface SynthesisOutput {
  usedGemini: boolean;
  usedLocal: boolean;
  engine: 'gemini' | 'ollama' | 'none';
  modelUsed?: string;
  generatedFiles: Record<string, string>;
  architectureSummary?: string;
  error?: string;
}

/** Backwards-compatible alias for existing callers. */
export type GeminiSynthesisOutput = SynthesisOutput;

export interface SynthesisParams {
  title: string;
  prompt: string;
  eco: EcosystemMeta;
  routing: ModelRoutingConfig;
  vault: VaultEntry[];
  governor?: GovernorStats;
}

const SYSTEM_INSTRUCTION =
  'You are the GENESIS-OMEGA multi-agent code synthesizer. Produce clean, secure, dependency-free standard library code and runnable unit tests (Python unittest or Node node:test). Never include hardcoded secrets, eval, exec, os.system, or subprocess shell=True. Return JSON only.';

function buildVaultSummary(vault: VaultEntry[]): string {
  return (
    vault
      .slice(0, 4)
      .map((v) => `- ${v.domain}: ${v.verifiedWisdom}`)
      .join('\n') || 'Use SQLite WAL, parameterized queries, zero eval/exec, /health endpoint'
  );
}

function buildRequirements(params: SynthesisParams): string {
  return [
    `Project Title: ${params.title}`,
    `Ecosystem: ${params.eco.displayName} (entry: ${params.eco.entryFile})`,
    `Requirements: ${params.prompt}`,
    `Knowledge Vault Rules:\n${buildVaultSummary(params.vault)}`,
    'Generate production-ready core module(s) and unit tests using standard library only (no pip/npm external dependencies) so tests execute immediately in a clean container.',
  ].join('\n\n');
}

/** Validate and bound whatever a model returned before it touches the project. */
function collectGeneratedFiles(raw: unknown): Record<string, string> {
  const generatedFiles: Record<string, string> = {};
  if (!Array.isArray(raw)) return generatedFiles;
  for (const item of raw.slice(0, 40)) {
    const entry = item as { path?: unknown; content?: unknown };
    if (typeof entry?.path !== 'string' || typeof entry?.content !== 'string') continue;
    const safe = isSafeRelativePath(entry.path);
    const content = entry.content.trimEnd();
    if (safe && content.length > 0 && content.length <= 120_000) {
      generatedFiles[safe] = content + '\n';
    }
  }
  return generatedFiles;
}

/** Dispatch to the real local Ollama runtime or the Gemini API by role model. */
export async function synthesizeProject(params: SynthesisParams): Promise<SynthesisOutput> {
  const builder = params.routing.builder_alpha;
  if (isLocalModelId(builder)) return synthesizeProjectWithLocal(params);
  return synthesizeProjectWithGemini(params);
}

export async function synthesizeProjectWithGemini(params: SynthesisParams): Promise<SynthesisOutput> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return { usedGemini: false, usedLocal: false, engine: 'none', generatedFiles: {} };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const model = resolveGeminiTextModel(params.routing.builder_alpha);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildRequirements(params),
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            architectureSummary: { type: Type.STRING },
            files: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { path: { type: Type.STRING }, content: { type: Type.STRING } },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as {
      architectureSummary?: string;
      files?: unknown;
    };
    const generatedFiles = collectGeneratedFiles(parsed.files);
    return {
      usedGemini: Object.keys(generatedFiles).length > 0,
      usedLocal: false,
      engine: 'gemini',
      modelUsed: model,
      generatedFiles,
      architectureSummary: parsed.architectureSummary,
    };
  } catch (err) {
    return {
      usedGemini: false,
      usedLocal: false,
      engine: 'gemini',
      modelUsed: model,
      generatedFiles: {},
      error: err instanceof Error ? err.message : 'Gemini synthesis upstream error',
    };
  }
}

/** Real offline generation through the local Ollama runtime. */
export async function synthesizeProjectWithLocal(params: SynthesisParams): Promise<SynthesisOutput> {
  const model = params.routing.builder_alpha;
  const result = await generateWithOllama({
    model,
    system: SYSTEM_INSTRUCTION,
    prompt: `${buildRequirements(params)}\n\nReturn STRICT JSON: {"architectureSummary": string, "files": [{"path": string, "content": string}]}`,
    jsonMode: true,
    numCtx: params.governor?.ollamaTuning.numCtx ?? 4096,
    numThread: params.governor?.ollamaTuning.numThread,
    keepAlive: params.governor?.ollamaTuning.keepAlive ?? '2m',
    numPredict: 3072,
  });

  if (!result.ok) {
    return {
      usedGemini: false,
      usedLocal: false,
      engine: 'ollama',
      modelUsed: model,
      generatedFiles: {},
      error: result.error,
    };
  }

  try {
    const parsed = JSON.parse(result.text) as { architectureSummary?: string; files?: unknown };
    const generatedFiles = collectGeneratedFiles(parsed.files);
    return {
      usedGemini: false,
      usedLocal: Object.keys(generatedFiles).length > 0,
      engine: 'ollama',
      modelUsed: model,
      generatedFiles,
      architectureSummary: parsed.architectureSummary,
    };
  } catch (err) {
    return {
      usedGemini: false,
      usedLocal: false,
      engine: 'ollama',
      modelUsed: model,
      generatedFiles: {},
      error: err instanceof Error ? `Invalid local model JSON: ${err.message}` : 'Invalid local model JSON',
    };
  }
}
