import { describe, expect, it } from 'vitest';
import { RehearsalClock } from './rehearsalClock';
import type { RehearsalMedia } from './rehearsalClock';

class Media implements RehearsalMedia {
  private time = 0;
  duration = 3600; readyState = 4; paused = true; ended = false; seeking = false;
  error: unknown = null; playbackRate = 1;
  seeks: number[] = []; plays = 0; loads = 0; reject = false;
  get currentTime() { return this.time; }
  set currentTime(value: number) { this.time = value; this.ended = false; this.seeks.push(value); }
  advance(seconds: number) { this.time = seconds; }
  play() { this.plays++; if (this.reject) return Promise.reject(new Error('Audio device unavailable')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.loads++; this.error = null; this.time = 0; }
}
function fixture({ audio = true, total = 4000, offset = 0 } = {}) {
  let time = 0;
  const media = new Media();
  const clock = new RehearsalClock({ totalSeconds: total, offset, media: audio ? media : undefined, now: () => time });
  const controls = { playing: true, speed: 1, loop: false };
  return { clock, media, controls, now: (value: number) => { time = value; } };
}

describe('audio-authoritative rehearsal clock', () => {
  it.each([.5, .75, 1, 1.25, 1.5])('samples a long recording at %s× after dropped frames without correction seeks', speed => {
    const { clock, media, controls, now } = fixture(); controls.speed = speed;
    clock.update(controls, 4);
    // The decoder can advance by a different amount than the renderer expects.
    for (const wall of [1, 5, 40, 110, 800]) {
      now(wall); media.advance(4 + wall * speed - .37);
      expect(clock.sample().seconds).toBeCloseTo(media.currentTime);
      expect(media.playbackRate).toBe(speed);
    }
    expect(media.seeks).toEqual([4]); expect(media.plays).toBe(1);
  });

  it('holds the field when audio stalls and resumes from media time', () => {
    const { clock, media, controls, now } = fixture(); clock.update(controls, 20);
    media.readyState = 2; now(2);
    expect(clock.sample()).toEqual({ seconds: 20, playing: true, status: 'waiting' });
    media.readyState = 4; media.advance(20.75); now(3);
    expect(clock.sample()).toEqual({ seconds: 20.75, playing: true, status: 'audio' });
    expect(media.seeks).toEqual([20]);
  });

  it('preserves position on speed changes, pause and resume; seeks only for explicit scrubs', () => {
    const { clock, media, controls, now } = fixture(); clock.update(controls, 5);
    now(1); media.advance(6.1);
    controls.speed = .5; expect(clock.update(controls).seconds).toBe(6.1);
    controls.playing = false; media.advance(7);
    expect(clock.update(controls).seconds).toBe(7); expect(media.paused).toBe(true);
    now(100); expect(clock.sample().seconds).toBe(7);
    controls.playing = true; expect(clock.update(controls).seconds).toBe(7);
    expect(media.seeks).toEqual([5]);
    controls.playing = false; clock.update(controls, 30);
    expect(media.seeks).toEqual([5, 30]); expect(clock.sample().seconds).toBe(30);
    expect(media.paused).toBe(true);
  });

  it('uses the offset as audio time = show seconds + offset', () => {
    const { clock, media, controls } = fixture({ offset: 3 });
    clock.update(controls, 10); expect(media.currentTime).toBe(13);
    media.advance(14.5); expect(clock.sample().seconds).toBe(11.5);
  });

  it('runs a silent lead-in once, then hands over to the audio clock', () => {
    const { clock, media, controls, now } = fixture({ offset: -3 });
    expect(clock.update(controls, 0).status).toBe('before');
    now(1); expect(clock.sample().seconds).toBe(1);
    now(2); expect(clock.sample().seconds).toBe(2);
    expect(media.seeks).toEqual([0]); expect(media.plays).toBe(0);
    now(3.2); expect(clock.sample().seconds).toBe(3.2);
    expect(media.seeks).toEqual([0, expect.closeTo(.2)]); expect(media.plays).toBe(1);
    now(20); media.advance(.4); expect(clock.sample().seconds).toBe(3.4);
  });

  it('continues silently after audio ends, without returning to the track', () => {
    const { clock, media, controls, now } = fixture({ total: 100, offset: 2 }); media.duration = 10;
    clock.update(controls, 5); media.advance(10); media.ended = true; now(3);
    expect(clock.sample()).toEqual({ seconds: 8, playing: true, status: 'after' });
    now(5); expect(clock.sample().seconds).toBe(10);
    now(7); expect(clock.sample().seconds).toBe(12);
    expect(media.plays).toBe(1); expect(media.seeks).toEqual([7, 10]);
    controls.speed = .5; clock.update(controls); now(9); expect(clock.sample().seconds).toBe(13);
    clock.update(controls, 1); expect(media.seeks.at(-1)).toBe(3); expect(media.plays).toBe(2);
  });

  it('starts silently if the offset is beyond the recording', () => {
    const { clock, media, controls, now } = fixture({ offset: 30 }); media.duration = 10;
    expect(clock.update(controls, 0).status).toBe('after'); now(2); expect(clock.sample().seconds).toBe(2);
    expect(media.plays).toBe(0); expect(media.seeks).toEqual([10]);
  });

  it('anchors the silent tail if currentTime reaches duration before ended is dispatched', () => {
    const { clock, media, controls, now } = fixture({ offset: -1 }); media.duration = 3;
    clock.update(controls, 1); media.advance(3); now(1);
    expect(clock.sample()).toEqual({ seconds: 4, playing: true, status: 'after' });
    now(1.25); expect(clock.sample().seconds).toBe(4.25);
    expect(media.plays).toBe(1); expect(media.seeks).toEqual([0, 3]);
  });

  it('seeks once at an audio-backed loop boundary and stops exactly at the final count', () => {
    const { clock, media, controls } = fixture({ total: 10, offset: 2 }); controls.loop = true;
    clock.update(controls, 9); media.advance(12.25);
    expect(clock.sample().seconds).toBe(.25); expect(media.seeks).toEqual([11, 2.25]);
    controls.loop = false; clock.update(controls); media.advance(12.5);
    expect(clock.sample()).toEqual({ seconds: 10, playing: false, status: 'audio' });
    expect(media.paused).toBe(true);
  });

  it('waits for metadata, completes paused seeks, and starts once after load', () => {
    const { clock, media, controls, now } = fixture(); media.duration = NaN; media.readyState = 0; controls.playing = false;
    expect(clock.update(controls, 22).status).toBe('waiting'); expect(media.seeks).toEqual([]);
    media.duration = 120; media.readyState = 4; now(1);
    expect(clock.sample().seconds).toBe(22); expect(media.seeks).toEqual([22]); expect(media.paused).toBe(true);
    controls.playing = true; clock.update(controls); expect(media.plays).toBe(1);
  });

  it('does not advance while initial loading or seeking is pending', () => {
    const { clock, media, controls, now } = fixture(); media.duration = NaN; media.readyState = 0;
    clock.update(controls, 15); now(3); expect(clock.sample().seconds).toBe(15);
    media.duration = 120; media.readyState = 4; clock.sample();
    media.seeking = true; media.advance(0); now(4); expect(clock.sample().seconds).toBe(15);
    media.seeking = false; media.advance(15.5); expect(clock.sample().seconds).toBe(15.5);
  });

  it.each(['error', 'timeout', 'rejection'])('falls back continuously after %s and retries only on a new play action', async reason => {
    const { clock, media, controls, now } = fixture();
    if (reason === 'rejection') media.reject = true;
    clock.update(controls, 15);
    if (reason === 'error') { media.error = { code: 3 }; now(2); }
    if (reason === 'timeout') now(11);
    await Promise.resolve();
    expect(clock.sample().status).toBe('failed');
    const failedAt = reason === 'timeout' ? 11 : reason === 'error' ? 2 : 0;
    now(failedAt + 2); expect(clock.sample().seconds).toBe(17);
    expect(media.plays).toBe(1);
    controls.playing = false; clock.update(controls);
    media.error = null; media.reject = false; controls.playing = true;
    expect(clock.update(controls).status).toBe('audio'); expect(media.plays).toBe(2);
    expect(media.currentTime).toBe(17);
  });

  it('ignores a stale rejected play promise after a seek, pause, or disposal', async () => {
    const { clock, media, controls } = fixture();
    let reject!: (error: Error) => void;
    media.play = () => new Promise<void>((_resolve, fail) => { reject = fail; });
    clock.update(controls, 15); controls.playing = false; clock.update(controls, 40);
    reject(new Error('Old request aborted')); await Promise.resolve();
    expect(clock.sample().status).toBe('audio'); expect(clock.sample().seconds).toBe(40);
    controls.playing = true; clock.update(controls); clock.dispose();
    reject(new Error('Disposed request aborted')); await Promise.resolve();
    expect(media.paused).toBe(true);
  });

  it('reloads a failed media resource only when explicitly retried', () => {
    const { clock, media, controls, now } = fixture(); clock.update(controls, 15);
    media.error = { code: 2 }; media.advance(0); // A failed resource can reset its media position.
    expect(clock.sample()).toEqual({ seconds: 15, playing: true, status: 'failed' });
    now(2); expect(clock.sample().seconds).toBe(17); expect(media.loads).toBe(0);
    controls.playing = false; clock.update(controls); controls.playing = true;
    expect(clock.update(controls).status).toBe('audio');
    expect(media.loads).toBe(1); expect(media.currentTime).toBe(17);
  });

  it('parks a reloaded resource at its end when the show is already beyond the recording', () => {
    const { clock, media, controls } = fixture({ offset: 30 }); media.duration = 10;
    clock.update(controls, 0); expect(media.currentTime).toBe(10);
    media.error = { code: 2 }; media.advance(0); clock.sample();
    controls.playing = false; clock.update(controls); controls.playing = true;
    expect(clock.update(controls).status).toBe('after');
    expect(media.loads).toBe(1); expect(media.currentTime).toBe(10); expect(media.paused).toBe(true);
  });

  it('disposes a replaced track and starts its replacement at the current show position', () => {
    const { clock, media, controls } = fixture(); clock.update(controls, 10); media.advance(12);
    const seconds = clock.sample().seconds; clock.dispose(); expect(media.paused).toBe(true);
    const replacement = new Media();
    const next = new RehearsalClock({ totalSeconds: 100, offset: -2, media: replacement, now: () => 0 });
    next.update({ ...controls, playing: false }, seconds); expect(replacement.currentTime).toBe(10);
    next.update(controls); expect(replacement.plays).toBe(1);
  });
});

describe('monotonic silent rehearsal clock', () => {
  it('preserves elapsed time through dropped frames, rate changes, pause/resume and loops', () => {
    const { clock, controls, now } = fixture({ audio: false, total: 100 });
    clock.update(controls, 5); now(30); expect(clock.sample().seconds).toBe(35);
    controls.speed = .5; clock.update(controls); now(50); expect(clock.sample().seconds).toBe(45);
    controls.playing = false; clock.update(controls); now(100); expect(clock.sample().seconds).toBe(45);
    controls.playing = true; clock.update(controls); now(110); expect(clock.sample().seconds).toBe(50);
    controls.loop = true; clock.update(controls); now(415); expect(clock.sample().seconds).toBe(2.5);
    controls.loop = false; clock.update(controls); now(615);
    expect(clock.sample()).toEqual({ seconds: 100, playing: false, status: 'silent' });
  });
});

describe('absolute-time count-range playback', () => {
  it.each([false, true])('stops or repeats a range on the media clock (loop=%s), preserving offset and overflow after a stalled frame', loop => {
    const media = new Media(); let now = 0;
    const clock = new RehearsalClock({ totalSeconds: 100, rangeStart: 5, rangeEnd: 12, offset: 2, media, now: () => now });
    clock.update({ playing: true, speed: .75, loop }, 5);
    expect(media.seeks).toEqual([7]);
    now = 30; media.advance(16.25);
    expect(clock.sample()).toMatchObject({ seconds: loop ? 7.25 : 12, playing: loop });
    expect(media.currentTime).toBe(loop ? 9.25 : 16.25);
    expect(media.playbackRate).toBe(.75);
    if (!loop) expect(media.paused).toBe(true);
  });
  it('loops a silent range across many skipped frames and restarts at range start', () => {
    let now = 0;
    const clock = new RehearsalClock({ totalSeconds: 100, rangeStart: 10, rangeEnd: 15, offset: 0, now: () => now });
    clock.update({ playing: true, speed: 1.5, loop: true }, 0); expect(clock.sample().seconds).toBe(10);
    now = 22; expect(clock.sample().seconds).toBe(13);
    clock.update({ playing: false, speed: 1.5, loop: true }); now = 60;
    expect(clock.sample()).toMatchObject({ seconds: 13, playing: false });
    clock.update({ playing: true, speed: 1, loop: false }, 15); expect(clock.sample().seconds).toBe(10);
  });
});

describe('count-in on the shared rehearsal clock', () => {
  it.each([false,true])('holds the requested count and media until the lead-in ends (audio=%s)', audio => {
    const { clock, media, controls, now } = fixture({ audio });
    clock.update(controls, 20, 2);
    expect(clock.countInEndTime).toBe(2);
    now(1.75); expect(clock.sample()).toEqual({ seconds: 20, playing: true, status: 'count-in' });
    expect(media.plays).toBe(0); expect(media.paused).toBe(true);
    now(2); expect(clock.sample().seconds).toBe(20); expect(clock.countInEndTime).toBeNull();
    if (audio) { expect(media.plays).toBe(1); expect(media.currentTime).toBe(20); }
    else { now(2.5); expect(clock.sample().seconds).toBe(20.5); }
  });
  it('cancels a count-in on stop or seek and reschedules at a new rehearsal speed', () => {
    const { clock, media, controls, now } = fixture();
    clock.update(controls, 10, 4); now(1);
    controls.playing = false; clock.update(controls);
    now(6); expect(clock.sample().seconds).toBe(10); expect(media.plays).toBe(0); expect(clock.countInEndTime).toBeNull();
    controls.playing = true; controls.speed = .5; clock.update(controls, 30, 8); now(7);
    expect(clock.sample().seconds).toBe(30); expect(clock.countInEndTime).toBe(14);
    controls.playing = false; clock.update(controls, 40); now(20);
    expect(clock.sample().seconds).toBe(40); expect(media.plays).toBe(0);
  });
  it('retains the intended recording start after a renderer stall spans the end of count-in', () => {
    const { clock, media, controls, now } = fixture();
    clock.update(controls, 30, 2); now(3.5);
    expect(clock.sample().seconds).toBe(30);
    expect(media.seeks).toEqual([30]); expect(media.plays).toBe(1);
  });
});
