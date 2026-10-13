# Schema v2 decision and integration gate

This is the format decision and codec foundation for issue #5. The editor and desktop file bridge still use v1 in this change. The new codec is deliberately separate until sampling, editing, analysis, exports, recovery and native open/save all consume v2 together. Issue #5 stays open until that integration and its acceptance checks pass. Issue #47 owns the public machine-readable specification and external compatibility package.

## Pictures and moves

Keep the project ID, field, ensemble, sections, performers, audio offset and all existing entity IDs. Keep the ordered `sets` array; each picture has `id`, `name`, `notes` and a complete `positions` map. Coordinates remain yards, with the established field convention and limits. A picture has no duration, tempo or easing.

Add an ordered `moves` array with exactly one move between each pair of adjacent pictures. Move i connects sets i and i+1 through `fromSetId` and `toSetId`. Each move has its own stable ID, positive integer `counts`, `tempo`, `transition` (`linear` or `ease`) and `paths` map. Moves are chronological; skipped, reversed, dangling, duplicate or missing connections are rejected. One picture has zero moves. Keep the current 128-picture limit, so at most 127 moves exist.

Opening count is intrinsically zero. `openingTiming` preserves v1's stored opening `tempo` and `transition` as inert compatibility metadata. Neither changes playback and neither creates a fictitious move. Notes remain attached to their original picture. Future move notes, tempo maps, meters or submoves require a documented extension and consumer support rather than repurposing picture notes.

## Performer paths

`paths` is a sparse map keyed by performer ID. An omitted performer uses the straight line between its positions in the move's endpoint pictures. Migration therefore emits `{}` rather than duplicating geometry for 500 performers across 127 moves. Endpoint edits change implicit paths naturally.

An explicit path contains `segments`. The baseline codec supports exactly one segment: `{id, kind: "line", startCount: 0, endCount: move.counts}`. Its geometry is also derived from endpoint pictures. Segment IDs are scoped to the owning performer path. This identifies future editable segments without duplicating endpoint coordinates. Move easing applies to normalized progress over the entire move, matching v1 smoothstep exactly; segment counts refer to elapsed musical counts, not eased distance.

The segment union and sparse path map are extension points for the separately scoped curved-path, hold, follow-the-leader and detailed-motion issues. Unsupported kinds or multiple segments fail with an update instruction. They cannot be silently rendered as a straight line or removed while saving. Those features must define control geometry, join continuity, count partitions, sampling and analysis together before broadening this validator. There is no promise that a reader lacking those features can open such a file.

## Compatibility and canonical form

The codec accepts integer wire versions 1 and 2. A valid v1 file migrates deterministically: each original picture becomes a v2 picture; each non-opening picture supplies the timing for the incoming move; new move IDs are `move-v1-1`, `move-v1-2`, etc. New move IDs have a separate collection namespace, so existing picture/performer/project IDs cannot collide with them. IDs of all existing entities, coordinates, timing, easing, notes and audio offset remain unchanged. Migration has no random, time, storage or network dependency and never mutates its input.

The transitional `projectV2AsLegacy` adapter is an internal compatibility oracle. It can reproduce the validated v1 representation for today's supported straight paths and allows comparison with the existing sampling, time conversion, collision/stride analysis and CSV engine. It is not an exposed downgrade/export command; v2 move and segment identities cannot be represented in v1.

Validation rebuilds detached canonical objects. Both versions use the established geometry, roster, ID, text and numeric limits; v2 adds move endpoint and supported path validation. Unknown informational properties are discarded, as in v1. Legacy timing fields on v2 pictures are rejected because discarding them could change playback intent. Unknown path kinds are rejected because discarding them changes geometry. IDs cannot be prototype keys. Path map order follows roster order, so input property order does not change serialized output.

Parsing and serialization enforce the existing 10 MiB UTF-8 budget, including multibyte text; JSON output is compact with a trailing newline. Unsupported newer schema versions produce an actionable update error. No file is overwritten by the codec. A migration that exceeds the serialized budget fails on save instead of truncating content.

## Remaining editor integration

Before enabling v2 file output, replace the editor's canonical project type and creation templates, move all playback/analysis/export timing reads onto moves, and update timing editing, duplicate/add/remove/reorder commands to preserve valid relationships and surviving identities. Integrate native open/save and recovery parsing with the same version policy. Keep incoming-move timing visible in the Inspector and make opening timing's inert meaning clear.

Cover every command and file workflow, including undo/redo, roster updates, single-picture shows, maximum fixtures, canceled/failed saves and opening-set removal/reorder. Compare arrival and mid-move samples, fractional tempos, easing and analysis with the existing engine. A green isolated codec suite completes the codec foundation; it does not fulfill this integration gate or close issue #5.
