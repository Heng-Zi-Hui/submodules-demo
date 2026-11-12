# Snip Frontend

Angular 19 client for Snip, a small URL shortener. It validates HTTP(S) URLs,
creates short links, and lists links with their original URLs and hit counts.

## Run locally

Start the Bun API on `http://localhost:3000`, then run:

```bash
npm install
npx ng serve
```

Open `http://localhost:4200`. The client uses `POST /api/links` and
`GET /api/links` on the local API.

## Verify

```bash
npx ng build
npm test -- --watch=false
```

The production browser app is generated at
`dist/snip-frontend/browser/`, which is consumed by the Snip bundle build.
