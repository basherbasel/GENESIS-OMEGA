// Optional offline Vosk STT adapter. Loaded only when OMEGA_VOSK_MODEL is set.
// Never contacts a network service; fails closed when the `vosk` package is absent.
import fs from 'node:fs';

const [modelPath, audioPath] = process.argv.slice(2);
if (!modelPath || !audioPath || !fs.existsSync(audioPath)) {
  console.error('VOSK_BAD_ARGS');
  process.exit(1);
}

try {
  const vosk = await import('vosk');
  const model = new vosk.Model(modelPath);
  const wav = fs.readFileSync(audioPath);
  const recognizer = new vosk.Recognizer({ model, sampleRate: 16000 });
  recognizer.acceptWaveform(wav);
  console.log(recognizer.result().text || '');
  recognizer.free();
  model.free();
} catch (error) {
  console.error(`VOSK_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
