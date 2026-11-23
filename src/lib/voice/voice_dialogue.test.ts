import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PiperNeuralVoiceEngine } from '../piper_tts';
import type { ExecutionVerifySummary } from '../types';
import type { LocalTextSynthesisOutput } from '../local_synthesis';
import {
  detectSpokenLanguage,
  extractSpokenReply,
  processVoiceDialogue,
  routeVoiceIntent,
  type VoiceDialogueDeps,
  type VoiceDialogueEvent,
  type VoiceWorkOrderApi,
} from './voice_dialogue';
import {
  cleanTranscript,
  OfflineSttError,
  resolveOfflineStt,
  transcribeOfflineAudio,
} from './offline_stt';
import { sanitizeChildEnv } from './voice_process';

const verifySummary: ExecutionVerifySummary = {
  ranRealTests: true,
  runtime: 'node',
  testsExecuted: 1,
  testsPassed: 1,
  redTeamPassed: true,
  exitCode: 0,
  outputSnippet: 'ok',
};

function workOrders(): VoiceWorkOrderApi & { runs: string[] } {
  const runs: string[] = [];
  return {
    runs,
    create: (input) => {
      assert.ok(input.problemStatement.length > 3);
      return { id: 'wo-test-1', departmentIds: ['qa-os-verification'] };
    },
    run: async (id) => {
      runs.push(id);
      return { id, stage: 'VERIFIED_COMMIT', finalScore: 97 };
    },
    list: () => [{ id: 'wo-test-1', stage: 'VERIFIED_COMMIT', title: 'fixture' }],
  };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omega-voice-test-'));
}

test('Unicode analysis detects Egyptian/MSA Arabic and English deterministically', () => {
  assert.equal(detectSpokenLanguage('يا جينيسيس ما حالة النظام والذاكرة؟'), 'ar');
  assert.equal(detectSpokenLanguage('أصلح المشروع رقم 1'), 'ar');
  assert.equal(detectSpokenLanguage('Genesis, audit the repository at ./demo'), 'en');
  assert.equal(detectSpokenLanguage('Heal project 1'), 'en');
  assert.equal(detectSpokenLanguage(''), 'en');
});

test('bilingual intent router selects real executable intents', () => {
  assert.equal(routeVoiceIntent('يا جينيسيس ابنِ نظام فواتير', 'ar'), 'work_order');
  assert.equal(routeVoiceIntent('Genesis, build a REST API service', 'en'), 'work_order');
  assert.equal(routeVoiceIntent('افحص المشروع في /tmp/demo', 'ar'), 'repo_audit');
  assert.equal(routeVoiceIntent('Audit and harden repository at /tmp/demo', 'en'), 'repo_harden');
  assert.equal(routeVoiceIntent('أصلح المشروع رقم 1', 'ar'), 'heal_project');
  assert.equal(routeVoiceIntent('Heal project 1', 'en'), 'heal_project');
  assert.equal(routeVoiceIntent('switch language to English', 'en'), 'switch_language');
  assert.equal(routeVoiceIntent('ما حالة الأدوات والبيئة؟', 'ar'), 'doctor_status');
  assert.equal(routeVoiceIntent('list work orders', 'en'), 'summarize_orders');
  assert.equal(routeVoiceIntent('how do I design a safe queue?', 'en'), 'dialogue');
});

test('Arabic and English work-order intents execute the real engine and broadcast voice events', async () => {
  const events: VoiceDialogueEvent[] = [];
  for (const utterance of ['يا جينيسيس ابنِ نظام فواتير', 'Genesis, build an API service']) {
    const orders = workOrders();
    const deps: VoiceDialogueDeps = {
      workOrders: orders,
      onEvent: (event) => events.push(event),
    };
    const result = await processVoiceDialogue({ transcript: utterance }, deps);
    assert.equal(result.intent, 'work_order');
    assert.equal(result.actionExecuted, true);
    assert.equal(result.actionResult?.id, 'wo-test-1');
    assert.deepEqual(orders.runs, ['wo-test-1']);
    assert.ok(result.replyText.length > 10);
    assert.equal(result.errorCode, undefined);
  }
  assert.ok(events.filter((event) => event.type === 'voice.dialogue').length >= 2);
});

test('repository intents validate paths before any file is read, and fail closed', async () => {
  const calls: string[] = [];
  const deps: VoiceDialogueDeps = {
    repo: {
      audit: async (repoPath) => {
        calls.push(repoPath);
        return { status: 'audited' };
      },
      evolve: async (repoPath, mode) => {
        calls.push(`${repoPath}:${mode}`);
        return { status: 'promoted' };
      },
    },
  };

  const missing = await processVoiceDialogue({ transcript: 'افحص المستودع' }, deps);
  assert.equal(missing.errorCode, 'REPO_PATH_MISSING');
  assert.equal(missing.actionExecuted, false);

  const unsafe = await processVoiceDialogue({ transcript: 'Audit repository at C:\\Windows\\System32' }, deps);
  assert.equal(unsafe.errorCode, 'UNSAFE_REPO_PATH');
  assert.equal(unsafe.actionExecuted, false);

  const repo = tempDir();
  try {
    const audit = await processVoiceDialogue({ transcript: `Audit repository at "${repo}"` }, deps);
    assert.equal(audit.actionExecuted, true);
    assert.equal(audit.errorCode, undefined);
    assert.equal(calls[0], fs.realpathSync(repo));

    const harden = await processVoiceDialogue({ transcript: `حصّن المشروع في "${repo}"` }, deps);
    assert.equal(harden.actionExecuted, true);
    assert.equal(calls[1], `${fs.realpathSync(repo)}:harden-only`);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('heal, doctor and language intents execute without cloud or fabricated results', async () => {
  const healed: number[] = [];
  let switched: string | null = null;
  const deps: VoiceDialogueDeps = {
    healProject: async (id) => {
      healed.push(id);
      return { attempts: 2, finalScore: 97 };
    },
    doctorSummary: () => 'Node ok; Ollama online',
    switchLanguage: (lang) => {
      switched = lang;
    },
  };

  const heal = await processVoiceDialogue({ transcript: 'أصلح المشروع رقم 4' }, deps);
  assert.equal(heal.intent, 'heal_project');
  assert.equal(heal.actionExecuted, true);
  assert.deepEqual(healed, [4]);

  const doctor = await processVoiceDialogue({ transcript: 'ما حالة الأدوات؟' }, deps);
  assert.equal(doctor.actionExecuted, true);
  assert.match(String(doctor.actionResult?.summary), /Ollama online/);

  const language = await processVoiceDialogue({ transcript: 'switch language to Arabic' }, deps);
  assert.equal(language.actionExecuted, true);
  assert.equal(language.actionResult?.uiLanguage, 'ar');
  assert.equal(switched, 'ar');
  assert.equal(language.lang, 'ar');
});

test('general dialogue uses the guarded bridge with a language-matched prompt and bounded sampling', async () => {
  const prompts: Array<{ system?: string; numCtx?: number; numPredict?: number; model: string }> = [];
  const deps: VoiceDialogueDeps = {
    installedModels: new Set(['qwen2.5-coder:1.5b']),
    synthesizeText: async (params) => {
      prompts.push(params);
      return {
        engine: 'ollama-bridge',
        modelUsed: params.model,
        text: JSON.stringify({ reply: params.system?.includes('العربية') ? 'إجابة عربية مختصرة' : 'A short English answer' }),
      } satisfies LocalTextSynthesisOutput;
    },
  };

  const ar = await processVoiceDialogue({ transcript: 'كيف أصمم طابوراً آمناً؟' }, deps);
  assert.equal(ar.lang, 'ar');
  assert.equal(ar.replyText, 'إجابة عربية مختصرة');
  assert.equal(ar.actionExecuted, false);
  assert.equal(prompts[0].model, 'qwen2.5-coder:1.5b');
  assert.ok((prompts[0].numCtx || 0) <= 4096);
  assert.ok((prompts[0].numPredict || 0) <= 256);

  const en = await processVoiceDialogue({ transcript: 'How do I design a safe queue?' }, deps);
  assert.equal(en.lang, 'en');
  assert.equal(en.replyText, 'A short English answer');
  assert.match(prompts[1].system || '', /English/);
  assert.equal(extractSpokenReply('{"reply":"ok"}'), 'ok');
});

test('bridge failures close with an explicit code and never become a cloud fallback', async () => {
  const deps: VoiceDialogueDeps = {
    synthesizeText: async () => ({
      engine: 'ollama-bridge',
      modelUsed: 'qwen2.5-coder:1.5b',
      text: '',
      errorCode: 'MODEL_NOT_FOUND',
      error: 'model missing',
    }),
  };
  const result = await processVoiceDialogue({ transcript: 'Explain transactions', preferredLang: 'en' }, deps);
  assert.equal(result.errorCode, 'MODEL_NOT_FOUND');
  assert.equal(result.actionExecuted, false);
  assert.match(result.replyText, /local model/i);

  const empty = await processVoiceDialogue(
    { transcript: 'Explain transactions', preferredLang: 'en' },
    {
      synthesizeText: async () => ({
        engine: 'ollama-bridge',
        modelUsed: 'qwen2.5-coder:1.5b',
        text: '{"reply":""}',
      }),
    },
  );
  assert.equal(empty.errorCode, 'EMPTY_LOCAL_REPLY');
});

test('Piper discovers and selects Arabic and English voices with sanitized child env', async () => {
  const dir = tempDir();
  try {
    const bin = path.join(dir, 'piper');
    fs.writeFileSync(bin, 'mock');
    if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
    const ar = path.join(dir, 'ar_JO-kareem-medium.onnx');
    const en = path.join(dir, 'en_US-amy-medium.onnx');
    fs.writeFileSync(ar, 'mock');
    fs.writeFileSync(en, 'mock');

    const seen: Array<{ args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const engine = new PiperNeuralVoiceEngine({
      baseDir: dir,
      cacheDir: path.join(dir, 'cache'),
      env: {
        PATH: '',
        OMEGA_PIPER_BIN: bin,
        OMEGA_PIPER_MODEL_AR: ar,
        OMEGA_PIPER_MODEL_EN: en,
        GEMINI_API_KEY: 'must-not-reach-child',
      },
      runner: async (request) => {
        seen.push(request);
        const outIndex = request.args.indexOf('--output_file');
        const output = request.args[outIndex + 1];
        fs.writeFileSync(output, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(160, 1)]));
        return { code: 0 };
      },
    });

    const status = engine.status();
    assert.equal(status.arabic_model_found, true);
    assert.equal(status.english_model_found, true);
    assert.equal(status.bilingual_ready, true);

    const arWav = await engine.synthesizeWav('مرحباً', undefined, 'ar');
    const enWav = await engine.synthesizeWav('hello', undefined, 'en');
    assert.ok(arWav && enWav);
    assert.ok(seen.some((call) => call.args.includes(ar)));
    assert.ok(seen.some((call) => call.args.includes(en)));
    assert.ok(seen.every((call) => call.env?.GEMINI_API_KEY === undefined));

    assert.equal(sanitizeChildEnv({ GEMINI_API_KEY: 'x', OMEGA_TOKEN: 'y', PATH: '/bin' }).GEMINI_API_KEY, undefined);
    assert.equal(sanitizeChildEnv({ GEMINI_API_KEY: 'x', OMEGA_TOKEN: 'y', PATH: '/bin' }).PATH, '/bin');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('offline STT fails closed without configuration and rejects oversized or unknown payloads', async () => {
  assert.equal(resolveOfflineStt({}), null);
  await assert.rejects(
    () => transcribeOfflineAudio({ audioBase64: Buffer.from('audio').toString('base64') }, null),
    (err: unknown) => err instanceof OfflineSttError && err.code === 'STT_NOT_CONFIGURED',
  );

  const config = resolveOfflineStt({ OMEGA_WHISPER_BIN: process.execPath, OMEGA_WHISPER_ARGS: '-e,console.log("hello world")' });
  assert.ok(config);
  const good = await transcribeOfflineAudio(
    { audioBase64: Buffer.from('audio').toString('base64'), mimeType: 'audio/wav' },
    config,
  );
  assert.equal(good.transcript, 'hello world');
  assert.equal(good.engine, 'whisper');

  await assert.rejects(
    () => transcribeOfflineAudio({ audioBase64: '!!!', mimeType: 'audio/wav' }, config),
    (err: unknown) => err instanceof OfflineSttError && err.code === 'STT_BAD_PAYLOAD',
  );
  assert.equal(cleanTranscript('[00:00:00.000 --> 00:00:01.000] hello\nthere'), 'hello there');
});

test('voice converse contract returns the bilingual response envelope used by the HTTP route', async () => {
  const orders = workOrders();
  const result = await processVoiceDialogue(
    { transcript: 'list work orders', preferredLang: 'en' },
    { workOrders: orders, doctorSummary: () => 'ok' },
  );
  const envelope = {
    ...result,
    audioUrl: null,
    ttsEngine: 'web-speech',
    piper_tts: { offline_neural_ready: false },
    at: new Date().toISOString(),
  };
  assert.equal(envelope.lang, 'en');
  assert.equal(envelope.intent, 'summarize_orders');
  assert.equal(envelope.actionExecuted, true);
  assert.equal(typeof envelope.replyText, 'string');
  assert.ok(envelope.replyText.includes('1'));
  assert.equal(typeof envelope.ttsEngine, 'string');
});

test('v3 voice intents report blast radius, ledger integrity and taint findings in both languages', async () => {
  assert.equal(routeVoiceIntent('ما تأثير تعديل ملف repo_indexer.ts؟', 'ar'), 'graph_blast');
  assert.equal(routeVoiceIntent('What is the blast radius of repo_indexer.ts?', 'en'), 'graph_blast');
  assert.equal(routeVoiceIntent('افحص سلامة سجل التدقيق', 'ar'), 'ledger_verify');
  assert.equal(routeVoiceIntent('Verify audit ledger integrity', 'en'), 'ledger_verify');
  assert.equal(routeVoiceIntent('taint scan at /repo', 'en'), 'taint_scan');

  let graphFile: string | undefined;
  const deps: VoiceDialogueDeps = {
    graph: async (targetFile) => {
      graphFile = targetFile;
      return { cycles: 1, nodes: 12, direct: 2, transitive: 3, files: ['a.ts', 'b.ts'] };
    },
    ledger: async () => ({ valid: true, entries: 7, detail: 'hash chain intact' }),
    taint: async (repoPath) => {
      assert.ok(repoPath);
      return { findings: 2, cwes: ['CWE-78', 'CWE-89'] };
    },
  };

  const ar = await processVoiceDialogue({ transcript: 'ما تأثير تعديل ملف repo_indexer.ts؟' }, deps);
  assert.equal(ar.intent, 'graph_blast');
  assert.equal(graphFile, 'repo_indexer.ts');
  assert.equal(ar.actionExecuted, true);
  assert.match(ar.replyText, /يؤثر|تأثير/);

  const en = await processVoiceDialogue({ transcript: 'Verify audit ledger integrity', preferredLang: 'en' }, deps);
  assert.equal(en.intent, 'ledger_verify');
  assert.match(en.replyText, /audit ledger/i);

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-voice-taint-'));
  try {
    const taint = await processVoiceDialogue({ transcript: `taint scan at "${repo}"`, preferredLang: 'en' }, deps);
    assert.equal(taint.intent, 'taint_scan');
    assert.ok(taint.replyText.includes('CWE-78'));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
