import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dwarfFindRange } from './dwarves.js';
import { assignItemGoldValues } from './item-values.js';
import { machineIconPath } from './item-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SQL = path.join(ROOT, 'gallegodb_copy.sql');
const ICON_ROOT = path.join(ROOT, 'td', 'public_html', 'app', 'webroot', 'img', 'icons');
const IMAGE_ROOT = path.join(ROOT, 'td', 'public_html', 'app', 'webroot', 'img');

const RARITY_NAMES = ['', 'Common', 'Uncommon', 'Rare', 'Exceptional', 'Fabled', 'Legendary'];
const EQUIPMENT_TYPE_NAMES = ['', 'Tool Belt', 'Boots', 'Pickaxe', 'Drill', 'Cart', 'Hardhat', 'Light'];
const EQUIPMENT_RARITY_ADJECTIVES = ['', 'Flimsy', 'Standard', 'Hardy', 'Crafted', 'Fabled', 'Legendary'];
export const SHROOM_CATALOG = Object.freeze({
  mapId: 2,
  mapSlug: 'bromo',
  mineType: Object.freeze({
    id: 26, name: 'Shrooms', creditCost: 325, rentCost: 22,
    hasOre: false, refundable: true, icon: '/node/shrooms/mine.svg'
  }),
  items: Object.freeze([
    { id: 1434, name: 'Button Shroom', rarity: 1,
      description: 'A squat Bromo mushroom with a nutty cap. Mostly harmless, always useful in an introductory Spore Print.',
      marketableId: 1261, goldValueUnits: 10000, icon: '/node/shrooms/shroom-1.svg' },
    { id: 1440, name: 'Field Mushroom', rarity: 1,
      description: 'A sturdy white mushroom gathered from Bromo ash meadows. Its broad gills hold a clean Spore Print.',
      marketableId: 1267, goldValueUnits: 9246, icon: '/node/shrooms/shroom-1-2.svg' },
    { id: 1441, name: 'Shaggy Inkcap', rarity: 1,
      description: 'A shaggy Bromo inkcap that dissolves into black ink. Melders use the ink to fix spores to paper.',
      marketableId: 1268, goldValueUnits: 9246, icon: '/node/shrooms/shroom-1-3.svg' },
    { id: 1442, name: 'Common Puffball', rarity: 1,
      description: 'A round puffball packed with dry spores. A careful squeeze supplies an entire Spore Print.',
      marketableId: 1269, goldValueUnits: 9246, icon: '/node/shrooms/shroom-1-4.svg' },
    { id: 1443, name: 'Parasol Mushroom', rarity: 1,
      description: 'A tall, scaly mushroom whose cap opens like an umbrella after Bromo rain.',
      marketableId: 1270, goldValueUnits: 9246, icon: '/node/shrooms/shroom-1-5.svg' },
    { id: 1435, name: 'Glowcap', rarity: 2,
      description: 'A cool green mushroom that glows after dusk. Miners use it to mark the edge of a Fairy Ring.',
      marketableId: 1262, goldValueUnits: 40000, icon: '/node/shrooms/shroom-2.svg' },
    { id: 1444, name: 'Golden Chanterelle', rarity: 2,
      description: 'A gold-folded forest mushroom whose trumpet shape carries whispers around a Fairy Ring.',
      marketableId: 1271, goldValueUnits: 40000, icon: '/node/shrooms/shroom-2-2.svg' },
    { id: 1445, name: 'Scarlet Waxcap', rarity: 2,
      description: 'A bright waxy cap found on Bromo slopes. Its colour remains vivid when worked into a meld.',
      marketableId: 1272, goldValueUnits: 40000, icon: '/node/shrooms/shroom-2-3.svg' },
    { id: 1446, name: 'Earthstar', rarity: 2,
      description: 'A leathery fungus that unfolds into a many-pointed star when Bromo soil becomes damp.',
      marketableId: 1273, goldValueUnits: 40000, icon: '/node/shrooms/shroom-2-4.svg' },
    { id: 1447, name: 'Wood Blewit', rarity: 2,
      description: 'A lilac woodland mushroom used to give a Fairy Ring its cool outer boundary.',
      marketableId: 1274, goldValueUnits: 40000, icon: '/node/shrooms/shroom-2-5.svg' },
    { id: 1436, name: 'Dreamcap', rarity: 3,
      description: 'A blue-veined Bromo shroom said to make sleepers remember routes they have never travelled.',
      marketableId: 1263, goldValueUnits: 290000, icon: '/node/shrooms/shroom-3.svg' },
    { id: 1448, name: "Lion's Mane", rarity: 3,
      description: 'A cascading white fungus prized by navigators for the clear dreams it lends to a Dreamwalk.',
      marketableId: 1275, goldValueUnits: 280000, icon: '/node/shrooms/shroom-3-2.svg' },
    { id: 1449, name: 'Amethyst Deceiver', rarity: 3,
      description: 'A violet mushroom that changes shade when nobody looks directly at it.',
      marketableId: 1276, goldValueUnits: 280000, icon: '/node/shrooms/shroom-3-3.svg' },
    { id: 1450, name: "Bird's Nest Fungus", rarity: 3,
      description: 'A tiny cup holding spore-filled eggs. Melders arrange them as waypoints for a Dreamwalk.',
      marketableId: 1277, goldValueUnits: 280000, icon: '/node/shrooms/shroom-3-4.svg' },
    { id: 1451, name: "Devil's Cigar", rarity: 3,
      description: 'A dark closed fungus that bursts into a smoky star when disturbed.',
      marketableId: 1278, goldValueUnits: 280000, icon: '/node/shrooms/shroom-3-5.svg' },
    { id: 1437, name: "Witch's Cap", rarity: 4,
      description: 'A sharp red cap prized by careful brewers. It is the dangerous heart of a Witch’s Brew meld.',
      marketableId: 1264, goldValueUnits: 2000000, icon: '/node/shrooms/shroom-4.svg' },
    { id: 1452, name: 'Ghost Fungus', rarity: 4,
      description: 'A pale fungus that shines from within. Its cold light reveals whether a Witch’s Brew is ready.',
      marketableId: 1279, goldValueUnits: 2000000, icon: '/node/shrooms/shroom-4-2.svg' },
    { id: 1453, name: 'Bleeding Tooth', rarity: 4,
      description: 'A white cap beaded with crimson sap. One drop gives a dangerous meld its bite.',
      marketableId: 1280, goldValueUnits: 2000000, icon: '/node/shrooms/shroom-4-3.svg' },
    { id: 1454, name: 'Veiled Lady', rarity: 4,
      description: 'A delicate Bromo stinkhorn draped in a lace-like veil used to strain potent brews.',
      marketableId: 1281, goldValueUnits: 2000000, icon: '/node/shrooms/shroom-4-4.svg' },
    { id: 1455, name: 'Destroying Angel', rarity: 4,
      description: 'A beautiful white mushroom handled only with sealed tools. It makes a Witch’s Brew irreversible.',
      marketableId: 1282, goldValueUnits: 2000000, icon: '/node/shrooms/shroom-4-5.svg' },
    { id: 1438, name: 'Void Morel', rarity: 5,
      description: 'A magical honeycombed fungus that seems deeper inside than outside. Essential to the Mycelial Mind meld.',
      marketableId: 1265, goldValueUnits: 14010000, icon: '/node/shrooms/shroom-5.svg' },
    { id: 1456, name: 'Pixie Parasol', rarity: 5,
      description: 'A magical silver parasol under which tiny footprints appear overnight, even in locked vaults.',
      marketableId: 1283, goldValueUnits: 14010000, icon: '/node/shrooms/shroom-5-2.svg' },
    { id: 1457, name: 'Witchwood Polypore', rarity: 5,
      description: 'A magical shelf fungus that stores a whispered thought in each coloured ring.',
      marketableId: 1284, goldValueUnits: 14010000, icon: '/node/shrooms/shroom-5-3.svg' },
    { id: 1458, name: 'Mooncap', rarity: 5,
      description: 'A magical crescent-capped mushroom that grows only in the shadow of Bromo’s moon.',
      marketableId: 1285, goldValueUnits: 14010000, icon: '/node/shrooms/shroom-5-4.svg' },
    { id: 1459, name: "Oracle's Ear", rarity: 5,
      description: 'A magical ear-shaped fungus that repeats tomorrow’s rumours in a voice like distant thunder.',
      marketableId: 1286, goldValueUnits: 14010000, icon: '/node/shrooms/shroom-5-5.svg' },
    { id: 1439, name: 'Crown of Bromo', rarity: 6,
      description: 'A legendary magical shroom found only in Bromo. The final living piece of the Crown of Bromo meld.',
      marketableId: 1266, goldValueUnits: 84040000, icon: '/node/shrooms/shroom-6.svg' },
    { id: 1460, name: 'Phoenix Morel', rarity: 6,
      description: 'A legendary magical morel that burns to warm ash and grows back before sunrise.',
      marketableId: 1287, goldValueUnits: 84040000, icon: '/node/shrooms/shroom-6-2.svg' },
    { id: 1461, name: "Djinn's Lantern", rarity: 6,
      description: 'A legendary magical cap lit by captive blue fire. Rubbing its stem grants excellent bad advice.',
      marketableId: 1288, goldValueUnits: 84040000, icon: '/node/shrooms/shroom-6-3.svg' },
    { id: 1462, name: 'Time Truffle', rarity: 6,
      description: 'A legendary magical truffle that is always dug up one minute before it was buried.',
      marketableId: 1289, goldValueUnits: 84040000, icon: '/node/shrooms/shroom-6-4.svg' },
    { id: 1463, name: 'Wishcap', rarity: 6,
      description: 'A legendary magical mushroom that fulfils wishes literally, briefly, and usually inconveniently.',
      marketableId: 1290, goldValueUnits: 84040000, icon: '/node/shrooms/shroom-6-5.svg' }
  ]),
  melds: Object.freeze([
    { id: 234, name: 'Spore Print', rarity: 1 },
    { id: 235, name: 'Fairy Ring', rarity: 2 },
    { id: 236, name: 'Dreamwalk', rarity: 3 },
    { id: 237, name: "Witch's Brew", rarity: 4 },
    { id: 238, name: 'Mycelial Mind', rarity: 5 },
    { id: 239, name: 'Crown of Bromo', rarity: 6 }
  ]),
  meldRequirements: Object.freeze([
    { id: 1701, meldId: 234, itemId: 1434, count: 5 },
    { id: 1702, meldId: 235, itemId: 1434, count: 3 },
    { id: 1703, meldId: 235, itemId: 1435, count: 2 },
    { id: 1704, meldId: 236, itemId: 1435, count: 3 },
    { id: 1705, meldId: 236, itemId: 1436, count: 2 },
    { id: 1706, meldId: 237, itemId: 1436, count: 3 },
    { id: 1707, meldId: 237, itemId: 1437, count: 2 },
    { id: 1708, meldId: 238, itemId: 1437, count: 3 },
    { id: 1709, meldId: 238, itemId: 1438, count: 2 },
    { id: 1710, meldId: 239, itemId: 1438, count: 3 },
    { id: 1711, meldId: 239, itemId: 1439, count: 1 },
    { id: 1712, meldId: 234, itemId: 1440, count: 1 },
    { id: 1713, meldId: 234, itemId: 1441, count: 1 },
    { id: 1714, meldId: 234, itemId: 1442, count: 1 },
    { id: 1715, meldId: 234, itemId: 1443, count: 1 },
    { id: 1716, meldId: 235, itemId: 1444, count: 1 },
    { id: 1717, meldId: 235, itemId: 1445, count: 1 },
    { id: 1718, meldId: 235, itemId: 1446, count: 1 },
    { id: 1719, meldId: 235, itemId: 1447, count: 1 },
    { id: 1720, meldId: 236, itemId: 1448, count: 1 },
    { id: 1721, meldId: 236, itemId: 1449, count: 1 },
    { id: 1722, meldId: 236, itemId: 1450, count: 1 },
    { id: 1723, meldId: 236, itemId: 1451, count: 1 },
    { id: 1724, meldId: 237, itemId: 1452, count: 1 },
    { id: 1725, meldId: 237, itemId: 1453, count: 1 },
    { id: 1726, meldId: 237, itemId: 1454, count: 1 },
    { id: 1727, meldId: 237, itemId: 1455, count: 1 },
    { id: 1728, meldId: 238, itemId: 1456, count: 1 },
    { id: 1729, meldId: 238, itemId: 1457, count: 1 },
    { id: 1730, meldId: 238, itemId: 1458, count: 1 },
    { id: 1731, meldId: 238, itemId: 1459, count: 1 },
    { id: 1732, meldId: 239, itemId: 1460, count: 1 },
    { id: 1733, meldId: 239, itemId: 1461, count: 1 },
    { id: 1734, meldId: 239, itemId: 1462, count: 1 },
    { id: 1735, meldId: 239, itemId: 1463, count: 1 }
  ])
});
const WOOD_ITEMS = Object.freeze([
  { id: 1464, name: 'Pine Plank', rarity: 1,
    description: 'A straight Calbuco pine plank, light enough for crates and sturdy enough for the first Wood Meld.',
    marketableId: 1291, goldValueUnits: 10000, icon: '/node/wood/wood-1.svg' },
  { id: 1465, name: 'Cedar Board', rarity: 1,
    description: 'A fragrant Calbuco cedar board that resists damp and keeps a packing crate respectable.',
    marketableId: 1292, goldValueUnits: 9246, icon: '/node/wood/wood-1-2.svg' },
  { id: 1466, name: 'Birch Slat', rarity: 1,
    description: 'A pale, flexible birch slat cut for bracing useful things without adding much weight.',
    marketableId: 1293, goldValueUnits: 9246, icon: '/node/wood/wood-1-3.svg' },
  { id: 1467, name: 'Spruce Beam', rarity: 1,
    description: 'A clean Calbuco spruce beam used wherever a simple Wood Meld needs a dependable spine.',
    marketableId: 1294, goldValueUnits: 9246, icon: '/node/wood/wood-1-4.svg' },
  { id: 1468, name: 'Wood Screws', rarity: 1,
    description: 'A salvaged box of sharp wood screws. Timber becomes useful when these and a handful of Bolts hold it together.',
    marketableId: 1295, goldValueUnits: 10000, icon: '/node/wood/wood-1-5.svg' },
  { id: 1469, name: 'Oak Board', rarity: 2,
    description: 'A dense Calbuco oak board seasoned for workbenches that must survive enthusiastic miners.',
    marketableId: 1296, goldValueUnits: 40000, icon: '/node/wood/wood-2.svg' },
  { id: 1470, name: 'Beech Plank', rarity: 2,
    description: 'A smooth beech plank whose even grain makes it a patient surface for precise work.',
    marketableId: 1297, goldValueUnits: 40000, icon: '/node/wood/wood-2-2.svg' },
  { id: 1471, name: 'Maple Stock', rarity: 2,
    description: 'Hard maple stock from Calbuco, cut square for handles, legs, and practical Meld construction.',
    marketableId: 1298, goldValueUnits: 40000, icon: '/node/wood/wood-2-3.svg' },
  { id: 1472, name: 'Ash Beam', rarity: 2,
    description: 'A springy ash beam that bends under a heavy load and remembers where it started.',
    marketableId: 1299, goldValueUnits: 40000, icon: '/node/wood/wood-2-4.svg' },
  { id: 1473, name: 'Walnut Panel', rarity: 2,
    description: 'A dark walnut panel reserved for the visible face of a miner’s finest early handiwork.',
    marketableId: 1300, goldValueUnits: 40000, icon: '/node/wood/wood-2-5.svg' },
  { id: 1474, name: 'Teak Plank', rarity: 3,
    description: 'An oily teak plank that shrugs off Calbuco rain and the neglect of long journeys.',
    marketableId: 1301, goldValueUnits: 280000, icon: '/node/wood/wood-3.svg' },
  { id: 1475, name: 'Mahogany Board', rarity: 3,
    description: 'A deep red mahogany board, strong enough for a handcart and handsome enough to steal.',
    marketableId: 1302, goldValueUnits: 280000, icon: '/node/wood/wood-3-2.svg' },
  { id: 1476, name: 'Ironwood Beam', rarity: 3,
    description: 'A brutally heavy ironwood beam that turns a useful frame into a lasting one.',
    marketableId: 1303, goldValueUnits: 280000, icon: '/node/wood/wood-3-3.svg' },
  { id: 1477, name: 'Rosewood Stock', rarity: 3,
    description: 'Fragrant rosewood stock with a resonant grain that hums when a cart gathers speed.',
    marketableId: 1304, goldValueUnits: 280000, icon: '/node/wood/wood-3-4.svg' },
  { id: 1478, name: 'Ebony Panel', rarity: 3,
    description: 'A near-black ebony panel polished until it reflects the builder and all their ambitions.',
    marketableId: 1305, goldValueUnits: 280000, icon: '/node/wood/wood-3-5.svg' },
  { id: 1479, name: 'Petrified Timber', rarity: 4,
    description: 'Ancient Calbuco timber replaced by stone grain by grain; masonry tools barely trouble it.',
    marketableId: 1306, goldValueUnits: 2000000, icon: '/node/wood/wood-4.svg' },
  { id: 1480, name: 'Carbonwood Beam', rarity: 4,
    description: 'A fire-blackened beam compressed harder than steel without losing the memory of wood.',
    marketableId: 1307, goldValueUnits: 2000000, icon: '/node/wood/wood-4-2.svg' },
  { id: 1481, name: 'Storm-Felled Oak', rarity: 4,
    description: 'An oak trunk split by Calbuco lightning, leaving bright branching scars through its heart.',
    marketableId: 1308, goldValueUnits: 2000000, icon: '/node/wood/wood-4-3.svg' },
  { id: 1482, name: 'Ember Cedar', rarity: 4,
    description: 'Warm cedar that continues to smoulder without burning away, ideal for an occupied watchtower.',
    marketableId: 1309, goldValueUnits: 2000000, icon: '/node/wood/wood-4-4.svg' },
  { id: 1483, name: 'Leviathan Driftwood', rarity: 4,
    description: 'A salt-white timber rib carried inland from something far larger than any known ship.',
    marketableId: 1310, goldValueUnits: 2000000, icon: '/node/wood/wood-4-5.svg' },
  { id: 1484, name: 'Witchwood Bough', rarity: 5,
    description: 'A magical purple bough that knots itself around loose screws while nobody is watching.',
    marketableId: 1311, goldValueUnits: 14010000, icon: '/node/wood/wood-5.svg' },
  { id: 1485, name: 'Moonwood Plank', rarity: 5,
    description: 'A magical silver plank that becomes weightless under the Calbuco moon.',
    marketableId: 1312, goldValueUnits: 14010000, icon: '/node/wood/wood-5-2.svg' },
  { id: 1486, name: 'Whispering Willow', rarity: 5,
    description: 'A magical willow timber that quietly repeats every plan discussed over a workbench made from it.',
    marketableId: 1313, goldValueUnits: 14010000, icon: '/node/wood/wood-5-3.svg' },
  { id: 1487, name: 'Runebark Slab', rarity: 5,
    description: 'A magical slab whose living grain rearranges itself into instructions for impossible joinery.',
    marketableId: 1314, goldValueUnits: 14010000, icon: '/node/wood/wood-5-4.svg' },
  { id: 1488, name: 'Starfall Timber', rarity: 5,
    description: 'A magical blue timber grown around a fallen star and still faintly warm between the rings.',
    marketableId: 1315, goldValueUnits: 14010000, icon: '/node/wood/wood-5-5.svg' },
  { id: 1489, name: 'Worldtree Heartwood', rarity: 6,
    description: 'Legendary magical heartwood from a tree whose roots appear on every world map.',
    marketableId: 1316, goldValueUnits: 84040000, icon: '/node/wood/wood-6.svg' },
  { id: 1490, name: 'Phoenix Ash', rarity: 6,
    description: 'Legendary magical ash wood that burns with its creation and grows whole again by dawn.',
    marketableId: 1317, goldValueUnits: 84040000, icon: '/node/wood/wood-6-2.svg' },
  { id: 1491, name: 'Timeworn Yew', rarity: 6,
    description: 'Legendary magical yew whose youngest ring is older than the timber surrounding it.',
    marketableId: 1318, goldValueUnits: 84040000, icon: '/node/wood/wood-6-3.svg' },
  { id: 1492, name: 'Dragonroot Timber', rarity: 6,
    description: 'Legendary magical rootwood scaled in gold and hot enough to soften a Bolt in the hand.',
    marketableId: 1319, goldValueUnits: 84040000, icon: '/node/wood/wood-6-4.svg' },
  { id: 1493, name: 'Dreaming Redwood', rarity: 6,
    description: 'Legendary magical redwood that dreams complete buildings before the first cut is made.',
    marketableId: 1320, goldValueUnits: 84040000, icon: '/node/wood/wood-6-5.svg' }
]);
const WOOD_MELDS = Object.freeze([
  { id: 240, name: 'Packing Crate', rarity: 1 },
  { id: 241, name: 'Master Workbench', rarity: 2 },
  { id: 242, name: 'Reinforced Handcart', rarity: 3 },
  { id: 243, name: 'Timber Watchtower', rarity: 4 },
  { id: 244, name: 'Witchwood Workshop', rarity: 5 },
  { id: 245, name: 'Worldtree Ark', rarity: 6 }
]);
let nextWoodRequirementId = 1736;
const WOOD_MELD_REQUIREMENTS = Object.freeze(WOOD_MELDS.flatMap((meld) => {
  const tierItems = WOOD_ITEMS.filter((item) => item.rarity === meld.rarity).map((item) => ({
    id: nextWoodRequirementId++, meldId: meld.id, itemId: item.id,
    count: item.id === 1468 ? 4 + meld.rarity * 2 : 1
  }));
  if (meld.rarity > 1) tierItems.push({
    id: nextWoodRequirementId++, meldId: meld.id, itemId: 1468,
    count: 4 + meld.rarity * 2
  });
  tierItems.push({
    id: nextWoodRequirementId++, meldId: meld.id, itemId: 2,
    count: meld.rarity + 2
  });
  return tierItems;
}));
export const WOOD_CATALOG = Object.freeze({
  mapId: 3,
  mapSlug: 'calbuco',
  mineType: Object.freeze({
    id: 27, name: 'Wood', creditCost: 350, rentCost: 24,
    hasOre: false, refundable: true, icon: '/node/wood/mine.svg'
  }),
  items: WOOD_ITEMS,
  melds: WOOD_MELDS,
  meldRequirements: WOOD_MELD_REQUIREMENTS,
  screwItemId: 1468,
  boltItemId: 2
});
const WISDOM_HAIKUS = Object.freeze([
  { name: 'Patient Pickaxe', lines: ['Let quiet drills turn', 'Charged hours gather small things', 'Return with full hands'] },
  { name: 'Empty Cart', lines: ['Leave one space unfilled', 'Roads punish the greedy load', 'Arrive without loss'] },
  { name: 'Local Price', lines: ['Watch each city price', 'What is cheap here sells well there', 'Distance makes the gold'] },
  { name: 'Safe Road', lines: ['Patrol before trade', 'Armor buys a safer road', 'Cargo reaches town'] },
  { name: 'Quiet Stash', lines: ['Stage the rare things first', 'Meld storage bears no burden', 'Your carts remain clear'] },
  { name: 'Weather Eye', lines: ['Clouds gather on roads', 'Snow can strand the strongest hull', 'Wait beneath clear skies'] },
  { name: 'Split Cargo', lines: ['Two carts leave at dawn', 'One bears wealth, one draws the thieves', 'Loss chooses lightly'] },
  { name: 'Dwarf Passage', lines: ['Hide a Dwarf aboard', 'Match the Dwarf tier to the road', 'New hands reach the town'] },
  { name: 'Oil Reserve', lines: ['Barrels wait at home', 'Machines drink before they work', 'Claim before you build'] },
  { name: 'Patient Bid', lines: ['Low bids sleep in town', 'Fast sellers wake them at dusk', 'Margin greets sunrise'] },
  { name: 'Route Ledger', lines: ['Write each arrival', 'Buy where the next town is bare', 'Bring home market gold'] },
  { name: 'Decoy Convoy', lines: ['Two carts leave at dawn', 'One shows gold, one hides the prize', 'Raiders choose the shine'] },
  { name: 'Workshop Queue', lines: ['Queue the shortest work', 'Reserve Ore before hiring', 'No worker waits dry'] },
  { name: 'Barrel Current', lines: ['Turn pipes to the pad', 'Power follows every joint', 'Black oil fills the drums'] },
  { name: 'Cannon Economy', lines: ['Load shot for the prey', 'Chain shot slows, grape clears the decks', 'Hull yields to iron'] },
  { name: 'Choke Point', lines: ['Own both road markets', 'Raise the far price, cut the near', 'Each traveler pays'] },
  { name: 'False Scarcity', lines: ['List one thing at dusk', 'Let empty shelves teach desire', 'Sell the dawn dearly'] },
  { name: 'Midnight Convoy', lines: ['Move while rivals sleep', 'Chain three cities before dawn', 'Reset every price'] },
  { name: 'Flak Orchard', lines: ['Ring the field with Flak', 'Make their bombs bloom into smoke', 'Build beneath the ash'] },
  { name: 'Guild Tide', lines: ['Fill the guild bank first', 'Friends withdraw what markets lack', 'Favors steer the vote'] },
  { name: 'Flooded Hexes', lines: ['Drown all the Oil Field', 'Spills conceal the pipes below', 'Vacuum what remains'] },
  { name: 'Empty Shelves', lines: ['Buy the whole supply', 'Relist one piece at a time', 'Name tomorrow’s price'] },
  { name: 'Borrowed Loyalty', lines: ['Stock the guild bank deep', 'Give freely until they lean', 'Then ask for the road'] },
  { name: 'Pirate Calendar', lines: ['Chart each convoy bell', 'Raid when loaded traders leave', 'Sell their cargo home'] },
  { name: 'Route Monopoly', lines: ['Hold both gates with steel', 'Patrol peace, pillage all else', 'Set the road’s own toll'] },
  { name: 'Invisible Cartel', lines: ['Five quiet bidders', 'Move one market with no words', 'Gold obeys the tide'] },
  { name: 'Oilfield Deluge', lines: ['Wake every Siphon', 'Flood their grid, drain through your ring', 'Black rivers crown you'] },
  { name: 'Guild Puppeteer', lines: ['No leader is named', 'Yet gifts turn each open hand', 'The bank speaks your will'] },
  { name: 'Exploit Cartographer', lines: ['Probe each hidden seam', 'Tell the keepers what you find', 'Profit when it mends'] },
  { name: 'Ashen Empire', lines: ['Own road, guild, and field', 'Starve each town, then sell escape', 'Let each rival pay'] }
]);
const WISDOM_GOLD_VALUE_UNITS = Object.freeze([
  10000, 40000, 280000, 2000000, 14010000, 84040000
]);
const WISDOM_ITEMS = Object.freeze(WISDOM_HAIKUS.map((haiku, index) => {
  const rarity = Math.floor(index / 5) + 1;
  const variant = index % 5;
  return Object.freeze({
    id: 1494 + index,
    name: haiku.name,
    rarity,
    description: haiku.lines.join('\n'),
    marketableId: 1321 + index,
    goldValueUnits: WISDOM_GOLD_VALUE_UNITS[rarity - 1],
    icon: `/node/wisdom/wisdom-${rarity}${variant ? `-${variant + 1}` : ''}.svg`
  });
}));
const WISDOM_MELDS = Object.freeze([
  { id: 246, name: 'Miner’s Primer', rarity: 1 },
  { id: 247, name: 'Roadside Koan', rarity: 2 },
  { id: 248, name: 'Strategist’s Verse', rarity: 3 },
  { id: 249, name: 'Book of Leverage', rarity: 4 },
  { id: 250, name: 'Audacious Sutra', rarity: 5 },
  { id: 251, name: 'Forbidden Playbook', rarity: 6 }
]);
let nextWisdomRequirementId = 1777;
const WISDOM_MELD_REQUIREMENTS = Object.freeze(WISDOM_MELDS.flatMap((meld) =>
  WISDOM_ITEMS.filter((item) => item.rarity === meld.rarity).map((item) => ({
    id: nextWisdomRequirementId++, meldId: meld.id, itemId: item.id, count: 1
  }))));
export const WISDOM_CATALOG = Object.freeze({
  mapId: 4,
  mapSlug: 'dempo',
  mineType: Object.freeze({
    id: 28, name: 'Wisdom', creditCost: 400, rentCost: 28,
    hasOre: false, refundable: true, icon: '/node/wisdom/mine.svg'
  }),
  items: WISDOM_ITEMS,
  melds: WISDOM_MELDS,
  meldRequirements: WISDOM_MELD_REQUIREMENTS
});
export const WORLD_CREATURE_TYPES = Object.freeze([
  'kraken', 'land_whale', 'white_whale', 'orca_pod', 'elephant_herd', 't_rex'
]);
const SALE_VALUES = [0, 1, 3, 10, 35, 125, 500];
const MAX_EXPLOSIVES_PER_DETONATION = [0, 4000, 1000, 250, 50, 15, 4];
export const LEGACY_ITEM_VALUE_RULES = Object.freeze({
  rarityMinimumGold: [0.01, 0.5833, 4.0833, 28.5833, 200.0833, 1400.5833, 8403.5],
  oilBarrelGold: 100,
  oilLitersPerBarrel: 159,
  utilityGoldByItemId: { 368: 5 },
  recipe: {
    rarityWeightPerTier: 0.2,
    breadth: 0.18,
    requiredUnits: 0.12,
    soleIngredient: 0.35,
    singleUnitSoleMultiplier: 1.5
  },
  factory: { ore: 0.12, components: 1 / 15000 },
  equipmentBucketsPerHour: 0.15,
  explosiveBuckets: 1 / 3600,
  robotModel: 0.04,
  vehicle: {
    speed: 0.01,
    capacity: 0.04,
    landAttack: 0.2,
    landArmor: 0.015,
    shipCannonPortals: 0.2,
    shipHull: 0.02,
    shipCrew: 0.01,
    aircraftRole: [2, 4, 3]
  },
  weaponStat: 0.2,
  mod: { capacity: 0.2, attack: 0.2, armor: 0.015, offense: 0.1, defense: 0.1, dodge: 0.05 },
  cannon: { damage: 0.25, rateOfFire: 0.4 },
  cannonball: 0.1,
  bombBuckets: 1 / 5000,
  box: 0.8,
  gadgetDefaultUtilityGold: 1,
  gadgetUtilityGold: {
    hammer: 2.5, warehouse: 6, armory: 2, ledger: 4, calculator: 1,
    sharpener: 4, shield: 4, turbo: 3, radar: 2, spreadsheet: 4,
    medal_detector: 3, binoculars: 1.5, control: 7
  },
  machine: {
    flower: { fixedLiters: 2000, realizableShare: 0.08 },
    thumper: { fixedLiters: 10000, realizableShare: 0.08 },
    pipe200: { litersPerPowerHour: 10, realizableShare: 0.08 },
    pipe400: { litersPerPowerHour: 10, realizableShare: 0.08 },
    pipe600: { litersPerPowerHour: 10, realizableShare: 0.08 },
    pipe800: { litersPerPowerHour: 10, realizableShare: 0.08 },
    pipe1000: { litersPerPowerHour: 10, realizableShare: 0.08 },
    shortin: { litersPerPowerHour: 10, realizableShare: 0.08 },
    shortout: { litersPerPowerHour: 10, realizableShare: 0.08 },
    longin: { litersPerPowerHour: 10, realizableShare: 0.08 },
    longout: { litersPerPowerHour: 10, realizableShare: 0.08 },
    pump: { litersPerPowerHour: 10, realizableShare: 0.12 },
    pad: { litersPerPowerHour: 20, realizableShare: 0.12 },
    power: { litersPerPowerHour: 20, realizableShare: 0.14 },
    pelter: { litersPerPowerHour: 10, realizableShare: 0.08 },
    'pump-pipe': { litersPerPowerHour: 20, realizableShare: 0.18 },
    'pad-pipe': { litersPerPowerHour: 20, realizableShare: 0.18 },
    funnel: { litersPerPowerHour: 30, realizableShare: 0.1 },
    double: { litersPerPowerHour: 40, realizableShare: 0.14 },
    mallet: { litersPerPowerHour: 20, realizableShare: 0.14 },
    welder: { litersPerPowerHour: 20, realizableShare: 0.25 },
    zapper: { litersPerPowerHour: 20, realizableShare: 0.18 },
    grinder: { litersPerPowerHour: 20, realizableShare: 0.18 },
    harvester: { litersPerPowerHour: 40, realizableShare: 0.18 },
    vacuum: { litersPerPowerHour: 20, realizableShare: 0.22 },
    turret: { litersPerPowerHour: 20, realizableShare: 0.22 },
    reaper: { litersPerPowerHour: 50, realizableShare: 0.2 },
    siphon: { litersPerPowerHour: 20, realizableShare: 0.18 },
    beepy: { litersPerPowerHour: 20, fixedLitersPerHour: 120, realizableShare: 0.1 },
    horizon: { litersPerPowerHour: 20, realizableShare: 0.28 },
    crane: { barrelsPerHour: 12, realizableShare: 0.01 },
    drone: { litersPerPowerHour: 20, realizableShare: 0.55 },
    flak: { litersPerPowerHour: 20, realizableShare: 0.65 }
  },
  avatar: { backgroundBase: 1, backgroundPerRarity: 0.2, other: 0.05 },
  baitMineTypeId: 14,
  fishMineTypeId: 15,
  baitCatchValueShare: 0.35,
  dwarfLifetimeOutputShare: 0.5,
  dwarfTypicalCityShare: 0.75,
  dwarfBestCityShare: 0.25,
  repairedItemValueShare: 0.3
});
const FACTORY_ACTION_RULES = Object.freeze({
  1: { actionKind: 'build' },
  2: { actionKind: 'robot' },
  3: { actionKind: 'meld', meldId: 225 },
  4: { actionKind: 'meld', meldId: 226 },
  5: { actionKind: 'meld', meldId: 227 },
  6: { actionKind: 'meld', meldId: 228 },
  7: { actionKind: 'meld', meldId: 229, awardStoneBehaviorKey: 'Forged' },
  8: { actionKind: 'repair' },
  10: { actionKind: 'item', outputItemId: 737, outputQuantity: 1 },
  11: { actionKind: 'item', outputItemId: 738, outputQuantity: 1 },
  12: { actionKind: 'item', outputItemId: 739, outputQuantity: 1 },
  13: { actionKind: 'item', outputItemId: 740, outputQuantity: 1 },
  14: { actionKind: 'item', outputItemId: 741, outputQuantity: 1 },
  15: { actionKind: 'item', outputItemId: 1269, outputQuantity: 20 },
  16: { actionKind: 'item', outputItemId: 1270, outputQuantity: 20 },
  17: { actionKind: 'item', outputItemId: 1271, outputQuantity: 20 },
  18: { actionKind: 'item', outputItemId: 1107, outputQuantity: 1 }
});
const SPECIALISATION_BONUS_KEYS = Object.freeze([
  'mineGold', 'loadedLandSpeed', 'landPillageOffense', 'landPatrolDefense',
  'loadedSeaSpeed', 'seaPillageOffense', 'seaPatrolDefense', 'fishingOpportunities',
  'workerThroughput', 'factoryThroughput', 'aircraftSpeed', 'oilMachineLife'
]);

// Bootstrap copy of the original profession-day titles from
// td/public_html/app/models/level.php. Once seeded, catalog_settings is the
// runtime authority so operators can adjust the ladder without changing code.
export const LEGACY_SPECIALISATION_TITLES = Object.freeze([
  { days: 0, title: 'Newb' },
  { days: 3, title: 'New' },
  { days: 7, title: 'Amateur' },
  { days: 13, title: 'Initiate' },
  { days: 21, title: 'Novice' },
  { days: 33, title: 'Junior' },
  { days: 49, title: 'Apprentice' },
  { days: 72, title: 'Adept' },
  { days: 104, title: 'Professional' },
  { days: 148, title: 'Delta' },
  { days: 210, title: 'Gamma' },
  { days: 297, title: 'Beta' },
  { days: 418, title: 'Alpha' },
  { days: 575, title: 'Expert' },
  { days: 779, title: 'Master' },
  { days: 1044, title: 'Grandmaster' }
]);

export const LEGACY_WORLD_EVENT_SETTINGS = Object.freeze({
  // Kept for interpreting weather history written before variable periods.
  weather_slot_ms: 6 * 60 * 60 * 1000,
  weather_change_min_interval_ms: 30 * 60 * 1000,
  weather_change_max_interval_ms: 8 * 60 * 60 * 1000,
  weather_climate_source_url: 'https://www.metoffice.gov.uk/research/climate/maps-and-data/location-specific-long-term-averages/u1214qgj0',
  weather_cambridge_monthly: [
    { month: 'January', maxC: 7.65, minC: 1.88, rainfallMm: 48.62, rainDays: 10.40 },
    { month: 'February', maxC: 8.30, minC: 1.78, rainfallMm: 35.72, rainDays: 8.67 },
    { month: 'March', maxC: 11.00, minC: 3.07, rainfallMm: 32.87, rainDays: 8.13 },
    { month: 'April', maxC: 14.12, minC: 4.64, rainfallMm: 37.56, rainDays: 8.03 },
    { month: 'May', maxC: 17.37, minC: 7.39, rainfallMm: 43.21, rainDays: 7.33 },
    { month: 'June', maxC: 20.36, minC: 10.47, rainfallMm: 49.11, rainDays: 8.73 },
    { month: 'July', maxC: 23.08, minC: 12.57, rainfallMm: 48.27, rainDays: 8.40 },
    { month: 'August', maxC: 22.85, minC: 12.62, rainfallMm: 55.86, rainDays: 9.03 },
    { month: 'September', maxC: 19.58, minC: 10.45, rainfallMm: 47.61, rainDays: 7.97 },
    { month: 'October', maxC: 15.11, minC: 7.85, rainfallMm: 58.71, rainDays: 9.57 },
    { month: 'November', maxC: 10.72, minC: 4.53, rainfallMm: 52.63, rainDays: 10.43 },
    { month: 'December', maxC: 7.95, minC: 2.18, rainfallMm: 49.20, rainDays: 10.47 }
  ],
  // Per weather change: deliberately far stormier than Cambridge while
  // retaining its real seasonal temperature and rainfall shape.
  weather_storm_chance_by_month: [0.06, 0.055, 0.05, 0.06, 0.07, 0.085,
    0.085, 0.08, 0.065, 0.07, 0.065, 0.06],
  // Snow replaces rain at or below this temperature. Hurricanes replace a
  // small warm subset of storms, preserving the overall severe-weather rate.
  weather_snow_max_temperature_c: 2,
  weather_hurricane_min_temperature_c: 18,
  weather_hurricane_chance_by_month: [0, 0, 0, 0, 0, 0.004,
    0.01, 0.012, 0.008, 0.002, 0, 0],
  storm_ship_damage_min_ratio: 0.04,
  storm_ship_damage_max_ratio: 0.12,
  hurricane_ship_damage_min_ratio: 0.15,
  hurricane_ship_damage_max_ratio: 0.35,
  hurricane_vehicle_damage_chance: 0.65,
  storm_kraken_wake_chance: 0.35,
  world_creature_land_whale_wake_chance: 0.018,
  world_creature_names: {
    kraken: 'Kraken', land_whale: 'Land Whale', white_whale: 'White Whale',
    orca_pod: 'Orca Pod', elephant_herd: 'Elephant Herd', t_rex: 'T-Rex'
  },
  world_creature_attack_names: {
    kraken: 'Tentacle smash', land_whale: 'Body slam', white_whale: 'Hull ram',
    orca_pod: 'Coordinated ram', elephant_herd: 'Stampede', t_rex: 'Bite'
  },
  world_creature_icons: {
    kraken: '/node/creatures/kraken.svg',
    land_whale: '/node/creatures/land-whale.svg',
    white_whale: '/node/creatures/white-whale.svg',
    orca_pod: '/node/creatures/orca-pod.svg',
    elephant_herd: '/node/creatures/elephant-herd.svg',
    t_rex: '/node/creatures/t-rex.svg'
  },
  world_creature_route_types: {
    kraken: 'sea', land_whale: 'land', white_whale: 'sea',
    orca_pod: 'sea', elephant_herd: 'land', t_rex: 'land'
  },
  world_creature_reward_types: {
    kraken: 'treasure', land_whale: 'treasure', white_whale: 'ore',
    orca_pod: 'ore', elephant_herd: 'ore', t_rex: 'ore'
  },
  world_creature_wake_chances: {
    kraken: 0, land_whale: 0.018, white_whale: 0.014,
    orca_pod: 0.022, elephant_herd: 0.02, t_rex: 0.008
  },
  // Creature activity is checked on its own persisted clock, independently of
  // weather changes. Each completed roll schedules the next one
  // at a uniformly random point inside this range.
  world_creature_roll_min_interval_ms: 60 * 1000,
  world_creature_roll_max_interval_ms: 45 * 60 * 1000,
  world_creature_hp: {
    kraken: 180, land_whale: 140, white_whale: 170,
    orca_pod: 125, elephant_herd: 165, t_rex: 220
  },
  world_creature_speed_kph: {
    kraken: 18, land_whale: 12, white_whale: 22,
    orca_pod: 35, elephant_herd: 16, t_rex: 20
  },
  world_creature_counter_damage_ratio: {
    kraken: 0.16, land_whale: 0.3, white_whale: 0.18,
    orca_pod: 0.14, elephant_herd: 0.25, t_rex: 0.38
  },
  // Indexes are rarity IDs. Common is deliberately the dominant natural form;
  // every species can still appear at any tier through Orange.
  world_creature_tier_weights: [0, 32, 16, 8, 4, 2, 1],
  world_creature_tier_hp_multipliers: [0, 1, 1.35, 1.8, 2.4, 3.2, 4.25],
  world_creature_tier_speed_multipliers: [0, 0.85, 0.95, 1, 1.1, 1.2, 1.35],
  world_creature_tier_damage_multipliers: [0, 0.75, 0.9, 1, 1.25, 1.55, 1.9],
  world_creature_tier_ore_drops: [0, 8, 16, 32, 64, 128, 256],
  // Spectral attackers keep their durability, but their outgoing force is
  // deliberately lower than the physical craft from which they rose.
  ghost_attack_force_ratio: 0.85,
  world_creature_reward_min_rarity: 4,
  world_creature_reward_items: 2,
  world_event_catchup_periods: 120,
  world_event_weather_retention_days: 60,
  world_event_outcome_retention_days: 7,
  world_event_player_history_limit: 20,
  mining_dwarf_capture_chance: 0.0025
});

export const LEGACY_COMBAT_SEASON_SETTINGS = Object.freeze({
  combat_season_months: 3,
  combat_season_places: 5,
  combat_season_prizes: {
    land: {
      1: [1256, 219, 149, 1257, 151],
      2: [222, 143, 142, 147, 1255],
      4: [1403, 222, 139, 143, 142]
    },
    sea: {
      1: [289, 733, 1392, 1391, 1088],
      2: [300, 296, 297, 293, 734],
      4: [1402, 300, 735, 296, 297]
    }
  }
});

const LEGACY_SPECIALISATIONS = Object.freeze([
  { id: 0, name: 'Bum', melds: 0, bonus: '20% more mine gold, collected automatically', bonuses: { mineGold: 0.2 } },
  { id: 1, name: 'Trader', melds: 0, bonus: '20% faster loaded land travel', bonuses: { loadedLandSpeed: 0.2 } },
  { id: 2, name: 'Highwayman', melds: 30, bonus: '20% more land offence while pillaging', bonuses: { landPillageOffense: 0.2 } },
  { id: 3, name: 'Guard', melds: 20, bonus: '20% more land defence while patrolling', bonuses: { landPatrolDefense: 0.2 } },
  { id: 4, name: 'Merchant', melds: 10, bonus: '20% faster loaded sea travel', bonuses: { loadedSeaSpeed: 0.2 } },
  { id: 5, name: 'Pirate', melds: 30, bonus: '20% more naval offence while pillaging', bonuses: { seaPillageOffense: 0.2 } },
  { id: 6, name: 'Bounty Hunter', melds: 20, bonus: '20% more naval defence while patrolling', bonuses: { seaPatrolDefense: 0.2 } },
  { id: 7, name: 'Fisherman', melds: 40, bonus: '20% more fishing opportunities', bonuses: { fishingOpportunities: 0.2 } },
  { id: 8, name: 'Worker', melds: 10, bonus: '20% more components per hour', bonuses: { workerThroughput: 0.2 } },
  { id: 9, name: 'Manufacturer', melds: 50, bonus: '20% more factory throughput', bonuses: { factoryThroughput: 0.2 } },
  { id: 10, name: 'Pilot', melds: 40, bonus: '20% faster aircraft and longer-lived Oil Field machines', bonuses: { aircraftSpeed: 0.2, oilMachineLife: 0.2 } }
].map((entry) => ({
  ...entry,
  bonuses: Object.fromEntries(SPECIALISATION_BONUS_KEYS.map(
    (key) => [key, Number(entry.bonuses[key] ?? 0)]
  ))
})));
const LEGACY_DWARF_TIERS = Object.freeze([
  Object.freeze({ itemId: 1430, rarity: 1, name: 'Yellow Dwarf', minimumFindRarity: 1, maximumFindRarity: 1, disappearanceChance: 0.05, stowawayWeight: 32 }),
  Object.freeze({ itemId: 1348, rarity: 2, name: 'Green Dwarf', minimumFindRarity: 1, maximumFindRarity: 2, disappearanceChance: 0.05, stowawayWeight: 16 }),
  Object.freeze({ itemId: 1431, rarity: 3, name: 'Blue Dwarf', minimumFindRarity: 1, maximumFindRarity: 3, disappearanceChance: 0.05, stowawayWeight: 8 }),
  Object.freeze({ itemId: 1073, rarity: 4, name: 'Red Dwarf', minimumFindRarity: 2, maximumFindRarity: 4, disappearanceChance: 0.05, stowawayWeight: 4 }),
  Object.freeze({ itemId: 1432, rarity: 5, name: 'Purple Dwarf', minimumFindRarity: 3, maximumFindRarity: 5, disappearanceChance: 0.05, stowawayWeight: 2 }),
  Object.freeze({ itemId: 1433, rarity: 6, name: 'Orange Dwarf', minimumFindRarity: 4, maximumFindRarity: 6, disappearanceChance: 0.05, stowawayWeight: 1 })
]);
const BOT_PARTS = [
  { id: 1, name: 'chest', label: 'Chest', bph: 0.5, cost: 0.0001, prerequisiteId: null },
  { id: 2, name: 'hips', label: 'Hips', bph: 0.6, cost: 0.0002, prerequisiteId: null },
  { id: 3, name: 'LUarm', label: 'Left upper arm', bph: 0.8, cost: 0.0008, prerequisiteId: 1 },
  { id: 4, name: 'LLarm', label: 'Left lower arm', bph: 1.7, cost: 0.0128, prerequisiteId: 3 },
  { id: 5, name: 'Lhand', label: 'Left hand', bph: 3.4, cost: 0.2048, prerequisiteId: 4 },
  { id: 6, name: 'RUarm', label: 'Right upper arm', bph: 0.7, cost: 0.0004, prerequisiteId: 1 },
  { id: 7, name: 'RLarm', label: 'Right lower arm', bph: 1.4, cost: 0.0064, prerequisiteId: 6 },
  { id: 8, name: 'Rhand', label: 'Right hand', bph: 2.8, cost: 0.1024, prerequisiteId: 7 },
  { id: 9, name: 'LUleg', label: 'Left upper leg', bph: 1.2, cost: 0.0032, prerequisiteId: 2 },
  { id: 10, name: 'LLleg', label: 'Left lower leg', bph: 2.4, cost: 0.0512, prerequisiteId: 9 },
  { id: 11, name: 'RUleg', label: 'Right upper leg', bph: 1.0, cost: 0.0016, prerequisiteId: 2 },
  { id: 12, name: 'RLleg', label: 'Right lower leg', bph: 2.0, cost: 0.0256, prerequisiteId: 11 },
  { id: 13, name: 'head', label: 'Head', bph: 4.0, cost: 0.4096, prerequisiteId: 1 }
];

// Bootstrap data only. Once seeded, catalog_machine_types is the runtime authority.
export const LEGACY_MACHINE_TYPE_RULES = Object.freeze({
  pump: { description: 'Pumps oil from the ground at P × 10L/h.', displayPowerMultiplier: 1 },
  pad: { description: 'Packs oil into barrels at P × 20L/h. After 159L, claim the Oil.', displayPowerMultiplier: 1 },
  pelter: { description: "Lobs rocks in its facing direction over a distance of P. They reduce the lifespan of other players’ machines by 1 s/s but do not affect the owner’s machines.", displayPowerMultiplier: 1 },
  power: { description: 'Boosts the adjacent machine it faces by P kW.', displayPowerMultiplier: 1 },
  pipe200: { description: 'Tail at 2:00, head at 12:00. Pipes oil from head to tail at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  pipe400: { description: 'Tail at 4:00, head at 12:00. Pipes oil from head to tail at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  pipe600: { description: 'Tail at 6:00, head at 12:00. Pipes oil from head to tail at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  pipe800: { description: 'Tail at 8:00, head at 12:00. Pipes oil from head to tail at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  pipe1000: { description: 'Tail at 10:00, head at 12:00. Pipes oil from head to tail at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  shortin: { description: 'Pipes oil from the adjacent hex it faces to its own hex at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  shortout: { description: 'Pipes oil from its own hex to the adjacent hex it faces at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  longin: { description: 'Pipes oil from the hex two spaces in its facing direction to its own hex at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  longout: { description: 'Pipes oil from its own hex to the hex two spaces in its facing direction at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  mallet: { description: "Throws hammers at the adjacent machine it faces, damaging it at P s/s. It does not affect the owner’s machines.", displayPowerMultiplier: 1 },
  'pad-pipe': { description: 'Packs oil into barrels at P × 20L/h and pipes oil from the adjacent hex it faces to itself at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  'pump-pipe': { description: 'Pumps oil from the ground at P × 20L/h and pipes oil from its own hex to the adjacent hex it faces at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  funnel: { description: 'Three pipes move oil from three adjacent hexes to the adjacent hex it faces. Each runs at P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  drone: { description: 'Destroys projectiles and bombs that would land in range on the owner’s machines. Range is P/2.', displayPowerMultiplier: 1 },
  double: { description: 'Boosts two adjacent machines by half of its displayed P kW each.', displayPowerMultiplier: 2 },
  welder: { description: 'Adds life to the adjacent machine it faces at P × 0.4 s/s.', displayPowerMultiplier: 1 },
  zapper: { description: 'Shoots plasma in its facing direction unless it would hit the owner’s machine. Damages at P s/s.', displayPowerMultiplier: 1 },
  harvester: { description: 'Steals 50% of the power from five adjacent machines and delivers it plus P kW to the adjacent machine it faces.', displayPowerMultiplier: 1 },
  grinder: { description: "Pumps oil from the ground at P × 20L/h and pelts every other player’s adjacent machine for 1 s/s damage.", displayPowerMultiplier: 1 },
  flak: { description: 'Prevents projectiles and bombs from landing in range on the owner’s machines, blocks rival deployment and queues in range, and can expand the grid. Range is P/3.', displayPowerMultiplier: 1 },
  vacuum: { description: 'Packs oil into barrels at P × 20L/h and pipes oil from each adjacent hex at 3 × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  turret: { description: 'Shoots the closest, weakest unowned machine within three hexes, damaging it at P s/s.', displayPowerMultiplier: 1 },
  reaper: { description: 'Steals 100% of the power from five adjacent machines and delivers it plus P kW to the adjacent machine it faces.', displayPowerMultiplier: 1 },
  crane: { description: 'Steals one oil barrel every five minutes from the closest, fullest hex in range. Range is P/3.', displayPowerMultiplier: 1 },
  beepy: { description: 'Pumps oil from the ground at P × 20L/h and pumps each adjacent hex at 20L/h.', displayPowerMultiplier: 1 },
  siphon: { description: 'Pipes oil from the closest, fullest unowned hex towards the adjacent hex it faces at 2 × P × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  horizon: { description: 'Packs oil into barrels at P × 20L/h and pipes oil from every hex within two spaces at 3 × (10 + floor(melds / 10)) L/h.', displayPowerMultiplier: 1 },
  flower: { description: 'A bomb carried in a Bomber. It can damage the ore thieves’ base or another player’s Oil Field machine.', displayPowerMultiplier: 1 },
  thumper: { description: 'A bomb carried in a Bomber. It can damage the ore thieves’ base or another player’s Oil Field machine.', displayPowerMultiplier: 1 }
});

const machineBehaviorRules = Object.fromEntries(Object.keys(LEGACY_MACHINE_TYPE_RULES)
  .map((name) => [name, { behaviorKey: name, rules: {} }]));
Object.assign(machineBehaviorRules, {
  pump: { behaviorKey: 'pump', rules: { pumpPowerMultiplier: 0.5 } },
  pad: { behaviorKey: 'pad', rules: { packPowerMultiplier: 1, canPack: true } },
  pelter: { behaviorKey: 'pelter', rules: { damageRate: 1 } },
  pipe200: { behaviorKey: 'pipe200', rules: { inputOffset: 1, showsPipeFlow: true } },
  pipe400: { behaviorKey: 'pipe400', rules: { inputOffset: 2, showsPipeFlow: true } },
  pipe600: { behaviorKey: 'pipe600', rules: { inputOffset: 3, showsPipeFlow: true } },
  pipe800: { behaviorKey: 'pipe800', rules: { inputOffset: 4, showsPipeFlow: true } },
  pipe1000: { behaviorKey: 'pipe1000', rules: { inputOffset: 5, showsPipeFlow: true } },
  shortin: { behaviorKey: 'shortin', rules: { distance: 1, showsPipeFlow: true } },
  shortout: { behaviorKey: 'shortout', rules: { distance: 1, showsPipeFlow: true } },
  longin: { behaviorKey: 'longin', rules: { distance: 2, showsPipeFlow: true } },
  longout: { behaviorKey: 'longout', rules: { distance: 2, showsPipeFlow: true } },
  flower: { behaviorKey: 'flower', rules: { isBomb: true, damageSeconds: 172800, burnLiters: 2000 } },
  thumper: { behaviorKey: 'thumper', rules: { isBomb: true, damageSeconds: 432000, burnLiters: 10000 } },
  double: { behaviorKey: 'double', rules: { networkPowerMultiplier: 2 } },
  drone: { behaviorKey: 'drone', rules: { protectsMachines: true, blocksBombs: true } },
  funnel: { behaviorKey: 'funnel', rules: {
    inputOffsets: [2, 3, 4], showsPipeFlow: true, showsDirectionalPipeAnimation: true
  } },
  'pump-pipe': { behaviorKey: 'pump-pipe', rules: { pumpPowerMultiplier: 1 } },
  'pad-pipe': { behaviorKey: 'pad-pipe', rules: { packPowerMultiplier: 1, canPack: true } },
  mallet: { behaviorKey: 'mallet', rules: { damagePowerMultiplier: 1 } },
  vacuum: { behaviorKey: 'vacuum', rules: {
    packPowerMultiplier: 1, fixedPipePower: 3, canPack: true, showsPipeFlow: true,
    showsDirectionalPipeAnimation: true
  } },
  flak: { behaviorKey: 'flak', rules: {
    protectsMachines: true, blocksBombs: true, blocksDeployment: true, expandsGrid: true
  } },
  grinder: { behaviorKey: 'grinder', rules: { pumpPowerMultiplier: 1, damageRate: 1 } },
  zapper: { behaviorKey: 'zapper', rules: { damagePowerMultiplier: 1, maxRangeMultiplier: 2 } },
  welder: { behaviorKey: 'welder', rules: { lifeRateMultiplier: 0.4 } },
  horizon: { behaviorKey: 'horizon', rules: {
    packPowerMultiplier: 1, fixedPipePower: 3, radius: 2, canPack: true, showsPipeFlow: true
  } },
  siphon: { behaviorKey: 'siphon', rules: { pipeCopies: 2, showsPipeFlow: true } },
  beepy: { behaviorKey: 'beepy', rules: { pumpPowerMultiplier: 1, adjacentPumpPower: 1 } },
  turret: { behaviorKey: 'turret', rules: { damagePowerMultiplier: 1, range: 3 } }
});
const MACHINE_RULE_DEFAULTS = Object.freeze({
  networkPowerMultiplier: 1,
  pumpPowerMultiplier: 0,
  adjacentPumpPower: 0,
  fixedPipePower: null,
  isBomb: false,
  canPack: false,
  showsPipeFlow: false,
  showsDirectionalPipeAnimation: false,
  protectsMachines: false,
  blocksBombs: false,
  blocksDeployment: false,
  expandsGrid: false
});
for (const rule of Object.values(machineBehaviorRules)) {
  rule.rules = { ...MACHINE_RULE_DEFAULTS, ...rule.rules };
}
export const LEGACY_MACHINE_BEHAVIOR_RULES = Object.freeze(machineBehaviorRules);

function decodeMysqlString(value) {
  return value.replace(/\\(.)/gs, (_, character) => {
    const escapes = { n: '\n', r: '\r', t: '\t', 0: '\0' };
    return escapes[character] ?? character;
  });
}

export function parseValues(source) {
  const rows = [];
  let row = null;
  let token = '';
  let quote = false;
  let escaped = false;

  const pushValue = () => {
    const raw = token.trim();
    if (quote) throw new Error('Unterminated SQL string');
    if (raw.toUpperCase() === 'NULL') row.push(null);
    else if (raw.startsWith("'") && raw.endsWith("'")) row.push(decodeMysqlString(raw.slice(1, -1)));
    else if (raw !== '' && Number.isFinite(Number(raw))) row.push(Number(raw));
    else row.push(raw);
    token = '';
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (!row) {
      if (character === '(') row = [];
      continue;
    }
    token += character;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === "'") quote = !quote;
    if (!quote && character === ',') {
      token = token.slice(0, -1);
      pushValue();
    } else if (!quote && character === ')') {
      token = token.slice(0, -1);
      pushValue();
      rows.push(row);
      row = null;
    }
  }
  return rows;
}

function tableRows(sql, table) {
  const marker = `INSERT INTO \`${table}\``;
  const rows = [];
  let offset = 0;
  while (offset < sql.length) {
    const start = sql.indexOf(marker, offset);
    if (start === -1) break;
    const values = sql.indexOf(' VALUES', start);
    const end = sql.indexOf(';\n', values);
    if (values === -1 || end === -1) throw new Error(`Could not parse ${table} data`);
    rows.push(...parseValues(sql.slice(values + 7, end)));
    offset = end + 2;
  }
  return rows;
}

function genericIconFor(item) {
  const names = [`M${item.mineTypeId}L${item.rarity}.png`, `M${item.mineTypeId}L${item.rarity}.gif`, 'grey.png'];
  const name = names.find((candidate) => fs.existsSync(path.join(ICON_ROOT, candidate))) ?? 'grey.png';
  return `/legacy/img/icons/${name}`;
}

function specificIconFor(item, sources) {
  const avatar = sources.avatarByItemId.get(item.id);
  if (avatar && fs.existsSync(path.join(IMAGE_ROOT, 'avatars', 'src', avatar.filename))) {
    return { icon: `/legacy/img/avatars/src/${encodeURIComponent(avatar.filename)}`, iconSource: 'avatar' };
  }
  const machine = sources.machineByItemId.get(item.id);
  const machineType = sources.machineTypeById.get(machine?.machineTypeId);
  const machineIcon = machineIconPath(machineType?.name, item.rarity);
  if (machineIcon) return { icon: machineIcon, iconSource: 'machine' };
  const equipment = sources.equipmentByItemId.get(item.id);
  if (equipment) {
    const filename = `${item.name.replace(' ', '')}.png`;
    if (fs.existsSync(path.join(IMAGE_ROOT, 'equipment', 'src', filename))) {
      return { icon: `/legacy/img/equipment/src/${encodeURIComponent(filename)}`, iconSource: 'equipment' };
    }
  }
  if (sources.explosiveByItemId.has(item.id)) {
    const filename = `explosive${item.rarity}.png`;
    if (fs.existsSync(path.join(IMAGE_ROOT, 'explosives', filename))) {
      return { icon: `/legacy/img/explosives/${filename}`, iconSource: 'explosive' };
    }
  }
  const robot = sources.robotByItemId.get(item.id);
  if (robot) {
    const filename = `MR${robot.model}.png`;
    if (fs.existsSync(path.join(IMAGE_ROOT, 'equipment', 'src', filename))) {
      return { icon: `/legacy/img/equipment/src/${filename}`, iconSource: 'robot' };
    }
  }
  const marketableIconId = sources.marketableIconById.get(item.marketableId);
  if (marketableIconId) {
    const filename = `I${marketableIconId}.png`;
    if (fs.existsSync(path.join(ICON_ROOT, filename))) {
      return { icon: `/legacy/img/icons/${filename}`, iconSource: 'marketable' };
    }
  }
  return { icon: genericIconFor(item), iconSource: 'mine-rarity' };
}

export function loadLegacyCatalog(sqlPath = DEFAULT_SQL) {
  const sql = fs.readFileSync(sqlPath, 'latin1');
  const marketableIconById = new Map(tableRows(sql, 'marketables')
    .filter((row) => row[2] !== null).map((row) => [Number(row[0]), Number(row[2])]));
  const approvedImages = new Map();
  for (const row of tableRows(sql, 'images')) {
    if (row[4]) approvedImages.set(Number(row[2]), String(row[3]));
  }
  const mineTypes = tableRows(sql, 'mine_types').map((row) => ({
    id: row[0], name: row[1], creditCost: row[3], rentCost: row[4],
    hasOre: Boolean(row[5]), refundable: Boolean(row[6]),
    icon: `/legacy/img/icons/M${row[0]}L6.png`
  }));
  mineTypes.push(
    { ...SHROOM_CATALOG.mineType },
    { ...WOOD_CATALOG.mineType },
    { ...WISDOM_CATALOG.mineType }
  );
  const cities = tableRows(sql, 'cities').map((row) => ({ id: row[0], name: row[1], hasMarket: Boolean(row[2]) }));
  const cityMineTypes = tableRows(sql, 'cities_mine_types').map((row) => ({
    id: row[0], cityId: row[1], mineTypeId: row[2]
  }));
  const routes = tableRows(sql, 'routes').map((row) => ({
    id: row[0], city1Id: row[1], city2Id: row[2], length: row[3], type: row[4], open: Boolean(row[5])
  }));
  const lands = tableRows(sql, 'lands').map((row) => ({
    id: row[0], vehicleId: row[1], attack: row[2], armor: row[3]
  }));
  const ships = tableRows(sql, 'ships').map((row) => ({
    id: row[0], vehicleId: row[1], cannonPortals: row[2], hull: row[3], crew: row[4]
  }));
  const aircrafts = tableRows(sql, 'aircrafts').map((row) => ({
    id: row[0], vehicleId: row[1], itemId: row[2], type: row[3]
  }));
  const landByVehicleId = new Map(lands.map((entry) => [entry.vehicleId, entry]));
  const shipByVehicleId = new Map(ships.map((entry) => [entry.vehicleId, entry]));
  const aircraftByVehicleId = new Map(aircrafts.map((entry) => [entry.vehicleId, entry]));
  const vehicles = tableRows(sql, 'vehicles').map((row) => ({
    id: row[0], itemId: row[1], speed: row[2], capacity: row[3],
    routeType: aircraftByVehicleId.has(row[0]) ? 2 : shipByVehicleId.has(row[0]) ? 1 : 0,
    land: landByVehicleId.get(row[0]) ?? null,
    ship: shipByVehicleId.get(row[0]) ?? null,
    aircraft: aircraftByVehicleId.get(row[0]) ?? null
  }));
  const weapons = tableRows(sql, 'weapons').map((row) => ({
    id: row[0], itemId: row[1], offense: row[2], defense: row[3]
  }));
  const mods = tableRows(sql, 'mods').map((row) => ({
    id: row[0], itemId: row[1], capacity: row[2], attack: row[3], armor: row[4],
    offense: row[5], defense: row[6], dodge: row[7]
  }));
  const cannons = tableRows(sql, 'cannons').map((row) => ({
    id: row[0], itemId: row[1], damage: row[2], rateOfFire: row[3]
  }));
  const cannonballs = tableRows(sql, 'cannonballs').map((row) => ({
    id: row[0], itemId: row[1], type: row[2]
  }));
  const bombs = tableRows(sql, 'bombs').map((row) => ({
    id: row[0], itemId: row[1], buckets: row[2], description: row[3]
  }));
  const boxes = tableRows(sql, 'boxes').map((row) => ({
    id: row[0], itemId: row[1], type: row[2]
  }));
  const containers = tableRows(sql, 'containers').map((row) => ({
    id: row[0], marketableId: row[1], name: row[2], credits: row[3], capacity: row[4]
  }));
  const tiers = tableRows(sql, 'tiers').map((row) => ({
    id: row[0], routeType: row[1], combatClass: row[2], rank: row[3], percentile: row[4],
    minRating: row[5], maxRating: row[6], migrationMin: row[7], migrationMax: row[8]
  }));
  const equipment = tableRows(sql, 'equipment').map((row) => ({
    id: row[0], itemId: row[1], typeId: row[2], bucketsPerHour: row[3], rarity: row[4]
  }));
  const explosives = tableRows(sql, 'explosives').map((row) => ({
    id: row[0], itemId: row[1], buckets: row[2]
  }));
  const robots = tableRows(sql, 'robots').map((row) => ({
    id: row[0], itemId: row[1], model: row[2]
  }));
  const meldRequirements = tableRows(sql, 'items_melds').map((row) => ({
    id: row[0], meldId: row[1], itemId: row[2], count: row[3]
  }));
  meldRequirements.push(...SHROOM_CATALOG.meldRequirements.map((entry) => ({ ...entry })));
  meldRequirements.push(...WOOD_CATALOG.meldRequirements.map((entry) => ({ ...entry })));
  meldRequirements.push(...WISDOM_CATALOG.meldRequirements.map((entry) => ({ ...entry })));
  const requirementsByMeld = new Map();
  for (const requirement of meldRequirements) {
    if (!requirementsByMeld.has(requirement.meldId)) requirementsByMeld.set(requirement.meldId, []);
    requirementsByMeld.get(requirement.meldId).push(requirement);
  }
  const melds = tableRows(sql, 'melds').map((row) => {
    const requirements = requirementsByMeld.get(row[0]);
    if (!requirements?.length) throw new Error(`Missing bootstrap requirements for meld ${row[0]}.`);
    return {
      id: row[0], name: row[1], mineTypeId: row[2], modified: row[3], rarity: row[4],
      public: Boolean(row[5]), requirements
    };
  });
  for (const meld of SHROOM_CATALOG.melds) {
    melds.push({
      ...meld,
      mineTypeId: SHROOM_CATALOG.mineType.id,
      modified: '2026-08-27 00:00:00',
      public: true,
      requirements: meldRequirements.filter((entry) => entry.meldId === meld.id)
    });
  }
  for (const meld of WOOD_CATALOG.melds) {
    melds.push({
      ...meld,
      mineTypeId: WOOD_CATALOG.mineType.id,
      modified: '2026-08-27 00:00:00',
      public: true,
      requirements: meldRequirements.filter((entry) => entry.meldId === meld.id)
    });
  }
  for (const meld of WISDOM_CATALOG.melds) {
    melds.push({
      ...meld,
      mineTypeId: WISDOM_CATALOG.mineType.id,
      modified: '2026-08-27 00:00:00',
      public: true,
      requirements: meldRequirements.filter((entry) => entry.meldId === meld.id)
    });
  }
  const gadgets = tableRows(sql, 'gadgets').map((row) => ({
    id: row[0], name: row[1], behaviorKey: row[1],
    displayName: row[2], description: row[3], hasPage: Boolean(row[4])
  }));
  const gadgetItems = tableRows(sql, 'gadgets_items').map((row) => ({
    id: row[0], gadgetId: row[1], itemId: row[2]
  }));
  const factoryActions = tableRows(sql, 'factory_actions').map((row) => ({
    id: row[0], name: row[1], ore: row[2], components: row[3],
    ...FACTORY_ACTION_RULES[row[0]]
  }));
  const machineTypes = tableRows(sql, 'machine_types').map((row) => {
    const presentation = LEGACY_MACHINE_TYPE_RULES[row[1]];
    const behavior = LEGACY_MACHINE_BEHAVIOR_RULES[row[1]];
    if (!presentation || !behavior) {
      throw new Error(`Missing bootstrap machine metadata for ${row[1]}.`);
    }
    return {
      id: row[0], name: row[1], description: presentation.description,
      displayPowerMultiplier: presentation.displayPowerMultiplier,
      behaviorKey: behavior.behaviorKey, rules: behavior.rules
    };
  });
  const machines = tableRows(sql, 'machines').map((row) => ({
    id: row[0], itemId: row[1], machineTypeId: row[2]
  }));
  const avatarElementTypes = tableRows(sql, 'avatar_elements').map((row) => ({ id: row[0], name: row[1] }));
  const avatarElements = tableRows(sql, 'items_avatar_elements').map((row) => ({
    id: row[0], itemId: row[1], typeId: row[2], filename: row[3], gender: row[4]
  }));
  const stones = tableRows(sql, 'stones').map((row) => ({
    id: row[0], name: row[1], behaviorKey: row[1],
    description: row[2], rank: row[3], rarity: Math.floor((row[3] - 1) / 7) + 1
  }));
  const sources = {
    marketableIconById,
    equipmentByItemId: new Map(equipment.map((entry) => [entry.itemId, entry])),
    explosiveByItemId: new Map(explosives.map((entry) => [entry.itemId, entry])),
    robotByItemId: new Map(robots.map((entry) => [entry.itemId, entry])),
    machineByItemId: new Map(machines.map((entry) => [entry.itemId, entry])),
    machineTypeById: new Map(machineTypes.map((entry) => [entry.id, entry])),
    avatarByItemId: new Map(avatarElements.map((entry) => [entry.itemId, entry]))
  };
  const items = tableRows(sql, 'items').map((row) => ({
    id: row[0], name: row[1], rarity: row[2], description: row[3], marketableId: row[4],
    mineTypeId: row[5], repairedItemId: row[11], canFind: Boolean(row[12])
  })).map((item) => {
    const { icon, iconSource } = specificIconFor(item, sources);
    const largeImageFilename = approvedImages.get(item.id) ?? null;
    const hasLargeImage = Boolean(largeImageFilename
      && fs.existsSync(path.join(IMAGE_ROOT, largeImageFilename)));
    return {
      ...item, icon, iconSource, damaged: item.repairedItemId !== null, largeImageFilename,
      largeImage: hasLargeImage ? `/legacy/img/${largeImageFilename}` : icon,
      hasLargeImage
    };
  });
  items.push(...SHROOM_CATALOG.items.map((item) => {
    const icon = item.icon;
    return {
      ...item,
      mineTypeId: SHROOM_CATALOG.mineType.id,
      repairedItemId: null,
      canFind: true,
      icon,
      iconSource: 'shroom-svg',
      damaged: false,
      largeImageFilename: null,
      largeImage: icon,
      hasLargeImage: true,
      goldValue: item.goldValueUnits / 10000
    };
  }));
  items.push(...WOOD_CATALOG.items.map((item) => {
    const icon = item.icon;
    return {
      ...item,
      mineTypeId: WOOD_CATALOG.mineType.id,
      repairedItemId: null,
      canFind: true,
      icon,
      iconSource: 'wood-svg',
      damaged: false,
      largeImageFilename: null,
      largeImage: icon,
      hasLargeImage: true,
      goldValue: item.goldValueUnits / 10000
    };
  }));
  items.push(...WISDOM_CATALOG.items.map((item) => {
    const icon = item.icon;
    return {
      ...item,
      mineTypeId: WISDOM_CATALOG.mineType.id,
      repairedItemId: null,
      canFind: true,
      icon,
      iconSource: 'wisdom-svg',
      damaged: false,
      largeImageFilename: null,
      largeImage: icon,
      hasLargeImage: true,
      goldValue: item.goldValueUnits / 10000
    };
  }));
  const dwarfDescription = (tier) => {
    const range = dwarfFindRange(tier.rarity, LEGACY_DWARF_TIERS);
    const quality = range.minimum === range.maximum
      ? RARITY_NAMES[range.maximum]
      : `${RARITY_NAMES[range.maximum]} through ${RARITY_NAMES[range.minimum]}`;
    return `Far better than any mining robot, ${tier.name}s have mining in their blood. `
      + `A Dwarf stored in a city finds ${quality} things from that city's mines after a random delay of 0–7 minutes. `
      + `After each find this ${tier.name} has a 5% chance to disappear. `
      + 'Dwarves may also stow away on compatible vehicles and ships.';
  };
  const dwarfByRarity = new Map(LEGACY_DWARF_TIERS.map((tier) => [tier.rarity, tier]));
  const existingDwarfIds = new Set(LEGACY_DWARF_TIERS.map((tier) => tier.itemId));
  for (const item of items) {
    if (!existingDwarfIds.has(item.id)) continue;
    const tier = dwarfByRarity.get(item.rarity);
    item.icon = `/legacy/img/icons/M23L${tier.rarity}.png`;
    item.iconSource = 'dwarf';
    item.largeImageFilename = null;
    item.largeImage = `/node/dwarf-images/dwarf-${tier.rarity}.png`;
    item.hasLargeImage = true;
  }
  const loadedIds = new Set(items.map((item) => item.id));
  for (const tier of LEGACY_DWARF_TIERS) {
    if (loadedIds.has(tier.itemId)) continue;
    items.push({
      id: tier.itemId,
      name: tier.name,
      rarity: tier.rarity,
      description: dwarfDescription(tier),
      marketableId: null,
      mineTypeId: 23,
      repairedItemId: null,
      canFind: true,
      icon: `/legacy/img/icons/M23L${tier.rarity}.png`,
      iconSource: 'dwarf',
      damaged: false,
      largeImageFilename: null,
      largeImage: `/node/dwarf-images/dwarf-${tier.rarity}.png`,
      hasLargeImage: true
    });
  }
  const itemsById = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (item.repairedItemId === null) continue;
    const repaired = itemsById.get(item.repairedItemId);
    if (!repaired) continue;
    item.icon = repaired.icon;
    item.iconSource = `damaged-${repaired.iconSource}`;
    item.largeImageFilename = repaired.largeImageFilename;
    item.largeImage = repaired.largeImage;
    item.hasLargeImage = repaired.hasLargeImage;
  }
  const rarities = RARITY_NAMES.map((name, id) => ({
    id, name: name || 'Unranked', equipmentAdjective: EQUIPMENT_RARITY_ADJECTIVES[id] ?? 'No',
    saleValue: SALE_VALUES[id] ?? 0, maxExplosives: MAX_EXPLOSIVES_PER_DETONATION[id] ?? 0
  }));
  const equipmentTypes = EQUIPMENT_TYPE_NAMES.map((name, id) => ({ id, name })).filter((entry) => entry.id > 0);
  const settings = {
    ...LEGACY_COMBAT_SEASON_SETTINGS,
    find_interval_ms: 6 * 60 * 60 * 1000,
    max_offline_finds: 20,
    buckets_per_thing: 180,
    base_buckets_per_hour: 30,
    rarity_roll_base: 7,
    rarity_roll_attempts: 100,
    standard_find_min_rarity: 1,
    damaged_find_min_rarity: 3,
    robot_damaged_chance_per_model: 0.001,
    discovery_history_limit: 100,
    starter_mine_type_id: 1,
    starter_city_id: 1,
    starter_credits: 100,
    starter_gold: 5,
    starter_item_limit: 5000,
    starter_battery_duration_ms: 20 * 60 * 60 * 1000,
    starter_find_count: 5,
    active_mine_limit: 3,
    control_active_mine_limit: 4,
    stone_buckets_per_hour: 0.5,
    mine_oil_buckets_per_hour: 10,
    inactive_mine_buckets_per_hour: 25,
    hammer_equipment_multiplier: 1.25,
    mine_oil_duration_ms: 5 * 24 * 60 * 60 * 1000,
    mine_rental_duration_ms: 14 * 24 * 60 * 60 * 1000,
    mine_credit_refund_ratio: 0.75,
    mine_gold_per_bucket: 0.034,
    battery_base_recharge_ms: 20 * 60 * 60 * 1000,
    battery_meld_bonus_ms: 60 * 60 * 1000,
    battery_extension_cost_credits: 9,
    battery_extension_ms: 10 * 24 * 60 * 60 * 1000,
    cracked_gadget_duration_ms: 180 * 24 * 60 * 60 * 1000,
    warehouse_capacity_bonus: 125,
    avatar_background_type_id: 2,
    avatar_capacity_base_bonus: 20,
    avatar_capacity_per_rarity: 5,
    avatar_required_type_ids: [1, 2, 3],
    avatar_any_gender_id: 2,
    worker_melds_per_cph: 10,
    worker_oil_cph_bonus: 1,
    robot_melds_per_model: 10,
    worker_contract_duration_ms: 7 * 24 * 60 * 60 * 1000,
    factory_max_workers: 7,
    factory_queue_limit: 10,
    factory_worker_bot_contract_duration_ms: 7 * 24 * 60 * 60 * 1000,
    factory_worker_bot_tiers: [
      { id: 1, name: 'Worker Bot Mk I', cph: 25, costGold: 10000 },
      { id: 2, name: 'Worker Bot Mk II', cph: 100, costGold: 100000 },
      { id: 3, name: 'Worker Bot Mk III', cph: 400, costGold: 1000000 }
    ],
    recycling_scraps_by_rarity: { 0: 1, 1: 1, 2: 10, 3: 100, 4: 1000, 5: 5000, 6: 10000 },
    recycling_scraps_per_ore: 1000,
    gold_find_base_maximum: 5,
    gold_find_bonus_roll_sides: 7,
    gold_find_bonus_roll_hit: 1,
    gold_find_bonus_rounds: 3,
    gold_find_bonus_multiplier: 5,
    ore_mine_type_id: 16,
    oil_item_id: 1294,
    foreign_market_price_multiplier: 1.4,
    sharpener_offense_bonus: 0.1,
    shield_defense_bonus: 0.1,
    vehicle_oil_speed_bonus: 5,
    turbo_speed_bonus: 5,
    turbo_aircraft_speed_multiplier: 1.1,
    aircraft_event_min_fraction: 0.25,
    aircraft_event_fraction_span: 0.5,
    aircraft_shot_down_event_offset_ms: 10000,
    minimum_travel_duration_ms: 60 * 1000,
    aircraft_mission_round_trip_multiplier: 2,
    aircraft_mission_event_fraction: 0.5,
    aircraft_bombing_offense_multiplier: 1.4,
    aircraft_melds_per_slot: 10,
    travel_inventory_overage_limit: 100,
    default_travel_order: 'peaceful',
    travel_order_names: { peaceful: 'Peaceful', pillage: 'Pillage', patrol: 'Patrol' },
    ship_meld_hull_bonus: 0.002,
    ship_meld_min_rarity: 2,
    land_meld_armor_bonus: 0.5,
    post_battle_hull_restore_ratio: 0.8,
    post_battle_crew_restore_ratio: 0.8,
    post_battle_sail_restore_ratio: 0.8,
    ship_port_hull_repair_interval_ms: 60 * 60 * 1000,
    vehicle_combat_duration_min_ms: 25 * 60 * 1000,
    vehicle_combat_duration_max_ms: 30 * 60 * 1000,
    vehicle_disarmed_combat_duration_min_ms: 3 * 60 * 1000,
    vehicle_disarmed_combat_duration_max_ms: 7 * 60 * 1000,
    vehicle_combat_port_safe_zone_max_distance: 5,
    sinking_news_minimum_rarity: 5,
    fishing_spacing_base_distance: 20,
    fishing_spacing_growth_roll_sides: 5,
    fishing_spacing_growth_roll_hit: 4,
    fishing_spacing_growth_multiplier: 2.5,
    fishing_spacing_growth_rounds: 4,
    pillage_max_oil_trips: 5,
    pillage_max_stealable_rarity: 5,
    home_move_cooldown_ms: 7 * 24 * 60 * 60 * 1000,
    day_ms: 24 * 60 * 60 * 1000,
    specialisation_titles: LEGACY_SPECIALISATION_TITLES,
    ...LEGACY_WORLD_EVENT_SETTINGS,
    dwarf_find_min_delay_ms: 1,
    dwarf_find_max_delay_ms: 7 * 60 * 1000,
    dwarf_competition_duration_ms: 20 * 60 * 60 * 1000,
    oil_field_city_id: 2,
    oil_units_per_liter: 180,
    oil_units_per_barrel: 28620,
    oil_spill_units: 360000,
    oil_epsilon_units: 0.1,
    oil_field_max_radius: 12,
    oil_build_tier_ids: { unavailable: 0, local: 1, helicopter: 2 },
    oil_helicopter_build_ring_width: 1,
    oil_network_iterations: 100,
    oil_network_source_units: 10000000,
    hex_directions: [[0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1]],
    oil_pipe_base_lph: 10,
    oil_pipe_melds_per_bonus_lph: 10,
    oil_flow_rate_divisor: 20,
    oil_crane_interval_seconds: 300,
    oil_spill_interval_ms: 5 * 60 * 1000,
    oil_spill_chance_denominator: 23000,
    oil_spill_minimum_multiplier: 3,
    oil_spill_random_multiplier: 3,
    oil_bomb_damage_minimum_multiplier: 0.5,
    oil_bomb_damage_random_span: 1,
    ore_item_id: 368,
    bolt_item_id: 2,
    block_and_tackle_item_id: 1107,
    search_plane_item_id: 737,
    bomber_item_id: 738,
    helicopter_item_id: 739,
    combat_class_by_rarity: [0, 1, 2, 2, 4, 4, 4],
    arms_rarities_by_vehicle_rarity: [
      [0], [0, 1], [0, 1, 2, 3], [0, 1, 2, 3],
      [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]
    ],
    cargo_rarities_by_vehicle_rarity: [
      [0], [1], [2, 3], [2, 3], [0, 4, 5, 6], [0, 4, 5, 6], [0, 4, 5, 6]
    ],
    oil_cargo_vehicle_rarities: [2, 3],
    fishing_mine_type_ids: [14, 15],
    fishing_cargo_extra_rarities: [1],
    bait_mine_type_id: 14,
    fish_mine_type_id: 15,
    fishing_salvage_distance: 1,
    default_specialisation_id: 0,
    minimum_permanent_mines: 1,
    mod_bolt_free_rarity: 1,
    mod_bolts_per_rarity: 1,
    sunken_cargo_route_fraction: 0.5,
    transaction_history_month_limit: 12,
    factory_market_names: { sale: 'Factory', rental: 'Factory Rental' },
    factory_market_icon: '/legacy/img/icons/I2.png',
    public_stats_labels: {
      sections: {
        activeMiners: 'Active Miners', activeMines: 'Active Mines', gold: 'Gold', oil: 'Oil',
        specialisations: 'Specialisations', routes: 'Routes', gadgets: 'Gadgets', cities: 'Cities'
      },
      rows: {
        activePopulation: 'Active population', newMiners: 'New miners in reporting window',
        averageMelds: 'Average meld count', inventoryThings: 'Total things in city inventories',
        thingsPerCapita: 'Things per capita', mineTotal: 'Total', oiledBots: 'Oiled bots',
        activeGold: 'Total active gold', goldPerCapita: 'Gold per capita',
        extractedOil: 'Extracted in configured day', deployedMachines: 'Machines deployed',
        oiledWorkers: 'Oiled workers', battles: 'Battles in reporting window',
        gadgetUsers: 'Gadget users', activeGadgets: 'Active gadgets',
        cityPopulation: 'population', cityManufacturers: 'manufacturers', cityWorkers: 'workers'
      },
      mineModes: { thingsPrefix: 'Mining ', ore: 'Mining Ore', gold: 'Mining Gold' }
    },
    calculator_report_labels: {
      sections: { findings: 'Findings', things: 'Things', minesVehicles: 'Mines and vehicles' },
      rows: {
        recordedFindings: 'Recorded thing findings', itemsDiscovered: 'Items discovered',
        explosiveFindings: 'Findings from explosives', totalThings: 'Total things owned',
        melds: 'Melds owned', mines: 'Mines owned', currentGold: 'Current gold', credits: 'Credits'
      },
      suffixes: { rarityOwned: ' things owned', vehicleActive: ' active' }
    },
    ledger_report_labels: {
      actions: { sale: 'Sold', purchase: 'Bought' }
    },
    item_type_labels: {
      landVehicle: 'Land vehicle', ship: 'Ship', aircraft: 'Aircraft',
      weapon: 'Weapon', vehicleModification: 'Vehicle modification', cannon: 'Cannon',
      ammunitionCrate: 'Ammunition crate', aircraftBomb: 'Aircraft bomb',
      ammunitionBox: 'Ammunition box', miningEquipment: 'Mining equipment',
      explosive: 'Explosive', minerRobot: 'Miner robot', dwarfMiner: 'Dwarf miner',
      gadget: 'Gadget', oilFieldBomb: 'Oil Field bomb',
      oilFieldMachine: 'Oil Field machine', avatarElement: 'Avatar element',
      collectible: 'Collectible'
    },
    location_labels: { atSea: 'At sea' },
    land_combat_minimum_attack: 0.5,
    land_combat_max_rounds: 10000,
    ship_cannon_rounds: 3,
    ship_critical_damage_multiplier: 2,
    ship_unarmed_crew_strength: 1,
    ship_cannon_rounds_by_rate: { 1: [2], 2: [1, 3], 3: [1, 2, 3] },
    ship_chain_escape_speed_ratio: 1.15,
    ship_boarding_strength_ratio: 1.5,
    ship_boarding_max_rounds: 10000,
    explosive_power_variation: 0.25,
    shots_per_crate: 12,
    trips_per_oil: { 0: 10, 1: 80, 2: 30, 3: 30, 4: 10, 5: 10, 6: 10 },
    ammo_box_crates: 8,
    ammunition_rules: {
      1: { field: 'massives', storageField: 'massives', accuracy: 0.6, damageField: 'hull' },
      2: { field: 'chainShots', storageField: 'chain_shots', accuracy: 0.3, damageField: 'speed' },
      3: {
        field: 'grapeShots', storageField: 'grape_shots', accuracy: 0.4,
        damageField: 'crew', awardsCrewKill: true
      }
    },
    rating_expected_value_table: [[0, 0.5], [25, 0.53], [50, 0.57], [100, 0.64], [150, 0.70],
      [200, 0.76], [250, 0.81], [300, 0.85], [350, 0.89], [400, 0.92], [450, 0.94],
      [500, 0.96], [735, 0.99], [1000, 1]],
    rating_k_factor: 10,
    vehicle_starting_rating: 1600,
    finding_source_names: {
      mine: 'Mine', 'new-mine': 'New mine', explosives: 'Explosives', dwarf: 'Dwarf',
      'dwarf-capture': 'Dwarf capture', fishing: 'Fishing', salvage: 'Salvage'
    },
    rarity_color_names: ['Grey', 'Yellow', 'Green', 'Blue', 'Red', 'Purple', 'Orange'],
    rarity_color_hexes: ['#777', '#d8be32', '#698b18', '#799c9c', '#e32121', '#a64891', '#f79721'],
    profile_function_mine_type_ids: {
      Melds: [1, 8, 4, 6, 9, 15, 14],
      Routes: [5, 24, 7, 12, 13, 19],
      Boosts: [4, 10, 11, 16, 17, 21, 25]
    },
    profile_hidden_mine_type_ids: [18, 22],
    item_value_excluded_mine_type_ids: [18],
    item_value_rules: LEGACY_ITEM_VALUE_RULES,
    chat_message_max_length: 500,
    chat_rate_window_ms: 30000,
    chat_rate_max_messages: 20,
    chat_color_thresholds: [
      { minimumMelds: 140, color: 'ff033e' },
      { minimumMelds: 120, color: 'be6a02' },
      { minimumMelds: 100, color: '73375c' },
      { minimumMelds: 80, color: '731212' },
      { minimumMelds: 60, color: '486690' },
      { minimumMelds: 40, color: '397126' },
      { minimumMelds: 20, color: '6c6c00' },
      { minimumMelds: 0, color: '55666b' }
    ],
    chat_page_size: 50,
    chat_query_max_limit: 100,
    chat_history_window_ms: 24 * 60 * 60 * 1000,
    achievement_high_rarity_minimum: 4,
    achievement_demolished_find_count: 100,
    achievement_basic_vehicle_rarity: 1,
    dwarf_exploitation_rarity: 4,
    dwarf_excluded_mine_type_ids: [18],
    miner_name_min_length: 3,
    miner_name_max_length: 24,
    password_min_length: 8,
    profile_description_max_length: 1000,
    email_max_length: 254,
    gold_transfer_note_max_length: 200,
    private_message_max_length: 2000,
    vehicle_name_max_length: 20,
    session_max_age_seconds: 7 * 24 * 60 * 60,
    home_recent_discovery_limit: 8,
    home_next_stone_limit: 6,
    meld_search_result_limit: 100,
    item_search_result_limit: 100,
    profile_inventory_page_size: 50,
    message_preview_length: 120,
    dwarf_findings_feed_limit: 20,
    dwarf_findings_poll_interval_ms: 5000,
    gadget_report_result_limit: 10,
    factory_market_history_limit: 15,
    item_market_history_limit: 15,
    mine_market_history_limit: 15,
    oil_event_history_limit: 30,
    vehicle_event_history_limit: 30,
    miner_search_result_limit: 100,
    message_list_limit: 100,
    conversation_message_limit: 200,
    message_retention_ms: 28 * 24 * 60 * 60 * 1000,
    stats_new_player_window_ms: 30 * 24 * 60 * 60 * 1000,
    stats_battle_window_ms: 24 * 60 * 60 * 1000,
    rank_badge_vehicle_count_step: 5,
    rank_badge_vehicle_count_maximum: 25,
    gadget_primary_bonuses: { hammer: '+25% equipment output', warehouse: '+125 inventory spaces', sharpener: '+10% offense', shield: '+10% defense', turbo: '+5 km/h vehicle speed' },
    oil_direction_names: ['N', 'NE', 'SE', 'S', 'SW', 'NW'],
    map_route_types: [{ name: 'land', label: 'Land' }, { name: 'sea', label: 'Sea' }, { name: 'air', label: 'Air' }],
    route_type_ids: { land: 0, sea: 1, air: 2 },
    aircraft_role_ids: { search: 0, bomber: 1, helicopter: 2 },
    map_city_positions: { 1: { x: 161, y: 275 }, 2: { x: 269, y: 85 }, 3: { x: 483, y: 287 }, 4: { x: 738, y: 88 }, 5: { x: 732, y: 530 } },
    gadget_lifespan_days: [0, 0.5, 3.5, 20, 120, 480],
    machine_life_days: [0, 0.5, 3, 6, 9, 12, 15],
    machine_power: [0, 1, 1, 2, 2, 3, 3]
  };
  const labels = {
    route_type: ['Land routes', 'Sea routes', 'Air routes'],
    aircraft_role: ['Search Plane', 'Bomber', 'Helicopter'],
    ammunition_type: ['', 'Cannonball', 'Chain Shot', 'Grape Shot'],
    avatar_gender: ['Male', 'Female', 'Any gender'],
    vehicle_type: ['Land vehicles', 'Ships', 'Aircraft']
  };

  return indexCatalog({
    mineTypes, cities, cityMineTypes, items, routes, vehicles, lands, ships, aircrafts, weapons, mods, cannons,
    cannonballs, bombs, boxes, containers, tiers, equipment, explosives, robots,
    melds, meldRequirements, gadgets, gadgetItems, factoryActions, machineTypes, machines,
    avatarElementTypes, avatarElements, stones, rarities, equipmentTypes,
    botParts: BOT_PARTS, specialisations: LEGACY_SPECIALISATIONS, dwarfTiers: LEGACY_DWARF_TIERS,
    settings, labels
  });
}

export function indexCatalog({
  maps = [], mineTypes, cities, cityMineTypes = [], items, routes = [], vehicles = [], lands = [], ships = [], aircrafts = [],
  weapons = [], mods = [], cannons = [], cannonballs = [], bombs = [], boxes = [], containers = [], tiers = [],
  equipment = [], explosives = [], robots = [],
  melds = [], meldRequirements = [], gadgets = [], gadgetItems = [], factoryActions = [],
  machineTypes = [], machines = [], avatarElementTypes = [], avatarElements = [], stones = [],
  rarities = [], equipmentTypes = [], botParts = [], specialisations = [], dwarfTiers = [],
  settings = {}, labels = {},
  validateReferences = true,
  useStoredGoldValues = false
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const discoverableItems = items.filter((item) => item.canFind && item.repairedItemId === null);
  const damagedItems = items.filter((item) => item.canFind && item.repairedItemId !== null);
  const byMineType = new Map();
  for (const item of discoverableItems) {
    if (!byMineType.has(item.mineTypeId)) byMineType.set(item.mineTypeId, new Map());
    const rarities = byMineType.get(item.mineTypeId);
    if (!rarities.has(item.rarity)) rarities.set(item.rarity, []);
    rarities.get(item.rarity).push(item);
  }
  const damagedByMineType = new Map();
  for (const item of damagedItems) {
    if (!damagedByMineType.has(item.mineTypeId)) damagedByMineType.set(item.mineTypeId, new Map());
    const rarities = damagedByMineType.get(item.mineTypeId);
    if (!rarities.has(item.rarity)) rarities.set(item.rarity, []);
    rarities.get(item.rarity).push(item);
  }
  const vehicleByItemId = new Map(vehicles.map((vehicle) => [vehicle.itemId, vehicle]));
  const weaponByItemId = new Map(weapons.map((entry) => [entry.itemId, entry]));
  const modByItemId = new Map(mods.map((entry) => [entry.itemId, entry]));
  const cannonByItemId = new Map(cannons.map((entry) => [entry.itemId, entry]));
  const cannonballByItemId = new Map(cannonballs.map((entry) => [entry.itemId, entry]));
  const cannonballByType = new Map(cannonballs.map((entry) => [entry.type, entry]));
  const bombByItemId = new Map(bombs.map((entry) => [entry.itemId, entry]));
  const boxByItemId = new Map(boxes.map((entry) => [entry.itemId, entry]));
  const boxByType = new Map(boxes.map((entry) => [entry.type, entry]));
  const equipmentByItemId = new Map(equipment.map((entry) => [entry.itemId, entry]));
  const explosiveByItemId = new Map(explosives.map((entry) => [entry.itemId, entry]));
  const robotByItemId = new Map(robots.map((entry) => [entry.itemId, entry]));
  const meldById = new Map(melds.map((entry) => [entry.id, entry]));
  const gadgetById = new Map(gadgets.map((entry) => [entry.id, entry]));
  const gadgetByName = new Map(gadgets.map((entry) => [entry.name, entry]));
  const gadgetByBehaviorKey = new Map(gadgets.map((entry) => [entry.behaviorKey, entry]));
  const gadgetItemByItemId = new Map(gadgetItems.map((entry) => {
    const gadget = gadgetById.get(entry.gadgetId);
    if (!gadget) throw new Error(`Missing catalog gadget ${entry.gadgetId} for item ${entry.itemId}.`);
    if (!byId.has(entry.itemId)) throw new Error(`Missing catalog item ${entry.itemId} for gadget ${entry.gadgetId}.`);
    return [entry.itemId, { ...entry, gadget }];
  }));
  const factoryActionById = new Map(factoryActions.map((entry) => [entry.id, entry]));
  const factoryOutputItemIds = new Set([
    ...factoryActions.filter((entry) => entry.actionKind === 'item' && entry.outputItemId)
      .map((entry) => Number(entry.outputItemId)),
    ...robots.map((entry) => Number(entry.itemId)),
    ...items.filter((entry) => entry.repairedItemId !== null)
      .map((entry) => Number(entry.repairedItemId))
  ]);
  const machineTypeById = new Map(machineTypes.map((entry) => [entry.id, entry]));
  const machinesWithTypes = machines.map((entry) => {
    const machineType = machineTypeById.get(entry.machineTypeId);
    if (!machineType) {
      throw new Error(`Missing catalog machine type ${entry.machineTypeId} for machine ${entry.id}.`);
    }
    if (!byId.has(entry.itemId)) {
      throw new Error(`Missing catalog item ${entry.itemId} for machine ${entry.id}.`);
    }
    return {
      ...entry,
      type: machineType.behaviorKey,
      typeName: machineType.name,
      rules: machineType.rules
    };
  });
  const machineById = new Map(machinesWithTypes.map((entry) => [entry.id, entry]));
  const machineByItemId = new Map(machinesWithTypes.map((entry) => [entry.itemId, entry]));
  const avatarElementTypeById = new Map(avatarElementTypes.map((entry) => [entry.id, entry]));
  const avatarElementByItemId = new Map(avatarElements.map((entry) => [entry.itemId, entry]));
  const rarityById = new Map(rarities.map((entry) => [entry.id, entry]));
  const equipmentTypeById = new Map(equipmentTypes.map((entry) => [entry.id, entry]));
  const botPartById = new Map(botParts.map((entry) => [entry.id, entry]));
  const specialisationById = new Map(specialisations.map((entry) => [entry.id, entry]));
  const dwarfByItemId = new Map(dwarfTiers.map((entry) => [entry.itemId, entry]));
  const dwarfByRarity = new Map(dwarfTiers.map((entry) => [entry.rarity, entry]));
  const stoneByBehaviorKey = new Map(stones.map((entry) => [entry.behaviorKey, entry]));
  const rarityNames = [];
  const equipmentTypeNames = [];
  const equipmentRarityAdjectives = [];
  for (const rarity of rarities) {
    rarityNames[rarity.id] = rarity.name;
    equipmentRarityAdjectives[rarity.id] = rarity.equipmentAdjective;
  }
  for (const type of equipmentTypes) equipmentTypeNames[type.id] = type.name;
  if (rarities.length) {
    for (const item of items) {
      if (!rarityById.has(item.rarity)) {
        throw new Error(`Missing catalog rarity ${item.rarity} for item ${item.id}.`);
      }
      item.rarityName = rarityNames[item.rarity];
    }
    for (const stone of stones) {
      if (!rarityById.has(stone.rarity)) {
        throw new Error(`Missing catalog rarity ${stone.rarity} for stone ${stone.id}.`);
      }
    }
  }
  for (const item of items) {
    if (item.repairedItemId !== null && !byId.has(item.repairedItemId)) {
      throw new Error(`Missing repaired catalog item ${item.repairedItemId} for item ${item.id}.`);
    }
  }
  const mineTypeById = new Map(mineTypes.map((entry) => [entry.id, entry]));
  const mineTypesByCity = new Map(cities.map((city) => [city.id, []]));
  for (const availability of cityMineTypes) {
    const mineType = mineTypeById.get(availability.mineTypeId);
    const cityMineTypes = mineTypesByCity.get(availability.cityId);
    if (!mineType) throw new Error(`Missing catalog mine type ${availability.mineTypeId}.`);
    if (!cityMineTypes) throw new Error(`Missing catalog city ${availability.cityId}.`);
    cityMineTypes.push(mineType);
  }
  for (const available of mineTypesByCity.values()) {
    available.sort((first, second) => first.name.localeCompare(second.name) || first.id - second.id);
  }
  if (validateReferences) {
  const requiredCollections = {
    mineTypes, cities, cityMineTypes, items, routes, vehicles, lands, ships, aircrafts,
    weapons, mods, cannons, cannonballs, bombs, boxes, containers, tiers, equipment,
    explosives, robots, melds, meldRequirements, gadgets, gadgetItems, factoryActions,
    machineTypes, machines, avatarElementTypes, avatarElements, stones, rarities,
    equipmentTypes, botParts, specialisations, dwarfTiers
  };
  for (const [key, collection] of Object.entries(requiredCollections)) {
    if (!Array.isArray(collection) || !collection.length) {
      throw new Error(`Missing catalog collection: ${key}.`);
    }
  }
  for (const [key, value] of Object.entries({ settings, labels })) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Missing catalog ${key}.`);
    }
  }
  const requireReference = (map, id, context) => {
    const value = map.get(Number(id));
    if (!value) throw new Error(`Missing catalog ${context}: ${id}.`);
    return value;
  };
  const requireItem = (id, context) => requireReference(byId, id, `item for ${context}`);
  const requireMineType = (id, context) =>
    requireReference(mineTypeById, id, `mine type for ${context}`);
  const requireCity = (id, context) =>
    requireReference(new Map(cities.map((entry) => [entry.id, entry])), id, `city for ${context}`);
  const routeTypeIds = settings.route_type_ids;
  const aircraftRoleIds = settings.aircraft_role_ids;
  if (!routeTypeIds || typeof routeTypeIds !== 'object' || Array.isArray(routeTypeIds)) {
    throw new Error('Missing catalog route-type behavior mappings.');
  }
  if (!aircraftRoleIds || typeof aircraftRoleIds !== 'object' || Array.isArray(aircraftRoleIds)) {
    throw new Error('Missing catalog aircraft-role behavior mappings.');
  }
  const routeTypeValues = new Set(Object.values(routeTypeIds).map(Number));
  const aircraftRoleValues = new Set(Object.values(aircraftRoleIds).map(Number));
  for (const key of ['land', 'sea', 'air']) {
    if (!Number.isSafeInteger(Number(routeTypeIds[key]))) {
      throw new Error(`Missing catalog route-type behavior mapping: ${key}.`);
    }
  }
  for (const key of ['search', 'bomber', 'helicopter']) {
    if (!Number.isSafeInteger(Number(aircraftRoleIds[key]))) {
      throw new Error(`Missing catalog aircraft-role behavior mapping: ${key}.`);
    }
  }
  for (const mineType of mineTypes) {
    if (typeof mineType.icon !== 'string' || !mineType.icon) {
      throw new Error(`Missing catalog mine icon: ${mineType.id}.`);
    }
  }
  for (const item of items) requireMineType(item.mineTypeId, `item ${item.id}`);
  for (const route of routes) {
    requireCity(route.city1Id, `route ${route.id}`);
    requireCity(route.city2Id, `route ${route.id}`);
    if (!routeTypeValues.has(Number(route.type))) {
      throw new Error(`Missing catalog route-type mapping for route ${route.id}.`);
    }
  }
  for (const vehicle of vehicles) {
    requireItem(vehicle.itemId, `vehicle ${vehicle.id}`);
    if (!routeTypeValues.has(Number(vehicle.routeType))) {
      throw new Error(`Missing catalog route-type mapping for vehicle ${vehicle.id}.`);
    }
  }
  const vehicleById = new Map(vehicles.map((entry) => [entry.id, entry]));
  for (const entry of lands) requireReference(vehicleById, entry.vehicleId, `vehicle for land subtype ${entry.id}`);
  for (const entry of ships) requireReference(vehicleById, entry.vehicleId, `vehicle for ship subtype ${entry.id}`);
  for (const entry of aircrafts) {
    requireReference(vehicleById, entry.vehicleId, `vehicle for aircraft subtype ${entry.id}`);
    if (!aircraftRoleValues.has(Number(entry.type))) {
      throw new Error(`Missing catalog aircraft-role mapping for aircraft ${entry.id}.`);
    }
  }
  for (const [kind, entries] of Object.entries({
    weapon: weapons, modification: mods, cannon: cannons, ammunition: cannonballs,
    bomb: bombs, box: boxes, equipment, explosive: explosives, robot: robots
  })) {
    for (const entry of entries) requireItem(entry.itemId, `${kind} ${entry.id}`);
  }
  for (const entry of equipment) {
    requireReference(equipmentTypeById, entry.typeId, `equipment type for equipment ${entry.id}`);
    requireReference(rarityById, entry.rarity, `rarity for equipment ${entry.id}`);
  }
  for (const meld of melds) {
    requireMineType(meld.mineTypeId, `meld ${meld.id}`);
    requireReference(rarityById, meld.rarity, `rarity for meld ${meld.id}`);
    if (!Array.isArray(meld.requirements) || !meld.requirements.length) {
      throw new Error(`Missing catalog requirements for meld ${meld.id}.`);
    }
  }
  for (const requirement of meldRequirements) {
    requireReference(meldById, requirement.meldId, `meld for requirement ${requirement.id}`);
    requireItem(requirement.itemId, `meld requirement ${requirement.id}`);
  }
  for (const action of factoryActions) {
    if (typeof action.actionKind !== 'string' || !action.actionKind) {
      throw new Error(`Missing catalog behavior for factory action ${action.id}.`);
    }
    if (action.actionKind === 'item'
      && (!Number.isSafeInteger(Number(action.outputQuantity)) || Number(action.outputQuantity) < 1)) {
      throw new Error(`Missing catalog output quantity for factory action ${action.id}.`);
    }
    if (action.outputItemId !== null && action.outputItemId !== undefined) {
      requireItem(action.outputItemId, `factory action ${action.id}`);
    }
    if (action.meldId !== null && action.meldId !== undefined) {
      requireReference(meldById, action.meldId, `meld for factory action ${action.id}`);
    }
    if (action.awardStoneBehaviorKey
      && !stoneByBehaviorKey.has(action.awardStoneBehaviorKey)) {
      throw new Error(`Missing catalog Stone for factory action ${action.id}.`);
    }
  }
  for (const element of avatarElements) {
    requireItem(element.itemId, `avatar element ${element.id}`);
    requireReference(avatarElementTypeById, element.typeId,
      `avatar element type for element ${element.id}`);
    if (typeof labels.avatar_gender?.[element.gender] !== 'string') {
      throw new Error(`Missing catalog avatar-gender label for element ${element.id}.`);
    }
  }
  for (const tier of dwarfTiers) {
    requireItem(tier.itemId, `Dwarf rarity ${tier.rarity}`);
    requireReference(rarityById, tier.rarity, `rarity for Dwarf ${tier.rarity}`);
  }
  for (const type of machineTypes) {
    if (typeof type.description !== 'string' || !type.description
      || !Number.isFinite(Number(type.displayPowerMultiplier))
      || typeof type.behaviorKey !== 'string' || !type.behaviorKey
      || !type.rules || typeof type.rules !== 'object' || Array.isArray(type.rules)) {
      throw new Error(`Missing catalog metadata for machine type ${type.id}.`);
    }
  }
  for (const part of botParts) {
    if (part.prerequisiteId !== null && part.prerequisiteId !== undefined) {
      requireReference(botPartById, part.prerequisiteId, `bot-part prerequisite for ${part.id}`);
    }
  }
  const bonusKeys = new Set(specialisations.flatMap((entry) => Object.keys(entry.bonuses ?? {})));
  if (!bonusKeys.size) throw new Error('Missing catalog specialisation bonus data.');
  for (const entry of specialisations) {
    for (const key of bonusKeys) {
      if (!entry.bonuses || !Object.hasOwn(entry.bonuses, key)
        || !Number.isFinite(Number(entry.bonuses[key]))) {
        throw new Error(`Missing catalog specialisation bonus ${key} for specialisation ${entry.id}.`);
      }
    }
  }
  const itemSettingKeys = [
    'oil_item_id', 'ore_item_id', 'bolt_item_id', 'block_and_tackle_item_id',
    'search_plane_item_id', 'bomber_item_id', 'helicopter_item_id'
  ];
  for (const key of itemSettingKeys) requireItem(settings[key], `setting ${key}`);
  const mineTypeSettingKeys = [
    'starter_mine_type_id', 'ore_mine_type_id', 'bait_mine_type_id', 'fish_mine_type_id'
  ];
  for (const key of mineTypeSettingKeys) requireMineType(settings[key], `setting ${key}`);
  requireCity(settings.starter_city_id, 'setting starter_city_id');
  requireCity(settings.oil_field_city_id, 'setting oil_field_city_id');
  requireReference(specialisationById, settings.default_specialisation_id,
    'specialisation for setting default_specialisation_id');
  if (!Array.isArray(settings.specialisation_titles)
    || !settings.specialisation_titles.length
    || settings.specialisation_titles[0]?.days !== 0
    || settings.specialisation_titles.some((rule, index, rules) =>
      !Number.isSafeInteger(Number(rule?.days)) || Number(rule.days) < 0
      || typeof rule?.title !== 'string' || !rule.title.trim()
      || (index > 0 && Number(rule.days) <= Number(rules[index - 1].days)))) {
    throw new Error('Invalid catalog setting: specialisation_titles.');
  }
  if (!Number.isSafeInteger(Number(settings.weather_slot_ms))
    || Number(settings.weather_slot_ms) < 60 * 60 * 1000
    || !Number.isSafeInteger(Number(settings.weather_change_min_interval_ms))
    || Number(settings.weather_change_min_interval_ms) < 30 * 60 * 1000
    || !Number.isSafeInteger(Number(settings.weather_change_max_interval_ms))
    || Number(settings.weather_change_max_interval_ms)
      < Number(settings.weather_change_min_interval_ms)
    || Number(settings.weather_change_max_interval_ms) > 8 * 60 * 60 * 1000
    || !Number.isSafeInteger(Number(settings.world_creature_roll_min_interval_ms))
    || Number(settings.world_creature_roll_min_interval_ms) < 60 * 1000
    || !Number.isSafeInteger(Number(settings.world_creature_roll_max_interval_ms))
    || Number(settings.world_creature_roll_max_interval_ms)
      < Number(settings.world_creature_roll_min_interval_ms)
    || Number(settings.world_creature_roll_max_interval_ms) > 45 * 60 * 1000
    || !Array.isArray(settings.weather_cambridge_monthly)
    || settings.weather_cambridge_monthly.length !== 12
    || settings.weather_cambridge_monthly.some((month) =>
      !Number.isFinite(Number(month?.maxC)) || !Number.isFinite(Number(month?.minC))
      || Number(month.maxC) <= Number(month.minC)
      || !Number.isFinite(Number(month?.rainfallMm)) || Number(month.rainfallMm) < 0
      || !Number.isFinite(Number(month?.rainDays)) || Number(month.rainDays) < 0)
    || !Array.isArray(settings.weather_storm_chance_by_month)
    || settings.weather_storm_chance_by_month.length !== 12
    || settings.weather_storm_chance_by_month.some((chance) =>
      !Number.isFinite(Number(chance)) || Number(chance) < 0 || Number(chance) > 1)
    || !Number.isFinite(Number(settings.weather_snow_max_temperature_c))
    || Number(settings.weather_snow_max_temperature_c) < -50
    || Number(settings.weather_snow_max_temperature_c) > 60
    || !Number.isFinite(Number(settings.weather_hurricane_min_temperature_c))
    || Number(settings.weather_hurricane_min_temperature_c) < -50
    || Number(settings.weather_hurricane_min_temperature_c) > 60
    || Number(settings.weather_snow_max_temperature_c)
      >= Number(settings.weather_hurricane_min_temperature_c)
    || !Array.isArray(settings.weather_hurricane_chance_by_month)
    || settings.weather_hurricane_chance_by_month.length !== 12
    || settings.weather_hurricane_chance_by_month.some((chance, index) =>
      !Number.isFinite(Number(chance)) || Number(chance) < 0
      || Number(chance) > Number(settings.weather_storm_chance_by_month[index]))
    || !Number.isFinite(Number(settings.hurricane_ship_damage_min_ratio))
    || Number(settings.hurricane_ship_damage_min_ratio) < 0
    || Number(settings.hurricane_ship_damage_min_ratio) > 1
    || !Number.isFinite(Number(settings.hurricane_ship_damage_max_ratio))
    || Number(settings.hurricane_ship_damage_max_ratio)
      < Number(settings.hurricane_ship_damage_min_ratio)
    || Number(settings.hurricane_ship_damage_max_ratio) > 1
    || !Number.isFinite(Number(settings.hurricane_vehicle_damage_chance))
    || Number(settings.hurricane_vehicle_damage_chance) < 0
    || Number(settings.hurricane_vehicle_damage_chance) > 1
    || WORLD_CREATURE_TYPES.some((type) =>
      typeof settings.world_creature_names?.[type] !== 'string'
      || !settings.world_creature_names[type].trim()
      || typeof settings.world_creature_attack_names?.[type] !== 'string'
      || !settings.world_creature_attack_names[type].trim()
      || typeof settings.world_creature_icons?.[type] !== 'string'
      || !settings.world_creature_icons[type].trim()
      || !['land', 'sea'].includes(settings.world_creature_route_types?.[type])
      || !['treasure', 'ore'].includes(settings.world_creature_reward_types?.[type])
      || !Number.isFinite(Number(settings.world_creature_wake_chances?.[type]))
      || Number(settings.world_creature_wake_chances[type]) < 0
      || Number(settings.world_creature_wake_chances[type]) > 1
      || !Number.isFinite(Number(settings.world_creature_hp?.[type]))
      || Number(settings.world_creature_hp[type]) <= 0
      || !Number.isFinite(Number(settings.world_creature_speed_kph?.[type]))
      || Number(settings.world_creature_speed_kph[type]) <= 0
      || !Number.isFinite(Number(settings.world_creature_counter_damage_ratio?.[type]))
      || Number(settings.world_creature_counter_damage_ratio[type]) < 0)
    || !Array.isArray(settings.world_creature_tier_weights)
    || settings.world_creature_tier_weights.length < 7
    || settings.world_creature_tier_weights.slice(1, 7).some((weight) =>
      !Number.isSafeInteger(Number(weight)) || Number(weight) < 1)
    || settings.world_creature_tier_weights.slice(2, 7).some((weight) =>
      Number(weight) >= Number(settings.world_creature_tier_weights[1]))
    || ['world_creature_tier_hp_multipliers', 'world_creature_tier_speed_multipliers',
      'world_creature_tier_damage_multipliers'].some((key) =>
      !Array.isArray(settings[key]) || settings[key].length < 7
      || settings[key].slice(1, 7).some((value) =>
        !Number.isFinite(Number(value)) || Number(value) <= 0))
    || !Array.isArray(settings.world_creature_tier_ore_drops)
    || settings.world_creature_tier_ore_drops.length < 7
    || settings.world_creature_tier_ore_drops.slice(1, 7).some((value) =>
      !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    || !Number.isFinite(Number(settings.ghost_attack_force_ratio))
    || Number(settings.ghost_attack_force_ratio) <= 0
    || Number(settings.ghost_attack_force_ratio) >= 1
    || !Number.isSafeInteger(Number(settings.world_event_catchup_periods))
    || Number(settings.world_event_catchup_periods) < 1
    || !Number.isSafeInteger(Number(settings.world_event_weather_retention_days))
    || Number(settings.world_event_weather_retention_days) < 1
    || !Number.isSafeInteger(Number(settings.world_event_outcome_retention_days))
    || Number(settings.world_event_outcome_retention_days) < 1
    || !Number.isSafeInteger(Number(settings.world_event_player_history_limit))
    || Number(settings.world_event_player_history_limit) < 1
    || !Number.isFinite(Number(settings.mining_dwarf_capture_chance))
    || Number(settings.mining_dwarf_capture_chance) < 0
    || Number(settings.mining_dwarf_capture_chance) > 1) {
    throw new Error('Invalid world event settings.');
  }
  requireReference(avatarElementTypeById, settings.avatar_background_type_id,
    'avatar type for setting avatar_background_type_id');
  for (const typeId of settings.avatar_required_type_ids ?? []) {
    requireReference(avatarElementTypeById, typeId, 'required avatar element type');
  }
  const mapPositions = settings.map_city_positions;
  for (const city of cities) {
    const position = mapPositions?.[city.id];
    const storedPosition = Number.isFinite(Number(city.mapX)) && Number.isFinite(Number(city.mapY));
    if ((!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y)))
      && !storedPosition) {
      throw new Error(`Missing catalog map position for city ${city.id}.`);
    }
  }
  const factoryNames = settings.factory_market_names;
  if (!factoryNames || typeof factoryNames !== 'object' || Array.isArray(factoryNames)
    || typeof factoryNames.sale !== 'string' || !factoryNames.sale
    || typeof factoryNames.rental !== 'string' || !factoryNames.rental
    || typeof settings.factory_market_icon !== 'string' || !settings.factory_market_icon) {
    throw new Error('Invalid catalog factory market presentation settings.');
  }
  const scrapYields = settings.recycling_scraps_by_rarity;
  if (!scrapYields || typeof scrapYields !== 'object' || Array.isArray(scrapYields)
    || rarities.some((rarity) => !Number.isSafeInteger(Number(scrapYields[rarity.id]))
      || Number(scrapYields[rarity.id]) < 1)
    || !Number.isSafeInteger(Number(settings.recycling_scraps_per_ore))
    || Number(settings.recycling_scraps_per_ore) < 1) {
    throw new Error('Invalid catalog recycling settings.');
  }
  const workerBotTiers = settings.factory_worker_bot_tiers;
  if (!Array.isArray(workerBotTiers) || !workerBotTiers.length
    || workerBotTiers.some((tier) => !Number.isSafeInteger(Number(tier.id))
      || typeof tier.name !== 'string' || !tier.name
      || !Number.isFinite(Number(tier.cph)) || Number(tier.cph) <= 0
      || !Number.isFinite(Number(tier.costGold)) || Number(tier.costGold) <= 0)
    || !Number.isSafeInteger(Number(settings.factory_worker_bot_contract_duration_ms))
    || Number(settings.factory_worker_bot_contract_duration_ms) < 1) {
    throw new Error('Invalid catalog Factory Worker bot settings.');
  }
  const requireSettingStrings = (settingKey, paths) => {
    const root = settings[settingKey];
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      throw new Error(`Invalid catalog label setting: ${settingKey}.`);
    }
    for (const path of paths) {
      let value = root;
      for (const segment of path) value = value?.[segment];
      if (typeof value !== 'string') {
        throw new Error(`Missing catalog label setting: ${settingKey}.${path.join('.')}.`);
      }
    }
  };
  requireSettingStrings('public_stats_labels', [
    ...['activeMiners', 'activeMines', 'gold', 'oil', 'specialisations', 'routes', 'gadgets', 'cities']
      .map((key) => ['sections', key]),
    ...['activePopulation', 'newMiners', 'averageMelds', 'inventoryThings', 'thingsPerCapita',
      'mineTotal', 'oiledBots', 'activeGold', 'goldPerCapita', 'extractedOil', 'deployedMachines',
      'oiledWorkers', 'battles', 'gadgetUsers', 'activeGadgets', 'cityPopulation',
      'cityManufacturers', 'cityWorkers'].map((key) => ['rows', key]),
    ...['thingsPrefix', 'ore', 'gold'].map((key) => ['mineModes', key])
  ]);
  requireSettingStrings('calculator_report_labels', [
    ...['findings', 'things', 'minesVehicles'].map((key) => ['sections', key]),
    ...['recordedFindings', 'itemsDiscovered', 'explosiveFindings', 'totalThings', 'melds',
      'mines', 'currentGold', 'credits'].map((key) => ['rows', key]),
    ['suffixes', 'rarityOwned'], ['suffixes', 'vehicleActive']
  ]);
  requireSettingStrings('ledger_report_labels', [
    ['actions', 'sale'], ['actions', 'purchase']
  ]);
  requireSettingStrings('item_type_labels', [
    ...['landVehicle', 'ship', 'aircraft', 'weapon', 'vehicleModification', 'cannon',
      'ammunitionCrate', 'aircraftBomb', 'ammunitionBox', 'miningEquipment',
      'explosive', 'minerRobot', 'dwarfMiner', 'gadget', 'oilFieldBomb',
      'oilFieldMachine', 'avatarElement', 'collectible'].map((key) => [key])
  ]);
  requireSettingStrings('location_labels', [['atSea']]);
  requireSettingStrings('finding_source_names', [
    ['mine'], ['new-mine'], ['explosives'], ['dwarf'], ['dwarf-capture'], ['fishing'], ['salvage']
  ]);
  }
  const indexed = {
    maps, mineTypes, cities, cityMineTypes, mineTypesByCity, items, discoverableItems, damagedItems,
    routes, vehicles, lands, ships, aircrafts,
    weapons, mods, cannons, cannonballs, bombs, boxes, containers, tiers, equipment, explosives, robots,
    melds, meldRequirements, gadgets, gadgetItems, factoryActions, machineTypes, machines: machinesWithTypes,
    avatarElementTypes, avatarElements, stones, rarities, equipmentTypes, botParts,
    specialisations, dwarfTiers, settings, labels,
    rarityNames, equipmentTypeNames, equipmentRarityAdjectives,
    byId, byMineType, damagedByMineType, vehicleByItemId, weaponByItemId, modByItemId, cannonByItemId,
    cannonballByItemId, cannonballByType, bombByItemId, boxByItemId, boxByType,
    equipmentByItemId, explosiveByItemId, robotByItemId,
    meldById, gadgetById, gadgetByName, gadgetByBehaviorKey, gadgetItemByItemId, factoryActionById,
    factoryOutputItemIds,
    machineTypeById, machineById, machineByItemId, avatarElementTypeById, avatarElementByItemId,
    stoneByBehaviorKey,
    rarityById, equipmentTypeById, botPartById, specialisationById, dwarfByItemId, dwarfByRarity
  };
  return useStoredGoldValues ? indexed : assignItemGoldValues(indexed);
}
