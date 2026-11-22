export interface OfflineAudioPlayerHooks {
  onStarted?: () => void;
  onEnded?: () => void;
  onError?: () => void;
}

/**
 * Tiny browser audio bridge used for offline Piper WAV playback.
 * It owns no network logic: the server synthesizes/caches the file, this only plays it.
 */
export class OfflineAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private readonly hooks: OfflineAudioPlayerHooks;
  private playbackToken = 0;

  constructor(element?: HTMLAudioElement | null, hooks: OfflineAudioPlayerHooks = {}) {
    this.hooks = hooks;
    this.attach(element);
  }

  attach(element?: HTMLAudioElement | null): void {
    if (!element) return;
    if (this.audio === element) return;
    this.stop();
    this.audio = element;
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', 'true');
  }

  private ensureElement(): HTMLAudioElement | null {
    if (this.audio) return this.audio;
    if (typeof Audio === 'undefined') return null;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', 'true');
    return this.audio;
  }

  async play(url: string): Promise<boolean> {
    if (!url) return false;
    const audio = this.ensureElement();
    if (!audio) return false;

    this.stop();
    const token = ++this.playbackToken;
    audio.src = url;
    audio.onended = () => {
      if (token !== this.playbackToken) return;
      this.hooks.onEnded?.();
    };
    audio.onerror = () => {
      if (token !== this.playbackToken) return;
      this.hooks.onError?.();
    };

    try {
      await audio.play();
      if (token !== this.playbackToken) {
        audio.pause();
        return false;
      }
      this.hooks.onStarted?.();
      return true;
    } catch {
      if (token === this.playbackToken) {
        audio.pause();
      }
      return false;
    }
  }

  stop(): void {
    this.playbackToken += 1;
    const audio = this.audio;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // audio element may not be attached to the document yet
    }
  }

  get isPlaying(): boolean {
    return Boolean(this.audio && !this.audio.paused && !this.audio.ended);
  }
}
