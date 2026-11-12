#!/usr/bin/env node

import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const push = process.argv.slice(2);
if (push.some((argument) => argument !== "--push") || push.length > 1) {
  throw new Error("Usage: node scripts/build-bundle.mjs [--push]");
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function hasStagedChanges(cwd) {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status === 1) return true;
  if (result.status !== 0) {
    throw new Error(`git diff --cached failed with exit code ${result.status}.`);
  }
  return false;
}

if (hasStagedChanges(root)) {
  throw new Error("Commit or unstage existing main changes before rebuilding the bundle.");
}

const frontend = resolve(root, "frontend");
const bundle = resolve(root, "bundle");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

run("git", ["submodule", "update", "--init", "--remote", "backend", "frontend", "cli"]);
run(npm, ["install"], frontend);
run(npx, ["ng", "build"], frontend);

const frontendOutput = resolve(frontend, "dist/snip-frontend/browser");
const indexPath = resolve(frontendOutput, "index.html");
let indexStat;
try {
  indexStat = await stat(indexPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!indexStat?.isFile()) {
  throw new Error(`Angular build output is missing: ${indexPath}`);
}

const publicDirectory = resolve(bundle, "public");
await rm(publicDirectory, { recursive: true, force: true });
await mkdir(bundle, { recursive: true });
await cp(resolve(root, "backend/server.js"), resolve(bundle, "server.js"));
await cp(resolve(root, "cli/cli.js"), resolve(bundle, "cli.js"));
await cp(frontendOutput, publicDirectory, { recursive: true });
await writeFile(resolve(bundle, ".env"), "PUBLIC_DIR=./public\n");
await writeFile(
  resolve(bundle, "package.json"),
  `${JSON.stringify(
    {
      name: "snip-bundle",
      private: true,
      scripts: { start: "bun server.js" },
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(bundle, "Dockerfile"),
  [
    "FROM oven/bun:1-alpine",
    "COPY . .",
    "ENV PORT=3000",
    "EXPOSE 3000",
    "CMD [\"bun\", \"server.js\"]",
    "",
  ].join("\n"),
);
await writeFile(
  resolve(bundle, ".dockerignore"),
  [".git", ".gitmodules", "node_modules", "dist", "*.log", ".DS_Store", ""].join("\n"),
);
await writeFile(
  resolve(bundle, "railway.json"),
  `${JSON.stringify(
    {
      "$schema": "https://railway.app/railway.schema.json",
      build: { builder: "DOCKERFILE" },
    },
    null,
    2,
  )}\n`,
);

run("git", ["add", "-A"], bundle);
if (hasStagedChanges(bundle)) {
  run(
    "git",
    [
      "commit",
      "-m",
      "Build generated Snip bundle",
      "-m",
      "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
    ],
    bundle,
  );
} else {
  console.log("Bundle unchanged; no bundle commit needed.");
}

run("git", ["add", "backend", "frontend", "cli", "bundle"]);
if (hasStagedChanges(root)) {
  run(
    "git",
    [
      "commit",
      "-m",
      "Update generated bundle and source pointers",
      "-m",
      "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
    ],
  );
} else {
  console.log("Submodule pointers unchanged; no superproject commit needed.");
}

if (push.length === 1) {
  run("git", ["push", "origin", "HEAD:bundle"], bundle);
  run("git", ["push", "origin", "main"]);
}
