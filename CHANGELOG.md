# Changelog

## 1.1.0 — 2026-09-18

### Changed

- Host integration moved from repo-local installation to user-level Global Bridges.
- Added `continuum setup` for one-time Codex / OMP machine setup.
- Added `continuum doctor --global`.
- `continuum host install codex|omp` now installs globally by default; `--project` is legacy compatibility mode.
- Global Bridges discover `.continuum/project.yaml` from Host cwd and stay silent outside opt-in projects.

### Added

- Codex user-level Hook + Continuum MCP installation.
- OMP user-level Continuum Extension installation.
- Agent-facing `continuum_init`, `continuum_status`, `continuum_doctor` tools.
- Legacy repo-local Adapter deferral to prevent duplicate lifecycle processing.
- P11 production verification journey.

### Validation

- P11: 6 / 6 tests PASS.
- P01–P11: 74 / 74 regression tests PASS.

## 1.0.2 — 2026-09-18

### Fixed

- Renamed development `build` scripts to `compile` so npm Git installation does not trigger Git-dependency build preparation.
- Kept precompiled `dist/` in the repository.
- Restored direct GitHub npm installation.

## 1.0.1 — 2026-09-18

### Fixed

- GitHub global install no longer compiles TypeScript on the user machine.
- Prebuilt `dist/` is committed and shipped with the repository.
- Removed the install-time `prepare` build hook that caused `tsc: command not found`.

## 1.0.0 — 2026-09-18

Continuum MVP v1.0 baseline.

### Added

- Project initialization and portable Durable State.
- Change / Artifact Graph and typed relations.
- Work Binding and cross-session/worktree continuity.
- Matt observation and minimal Context Routing.
- Work Reconcile and lost-hook recovery.
- Change Reconcile, immutable Snapshot advancement and CAS Current.
- Codex repo-local Hook + MCP integration.
- OMP repo-local Extension integration.
- Design-conflict return-to-design / restart flow.
- Doctor, schema migration, runtime quarantine/rebuild and Host diagnostics.
- Self-contained Project Archive with SHA256 verification and optional Git history bundle.

### Validation

- P01–P10 production verification completed.
- 68 regression tests in the MVP closure baseline.
