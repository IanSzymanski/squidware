# Validation policy

## Maintainer decision — 2026-10-22

The maintainer directed: “remove all human and hardware gates.” This decision applies to every Squidware implementation issue, roadmap goal and release, and supersedes earlier human/hardware requirements in issue checklists, design guidance, evidence notes and scheduled maintenance instructions.

Human approval/signoff, writer or representative-user sessions, first-time discovery reviews, subjective listening, school-laptop qualification and physical-device testing are not conditions for implementation completion or release publication. Optional feedback or device measurements may still be recorded without holding up the queue.

## Remaining acceptance

- Keep functional acceptance criteria, deterministic fixtures, automated interaction checks, rendered-output inspection, accessibility contracts, source tests and regression coverage.
- Use available software hosts, supported browser engines, isolated clients, emulation, constrained-runtime settings and fault injection where applicable. Record their limits; do not claim untested physical-device behavior or human usability validation.
- Keep exact-source main CI, Windows/macOS/Linux package builds and verification, immutable tags, checksums and automated release readiness checks. Signing/authenticated-update requirements in #72 remain part of the product scope.
- Record design guidance and measured deviations. Agent/software review and a documented resolution are sufficient; additional human signoff is not a gate.
- Preserve historical results and failures. A removed requirement is waived, not passed. Removing these gates does not repair a failed automated test or complete unrelated feature scope.

## Backlog reconciliation

[#3](https://github.com/IanSzymanski/squidware/issues/3) is complete on its delivered deterministic fixtures, local production Electron measurements and documented investigation budgets after removal of the remaining school-hardware gate. The measurements retain their host-specific limits.

[#64](https://github.com/IanSzymanski/squidware/issues/64) retains only software-based platform/coverage review and a ranked findings report using #69's existing regression tooling. Participant sessions and the first-time discovery check deferred from #36 are removed; no such sessions are claimed.

Device-dependent acceptance in canvas, mobile/offline viewing, QR delivery, synchronization and 3D work uses software-based tests and recorded emulation limits. The release sequence and existing feature ownership remain unchanged.

The Release train owns publication. Issues close only when their remaining criteria are fulfilled; tracker #1 closes only after all implementation children are fulfilled. Future maintenance must not restore superseded human/hardware gates.
