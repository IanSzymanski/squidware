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
software host. Hosted macOS confirmation remains pending. This changes only the
automated driver and diagnostics; rendered application/design review is not
applicable, and no application behavior or playback speed is changed.
