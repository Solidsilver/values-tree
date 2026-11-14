# NixOS module: services.values-tree
#
# Runs the app as a hardened systemd service on 127.0.0.1, keeps its SQLite database in
# /var/lib/values-tree, and can optionally add a Caddy site and a nightly database backup.
self:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.values-tree;
  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    mkPackageOption
    types
    ;
  stateDir = "/var/lib/values-tree";
  dbFile = "${stateDir}/values-tree.db";
in
{
  options.services.values-tree = {
    enable = mkEnableOption "Values Tree, a shared family values tree with live co-editing";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "values-tree.packages.\${system}.default";
      description = "The values-tree package to run.";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "Address to listen on. Keep the default when a reverse proxy runs on the same machine.";
    };

    port = mkOption {
      type = types.port;
      default = 3000;
      description = "Port to listen on.";
    };

    origin = mkOption {
      type = types.str;
      example = "https://values.example.com";
      description = ''
        Public URL of the site, without a trailing slash. Used to build share links and to
        check the Origin of form posts and WebSocket connections.
      '';
    };

    trustProxy = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Read the client address from the X-Forwarded-For header set by one reverse proxy in
        front of the app. Without it every visitor appears as 127.0.0.1 and they all share one
        rate limit for creating trees. Turn off if the app is reachable without the proxy.
      '';
    };

    snapshotInterval = mkOption {
      type = types.ints.positive;
      default = 600;
      description = "Minimum seconds between automatic version-history snapshots of a tree.";
    };

    environment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      example = {
        PERSIST_DEBOUNCE_MS = "1000";
      };
      description = "Extra environment variables for the service (see the README for the full list).";
    };

    caddy = {
      enable = mkEnableOption "a Caddy virtual host for {option}`services.values-tree.origin`";
      hostName = mkOption {
        type = types.str;
        default = lib.removePrefix "https://" (lib.removePrefix "http://" cfg.origin);
        defaultText = lib.literalExpression "host part of services.values-tree.origin";
        description = "Caddy site address.";
      };
      accessLog = mkOption {
        type = types.bool;
        default = false;
        description = ''
          Write a Caddy access log for this site. Off by default: request paths contain the
          secret edit and view links, and a log would store them in plain text.
        '';
      };
    };

    backup = {
      enable = mkEnableOption "a nightly copy of the database (safe to take while the app runs)";
      directory = mkOption {
        type = types.str;
        default = "/var/backup/values-tree";
        example = "/data/backups/values-tree";
        description = "Where to write the dated copies. Point your file backups (restic, borg, ...) at it.";
      };
      startAt = mkOption {
        type = types.str;
        default = "*-*-* 02:30:00";
        description = "When to run, in systemd OnCalendar format.";
      };
      keepDays = mkOption {
        type = types.ints.positive;
        default = 14;
        description = "Delete copies older than this many days.";
      };
    };
  };

  config = mkIf cfg.enable {
    systemd.services.values-tree = {
      description = "Values Tree";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment = {
        NODE_ENV = "production";
        HOST = cfg.host;
        PORT = toString cfg.port;
        ORIGIN = cfg.origin;
        DATA_DIR = stateDir;
        SNAPSHOT_EVERY_MS = toString (cfg.snapshotInterval * 1000);
      }
      // lib.optionalAttrs cfg.trustProxy {
        ADDRESS_HEADER = "X-Forwarded-For";
        XFF_DEPTH = "1";
      }
      // cfg.environment;

      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = 2;
        # SIGTERM makes the server write every open tree before exiting.
        TimeoutStopSec = 20;

        DynamicUser = true;
        StateDirectory = "values-tree";
        StateDirectoryMode = "0700";
        UMask = "0077";

        NoNewPrivileges = true;
        CapabilityBoundingSet = "";
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectClock = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectControlGroups = true;
        ProtectProc = "invisible";
        ProcSubset = "pid";
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        SystemCallArchitectures = "native";
        SystemCallFilter = [
          "@system-service"
          "~@privileged"
        ];
        # (no MemoryDenyWriteExecute: Node's JIT needs it)
      };
    };

    services.caddy.virtualHosts = mkIf cfg.caddy.enable {
      ${cfg.caddy.hostName} = {
        extraConfig = ''
          encode zstd gzip
          reverse_proxy ${if cfg.host == "0.0.0.0" then "127.0.0.1" else cfg.host}:${toString cfg.port}
        '';
      }
      // lib.optionalAttrs (!cfg.caddy.accessLog) { logFormat = "output discard"; };
    };

    systemd.services.values-tree-backup = mkIf cfg.backup.enable {
      description = "Copy the Values Tree database";
      startAt = cfg.backup.startAt;
      serviceConfig = {
        Type = "oneshot";
        UMask = "0077";
      };
      path = [
        pkgs.sqlite
        pkgs.coreutils
        pkgs.findutils
      ];
      script = ''
        set -eu
        src=/var/lib/private/values-tree/values-tree.db
        [ -e "$src" ] || src=${dbFile}
        if [ ! -e "$src" ]; then
          echo "no database yet at $src, nothing to back up"
          exit 0
        fi
        install -d -m 0700 ${lib.escapeShellArg cfg.backup.directory}
        out=${lib.escapeShellArg cfg.backup.directory}/values-tree-$(date +%F).db
        # SQLite's online backup gives a consistent copy even while the app is writing.
        sqlite3 "$src" ".backup '$out.tmp'"
        sqlite3 "$out.tmp" 'PRAGMA integrity_check;' | grep -qx ok
        mv -f "$out.tmp" "$out"
        find ${lib.escapeShellArg cfg.backup.directory} -name 'values-tree-*.db' -mtime +${toString cfg.backup.keepDays} -delete
        echo "wrote $out"
      '';
    };
  };
}
