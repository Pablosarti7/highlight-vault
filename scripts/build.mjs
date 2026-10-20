import { build as viteBuild } from "vite";
import { build } from "esbuild";
await viteBuild();
await build({
  entryPoints: ["src/content/index.ts"],
  outfile: "dist/content.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
});
await build({
  entryPoints: ["src/background/index.ts"],
  outfile: "dist/background.js",
  bundle: true,
  format: "esm",
  target: "chrome120",
});
