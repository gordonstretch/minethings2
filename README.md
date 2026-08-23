# MineThings — Node.js revival

This repository contains a runnable Node.js version of the MineThings game. Reviewed artwork, browser assets, and view templates from the original application remain in `td/` as migration references; they are never executed as server-side code by the Node application. The retired server and `tp/` portal trees are kept outside source releases as offline archives because they contain obsolete private configuration. They are not served, audited, or included in production builds.

## Run it

Requirements: Node.js 22.13 or newer. The running game uses Node's built-in SQLite driver; install development dependencies only when running the rendered browser audit.

```powershell
npm start
```

Open <http://127.0.0.1:3000>. To use another address, set `HOST` or `PORT` before starting the server.

Set `DATABASE_FILE` to use a database outside the default `data/minethings.sqlite` path.

### Mandatory email verification

Every new miner must supply and verify an email address before any game page, API state,
finding poll, or live-update stream is available. Changing the verified address locks the
account until the replacement address is confirmed. Links are single-use, expire after 24
hours, and can be resent after one minute. Only a SHA-256 token hash is stored.

Local development shows the verification link on the locked account page. Production refuses
to start until SMTP delivery and an HTTPS public origin are configured:

```powershell
$env:SMTP_HOST = 'smtp.example.com'
$env:SMTP_PORT = '587'
$env:SMTP_SECURE = '0'
$env:SMTP_USER = 'smtp-user'
$env:SMTP_PASSWORD = 'smtp-password'
$env:MINETHINGS_EMAIL_FROM = 'MineThings <mail@example.com>'
$env:MINETHINGS_PUBLIC_ORIGIN = 'https://game.example.com'
$env:NODE_ENV = 'production'
npm start
```

Port 465 normally uses `SMTP_SECURE=1`; port 587 normally uses STARTTLS with
`SMTP_SECURE=0`. Deployments whose relay authenticates by network identity may omit both
SMTP credential variables. A username or password supplied alone is rejected.

To enable the administration console for existing miners, provide a comma-separated allowlist when starting the server. Matching accounts receive administrator authority in SQLite and see an **Administration** link after login.

```powershell
$env:MINETHINGS_ADMINS = 'Miner Name,Second Admin'
npm start
```

The console at `/admin` includes operational totals, miner search and moderation, credit/gold/item grants, global inbox announcements, world-event controls, and an action log. Administrators can override the current weather on each map and spawn a Kraken or Land Whale on a compatible open route. Suspensions and chat/private-message bans are enforced by the server.

### PayPal credit checkout

Credit checkout is disabled unless explicitly configured. Use PayPal sandbox credentials first:

```powershell
$env:PAYPAL_ENABLED = '1'
$env:PAYPAL_ENV = 'sandbox'
$env:PAYPAL_CLIENT_ID = 'your-sandbox-client-id'
$env:PAYPAL_CLIENT_SECRET = 'your-sandbox-client-secret'
$env:PAYPAL_WEBHOOK_ID = 'your-sandbox-webhook-id'
$env:MINETHINGS_PUBLIC_ORIGIN = 'https://your-test-host.example'
npm start
```

Register the webhook URL as `https://your-test-host.example/webhooks/paypal`. Live mode
also requires an HTTPS public origin and the seller details that UK checkout must publish:

```powershell
$env:PAYPAL_ENV = 'live'
$env:MINETHINGS_OPERATOR_NAME = 'Public project name'
$env:MINETHINGS_LEGAL_NAME = 'Legal seller name'
$env:MINETHINGS_LEGAL_ADDRESS = 'Geographic service address'
$env:MINETHINGS_LEGAL_EMAIL = 'payments@example.com'
```

The server refuses live checkout when the client credentials, webhook ID, HTTPS origin,
or any seller field is missing. Secrets and seller details must be supplied by the deployment
environment, never committed. PayPal hosts approval; the server creates and captures Orders v2,
verifies webhooks, grants credits idempotently, and records downloadable receipts at `/credits`.

```powershell
npm test
npm run audit:assets
npm run audit:rendered
npm run test:production
```

Build a deployment directory with `npm run build:production`. The generated `dist/`
contains the server, production npm dependencies, and approved static artwork, but excludes
tests, portal and PHP source, audit captures, and development dependencies. Run it behind HTTPS with
`NODE_ENV=production` so session cookies are marked `Secure`.

## What was migrated

- mandatory verified-email registration, login, and hashed passwords, with expiring single-use
  links, resend throttling, duplicate-address protection, and re-verification after address changes
- persistent player state in `data/minethings.sqlite`
- scoped live page updates driven by SQLite triggers, commit-time in-process signals, SQLite WAL/database file notifications, and authenticated server-sent events; there is no recurring live-update database poll, and changed content is reconciled in place without reloads while focused controls and unfinished forms are preserved; the interactive Oil Field is deliberately excluded so an update cannot destroy an in-progress machine placement
- read-only live-fragment hydration and listen-gated background maintenance prevent notification feedback loops and failed server starts from leaving hidden database writers
- normalized SQLite tables for players, mines, inventory, and discoveries
- starter mines and five initial findings
- six-hour mining discoveries, including capped offline progress
- switchable things, gold, and ore production using the legacy gold-drop algorithm
- all 43 original equipment definitions, seven bot slots, equipment-adjusted mining rates, and persistent mine loadouts
- all 28 original miner-robot definitions, persistent robot assignments, and legacy damaged-find probability
- all six original explosives with city-local consumption, ±25% power variation, instant things/gold/ore output, and original detonation artwork
- all 191 legacy meld definitions and 620 recipe requirements, with capacity-free Meld storage, automatic recipe completion, atomic home-city creation, and ownership
- all 13 gadget types and 38 activator items, additive original lifespans, the Hammer equipment-rate bonus, and the Ledger, Calculator, Spreadsheet, and Meldal Detector pages
- 11 meld-gated, bonus-only specialisations; every miner can use land, sea, air, factories, workers, fishing, and the Oil Field; the original per-specialisation Newb-to-Grandmaster tenure titles advance only while batteries are charged and retain progress when switching
- six rarity tiers of Dwarf with randomly timed 0–7-minute city-specific findings from their own rarity through two tiers lower, a uniform 5% disappearance rate, the Exploited stone, and weighted class-matched vehicle stowaways that escape, are captured, or drown
- persistent six-hour seasonal weather modelled on Cambridge 1991–2020 climate normals, with deliberately frequent storms that damage ships at sea; a separate persisted natural-creature clock rolls one eligible world at a random 1–45-minute interval without replaying downtime backlogs; an eight-phase lunar cycle alters storms, Dwarf captures, creature activity, combat, and treasure; audited administration controls can override each map's current weather
- Kraken and Land Whale route travellers with visible speed, position, destination and persistent health; compatible ships and land vehicles physically pursue them from either endpoint, combat resolves only at interception, and the killing craft fills its remaining cargo capacity with bounty things; administrators can spawn either creature on a compatible open route, and mines can occasionally capture Dwarves directly into the local mining cycle
- compact acknowledged reports for routine findings and full artwork-and-description occasions for Purple and Orange findings, always ordered from highest to lowest rarity
- seven-day worker contracts, CPH, oil boosts, seven-worker factory assignments, and exact contract-expiry progress
- factory construction, persistent ten-job production queues with reserved inputs and automatic advancement, cancel/refund, reordering and demolition flows, timed production, damaged-item repair, robot production, metal melds, aircraft, ammunition, and original action costs
- live public chat with the original meld-count colours, persistent custom colours from 140 melds, administrator black, per-miner ignores, escaped plain text, deduplicated World notices, and account-controlled Purple/Orange discovery announcements
- Audited player-to-player gold gifts from miner profiles; retired banking balances and contracts are settled once during migration
- the original 46 oil-field machine definitions, universal shared-hex operation, Pilot-extended machine life, original rarity power/lifespans, directional pumping and packing, Helicopter build-radius checks, and 159-litre Oil barrel claims
- oil-field power routing and replacement queues, search-plane intelligence, bombing, flak and drone defenses, hostile machines, welders, and oil-stealing cranes
- city-scoped inventories, original per-city mine availability, land/sea/air routes, geographic map, vehicle activation and travel, arrivals, and city discovery
- seven distinct worlds—Aso, Bromo, Calbuco, Dempo, Ebeko, Fogo, and Gallego—recast as fully playable five-city maps, each with 15 mine types and a local land/sea/air network; their initially closed 12,000 km inter-map corridors are controlled from Administration
- all original vehicle, land, ship, aircraft, mod, weapon, cannon, ammunition, bomb, box, and rating-tier catalog records
- vehicle cargo, rarity-class restrictions, mods, weapons, oil, ship cannons, ammunition crates, aggression settings, pursuit, land and ship combat, pillaging, battle histories, and ratings
- all eight permanent credit-shop containers, with duplicate ownership and one capacity bonus per container type
- the original rarity algorithm and 698 discoverable catalog items, including the four new Dwarf tiers
- inventory, item details, selling, credits, and purchasing mine types
- public, sourced History and versioned Legal pages; registration consent and PayPal-hosted GBP credit checkout with receipts, webhook recovery, reversals, and administrator auditing
- utility-adjusted fixed gold values for every item, with a 40% listing-and-bid premium outside cities offering the item's mine type and enforced by city-specific markets; the purchase-only exchange uses compact stock cards, item-type filters, search, and rarity/affordability/price/name sorting; sell listings leave inventory for capacity-free item escrow, with partial fills, cancellation returns, and sale history
- miner directory, public profiles, unread counts, and private conversations
- inbox filtering and bulk read, unread, delete, restore, keep, and stop-keeping controls; transactional reports for markets, transfers, stones, factories, vehicles, cities, machines, payments, and administration; background factory and vehicle delivery; unkept messages are permanently purged after 28 days; city-local Ore-scrap recycling, Auto-Recycle recommendations, Ore refining, and premium Factory Worker bots
- mine priorities, three active mines plus a Remote Control slot, bot oiling, rechargeable meld-scaled batteries, fourteen-day rentals, and refundable mine resale
- public server statistics, layered legacy avatar editing and capacity bonuses, meld comparison, and Fisherman bait-to-fish conversion
- all 1,396 original item rows imported into SQLite plus four new Dwarf tiers (including equipment, explosives, robots, vehicles, and 694 damaged variants), with 698 normal mining items in the standard finding pool
- the original image-driven header, navigation sprites and hover states, sidebar, footer, rarity art, and legacy asset URLs
- a JSON health endpoint and authenticated state endpoint

The Node server uses Node's built-in SQLite driver plus Nodemailer for SMTP delivery. It does
not require PHP, CakePHP, or MySQL. Playwright is a development-only dependency for rendered
audits.

## Migration boundary

Core gameplay routes and the useful administrator operations are now represented by Node pages and actions. The remaining deliberately retired surface is the old portal and Facebook login, historic player passwords and account recovery, obsolete real-money invoice/payment integrations, unsafe database-update/debug endpoints, user-generated ads and item-image moderation, and the pre-account applicant rename/activity flow. Legacy `js_*` actions that only wrapped partial-page CakePHP rendering are represented by normal server-rendered forms and routes instead of being copied endpoint-for-endpoint. The original game source and SQL snapshots remain the authority for future modernization; the archived portal tree is never exposed by the Node server or production bundle.

New accounts do not modify `gallegodb_copy.sql`; only `data/minethings.sqlite` (and its SQLite WAL files) changes. Delete those database files while the server is stopped to reset the Node-era game state.

On first start, the legacy MySQL dump seeds the playable cities, mine types, item catalog, equipment, explosives, robots, routes, and vehicles into SQLite. Later starts load the catalog from SQLite; older partial Node-era catalogs are upgraded automatically. If `data/players.json` exists and the SQLite database is empty, its players are also imported automatically. The JSON file is left untouched as a backup.
