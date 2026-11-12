#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const API_BASE = (process.env.SNIP_API || 'http://localhost:3000').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10000;

function usage() {
  return [
    'Usage:',
    '  snip add <url>',
    '  snip ls',
    '  snip open <code>',
    '  snip help',
  ].join('\n');
}

function validateUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP or HTTPS URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must be a valid HTTP or HTTPS URL.`);
  }
  return url.href;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Could not reach API at ${API_BASE}: ${error.message}`);
  }
  return response;
}

async function responseError(response) {
  let detail = '';
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') detail = `: ${body.error}`;
  } catch {
    // Error responses are allowed to have no JSON body.
  }
  return new Error(`API request failed with HTTP ${response.status}${detail}`);
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('API returned invalid JSON.');
  }
}

async function add(url) {
  const response = await apiRequest('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw await responseError(response);

  const link = await responseJson(response);
  if (!link || typeof link.shortUrl !== 'string') {
    throw new Error('API response is missing the shortUrl field.');
  }
  console.log(link.shortUrl);
}

async function list() {
  const response = await apiRequest('/api/links');
  if (!response.ok) throw await responseError(response);

  const links = await responseJson(response);
  if (!Array.isArray(links) || links.some((link) =>
    !link || typeof link.code !== 'string' || typeof link.url !== 'string' ||
    (typeof link.hits !== 'number' && typeof link.hits !== 'string')
  )) {
    throw new Error('API response is not a valid links array.');
  }
  if (links.length === 0) {
    console.log('No links yet.');
    return;
  }

  const codeWidth = Math.max(4, ...links.map((link) => link.code.length));
  const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
  console.log(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`);
  for (const link of links) {
    console.log(`${link.code.padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`);
  }
}

function browserCommand(target) {
  if (process.platform === 'win32') {
    return {
      command: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', target],
    };
  }
  if (process.platform === 'darwin') {
    return { command: 'open', args: [target] };
  }
  return { command: 'xdg-open', args: [target] };
}

function openInBrowser(target) {
  const { command, args } = browserCommand(target);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', (error) => reject(new Error(`Could not open browser: ${error.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function open(code) {
  const response = await apiRequest(`/${encodeURIComponent(code)}`, { redirect: 'manual' });
  if (response.status === 404) throw new Error(`Unknown short code: ${code}`);
  if (response.status !== 302) throw await responseError(response);

  const location = response.headers.get('location');
  if (!location) throw new Error('API redirect response is missing the Location header.');
  const target = validateUrl(location, 'Redirect target');
  await openInBrowser(target);
}

async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (args.length > 0) throw new Error(usage());
    console.log(usage());
    return;
  }

  if (command === 'add') {
    if (args.length !== 1) throw new Error(`Expected one URL.\n${usage()}`);
    await add(validateUrl(args[0], 'URL'));
    return;
  }
  if (command === 'ls') {
    if (args.length !== 0) throw new Error(`The ls command takes no arguments.\n${usage()}`);
    await list();
    return;
  }
  if (command === 'open') {
    if (args.length !== 1 || !args[0]) throw new Error(`Expected one short code.\n${usage()}`);
    await open(args[0]);
    return;
  }
  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
