'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const cliPath = path.join(__dirname, '..', 'cli.js');
const links = [];
const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/links') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const { url } = JSON.parse(body);
      const link = {
        code: 'abc123',
        url,
        shortUrl: `http://short.test/abc123`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.push(link);
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify(link));
    });
    return;
  }
  if (request.method === 'GET' && request.url === '/api/links') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(links));
    return;
  }
  if (request.method === 'GET' && request.url === '/abc123') {
    response.writeHead(302, { location: links[0].url });
    response.end();
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

let apiBase;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function run(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, SNIP_API: apiBase, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => resolve({ status: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.once('close', (code) => resolve({ status: code ?? 1, stdout, stderr }));
  });
}

test('help and invalid arguments are handled without an API request', async () => {
  const help = await run(['help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /snip add <url>/);

  const invalid = await run(['add', 'ftp://example.com']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /HTTP or HTTPS/);
});

test('add and ls use the shared API contract and render the links table', async () => {
  const added = await run(['add', 'https://example.com/path']);
  assert.equal(added.status, 0, added.stderr);
  assert.equal(added.stdout.trim(), 'http://short.test/abc123');

  const listed = await run(['ls']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /CODE\s+HITS\s+URL/);
  assert.match(listed.stdout, /abc123\s+0\s+https:\/\/example\.com\/path/);
});

test('empty list and API failures have the specified output and exit status', async () => {
  links.length = 0;
  const empty = await run(['ls']);
  assert.equal(empty.status, 0);
  assert.equal(empty.stdout.trim(), 'No links yet.');

  const missing = await run(['open', 'unknown']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Unknown short code/);

  const unreachable = await run(['ls'], { SNIP_API: 'http://127.0.0.1:1' });
  assert.equal(unreachable.status, 1);
  assert.match(unreachable.stderr, /Could not reach API/);
});

test('open launches the redirect target using the platform browser command', {
  skip: process.platform === 'win32',
}, async () => {
  links.push({
    code: 'abc123',
    url: 'https://example.com/path?a=1&b=2',
    shortUrl: 'http://short.test/abc123',
    hits: 0,
    createdAt: new Date().toISOString(),
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snip-cli-test-'));
  const openerName = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const openerPath = path.join(tempDir, openerName);
  const logPath = path.join(tempDir, 'opened-url.txt');
  fs.writeFileSync(openerPath, '#!/bin/sh\nprintf "%s\\n" "$@" > "$SNIP_OPEN_LOG"\n', { mode: 0o755 });

  try {
    const result = await run(['open', 'abc123'], {
      PATH: `${tempDir}${path.delimiter}${process.env.PATH}`,
      SNIP_OPEN_LOG: logPath,
    });
    assert.equal(result.status, 0, result.stderr);

    const deadline = Date.now() + 2000;
    while (!fs.existsSync(logPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(fs.readFileSync(logPath, 'utf8').trim(), links[0].url);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    links.length = 0;
  }
});
