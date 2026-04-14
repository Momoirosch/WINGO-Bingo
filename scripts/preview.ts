const port = 4173;
const distDir = `${process.cwd()}\\dist`;

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

console.log(`Preview server running at http://localhost:${server.port}`);
