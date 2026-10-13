import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { countToSeconds, sampleProject, secondsToCount, totalCounts } from '../domain';
import { useEditorSelector, useEditorStore } from './react';

/** The clock writes frames without subscribing the shell to the playhead. */
export function usePlaybackController(audioRef: RefObject<HTMLAudioElement | null>, audioUrl: string) {
  const store = useEditorStore();
  const project = useEditorSelector(state => state.project.present);
  const playing = useEditorSelector(state => state.playback.playing);
  const speed = useEditorSelector(state => state.playback.speed);
  const loop = useEditorSelector(state => state.playback.loop);
  const metronome = useEditorSelector(state => state.playback.metronome);
  const audioContext = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!playing) { audioRef.current?.pause(); return; }
    const duration = totalCounts(project);
    const started = performance.now();
    const initialSeconds = countToSeconds(project, store.getState().playback.count);
    const totalSeconds = countToSeconds(project, duration);
    let raf = 0; let lastBeat = -1;
    function frame(now: number) {
      let seconds = initialSeconds + (now - started) / 1000 * speed;
      if (seconds >= totalSeconds && totalSeconds > 0) {
        if (loop) seconds %= totalSeconds;
        else {
          store.setValue('playback', 'count', duration); store.setValue('selection', 'activeIndex', project.sets.length - 1);
          store.setValue('playback', 'playing', false); return;
        }
      }
      const count = secondsToCount(project, seconds);
      store.setValue('playback', 'count', count);
      store.setValue('selection', 'activeIndex', sampleProject(project, count).setIndex);
      const audio = audioRef.current; const target = seconds + project.audioOffsetSeconds;
      if (audio && audioUrl) {
        audio.playbackRate = speed;
        if (target >= 0 && (!Number.isFinite(audio.duration) || target < audio.duration)) {
          if (Math.abs(audio.currentTime - target) > 0.2) audio.currentTime = target;
          if (audio.paused) audio.play().catch(() => { /* Browser audio policy can delay playback. */ });
        } else audio.pause();
      }
      const beat = Math.floor(count);
      if (metronome && beat !== lastBeat) {
        lastBeat = beat;
        try {
          const ctx = audioContext.current || (audioContext.current = new AudioContext()); void ctx.resume();
          const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
          oscillator.frequency.value = beat % 4 === 0 ? 1100 : 740;
          gain.gain.setValueAtTime(0.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
          oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.06);
        } catch { /* Audio devices may be unavailable. */ }
      }
      raf = requestAnimationFrame(frame);
    }
    if (totalSeconds > 0) raf = requestAnimationFrame(frame); else store.setValue('playback', 'playing', false);
    return () => { cancelAnimationFrame(raf); audioRef.current?.pause(); };
  }, [store, playing, project, speed, loop, metronome, audioUrl, audioRef]);
  useEffect(() => () => { void audioContext.current?.close(); }, []);
}
