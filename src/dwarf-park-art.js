const DWARF_COLOURS = Object.freeze({
  yellow: '#f0df35', green: '#78bd46', blue: '#66b9df',
  red: '#e75b4d', purple: '#bd79c9', orange: '#f49a28'
});

const REGION_MOTIFS = new Set(['aso', 'bromo', 'calbuco', 'dempo', 'ebeko', 'fogo', 'gallego']);

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function skyline(seed) {
  return Array.from({ length: 15 }, (_, index) => {
    const width = 58 + ((seed >>> (index % 19)) % 35);
    const x = index * 82 - 25;
    const height = 78 + ((seed + index * 47) % 122);
    const y = 294 - height;
    const roof = index % 3 === 0
      ? `<path d="M${x - 8} ${y}h${width + 16}l-${(width + 16) / 2} -32Z"/>`
      : index % 3 === 1
        ? `<path d="M${x} ${y}q${width / 2} -34 ${width} 0Z"/>`
        : `<path d="M${x + width * .32} ${y}v-38h${width * .36}v38Z"/>`;
    const windows = Array.from({ length: Math.max(2, Math.floor(width / 24)) }, (_, pane) =>
      `<rect x="${x + 10 + pane * 21}" y="${y + 22}" width="8" height="17" rx="1"/>`).join('');
    return `<g class="park-skyline-building"><rect x="${x}" y="${y}" width="${width}" height="${height}"/>${roof}${windows}</g>`;
  }).join('');
}

function regionalMotif(mapSlug) {
  switch (mapSlug) {
    case 'bromo':
      return '<g class="park-region-detail park-mushrooms"><path d="M80 315v-76m0 22q-44 0-51 35h102q-7-35-51-35Zm102 52v-51m0 17q-30 0-37 25h74q-7-25-37-25Z"/><circle cx="80" cy="296" r="4"/><circle cx="182" cy="284" r="3"/></g>';
    case 'calbuco':
      return '<g class="park-region-detail park-rainwork"><path d="M28 82l18 41m28-53 18 41m28-48 18 41m28-34 18 41m28-48 18 41"/><path d="M35 316q55-45 110 0t110 0"/></g>';
    case 'dempo':
      return '<g class="park-region-detail park-peaks"><path d="M0 274 118 116l62 92 68-119 121 185M92 151l26-35 18 27m84-15 28-39 26 37"/><path d="M38 62h92m-54 0v-24m-23 24 23-15 23 15"/></g>';
    case 'ebeko':
      return '<g class="park-region-detail park-relays"><path d="M58 286V104m0 0-32 83h64Zm0 24v-24m112 24V148m0 0-24 63h48Z"/><path d="M74 98q45-44 90 0m-80 20q35-30 70 0"/></g>';
    case 'fogo':
      return '<g class="park-region-detail park-volcano"><path d="M0 292 119 130l45 63 38-83 112 182Z"/><path d="M202 110q-32-24-4-48-16-23 18-42 36 26 11 50 26 24-25 40Z"/></g>';
    case 'gallego':
      return '<g class="park-region-detail park-tide"><path d="M0 306q45-24 90 0t90 0 90 0 90 0"/><path d="M94 272v-99m0 17-36 82m36-82 36 82m-36-62h22m-22 26h34"/><circle cx="94" cy="163" r="11"/></g>';
    default:
      return '<g class="park-region-detail park-derricks"><path d="M48 306 91 104l43 202M69 205h44m-51 35h58m-65 35h72M91 104l20-35m-20 35L73 70m18 34v-52"/><circle cx="91" cy="52" r="7"/></g>';
  }
}

function tree(x, y, scale, variant) {
  const branches = variant % 2
    ? 'M0-7-35-72m35 65 42-84M0-44l-58-45m58 24 61-50'
    : 'M0-8-48-68m48 60 55-69M0-42l-25-69m25 47 48-45';
  return `<g class="park-tree-art park-tree-variant-${variant % 3}" transform="translate(${x} ${y}) scale(${scale})">
    <ellipse class="park-shadow" cx="0" cy="2" rx="66" ry="14"/>
    <path class="park-tree-trunk" d="M-15 0q10-74-2-152h35Q7-74 16 0Z"/>
    <path class="park-tree-branch" d="${branches}"/>
    <g class="park-tree-crown"><circle cx="-48" cy="-116" r="49"/><circle cx="3" cy="-147" r="61"/><circle cx="58" cy="-116" r="53"/><circle cx="4" cy="-94" r="62"/></g>
    <g class="park-leaf-lines"><path d="M-78-113q38-31 72 2m-19-65q42 21 62 61m-7-64q17 35 9 76m19-58q-17 25-44 39"/></g>
  </g>`;
}

function dwarf({ colour, x, y, flip = false, tendency, pose = '' }) {
  const fill = DWARF_COLOURS[colour];
  const facing = flip ? -1 : 1;
  const prop = tendency === 'biting'
    ? '<g class="park-prop park-bite-target"><path d="M30-29q28-25 53 2l-5 35H42Z"/><path d="m41-15 8 7 8-7 8 7 8-7"/></g>'
    : tendency === 'pickpocketing'
      ? '<g class="park-prop park-stolen-purse"><path d="M27-29q16-11 29 0l-4 25H30Z"/><path d="M34-29q4-14 14 0"/><circle cx="43" cy="-15" r="3"/></g>'
      : tendency === 'ambush'
        ? '<g class="park-prop park-club"><path d="M25-39 66-72"/><path d="m58-80 18 16-12 13-19-16Z"/></g>'
        : '<g class="park-prop park-sling"><path d="M24-34q24 22 42-2M45-19l13 24"/><circle cx="69" cy="-41" r="6"/></g>';
  return `<g class="park-dwarf-action park-dwarf-${tendency} ${escapeXml(pose)}" data-tendency="${escapeXml(tendency)}" transform="translate(${x} ${y}) scale(${facing} 1)">
    <ellipse class="park-shadow" cx="0" cy="4" rx="39" ry="10"/>
    <path class="park-dwarf-leg" d="M-22-38-30 0h17l12-32L10 0h18L20-42Z"/>
    <path class="park-dwarf-coat" fill="${fill}" d="M-36-96q5-26 34-29 31 2 38 29l-12 61H-25Z"/>
    <path class="park-dwarf-belt" d="M-30-69h60v10h-60Z"/>
    <circle class="park-dwarf-head" cx="0" cy="-143" r="31"/>
    <path class="park-dwarf-ear" d="M-31-146q-18-8-16 10 7 13 20 0m58-10q18-8 16 10-7 13-20 0"/>
    <path class="park-dwarf-hat" fill="${fill}" d="M-42-157 1-205l42 48-12 7h-62Z"/>
    <path class="park-dwarf-hat-band" d="M-33-164h67v12h-67Z"/>
    <circle class="park-dwarf-eye" cx="-11" cy="-146" r="4"/><circle class="park-dwarf-eye" cx="11" cy="-146" r="4"/>
    <path class="park-dwarf-brow" d="m-22-155 13-4m18 0 13 4"/>
    <path class="park-dwarf-grin" d="M-17-131q17 18 34 0l-4 22H-13Z"/>
    <path class="park-dwarf-teeth" d="m-13-128 6 8 7-9 7 9 6-8"/>
    <path class="park-dwarf-arm" d="M-29-100-56-62m84-39 31 34"/>
    ${prop}
  </g>`;
}

function burst(x, y, text, rotation = 0) {
  const points = '0,-39 12,-24 31,-31 27,-12 47,0 27,12 31,31 12,24 0,42 -12,24 -31,31 -27,12 -47,0 -27,-12 -31,-31 -12,-24';
  return `<g class="park-action-burst" transform="translate(${x} ${y}) rotate(${rotation})"><polygon points="${points}"/><text x="0" y="6" text-anchor="middle">${escapeXml(text)}</text></g>`;
}

export function renderDwarfParkArt({ cityName = 'Unknown city', mapSlug = 'aso', appearance = {} } = {}) {
  const safeMapSlug = REGION_MOTIFS.has(mapSlug) ? mapSlug : 'aso';
  const stableSeed = `${safeMapSlug}|${cityName}|${appearance.signature ?? ''}|${appearance.district ?? ''}`;
  const seed = hashText(stableSeed);
  const uid = `dwarf-park-${seed.toString(36)}`;
  const treeShift = seed % 38;
  const pennant = seed % 2 ? 'M660 187v-70l71 21-71 22' : 'M660 187v-70l59 29-59 18';
  return `<svg class="dwarf-park-art dwarf-park-art-${safeMapSlug}" data-park-variant="${seed % 7}" viewBox="0 0 1200 650" role="img" aria-labelledby="${uid}-title ${uid}-description" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <title id="${uid}-title">Young Dwarves causing trouble in ${escapeXml(cityName)}</title>
    <desc id="${uid}-description">A richly drawn city park where six young Dwarves practise biting, pickpocketing, ambushes, slingshot attacks, and escaping with stolen property.</desc>
    <defs>
      <linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1"><stop class="park-sky-top"/><stop offset="1" class="park-sky-bottom"/></linearGradient>
      <linearGradient id="${uid}-grass" x1="0" y1="0" x2="1" y2="1"><stop class="park-grass-light"/><stop offset="1" class="park-grass-dark"/></linearGradient>
      <pattern id="${uid}-hatch" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M-5 5 5-5m-2 24L19 3m-2 24L27 17"/></pattern>
      <filter id="${uid}-soft-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="7" dy="10" stdDeviation="7" flood-color="#050806" flood-opacity=".48"/></filter>
    </defs>
    <rect class="park-svg-sky" width="1200" height="650" fill="url(#${uid}-sky)"/>
    <circle class="park-sun" cx="1015" cy="104" r="52"/><circle class="park-sun-ring" cx="1015" cy="104" r="72"/>
    <g class="park-clouds"><path d="M158 106q27-52 69-12 38-54 82 10 52-16 66 35H118q5-28 40-33Z"/><path d="M775 76q31-38 66 0 44-34 77 18 38-6 50 29H736q4-37 39-47Z"/></g>
    <g class="park-skyline">${skyline(seed)}</g>
    ${regionalMotif(safeMapSlug)}
    <path class="park-distant-wall" d="M0 283q170-28 346 4t354-3 500 5v102H0Z"/>
    <rect class="park-svg-grass" y="320" width="1200" height="330" fill="url(#${uid}-grass)"/>
    <path class="park-path" d="M-80 664q182-237 430-157 159 51 300-27 213-118 630 33v151Z"/>
    <path class="park-path-line" d="M-40 632q190-194 397-112 145 57 304-24 221-113 584 43"/>
    <g class="park-fence"><path d="M0 333h1200M0 375h1200"/>${Array.from({ length: 31 }, (_, index) => `<path d="M${index * 40} 303v95l-8-13m8 13 8-13"/>`).join('')}</g>
    ${tree(108 + treeShift, 500, 1.13, seed % 3)}
    ${tree(1080 - treeShift, 500, .94, (seed + 1) % 3)}
    <g class="park-play-fort" filter="url(#${uid}-soft-shadow)">
      <path class="park-fort-platform" d="M465 346h286v31H465Z"/>
      <path class="park-fort-post" d="M488 365v161m237-161v161M535 377v88m142-88v88"/>
      <path class="park-fort-roof" d="M438 348 520 249l84 99m23 0 72-86 82 86"/>
      <path class="park-fort-line" d="M480 311h82m100 4h76M520 249v99m179-86v86"/>
      <path class="park-slide" d="M744 372q55 41 76 146h-42q-14-74-62-113"/>
      <path class="park-ladder" d="M474 377 421 518m45-119h-36m27 27h-37m27 28h-38m28 29h-39"/>
      <path class="park-rope-bridge" d="M558 362q51 37 108 0m-108 29q51 37 108 0m-98-22v30m22-20v31m23-31v29m22-40v31m21-42v28"/>
      <path class="park-pennant" d="${pennant}"/>
      <circle class="park-fort-bolt" cx="488" cy="371" r="7"/><circle class="park-fort-bolt" cx="725" cy="371" r="7"/>
    </g>
    <g class="park-rule-sign" transform="translate(884 355) rotate(3)"><path d="M0 0h193v121H0Z"/><path d="M19 24h154M19 53h126M19 82h153"/><text x="96" y="22" text-anchor="middle">PARK RULES</text><text x="96" y="50" text-anchor="middle">NO BITING</text><text x="96" y="79" text-anchor="middle">NO THEFT</text><text x="96" y="108" text-anchor="middle">NO SIEGES</text><path class="park-rule-vandalism" d="m4 9 182 103M17 111 179 6"/></g>
    <g class="park-roundabout-art"><ellipse cx="314" cy="526" rx="96" ry="28"/><path d="M314 409v119m-66-86 132 72m0-72-132 72"/><circle cx="314" cy="526" r="12"/><path d="M247 442q67-32 134 0"/></g>
    <g class="park-bench"><path d="M78 518h189v23H78Zm18-54h155v24H96Zm20 77-14 62m126-62 15 62M82 481l17 40m148-40-17 40"/><path class="park-abandoned-coat" d="M121 447q36-32 70 0l-7 52h-56Z"/><path class="park-pocket" d="M154 464v22h24"/></g>
    ${dwarf({ colour: 'yellow', x: 402, y: 592, tendency: 'biting', pose: 'is-lunging' })}
    ${dwarf({ colour: 'green', x: 207, y: 604, flip: true, tendency: 'pickpocketing', pose: 'is-sneaking' })}
    ${dwarf({ colour: 'blue', x: 561, y: 494, flip: true, tendency: 'biting', pose: 'is-gnawing' })}
    ${dwarf({ colour: 'red', x: 839, y: 602, flip: true, tendency: 'pickpocketing', pose: 'is-running' })}
    ${dwarf({ colour: 'purple', x: 672, y: 376, tendency: 'ambush', pose: 'is-brawling' })}
    ${dwarf({ colour: 'orange', x: 1027, y: 602, flip: true, tendency: 'slingshot', pose: 'is-firing' })}
    ${burst(389, 369, 'CHOMP!', -8)}${burst(250, 381, 'YOINK!', 7)}${burst(747, 202, 'THWACK!', 4)}${burst(1055, 361, 'PING!', -5)}
    <g class="park-sling-stone"><circle cx="917" cy="391" r="8"/><path d="M940 397q32 8 55 27"/></g>
    <g class="park-foreground-plants">${Array.from({ length: 18 }, (_, index) => {
      const x = 24 + index * 68;
      const height = 15 + ((seed + index * 13) % 27);
      return `<path d="M${x} 650q-3-${height} -19-${height + 5}m19 ${height * -1}q5-${height + 3} 22-${height + 8}"/><circle cx="${x + (index % 2 ? 9 : -8)}" cy="${625 - (index % 4) * 5}" r="4"/>`;
    }).join('')}</g>
    <rect class="park-hatch-overlay" width="1200" height="650" fill="url(#${uid}-hatch)"/>
  </svg>`;
}
