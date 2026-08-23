import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('runtime behavior never branches on editable catalog display names', () => {
  const runtimeFiles = [
    'src/game.js',
    'src/server.js',
    'src/store.js',
    'src/item-values.js',
    'src/dwarves.js',
    'src/specialisations.js',
    'src/vehicle-combat.js',
    'public/finding-queue.js',
    'public/live-updates.js',
    'public/oil-field.js'
  ];
  for (const relative of runtimeFiles) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(
      source,
      /\b(?:item|gadget|stone|mineType|machine|dwarf)\.name\s*(?:===|!==)\s*['"]/,
      `${relative} branches on an editable name`);
    assert.doesNotMatch(source, /catalog_(?:gadgets|stones)\.name\s*=/,
      `${relative} queries behavior by an editable name`);
    assert.doesNotMatch(source,
      /['"](?:Tutorial|Box of Cannonballs|Box of Chain Shot|Box of Grape Shot)['"]/,
      `${relative} identifies catalog behavior by an editable display name`);
    assert.doesNotMatch(source,
      /\b(?:route_type|routeType|aircraft_type|aircraftType)\s*(?:===|!==|==|!=)\s*[012]\b/,
      `${relative} branches on a hardcoded route or aircraft role ID`);
    assert.doesNotMatch(source, /catalog_items\.mine_type_id\s*=\s*(?:14|15)\b/,
      `${relative} queries fishing behavior by a hardcoded mine-type ID`);
    assert.doesNotMatch(source, /players\.profession\s*=\s*(?:8|9)\b/,
      `${relative} queries specialisation behavior by a hardcoded ID`);
    assert.doesNotMatch(source, /\[3,\s*6\]\.includes\([^)]*profession/,
      `${relative} maps patrol behavior from hardcoded specialisation IDs`);
    assert.doesNotMatch(source, /Number\(ammoType\)\s*===\s*[123]\b/,
      `${relative} maps ammunition storage from hardcoded type IDs`);
    assert.doesNotMatch(source, /shot\.type\s*===\s*3\b/,
      `${relative} maps ammunition achievements from a hardcoded type ID`);
    assert.doesNotMatch(source, /\[1,\s*2,\s*3\]\.map\(\(type\)/,
      `${relative} renders a hardcoded ammunition-type list`);
    assert.doesNotMatch(source, /\bLIMIT\s+(?:15|20|30|100|200)\b/i,
      `${relative} uses a hardcoded user-visible query limit`);
    assert.doesNotMatch(source, /\.slice\(0,\s*(?:8|10|50|100|120)\b/,
      `${relative} uses a hardcoded user-visible result limit`);
    assert.doesNotMatch(source, /gender\s*!==\s*2\b/,
      `${relative} hardcodes the any-gender avatar ID`);
    assert.doesNotMatch(source, /now\s*-\s*(?:30\s*\*\s*24|24\s*\*\s*60)/,
      `${relative} uses a hardcoded statistics window`);
    assert.doesNotMatch(source, /setInterval\([^,]+,\s*5000\s*\)/,
      `${relative} hardcodes the Dwarf findings polling interval`);
    assert.doesNotMatch(source, /available\s*===\s*2\b/,
      `${relative} hardcodes the Oil Field helicopter build tier`);
    assert.doesNotMatch(source, /itemRarity\s*===\s*1\b/,
      `${relative} hardcodes the extra fishing-cargo rarity`);
    assert.doesNotMatch(source, /rateOfFire\s*===\s*[12]\b/,
      `${relative} hardcodes cannon firing schedules`);
    assert.doesNotMatch(source, /rarity\s*>\s*1\s*\?\s*this\.database/,
      `${relative} hardcodes the minimum rarity for meld combat bonuses`);
    assert.doesNotMatch(source, /meldCount\s*\*\s*0\.5\b/,
      `${relative} hardcodes the land meld armor bonus`);
    assert.doesNotMatch(source, /entry\.rarity\s*<\s*6\b/,
      `${relative} hardcodes the maximum pillage rarity`);
    if (relative !== 'src/store.js') {
      assert.doesNotMatch(source, /profile_function_mine_names/,
        `${relative} uses the retired name-based profile grouping`);
    }
  }
  const storeSource = fs.readFileSync(path.join(ROOT, 'src/store.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
  const findingQueueSource = fs.readFileSync(path.join(ROOT, 'public/finding-queue.js'), 'utf8');
  const oilClientSource = fs.readFileSync(path.join(ROOT, 'public/oil-field.js'), 'utf8');
  const legacyOilClientSource = fs.readFileSync(
    path.join(ROOT, 'td/public_html/app/webroot/js/machines11.js'), 'utf8'
  );
  assert.doesNotMatch(oilClientSource, /\btitleCase\s*\(/,
    'Oil Field client calls the unavailable legacy titleCase helper');
  assert.doesNotMatch(storeSource, /item_limit\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+50/i,
    'new-player capacity comes from a SQL literal');
  assert.doesNotMatch(storeSource, /build_tier\s+BETWEEN\s+0\s+AND\s+2/i,
    'Oil Field tier IDs are constrained to legacy values');
  assert.doesNotMatch(storeSource, /point\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(point\s+BETWEEN\s+0\s+AND\s+5\)/i,
    'Oil Field direction IDs are constrained to the legacy direction count');
  assert.doesNotMatch(storeSource, /rarity\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(rarity\s+BETWEEN\s+1\s+AND\s+6\)/i,
    'Dwarf state is constrained to the legacy rarity IDs');
  assert.doesNotMatch(serverSource, /Max-Age=604800/,
    'session lifetime is hardcoded in the HTTP layer');
  assert.doesNotMatch(storeSource, /rating\s+REAL\s+NOT\s+NULL\s+DEFAULT\s+1600/i,
    'vehicle starting rating comes from a SQL literal');
  assert.doesNotMatch(storeSource, /aircraft_event_at\s*\+\s*10000/,
    'aircraft event timing is hardcoded');
  assert.doesNotMatch(storeSource, /rules_json\s*\?\?\s*['"]\{\}['"]/,
    'missing machine rules silently become an empty object');
  assert.doesNotMatch(storeSource, /travel_order\s*\?\?\s*['"]peaceful['"]/,
    'missing travel orders silently become peaceful');
  assert.doesNotMatch(storeSource, /icon_source\s*\?\?|large_image\s*\?\?\s*item\.icon/,
    'missing live artwork metadata silently uses a code fallback');
  assert.doesNotMatch(serverSource, /backfillCatalogArtwork/,
    'server startup overwrites missing live artwork from the bootstrap dump');
  assert.doesNotMatch(storeSource, /machine_(?:power|life_days)[^\n]*(?:\?\?|\|\|)/,
    'missing machine settings silently use a runtime fallback');
  assert.doesNotMatch(serverSource, /finding_source_names\s*\?\?\s*\{\}/,
    'missing finding-source names silently become an empty map');
  assert.doesNotMatch(serverSource, /catalog\.(?:stones|cityMineTypes)\s*\?\?\s*\[\]/,
    'missing live catalog collections silently become empty');
  assert.doesNotMatch(serverSource, /catalog\.byId\.get\(element\.itemId\)\?\.rarity\s*\?\?\s*0/,
    'a missing avatar item silently receives rarity zero');
  assert.doesNotMatch(serverSource, /Unknown opponent|vehicle_name\s*\?\?\s*['"]vehicle['"]/,
    'battle reports invent catalog-like opponent data');
  assert.doesNotMatch(serverSource,
    /catalog\.equipmentByItemId\.get\([^\n]+\)\)\.filter\(Boolean\)/,
    'missing equipped catalog items are silently discarded');
  assert.doesNotMatch(storeSource, /#dwarfTierForItem\([^\n]+\)\?\.disappearanceChance\s*\?\?\s*1/,
    'a missing Dwarf tier silently becomes certain disappearance');
  assert.doesNotMatch(storeSource, /rarityById\.get\([^\n]+\)\?\.maxExplosives\s*\?\?\s*0/,
    'a missing rarity silently becomes a zero-explosive limit');
  assert.doesNotMatch(storeSource, /vehicle\.routeType\s*\?\?\s*0/,
    'a missing vehicle route type silently becomes the first route type');
  assert.doesNotMatch(storeSource, /type\.displayPowerMultiplier\s*\?\?\s*1/,
    'a missing machine display multiplier silently becomes one');
  assert.doesNotMatch(storeSource, /JSON\.stringify\(type\.rules\s*\?\?\s*\{\}\)/,
    'missing machine behavior rules silently become an empty object');
  assert.doesNotMatch(storeSource, /item\.iconSource\s*\?\?|item\.largeImage\s*\?\?/,
    'missing catalog artwork is synthesized while seeding');
  assert.doesNotMatch(storeSource, /backfillCatalogArtwork|catalogArtworkMissing/,
    'runtime store code retains a path that restores catalog artwork from code');
  const gameSource = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  const itemValueSource = fs.readFileSync(path.join(ROOT, 'src/item-values.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(ROOT, 'src/vehicle-combat.js'), 'utf8');
  assert.doesNotMatch(gameSource, /catalog\.botParts\s*\?\?\s*\[\]/,
    'missing bot-part data silently becomes an empty collection');
  assert.doesNotMatch(itemValueSource,
    /catalog\.(?:meldRequirements|factoryActions)\s*\?\?\s*\[\]/,
    'missing valuation inputs silently become empty collections');
  assert.doesNotMatch(itemValueSource, /byMineType\.get\([^\n]+\)\s*\?\?\s*new Map/,
    'missing valuation item groups silently become an empty map');
  assert.doesNotMatch(itemValueSource, /mineTypesByCity\.get\([^\n]+\)\s*\?\?\s*\[\]/,
    'missing city availability silently becomes no available mines');
  assert.doesNotMatch(combatSource, /current\[0\]\s*-\s*previous\[0\]\s*\|\|\s*1/,
    'a malformed rating table silently receives an interpolation width');
  assert.doesNotMatch(combatSource, /ships\[side\]\.critChance\s*\?\?\s*0/,
    'a missing critical-hit chance silently becomes zero');
  assert.doesNotMatch(combatSource, /firingRounds\s*&&\s*!firingRounds\.includes/,
    'a missing cannon firing schedule silently means every round');
  const calculatorStart = storeSource.indexOf('calculatorReport(');
  const calculatorEnd = storeSource.indexOf('changeProfession(', calculatorStart);
  const calculatorSource = storeSource.slice(calculatorStart, calculatorEnd);
  assert.doesNotMatch(calculatorSource,
    /['"](?:Findings|Things|Mines and vehicles|Total things owned|Current gold)['"]/,
    'calculator report labels are hardcoded in runtime');
  const ledgerStart = storeSource.indexOf('ledgerReport(');
  const ledgerEnd = storeSource.indexOf('medalDetectorReport(', ledgerStart);
  const ledgerSource = storeSource.slice(ledgerStart, ledgerEnd);
  assert.doesNotMatch(ledgerSource, /['"](?:Sold|Bought)['"]/,
    'ledger report labels are hardcoded in runtime');
  const statsStart = storeSource.indexOf('publicStats(');
  const statsEnd = storeSource.indexOf('sendMessage(', statsStart);
  const statsSource = storeSource.slice(statsStart, statsEnd);
  assert.doesNotMatch(statsSource,
    /['"](?:Active Miners|Active Mines|Mining Ore|Mining Gold|Gold per capita)['"]/,
    'public statistics labels are hardcoded in runtime');
  assert.doesNotMatch(serverSource, /heading\s*===\s*['"]Gold['"]/,
    'statistics formatting branches on an editable section heading');
  assert.doesNotMatch(storeSource, /sale\.action\s*===\s*['"](?:Sold|Bought)['"]/,
    'ledger totals branch on editable action labels');
  assert.doesNotMatch(serverSource, /selectedFunction\s*!==\s*['"]All['"]/,
    'profile filtering branches on a user-visible sentinel label');
  assert.doesNotMatch(serverSource, /catalog\.rarities[^\n]*\.filter\([^\n]*id\s*>\s*0/,
    'vehicle combat options assume zero is the non-vehicle rarity');
  assert.doesNotMatch(serverSource, /<option value=["']0["']>All/,
    'profile filters reserve a live catalog ID as their all-values sentinel');
  assert.doesNotMatch(serverSource, /['"]At sea['"]/,
    'the HTTP runtime uses a hardcoded location label');
  assert.doesNotMatch(storeSource, /cityName:\s*[^\n]*['"]At sea['"]/,
    'the store runtime uses a hardcoded location label');
  const itemDetailStart = serverSource.indexOf('function itemDetailStatGroups(');
  const itemDetailEnd = serverSource.indexOf('function itemDetailStats(', itemDetailStart);
  const itemDetailSource = serverSource.slice(itemDetailStart, itemDetailEnd);
  assert.doesNotMatch(itemDetailSource,
    /['"](?:Land vehicle|Ship|Aircraft|Weapon|Vehicle modification|Mining equipment|Collectible)['"]/,
    'item classification labels are hardcoded in runtime');
  for (const relative of ['src/server.js', 'src/game.js', 'src/item-values.js']) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(source, /stone\.rank\s*\/\s*7|Math\.(?:floor|ceil)\([^\n]*rank\s*\/\s*7/,
      `${relative} derives Stone rarity from rank at runtime`);
  }
  assert.doesNotMatch(storeSource,
    /(?:for\s*\([^)]*of|\.map\s*\()[^\n]*\[0,\s*1,\s*2,\s*3,\s*4,\s*5,\s*6\]/,
    'runtime report behavior assumes the legacy rarity IDs');
  assert.doesNotMatch(storeSource, /vehicleByType\.get\([012]\)/,
    'runtime reports assume legacy route IDs');
  assert.doesNotMatch(findingQueueSource, /schedule\((?:250|5000)\)|Math\.min\([^,]+,\s*30000\)/,
    'finding polling intervals are hardcoded in the browser');
  for (const source of [oilClientSource, legacyOilClientSource]) {
    assert.doesNotMatch(source, /Hex\.available\)?\s*={2,3}\s*2\b/,
      'Oil Field browser behavior hardcodes the helicopter tier ID');
  }
  assert.doesNotMatch(oilClientSource,
    /\[['"]shortin['"],\s*['"]shortout['"],\s*['"]longin['"],\s*['"]longout['"]/,
    'Oil Field browser behavior hardcodes the pipe machine list');
  assert.doesNotMatch(oilClientSource, /\[['"]flower['"],\s*['"]thumper['"]\]/,
    'Oil Field browser behavior identifies bombs by editable machine names');
  assert.doesNotMatch(serverSource, /machineIconSvg\(\s*machineType\.name/,
    'machine artwork behavior is selected by an editable machine name');
  assert.doesNotMatch(serverSource, /dwarf-\[1-6\]|machine-icons[^\n]*\[0-6\]/,
    'generated artwork routes hardcode the legacy rarity IDs');
  const iconSource = fs.readFileSync(path.join(ROOT, 'src/item-icons.js'), 'utf8');
  assert.doesNotMatch(iconSource, /Math\.min\(rarityColours\.length\s*-\s*1/,
    'missing rarity artwork silently clamps to another live rarity');
  assert.doesNotMatch(serverSource, /liveUpdatePollMs|pollLiveUpdates|livePollTimer/,
    'live page updates periodically poll SQLite instead of using commit and file wake-ups');
  assert.match(serverSource, /server\.once\(['"]listening['"],\s*startBackgroundMaintenance\)/,
    'background maintenance can start before the HTTP server successfully binds');
});
