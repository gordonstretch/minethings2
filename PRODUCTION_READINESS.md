# Production readiness acceptance criteria

MineThings is ready for production only when every gate below passes against the current
workspace. A passing unit suite alone is not sufficient.

## 1. Gameplay integrity

- `npm test` passes without skipped or flaky tests.
- Registration, login, mining, inventory, markets, factories, vehicles, maps, messages,
  administration, and the Oil Field retain server-level coverage.
- Database upgrades are idempotent and preserve existing players, open corridors, and
  vehicle state.

## 2. HTTP and account safety

- Every response has CSP, clickjacking, MIME-sniffing, referrer, permissions, and
  cross-origin isolation headers.
- Dynamic HTML and JSON are `no-store`; static assets return an ETag and support `304`.
- Production session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure`.
- Registration requires a deliverable email address. No unverified account can access gameplay,
  state APIs, finding polls, or live-update streams; verification links expire and are single-use.
- Cross-site POSTs are rejected, request bodies are bounded, repeated failed logins are
  throttled, and malformed URLs/cookies/referrers do not crash the server.
- Static routes serve only approved asset extensions. Portal, PHP, configuration, and
  source files are not downloadable.

## 3. Runtime and deployment

- SQLite runs with foreign keys, WAL, bounded lock waits, normal synchronous mode, and a
  bounded WAL checkpoint policy.
- Catalog reads remain cached until the catalog revision changes; background maintenance
  does not block ordinary page reads.
- Request/header/keep-alive lifetimes are bounded and shutdown drains active connections.
- `npm run build:production` produces a runtime-only bundle without tests, audit captures,
  portal source, PHP, or development dependencies.
- `npm run test:production` boots that bundle with a new database and passes health, asset,
  and source-disclosure checks.
- Production startup fails unless SMTP delivery, a sender identity, and an HTTPS public origin
  are configured. A real pre-production mailbox must receive and complete a verification link.

## 4. Rendered user experience

- Playwright reports no uncaught page errors or failed same-origin asset requests on the
  home, inventory, market, item, mine, factory, vehicle, map, messages, account, admin,
  and Oil Field journeys.
- At 360 px, 768 px, and 1440 px viewports, the document itself has no unintended
  horizontal overflow. Purpose-built map, table, and Oil Field scrollers remain usable.
- Primary and player navigation show the actual current page, mobile navigation is at
  least 44 px high, and the current destination can be reached by keyboard.
- A keyboard-visible skip link and focus indicators are present; interactive controls have
  accessible names.
- Only open inter-map corridors and available market purchases are shown to players.

## 5. Cleanup

- Removed behavior has no remaining execution path, test expectation, or documentation
  claiming it is live.
- Generated and duplicate artifacts are not kept in the runtime tree.
- The production bundle contains only files required to boot and serve the Node game.

## Verification commands

```powershell
npm test
npm run audit:assets
npm run audit:rendered
npm run test:production
```

The rendered audit is mandatory: if no browser is connected or Playwright cannot launch,
production acceptance remains incomplete rather than being inferred from source inspection.

## Current verification evidence

Verified on 2026-08-23:

| Gate | Evidence | Result |
| --- | --- | --- |
| Gameplay and server behavior | `npm test` | 203 passed, 0 failed |
| Legacy game artwork | `npm run audit:assets` | 1,203 images, 127 references, 0 missing |
| Runtime-only deployment | `npm run test:production` | clean database booted; health/assets passed; PHP and portal requests returned 404 |
| Live local smoke | `/health`, conditional asset request, PHP and portal probes | 200 health, 304 asset, 404 source probes |
| Rendered desktop/mobile UX | Browser Playwright audit | Pending: no browser is connected to this session |
