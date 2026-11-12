# CI focus and overflow follow-up

CI run [43115764310](https://github.com/IanSzymanski/squidware/actions/runs/43115764310), for PR #205 head `9a55ef5`, passed source certification but failed desktop certification. Linux and Windows each passed 48/49 suites and timed out waiting for transform parameter focus in `workspace`. macOS passed 47/49 and failed the moved Shape tooltip assertion and the More opener in `themes`.

Opening a pane queued heading focus for the next frame. A preview started before that callback could focus its parameter first, only to lose focus to the older reveal callback. Pane reveal now yields to an active preview. The native workspace regression starts a transform in a microtask after the actual Show Inspector click, deliberately before the queued callback, and requires the operation select to retain focus.

A context change can move or remove the focused More action. The toolbar now returns that focus to the stable More trigger before closing the menu; it does not move focus that has left the toolbar. The native toolbar regression changes selection while More owns focus and checks that focus stays on a visible toolbar stop.

QA resolves a toolbar command after its context and responsive row commit, opens More with its documented Arrow Down interaction, and waits for acknowledged native key release and actual menu focus. The tooltip owner reacquires Shape after changing selection moves its entry point. It retains disabled-reason and current-description assertions.

The broader accessibility check exposed a separate fixture race: simultaneously changing native window size and personal UI scale could pass through compact before full, correctly landing on Loop instead of the test's expected Rehearsal passages. That resize case now holds scale and panel choices fixed, restores the original layout afterwards, and retains separate focus-mode and UI-scale-under-dialog cases. No transport focus assertion was removed.

The production build, 1,026 source tests, 99 native/service/harness checks and 35 contracts pass. `ci-focus-targets.json` records the four targeted suites passing and the initial accessibility fixture failure; `ci-focus-accessibility.json` records the corrected accessibility suite passing. The latest cross-platform CI result is linked from the PR. Existing evidence remains historical; these changes preserve command execution, geometry and project history.
