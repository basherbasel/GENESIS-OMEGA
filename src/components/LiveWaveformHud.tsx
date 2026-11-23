import { t, type Language } from '../lib/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Radio, Send, Sparkles, Volume2, VolumeX, Square } from 'lucide-react';
import { OfflineAudioPlayer } from '../lib/offline_audio_player';
import type {
  MindsetAnalysis,
  NeuralTtsStatus,
  PendingSuggestion,
  VoiceCommandResponse,
  WaveformMode,
} from '../lib/types';

interface LiveWaveformHudProps {
  language: Language;
  activeProjectId: number | null;
  pendingSuggestion: PendingSuggestion | null;
  onVoiceResult: (res: VoiceCommandResponse) => void;
  onConfirmSuggestion: () => Promise<VoiceCommandResponse | null> | VoiceCommandResponse | null | void;
  onDismissSuggestion: () => void;
}



export const LiveWaveformHud: React.FC<LiveWaveformHudProps> = ({
  activeProjectId,
  pendingSuggestion,
  onVoiceResult,
  onConfirmSuggestion,
  onDismissSuggestion,

  language,}) => {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(language, key, vars);

const MODE_LABELS: Record<WaveformMode, string> = {
  idle: tr('hud.idle'),
  listening: tr('hud.listening'),
  thinking: tr('hud.thinking'),
  speaking: tr('hud.speaking'),
};

const QUICK_PROMPTS = [
  { label: tr('hud.quickStatus'), text: tr('hud.promptStatus') },
  { label: tr('hud.quickTool'), text: tr('hud.promptTool') },
  { label: tr('hud.quickPerf'), text: tr('hud.promptPerf') },
  { label: tr('hud.quickDiagrams'), text: tr('hud.promptDiagrams') },
];

  const [mode, setMode] = useState<WaveformMode>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastReply, setLastReply] = useState(
    tr('hud.welcome'),
  );
  const [mindset, setMindset] = useState<MindsetAnalysis>({
    thinkingStyle: 'collaborative_builder',
    thinkingStyleLabel: tr('hud.mindset'),
    emotion: 'calm_human',
    emotionLabel: tr('hud.tone'),
    prosody: { rate: 1.02, pitch: 1.0 },
  });
  const [engineSource, setEngineSource] = useState<string>('deterministic-nlu');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [wakeWordLoop, setWakeWordLoop] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [audioSource, setAudioSource] = useState<'idle' | 'piper' | 'gemini' | 'web-speech'>('idle');
  const [piperReady, setPiperReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<WaveformMode>('idle');
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const piperAudioRef = useRef<HTMLAudioElement | null>(null);
  const offlinePlayerRef = useRef<OfflineAudioPlayer | null>(null);
  const pendingFallbackRef = useRef<{
    text: string;
    prosody: { rate: number; pitch: number };
  } | null>(null);
  const webSpeechFallbackRef = useRef<
    ((text: string, prosody: { rate: number; pitch: number }) => void) | null
  >(null);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const phaseRef = useRef(0);
  const energyRef = useRef(0.18);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/status')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { piper_tts?: NeuralTtsStatus } | null) => {
        if (!cancelled) setPiperReady(Boolean(data?.piper_tts?.offline_neural_ready));
      })
      .catch(() => {
        // status badge is best-effort; voice playback still works
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // High-DPI real-time HTML5 Canvas Waveform & Spectrum Loop (no React setState at 60Hz)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(300, Math.floor(rect.width * dpr));
      const h = Math.max(96, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      resizeCanvas();
      const w = canvas.width;
      const h = canvas.height;
      const midY = h / 2;
      const curMode = modeRef.current;

      ctx.clearRect(0, 0, w, h);

      // Subtle horizon grid line
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      // Compute acoustic energy & spectrum bins
      let avgEnergy = 0.14;
      const bins = 48;
      const spectrum = new Float32Array(bins);

      if (curMode === 'listening' && analyserRef.current && freqDataRef.current) {
        analyserRef.current.getByteFrequencyData(freqDataRef.current);
        const arr = freqDataRef.current;
        const step = Math.max(1, Math.floor(arr.length / bins));
        let sum = 0;
        for (let i = 0; i < bins; i++) {
          const val = arr[Math.min(arr.length - 1, i * step)] / 255;
          spectrum[i] = Math.max(0.08, val);
          sum += val;
        }
        avgEnergy = Math.max(0.18, sum / bins);
      } else if (curMode === 'listening') {
        avgEnergy = 0.45 + 0.18 * Math.sin(phaseRef.current * 1.9);
        for (let i = 0; i < bins; i++) {
          spectrum[i] =
            0.25 +
            0.45 *
              Math.abs(Math.sin(phaseRef.current * 2.1 + i * 0.35)) *
              Math.sin((i / bins) * Math.PI);
        }
      } else if (curMode === 'speaking') {
        avgEnergy = 0.58 + 0.25 * Math.sin(phaseRef.current * 3.1);
        for (let i = 0; i < bins; i++) {
          spectrum[i] =
            0.2 +
            0.7 *
              Math.abs(Math.sin(phaseRef.current * 2.7 + i * 0.42)) *
              Math.sin((i / bins) * Math.PI);
        }
      } else if (curMode === 'thinking') {
        avgEnergy = 0.32;
        for (let i = 0; i < bins; i++) {
          spectrum[i] = 0.16 + 0.28 * Math.abs(Math.cos(phaseRef.current * 1.6 + i * 0.24));
        }
      } else {
        avgEnergy = 0.28 + 0.06 * Math.sin(phaseRef.current * 0.9);
        for (let i = 0; i < bins; i++) {
          spectrum[i] =
            (0.14 + 0.16 * Math.abs(Math.sin(phaseRef.current * 0.85 + i * 0.24))) *
            Math.sin((i / bins) * Math.PI);
        }
      }

      energyRef.current += (avgEnergy - energyRef.current) * 0.16;
      phaseRef.current += curMode === 'idle' ? 0.04 : curMode === 'thinking' ? 0.065 : 0.09;

      const palette =
        curMode === 'speaking'
          ? { primary: '#38bdf8', secondary: 'rgba(14, 165, 233, 0.45)', bar: 'rgba(56, 189, 248, 0.26)' }
          : curMode === 'listening'
            ? { primary: '#2dd4bf', secondary: 'rgba(20, 184, 166, 0.45)', bar: 'rgba(45, 212, 191, 0.28)' }
            : curMode === 'thinking'
              ? { primary: '#fbbf24', secondary: 'rgba(245, 158, 11, 0.45)', bar: 'rgba(251, 191, 36, 0.24)' }
              : { primary: 'rgba(56, 189, 248, 0.65)', secondary: 'rgba(148, 163, 184, 0.3)', bar: 'rgba(56, 189, 248, 0.14)' };

      // Symmetric frequency spectrum bars
      const barWidth = Math.max(2, (w / bins) * 0.45);
      const slot = w / bins;
      ctx.fillStyle = palette.bar;
      for (let i = 0; i < bins; i++) {
        const barH = spectrum[i] * (h * 0.68);
        const x = i * slot + (slot - barWidth) / 2;
        ctx.fillRect(x, midY - barH / 2, barWidth, barH);
      }

      // Dual harmonic sinusoidal wave layers
      const layers = [
        { ampScale: 1, freq: 2.8, speed: 1, stroke: palette.primary, width: 2.2 },
        { ampScale: 0.62, freq: 4.5, speed: -1.35, stroke: palette.secondary, width: 1.5 },
      ];

      for (const layer of layers) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.width;
        ctx.beginPath();
        const maxAmp = h * 0.38 * energyRef.current * layer.ampScale;
        const points = 120;
        for (let i = 0; i <= points; i++) {
          const t = i / points;
          const x = t * w;
          const envelope = Math.sin(t * Math.PI);
          const wave =
            Math.sin(t * Math.PI * layer.freq * 2 + phaseRef.current * layer.speed) *
            Math.cos(t * Math.PI * 1.5 - phaseRef.current * 0.7);
          const y = midY + wave * maxAmp * envelope;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  const stopAllSpeech = useCallback(() => {
    pendingFallbackRef.current = null;
    offlinePlayerRef.current?.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (modeRef.current === 'speaking') {
      setMode('idle');
    }
  }, []);

  const getOfflinePlayer = useCallback(() => {
    if (!offlinePlayerRef.current) {
      offlinePlayerRef.current = new OfflineAudioPlayer(piperAudioRef.current, {
        onEnded: () => {
          pendingFallbackRef.current = null;
          if (modeRef.current === 'speaking') setMode('idle');
        },
        onError: () => {
          const pending = pendingFallbackRef.current;
          pendingFallbackRef.current = null;
          if (pending && webSpeechFallbackRef.current) {
            webSpeechFallbackRef.current(pending.text, pending.prosody);
          } else if (modeRef.current === 'speaking') {
            setMode('idle');
          }
        },
      });
    } else if (piperAudioRef.current) {
      offlinePlayerRef.current.attach(piperAudioRef.current);
    }
    return offlinePlayerRef.current;
  }, []);

  const stopMicrophone = () => {
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignored
      }
      speechRecRef.current = null;
    }
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    freqDataRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (modeRef.current === 'listening') {
      setMode('idle');
    }
  };

  useEffect(() => {
    return () => {
      stopAllSpeech();
      stopMicrophone();
    };
  }, [stopAllSpeech]);

  const fallbackWebSpeech = (text: string, prosody: { rate: number; pitch: number }) => {
    setAudioSource('web-speech');
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      synth.cancel();

      const isArabic = /[\u0600-\u06FF]/.test(text);
      const chunks = text
        .split(/(?<=[.!?؟،؛:])\s+/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
      const parts = chunks.length > 0 ? chunks : [text.trim()];
      const arabicVoice = synth.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('ar'));

      const speakChunk = (index: number) => {
        if (index >= parts.length) {
          if (modeRef.current === 'speaking') setMode('idle');
          return;
        }
        if (modeRef.current !== 'speaking') return;

        const utter = new SpeechSynthesisUtterance(parts[index]);
        utter.lang = isArabic ? 'ar-SA' : 'en-US';
        utter.rate = Math.max(0.75, Math.min(1.4, prosody.rate));
        utter.pitch = Math.max(0.75, Math.min(1.3, prosody.pitch));
        if (arabicVoice && isArabic) utter.voice = arabicVoice;
        utter.onend = () => {
          if (modeRef.current !== 'speaking') return;
          // A short breath between sentences keeps Arabic speech natural.
          setTimeout(() => speakChunk(index + 1), 180);
        };
        utter.onerror = () => {
          if (modeRef.current === 'speaking') setMode('idle');
        };
        synth.speak(utter);
      };

      speakChunk(0);
      setTimeout(() => {
        if (modeRef.current === 'speaking') setMode('idle');
      }, Math.min(60_000, Math.max(3_000, text.length * 110)));
    } else {
      setTimeout(() => {
        if (modeRef.current === 'speaking') setMode('idle');
      }, 1500);
    }
  };

  // Keep the latest fallback available to the audio error hook so a WAV that
  // fails mid-playback still continues with the browser voice.
  webSpeechFallbackRef.current = fallbackWebSpeech;

  const speakResponse = async (
    text: string,
    prosody: { rate: number; pitch: number },
  ) => {
    if (!ttsEnabled || !text.trim()) {
      if (modeRef.current === 'speaking') setMode('idle');
      return;
    }
    stopAllSpeech();
    setMode('speaking');

    try {
      const resp = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, prosody }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          audioBase64?: string;
          audioUrl?: string;
          mimeType?: string;
          engine?: 'piper-neural-offline' | 'gemini-neural-cloud';
          neural_tts?: NeuralTtsStatus;
        };
        if (data.neural_tts) setPiperReady(Boolean(data.neural_tts.offline_neural_ready));
        const audioUrl =
          data.audioUrl ||
          (data.audioBase64 ? `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}` : '');
        if (audioUrl) {
          setAudioSource(data.engine === 'piper-neural-offline' ? 'piper' : 'gemini');
          pendingFallbackRef.current = { text, prosody };
          const played = await getOfflinePlayer().play(audioUrl);
          if (played) return;
          // The error hook or a barge-in may have already handled this request.
          if (!pendingFallbackRef.current) return;
          pendingFallbackRef.current = null;
        }
      } else {
        const errData = (await resp.json().catch(() => null)) as { neural_tts?: NeuralTtsStatus } | null;
        if (errData?.neural_tts) setPiperReady(Boolean(errData.neural_tts.offline_neural_ready));
      }
    } catch {
      // fall through to Web Speech API fallback
    }

    pendingFallbackRef.current = null;
    fallbackWebSpeech(text, prosody);
  };

  const playHumanVoice = async (data: VoiceCommandResponse) => {
    if (!ttsEnabled) {
      setMode('idle');
      return;
    }
    stopAllSpeech();
    if (data.neural_tts) setPiperReady(Boolean(data.neural_tts.offline_neural_ready));

    // Tier 1: local Piper WAV produced and cached by the server.
    if (data.audio_url) {
      setMode('speaking');
      setAudioSource('piper');
      const spoken = data.spokenReply || '';
      const prosody = data.prosody || { rate: 1.02, pitch: 1.0 };
      pendingFallbackRef.current = { text: spoken, prosody };
      const played = await getOfflinePlayer().play(data.audio_url);
      if (played) return;

      // The error hook or a barge-in may have already handled this request.
      if (!pendingFallbackRef.current) return;
      // The file existed but the browser refused playback (autoplay policy).
      // Go straight to the browser voice instead of asking the server again.
      pendingFallbackRef.current = null;
      fallbackWebSpeech(spoken, prosody);
      return;
    }

    // Tier 2: server TTS bridge (Piper/Gemini) then Tier 3: Web Speech API.
    await speakResponse(data.spokenReply || '', data.prosody || { rate: 1.02, pitch: 1.0 });
  };

  const sendCommand = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean || submitting) return;
    stopAllSpeech();
    setSubmitting(true);
    setMode('thinking');
    setMicNote(null);

    try {
      const resp = await fetch('/api/voice/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: clean, activeProjectId }),
      });
      const data = (await resp.json()) as VoiceCommandResponse & { error?: string };
      if (!resp.ok) {
        setLastReply(data.error || tr('hud.commandError'));
        setMode('idle');
        return;
      }

      setLastReply(data.spokenReply);
      setMindset(data.mindset);
      setEngineSource(data.engineSource);
      setTranscript('');
      onVoiceResult(data);

      if (ttsEnabled) {
        void playHumanVoice(data);
      } else {
        setMode('idle');
      }
    } catch (err) {
      setLastReply(err instanceof Error ? err.message : tr('hud.voiceConnectError'));
      setMode('idle');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMicrophone = async () => {
    // Barge-In: stop Piper WAV, Gemini audio, and Web Speech before recording.
    stopAllSpeech();
    if (mode === 'listening') {
      stopMicrophone();
      return;
    }

    setMicNote(null);
    setMode('listening');

    // Attempt Web Audio AnalyserNode mic capture
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      } else {
        setMicNote(tr('hud.listeningSim'));
      }
    } catch {
      setMicNote(tr('hud.micFallback'));
    }

    // Attach browser Web SpeechRecognition if supported
    const Win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };
    const SpeechRec = Win.SpeechRecognition || Win.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = language === 'ar' ? 'ar-EG' : 'en-US';
        rec.interimResults = true;
        rec.continuous = wakeWordLoop;
        rec.onresult = (ev) => {
          const last = ev.results[ev.results.length - 1];
          const text = last?.[0]?.transcript || '';
          setTranscript(text);
          if (last?.isFinal && text.trim()) {
            const hasWake = /^(?:يا\s+جينيسيس|يا\s+أوميجا|جينيسيس|أوميجا)/i.test(text.trim());
            if (!wakeWordLoop || hasWake) {
              stopMicrophone();
              void sendCommand(text);
            }
          }
        };
        rec.onerror = () => {};
        rec.onend = () => {
          if (wakeWordLoop && modeRef.current === 'listening') {
            try {
              rec.start();
            } catch {
              // ignored
            }
          }
        };
        rec.start();
        speechRecRef.current = rec;
      } catch {
        // ignored
      }
    }
  };

  return (
    <section
      data-testid="waveform-hud"
      data-waveform-mode={mode}
      aria-label={tr('hud.aria')}
      className="border-b border-slate-800 bg-slate-900/75"
    >
      <audio
        id="piperAudioPlayer"
        ref={piperAudioRef}
        className="hidden"
        preload="auto"
        aria-hidden="true"
      />
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center">
          {/* Canvas Acoustic Spectrum Visualizer (7 cols) */}
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-slate-100">{tr('hud.title')}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span
                  data-testid="waveform-mode-label"
                  className={
                    mode === 'listening'
                      ? 'text-teal-400 font-medium'
                      : mode === 'speaking'
                        ? 'text-sky-400 font-medium'
                        : mode === 'thinking'
                          ? 'text-amber-400 font-medium'
                          : 'text-slate-400'
                  }
                >
                  {MODE_LABELS[mode]}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400 tabular-nums">
                  {engineSource === 'gemini-cognitive' ? 'Gemini Cognitive' : tr('hud.localNlu')}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span
                  data-testid="voice-engine-label"
                  title={
                    piperReady
                      ? tr('hud.piperReadyTitle')
                      : tr('hud.piperWaitTitle')
                  }
                  className={
                    audioSource === 'piper'
                      ? 'text-emerald-400 font-medium'
                      : audioSource === 'gemini'
                        ? 'text-sky-400'
                        : 'text-slate-400'
                  }
                >
                  {audioSource === 'piper'
                    ? tr('hud.piperNeural')
                    : audioSource === 'gemini'
                      ? 'Gemini TTS'
                      : audioSource === 'web-speech'
                        ? 'Web Speech'
                        : piperReady
                          ? tr('hud.piperReady')
                          : 'Web Speech'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWakeWordLoop((v) => !v)}
                  aria-pressed={wakeWordLoop}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    wakeWordLoop
                      ? 'border-teal-500/60 bg-teal-500/10 text-teal-300'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('hud.wakeWord')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (ttsEnabled) stopAllSpeech();
                    setTtsEnabled((v) => !v);
                  }}
                  aria-label={ttsEnabled ? tr('hud.muteAria') : tr('hud.unmuteAria')}
                  aria-pressed={ttsEnabled}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    ttsEnabled
                      ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ttsEnabled ? (
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{ttsEnabled ? tr('hud.speechOn') : tr('hud.muted')}</span>
                </button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/90 p-2">
              <canvas
                ref={canvasRef}
                data-testid="waveform-canvas"
                className="block h-24 w-full"
              />
              {micNote && (
                <p className="mt-1 px-2 text-xs text-amber-300/90">{micNote}</p>
              )}
            </div>
          </div>

          {/* Cognitive Dialogue + Voice Input + Barge-In Controls (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-2.5">
            {/* Cognitive Mindset & Emotion Readout (unboxed typographic metadata) */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-slate-300 font-medium">{tr('hud.thinkingStyle', { label: mindset.thinkingStyleLabel })}</span>
              <span aria-hidden="true">·</span>
              <span>{tr('hud.emotion', { label: mindset.emotionLabel })}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                rate {mindset.prosody.rate.toFixed(2)}
              </span>
            </div>

            {/* Spoken Assistant Reply */}
            <div
              data-testid="voice-reply-box"
              className="rounded-lg border border-slate-800 bg-slate-950/75 px-3.5 py-2.5 text-sm leading-relaxed text-slate-200"
            >
              {lastReply}
            </div>

            {/* Pending Suggestion Confirmation Bar */}
            {pendingSuggestion && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                  <span>{tr('hud.suggestion', { action: pendingSuggestion.action })} {tr('hud.suggestionAsk')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        const data = await onConfirmSuggestion();
                        if (!data) return;
                        setLastReply(data.spokenReply);
                        setMindset(data.mindset);
                        setEngineSource(data.engineSource);
                        if (ttsEnabled) void playHumanVoice(data);
                      })();
                    }}
                    className="rounded bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
                  >
                    {tr('hud.confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={onDismissSuggestion}
                    className="rounded border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    {tr('hud.dismiss')}
                  </button>
                </div>
              </div>
            )}

            {/* Voice Command Input & Mic / Barge-In Buttons */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendCommand(transcript);
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => void toggleMicrophone()}
                aria-label={mode === 'listening' ? tr('hud.stopListening') : tr('hud.startListening')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'listening'
                    ? 'bg-teal-500 text-slate-950 hover:bg-teal-400'
                    : 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                }`}
              >
                {mode === 'listening' ? (
                  <MicOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{mode === 'listening' ? tr('hud.stop') : tr('hud.speak')}</span>
              </button>

              {mode === 'speaking' && (
                <button
                  type="button"
                  onClick={stopAllSpeech}
                  aria-label={tr('hud.interruptAria')}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/50 bg-amber-500/15 px-2.5 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/25 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('hud.interrupt')}</span>
                </button>
              )}

              <label htmlFor="voice-command-input" className="sr-only">
                {tr('hud.inputAria')}
              </label>
              <input
                id="voice-command-input"
                type="text"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={tr('hud.inputPlaceholder')}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />

              <button
                type="submit"
                disabled={submitting || !transcript.trim()}
                aria-label={tr('hud.sendAria')}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-white disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('hud.send')}</span>
              </button>
            </form>

            {/* Quick Suggested Prompts */}
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => void sendCommand(q.text)}
                  className="rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-slate-700 hover:text-cyan-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
