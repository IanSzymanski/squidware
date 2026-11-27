# Performer facing and appearance

Select one or more performers in Write mode, pause at a set, and expand **Facing** in the Inspector's **Selection** section. Enter a heading in degrees and choose **Apply facing**, or press Enter. Zero points toward the front sideline, 90° toward Side 2, 180° toward the back sideline, and 270° toward Side 1. Escape or Cancel clears a draft. **Clear** returns the selected performers to unknown facing at that set. Set and clear operations each create one named undo entry. The onscreen field orientation changes which way the arrows point on screen while the saved heading stays fixed.

When both endpoint headings are authored, a performer turns through the shortest angle at a uniform rate in written counts. Half turns increase the angle. One missing endpoint leaves the heading unknown between the two pictures. Heading can change even while position is held. Copying or holding a picture carries its headings. Splitting a move saves the sampled heading at the split.

Select one performer in Cast and expand **Appearance** to choose an instrument or guard marker and a costume color. These choices apply across the show. The 2D field keeps the usual section dot around the costume color. In 3D, the cap keeps the section color and the torso shows the costume color. The instrument block and guard flag shape are simple identifiers. Body dimensions and clearance checks use their existing policies.

## Direction rules

**Analysis rules** uses a direction declaration first. Without one, a constant authored heading can classify the entire move as forward, backward, or sideways when the path has one clear direction relative to that heading. Paths on a direction boundary, paths with mixed directions, turning performers, stationary performers, and missing headings use base rules. A direction rule applies to the whole move. Inspection uses the same heading samples in 2D and 3D. [Analysis rules](analysis-rules.md)

The editable project writes version 13 when it contains a heading or appearance setting. Both are optional, and existing projects open with their previous visuals and direction rules. [Format contract](../format/FORMAT.md#v13-performer-facing-and-appearance)
