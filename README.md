# Snip backend

A zero-dependency Bun URL shortener. Links are stored in memory and are cleared
when the server restarts.

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it,
`BASE_URL` to control generated short links, or `PUBLIC_DIR` to serve static
files alongside the API.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link and
  returns `201` with `{code,url,shortUrl,hits,createdAt}`. Invalid JSON or a
  non-HTTP(S) URL returns `400` with an `{error}` message.
- `GET /api/links` returns the created links.
- `GET /:code` redirects to the original URL and increments its hit count, or
  returns `404` for an unknown code.
