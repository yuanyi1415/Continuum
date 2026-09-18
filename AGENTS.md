# Continuum Repository Agent Guide

## Product

Continuum is a local-first project lifecycle control plane for long-running AI coding work.

The MVP v1.0 lifecycle (P01–P10) is complete. Do not reinterpret the product as a chat wrapper, workflow builder, daemon service, or Docker-first platform.

## Architecture invariants

- `domain/` depends on no outer layer.
- `application/` depends only on Domain + Ports.
- `adapters/` implement Ports and own unstable integration details.
- `cli/` is the composition root.
- Host SDK, Git CLI, filesystem, YAML and SQLite must not leak into Domain.
- Durable project state lives under `.continuum/` in user projects.
- Runtime state lives under `.continuum-local/` and is rebuildable.
- Critical lifecycle correctness must not depend solely on LLM initiative.
- Live Project uses federated authority; Archive is self-contained materialization.

## Change control

Stop and raise an architecture gap before introducing:

- a new durable project-state concept;
- a change in Project / Change / Work / Snapshot authority;
- an LLM-dependent correctness requirement;
- a new Host Interaction semantic that bypasses Core;
- automatic repair of ambiguous Durable Authority.

## Development

Required runtime: Node.js 24 LTS.

```bash
npm install
npm test
npm run build
```

All P01–P10 regressions must remain green.

## Installing Continuum into another project

Read `docs/Agent自助安装.md`. Do not manually recreate `.continuum/`, Codex hooks or OMP extensions when the CLI installer exists.
