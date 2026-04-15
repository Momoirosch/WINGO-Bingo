import { watch } from "node:fs";

import { buildSite } from "./build-lib";

const port = 4173;
const distDir = `${process.cwd()}\\dist`;
const watchTargets = ["src", "public"];

let isBuilding = false;
let rebuildQueued = false;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

await runBuild();

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const file = Bun.file(`${distDir}${pathname}`);

    if (await file.exists()) {
      return new Response(file);
    }

    const fallback = Bun.file(`${distDir}\\index.html`);
    return new Response(fallback, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  },
});

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
