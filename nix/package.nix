{
  lib,
  buildNpmPackage,
  nodejs_24,
  makeWrapper,
}:

let
  pkgJson = lib.importJSON ../package.json;
in
buildNpmPackage {
  pname = "values-tree";
  inherit (pkgJson) version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../package-lock.json
      ../svelte.config.js
      ../vite.config.ts
      ../tsconfig.json
      ../server.ts
      ../src
      ../static
    ];
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-TR9gBVgoEy68gu6qP23a2ETi6vu/CsfWm5og58MqggQ=";

  nativeBuildInputs = [ makeWrapper ];

  # `npm run build` (vite build) is the default build script. NODE_ENV stays unset here so
  # the build tools (dev dependencies) get installed; the wrapper sets it at runtime.

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-audit --no-fund
    app=$out/lib/values-tree
    mkdir -p $app/src/lib $out/bin
    find node_modules -type d -empty -delete
    cp -r build node_modules package.json server.ts $app/
    cp -r src/lib/server src/lib/model $app/src/lib/

    # No --chdir: DATA_DIR defaults to ./data relative to where it is started.
    makeWrapper ${lib.getExe nodejs_24} $out/bin/values-tree \
      --add-flags $app/server.ts \
      --set-default NODE_ENV production

    runHook postInstall
  '';

  meta = {
    description = "A shared family values tree with live co-editing and secret share links";
    mainProgram = "values-tree";
    platforms = lib.platforms.unix;
  };
}
