import { join } from "node:path";

import { startAppServer } from "./server-lib";

const port = Number(Bun.env.PORT ?? "3000");
const distDir = join(process.cwd(), "dist");
const server = startAppServer({ distDir, port });

console.log(`App server running at http://localhost:${server.port}`);
