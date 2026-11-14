# Values Tree

Values Tree is a shared document for writing down values and how they shape each other. A value can have several parents; tree and document views show the same content. Live editing uses Yjs over WebSockets, with SQLite persistence and local offline storage after a tree has been opened.

## Local development

Requires Node **22.18+** with built-in `node:sqlite` (Node 24 recommended), and npm. No native database dependencies are needed; some Node releases print an experimental SQLite warning.

```sh
npm install
npm run dev
npm test
npx playwright install chromium
npm run test:e2e
```

Open the URL printed by Vite. Tests and browser tests are separate commands.

## Production without Docker

```sh
npm ci && npm run build
NODE_ENV=production ORIGIN=https://values.example.com node server.ts
```

Use a process supervisor and a reverse proxy for HTTPS. `server.ts` serves both HTTP and `/ws/*`; use this entry point rather than running the generated adapter server directly. Keep `build/`, `server.ts`, `src/lib/server/`, `src/lib/model/`, and production dependencies together.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | Listen address; use `127.0.0.1` behind a host proxy |
| `DATA_DIR` | `./data` | Writable directory for `values-tree.db` |
| `ORIGIN` | unset | Public origin, e.g. `https://values.example.com`, for adapter-node behind a proxy |
| `PERSIST_DEBOUNCE_MS` | `1000` | Delay before saving changes to SQLite |
| `EVICT_AFTER_MS` | `60000` | Time to keep an idle tree in memory |
| `SNAPSHOT_EVERY_MS` | `600000` | Minimum gap between automatic version-history snapshots |
| `ALLOW_ANY_ORIGIN` | unset | Set to `1` to disable the WebSocket Origin check |
| `ADDRESS_HEADER` / `XFF_DEPTH` | unset | adapter-node: read the client address from e.g. `X-Forwarded-For` (depth `1` behind one proxy), so rate limits apply per visitor |

Instead of a fixed `ORIGIN`, adapter-node can use `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`. Only trust those headers when a trusted reverse proxy controls access to the server. Leave the WebSocket Origin check enabled for normal deployments.

## NixOS

The flake provides a package and a NixOS module that runs the app as a hardened systemd service (dynamic user, data in `/var/lib/values-tree`), with an optional Caddy site and nightly database copy.

```nix
# flake.nix
inputs.values-tree.url = "github:Solidsilver/values-tree";
# ...then add `values-tree.nixosModules.default` to your system's modules.
```

```nix
services.values-tree = {
  enable = true;
  port = 3612;                                  # default 3000
  origin = "https://values.example.com";
  caddy.enable = true;                          # adds a Caddy site with its access log off
  backup.enable = true;                         # nightly SQLite copy at 02:30, 14 days kept
  backup.directory = "/data/backups/values-tree";
};
```

| Option | Default | Purpose |
| --- | --- | --- |
| `host` | `127.0.0.1` | Listen address |
| `port` | `3000` | HTTP and WebSocket port |
| `origin` | required | Public URL, used for links and Origin checks |
| `trustProxy` | `true` | Read client addresses from `X-Forwarded-For` (one proxy) for per-visitor rate limits |
| `snapshotInterval` | `600` | Seconds between automatic version-history snapshots |
| `environment` | `{}` | Extra environment variables |
| `caddy.enable` | `false` | Add `services.caddy.virtualHosts.<host of origin>` |
| `caddy.hostName` | host of `origin` | Caddy site address |
| `caddy.accessLog` | `false` | Keep a Caddy access log; off because request paths contain the secret links |
| `backup.enable` | `false` | Nightly `sqlite3 .backup` copy, integrity-checked |
| `backup.directory` | `/var/backup/values-tree` | Where copies go; point your file backups at it |
| `backup.startAt` | `*-*-* 02:30:00` | systemd calendar time |
| `backup.keepDays` | `14` | Delete older copies |

If you configure Caddy yourself instead, disable the access log for this site (for example `logFormat = "output discard";`) or redact `/e/*`, `/v/*`, `/ws/*` and `/api/trees/*` paths, since they carry the secret links. Plain `reverse_proxy` handles the WebSocket.

Build and run the package without NixOS: `nix run github:Solidsilver/values-tree` (set `ORIGIN`, `PORT`, `DATA_DIR`).

## Docker and Caddy

Requires Docker Compose and Caddy 2.8+ on the host. Point your domain at the host and allow incoming ports 80 and 443 for Caddy's HTTPS setup.

1. Set `ORIGIN=https://your.domain` in a local `.env` file (or edit the Compose environment).
2. Replace `values.example.com` in `Caddyfile.example` with that same domain and add the site block to your host's Caddy configuration.
3. Start the app, validate Caddy's configuration, and reload Caddy:

```sh
docker compose up -d --build
caddy validate --config Caddyfile.example --adapter caddyfile
# After installing the site block in /etc/caddy/Caddyfile:
sudo systemctl reload caddy
curl http://127.0.0.1:3000/healthz
```

The health endpoint returns `ok`. Compose binds the app to loopback; Caddy forwards HTTP and WebSockets on `/ws/*`. The example adds security and no-store headers, preserves the app's CSP, and redacts secret path tokens in access logs using Caddy's [log filter](https://caddyserver.com/docs/caddyfile/directives/log). Avoid logging full URLs elsewhere in your proxy stack.

SQLite data lives in the named `values-tree-data` volume (Compose prefixes its name with the project name). The image runs as the non-root `node` user; bind-mounted directories must be writable by UID 1000. Shutdown has 15 seconds to flush pending edits.

## Share links

Each tree has an edit link and a view-only link. Anyone with the edit link can edit and regenerate links; the server enforces view-only access. Regenerating a link in the Share dialog revokes the old one immediately and disconnects clients using it.

Links are the only way back in: bookmark them and keep the edit link private. The recent-tree list is local to your browser, not an account or recovery mechanism.

To bring in an existing tree, choose **Import a tree file** on the landing page. Files exported from the original single-file app (format versions 2 and 3) import as they are.

## Version history

Edit-link holders can open **Version history** (clock icon, or the ⋯ menu on phones) to preview and restore earlier versions. The server stores a full JSON copy of a tree in the `snapshots` table when it is created, when it is opened or saved and the last copy is at least `SNAPSHOT_EVERY_MS` old, and right before a restore. Identical copies are skipped. Every copy from the last two days is kept, then one per day up to 90 days, then one per 30 days.

Restoring replaces the tree for everyone as an ordinary edit, so it syncs live and the person who restored can undo it. View links cannot see history, because older versions may contain values an editor removed on purpose.

This protects against mistakes inside the app, not against losing the server: keep the backups below.

## Backups

`$DATA_DIR/values-tree.db` contains the whole database. SQLite uses WAL mode: use SQLite's online backup command rather than copying only the live database file. Pending edits are saved after the debounce delay; stop the app gracefully first if a backup must include every last edit. JSON export in the app is also useful for a portable copy of an individual tree.

For a host installation (adjust paths and permissions):

```sh
mkdir -p /backups
sqlite3 /data/values-tree.db ".backup '/backups/values-tree-$(date +%F).db'"
```

Example daily cron entry (cron requires escaping `%`):

```cron
0 3 * * * sqlite3 /data/values-tree.db ".backup '/backups/values-tree-$(date +\%F).db'"
```

The app image does not include the sqlite3 CLI. For Compose, find the actual volume name, then mount it in a temporary container with SQLite installed:

```sh
docker volume ls
mkdir -p backups
docker run --rm \
  -v values-tree_values-tree-data:/data \
  -v "$PWD/backups:/backups" \
  debian:bookworm-slim sh -c \
  'apt-get update -qq && apt-get install -y -qq sqlite3 && sqlite3 /data/values-tree.db ".backup '\''/backups/values-tree-$(date +%F).db'\''"'
```

Replace `values-tree_values-tree-data` with your Compose volume name. For repeated backups, use a small backup image with sqlite3 preinstalled. If your own running container already has sqlite3 and `/backups` mounted, the equivalent is:

```sh
docker compose exec -T values-tree sqlite3 /data/values-tree.db ".backup '/backups/values-tree-$(date +%F).db'"
# Or: docker exec CONTAINER sqlite3 /data/values-tree.db ".backup '/backups/values-tree-$(date +%F).db'"
```

To restore, stop the app, replace the database in its data directory with the backup, remove any old `values-tree.db-wal` and `values-tree.db-shm` files, restore write permissions, then start it again. Keep backups private: they contain the tree contents.

## Upgrading

Back up first, then pull the latest source and rebuild:

```sh
git pull
docker compose up -d --build
docker compose ps
```

Data persists in the volume across rebuilds and container replacement. Keep the volume when bringing the stack down; `docker compose down -v` deletes it.
