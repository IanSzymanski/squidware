/** Only intentional transport changes seek media. Rendering samples this clock. */
export interface RehearsalMedia {
  currentTime: number;
  duration: number;
  readyState: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  error: unknown;
  playbackRate: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
}

export type ClockStatus = 'silent' | 'audio' | 'waiting' | 'before' | 'after' | 'failed';
export const clockStatusText: Record<ClockStatus, string> = {
  silent: 'Silent playback', audio: 'Audio clock', waiting: 'Waiting for audio…',
  before: 'Before audio · silent playback', after: 'Audio ended · silent playback',
  failed: 'Audio unavailable · silent playback. Pause and play to retry.',
};
export interface ClockSample { seconds: number; playing: boolean; status: ClockStatus }
const AUDIO_TIMEOUT_SECONDS = 10;

/** `now` is monotonic seconds (performance.now), never elapsed frame deltas. */
export class RehearsalClock {
  private seconds = 0;
  private playing = false;
  private speed = 1;
  private loop = false;
  private anchorSeconds = 0;
  private anchorTime: number;
  private status: ClockStatus = 'silent';
  private failed = false;
  private needsSeek = true;
  private attempt = 0;
  private requested = false;
  private disposed = false;
  private initialized = false;
  private progressTime: number;
  private lastMediaTime = -1;
  private parkedAt: number | null = null;

  constructor(private readonly options: {
    totalSeconds: number; offset: number; media?: RehearsalMedia; now: () => number;
  }) {
    this.anchorTime = this.progressTime = options.now();
  }

  /** Omit seekSeconds for pause/resume, rate, or loop-option changes. */
  update(transport: { playing: boolean; speed: number; loop: boolean }, seekSeconds?: number): ClockSample {
    if (this.initialized) this.sample();
    this.initialized = true;
    const starting = transport.playing && !this.playing;
    if (seekSeconds !== undefined) {
      this.seconds = Math.max(0, Math.min(this.options.totalSeconds, seekSeconds));
      this.needsSeek = true;
      this.parkedAt = null;
      this.cancelPlay();
    }
    if (starting && this.failed) {
      this.failed = false; this.needsSeek = true; this.parkedAt = null;
      // A media-element error persists until its resource is reloaded. A
      // rejected play promise alone does not require reloading the recording.
      if (this.options.media?.error) {
        try { this.options.media.load(); } catch { this.fail(); }
      }
    }
    if (starting) this.progressTime = this.options.now();
    this.playing = transport.playing && this.options.totalSeconds > 0;
    this.speed = transport.speed;
    this.loop = transport.loop;
    this.anchor();
    if (!this.playing) this.cancelPlay();
    if (this.options.media) this.options.media.playbackRate = this.speed;
    return this.sample();
  }

  sample(): ClockSample {
    if (this.disposed) return this.snapshot();
    const now = this.options.now();
    const media = this.options.media;
    if (this.playing) {
      if (this.status === 'audio' || this.status === 'waiting') {
        if (media && !media.error && !this.failed && !this.needsSeek) {
          // currentTime is authoritative even after dropped frames. A stalled
          // decoder naturally holds the field; no wall-clock catch-up seeks.
          if (!media.seeking) this.seconds = Math.max(0, media.currentTime - this.options.offset);
          if (media.ended && Number.isFinite(media.duration)) {
            this.seconds = Math.max(0, media.duration - this.options.offset);
            this.status = 'after'; this.anchor();
          }
        }
      } else this.seconds = this.anchorSeconds + (now - this.anchorTime) * this.speed;
    }
    this.boundary();
    if (!media) this.status = 'silent';
    else if (this.failed || media.error) this.fail();
    else if (this.seconds + this.options.offset < 0) {
      this.status = 'before'; this.park(0);
    } else if (Number.isFinite(media.duration) && this.seconds + this.options.offset >= media.duration) {
      // currentTime can reach duration before the ended event is delivered.
      // Anchor every handover, including that case, at the media position.
      if (this.status !== 'after') this.anchor();
      this.status = 'after'; this.park(media.duration);
    } else if (media.readyState < 1 || !Number.isFinite(media.duration)) {
      this.status = 'waiting';
      if (this.playing && now - this.progressTime >= AUDIO_TIMEOUT_SECONDS) this.fail();
    } else {
      if (this.needsSeek) {
        try { media.currentTime = this.seconds + this.options.offset; }
        catch { this.fail(); return this.snapshot(); }
        this.needsSeek = false;
        this.parkedAt = null;
        this.lastMediaTime = media.currentTime;
        this.progressTime = now;
      }
      if (this.playing && !this.requested) this.requestPlay();
      if (!this.failed) {
        this.status = this.playing && (media.paused || media.seeking || media.readyState < 3) ? 'waiting' : 'audio';
        if (media.currentTime !== this.lastMediaTime) {
          this.lastMediaTime = media.currentTime; this.progressTime = now;
        }
        if (this.playing && now - this.progressTime >= AUDIO_TIMEOUT_SECONDS) this.fail();
      }
    }
    return this.snapshot();
  }

  dispose() { this.disposed = true; this.playing = false; this.cancelPlay(); }

  private snapshot(): ClockSample { return { seconds: this.seconds, playing: this.playing, status: this.status }; }
  private anchor() { this.anchorSeconds = this.seconds; this.anchorTime = this.options.now(); }
  private cancelPlay() { this.attempt++; this.requested = false; this.options.media?.pause(); }
  private fail() {
    if (!this.failed) { this.failed = true; this.anchor(); this.cancelPlay(); }
    this.status = 'failed';
  }
  private park(target: number) {
    const media = this.options.media!;
    // Keep one pending seek at region boundaries, never one per frame.
    if (this.requested) this.cancelPlay();
    if (this.parkedAt !== target && media.readyState >= 1 && Number.isFinite(target)) {
      try { media.currentTime = Math.max(0, target); this.parkedAt = target; } catch { this.fail(); }
    }
    this.needsSeek = true;
    if (!media.paused) media.pause();
  }
  private requestPlay() {
    const attempt = ++this.attempt;
    this.requested = true;
    this.progressTime = this.options.now();
    try {
      void this.options.media!.play().catch(() => {
        if (!this.disposed && attempt === this.attempt) this.fail();
      });
    } catch { this.fail(); }
  }
  private boundary() {
    const total = this.options.totalSeconds;
    if (this.seconds < total || total <= 0) return;
    if (this.playing && this.loop) {
      this.seconds %= total; this.anchor(); this.cancelPlay(); this.needsSeek = true; this.parkedAt = null;
    } else {
      this.seconds = total; this.playing = false; this.cancelPlay();
    }
  }
}
