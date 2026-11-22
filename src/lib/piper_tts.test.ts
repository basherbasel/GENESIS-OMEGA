import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PiperNeuralVoiceEngine,
  resolveVoiceCacheFile,
  toVoiceAudioUrl,
} from './piper_tts';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omega-piper-'));
}

function writeFakeExecutable(filePath: string, content = 'mock-bin'): void {
  fs.writeFileSync(filePath, content, 'utf-8');
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

function fakeWavRunner(counter: { runs: number; args: string[] }) {
  return async ({ args }: { args: string[] }) => {
    counter.runs += 1;
    counter.args = args;
    const outIndex = args.indexOf('--output_file');
    assert.ok(outIndex >= 0, 'piper command must include --output_file');
    const outputPath = args[outIndex + 1];
    fs.writeFileSync(outputPath, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(160, 1)]));
    return { code: 0 };
  };
}

test('Piper synthesis caches identical Arabic phrases by SHA-256 and maps prosody rate', async () => {
  const tmp = makeTempDir();
  try {
    const fakeBin = path.join(tmp, 'piper.exe');
    const fakeModel = path.join(tmp, 'ar_JO-kareem-medium.onnx');
    writeFakeExecutable(fakeBin);
    fs.writeFileSync(fakeModel, 'mock-onnx', 'utf-8');
    fs.writeFileSync(`${fakeModel}.json`, '{}', 'utf-8');

    const counter = { runs: 0, args: [] as string[] };
    const engine = new PiperNeuralVoiceEngine({
      cacheDir: path.join(tmp, 'cache'),
      baseDir: tmp,
      env: {
        PATH: '',
        OMEGA_PIPER_BIN: fakeBin,
        OMEGA_PIPER_MODEL: fakeModel,
      },
      runner: fakeWavRunner(counter),
    });

    const status = engine.status();
    assert.equal(status.piper_binary_found, true);
    assert.equal(status.arabic_model_found, true);
    assert.equal(status.offline_neural_ready, true);

    const first = await engine.synthesizeWav('أهلاً بك يا هندسة في جينيسيس', { rate: 1.05, pitch: 1.0 });
    const second = await engine.synthesizeWav('أهلاً بك يا هندسة في جينيسيس', { rate: 1.05, pitch: 1.0 });

    assert.ok(first);
    assert.equal(first, second);
    assert.equal(counter.runs, 1, 'cached phrase must not invoke Piper twice');
    assert.ok(first && fs.statSync(first).size > 44);
    assert.ok(first && first.startsWith(path.join(tmp, 'cache')));

    const scaleIndex = counter.args.indexOf('--length-scale');
    assert.ok(scaleIndex >= 0);
    assert.equal(counter.args[scaleIndex + 1], '0.95');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Piper rate conversion clamps excitement and calm speech into a safe length_scale', () => {
  assert.equal(PiperNeuralVoiceEngine.rateToLengthScale(1.02), 0.98);
  assert.equal(PiperNeuralVoiceEngine.rateToLengthScale(0.2), 1.3);
  assert.equal(PiperNeuralVoiceEngine.rateToLengthScale(5), 0.74);
});

test('Piper discovery prefers an Arabic voice and falls back to the first .onnx model', () => {
  const tmp = makeTempDir();
  try {
    const modelDir = path.join(tmp, 'models', 'piper');
    fs.mkdirSync(modelDir, { recursive: true });
    const english = path.join(modelDir, 'en_US-lessac-medium.onnx');
    const arabic = path.join(modelDir, 'ar_JO-kareem-medium.onnx');
    fs.writeFileSync(english, 'en', 'utf-8');
    fs.writeFileSync(arabic, 'ar', 'utf-8');

    const engine = new PiperNeuralVoiceEngine({
      cacheDir: path.join(tmp, 'cache'),
      baseDir: tmp,
      env: { PATH: '' },
    });
    assert.equal(engine.status().model_path, path.resolve(arabic));

    fs.unlinkSync(arabic);
    const fallbackEngine = new PiperNeuralVoiceEngine({
      cacheDir: path.join(tmp, 'cache2'),
      baseDir: tmp,
      env: { PATH: '' },
    });
    assert.equal(fallbackEngine.status().model_path, path.resolve(english));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Voice cache path resolver rejects traversal and non-WAV names', () => {
  const cacheDir = path.resolve('genesis_studio_data', 'voice_cache');
  const valid = resolveVoiceCacheFile(cacheDir, 'piper_0123456789abcdef.wav');
  assert.equal(valid, path.join(cacheDir, 'piper_0123456789abcdef.wav'));

  assert.equal(resolveVoiceCacheFile(cacheDir, '../secret.wav'), null);
  assert.equal(resolveVoiceCacheFile(cacheDir, '..\\secret.wav'), null);
  assert.equal(resolveVoiceCacheFile(cacheDir, 'nested/piper_abc.wav'), null);
  assert.equal(resolveVoiceCacheFile(cacheDir, 'piper_abc.wav.exe'), null);
  assert.equal(resolveVoiceCacheFile(cacheDir, 'piper_abc.mp3'), null);
});

test('Synthesized WAV paths become safe public audio URLs', () => {
  assert.equal(
    toVoiceAudioUrl(path.join('data', 'voice_cache', 'piper_0123456789abcdef.wav')),
    '/api/voice/audio/piper_0123456789abcdef.wav',
  );
  assert.equal(toVoiceAudioUrl(null), null);
  assert.equal(toVoiceAudioUrl(undefined), null);
});

test('Piper failures degrade gracefully to null without throwing', async () => {
  const tmp = makeTempDir();
  try {
    const fakeBin = path.join(tmp, 'piper.exe');
    const fakeModel = path.join(tmp, 'ar_EG-salma-medium.onnx');
    writeFakeExecutable(fakeBin);
    fs.writeFileSync(fakeModel, 'mock-onnx', 'utf-8');

    const engine = new PiperNeuralVoiceEngine({
      cacheDir: path.join(tmp, 'cache'),
      baseDir: tmp,
      env: { PATH: '', OMEGA_PIPER_BIN: fakeBin, OMEGA_PIPER_MODEL: fakeModel },
      runner: async () => ({ code: 1, stderr: 'invalid model configuration' }),
    });

    const wav = await engine.synthesizeWav('اختبار فشل التوليد', { rate: 1.0 });
    assert.equal(wav, null);
    assert.match(engine.status().last_error || '', /invalid model configuration/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
