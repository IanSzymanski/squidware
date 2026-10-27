import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { countToSeconds, sampleTimeline, secondsToCount, totalCounts } from '../domain';
import { projectMeter } from '../meter';
import { rehearsalBounds } from '../rehearsal';
import { clockStatusText, RehearsalClock } from './rehearsalClock';
import { MetronomeAudio } from './metronomeAudio';
import { clockDifference, countAt, secondsAt, tempoSpans } from './clickSchedule';
import type { ClickPlan } from './clickSchedule';
import { useEditorSelector, useEditorStore } from './react';

/** rAF only publishes the field. Audio rendering owns the click queue; a small
 * control timer synchronizes media handovers even when no frame is painted. */
export function usePlaybackController(audioRef: RefObject<HTMLAudioElement | null>, audioUrl: string) {
  const store = useEditorStore();
  const project = useEditorSelector(state => state.project.present);
  const rehearsalId = useEditorSelector(state => state.playback.rehearsalId);
  const audioContext = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (store.getState().project.present !== project || store.getState().playback.rehearsalId !== rehearsalId) return;
    let unavailable = false;
    try { audioContext.current ??= new AudioContext(); } catch { unavailable = true; }
    const ctx = audioContext.current;
    const now = () => ctx ? ctx.currentTime : performance.now() / 1000;
    const audio = ctx ? new MetronomeAudio(ctx, () => { unavailable = true; }) : null;
    const media = audioUrl ? audioRef.current ?? undefined : undefined;
    const duration = totalCounts(project), totalSeconds = countToSeconds(project, duration);
    const bounds = rehearsalBounds(project, rehearsalId), meter = projectMeter(project), spans = tempoSpans(project);
    const start = countToSeconds(project, bounds.start), end = countToSeconds(project, bounds.end);
    const clock = new RehearsalClock({ totalSeconds, rangeStart: start, rangeEnd: end,
      offset: project.audioOffsetSeconds, media, now });
    let raf = 0, writing = false, disposed = false, plan: ClickPlan | null = null;
    const current = () => !disposed && store.getState().project.present === project && store.getState().playback.rehearsalId === rehearsalId;
    function updateClicks(force = false) {
      if (!current()) { audio?.update(null); return; }
      const transport = store.getState().playback, sample = clock.sample(), at = now();
      const leadEnd = clock.countInEndTime;
      const audible = sample.playing && sample.status !== 'waiting' && (transport.metronome || leadEnd !== null);
      if (!audible) { if (plan) audio?.update(null); plan = null; return; }
      if (!force && plan) {
        if (leadEnd !== null) return;
        let predicted = plan.seconds + (at - plan.anchorTime) * plan.speed;
        if (plan.loop && predicted >= end) predicted = start + (predicted - start) % (end - start);
        // Media remains authoritative; cancel future clicks after a real drift
        // or handover. Ordinary frame/timer quantization does not requeue beats.
        if (clockDifference(predicted, sample.seconds, end - start, plan.loop) < .05 && plan.clicks === transport.metronome) return;
      }
      const secondsPerCount = spans.find(s => sample.seconds < s.seconds + s.counts * s.secondsPerCount)?.secondsPerCount ?? spans.at(-1)?.secondsPerCount ?? .5;
      const counts = transport.countInBars * meter.numerator;
      const beatSeconds = secondsAt(spans, Math.round(countAt(spans, sample.seconds)));
      // Give the first render block a small delivery margin for an exact start
      // beat. Later synchronization never replays the beat just emitted.
      const cue = !plan && leadEnd === null && sample.seconds >= beatSeconds && sample.seconds - beatSeconds < .02;
      plan = { spans, meter, anchorTime: leadEnd ?? (at + (cue ? .01 : 0)), seconds: cue ? beatSeconds : sample.seconds, speed: transport.speed,
        // During a recording's lead-in, the audio thread emits only lead-in
        // clicks. Show clicks begin after media confirms its actual start.
        start, end, loop: transport.loop, clicks: transport.metronome && !(media && leadEnd !== null),
        ...(leadEnd === null ? {} : { countIn: { startTime: leadEnd - counts * secondsPerCount / transport.speed,
          counts, startCount: countAt(spans, sample.seconds), secondsPerCount } }) };
      audio?.update(plan);
    }
    function publish(updatePosition = store.getState().playback.playing) {
      if (!current()) return;
      const sample = clock.sample();
      const rawCount = sample.seconds >= totalSeconds ? duration : secondsToCount(project, sample.seconds);
      const count = Math.abs(rawCount - Math.round(rawCount)) < 1e-9 ? Math.round(rawCount) : rawCount;
      writing = true;
      try {
        if (updatePosition) {
          store.setValue('playback', 'count', count);
          store.setValue('selection', 'activeIndex', sampleTimeline(project, count).setIndex);
        }
        store.setValue('playback', 'playing', sample.playing);
        const leadEnd = clock.countInEndTime;
        const status = leadEnd !== null ? `Count-in · ${Math.max(1, Math.ceil((leadEnd - now()) * store.getState().playback.speed / (plan?.countIn?.secondsPerCount ?? .5)))} remaining`
          : audioUrl ? clockStatusText[sample.status] : '';
        store.setValue('playback', 'clockStatus', unavailable && (store.getState().playback.metronome || leadEnd !== null) ? 'Metronome unavailable · check the audio output' : status);
      } finally { writing = false; }
    }
    function frame() { raf = 0; publish(); schedule(); }
    function schedule() {
      if (!current()) { cancelAnimationFrame(raf); raf = 0; audio?.update(null); return; }
      if (store.getState().playback.playing && !raf) raf = requestAnimationFrame(frame);
      else if (!store.getState().playback.playing && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    function update(transport: ReturnType<typeof store.getState>['playback'], seek: boolean, starting: boolean) {
      if (transport.playing) void ctx?.resume().catch(() => { unavailable = true; });
      const seconds = countToSeconds(project, transport.count);
      const countSeconds = spans.find(s => seconds < s.seconds + s.counts * s.secondsPerCount)?.secondsPerCount ?? .5;
      const delay = starting && transport.countInBars ? transport.countInBars * meter.numerator * countSeconds / transport.speed + .06 : 0;
      clock.update(transport, seek ? seconds : undefined, delay);
      updateClicks(true);
    }
    let previous = store.getState().playback;
    update(previous, true, previous.playing); publish(); schedule(); previous = store.getState().playback;
    const unsubscribe = store.subscribe(() => {
      const next = store.getState().playback, before = previous; previous = next;
      if (writing) return;
      if (!current()) { audio?.update(null); return; }
      const seek = next.seekVersion !== before.seekVersion || next.count !== before.count;
      if (seek || next.playing !== before.playing || next.speed !== before.speed || next.loop !== before.loop || next.countInBars !== before.countInBars) {
        update(next, seek, next.playing && (!before.playing || clock.countInEndTime !== null));
        publish(next.playing || (!seek && before.playing)); schedule();
      } else if (next.metronome !== before.metronome) updateClicks(true);
    });
    const timer = window.setInterval(() => {
      if (!current() || !store.getState().playback.playing) return;
      const counting = clock.countInEndTime !== null;
      updateClicks();
      const ended = !clock.sample().playing;
      // Frames own position writes. Only count-in status and an exact natural
      // stop need publishing when the compositor is not asking for frames.
      if (counting || ended) publish(ended);
      schedule();
    }, 25);
    const onMedia = () => { updateClicks(); publish(); schedule(); };
    const events = ['loadedmetadata', 'canplay', 'playing', 'waiting', 'seeked', 'ended', 'error'] as const;
    events.forEach(event => media?.addEventListener(event, onMedia));
    return () => {
      disposed = true; unsubscribe(); cancelAnimationFrame(raf); clearInterval(timer); audio?.dispose();
      events.forEach(event => media?.removeEventListener(event, onMedia)); clock.dispose();
    };
  }, [store, project, audioUrl, audioRef, rehearsalId]);
  useEffect(() => () => { const ctx = audioContext.current; audioContext.current = null; void ctx?.close(); }, []);
}
