{
  description = "ShenScript — Nix-managed JavaScript development environment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  outputs = { nixpkgs, ... }:
    let systems = [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ]; each = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      packages = each (pkgs: { toolchain = pkgs.buildEnv { name = "shenscript-toolchain"; paths = [ pkgs.nodejs_22 ]; }; default = pkgs.buildEnv { name = "shenscript-toolchain"; paths = [ pkgs.nodejs_22 ]; }; });
      devShells = each (pkgs: { default = pkgs.mkShell { packages = [ pkgs.nodejs_22 ]; }; });
    };
}
