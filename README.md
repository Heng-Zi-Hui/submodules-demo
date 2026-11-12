# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener API.
Node.js 20 or later is required for the built-in `fetch`.

```sh
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

The API base defaults to `http://localhost:3000`. Set `SNIP_API` to use another
server. The `snip`, `snip.cmd`, and `snip.ps1` wrappers forward their arguments
to `cli.js`; installing this package also exposes the `snip` bin command.

Run the mock-API tests with `npm test`.
