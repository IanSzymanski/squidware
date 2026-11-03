# Individual travel-path authoring

At an arrival picture, pause and select exactly one performer. **Edit performer
path** opens cubic controls for a simple move, or the interval editor for a
scheduled move. **Draw performer path** opens the interval editor in Draw Path
mode. Both actions are also in the command palette. Empty or multiple selections
never implicitly target the cast.

## Field editing

Select an interval with the interval selector, its row button or its field path.
Only that interval's control and intermediate-arrival handles are exposed.
Square set endpoints are fixed. Drag a handle to preview; numeric fields use the
same stored coordinates. Moving an intermediate arrival changes the following
segment's start, preserving the shared endpoint chain. Holds have no handles.

The field is one Tab stop. `[` / `]` choose handles within the selected interval;
arrows move 0.1 yard and Shift+arrows move 1 yard. Optional **Snap handles** uses
the production's shared grid/marking settings; numeric entry remains exact.
Handle hit areas and labels retain their screen size at 1×, 2× and 4× field zoom.
Zoom centers on the move endpoints; return to 1× or use numeric fields for points
outside the zoomed viewport. Display zoom never changes physical geometry.

Escape or pointer cancellation during a drag restores its starting coordinate.
Escape in field drawing mode cancels the captured stroke; another Escape closes
the editor. Apply accepts the reviewed draft as one named undo action. Until
Apply, the production and history are unchanged. Stale revisions, project sessions,
move targets and selections are rejected by the shared movement command.

## Drawing one travel interval

Choose **Draw Path** and drag from the selected interval's start square to its
end square. Start/end capture snaps to either endpoint within 8 screen pixels.
For a backwards capture, **Reverse stroke direction** reverses the captured
point order before fitting; it does not reverse the show or swap set pictures.
Use Move operations for a reviewed reversal of actual movement and timing.

**Place anchors** supports clicking intermediate anchors or adding exact numeric
X/Y coordinates. The start is supplied and the fixed end is appended during
fitting. **Fit stroke** changes only the local preview. It replaces the selected
travel with line or editable cubic-chord intervals, leaving every other travel,
hold, outer departure/arrival count, performer and set picture intact.

Capture retains at most 2,048 points and suppresses consecutive samples less than
0.005 yard apart. Fitting uses deterministic iterative Ramer–Douglas–Peucker
simplification in field units. Default tolerance is 0.15 yard, configurable from
0.01 to 1 yard. The tolerance describes deviation from the captured, attached
polyline, not unobserved physical motion between input events. Endpoint attachment
error consumes part of that budget. Straight chords stay within the remaining
budget; cubic controls start at the chord's one-third/two-thirds points and have
exactly the same locus. No automatic smoothing is claimed. Corners, loops and
self-crossings larger than the tolerance are retained; users can refine cubic
handles after fitting. Later manual edits are not covered by the capture-fit bound.

At most 32 total intervals, including existing holds, may be accepted. Complex,
tiny, nonfinite, unattached, out-of-field and unrepresentably short requests fail
without partial production edits; tolerance is never silently increased. Interior
counts divide the original interval in proportion to fitted chord lengths.
Per-segment easing remains active and can change speed at fitted joins; review
the counts and geometry before Apply. Holds and fixed interval bounds stay intact.

## Samples and persistence

The solid path uses shared vector geometry and the dashed path shows saved
geometry. Count dots, sampled performer position and the expandable count table
use `sampleMovement` / `sampleProject`, including easing, fractional interval
boundaries and held positions. Work is bounded to at most 97 count samples.
Travel distance uses the existing shared path-length evaluator. Paths may cross
themselves or other performers: review spacing and peak stride in Problems after
Apply. Destination spacing and a rendered curve provide no clearance guarantee.

Only fitted segments, handles and counts are serialized in the existing format;
raw pointer strokes are discarded. Playback, 2D/3D, analysis, print, save/reopen
and undo consume the same serialized geometry. No project schema changes.

This delivers individual interval drawing and field editing for #75.
[Shared routes](shared-routes.md) add independent open/closed geometry, drawing,
seam editing and persistence. Using those routes with #50's conveyor/member
timing remains follow-up work. #75 must remain open for that expanded scope.

## Validation

`src/editor/pathAuthoring.test.ts` checks both directions of fitting deviation
against an independent segment-distance oracle, limits, holds, endpoint and
identity preservation, count ticks, transaction guards and native-codec reload.
`node scripts/path-authoring-qa.mjs` exercises native pointer/keyboard paths,
cancel, numeric equivalence, attachment/reversal, persistence, themes, enlarged
UI and 2/64/500 performer previews. It is registered in the common desktop suite.
Rendered review and measured host limits are recorded in
[the evidence directory](evidence/path-authoring/README.md).
