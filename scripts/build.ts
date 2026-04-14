import { cp, mkdir, rm } from "node:fs/promises";

const outdir = "dist";

await rm(outdir, { force: true, recursive: true });
await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  format: "esm",
  minify: false,
  outdir,
  sourcemap: "external",
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }

  process.exit(1);
}

await cp("public", outdir, { recursive: true });
