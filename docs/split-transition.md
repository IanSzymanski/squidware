# Split a transition

Select the destination set and choose **Split transition** in Inspector → Set properties, or search for it in the Command palette. From the opening set, the action targets the first move. Playback pauses; an interior paused playhead suggests the nearest whole count, otherwise the preview starts at the midpoint.

Enter a whole local count strictly inside the move. A 16-count move split at 5 becomes 5 + 11 counts, with the same tempo and total duration. The preview shows every performer's position from the shared engine. Use the comparison slider (including arrow keys), **Show split picture** and, for eased moves, **Show largest change** to review movement before applying.

**Constant speed:** the original trajectory and clock are preserved throughout both moves, including fractional playback counts.

**Ease in / out:** the split picture matches the original eased sample. Both resulting moves use constant speed, so motion between pictures changes and speed changes at the split. The preview compares the original and proposed movement and reports the maximum performer displacement and its count. Accept that change explicitly before Apply; editing the split count clears the acceptance. Cancel retains the original eased move. There is no claim that two new ease-in/out moves preserve the original easing.

Apply adds the picture and rewires the moves as one named undo action, then pauses at the new picture. Existing sets keep their names, notes and coordinates; the new set has blank notes and an editable name beginning “Split”. Both moves inherit the tempo and straight-line marching direction declarations. The original move ID and explicit line segment IDs stay with the original destination; the first part receives new IDs and each part's explicit line spans its own duration.

Musical score anchors, meter, audio offset and show counts stay unchanged. Valid rehearsal references inside the move are remapped to the appropriate part at the same absolute show count; a bookmark exactly at the split becomes a reference to the new set. Existing stale references remain stale. Saved passage annotations and focus are retained.

Endpoints, fractional/nonfinite counts, moves shorter than two counts and productions already at 128 sets cannot split. The opening picture has no incoming duration to split. A changed project revision or replacement session cannot apply an old review. No project-format fields are added; migrated v1 projects use the same behavior. This supports the current single-line path model; later curved/submove paths need their own partition policy.

See [the implementation evidence](evidence/split-transition/README.md) and [test ownership](TESTING.md).
