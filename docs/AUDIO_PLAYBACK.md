# Audio-clock rehearsal playback

For #13 (Audit A12), playback reads the attached HTML audio element's `currentTime` and converts that time through the written move tempos. It does not periodically seek music to match animation frames. Dropped frames reduce visual smoothness but do not ask the recording to jump to a second clock. While audio buffers or seeks, the field waits with it.

## Timing semantics

- Audio time = show time in seconds + the production's audio sync offset. A positive offset skips that many seconds into the recording; a negative offset delays its entrance. Offsets remain production data and keep the existing `.squid` schema and undo behavior.
- Before the recording starts and after it ends, the show continues silently from a single `performance.now()` anchor at the selected rehearsal speed. The audio lane names these states. Track playback begins with one intentional seek when the silent lead-in reaches the recording; the recording's end anchors the silent tail.
- Scrubbing stops playback, updates field/timeline together and seeks the recording once. A seek requested before metadata is available completes when metadata arrives. Outside the recording, the paused media parks at its start or end.
- Paused set navigation and timing edits retain the command’s exact count and selected set, including a return to the same count before the next animation frame.
- Pause samples the audio position and stops it. Resume continues from that position without a correction seek. A speed change keeps the current show position, sets the audio's playback rate and reanchors any silent segment. Written tempos are unchanged.
- Whole-show looping wraps show time and seeks the audio once to the wrapped time plus offset, including the remainder of a late frame. Without looping, playback stops at the exact final count. A track can be shorter or longer than the show.
- Replacing audio pauses playback, retains the current show count and aligns the replacement to that count and the production offset. Project/timing/offset changes rebuild the clock from the current count; they may intentionally realign the recording.
- Missing audio uses the monotonic silent clock immediately. A media error, rejected play request, or ten seconds without media progress switches to silent playback from the last known show position. The audio lane explains the fallback. There is no repeated automatic play/seek retry: pause and play retries the attached track. Replacing the recording also resets failure state. Late rejected play promises cannot affect a later transport action or a disposed clock.

Mute changes sound output and leaves the audio clock running. Plain `.squid` saves keep audio session-only; [portable packages](AUDIO_PACKAGES.md) bundle or reference recordings for transfer and automatic reopen. An audio-worklet [metronome and count-in](metronome.md), [score map](score-map.md), and [tempo ranges, ramps and fermatas](tempo-map.md) share the written count axis. The recording remains authoritative for show seconds.

## Implementation and validation

`src/editor/rehearsalClock.ts` isolates media and monotonic timing from React. The playback controller subscribes to transport changes directly and publishes sampled counts to the existing store. Normal playhead updates do not subscribe the shell or Inspector to frame changes. The status text subscribes only in the timeline and uses existing theme tokens; it adds no field-height cost and does not appear without attached audio.

Run `pnpm test`, `pnpm test:contracts`, `pnpm build`, and `pnpm test:native`, then `xvfb-run --auto-servernum pnpm test:workflows --suite=audio-clock,playback` on Linux (normal desktop execution on Windows/macOS). The `audio-clock` suite is part of required desktop certification. It generates a ten-minute mono PCM recording with periodic pulses, attaches it through the real file input, rehearses near the end at all five speeds, forces 900 ms renderer stalls and checks that media time drives counts/field geometry with no correction seeks. It also covers tempo boundaries, native keyboard scrubbing and pause/resume, both offset signs, short-track handover, replacement, loops, failure/retry and supported themes/enlarged layout.

The unit tests simulate long decoder/renderer divergence, buffering, metadata delay, seek completion, end-of-track behavior, monotonic fallback and stale asynchronous failures. These are automated timing/interaction checks. They do not claim subjective listening review, actual device latency or representative school-hardware qualification; those broader checks remain #64/#3.

Design guidance sections 1–4 apply: retain the compact transport, reuse existing commands/tooltips/theme tokens, preserve coordinates and project compatibility, and explain waiting/failure through text as well as sound. Interaction and rendered review evidence is recorded in `docs/evidence/audio/README.md`.
