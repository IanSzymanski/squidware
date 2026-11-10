# Shared route authoring

Open **Shared routes…** from the Inspector or Commands while paused at a set.
No cast selection is required: these are named, production-local geometries,
independent of formation shapes, performer identity, set endpoints and timing.
Creating or editing a route does not assign performers or alter their playback.

**Draw stroke** captures an open stroke with free endpoints. **Place anchors**
accepts clicks and exact numeric coordinates. **Fit route** replaces the entire
draft route; inspect its handles and distance dots before **Apply route**. Raw
capture is never saved. Fit/Apply are separate steps, and switching saved routes
requires finishing the current draft. Cancel/Escape leaves the production and
history unchanged. Escape during a handle drag restores its starting geometry;
Escape during capture discards the capture before closing the editor.

The fitter reuses individual-path RDP simplification: 2,048 captured points,
0.005-yard consecutive pointer suppression, tolerance 0.01–1 yard (default
0.15), and at most 32 serialized line/cubic segments. Initial cubic controls
lie on chord thirds, so the reviewed locus preserves corners rather than
claiming automatic smoothing. The field-space tolerance bounds deviation from
the captured polyline, including closed-stroke attachment. It does not describe
unobserved motion between input events or subsequent manual handle edits.
Nonfinite, out-of-field, tiny, excessive and unattached closed captures reject
without changing the production or silently relaxing tolerance.

**Closed route** explicitly adds a closing line to the start seam. Opening a
closed route retains its segments and coincident endpoints. A closed freehand
stroke must finish near its starting point; attachment consumes the tolerance
budget. Placed anchors add an explicit closing chord. The serialized final
endpoint equals the seam exactly. Seam edits translate the adjoining controls
and both seam endpoints together. The editor reports corner/aligned/undefined
tangents; aligned directions do not imply speed continuity. Cubic controls can
be edited independently to refine a join. Closed geometry may cross itself.

Select a segment on the field or in the selector. Numeric inputs and field
handles share the same edits. Inputs and the length readout show yards to at
most three decimals (a new route starts at Y 26.667 on a college field); the
stored coordinates stay exact until you type or drag a new value. The field is
one Tab stop: brackets choose handles, arrows move 0.1 yard, Shift+arrows 1
yard, and optional snapping uses the existing production settings. Hit regions
keep their screen size at 1×/2×/4× zoom.
Moving an anchor translates its adjacent controls; invalid boundary-crossing
drags reject while numeric drafts retain a visible error. Split inserts an exact
de Casteljau midpoint without changing the locus. Remove reconnects the next
segment from the previous anchor and explicitly changes that geometry; the
closing segment is retained. Reverse swaps segment order and cubic controls,
keeping the same locus and closed seam. It does not reverse the show.

Distance ticks use `compileRoute`, which evaluates the saved cubics with the
shared movement sampler. Adaptive subdivision bounds the whole-route
chord/control-polygon length gap by 0.001 yard and local deviation from uniform
chord parameterization by 0.0005 yard. Independent dense integration fixtures
validate distance-position agreement within 0.002 yard. Open sampling clamps;
closed sampling wraps positive and negative distances at the seam. A lookup
table has a hard 65,536-entry budget; unresolved sampling fails clearly. Length
display uses the shared movement-length evaluator (0.001-yard bound gap).

Apply and confirmed deletion each use one named undo transaction, rechecking
the production revision, project session, target identity and complete route
validation. Names and IDs are unique across at most 64 routes. All geometry
stays inside the field. Saving routes requires [format v8](../format/FORMAT.md#v8-shared-routes);
projects without routes retain their least required older version. The renderer
and native file bridge use the same codec.

Shared-route geometry is consumed by [Group route movement](group-movement.md): ordered delayed followers, explicit counter-march cues, and open/closed arc-length conveyors. A route still owns no performers or timing on its own. The group editor adds count ticks, connectors and shared stride/spacing analysis, completing the route-consumption integration for #75/#50. Geometry edits/deletion are blocked while any group references the route; reroute/remove those groups first. Name-only changes remain available. Along-route intervals do not guarantee physical clearance.

Design guidance §§1–4 uses the existing Inspector, command registry, modal,
HelpButton, field controls, CSS tokens and Apply/Cancel conventions. The modal
keeps its footer fixed and its fields scrollable at enlarged/narrow sizes;
the underlying field layout retains its established height. Before/after,
theme, keyboard/pointer and native persistence evidence is recorded in
[the evidence directory](evidence/shared-routes/README.md).
