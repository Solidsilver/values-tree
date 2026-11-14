# Values Tree: agent instructions

Read `PLAN.md` first. It is the source of truth for scope, architecture and build order.

## Ground rules

- Stack: SvelteKit 2 + Svelte 5 runes + TypeScript, adapter-node, Yjs, `ws`, `node:sqlite`. Pin the latest stable versions at install time.
- Collaboration is live co-editing via Yjs. Access is secret share links (edit and view), no accounts. Hosting is self-hosted behind Caddy, via Docker or the NixOS module in `flake.nix`. These decisions are final.
- `reference/original-artifact.html` is the working single-file original. Its embedded tree data has been emptied for the public repository. Port its **logic** faithfully (see the line map in PLAN.md section 2). Do not carry over its artifact-specific save/publish/draft code.
- `seed/our-family-values.json` is the owner's real data. It is private: gitignored and never committed (the repository is public). It must import cleanly. Never modify it. Tests use the made-up `tests/fixtures/sample-v2.json`.
- Keep `src/lib/model/*` pure (no Svelte, no DOM) and unit-tested. Server code under `src/lib/server/*` uses relative imports with `.ts` extensions so it runs under both Node and Vite.
- The server, not the UI, enforces view-only access.
- Self-host fonts and assets; make no third-party requests at runtime.
- Design: follow PLAN.md section 6. Avoid generic generated-looking UI. Check screenshots at 1440, 1024 and 390 px, light and dark, before calling the design done.
- Work milestone by milestone (PLAN.md section 7). Verify each with tests and a real browser before moving on. Run the two-client convergence tests before claiming collaboration works.
- Do not commit data/, build outputs or node_modules.
