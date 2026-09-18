# Changelog

## 1.0.2 — 2026-09-18

### Fixed

- Renamed the development `build` scripts to `compile` so npm does not classify the Git repository as requiring Git-dependency build preparation.
- Kept precompiled `dist/` in the repository.
- Restored direct installation via `npm install -g "github:yuanyi1415/Continuum"`.
- Updated CI and development docs to use `npm run compile`.


## 1.0.1

### Installation

- Added a Git dependency-safe installer (`install.sh`).
- Recommended installation now uses `git clone → npm pack → npm install -g local.tgz` instead of `npm install -g git+...`, avoiding an upstream npm global Git dependency preparation failure. — 2026-09-18

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
