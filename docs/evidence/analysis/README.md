# Background transition analysis evidence

Production Electron 44.7.0, Linux/Xvfb, October 21, 2026. The same deterministic A02 maximum fixture contains 500 performers and 128 sets. Native key/character input and Chromium input APIs exercise keyboard actions; setup and fault injection use the inspected renderer store and worker boundary.

- [Before, main fa06ce2, 1366 × 768](analysis-before.png)
- [After, current move flags, 1366 × 768](analysis-ready.png)
- [Pending check, stale flags hidden](analysis-pending.png)
- [Worker failure and retry](analysis-failed.png)
- [Light theme, 1366 × 768](analysis-light.png)
- [High contrast, 1366 × 768](analysis-high-contrast.png)
- [High contrast, 1024 × 720 at 125%](analysis-enlarged.png)
- [Behavior results and worker timings](results.json)
- [Build and run provenance](run.json)

The field remains 485 px tall at the default laptop viewport. Pending and failure states replace flag results without changing workspace geometry. Before/after images preserve the existing flag text/actions and dense-count badge sizing. Supported theme and enlarged-layout captures were visually inspected. Retry is keyboard accessible; stale replies, undo and same-ID project replacement are behavior assertions. Physical geometry and save/undo checks retain the existing editor suite owner. See [behavior and design review](../../BACKGROUND_ANALYSIS.md).

The archived baseline is comparison evidence, not certification. The results record the source snapshot before generated evidence was copied into the repository; adding evidence changes its working-content hash. Hosted CI owns Windows/macOS/Linux certification; writer/device checks remain #64/#3. Compute comparisons have their own source/fixture fingerprints in [the raw report](../../performance/analysis-comparison.json).
