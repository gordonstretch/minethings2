const LANDMARK_KINDS = new Set([
  'spire', 'arch', 'rotunda', 'bridge', 'tower', 'arcade', 'aqueduct'
]);

const INK_PALETTES = Object.freeze([
  { paper: '#d9c69b', wash: '#705a42', ink: '#171c1b', light: '#f0dfb4', accent: '#c66f2d' },
  { paper: '#b9cbc3', wash: '#526e69', ink: '#132224', light: '#d9e4d9', accent: '#c58f3b' },
  { paper: '#c8b5a2', wash: '#73564f', ink: '#23191a', light: '#ead4b5', accent: '#944934' },
  { paper: '#b8c6ce', wash: '#4f6674', ink: '#152027', light: '#dbe7e7', accent: '#b27c35' }
]);

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed) {
  let state = hashText(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function range(count, render) {
  return Array.from({ length: count }, (_, index) => render(index)).join('');
}

function masonry(x, y, width, height, rows, columns, className = 'fine') {
  const rowHeight = height / rows;
  const lines = range(rows + 1, (row) =>
    `<path class="${className}" d="M${x} ${y + row * rowHeight}h${width}"/>`);
  const joints = range(rows, (row) => {
    const offset = row % 2 ? 0.5 : 0;
    return range(columns + 1, (column) => {
      const jointX = x + ((column + offset) * width / columns);
      if (jointX <= x || jointX >= x + width) return '';
      return `<path class="${className}" d="M${jointX} ${y + row * rowHeight}v${rowHeight}"/>`;
    });
  });
  return lines + joints;
}

function steps(cx, y, width, count = 4) {
  return range(count, (index) => {
    const inset = index * 9;
    return `<path class="stone" d="M${cx - width / 2 + inset} ${y - index * 7}h${width - inset * 2}"/>`;
  });
}

function archedWindow(x, y, width, height) {
  const radius = width / 2;
  return `<path class="aperture" d="M${x} ${y + height}v-${height - radius}a${radius} ${radius} 0 0 1 ${width} 0v${height - radius}z"/>
    <path class="fine light-line" d="M${x + width / 2} ${y + radius}v${height - radius - 3}M${x + 3} ${y + height * .62}h${width - 6}"/>`;
}

function landscape(random, kind) {
  const peaks = Array.from({ length: 9 }, (_, index) => {
    const x = index * 120 - 55;
    const crest = 108 + Math.round(random() * 58) + (index % 2) * 18;
    return `${x},${crest}`;
  }).join(' ');
  const stars = range(16, (index) => {
    const x = 42 + Math.round(random() * 876);
    const y = 35 + Math.round(random() * 125);
    const radius = index % 5 === 0 ? 2.2 : 1.2;
    return `<circle class="sky-mark" cx="${x}" cy="${y}" r="${radius}"/>`;
  });
  const shore = kind === 'bridge' || kind === 'aqueduct'
    ? `<path class="water" d="M0 437q86-13 172 0t172 0t172 0t172 0t172 0t172 0v83H0z"/>
       ${range(7, (index) => `<path class="water-line" d="M${20 + index * 137} ${461 + index % 2 * 18}q45-12 91 0t91 0"/>`)}`
    : `<path class="ground" d="M0 431q110-25 217-1t205-2t207 6t331-8v94H0z"/>
       <path class="fine terrain" d="M0 473q130-29 260-1t260 0t240-7t200 6M0 498q151-17 306 0t314-3t340 2"/>`;
  return `<g aria-hidden="true"><rect class="sky" width="960" height="520"/>
    <path class="horizon-wash" d="M0 245L${peaks} 1015,246V438H0z"/>
    <path class="fine horizon" d="M0 245L${peaks} 1015,246"/>
    ${stars}${shore}
    <path class="fine cloud" d="M66 101q28-25 57 0q29-18 56 4M736 139q24-21 48 0q33-22 65 5"/></g>`;
}

function spire() {
  return `<g class="architecture architecture-spire">
    <path class="shade" d="M341 433V277l44-18 18-126 77-92 77 92 18 126 44 18v156z"/>
    <path class="stone fill-light" d="M350 433V282l48-19 17-127 65-88 65 88 17 127 48 19v151z"/>
    <path class="stone" d="M415 136l65-88 65 88-18 297H433zM452 82l28-65 28 65M480 17V3"/>
    <path class="stone" d="M350 282l65-22M545 260l65 22M365 433v-91l50-24M595 433v-91l-50-24"/>
    <path class="stone fill-wash" d="M277 433v-74l73-77 65 36v115zM683 433v-74l-73-77-65 36v115z"/>
    <path class="stone" d="M264 433h432M287 359h56M617 359h56M306 338v95M654 338v95"/>
    ${masonry(433, 139, 94, 294, 13, 3)}
    ${range(5, (i) => archedWindow(463, 112 + i * 55, 34, 42))}
    <path class="aperture" d="M450 433v-45a30 30 0 0 1 60 0v45z"/>
    <path class="fine light-line" d="M480 387v46M453 408h54"/>
    <path class="stone" d="M398 263l-24-27v-61M562 263l24-27v-61M374 175l-13 19h26zM586 175l-13 19h26z"/>
    <path class="fine" d="M432 222h96M428 285h104M424 347h112"/>
    ${steps(480, 463, 250, 5)}
    <path class="plant" d="M297 446q-17-32-35-22m35 22q18-37 35-29m322 29q12-35 33-30m-33 30q-22-29-38-17"/>
  </g>`;
}

function arch() {
  const voussoirs = range(15, (index) => {
    const angle = Math.PI + index * Math.PI / 14;
    const x1 = 480 + Math.cos(angle) * 115;
    const y1 = 309 + Math.sin(angle) * 115;
    const x2 = 480 + Math.cos(angle) * 151;
    const y2 = 309 + Math.sin(angle) * 151;
    return `<path class="fine" d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  });
  return `<g class="architecture architecture-arch">
    <path class="shade" d="M237 433V221l48-30V119h390v72l48 30v212H590V317a110 110 0 0 0-220 0v116z"/>
    <path class="stone fill-light" fill-rule="evenodd" d="M246 433V226l49-30v-68h370v68l49 30v207H590V315a110 110 0 0 0-220 0v118z"/>
    <path class="stone" d="M246 226h468M295 196h370M295 128h370M329 128V91h302v37M348 91l28-27h208l28 27"/>
    <path class="stone" d="M350 433V315a130 130 0 0 1 260 0v118M370 315a110 110 0 0 1 220 0"/>
    ${voussoirs}
    ${masonry(246, 226, 104, 207, 8, 3)}${masonry(610, 226, 104, 207, 8, 3)}
    <circle class="medallion" cx="310" cy="270" r="29"/><circle class="fine" cx="310" cy="270" r="20"/>
    <path class="fine" d="M292 270h36M310 252v36"/>
    <circle class="medallion" cx="650" cy="270" r="29"/><circle class="fine" cx="650" cy="270" r="20"/>
    <path class="fine" d="M632 270h36M650 252v36"/>
    ${range(7, (i) => `<path class="fine" d="M${354 + i * 42} 99v21"/>`)}
    <path class="stone" d="M328 433v-66h22M632 433v-66h-22M269 226v-35M691 226v-35"/>
    <path class="fine light-line" d="M480 179v-34m-33 34v-34m66 34v-34"/>
    ${steps(480, 466, 560, 5)}
    <path class="plant" d="M239 443q-18-26-39-15m39 15q8-31 27-32m455 32q15-33 35-29m-35 29q-15-24-31-15"/>
  </g>`;
}

function rotunda() {
  const columns = range(10, (index) => {
    const x = 314 + index * 37;
    return `<path class="stone fill-light" d="M${x} 277h22l-3 112h-16z"/>
      <path class="stone" d="M${x - 4} 271h30v9h-30M${x - 3} 389h28v10h-28"/>`;
  });
  const ribs = range(9, (index) => {
    const x = 342 + index * 34.5;
    return `<path class="fine" d="M480 110Q${x} 132 ${x} 241"/>`;
  });
  return `<g class="architecture architecture-rotunda">
    <ellipse class="shade" cx="480" cy="435" rx="263" ry="59"/>
    <path class="stone fill-wash" d="M271 399h418l44 41q-253 66-506 0z"/>
    <ellipse class="stone fill-light" cx="480" cy="399" rx="213" ry="51"/>
    <path class="stone fill-light" d="M297 241h366v158H297z"/>
    <path class="stone fill-wash" d="M278 233q202-42 404 0l-19 28H297z"/>
    <path class="stone fill-light" d="M310 229q31-109 170-119q139 10 170 119q-170 38-340 0z"/>
    <ellipse class="stone fill-wash" cx="480" cy="111" rx="45" ry="15"/>
    <ellipse class="aperture" cx="480" cy="111" rx="25" ry="8"/>
    ${ribs}${columns}
    <path class="stone" d="M297 260h366M297 399h366M271 399q209 49 418 0"/>
    ${range(9, (i) => archedWindow(320 + i * 40, 300, 25, 50))}
    <path class="fine" d="M248 420q232 70 464 0M235 440q245 78 490 0"/>
    ${range(15, (i) => `<path class="fine" d="M${266 + i * 30} 409v24"/>`)}
    <path class="stone" d="M480 96V62m0 0l-17 22m17-22l17 22"/>
    ${steps(480, 478, 390, 6)}
    <path class="plant" d="M250 412q-29-30-48-10m508 10q25-31 48-11"/>
  </g>`;
}

function bridge() {
  const windows = range(11, (index) => archedWindow(263 + index * 42, 213, 25, 50));
  const railing = range(23, (index) => `<path class="fine" d="M${242 + index * 22} 191v18"/>`);
  return `<g class="architecture architecture-bridge">
    <path class="shade" d="M168 430V151h119v48h386v-48h119v279H643V319H317v111z"/>
    <path class="stone fill-light" d="M177 430V160h101v52h404v-52h101v270H652V313H308v117z"/>
    <path class="stone fill-wash" d="M226 160l2-53 50-37 50 37 2 105h-52v-52zM630 212l2-105 50-37 50 37 2 53h49v52z"/>
    <path class="stone" d="M228 107h100M632 107h100M248 90V54h60v36M652 90V54h60v36"/>
    <path class="stone fill-wash" d="M278 199h404v88H278z"/>
    <path class="stone" d="M248 54l30-31 30 31M652 54l30-31 30 31M278 199h404M278 287h404"/>
    ${windows}${railing}
    <path class="stone" d="M231 191h498M240 209h480M330 212l31-34h238l31 34"/>
    <path class="aperture" d="M207 430V260a35 35 0 0 1 70 0v170zM683 430V260a35 35 0 0 1 70 0v170z"/>
    <path class="stone" d="M177 313h131M652 313h131"/>
    ${masonry(177, 313, 131, 117, 5, 3)}${masonry(652, 313, 131, 117, 5, 3)}
    ${steps(480, 339, 310, 4)}
    <path class="fine light-line" d="M480 287v42M447 287v35M513 287v35"/>
    <path class="plant" d="M169 424q-29-35-47-16m668 16q27-37 48-14"/>
  </g>`;
}

function tower() {
  const windows = range(3, (floor) => range(4, (column) =>
    archedWindow(405 + column * 48 + floor * 5, 297 - floor * 84, 27, 43)));
  return `<g class="architecture architecture-tower">
    <path class="shade" d="M351 434l30-105-16-12 26-92-18-14 35-91 72-67 83 58-10 90 27 15-21 90 29 19-16 109z"/>
    <path class="stone fill-light" d="M361 434l29-101-16-13 25-91-16-14 33-89 65-62 72 51-10 91 27 15-21 88 29 19-16 106z"/>
    <path class="stone fill-wash" d="M390 333l159-24 29 19-17 32-200 29zM399 229l144-23 27 15-17 32-179 27zM416 126l137-11-10 36-160 22z"/>
    <path class="stone" d="M361 389l200-29M374 280l179-27M383 173l160-22M481 64l-8-49 20-12 14 49"/>
    <path class="stone" d="M402 434l8-53M521 434l-3-63M399 320l18-48M529 309l-2-46M416 215l15-52M525 206l-3-45"/>
    ${windows}
    <path class="aperture" d="M442 434v-55a35 35 0 0 1 70 0v55z"/>
    <path class="fine light-line" d="M477 379v55M445 407h64"/>
    <path class="stone" d="M399 229l-29-42-38 12M543 206l35-36 39 17M390 333l-48-36-36 27M549 309l44-36 38 28"/>
    <path class="stone fill-wash" d="M313 305l29-8 16 12-31 14zM594 273l26 5 11 23-32-8z"/>
    ${masonry(405, 360, 132, 74, 4, 4)}
    ${steps(480, 469, 315, 5)}
    <path class="plant" d="M348 441q-20-36-44-21m275 21q17-31 39-24"/>
  </g>`;
}

function arcade() {
  const bays = range(7, (index) => {
    const x = 188 + index * 86;
    return `<path class="stone fill-light" fill-rule="evenodd" d="M${x} 431V240h74v191h-15V307a22 22 0 0 0-44 0v124z"/>
      <path class="stone" d="M${x - 5} 240h84v17h-84M${x + 8} 431V307a32 32 0 0 1 64 0v124"/>
      <path class="fine" d="M${x + 14} 278h52"/>`;
  });
  return `<g class="architecture architecture-arcade">
    <path class="shade" d="M148 438V195l65-61h534l65 61v243z"/>
    <path class="stone fill-wash" d="M157 431V201l60-57h526l60 57v230z"/>
    <path class="stone fill-light" d="M174 201h612v48H174zM217 144h526l43 57H174z"/>
    <path class="stone" d="M174 201h612M174 249h612M217 144h526M244 144v-39h472v39"/>
    <path class="stone" d="M244 105l36-28h400l36 28M280 77l36-22h328l36 22"/>
    ${bays}
    ${range(8, (i) => `<path class="stone fill-wash" d="M${174 + i * 86} 224h20v207h-20z"/>`)}
    ${masonry(217, 144, 526, 57, 3, 10)}
    <path class="fine light-line" d="M203 431L480 249l277 182M290 431l190-182 190 182M378 431l102-182 102 182"/>
    <path class="stone" d="M157 431h646"/>
    ${steps(480, 474, 700, 6)}
    <path class="plant" d="M156 433q-18-30-35-17m683 17q20-34 39-18"/>
  </g>`;
}

function aqueduct() {
  const lower = range(6, (index) => {
    const x = 151 + index * 110;
    return `<path class="stone fill-light" fill-rule="evenodd" d="M${x} 432V223h104v209h-18V309a34 34 0 0 0-68 0v123z"/>
      <path class="stone" d="M${x + 5} 432V309a47 47 0 0 1 94 0v123"/>`;
  });
  const upper = range(12, (index) => {
    const x = 151 + index * 55;
    return `<path class="stone fill-wash" fill-rule="evenodd" d="M${x} 223v-89h49v89h-9v-52a15.5 15.5 0 0 0-31 0v52z"/>`;
  });
  return `<g class="architecture architecture-aqueduct">
    <path class="shade" d="M134 440V106h692v334z"/>
    <path class="stone fill-light" d="M143 432V113h674v319z"/>
    ${lower}${upper}
    <path class="stone fill-wash" d="M132 113h696v-45H132zM147 68l23-28h620l23 28"/>
    <path class="stone" d="M132 113h696M132 84h696M170 40h620M143 223h674"/>
    <path class="channel" d="M153 79q89 14 178 0t178 0t178 0t120 0"/>
    <path class="fine light-line" d="M153 88q89 14 178 0t178 0t178 0t120 0"/>
    ${masonry(143, 113, 674, 21, 2, 16)}
    <path class="stone" d="M151 432l-36 17M811 432l37 17M151 223l-28 17M811 223l28 17"/>
    <path class="plant" d="M140 429q-22-39-42-17m721 17q19-41 43-17"/>
  </g>`;
}

const SIGNATURE_ZONES = Object.freeze({
  spire: { x: 438, y: 145, width: 84, height: 190 },
  arch: { x: 338, y: 91, width: 284, height: 82 },
  rotunda: { x: 353, y: 146, width: 254, height: 76 },
  bridge: { x: 306, y: 216, width: 348, height: 58 },
  tower: { x: 414, y: 132, width: 122, height: 176 },
  arcade: { x: 244, y: 151, width: 472, height: 44 },
  aqueduct: { x: 170, y: 45, width: 620, height: 58 }
});

function architecturalSignature(kind, landmark) {
  const zone = SIGNATURE_ZONES[kind];
  const form = String(landmark.form || kind);
  const variant = hashText(`${form}|${landmark.detailSeed ?? ''}|${landmark.ornament ?? ''}`) % 4;
  const bays = Math.max(3, Math.min(9, Number(landmark.bays) || 5));
  const storeys = Math.max(2, Math.min(7, Number(landmark.storeys) || 4));
  const interval = zone.width / (bays + 1);
  const marks = range(bays, (index) => {
    const x = zone.x + interval * (index + 1);
    const y = zone.y + zone.height * (0.35 + (index % 2) * 0.28);
    if (variant === 0) {
      return `<circle class="ornament-fill" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/><path class="ornament" d="M${(x - 9).toFixed(1)} ${y.toFixed(1)}h18M${x.toFixed(1)} ${(y - 9).toFixed(1)}v18"/>`;
    }
    if (variant === 1) {
      return `<path class="ornament" d="M${(x - 8).toFixed(1)} ${(y + 7).toFixed(1)}l8-14 8 14-8 11z"/>`;
    }
    if (variant === 2) {
      return `<path class="ornament" d="M${(x - 7).toFixed(1)} ${(y - 10).toFixed(1)}l14 20m0-20l-14 20M${x.toFixed(1)} ${(y - 13).toFixed(1)}v26"/>`;
    }
    return `<circle class="ornament" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/><circle class="ornament-fill" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`;
  });
  const finialCount = Math.max(3, Math.min(7, Math.round((storeys + bays) / 2)));
  const finials = range(finialCount, (index) => {
    const x = zone.x + zone.width * ((index + 1) / (finialCount + 1));
    const top = zone.y - 10 - (index % 2) * 5;
    return `<path class="ornament" d="M${x.toFixed(1)} ${(zone.y + 4).toFixed(1)}V${top.toFixed(1)}l-4 6m4-6 4 6"/>`;
  });
  return `<g class="city-signature signature-${variant}" data-architectural-form="${escapeXml(form)}" aria-hidden="true">${marks}${finials}</g>`;
}

const RENDERERS = Object.freeze({ spire, arch, rotunda, bridge, tower, arcade, aqueduct });

/**
 * Render one deterministic, self-contained architectural illustration.
 * Landmark strings are used only in escaped accessible text, never as markup.
 */
export function renderCityLandmarkArt(landmark = {}, seed = '') {
  const kind = LANDMARK_KINDS.has(landmark.kind) ? landmark.kind : 'spire';
  const title = landmark.name || `${kind[0].toUpperCase()}${kind.slice(1)} landmark`;
  const material = landmark.material || 'local stone and reclaimed metal';
  const form = landmark.form || kind;
  const details = Array.isArray(landmark.details) ? landmark.details.join('|') : '';
  const stableSeed = `${seed}|${kind}|${title}|${material}|${form}|${landmark.detailSeed ?? ''}|${details}`;
  const random = randomFrom(stableSeed);
  const palette = INK_PALETTES[Math.floor(random() * INK_PALETTES.length)];
  const uid = `landmark-${hashText(stableSeed).toString(36)}`;
  const textureRotation = -7 + Math.round(random() * 14);
  const textureOffset = 2 + Math.round(random() * 11);

  return `<svg class="city-landmark-art city-landmark-art-${kind}" viewBox="0 0 960 520" role="img" aria-labelledby="${uid}-title ${uid}-description" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <title id="${uid}-title">${escapeXml(title)}</title>
    <desc id="${uid}-description">Detailed architectural line drawing of ${escapeXml(landmark.silhouette || `a ${kind}`)}, built from ${escapeXml(material)}.</desc>
    <defs>
      <linearGradient id="${uid}-sky" x1="0" y1="0" x2="0.75" y2="1"><stop class="ink-stop"/><stop class="deep-stop" offset="1"/></linearGradient>
      <linearGradient id="${uid}-paper" x1="0" y1="0" x2="1" y2="1"><stop class="light-stop"/><stop class="fill-stop" offset="1"/></linearGradient>
      <pattern id="${uid}-hatch" width="17" height="17" patternUnits="userSpaceOnUse" patternTransform="rotate(${textureRotation})"><path class="hatch-line" d="M${textureOffset} 0v17"/></pattern>
    </defs>
    <style>
      .ink-stop{stop-color:var(--landmark-line,${palette.ink})}.deep-stop{stop-color:var(--landmark-fill-deep,${palette.wash})}.light-stop{stop-color:var(--landmark-highlight,${palette.light})}.fill-stop{stop-color:var(--landmark-fill,${palette.paper})}
      .hatch-line{fill:none;stroke:var(--landmark-line,${palette.ink});stroke-width:1;opacity:.12}
      .sky{fill:url(#${uid}-sky)}.horizon-wash{fill:var(--landmark-line,${palette.ink});opacity:.34}.horizon,.cloud,.terrain{stroke:var(--landmark-line-soft,${palette.light});opacity:.35}
      .ground{fill:var(--landmark-line,${palette.ink})}.water{fill:var(--landmark-water,${palette.ink});opacity:.92}.water-line{fill:none;stroke:var(--landmark-line-soft,${palette.light});stroke-width:1.4;opacity:.36}.sky-mark{fill:var(--landmark-highlight,${palette.accent});opacity:.72}
      .architecture{stroke:var(--landmark-line,${palette.ink});stroke-linejoin:round;stroke-linecap:round}.architecture .stone{fill:none;stroke-width:3}.architecture .fine{fill:none;stroke-width:1.2;opacity:.68}.architecture .fill-light{fill:url(#${uid}-paper)}
      .architecture .fill-wash{fill:var(--landmark-fill-deep,${palette.wash})}.architecture .shade{fill:var(--landmark-line,${palette.ink});stroke:none;opacity:.55}.architecture .aperture{fill:var(--landmark-glass,${palette.ink});stroke-width:2.2}
      .architecture .light-line{stroke:var(--landmark-line-soft,${palette.light});opacity:.65}.architecture .medallion{fill:var(--landmark-highlight,${palette.accent});stroke-width:2}.architecture .channel{fill:none;stroke:var(--landmark-water,${palette.accent});stroke-width:8;opacity:.92}
      .architecture .plant{fill:none;stroke:var(--landmark-highlight,${palette.accent});stroke-width:3}
      .city-signature .ornament{fill:none;stroke:var(--landmark-highlight,${palette.accent});stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.city-signature .ornament-fill{fill:var(--landmark-highlight,${palette.accent});stroke:var(--landmark-line,${palette.ink});stroke-width:1.2}
    </style>
    ${landscape(random, kind)}
    ${RENDERERS[kind]()}
    ${architecturalSignature(kind, landmark)}
    <rect width="960" height="520" fill="url(#${uid}-hatch)" pointer-events="none" aria-hidden="true"/>
  </svg>`;
}

export const CITY_LANDMARK_ART_KINDS = Object.freeze([...LANDMARK_KINDS]);
