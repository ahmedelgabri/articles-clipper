with import <nixpkgs> { };
mkShell {
  name = "articles-clipper";
  buildInputs = [
    nodejs_20
    nodePackages.pnpm
    nodePackages.wrangler
  ];
}
