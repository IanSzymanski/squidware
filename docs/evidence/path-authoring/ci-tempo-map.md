# Tempo-map CI completion check

PR #164's first CI run passed source certification and the full Windows/Linux
desktop jobs. On macOS, 38 of 39 desktop workflows passed, including the new
path-authoring workflow. The only failure was tempo-map's fixed 25-second wait
for recorded playback to end: playback was still active at count
15.317370654413304, using the audio clock, with no renderer errors.

The test now observes media progress instead of assuming that a virtual audio
device completes a roughly seven-second phrase within that wall-clock window.
It fails after 10 seconds without media progress and retains a 60-second absolute
cap. Early transport stops, recording errors and silent fallback/tails fail;
the exact stopped count of 16 is still required. No seeks or playback retries
are introduced. Native Space toggles also wait for the requested transport,
paused state and decoder seek completion before subsequent measurements.

One transport sample per wall second, plus the successful final sample, is
written to `results-transport.json`, including media time, readiness, rate,
AudioContext time/state, playback state and page visibility. Failures report a
fresh transport snapshot as well. Existing held geometry, renderer stall,
positive media progress, analytic beat timing, missing-beat accounting,
pause/resume, loops and native export assertions remain in place.

Validation: production build and all 84 native tests passed, including the
shared progress helper's idle/absolute deadline checks. Tempo-map, audio-clock,
audio-alignment and metronome desktop workflows passed locally on the Linux
software host. The following CI run confirmed tempo-map on macOS. This changes only the
automated driver and diagnostics; rendered application/design review is not
applicable, and no application behavior or playback speed is changed.

## Remaining observed-clock checks

CI run 210 passed source certification and Windows/Linux desktop certification.
macOS passed tempo-map, then exposed two further fixed-delay assumptions:

- Audio alignment was still playing at count 13.166833333333331 after its
  25-second end wait. Its media was decoded and progressing at 0.75 speed, with
  currentTime 8.775125, duration 16, and a running AudioContext. It now uses the
  same 10-second media-stall deadline and 60-second absolute cap as tempo-map,
  preserves the exact stopped count 16, and rejects recording errors, premature
  stops and silent fallback. Final transport samples are retained as well.
- The failed-recording fallback check read the same count after a 300 ms host
  delay. It now observes 0.1 seconds of real AudioContext progress, settles two
  renderer frames, and still requires strictly increasing count and an unchanged
  play-attempt counter. The existing 20-second wait bounds a stalled context.
  Native Space delivery/pausing is acknowledged before further measurements.

AudioContext instrumentation retains the native implementation and only records
the active context. Snapshots include context/wall time and context state to
distinguish a delayed virtual output from a transport that fails to advance.
All 64 related clock/map/beat unit tests and 84 native tests pass locally.
Hosted validation of these remaining checks is pending.
