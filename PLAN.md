# Values Tree: project plan

Turn the single-file "Family Values Tree" artifact into a standalone SvelteKit web app with excellent UI/UX and live sharing and collaboration.

This file was the original brief for the implementing agent. Read it together with `CLAUDE.md` and `reference/original-artifact.html` (the original app, with its embedded data emptied).

## 1. Decisions already made (do not relitigate)

| Topic | Decision |
|---|---|
| Framework | SvelteKit 2, Svelte 5 (runes), TypeScript, `@sveltejs/adapter-node` |
| Collaboration | Live co-editing with Yjs (CRDT). Edits merge automatically, with presence. Works offline and syncs on reconnect. |
| Access | Secret share links, no accounts. Each tree has an **edit link** and a **view-only link**. |
| Hosting | Self-hosted: Node + WebSocket sync + SQLite, shipped as Docker, with a Caddy example. Owner runs NixOS, Docker, Caddy and systemd. |
| Delivery | Code lives in this folder on the owner's Mac. |

The owner is a strong Linux and systems engineer (Go, Rust, Zig) who values self-hosted, open-source tooling. Avoid vendor lock-in and heavy dependencies.

## 2. What the existing app does (must be preserved)

The source is `reference/original-artifact.html` (1466 lines, vanilla JS). Its data model is richer than a plain tree:

- **Values form a DAG, not a tree.** A value can grow from several parents. It is drawn under each parent and shown with an "Also grows from..." tag. Loops are never allowed.
- **Roots** are exactly the values with no parents. Order is user-controlled.
- **Per-value fields:** `title`, `meaning` ("What it means to us"), `practice` ("How we live it"), `avoid` ("Not this"), `collapsed`.
- **Per-parent notes:** `notes[parentId]` is how that parent shapes the child.
- **Precedence rank:** `rank[]` orders a value's parents. The higher parent wins when they conflict. The default is "higher in the tree first".
- **Tree intro** ("Why we're writing this") and document title.
- **Views:** Tree (left-to-right branching cards, 5 root hues, fold/expand with counts, zoom) and Document (numbered outline, each value written in full once under its top-ranked parent, other spots show "Also includes...").
- **Side panel:** edit fields, lineage breadcrumb, "Shaped by" list with rank up/down and unlink, "Everything that shapes this" checklist (ephemeral ticks), children list, connect to another parent, arrange (up/down/out/in/move under), delete.
- **Delete semantics:** delete everything beneath, delete only this value (children lift up), or remove from this parent only. Children that still have other parents survive.
- **Interactions:** drag a card onto another to move it underneath, and Alt/Option-drop to also link it there. Keyboard: arrows to navigate, `C` child, `N` sibling, `Enter` edit, `Alt+Up/Down` reorder, `Delete`, undo/redo.
- **Export and import:** JSON (full DAG) and Markdown, plus import of JSON (legacy shapes `v2`/`v3` and nested form).
- **Polish:** light and dark themes, responsive down to mobile, reduced motion, accessible labels.

Port the **logic** faithfully. Where to look in the original:

| Concern | Lines (approx.) |
|---|---|
| `normalize()`: import shapes, loop removal, root derivation | 343-418 |
| placements, `reindex`, parent sorting, ancestors | 423-508 |
| render: tree branch HTML, doc plan/doc HTML, panel | 574-855 |
| ops: add/move/link/unlink/rank/delete/`deletionSet` | 857-1034 |
| export JSON/Markdown, import | 1101-1221 |
| events, drag/drop, keyboard | 1277-1430 |
| CSS tokens, tree connector CSS, card styles | 10-310 |

Drop the artifact-specific parts: `window.claude.use('artifact')`, `buildDocument()`, the `fvt-draft` localStorage drafts and the save/rev/conflict machinery. Yjs replaces all of that.

## 3. Architecture

```
Browser (Svelte 5)                       Server (Node)
┌───────────────────────┐   WebSocket    ┌─────────────────────────────┐
│ Y.Doc (source of truth)│◄──y-protocols─►│ in-memory Y.Doc per tree     │
│ y-websocket provider   │  /ws/<token>   │ role check (edit / view)     │
│ y-indexeddb (offline)  │                │ debounced persist ─► SQLite  │
│ Y.UndoManager          │                └─────────────────────────────┘
│ derive() ─► $state view│   HTTP         ┌─────────────────────────────┐
└───────────────────────┘◄──────────────►│ SvelteKit routes: create tree│
                                          │ rotate links, load metadata  │
                                          └─────────────────────────────┘
```

### 3.1 Server entry

- Production: `server.ts` at the repo root creates an HTTP server, mounts the adapter-node `handler` from `./build/handler.js`, and attaches a `ws` `WebSocketServer` on the `upgrade` event for paths under `/ws/`. Run it with `node server.ts`, which needs Node 22.18+ (unflagged type stripping). Use only erasable TypeScript syntax server-side (no enums or parameter properties) and **relative imports with `.ts` extensions** in `src/lib/server/*`, so they run under Node directly and under Vite.
- Dev: a small Vite plugin (`configureServer`) loads `src/lib/server/sync.ts` via `server.ssrLoadModule(...)` and attaches the same upgrade handler to Vite's `httpServer`. Use the SSR module graph so the SvelteKit routes and the sync server share one module instance. Do not intercept Vite's own HMR websocket (filter on the `/ws/` path).
- Expose a tiny hook on `globalThis` (for example `globalThis.__valuesTree.kick(treeId, role)`) so the "regenerate link" endpoint can disconnect sockets that used a revoked token.

### 3.2 Persistence (SQLite)

Use the built-in `node:sqlite` (`DatabaseSync`) to avoid native compilation, which matters for Nix and Docker. Fall back to `better-sqlite3` only if `node:sqlite` is unavailable. WAL mode. Single file at `$DATA_DIR/values-tree.db` (default `./data`).

```sql
CREATE TABLE trees (
  id          TEXT PRIMARY KEY,        -- public id, 12 chars base64url
  edit_hash   TEXT NOT NULL UNIQUE,    -- sha256 of edit token
  view_hash   TEXT NOT NULL UNIQUE,    -- sha256 of view token
  title       TEXT NOT NULL DEFAULT '',-- denormalised for the landing page, optional
  state       BLOB,                    -- Y.encodeStateAsUpdate(doc)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

- A single full-state row per tree is fine (documents are tiny). Persist debounced (about 1 s after the last change, max wait 5 s), and flush on last-client-disconnect and on SIGTERM/SIGINT.
- Evict docs from memory a minute after the last client leaves.
- Rate-limit tree creation per IP (simple in-memory token bucket) and cap doc size (for example 2 MB) and message size.

### 3.3 Share links and security

- Tokens are 16 random bytes (`crypto.randomBytes`), base64url. Store only SHA-256 hashes. Compare in constant time.
- URLs: `/e/<editToken>` (edit) and `/v/<viewToken>` (view-only). The WebSocket path is `/ws/<token>`. The server resolves token to `{treeId, role}`.
- **View-only is enforced on the server:** for `role=view`, accept sync step 1 and awareness messages, and drop any `sync update` or step 2 from the client. The UI hides editing too, but the server is the authority.
- Edit-link holders can **regenerate** the view link or the edit link (`POST /api/trees/:editToken/rotate` with `{which: "view" | "edit"}`). Rotating revokes the old token immediately by kicking connected sockets that used it. The new link is returned and shown once in the share dialog.
- Send `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on `/e/*` and `/v/*`. Tell Caddy to do the same. Do not log tokens (redact the path in access logs, see the Caddy example).
- Basic CSP, and escape everything (Svelte does by default). Never use `{@html}` with user text.

### 3.4 Client sync

Use the `y-websocket` **client** (`WebsocketProvider`) against our own server that speaks the same protocol via `y-protocols` (`sync`, `awareness`), plus `y-indexeddb` for offline cache keyed by tree id. Verify the current package majors at install time: `y-websocket` v3 moved its server utilities out, and the client is still `WebsocketProvider`. If it proves awkward, a ~100-line custom provider is acceptable.

Connection states to surface in the UI: *Connecting*, *Synced*, *Offline: changes saved on this device*, *Reconnecting*.

## 4. Yjs data model

A single `Y.Doc` per tree.

```
doc.getMap('meta')        title: Y.Text    intro: Y.Text    schema: number (3)
doc.getMap('nodes')       id -> Y.Map {
                              title:    Y.Text
                              meaning:  Y.Text
                              practice: Y.Text
                              avoid:    Y.Text
                              collapsed: boolean         // see note
                              children: Y.Array<string>  // ordered child ids
                              rank:     Y.Array<string>  // parent ids, precedence order (optional)
                              notes:    Y.Map<string,string> // parentId -> note (LWW)
                          }
doc.getArray('rootOrder') Y.Array<string>   // preferred order of roots
```

Rules:

- Use `Y.Text` for the long-form text fields so concurrent typing merges. Plain strings (last-writer-wins) are fine for notes.
- **Roots are derived**, not stored: they are the nodes with no parents. `rootOrder` only orders them (unlisted roots go after, sorted by id).
- **Loops can appear from concurrent edits** (A moved under B while B is moved under A). Handle this deterministically in `derive()`: run the same loop-cutting DFS as the original `normalize()` over nodes in a stable order (sorted by id) so every client cuts the **same** link. Do not mutate the doc from `derive()`.
- Deleting a node concurrently with someone adding a child to it: `derive()` must ignore child ids that do not exist, and adopt orphans as roots (the original already promotes parentless nodes to roots).
- `collapsed` is a **per-viewer** preference, not shared state. Keep it in local state (localStorage keyed by tree id) so one person folding a branch does not collapse it for everyone.
- A node's `rank` may reference parents that no longer exist. Filter when deriving, and append missing parents using the original `sortParents()` default.
- Every user mutation runs in `doc.transact(fn, LOCAL_ORIGIN)`. A `Y.UndoManager` tracks only `LOCAL_ORIGIN`, so undo/redo is per-user and never undoes someone else's work.

### 4.1 Derived state

`src/lib/model/derive.ts` is a pure function: `derive(doc) -> { title, intro, roots, nodes, parentsOf, placements, firstKey, stats }`. The Svelte layer holds it in `$state.raw` and recomputes on `doc.on('update')` (batched with `queueMicrotask` or rAF). Port `placements`, `reindex`, `sortParents`, `ancestorsOf`, `countBelow`, `reaches`, `noLoop` and `deletionSet` as pure, unit-tested functions.

## 5. Routes and files

```
values-tree/
├─ PLAN.md  CLAUDE.md  README.md
├─ package.json  svelte.config.js  vite.config.ts  tsconfig.json
├─ server.ts                 # production entry (http + ws + SvelteKit handler)
├─ Dockerfile  docker-compose.yml  Caddyfile.example  .dockerignore  .gitignore
├─ seed/our-family-values.json        # the owner's real tree (private, gitignored)
├─ reference/original-artifact.html   # the original app (already here)
├─ static/                   # favicon, og image
├─ src/
│  ├─ app.html  app.css      # tokens, reset, themes
│  ├─ lib/
│  │  ├─ model/              # PURE, unit-tested, no Svelte, no DOM
│  │  │  ├─ schema.ts        # Yjs structure + create/seed helpers
│  │  │  ├─ derive.ts        # Y.Doc -> plain view state
│  │  │  ├─ ops.ts           # add/move/link/unlink/rank/delete on Y.Doc
│  │  │  ├─ io.ts            # export JSON/Markdown, import (legacy v2/v3/nested)
│  │  │  └─ ids.ts
│  │  ├─ client/
│  │  │  ├─ session.svelte.ts   # Session: doc, provider, undo, derived $state, selection
│  │  │  ├─ bindText.ts         # Svelte action: <input|textarea> <-> Y.Text (diff-based, keeps caret)
│  │  │  ├─ presence.ts         # awareness: name, colour, selected node
│  │  │  └─ recents.ts          # localStorage list of trees this browser has opened
│  │  ├─ components/            # Tree, Branch, Card, Panel, DocView, Presence,
│  │  │                         # ShareDialog, ExportDialog, ImportDialog, Modal, Toast, ConnectionBadge
│  │  └─ server/                # RELATIVE imports with .ts extensions only
│  │     ├─ db.ts  trees.ts  tokens.ts  sync.ts  ratelimit.ts
│  └─ routes/
│     ├─ +layout.svelte  +page.svelte  +page.server.ts     # landing: new tree, import, recents
│     ├─ e/[token]/+page.server.ts  +page.svelte            # edit session
│     ├─ v/[token]/+page.server.ts  +page.svelte            # view-only session
│     └─ api/trees/[token]/rotate/+server.ts
└─ tests/                     # vitest unit tests for model/; playwright e2e
```

`e/[token]` and `v/[token]` render the same `Editor.svelte` with `role="edit" | "view"`. The `+page.server.ts` validates the token (404 if unknown, with a friendly "this link is no longer valid" page), and returns `{treeId, role, title}`. The tree content itself arrives over the WebSocket, not through `load`.

## 6. UX and UI requirements

The first version of the interface is functional but plain. The goal here is a distinctive, calm, well-crafted tool for a family working out what they care about. It is a thoughtful, slightly literary exercise, not enterprise software.

### 6.1 Visual direction (starting point, refine while building)

Keep the original's character: warm paper surface, a serif display face for values, a clean sans for UI, five root hues so each root's whole branch reads as one family. Improve on it:

- Treat the **tree itself as the hero**. The canvas should feel like a drawn diagram on good paper: clear, slightly tactile connector lines (consider SVG curves instead of the CSS elbow lines), roots visibly heavier than leaves.
- Typography does the work. Original uses Fraunces + Instrument Sans (Google Fonts). Self-host the fonts (no third-party requests; this is a self-hosted app) using `@fontsource-variable/*` or local files. Feel free to change faces if you find a better pairing, but keep one serif display and one sans for UI, and a clear type scale.
- Avoid the generic generated look: no gradient washes, no identical soft-shadow cards everywhere, no ALL-CAPS tracked labels above every heading. Use structure (borders, indentation, hue) only where it carries meaning, for example the left color bar means "which root this belongs to".
- Light and dark themes via `prefers-color-scheme` plus a manual toggle. Both must be fully designed, not inverted. Meet WCAG AA contrast.
- Motion only in response to actions (expand/collapse, move, drop) and one quiet entrance for a freshly opened tree. Respect `prefers-reduced-motion`.

### 6.2 Landing page (`/`)

- One clear primary action: **Start a new tree**. Offer "Start blank" and "Start from an example" (the example is a small generic starter, not the owner's data).
- **Import a tree file** (drag and drop or choose; accepts the legacy JSON).
- **Your trees** from `recents.ts` (local to this browser): title, last opened, role (edit or view), open or forget. State plainly that the list lives on this device, and that the link is the only way back in. Prompt the user to **save/bookmark the edit link** on first creation.
- Short, plain explainer of what a values tree is (two sentences), not marketing copy.

### 6.3 Editor

- **Header:** editable title, Tree/Document switch, undo/redo, **Share** button (primary), export menu, theme toggle, connection badge, presence avatars.
- **Share dialog:** shows the view link and edit link, each with Copy, an explanation of what each allows, and "Regenerate link" (with a confirmation that explains it signs out current users of that link). View-only visitors see no regenerate controls.
- **Presence:** coloured avatars with initials. A first-time prompt to choose a display name, stored locally. Each collaborator's **selected value gets a coloured ring and a small name tag** on the card. Show who is viewing vs. editing.
- **Tree canvas:** pan by dragging empty space, zoom with Ctrl/Cmd+wheel and pinch, "Fit to screen", zoom buttons, minimap optional. Scroll the selected card into view smoothly. Fold/expand with counts, as now.
- **Inline editing:** double-click or `Enter` edits a card's title in place. The side panel keeps the full form.
- **Quick find:** `Ctrl/Cmd+K` to jump to any value by title.
- **Side panel:** keep all current sections but tidy the hierarchy: the first screen shows the title, the three text fields and add-child. Move the advanced items (connect to another parent, arrange, "Everything that shapes this") into clearly labelled collapsible sections. Autosize textareas.
- **Document view:** a pleasant reading layout, with a `@media print` stylesheet so "Print / Save as PDF" produces a clean family-document. Include the intro. Add a copy-as-Markdown button.
- **Empty and error states:** every one says what happened and what to do next (invalid link, offline with unsynced changes, server unreachable, view-only banner).
- **View-only mode:** a quiet banner, all inputs read-only, "Make my own copy" which exports a copy into a new tree.
- **Mobile:** the panel becomes a bottom sheet; the canvas supports touch pan and pinch zoom; touch targets at least 44 px. Provide a non-drag way to do everything drag does (already exists via panel controls).
- **Accessibility:** keep the existing roles and labels, add a live region for remote changes ("Sam added Hospitality"), visible focus, full keyboard operation (the original shortcut table), and make sure cards are reachable and navigable without a mouse.

### 6.4 Data safety (important for a "family document")

- Every change autosaves; there is no Save button. Show a quiet "Saved" or "Syncing..." state.
- Provide **Export JSON** and **Export Markdown** (current behaviour, now as real file downloads) and **Import** to replace or to create a new tree.
- Server-side backup story in the README: the SQLite file is the whole database; show a `sqlite3 .backup` cron example.
- Optional (stretch): version history using periodic Yjs snapshots and a "restore from earlier" view.

## 7. Build order (milestones)

Each milestone should end with a working, tested app.

1. **Scaffold.** Install and pin latest stable versions of SvelteKit, Svelte, Vite, adapter-node, TypeScript, `yjs`, `y-protocols`, `y-websocket`, `y-indexeddb`, `lib0`, `ws`, `vitest`, `@playwright/test`. Configure the Vite dev plugin and `server.ts`. Verify `node:sqlite` works under both Vite SSR and the production build.
2. **Model.** Implement `schema/derive/ops/io` as pure functions with vitest coverage: DAG with multi-parents, loop prevention (including the concurrent-move case), delete semantics, rank defaults, legacy import (`seed/our-family-values.json` must import cleanly and round-trip), Markdown export (compare against the original's output on the seed).
3. **Server.** DB, tokens, create-tree action, `/ws/:token` sync with role enforcement, debounced persistence, rotate endpoint with kick. Tests: two ws clients converge; a view-token client's updates are rejected; rotated token disconnects.
4. **Client session.** `Session` class (doc, provider, indexeddb, undo manager, derived state, selection, presence). `bindText` action with caret-preserving remote updates (this is the trickiest piece of UI code; test it with two tabs typing in the same field).
5. **Editor UI.** Tree, Branch/Card, Panel, DocView, with every behaviour listed in section 2. Then drag and drop, keyboard, pan/zoom.
6. **Collab UX.** Share dialog, presence rings, connection badge, view-only mode, regenerate links, toasts, live-region announcements.
7. **Design pass.** Landing page, theming, typography, motion, empty and error states, mobile layout, print stylesheet. Review screenshots at 1440, 1024, 390 px in light and dark. Remove anything that does not carry meaning.
8. **Ship.** Dockerfile (multi-stage, `node:24-slim`, non-root, volume at `/data`, healthcheck on `/healthz`), `docker-compose.yml`, `Caddyfile.example` (reverse proxy including WebSocket, token redaction in logs, security headers), README with run, backup and upgrade instructions. Optionally a NixOS module or flake snippet.
9. **Import the owner's tree.** Create it from `seed/our-family-values.json` and confirm that all 28 values and their multi-parent links survive.

## 8. Testing and verification

- **Unit (vitest):** everything in `src/lib/model` and `src/lib/server/tokens.ts`.
- **Integration:** spin up the server, connect two `y-websocket` clients, assert convergence under concurrent edits, including the concurrent "A under B / B under A" loop case, and that both clients render the same derived tree.
- **E2E (Playwright):** two browser contexts open the same edit link; type in the same field and move cards; assert convergence. A third context opens the view link and cannot edit (UI and server). Offline test: go offline, edit, go online, converge.
- **Manual:** keyboard-only pass through the full shortcut table; screen-reader labels; 390 px mobile; dark mode; print preview of the Document view.
- Finish by taking and reviewing screenshots of landing, editor (tree), editor (document), share dialog and mobile.

## 9. Risks and watch-outs

- **Textarea <-> Y.Text binding** is where collaborative editors usually go wrong (caret jumps, IME composition, undo). Use a prefix/suffix diff to produce minimal deltas, skip updates while composing, and restore the selection after remote changes. Consider `y-codemirror`-style libraries only if the simple approach fails.
- **Loops from concurrent moves.** Always cut deterministically in `derive()`; never rely on local pre-checks alone.
- **`node:sqlite`** is still marked experimental on some Node versions (prints a warning). Acceptable for this app; document the minimum Node version and keep DB access behind `db.ts` so it can be swapped for `better-sqlite3`.
- **Vite dev server + WebSocket upgrade** conflicts with HMR if the path is not filtered. Only handle `/ws/`.
- **Token leakage** through Referer, browser history, or logs: use the headers and Caddy log redaction described above, and tell users that anyone with the edit link can edit.
- **Unbounded growth** of Yjs history: acceptable at this scale, but persist a compacted state (`encodeStateAsUpdate`) and keep GC enabled.
- Do not store `collapsed` or the ephemeral checklist ticks in the shared doc.

## 10. Notes on the owner's data

The owner's real tree lives in `seed/our-family-values.json` on the owner's machine only: it is gitignored and not part of the public repository. `tests/fixtures/sample-v2.json` is a made-up tree in the same legacy format (one root, 28 values, several with more than one parent) that the tests use instead. When the private file is present, an extra test checks that it imports with no loss. Never "fix" the owner's data silently during import.

## 11. Definition of done

- A new visitor can create a tree, share a view link and an edit link, and two people can edit it simultaneously with visible presence.
- View links cannot modify anything, proven by a server-side test.
- Works offline for the editor after first load, and converges on reconnect.
- The owner's tree imports with no loss.
- `docker compose up` behind Caddy works on a clean machine with the README alone.
- All tests pass, and screenshots show a design that looks deliberate in light, dark and mobile.
