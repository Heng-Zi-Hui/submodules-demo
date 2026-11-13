# Snip

Snip is a tiny URL shortener with one backend and two clients: a browser UI and a terminal CLI. Each component has its own orphan branch; `main` pins the component commits as Git submodules so a checkout is a reproducible snapshot.

## Layout

| Branch | Contents | Stack |
| --- | --- | --- |
| `backend` | `server.js`, `package.json` | Bun API server; in-memory storage |
| `frontend` | Angular app | Angular 22 |
| `cli` | `cli.js`, wrappers | Dependency-free Node.js CLI |
| `bundle` | Generated server, UI, CLI, and Docker files | Bun + static UI |
| `main` | Submodule pointers, docs, and release automation | Git superproject |

## API contract

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` → `201 { code, url, shortUrl, hits, createdAt }`; invalid JSON or a non-HTTP(S) URL → `400 { error }` |
| `GET` | `/api/links` | `200` with an array of link records |
| `GET` | `/:code` | `302` to the original URL and increments `hits`; `404` for an unknown code |

Links are held in memory and are cleared when the backend restarts.

## Clone

Use `--recurse-submodules`; a plain clone leaves the component directories empty:

```sh
git clone --branch main --recurse-submodules https://github.com/Heng-Zi-Hui/submodules-demo.git
cd submodules-demo
```

## Run locally

Start each command from the `main` checkout in its own terminal:

```sh
cd backend && bun start
cd frontend && npm install && npx ng serve
cd cli && node cli.js ls
```

The backend listens on port 3000 and the Angular dev server on port 4200. Use the CLI's `add`, `ls`, and `open` commands against the same backend.

## Update workflow

Make and push component changes from the corresponding submodule branch, then advance and commit its pointer on `main`:

```sh
cd backend
git add -A && git commit -m "Describe backend change" && git push
cd ..
git submodule update --remote backend
git add backend && git commit -m "Bump backend submodule" && git push
```

Apply the same flow to `frontend` or `cli`. The generated release is assembled from those pinned tips by `node scripts/build-bundle.mjs`; pass `--push` to publish the bundle and its `main` pointer.

## Release automation

The `bundle` branch is generated output; do not hand-edit it. The hourly **Build bundle** workflow checks the CLI and backend API, rebuilds the frontend and bundle from the source branch tips, then pushes the generated bundle and updated `main` pointer. The **Build and push image** workflow runs when the `bundle` gitlink changes (or when that workflow is edited); it audits production dependencies, builds and smoke-tests the Docker image, scans it with Trivy, and only then publishes `latest` and a short-SHA tag to GHCR.
