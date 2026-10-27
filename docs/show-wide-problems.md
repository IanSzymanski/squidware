# Show-wide problems

Open **Show-wide problems** from the Inspector, the timeline’s triangle/count button, or command search. All incoming moves are checked, including while the opening set is selected. Findings carry severity, move and destination set, absolute and move-local counts, show time in seconds, performer IDs, and an explanation of the applied spacing/stride rule. Times use the written tempo map; they are show times, independent of the attached recording’s offset.

Filter by severity, type, move, or label/ID/set/rule text; sort by count, severity, or move. The panel renders 40 findings per page with explicit totals and previous/next controls. Current-move Inspector flags now page in groups of 12. Neither list drops findings. Nearby timeline flags share a marker to bound rendering; the marker names its group size and opens the first finding. The complete group remains available in the panel.

Choosing a finding uses the shared `analysis.problem-review` command to stop playback, clear a rehearsal focus, seek the exact (possibly fractional) count, select the affected IDs, and return to 2D Design. Dashed paths and rings highlight that finding. Clear highlight dismisses the overlay; playback or moving to a different count hides it. Reviewing a finding does not edit positions, saved rules, file state or undo history. Finish a pending edit/preview before navigating.

## Ownership and freshness

A session-owned service queues one move at a time through the existing analysis worker; it never sends the whole production to the worker. The current move is preferred when choosing the next queued check. Reference signatures retain unaffected results. Editing a picture invalidates its incoming and outgoing moves synchronously. Timing changes invalidate later absolute counts; rule, roster and topology changes invalidate affected inputs. Undo and same-ID project replacement use the same ownership checks. Changed moves lose their flags immediately and are explicitly pending/stale until a new result arrives; completed unaffected moves remain available. Errors remain unavailable, with retry, rather than implying a passing show.

The panel displays saved project defaults and the number of section overrides; finding text explains the applied section/direction thresholds. Existing project rules and unknown-direction behavior from #44 remain authoritative. Personal preferences do not alter an open production’s rules.

A second worker owns drag snapshots. A 120 ms leading/trailing throttle checks both adjacent moves (one at either end of the show). Every pointer change immediately hides the previous draft overlay; only results for the latest snapshot can be displayed. Draft results are explicitly marked **not committed**, draw dotted paths and endpoint rings, and never enter committed results or history. Release commits the existing single position edit and checks its affected moves. Escape, pointer cancellation, context changes and unmount discard the draft. Worker failures have an explicit unavailable state and do not run synchronous analysis on the field thread.

All results stay in session memory; unusually dense shows can have many findings. Pagination and timeline grouping bound the rendered elements, not the number of findings. No project format or physical-coordinate convention changes.

## Design and validation

Shared design guidance sections 1–5 apply. The work reuses modal focus/dismissal, HelpButton/Tooltip, theme tokens, the editor store, worker lifecycle, selection and shared commands. Error rings and dashed/dotted geometry supplement status colors. Labels, counts and filters use 11–12 px text with tabular numerals where appropriate.

The dedicated marker lane uses 14 px. At 1366 × 768 and default scale the field is 471 px high, compared with 485 px before this change; it retains the approximately 470 px target. Narrow and enlarged layouts retain scrollable controls. The panel is a review dialog so the permanently visible Inspector does not grow. No new theme or persistence preference is introduced.

The `analysis` production suite owns whole-show reference comparison, complete native-keyboard pagination, filtering/search/sort, exact navigation, timeline input, draft pending/ready/cancel/commit, both adjacent checks, failure/retry, maximum-show coverage, rapid edits and layout captures. The existing `analysis-rules`, `timeline` and `playback` suites retain their boundaries. Source tests own signature invalidation, stale replies, count rebasing, command guards, worker restart and result grouping. Native/format suites retain file trust and compatibility. See [review evidence](evidence/show-problems/README.md).
