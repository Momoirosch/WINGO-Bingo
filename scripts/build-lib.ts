import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { validateSubjectConfig } from "../src/subject-schema";

const outdir = "dist";
const subjectsDir = "public/subjects";

export async function buildSite(): Promise<void> {
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

    throw new Error("Build failed.");
  }

  await cp("public", outdir, { recursive: true });
  await writeSubjectManifest();
}

async function writeSubjectManifest(): Promise<void> {
  const fileNames = (await readdir(subjectsDir))
    .filter((fileName) => fileName.endsWith(".json") && fileName !== "index.json")
    .sort((left, right) => left.localeCompare(right));

  if (fileNames.length === 0) {
    throw new Error(`No subject JSON files found in "${subjectsDir}".`);
  }

  const manifest = [];

  for (const fileName of fileNames) {
    const filePath = join(subjectsDir, fileName);
    const config = await Bun.file(filePath).json();

    validateSubjectConfig(config, `Subject file "${fileName}"`);
    manifest.push({
      id: fileName.replace(/\.json$/i, ""),
      path: `./subjects/${fileName}`,
    });
  }

  await mkdir(join(outdir, "subjects"), { recursive: true });
  await writeFile(
    join(outdir, "subjects", "index.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}
