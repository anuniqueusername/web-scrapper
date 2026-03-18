---
name: Bundler decisions — webpack vs Turbopack
description: Why this project uses webpack (--webpack flag) for production builds instead of Turbopack, and what config each bundler needs
type: project
---

webpack is the production bundler for this project. The build script is `next build --webpack`.

**Why:** Turbopack 16.x statically traces string arguments passed to `child_process.spawn()` and `path.join(process.cwd(), ...)` as if they were dynamic module import paths. The API routes (`app/api/scraper/control/route.js`, `app/api/facebook/control/route.js`) and the spawn helper (`lib/spawn-facebook-scraper.js`) all call `spawn('node', [path.join(cwd, 'scraper.js')])` and similar. Turbopack sees `'scraper.js'` and `'facebook-worker-runner.js'` as module paths, resolves them relative to the project root, and emits a fatal "Module not found / server relative imports are not implemented yet" build error. No supported Turbopack API in Next.js 16.x can suppress this for local file paths (resolveAlias only redirects, turbopackIgnore only works on dynamic import(), string splitting and env indirection are constant-folded away).

**How to apply:** Always use `npm run build` (which runs `next build --webpack`). Do not switch to Turbopack unless this spawn-tracing behaviour is fixed upstream. The `build:turbopack` script exists as a future test target only.

## next.config.js structure

- `turbopack: {}` — empty block required to silence the "webpack config but no turbopack config" warning that fires when `next dev` (which uses Turbopack by default) is run.
- `webpack(config, { isServer })` — pushes a function external for Node built-ins (`child_process`, `fs`, `path`, `os`, `net`, `tls`) so webpack emits `require('child_process')` instead of trying to bundle the source. Uses function-style external (not string literals) to handle both array and object shapes of `config.externals`.

## Spawn call sites

All three spawn call sites are intentionally simple and readable — no workarounds needed under webpack:

- `lib/spawn-facebook-scraper.js` — detached spawn of `facebook-worker-runner.js`, used by `app/api/facebook/run/route.js`
- `app/api/facebook/control/route.js` — attached spawn of `facebook-worker-runner.js` (pipes stdout/stderr to log file)
- `app/api/scraper/control/route.js` — attached spawn of `scraper.js` (pipes stdout/stderr to log file)

All three files have `import 'server-only'` guards.
