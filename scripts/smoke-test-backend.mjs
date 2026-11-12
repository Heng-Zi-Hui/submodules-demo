import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backend = resolve(root, "backend");

async function unusedPort() {
  const listener = net.createServer();
  await new Promise((resolveListen, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolveListen);
  });
  const address = listener.address();
  assert(address && typeof address === "object");
  await new Promise((resolveClose, reject) => {
    listener.close((error) => (error ? reject(error) : resolveClose()));
  });
  return address.port;
}

const port = await unusedPort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn("bun", ["run", "server.js"], {
  cwd: backend,
  env: {
    ...process.env,
    PORT: String(port),
    BASE_URL: origin,
    RAILWAY_PUBLIC_DOMAIN: "",
  },
  stdio: "ignore",
});
let startupError;
server.once("error", (error) => {
  startupError = error;
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) {
      throw new Error(`Backend exited before becoming ready (${server.exitCode}).`);
    }
    try {
      const response = await fetch(`${origin}/api/links`);
      if (response.ok) return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  throw new Error("Backend did not become ready within five seconds.");
}

try {
  await waitForServer();

  const preflight = await fetch(`${origin}/api/links`, { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");

  const invalidJson = await fetch(`${origin}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(typeof (await invalidJson.json()).error, "string");

  const invalidUrl = await fetch(`${origin}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "javascript:alert(1)" }),
  });
  assert.equal(invalidUrl.status, 400);

  const createdResponse = await fetch(`${origin}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/snip-smoke" }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.code, /^[A-Za-z0-9]{6}$/);
  assert.equal(created.url, "https://example.com/snip-smoke");
  assert.equal(created.shortUrl, `${origin}/${created.code}`);
  assert.equal(created.hits, 0);
  assert.ok(Number.isFinite(Date.parse(created.createdAt)));

  const listed = await fetch(`${origin}/api/links`);
  assert.deepEqual(await listed.json(), [created]);

  const redirected = await fetch(`${origin}/${created.code}`, {
    redirect: "manual",
  });
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.get("location"), created.url);

  const incremented = await fetch(`${origin}/api/links`);
  assert.equal((await incremented.json())[0].hits, 1);
  console.log("Backend API smoke checks passed.");
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "exit"),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 2000)),
    ]);
  }
}
