(() => {
  'use strict';

  const dataNode = document.getElementById('city-explore-data');
  const canvas = document.getElementById('city-explore-map');
  if (!dataNode || !canvas) return;

  const state = JSON.parse(dataNode.textContent);
  const context = canvas.getContext('2d');
  const status = document.getElementById('city-explore-status');
  const stepsNode = document.getElementById('city-explore-steps');
  const noticesNode = document.getElementById('city-explore-notices');
  const locationsNode = document.getElementById('city-explore-locations');
  const scrapsNode = document.getElementById('city-explore-scraps');
  const powerNode = document.getElementById('city-explore-power');
  const locationNode = document.getElementById('city-explore-location');
  const signDialog = document.getElementById('city-sign-dialog');
  const signTitle = document.getElementById('city-sign-title');
  const signText = document.getElementById('city-sign-text');
  const signProgress = document.getElementById('city-sign-progress');
  const encounterDialog = document.getElementById('city-encounter-dialog');
  const encounterTitle = document.getElementById('city-encounter-title');
  const encounterText = document.getElementById('city-encounter-text');
  const encounterOptions = document.getElementById('city-encounter-options');
  const encounterOutcome = document.getElementById('city-encounter-outcome');
  const streetBurst = document.getElementById('city-street-burst');
  const streetBurstShout = document.getElementById('city-street-burst-shout');
  const streetBurstText = document.getElementById('city-street-burst-text');
  const columns = 19;
  const rows = 15;
  const streetBurstDisplayMs = 2600;
  let walking = false;
  let readingSign = false;
  let pendingEncounter = state.pendingEncounter;
  let journeyTarget = pendingEncounter?.destination ?? null;
  let journeyMessages = [];
  let readSigns = new Set(state.progress.readSignKeys);
  let visitedLocations = new Set(state.progress.visitedLocationKeys);
  let collectedScraps = new Set(state.progress.collectedScrapKeys);
  let collectedPowerUps = new Set(state.progress.collectedPowerUpKeys ?? []);
  state.streetActors ??= [];
  state.interior.powerUps ??= [];
  state.powerUntilStep ??= 0;

  const pointAt = (x, y) => state.interior.points.find((point) => point.x === x && point.y === y);
  const signAt = (x, y) => state.interior.signs.find((sign) =>
    sign.x === x && sign.y === y && !readSigns.has(sign.key));
  const scrapAt = (x, y) => state.interior.scraps.find((scrap) =>
    scrap.x === x && scrap.y === y && !collectedScraps.has(scrap.key));
  const powerUpAt = (x, y) => state.interior.powerUps.find((powerUp) =>
    powerUp.x === x && powerUp.y === y && !collectedPowerUps.has(powerUp.key));
  const isWalkable = (x, y) => state.interior.rows[y]?.[x] === '.';
  const key = (x, y) => `${x},${y}`;
  const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  function adoptProgress(progress) {
    state.progress = progress;
    readSigns = new Set(progress.readSignKeys);
    visitedLocations = new Set(progress.visitedLocationKeys);
    collectedScraps = new Set(progress.collectedScrapKeys);
    collectedPowerUps = new Set(progress.collectedPowerUpKeys ?? []);
    noticesNode.textContent = `${progress.signsRead}/${progress.totalSigns}`;
    locationsNode.textContent = `${progress.locationsVisited}/${progress.totalLocations}`;
    scrapsNode.textContent = `${progress.scrapsCollected}/${progress.totalScraps}`;
  }

  function updatePowerStatus() {
    const remaining = Math.max(0, Number(state.powerUntilStep) - Number(state.steps));
    powerNode.textContent = remaining ? `${remaining} steps` : 'Dormant';
    powerNode.closest('div')?.classList.toggle('is-active', remaining > 0);
    canvas.classList.toggle('is-powered', remaining > 0);
    return remaining;
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function setLocation() {
    const point = pointAt(state.position.x, state.position.y);
    const sign = signAt(state.position.x, state.position.y);
    if (point) {
      locationNode.innerHTML = `<p class="eyebrow">${visitedLocations.has(point.key) ? 'Location visited' : 'Destination reached'}</p><h3>${escapeHtml(point.label)}</h3><p>${escapeHtml(point.description)}</p><a class="text-link city-enter-link" href="${encodeURI(point.href)}">Enter ${escapeHtml(point.shortLabel)} →</a>`;
    } else if (sign) {
      locationNode.innerHTML = `<p class="eyebrow">Street notice</p><h3>${escapeHtml(sign.title)}</h3><button class="secondary" type="button" data-read-current-sign>Read sign</button>`;
      locationNode.querySelector('[data-read-current-sign]').addEventListener('click', () => showSign(sign));
    } else {
      locationNode.innerHTML = '<p class="eyebrow">Current position</p><h3>Between the streets</h3><p>Choose a marked destination, notice, or open passage.</p>';
    }
  }

  function escapeHtml(value) {
    const element = document.createElement('span');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function palette() {
    return {
      void: '#080c0a', wall: '#655e50', wallEdge: '#948874', street: '#252c28',
      streetEdge: '#59615b', route: '#b9a85f', player: '#f69a17', playerCore: '#fff7df',
      point: '#102f3a', pointRing: '#65b4c8', sign: '#f3c33b', scrap: '#ffd767',
      scrapGlow: '#f39a18', wallAlt: '#393b34', text: '#f7f0dc',
      ...(state.interior.appearance ?? {})
    };
  }

  function drawStreetCharacter(colours, x, y, tile, worldX, worldY) {
    if (Math.abs(worldX * 17 + worldY * 31) % 13 !== 0) return;
    context.fillStyle = colours.route;
    context.globalAlpha = 0.32;
    if (colours.motif === 'ember') {
      context.fillRect(x + tile * 0.2, y + tile * 0.68, tile * 0.08, tile * 0.05);
      context.fillRect(x + tile * 0.33, y + tile * 0.62, tile * 0.04, tile * 0.04);
    } else if (colours.motif === 'ash') {
      context.beginPath(); context.arc(x + tile * 0.28, y + tile * 0.72, tile * 0.12, 0, Math.PI * 2); context.fill();
    } else if (colours.motif === 'river' || colours.motif === 'lagoon') {
      context.fillRect(x + tile * 0.08, y + tile * 0.82, tile * 0.84, tile * 0.07);
    } else if (colours.motif === 'frost') {
      context.beginPath(); context.moveTo(x + tile * 0.12, y + tile * 0.86); context.lineTo(x + tile * 0.3, y + tile * 0.62); context.lineTo(x + tile * 0.42, y + tile * 0.88); context.fill();
    } else if (colours.motif === 'steam') {
      for (let index = 0; index < 3; index += 1) {
        context.beginPath(); context.arc(x + tile * (0.24 + index * 0.11), y + tile * (0.75 - index * 0.1), tile * 0.05, 0, Math.PI * 2); context.fill();
      }
    } else if (colours.motif === 'sand') {
      context.strokeStyle = colours.route; context.lineWidth = 1;
      context.beginPath(); context.arc(x + tile * 0.45, y + tile * 0.68, tile * 0.22, 0.2, 2.9); context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawStreetMarking(colours, x, y, tile, north, east, south, west) {
    const horizontal = east && west && !north && !south;
    const vertical = north && south && !east && !west;
    if (!horizontal && !vertical && colours.streetMarking !== 'crossings') return;
    context.strokeStyle = colours.route;
    context.fillStyle = colours.route;
    context.lineWidth = 1.4;
    context.setLineDash(colours.streetMarking === 'broken'
      ? [tile * 0.16, tile * 0.12] : []);
    const line = (offset = 0) => {
      context.beginPath();
      if (horizontal) {
        context.moveTo(x, y + tile / 2 + offset);
        context.lineTo(x + tile, y + tile / 2 + offset);
      } else {
        context.moveTo(x + tile / 2 + offset, y);
        context.lineTo(x + tile / 2 + offset, y + tile);
      }
      context.stroke();
    };
    if (colours.streetMarking === 'studs') {
      for (let index = 1; index < 4; index += 1) {
        context.beginPath();
        context.arc(horizontal ? x + tile * index / 4 : x + tile / 2,
          horizontal ? y + tile / 2 : y + tile * index / 4, tile * 0.025, 0, Math.PI * 2);
        context.fill();
      }
    } else if (colours.streetMarking === 'double') {
      line(-tile * 0.045); line(tile * 0.045);
    } else if (colours.streetMarking === 'crossings' && north && east && south && west) {
      for (let index = 0; index < 4; index += 1) {
        context.fillRect(x + tile * (0.13 + index * 0.2), y + tile * 0.12, tile * 0.1, tile * 0.23);
      }
    } else line();
    context.setLineDash([]);
  }

  function drawRoof(colours, x, y, tile, worldX, worldY) {
    context.fillStyle = (worldX + worldY) % 3 === 0 ? colours.wallAlt : colours.wallEdge;
    context.strokeStyle = colours.wallAlt;
    context.lineWidth = 1;
    if (colours.roofPattern === 'courtyard') {
      context.fillRect(x + tile * 0.28, y + tile * 0.28, tile * 0.44, tile * 0.44);
      context.fillStyle = colours.void;
      context.fillRect(x + tile * 0.4, y + tile * 0.4, tile * 0.2, tile * 0.2);
    } else if (colours.roofPattern === 'vents') {
      context.fillRect(x + tile * 0.24, y + tile * 0.34, tile * 0.17, tile * 0.17);
      context.fillRect(x + tile * 0.58, y + tile * 0.49, tile * 0.17, tile * 0.17);
    } else if (colours.roofPattern === 'ridge') {
      context.beginPath(); context.moveTo(x + tile * 0.18, y + tile * 0.72); context.lineTo(x + tile * 0.5, y + tile * 0.2); context.lineTo(x + tile * 0.82, y + tile * 0.72); context.fill();
    } else if (colours.roofPattern === 'lanterns') {
      for (const offset of [0.33, 0.67]) {
        context.beginPath(); context.arc(x + tile * offset, y + tile * 0.5, tile * 0.085, 0, Math.PI * 2); context.fill();
      }
    } else {
      context.fillRect(x + tile * 0.25, y + tile * 0.25, tile * 0.5, tile * 0.5);
      context.beginPath(); context.moveTo(x + tile * 0.5, y + tile * 0.25); context.lineTo(x + tile * 0.5, y + tile * 0.75); context.moveTo(x + tile * 0.25, y + tile * 0.5); context.lineTo(x + tile * 0.75, y + tile * 0.5); context.stroke();
    }
  }

  function drawStreetActor(actor, x, y, tile, colours, powered) {
    context.save();
    context.translate(x + tile / 2, y + tile / 2);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.strokeStyle = colours.void;
    context.lineWidth = Math.max(1.5, tile * 0.055);
    if (powered) {
      context.shadowColor = '#63d8ff';
      context.shadowBlur = tile * 0.35;
    }
    if (actor.kind === 'dead') {
      context.globalAlpha = 0.9;
      context.shadowColor = actor.colour;
      context.shadowBlur = tile * 0.28;
      context.fillStyle = powered ? '#65bde3' : actor.colour;
      context.beginPath();
      context.moveTo(0, -tile * 0.34);
      context.bezierCurveTo(tile * 0.28, -tile * 0.3, tile * 0.3, tile * 0.08, tile * 0.2, tile * 0.3);
      context.lineTo(tile * 0.07, tile * 0.2);
      context.lineTo(0, tile * 0.33);
      context.lineTo(-tile * 0.08, tile * 0.2);
      context.lineTo(-tile * 0.21, tile * 0.3);
      context.bezierCurveTo(-tile * 0.3, tile * 0.06, -tile * 0.27, -tile * 0.3, 0, -tile * 0.34);
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = colours.void;
      for (const eyeX of [-0.09, 0.09]) {
        context.beginPath();
        context.arc(tile * eyeX, -tile * 0.08, tile * 0.035, 0, Math.PI * 2);
        context.fill();
      }
    } else {
      context.shadowColor = powered ? '#63d8ff' : actor.colour;
      context.shadowBlur = actor.state === 'fleeing' ? tile * 0.3 : tile * 0.12;
      context.fillStyle = powered ? '#397fbc' : actor.colour;
      context.beginPath();
      context.moveTo(-tile * 0.34, -tile * 0.08);
      context.lineTo(0, -tile * 0.39);
      context.lineTo(tile * 0.34, -tile * 0.08);
      context.closePath();
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = '#d6aa7d';
      context.beginPath();
      context.arc(0, -tile * 0.02, tile * 0.19, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = powered ? '#397fbc' : actor.colour;
      context.beginPath();
      context.moveTo(-tile * 0.25, tile * 0.06);
      context.lineTo(0, tile * 0.36);
      context.lineTo(tile * 0.25, tile * 0.06);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = colours.void;
      context.beginPath();
      context.arc(-tile * 0.07, -tile * 0.05, tile * 0.025, 0, Math.PI * 2);
      context.arc(tile * 0.07, -tile * 0.05, tile * 0.025, 0, Math.PI * 2);
      context.fill();
      if (actor.state === 'fleeing') {
        context.fillStyle = '#fff5ce';
        context.font = `900 ${Math.floor(tile * 0.28)}px system-ui`;
        context.fillText('!', tile * 0.3, -tile * 0.3);
      }
    }
    context.restore();
  }

  function draw() {
    const colours = palette();
    const powered = updatePowerStatus() > 0;
    const width = canvas.width;
    const height = canvas.height;
    const tile = Math.min(width / columns, height / rows);
    const boardWidth = tile * columns;
    const boardHeight = tile * rows;
    const offsetX = (width - boardWidth) / 2;
    const offsetY = (height - boardHeight) / 2;
    const halfX = Math.floor(columns / 2);
    const halfY = Math.floor(rows / 2);
    context.fillStyle = colours.void;
    context.fillRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (let screenY = 0; screenY < rows; screenY += 1) {
      for (let screenX = 0; screenX < columns; screenX += 1) {
        const worldX = state.position.x + screenX - halfX;
        const worldY = state.position.y + screenY - halfY;
        const x = offsetX + screenX * tile;
        const y = offsetY + screenY * tile;
        const inside = worldX >= 0 && worldX < state.interior.size
          && worldY >= 0 && worldY < state.interior.size;
        if (!inside) {
          context.fillStyle = colours.void;
          context.fillRect(x, y, tile, tile);
        } else if (isWalkable(worldX, worldY)) {
          context.fillStyle = colours.street;
          context.fillRect(x, y, tile, tile);
          const north = isWalkable(worldX, worldY - 1);
          const east = isWalkable(worldX + 1, worldY);
          const south = isWalkable(worldX, worldY + 1);
          const west = isWalkable(worldX - 1, worldY);
          context.strokeStyle = colours.streetEdge;
          context.lineWidth = 2;
          context.setLineDash([]);
          if (!north) {
            context.beginPath(); context.moveTo(x, y + 2); context.lineTo(x + tile, y + 2); context.stroke();
          }
          if (!east) {
            context.beginPath(); context.moveTo(x + tile - 2, y); context.lineTo(x + tile - 2, y + tile); context.stroke();
          }
          if (!south) {
            context.beginPath(); context.moveTo(x, y + tile - 2); context.lineTo(x + tile, y + tile - 2); context.stroke();
          }
          if (!west) {
            context.beginPath(); context.moveTo(x + 2, y); context.lineTo(x + 2, y + tile); context.stroke();
          }
          drawStreetCharacter(colours, x, y, tile, worldX, worldY);
          drawStreetMarking(colours, x, y, tile, north, east, south, west);
        } else {
          context.fillStyle = colours.wall;
          context.fillRect(x + 1, y + 1, tile - 2, tile - 2);
          context.strokeStyle = colours.wallEdge;
          context.lineWidth = 1;
          context.strokeRect(x + 4, y + 4, tile - 8, tile - 8);
          drawRoof(colours, x, y, tile, worldX, worldY);
        }

        const point = pointAt(worldX, worldY);
        const sign = signAt(worldX, worldY);
        const scrap = scrapAt(worldX, worldY);
        const powerUp = powerUpAt(worldX, worldY);
        if (point) {
          context.fillStyle = colours.point;
          context.strokeStyle = colours.pointRing;
          context.lineWidth = 3;
          context.beginPath();
          context.arc(x + tile / 2, y + tile / 2, tile * 0.33, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          context.fillStyle = colours.text;
          context.font = `800 ${Math.floor(tile * 0.34)}px system-ui`;
          context.fillText(point.glyph, x + tile / 2, y + tile / 2 + 1);
        } else if (sign) {
          context.fillStyle = colours.sign;
          context.fillRect(x + tile * 0.27, y + tile * 0.2, tile * 0.46, tile * 0.42);
          context.fillStyle = colours.wall;
          context.fillRect(x + tile * 0.46, y + tile * 0.6, tile * 0.08, tile * 0.25);
          context.fillStyle = colours.wall;
          context.font = `900 ${Math.floor(tile * 0.25)}px system-ui`;
          context.fillText('!', x + tile / 2, y + tile * 0.4);
        } else if (powerUp) {
          context.save();
          context.translate(x + tile / 2, y + tile / 2);
          context.rotate(Math.PI / 4);
          context.shadowColor = '#62d9ff';
          context.shadowBlur = tile * 0.48;
          context.fillStyle = '#fff1a6';
          context.strokeStyle = '#58cfff';
          context.lineWidth = Math.max(2, tile * 0.07);
          context.fillRect(-tile * 0.18, -tile * 0.18, tile * 0.36, tile * 0.36);
          context.strokeRect(-tile * 0.18, -tile * 0.18, tile * 0.36, tile * 0.36);
          context.fillStyle = '#f39a18';
          context.fillRect(-tile * 0.075, -tile * 0.075, tile * 0.15, tile * 0.15);
          context.restore();
        } else if (scrap) {
          context.shadowColor = colours.scrapGlow;
          context.shadowBlur = tile * 0.28;
          context.fillStyle = colours.scrap;
          context.beginPath();
          context.arc(x + tile / 2, y + tile / 2, Math.max(3, tile * 0.085), 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
        }
      }
    }

    for (const actor of state.streetActors) {
      const screenX = actor.x - state.position.x + halfX;
      const screenY = actor.y - state.position.y + halfY;
      if (screenX < 0 || screenX >= columns || screenY < 0 || screenY >= rows) continue;
      drawStreetActor(actor, offsetX + screenX * tile, offsetY + screenY * tile,
        tile, colours, powered);
    }

    const playerX = offsetX + halfX * tile + tile / 2;
    const playerY = offsetY + halfY * tile + tile / 2;
    context.shadowColor = powered ? '#63d8ff' : colours.player;
    context.shadowBlur = 16;
    context.fillStyle = powered ? '#f5d72e' : colours.player;
    context.beginPath();
    if (powered) {
      context.arc(playerX, playerY, tile * 0.34, Math.PI * 0.18, Math.PI * 1.82);
      context.lineTo(playerX, playerY);
      context.closePath();
    } else {
      context.arc(playerX, playerY, tile * 0.31, 0, Math.PI * 2);
    }
    context.fill();
    context.shadowBlur = 0;
    if (!powered) {
      context.fillStyle = colours.playerCore;
      context.beginPath();
      context.arc(playerX, playerY, tile * 0.13, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = colours.void;
      context.beginPath();
      context.arc(playerX + tile * 0.03, playerY - tile * 0.15, tile * 0.035, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = colours.void;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(playerX, playerY - tile * 0.24);
    context.lineTo(playerX, playerY - tile * 0.41);
    context.stroke();
  }

  function canvasCell(event) {
    const rect = canvas.getBoundingClientRect();
    const renderedX = (event.clientX - rect.left) * canvas.width / rect.width;
    const renderedY = (event.clientY - rect.top) * canvas.height / rect.height;
    const tile = Math.min(canvas.width / columns, canvas.height / rows);
    const offsetX = (canvas.width - tile * columns) / 2;
    const offsetY = (canvas.height - tile * rows) / 2;
    const screenX = Math.floor((renderedX - offsetX) / tile);
    const screenY = Math.floor((renderedY - offsetY) / tile);
    if (screenX < 0 || screenX >= columns || screenY < 0 || screenY >= rows) return null;
    return {
      x: state.position.x + screenX - Math.floor(columns / 2),
      y: state.position.y + screenY - Math.floor(rows / 2)
    };
  }

  function pathTo(target) {
    const originKey = key(state.position.x, state.position.y);
    const targetKey = key(target.x, target.y);
    const queue = [{ ...state.position }];
    const previous = new Map([[originKey, null]]);
    for (let index = 0; index < queue.length && !previous.has(targetKey); index += 1) {
      const current = queue[index];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const next = { x: current.x + dx, y: current.y + dy };
        const nextKey = key(next.x, next.y);
        if (!isWalkable(next.x, next.y) || previous.has(nextKey)) continue;
        previous.set(nextKey, current);
        queue.push(next);
      }
    }
    if (!previous.has(targetKey)) return [];
    const path = [];
    let cursor = target;
    while (key(cursor.x, cursor.y) !== originKey) {
      path.push(cursor);
      cursor = previous.get(key(cursor.x, cursor.y));
    }
    return path.reverse();
  }

  async function postJson(path, body) {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin', body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'The city did not accept that move.');
    return result;
  }

  async function showStreetEvents(events) {
    for (const event of events ?? []) {
      streetBurst.className = `city-street-burst is-${event.kind}`;
      streetBurstShout.textContent = event.shout;
      streetBurstText.textContent = event.text;
      streetBurst.hidden = false;
      status.textContent = event.text;
      await delay(Math.max(streetBurstDisplayMs, Number(event.pauseMs ?? 0)));
      streetBurst.hidden = true;
    }
  }

  async function showSign(sign) {
    if (readingSign) return;
    signTitle.textContent = sign.title;
    signText.textContent = sign.text;
    signProgress.textContent = readSigns.has(sign.key) ? 'Previously read.' : 'Recording this notice…';
    openDialog(signDialog);
    readingSign = true;
    try {
      const result = await postJson('/explore/sign', { signKey: sign.key });
      adoptProgress(result.progress);
      const reward = result.rewards[0];
      signProgress.textContent = result.stone
        ? `${result.stone.name} Stone cleared for ${result.stone.cityName}. City record complete.`
        : reward
        ? `City notices complete. Reward: ${reward.label}.`
        : result.firstRead
          ? `Notice recorded · ${result.progress.signsRead}/${result.progress.totalSigns} read.`
          : 'Previously read.';
      status.textContent = result.stone
        ? `City complete — ${result.stone.name} Stone cleared for ${result.stone.cityName}.`
        : reward ? `Notice circuit complete — ${reward.label}.`
        : result.firstRead ? 'Notice added to your city record.' : 'You read the notice again.';
      draw();
      setLocation();
    } catch (error) {
      signProgress.textContent = error.message;
      status.textContent = error.message;
    } finally {
      readingSign = false;
    }
  }

  function showEncounter(encounter) {
    pendingEncounter = encounter;
    if (encounter.destination) journeyTarget = { ...encounter.destination };
    walking = false;
    encounterTitle.textContent = encounter.title;
    encounterText.textContent = encounter.text;
    encounterOutcome.hidden = true;
    encounterOutcome.replaceChildren();
    encounterOptions.replaceChildren(...encounter.options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.addEventListener('click', () => resolveEncounter(encounter, option.id));
      return button;
    }));
    status.textContent = 'An encounter has interrupted your walk.';
    openDialog(encounterDialog);
  }

  async function resolveEncounter(encounter, choiceId) {
    const buttons = [...encounterOptions.querySelectorAll('button')];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const result = await postJson('/explore/encounter', {
        encounterId: encounter.id, choiceId
      });
      pendingEncounter = null;
      encounterOptions.replaceChildren();
      const text = document.createElement('p');
      text.textContent = result.outcome.text;
      encounterOutcome.replaceChildren(text);
      if (result.outcome.reward) {
        const reward = document.createElement('strong');
        reward.textContent = `Reward: ${result.outcome.reward.label}`;
        encounterOutcome.append(reward);
      }
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Continue walking';
      close.addEventListener('click', () => {
        closeDialog(encounterDialog);
        resumeJourney();
      });
      encounterOutcome.append(close);
      encounterOutcome.hidden = false;
      status.textContent = 'Encounter resolved. The streets are open again.';
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; });
      status.textContent = error.message;
    }
  }

  function resumeJourney() {
    if (!journeyTarget || pendingEncounter || walking) return;
    const destination = { ...journeyTarget };
    window.setTimeout(() => walkTo(destination, true), 0);
  }

  async function walkTo(target, continuing = false) {
    if (walking || pendingEncounter || !isWalkable(target.x, target.y)) return;
    if (!continuing) {
      journeyTarget = { x: target.x, y: target.y };
      journeyMessages = [];
    }
    const path = pathTo(target);
    if (!path.length) {
      if (target.x === state.position.x && target.y === state.position.y) {
        const sign = signAt(target.x, target.y);
        if (sign) showSign(sign);
        setLocation();
      }
      journeyTarget = null;
      return;
    }
    walking = true;
    status.textContent = `Walking ${path.length} ${path.length === 1 ? 'step' : 'steps'}…`;
    try {
      for (const step of path) {
        const result = await postJson('/explore/move', {
          ...step, destinationX: journeyTarget.x, destinationY: journeyTarget.y
        });
        state.position = result.position;
        state.steps = result.steps;
        state.powerUntilStep = result.powerUntilStep ?? state.powerUntilStep;
        state.streetActors = result.streetActors ?? state.streetActors;
        adoptProgress(result.progress);
        if (result.pickup) journeyMessages.push(`Picked up ${result.pickup.label}.`);
        if (result.powerUp) journeyMessages.push(
          `${result.powerUp.label} charged you for ${result.powerUp.durationSteps} steps.`
        );
        if (result.visitedLocation) {
          journeyMessages.push(`First visit: ${result.visitedLocation.label}.`);
        }
        for (const reward of result.rewards) journeyMessages.push(`Reward: ${reward.label}.`);
        stepsNode.textContent = Number(state.steps).toLocaleString('en-GB');
        draw();
        setLocation();
        if (result.streetEvents?.length) {
          for (const event of result.streetEvents) journeyMessages.push(event.text);
          await showStreetEvents(result.streetEvents);
        }
        if (result.pendingEncounter) {
          showEncounter(result.pendingEncounter);
          return;
        }
        await delay(58);
      }
      status.textContent = journeyMessages.length ? journeyMessages.join(' ') : 'Destination reached.';
      const sign = signAt(state.position.x, state.position.y);
      if (sign) showSign(sign);
      journeyTarget = null;
      journeyMessages = [];
    } catch (error) {
      status.textContent = error.message;
      journeyTarget = null;
    } finally {
      walking = false;
    }
  }

  canvas.addEventListener('click', (event) => {
    const target = canvasCell(event);
    if (target) walkTo(target);
  });
  canvas.addEventListener('pointermove', (event) => {
    const target = canvasCell(event);
    canvas.style.cursor = target && isWalkable(target.x, target.y) ? 'pointer' : 'not-allowed';
  });
  encounterDialog.addEventListener('cancel', (event) => {
    if (pendingEncounter) event.preventDefault();
  });
  encounterDialog.addEventListener('close', resumeJourney);
  window.addEventListener('resize', draw);

  draw();
  setLocation();
  if (pendingEncounter) showEncounter(pendingEncounter);
})();
