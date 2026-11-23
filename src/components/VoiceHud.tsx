import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, Mic, MicOff, Send, Square, Volume2 } from 'lucide-react';
import { t, type Language } from '../lib/i18n';

type VoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'executing' | 'error';
type VoiceChoice = 'auto' | Language;

interface Turn {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  errorCode?: string;
}

interface ConverseResponse {
  replyText: string;
  lang: Language;
  intent: string;
  actionExecuted: boolean;
  audioUrl: string | null;
  ttsEngine: string;
  errorCode?: string;
  actionResult?: { uiLanguage?: Language } | null;
}

interface VoiceHudProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  activeProjectId?: number | null;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export const VoiceHud: React.FC<VoiceHudProps> = ({ language, onLanguageChange, activeProjectId }) => {
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const [voiceLang, setVoiceLang] = useState<VoiceChoice>('auto');
  const [handsFree, setHandsFree] = useState(false);
  const [sttReady, setSttReady] = useState(false);
  const [mode, setMode] = useState<VoiceMode>('idle');
  const [engine, setEngine] = useState('web-speech');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const handsFreeRef = useRef(false);
  const sequenceRef = useRef(0);
  const modeRef = useRef<VoiceMode>('idle');

  const setVoiceMode = useCallback((next: VoiceMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    let alive = true;
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('status failed'))))
      .then((data) => {
        if (alive) setSttReady(Boolean(data?.voice?.offline_stt_ready));
      })
      .catch(() => {
        if (alive) setSttReady(false);
      });
    const source = new EventSource('/api/events');
    source.addEventListener('voice', (message) => {
      try {
        const frame = JSON.parse((message as MessageEvent).data) as { payload?: { actionResult?: { uiLanguage?: Language } } };
        const next = frame.payload?.actionResult?.uiLanguage;
        if (next === 'ar' || next === 'en') onLanguageChange(next);
      } catch {
        // ignore malformed frames
      }
    });
    return () => {
      alive = false;
      source.close();
    };
  }, [onLanguageChange]);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
    } catch {
      // audio may not be loaded
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    recognitionRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const playbackFinished = useCallback(() => {
    setVoiceMode('idle');
    if (handsFreeRef.current) {
      window.setTimeout(() => void startListeningRef.current(), 350);
    }
  }, [setVoiceMode]);

  const speakReply = useCallback(
    (text: string, url: string | null, replyLang: Language) => {
      setVoiceMode('speaking');
      if (url) {
        const audio = audioRef.current;
        if (audio) {
          audio.onended = () => playbackFinished();
          audio.onerror = () => playbackFinished();
          audio.src = url;
          void audio.play().catch(() => playbackFinished());
          return;
        }
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = replyLang === 'ar' ? 'ar-EG' : 'en-US';
        utterance.onend = () => playbackFinished();
        utterance.onerror = () => playbackFinished();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        return;
      }
      playbackFinished();
    },
    [playbackFinished, setVoiceMode],
  );

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      stopAll();
      const turnId = ++sequenceRef.current;
      setTurns((previous) => [
        ...previous,
        { id: turnId, role: 'user', text: clean, at: new Date().toISOString() },
      ]);
      setInput('');
      setError(null);
      setVoiceMode('thinking');
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch('/api/voice/converse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: clean,
            preferredLang: voiceLang,
            executeActions: true,
            activeProjectId,
          }),
          signal: controller.signal,
        });
        const data = (await response.json()) as ConverseResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || data.errorCode || 'voice request failed');
        if (data.actionExecuted) setVoiceMode('executing');
        setEngine(data.ttsEngine || 'web-speech');
        setTurns((previous) => [
          ...previous,
          {
            id: ++sequenceRef.current,
            role: 'assistant',
            text: data.replyText,
            at: new Date().toISOString(),
            ...(data.errorCode ? { errorCode: data.errorCode } : {}),
          },
        ]);
        const requested = data.actionResult?.uiLanguage;
        if (requested === 'ar' || requested === 'en') onLanguageChange(requested);
        speakReply(data.replyText, data.audioUrl, data.lang);
      } catch (err) {
        if (controller.signal.aborted) return;
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail);
        setTurns((previous) => [
          ...previous,
          { id: ++sequenceRef.current, role: 'assistant', text: detail, at: new Date().toISOString(), errorCode: 'VOICE_HUD_ERROR' },
        ]);
        setVoiceMode('error');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [activeProjectId, onLanguageChange, setVoiceMode, speakReply, stopAll, voiceLang],
  );

  const uploadAudio = useCallback(
    async (blob: Blob) => {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const audioBase64 = btoa(binary);
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType: blob.type || 'audio/webm', lang: voiceLang === 'auto' ? undefined : voiceLang }),
      });
      const data = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !data.transcript) throw new Error(data.error || 'STT_FAILED');
      await send(data.transcript);
    },
    [send, voiceLang],
  );

  const startListening = useCallback(() => {
    stopAll();
    const targetLang: Language = voiceLang === 'auto' ? language : voiceLang;
    setVoiceMode('listening');
    setListening(true);
    if (sttReady && navigator.mediaDevices?.getUserMedia) {
      void (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          const recorder = new MediaRecorder(stream);
          chunksRef.current = [];
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
          };
          recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            if (blob.size > 0) void uploadAudio(blob).catch((err: Error) => setError(err.message));
            else setVoiceMode('idle');
          };
          mediaRecorderRef.current = recorder;
          recorder.start();
        } catch {
          setError(tr('voice.hud.permission'));
          setVoiceMode('error');
          setListening(false);
        }
      })();
      return;
    }

    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setError(tr('voice.hud.permission'));
      setVoiceMode('error');
      setListening(false);
      return;
    }
    const recognition = new Constructor();
    recognition.lang = targetLang === 'ar' ? 'ar-EG' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const final = event.results[event.results.length - 1];
      const transcript = final?.[0]?.transcript || '';
      if (transcript.trim()) void send(transcript);
    };
    recognition.onerror = () => {
      setError(tr('voice.hud.permission'));
      setVoiceMode('error');
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      if (modeRef.current === 'listening') setVoiceMode('idle');
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setVoiceMode('error');
      setListening(false);
    }
  }, [language, send, setVoiceMode, sttReady, stopAll, tr, uploadAudio, voiceLang]);

  // Keeps the hands-free timer stable without recreating callbacks on each render.
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;

  const toggleListening = useCallback(() => {
    if (listening) {
      stopAll();
      setVoiceMode('idle');
    } else {
      startListening();
    }
  }, [listening, setVoiceMode, startListening, stopAll]);

  const stateLabel: Record<VoiceMode, string> = {
    idle: tr('voice.hud.idle'),
    listening: tr('voice.hud.listening'),
    thinking: tr('voice.hud.thinking'),
    speaking: tr('voice.hud.speaking'),
    executing: tr('voice.hud.executing'),
    error: tr('voice.hud.error'),
  };

  return (
    <section
      aria-label={tr('voice.hud.aria')}
      data-testid="voice-hud"
      data-voice-mode={mode}
      className="border-b border-slate-800 bg-slate-950/70"
    >
      <audio ref={audioRef} className="hidden" preload="auto" aria-hidden="true" />
      <div className="mx-auto max-w-[1440px] space-y-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Languages className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            <span className="font-semibold text-slate-100">{tr('voice.hud.title')}</span>
            <select
              aria-label={tr('voice.hud.lang')}
              data-testid="voice-lang-select"
              value={voiceLang}
              onChange={(event) => setVoiceLang(event.target.value as VoiceChoice)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="auto">{tr('voice.hud.auto')}</option>
              <option value="ar">{tr('voice.hud.arabic')}</option>
              <option value="en">{tr('voice.hud.english')}</option>
            </select>
            <span
              data-testid="voice-state"
              className={`rounded border px-2 py-1 font-mono text-[11px] ${
                mode === 'error' ? 'border-rose-700 text-rose-300' : 'border-cyan-800 text-cyan-300'
              }`}
            >
              {stateLabel[mode]}
            </span>
            <span className="rounded border border-slate-800 px-2 py-1 text-[11px] text-slate-400">
              {tr('voice.hud.tts')}: {engine === 'piper-neural-offline' ? tr('voice.hud.piper') : tr('voice.hud.webSpeech')}
            </span>
            <span className="rounded border border-slate-800 px-2 py-1 text-[11px] text-slate-400">
              {tr('voice.hud.stt')}: {sttReady ? tr('voice.hud.sttReady') : tr('voice.hud.sttOff')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleListening}
              data-testid="voice-ptt"
              aria-label={tr('voice.hud.ptt')}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                listening ? 'bg-teal-500 text-slate-950' : 'border border-slate-700 bg-slate-900 text-slate-200'
              }`}
            >
              {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {tr('voice.hud.ptt')}
            </button>
            <button
              type="button"
              onClick={() => setHandsFree((value) => !value)}
              aria-pressed={handsFree}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${
                handsFree ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400'
              }`}
            >
              <Volume2 className="h-3.5 w-3.5" /> {tr('voice.hud.handsFree')}
            </button>
            {(mode === 'speaking' || mode === 'thinking' || mode === 'executing') && (
              <button
                type="button"
                onClick={stopAll}
                aria-label={tr('voice.hud.bargeIn')}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-600 px-3 py-1.5 text-xs text-amber-300"
              >
                <Square className="h-3.5 w-3.5" /> {tr('voice.hud.bargeIn')}
              </button>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            data-testid="voice-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={stopAll}
            placeholder={tr('voice.hud.input')}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            data-testid="voice-send"
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> {tr('voice.hud.send')}
          </button>
        </form>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div data-testid="voice-history" className="max-h-48 space-y-1.5 overflow-y-auto">
          {turns.length === 0 ? (
            <p className="text-xs text-slate-500">{tr('voice.hud.empty')}</p>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                data-testid={turn.role === 'assistant' ? 'voice-reply' : 'voice-utterance'}
                className={`rounded border px-2.5 py-1.5 text-xs ${
                  turn.role === 'user'
                    ? 'border-slate-800 bg-slate-900/70 text-slate-300'
                    : turn.errorCode
                      ? 'border-rose-800 bg-rose-950/30 text-rose-300'
                      : 'border-cyan-900 bg-cyan-950/20 text-cyan-100'
                }`}
              >
                <span className="mr-2 font-semibold text-slate-500">
                  {turn.role === 'user' ? tr('voice.hud.you') : tr('voice.hud.genesis')}
                </span>
                {turn.text}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
