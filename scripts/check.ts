import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { validateSubjectConfig } from "../src/subject-schema";

const subjectsDir = "public/subjects";
const fileNames = (await readdir(subjectsDir))
  .filter((fileName) => fileName.endsWith(".json") && fileName !== "index.json")
  .sort((left, right) => left.localeCompare(right));

if (fileNames.length === 0) {
  throw new Error(`No subject JSON files found in "${subjectsDir}".`);
}

for (const fileName of fileNames) {
  const filePath = join(subjectsDir, fileName);
  const config = await Bun.file(filePath).json();

  validateSubjectConfig(config, `Subject file "${fileName}"`);
  console.log(
    `Validated "${config.title}" from ${fileName} (${config.cadence}, ${config.cardSize}x${config.cardSize}, ${config.entries.length} entries).`,
  );
}
