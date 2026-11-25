# Footprint clearance review

The example crosses a platform on a curved performer path and brings a rotating scenic panel inside the speaker's required edge gap. Open **Show-wide problems** and select **Clearance** to review both findings. [Example production](../../../format/examples/clearance-v20.squid)

| View | Evidence |
| --- | --- |
| Analysis rules, before and after | [Before](before-rules.webp) · [With clearance enabled](rules.webp) |
| Findings for both pairs | [Filtered results](findings.webp) |
| Field review at the reported count | [Performer and platform](performer-prop.webp) · [Panel and speaker](prop-pair.webp) |
| High contrast, 150% UI scale, 940 × 650 | [Rules with reachable actions](high-contrast-150.webp) |

The change uses the shared timeline markers, problem dialog, prop editor and undo commands. The field measured 513 px high at 1366 × 768. The rules content scrolls independently so **Cancel** and **Save rules** remain visible at narrow sizes. Field review uses a solid outline for confirmed findings, a dashed outline for possible findings and a text status alongside the field. [Design guidance](../../DESIGN_GUIDANCE.md)

The Chromium replay used keyboard and pointer navigation, checked invalid rule input, reviewed both pairs, edited prop shape and visibility, undid the edit, and saved and reopened the production. The default dark and enlarged high-contrast layouts were inspected. Automated geometry fixtures cover distinct edge gaps, curved and rotated motion, timed prop travel, changing visibility, stale result invalidation and 34,016 candidate pairs at the 500-performer and 64-prop limits. [Browser replay](../../../scripts/clearance-browser-qa.cjs)
