import { watch } from "node:fs";
import { join } from "node:path";

import { buildSite } from "./build-lib";
import { startAppServer } from "./server-lib";

const port = 4173;
const distDir = join(process.cwd(), "dist");
const watchTargets = ["src", "public"];

let isBuilding = false;
let rebuildQueued = false;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

await runBuild();

const server = startAppServer({ distDir, port });

for (const target of watchTargets) {
  watch(
    target,
    { recursive: true },
    () => {
      if (rebuildTimer) {
        clearTimeout(rebuildTimer);
      }

      rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        void runBuild();
      }, 120);
    },
  );
}

console.log(`Dev server running at http://localhost:${server.port}`);

async function runBuild(): Promise<void> {
  if (isBuilding) {
    rebuildQueued = true;
    return;
  }

  isBuilding = true;
  const startedAt = Date.now();

  try {
    await buildSite();
    const duration = Date.now() - startedAt;
    console.log(`Rebuilt dist in ${duration}ms`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown build error";
    console.error(`Build failed: ${message}`);
  } finally {
    isBuilding = false;

    if (rebuildQueued) {
      rebuildQueued = false;
      void runBuild();
    }
  }
}
