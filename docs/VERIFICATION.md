# Initial release verification

This records checks completed during development of Squidware 0.1 in October 2026. Local application and visual checks were performed on Windows. It is a verification snapshot, not a claim of full Pyware parity, exhaustive device coverage, or completed macOS/Linux release testing.

## Completed checks

| Area | Result |
| --- | --- |
| Drill engine | **58 tests passed**: formation geometry, field fitting, group transforms, schema validation and limits, timeline/timing, roster CSV, coordinates, and transition analysis |
| Desktop boundary | **14 tests passed**: native file handlers, atomic writes, canceled dialogs, invalid requests, preload methods, sender validation, and window isolation |
| TypeScript and renderer build | Strict TypeScript checking and the Vite production build passed |
| Native Electron launch | Built application loaded its studio, field, and preload bridge; the demo rendered **64 performers and 6 sets**, with no renderer Node access |
| Field-chart PDF | Demo export produced **6 landscape pages**; page structure and representative rendered output were checked |
| Performer PDF | Demo export produced **64 landscape pages**; page structure and representative rendered output were checked |
| GUI review | The Windows design workspace and core interactions received manual review in addition to automated checks |

The automated sources are [domain.test.ts](../src/domain.test.ts) and [desktop.test.cjs](../scripts/desktop.test.cjs). Native launch checking is implemented by `--smoke-test` in the [Electron main process](../electron/main.cjs).

## Repeat the automated checks

With the documented Node/pnpm versions and Electron binary installed:

```sh
pnpm test
pnpm test:desktop
pnpm build
pnpm exec electron . --smoke-test
```

The native smoke test uses an isolated temporary app profile and exits after checking the rendered workspace. A graphical session is required; [CI](../.github/workflows/ci.yml) includes the Linux Xvfb and Chromium sandbox setup.

## What this does not establish

- Windows local results do not establish that the configured macOS and Linux packages have been built or exercised successfully.
- Passing unit and native-boundary tests does not exhaustively verify every interactive workflow, audio codec, graphics device, or platform dialog.
- The PDF checks cover the six-set demo. Large ensembles, long tables, and unusually long labels or notes need representative print review.
- The documented 500-performer and 128-set limits are supported data limits, not a measured performance guarantee on every machine.
- Transition checks are geometric planning aids; they do not validate physical clearance or real-world marching safety.

The [user guide's acceptance walkthrough](USER_GUIDE.md#acceptance-walkthrough-for-a-new-build) is a reusable checklist for later builds. Its presence does not mean every listed scenario was included in this verification snapshot. Release packaging and hosted CI results should be checked separately for the exact commit being distributed.
