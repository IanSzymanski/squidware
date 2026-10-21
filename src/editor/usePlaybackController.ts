import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { countToSeconds, sampleTimeline, secondsToCount, totalCounts } from '../domain';
import { clockStatusText, RehearsalClock } from './rehearsalClock';
import { useEditorSelector, useEditorStore } from './react';

/** The clock writes frames without subscribing the shell to the playhead. */
export function usePlaybackController(audioRef: RefObject<HTMLAudioElement | null>, audioUrl: string) {
  const store = useEditorStore();
  const project = useEditorSelector(state => state.project.present);
  const audioContext = useRef<AudioContext | null>(null);
  useEffect(() => {
    const media = audioUrl ? audioRef.current ?? undefined : undefined;
    const duration = totalCounts(project), totalSeconds = countToSeconds(project, duration);
    const clock = new RehearsalClock({ totalSeconds,
      offset: project.audioOffsetSeconds, media, now: () => performance.now() / 1000 });
    let raf = 0, writing = false, lastBeat = -1;
    function publish() {
      const sample = clock.sample();
      const count = sample.seconds >= totalSeconds ? duration : secondsToCount(project, sample.seconds);
      writing = true;
      try {
        store.setValue('playback', 'count', count);
        store.setValue('selection', 'activeIndex', sampleTimeline(project, count).setIndex);
        store.setValue('playback', 'playing', sample.playing);
        store.setValue('playback', 'clockStatus', audioUrl ? clockStatusText[sample.status] : '');
      } finally { writing = false; }
      const beat = Math.floor(count);
      if (sample.playing && store.getState().playback.metronome && beat !== lastBeat) {
        try {
          const ctx = audioContext.current || (audioContext.current = new AudioContext()); void ctx.resume();
          const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
          oscillator.frequency.value = beat % 4 === 0 ? 1100 : 740;
          gain.gain.setValueAtTime(0.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
          oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.06);
        } catch { /* Audio devices may be unavailable. The lookahead scheduler is #14. */ }
      }
      lastBeat = beat;
    }
    function frame() { raf = 0; publish(); schedule(); }
    function schedule() {
      if (store.getState().playback.playing && !raf) raf = requestAnimationFrame(frame);
      else if (!store.getState().playback.playing && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    let previous = store.getState().playback;
    clock.update(previous, countToSeconds(project, previous.count)); publish(); schedule();
    previous = store.getState().playback;
    const unsubscribe = store.subscribe(() => {
      const next = store.getState().playback, before = previous; previous = next;
      if (writing) return;
      const seek = next.count !== before.count;
      if (seek || next.playing !== before.playing || next.speed !== before.speed || next.loop !== before.loop) {
        clock.update(next, seek ? countToSeconds(project, next.count) : undefined);
        publish(); schedule();
      }
    });
    // Complete deferred paused seeks when metadata arrives. An ended event
    // anchors the silent tail promptly, even if no animation frame is due.
    const onMedia = () => { publish(); schedule(); };
    const events = ['loadedmetadata', 'canplay', 'playing', 'waiting', 'seeked', 'ended', 'error'] as const;
    events.forEach(event => media?.addEventListener(event, onMedia));
    return () => {
      unsubscribe(); cancelAnimationFrame(raf);
      events.forEach(event => media?.removeEventListener(event, onMedia)); clock.dispose();
    };
  }, [store, project, audioUrl, audioRef]);
  useEffect(() => () => { void audioContext.current?.close(); }, []);
}
