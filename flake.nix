{
  description = "Values Tree: a shared family values tree with live co-editing and secret share links";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAll (pkgs: rec {
        values-tree = pkgs.callPackage ./nix/package.nix { };
        default = values-tree;
      });

      nixosModules = rec {
        values-tree = import ./nix/module.nix self;
        default = values-tree;
      };

      formatter = forAll (pkgs: pkgs.nixfmt);
    };
}
