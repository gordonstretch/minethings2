# MineThings migration parity

This matrix records the comparison made against the locally preserved CakePHP
controllers and the Node/SQLite implementation. A row is
only **complete** when its player-facing behavior has a Node route, persistent
SQLite state where required, and automated coverage. Administrative/debug and
retired payment-provider actions are tracked separately from the playable game.

| Legacy area | Node/SQLite evidence | Status | Remaining work |
|---|---|---|---|
| Accounts, login, profiles, avatars, privacy | `/account`, `/miners/:name`, `/avatar`; server/store tests | Complete | — |
| Live page state | SQLite-triggered player/topic change scopes, commit-time and WAL/database file wake-ups without recurring database polling, read-only fragment hydration, listen-gated maintenance, authenticated server-sent events, and in-place DOM reconciliation with focus and dirty-form preservation; the interactive Oil Field is excluded to preserve active machine placement; direct-database, event-stability, and browser audits | Platform capability | — |
| Mines, findings, equipment, bots, explosives, priority, oil | `/`, `/mines/*`; automatic atomic mine settlement, player-scoped live finding events, compact rarity-coloured top-right item notices, and a durable Europe/London daily findings journal; game/store/server/rendered tests | Complete | — |
| Stones | `/stones`, `player_stones`, all 43 automatic award hooks | Complete | — |
| Item inventory and item pages | `/inventory`, `/items/:id`, trash-on-find, all-city public filters and Armory concealment | Complete | — |
| Dwarves | `/dwarves`; city-and-time persisted findings with a five-second full-card feed; random 0–7-minute city findings, 5% disappearance for every rarity, Exploited stone, global trash competition, compatible land/sea stowaways, capture, escape and drowning; focused store/server/rendered tests | Complete | — |
| Weather, moon and world creatures | `/events`; persistent Cambridge-season weather changing at a restart-stable random interval from 30 minutes to 8 hours, with snowbound departures, storms at sea, and repeat-safe hurricane damage for travelling land vehicles and ships; an independent persisted global natural-creature roll every random 1–45 minutes, downtime collapsed to one current roll or weather change, eight lunar phases, physical route intersections, proactive living-creature ambushes, and roaming Ghost Riders and Ghost Ships whose outgoing force is reduced to 85%; the player view uses a spoiler-free industrial threat board and six original SVG creature marks, while detailed mechanics remain in audited administration and outcome records | New expansion | — |
| Item markets | `/exchange`, `/market/items/:id`, SQLite open orders and sales; player-priced listings and bids on the original price ladder, established minimum listing prices, best-price FIFO buy-now/sell-now trades, known empty order books, compact stock cards, item-type filtering, search, and recommended/rarity/price/name sorting | Complete | — |
| Mine markets | `/market/mines/:id`, gold order book, sales, credit purchase, rent and resale | Complete | — |
| Melds | `/melds`, create, compare, deconstruct; one fixed shared capital per discovered region, with global capacity-free Meld storage and capital-local loose ingredients | Complete | — |
| Gadgets | `/gadgets` plus ledger, detector, spreadsheet, calculator | Complete | — |
| Specialisations | `/professions`; bonus-only specialisations with universal system access, snapshotted travel bonuses, and the original persistent Newb-to-Grandmaster titles accrued from charged battery time separately for each specialisation | Complete | — |
| Factories and workers | `/factories`, persistent production queues, reserved-input refunds, reorder/cancel controls, automatic advancement, worker hire/assign/oil, every catalog action, repair, sale and rental | Complete | — |
| Vehicles and travel | `/vehicles`, quick-send controls below each vehicle description, live-update-safe persistent ordered multi-leg itineraries with immediate onward departure and final-stop cargo delivery, loadouts, routes, fishing, oil, ratings and award hooks; pillage and patrol orders automatically target the complete matching combat tier; original land/ship combat includes port-safe zones, one active encounter per craft, combat delays and trajectory replanning, persistent hull/sail damage, full port crew and sail recovery, one-hull-per-hour port repair, journey disarming, protected Orange cargo, simultaneous sinking achievements, immediate complete wrecks at the encounter location, and per-shot/boarding/repair battle reports | Complete | — |
| Oil field machines | `/oil-field`; all 46 catalog machines; legacy 100-pass power/oil graph; rarity life/power; angled, straight, Funnel, Vacuum, Horizon and Siphon flow; proportional depletion; damage/repair/defenses; Flak build tiers; five-minute spills and Crane theft; city-local aircraft/inventory; queues, bombs, Machine alerts, Oil-use audit and Ledger statistics; focused store/server regressions | Complete | — |
| Banking and direct transfers | Retired with idempotent balance/contract settlement audit; `/banks/*` and legacy gold-gift requests return 410; historical transfer records remain read-only | Retired | — |
| Private and system messages | `/messages`, conversations, active typed filters, transactional Market/Transfer/Stone/Factory/Vehicle/City/Machine/Admin reports, rich daily Findings digests with restart-safe delivery receipts and late supplements, background delivery, bulk read/delete/keep actions, blocks, and permanent 28-day expiry for unkept mail | Complete | — |
| Public chat | `/chat`; persistent original meld-tier colours on miner names and messages, administrator black, the legacy custom colour picker from 140 melds, per-miner ignores, unignorable live World notices, and Dwarf-capture announcements; Fabled and Legendary finds remain private; store/server/rendered regressions | Complete | — |
| Stats and ratings | `/stats`, `/ratings`, battle reports | Complete | — |
| Maps, city selection and regional capitals | `/map`, `/cities/:id/select`, `world_maps.capital_city_id`; seven named five-city maps with one shared gateway capital and 15 mine types each; `/move` is retired with 410 and historical player home rows are preserved but non-authoritative; local and 12,000 km inter-map land/sea/air routes; admin-controlled corridor opening; discoverable destination previews and first-arrival rewards | Complete | — |
| Credit shop/containers | `/containers`, `/market`, paid ten-day battery extension and original credit purchases | Complete | — |
| Help/tutorial/forums | `/help`; direct-to-game onboarding | Replacement | The original tutorial-stage records are absent from the preserved database dump, and the retired external wiki/forum is not embedded. |
| User-submitted images and ads | original catalog/game imagery is served unchanged; no upload or advertising workflow | Out of playable scope | Do not restore unmoderated uploads or retired ad integrations without a deployment requirement. |
| Administration | `/admin`; authority-gated dashboard, miner search, suspension and chat/PM bans, credit/gold/item grants, global inbox announcements, world weather and creature controls, operational totals and persistent audit log; server coverage | Replacement | Unsafe database-update/debug actions and obsolete cron wrappers remain retired. |
| Facebook/Beanstream payment callbacks | no Node equivalents | Retired external integration | Do not recreate without an explicit deployment requirement. |

## Image-fidelity gates

- Approved image, CSS, and JavaScript files from the preserved game webroot are served for
  `/img`, `/css`, and `/js`; PHP and configuration files are denied.
- `npm run audit:assets` inventories the game images and fails on missing static references.
- `npx playwright test test/rendered-audit.spec.mjs --workers=1` checks rendered
  pages for broken images and captures representative migration screenshots.
- New UI must use catalog-provided legacy image paths. It must not replace an
  available original asset with generated artwork or a generic substitute.

## Oil Field parity gates

- Pipe direction and rates are checked against `hex.php`, including all five
  angled Pipe models, straight pipes, shared-source flow and meld scaling.
- Vacuum, Horizon and Siphon have regressions for their original collection
  radii, fixed pull rates and closest/fullest/unowned selection rules.
- Power routing retains the original 100-level recursion and output splitting;
  expiry settlement runs queued replacements from their actual deployment time.
- Dynamic build tiers, Helicopter/Flak rules, universal claims, cross-city field
  operation, Ledger reports, five-minute spill cadence, extraction auditing and
  Machine inbox alerts are covered by automated tests.

## Completion rule

Do not call the migration complete while any playable row is **Partial** or
**Missing**, or while its stated verification evidence is absent.

The gameplay-mechanics rows are complete. The original data-driven tutorial is
listed as a replacement rather than falsely claimed as equivalent: its CakePHP
state machine survives, but the ordered tutorial-stage content needed to
reconstruct it does not. Unsafe legacy debug endpoints, uploads, advertising,
forums, wiki and payment-provider callbacks remain outside the playable migration scope.
