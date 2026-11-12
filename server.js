import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
const configuredBaseUrl =
  process.env.BASE_URL?.trim() ||
  (railwayDomain ? `https://${railwayDomain}` : `http://localhost:${port}`);
const parsedBaseUrl = new URL(configuredBaseUrl);
if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
  throw new Error("BASE_URL must use HTTP or HTTPS.");
}
const baseUrl = parsedBaseUrl.origin;
const publicDirectory = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function response(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(body, { ...init, headers });
}

function json(data, status = 200) {
  return response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function createCode() {
  let code = "";
  while (code.length < 6) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

function nextCode() {
  let code;
  do {
    code = createCode();
  } while (links.has(code));
  return code;
}

async function serveStatic(pathname) {
  if (!publicDirectory) return null;

  let relativePath;
  try {
    relativePath = decodeURIComponent(
      pathname === "/" ? "index.html" : pathname.slice(1),
    );
  } catch {
    return null;
  }

  const filePath = resolve(publicDirectory, relativePath);
  if (
    filePath !== publicDirectory &&
    !filePath.startsWith(`${publicDirectory}${sep}`)
  ) {
    return null;
  }

  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }

  return response(Bun.file(filePath));
}

Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return response(null, { status: 204 });
    }

    if (request.method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body must be valid JSON." }, 400);
      }

      const url = typeof body?.url === "string" ? body.url.trim() : "";
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return json({ error: "URL must be a valid HTTP or HTTPS URL." }, 400);
      }
      if (
        (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
        !parsedUrl.hostname
      ) {
        return json({ error: "URL must be a valid HTTP or HTTPS URL." }, 400);
      }

      const code = nextCode();
      const link = {
        code,
        url,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return json(link, 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return json(Array.from(links.values()));
    }

    if (request.method === "GET") {
      const staticResponse = await serveStatic(pathname);
      if (staticResponse) return staticResponse;

      if (/^\/[^/]+$/.test(pathname)) {
        const code = pathname.slice(1);
        const link = links.get(code);
        if (link) {
          link.hits += 1;
          return response(null, {
            status: 302,
            headers: { Location: link.url },
          });
        }
      }
    }

    return json({ error: "Not found." }, 404);
  },
});

console.log(`Snip backend listening on http://localhost:${port}`);
