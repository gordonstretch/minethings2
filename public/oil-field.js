(() => {
  'use strict';

  const initialize = () => {
  document.getElementById('oil-hex-summary')?.remove();

  const stateElement = document.getElementById('oil-field-state');
  const statusElement = document.getElementById('oil-board-status');
  if (!stateElement || typeof window.OilVectorRenderer !== 'function'
    || typeof window.drawboard !== 'function') return;

  const state = JSON.parse(stateElement.value);
  const status = (message) => {
    if (statusElement) statusElement.textContent = message;
  };
  const submit = (action, values) => {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = action;
    for (const [name, value] of Object.entries(values)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value);
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  };

  let animationPreference = true;
  try {
    animationPreference = localStorage.getItem('oil-field-animation') !== 'off';
  } catch {}
  Object.assign(window, state, {
    hexDiameter: 30,
    cartVector: [0.86602540378, 0.5],
    popup: null,
    animate: animationPreference,
    boardMachines: [],
    boardHexes: [],
    queuedMachines: [],
    showQueued: false,
    teamFill: true,
    timeOffset: state.generatedAt / 1000 - Date.now() / 1000
  });
  window.mouseover = function () {
    if (window.popup) window.popup.remove();
    window.popup = null;
  };
  window.dialog = new window.Dialog();

  const directions = state.directionNames;
  const rarityNames = state.rarityNames;
  const packingMachineTypeIds = new Set(state.packingMachineTypeIds.map(Number));
  const bombMachineTypeIds = new Set(state.bombMachineTypeIds.map(Number));
  const pipeMachineTypeIds = new Set(state.pipeMachineTypeIds.map(Number));
  const requiredLookup = (values, key, label) => {
    const value = values[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing Oil Field ${label}: ${key}.`);
    }
    return value;
  };
  const number = (value, digits = 1) => Number(value).toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const duration = (seconds) => {
    const remaining = Math.max(0, Math.floor(Number(seconds)));
    if (!remaining) return 'Expired';
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes || (!days && !hours) ? `${minutes}m` : '']
      .filter(Boolean).join(' ');
  };
  const liveValue = (initial, rate, updatedAt, at) => Math.max(0,
    Number(initial) + Number(rate) * (at - Number(updatedAt)));

  const hexSummaryDialog = document.createElement('dialog');
  hexSummaryDialog.id = 'oil-hex-summary';
  hexSummaryDialog.className = 'oil-hex-summary';
  hexSummaryDialog.setAttribute('aria-labelledby', 'oil-hex-summary-title');
  hexSummaryDialog.innerHTML = `<header class="oil-hex-summary-header"><div><p class="eyebrow">Oil Field hex</p><h2 id="oil-hex-summary-title">Hex summary</h2></div><button type="button" class="oil-hex-summary-close" aria-label="Close hex summary"><span aria-hidden="true">×</span> Close</button></header><div id="oil-hex-summary-content" class="oil-hex-summary-content"></div>`;
  document.body.appendChild(hexSummaryDialog);
  const hexSummaryTitle = document.getElementById('oil-hex-summary-title');
  const hexSummaryContent = document.getElementById('oil-hex-summary-content');
  const hexSummaryClose = hexSummaryDialog.querySelector('.oil-hex-summary-close');
  let activeSummaryHex = null;

  const addSummarySection = (title, rows) => {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    const list = document.createElement('dl');
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      row.append(term, detail);
      list.appendChild(row);
    }
    section.appendChild(list);
    hexSummaryContent.appendChild(section);
    return section;
  };

  const addSummaryItemCard = (machine, metadata = []) => {
    if (!machine?.Item?.id) return null;
    const article = document.createElement('article');
    article.className = `item item-card item-card-compact rarity-${machine.Item.rarity}`;
    article.dataset.itemId = String(machine.Item.id);
    article.dataset.rarity = String(machine.Item.rarity);
    const link = document.createElement('a');
    link.className = 'item-card-link';
    link.href = `/items/${machine.Item.id}`;
    link.setAttribute('aria-label', `View ${machine.Item.name} details`);
    const art = document.createElement('span');
    art.className = 'item-card-art';
    const image = document.createElement('img');
    image.src = machine.Item.icon;
    image.alt = machine.Item.name;
    art.appendChild(image);
    const copy = document.createElement('span');
    copy.className = 'item-card-copy';
    const name = document.createElement('strong');
    name.textContent = machine.Item.name;
    const meta = document.createElement('small');
    meta.textContent = [requiredLookup(rarityNames, Number(machine.Item.rarity), 'rarity name'),
      ...metadata].join(' · ');
    copy.append(name, meta);
    link.append(art, copy);
    article.appendChild(link);
    hexSummaryContent.appendChild(article);
    return article;
  };

  const showHexSummary = (hexPath) => {
    const hex = hexPath.data('hex');
    const at = Date.now() / 1000 + window.timeOffset;
    activeSummaryHex = hexPath;
    hexSummaryTitle.textContent = `Hex (${hex.Hex.x},${hex.Hex.y})`;
    hexSummaryContent.replaceChildren();

    const buildTier = Number(hex.Hex.available);
    const availability = buildTier === Number(state.oilBuildTiers.helicopter)
      ? `Buildable — ${state.labels.helicopter} required`
      : buildTier === Number(state.oilBuildTiers.local) ? 'Buildable' : 'Unavailable';
    addSummarySection('Position', [
      ['Coordinates', `${hex.Hex.x}, ${hex.Hex.y}`],
      ['Access', availability]
    ]);

    const placed = hex.HexesMachine;
    let placedType = null;
    let placedCanPack = false;
    if (placed) {
      const machine = state.machines[placed.machine_id];
      const machineTypeId = Number(machine.Machine.machine_type_id);
      placedCanPack = packingMachineTypeIds.has(machineTypeId);
      placedType = requiredLookup(state.machineTypes, machineTypeId, 'machine type name');
      const owner = placed.miner_id === state.minerId ? 'You'
        : requiredLookup(state.miners, placed.miner_id, 'miner name');
      const life = liveValue(placed.life, placed.life_rate, placed.life_update_time, at);
      const machineRows = [
        ['Function', placedType],
        ['Facing', requiredLookup(directions, Number(placed.point), 'direction name')],
        ['Power', `${number(placed.power)} kW`],
        ['Life remaining', `${duration(life)} · ${number(placed.life_rate, 2)} s/s`]
      ];
      if (pipeMachineTypeIds.has(machineTypeId)) {
        machineRows.push(['Pipe flow', `${number(Number(placed.animation_rate) / window.unitsPerLiter * 3600)} L/h`]);
      }
      addSummaryItemCard(machine, ['Deployed', owner]);
      addSummarySection('Machine operation', machineRows);
    } else {
      addSummarySection('Machine', [['Status', 'Empty hex']]);
    }

    if (hex.Oil) {
      const oilUnits = liveValue(hex.Oil.oil, hex.Oil.oil_rate, hex.Oil.oil_update_time, at);
      const oilLiters = oilUnits / window.unitsPerLiter;
      const oilRate = Number(hex.Oil.oil_rate) / window.unitsPerLiter * 3600;
      const oilRows = [
        ['Available oil', `${number(oilLiters, 2)} L`],
        ['Net flow', `${number(oilRate)} L/h`],
        ['Completed barrels', String(hex.Oil.barrels)]
      ];
      if (placedCanPack) {
        const packedUnits = liveValue(hex.Oil.barrel_oil, hex.Oil.barrel_oil_rate,
          hex.Oil.barrel_oil_update_time, at);
        oilRows.push(
          ['Current barrel', `${number(Math.min(window.unitsPerBarrel / window.unitsPerLiter,
            packedUnits / window.unitsPerLiter), 2)} / ${number(
            window.unitsPerBarrel / window.unitsPerLiter, 2)} L`],
          ['Packing rate', `${number(Number(hex.Oil.barrel_oil_rate) / window.unitsPerLiter * 3600)} L/h`]
        );
      }
      addSummarySection(`${state.labels.oil} on hex`, oilRows);
    } else {
      addSummarySection(`${state.labels.oil} on hex`, [[
        'Visibility', `Hidden — a ${state.labels.searchPlane} is required to reveal another miner’s oil.`
      ]]);
    }

    if (hex.QueuedMachine) {
      const queued = hex.QueuedMachine;
      const machine = state.machines[queued.machine_id];
      const queuedMachineTypeId = Number(machine.Machine.machine_type_id);
      const queuedType = requiredLookup(state.machineTypes, queuedMachineTypeId, 'machine type name');
      const queuedOwner = queued.miner_id === state.minerId ? 'You'
        : requiredLookup(state.miners, queued.miner_id, 'miner name');
      addSummaryItemCard(machine, ['Queued replacement',
        queuedOwner]);
      addSummarySection('Queued operation', [
        ['Function', queuedType],
        ['Owner', queuedOwner],
        ['Facing', requiredLookup(directions, Number(queued.point), 'direction name')]
      ]);
    }

    const completedBarrels = Number(hex.Oil?.barrels ?? 0);
    if (placed && placed.miner_id === state.minerId
      && (placedCanPack || completedBarrels > 0)) {
      const actions = document.createElement('section');
      actions.className = 'oil-hex-summary-actions';
      const heading = document.createElement('h3');
      heading.textContent = 'Actions';
      actions.appendChild(heading);
      if (placedCanPack) {
        const claimOne = document.createElement('button');
        claimOne.type = 'button';
        claimOne.disabled = completedBarrels < 1;
        claimOne.textContent = claimOne.disabled ? 'No completed barrel to claim'
          : `Claim one ${state.labels.oil} barrel`;
        claimOne.addEventListener('click', () => submit(`/oil-field/${hex.Hex.id}/claim`, { quantity: 'one' }));
        actions.appendChild(claimOne);
        const claimAll = document.createElement('button');
        claimAll.type = 'button';
        claimAll.className = 'secondary';
        claimAll.disabled = completedBarrels < 1;
        claimAll.textContent = completedBarrels < 1
          ? 'No completed barrels to claim'
          : `Claim all ${completedBarrels} ${state.labels.oil} ${completedBarrels === 1 ? 'barrel' : 'barrels'}`;
        claimAll.addEventListener('click', () => submit(`/oil-field/${hex.Hex.id}/claim`, { quantity: 'all' }));
        actions.appendChild(claimAll);
      } else {
        const recovery = document.createElement('p');
        recovery.className = 'capacity-warning';
        const placedTypeLabel = String(placedType).replace(/^./u,
          (firstCharacter) => firstCharacter.toLocaleUpperCase('en-GB'));
        recovery.textContent = `${completedBarrels} completed ${completedBarrels === 1 ? 'barrel is' : 'barrels are'} stored on this hex, but ${placedTypeLabel} cannot release ${state.labels.oil}. Replace it on this hex with ${state.labels.packers.join(', ')}; the barrels will remain here and can then be claimed.`;
        actions.appendChild(recovery);
      }
      hexSummaryContent.appendChild(actions);
    }

    if (!hexSummaryDialog.open) hexSummaryDialog.showModal();
    status(`Viewing summary for hex (${hex.Hex.x},${hex.Hex.y}).`);
  };

  hexSummaryClose.addEventListener('click', () => hexSummaryDialog.close());
  hexSummaryDialog.addEventListener('click', (event) => {
    if (event.target === hexSummaryDialog) hexSummaryDialog.close();
  });
  hexSummaryDialog.addEventListener('close', () => {
    status('Hex summary closed.');
    activeSummaryHex?.node.focus();
    activeSummaryHex = null;
  });

  const rackMachines = [];
  const originalCreateMachine = window.CreateMachine;
  window.CreateMachine = function (...args) {
    const machine = originalCreateMachine.apply(this, args);
    if (machine && !args[3]) rackMachines.push(machine);
    return machine;
  };

  const originalClick = window.Machine.prototype.onclick;
  window.Machine.prototype.onclick = function (event) {
    if (this.draggedUntil && Date.now() < this.draggedUntil) return;
    if (hexSummaryDialog.open) hexSummaryDialog.close();
    originalClick.call(this, event);
  };

  let dragCandidate = null;
  const restoreCandidate = () => {
    if (!dragCandidate) return;
    dragCandidate.attr({
      stroke: window.dialog.machine
        ? dragCandidate.data('availableStroke') : dragCandidate.data('oilStroke'),
      'stroke-width': 3
    });
    dragCandidate = null;
  };
  const nearestHex = (position) => {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const hexPath of window.boardHexes) {
      const hex = hexPath.data('hex');
      const center = window.Hex2Cart(hex.Hex.x, hex.Hex.y);
      const distance = Math.hypot(position[0] - center[0], position[1] - center[1]);
      if (distance < nearestDistance) {
        nearest = hexPath;
        nearestDistance = distance;
      }
    }
    return nearestDistance <= 18 ? nearest : null;
  };
  const setRackMachineClass = (machine, className, active) => {
    machine.set.forEach((element) => element.node.classList.toggle(className, active));
  };
  let hideRackTooltip = () => {};

  const originalAddHandle = window.Machine.prototype.AddHandle;
  window.Machine.prototype.AddHandle = function (...args) {
    originalAddHandle.apply(this, args);
    const machine = this;
    let origin = machine.startingPos.slice();
    machine.set.attr({ cursor: 'grab' });
    machine.set.drag(function (dx, dy) {
      machine.setCenter([origin[0] + dx, origin[1] + dy]);
      const candidate = nearestHex(machine.pos);
      if (candidate !== dragCandidate) {
        restoreCandidate();
        dragCandidate = candidate;
        if (dragCandidate) dragCandidate.attr({ stroke: '#ffda31', 'stroke-width': 5 });
      }
    }, function () {
      origin = machine.startingPos.slice();
      window.dialog.SetMachine(machine);
      machine.set.attr({ cursor: 'grabbing' });
      hideRackTooltip(machine);
      setRackMachineClass(machine, 'is-dragging', true);
      status(`Dragging ${machine.machine.MachineType.name}. Drop it on a hex.`);
    }, function () {
      const destination = dragCandidate;
      restoreCandidate();
      machine.set.attr({ cursor: 'grab' });
      setRackMachineClass(machine, 'is-dragging', false);
      machine.draggedUntil = Date.now() + 250;
      if (!destination) {
        window.dialog.Dismiss();
        status('Drop cancelled. Drag a machine onto a hex, or click it to use the original placement flow.');
        return;
      }
      window.dialog.SetHex(destination);
      const hex = destination.data('hex');
      status(`Selected hex (${hex.Hex.x},${hex.Hex.y}). Rotate if needed, then choose Deploy or Queue on the board.`);
    });
  };

  const originalSetHex = window.Dialog.prototype.SetHex;
  window.Dialog.prototype.SetHex = function (hexPath) {
    originalSetHex.call(this, hexPath);
    const machineTypeId = Number(this.machine.machine.Machine.machine_type_id);
    if (bombMachineTypeIds.has(machineTypeId)) {
      this.queue.hide();
      this.queuereplace.hide();
      if (this.deploy[1]) this.deploy[1].attr({ text: 'Bomb' });
    }
  };

  window.Dialog.prototype.Deploy = function (queue) {
    if (this.processing || !this.machine || !this.hexPath) return;
    const hex = this.hexPath.data('hex');
    const machineId = this.machine.machine.Machine.id;
    const machineTypeId = Number(this.machine.machine.Machine.machine_type_id);
    if (bombMachineTypeIds.has(machineTypeId)) {
      if (queue) {
        status('Bombs cannot be queued.');
        return;
      }
      if (!state.hasBomber) {
        status(`A ${state.labels.bomber} is required in the Oil Field city.`);
        return;
      }
      this.processing = true;
      submit('/oil-field/bomb', { hexId: hex.Hex.id, machineId });
      return;
    }
    this.processing = true;
    submit(queue ? '/oil-field/queue' : '/oil-field/deploy', {
      hexId: hex.Hex.id,
      machineId,
      point: this.machine.point
    });
  };

  window.hexClick = function () {
    const hex = this.data('hex');
    if (window.dialog.machine) {
      window.dialog.SetHex(this);
      status(`Selected hex (${hex.Hex.x},${hex.Hex.y}). Rotate if needed, then choose Deploy or Queue.`);
      return;
    }
    showHexSummary(this);
  };

  window.drawboard();
  const boardElement = document.getElementById('board');
  if (boardElement) boardElement.dataset.renderer = window.oilRendererMode;

  let visibleOilHexes = 0;
  const oilOverlays = [];
  const bringOilOverlaysToFront = () => {
    for (const overlay of oilOverlays) overlay.toFront();
  };
  const boardTime = Date.now() / 1000 + window.timeOffset;
  for (const hexPath of window.boardHexes) {
    const hex = hexPath.data('hex');
    if (!hex.Oil) continue;
    const oilUnits = Math.max(0, Number(hex.Oil.oil)
      + Number(hex.Oil.oil_rate) * (boardTime - Number(hex.Oil.oil_update_time)));
    const liters = oilUnits / window.unitsPerLiter;
    if (liters <= 0.001) continue;
    visibleOilHexes += 1;
    const center = window.Hex2Cart(hex.Hex.x, hex.Hex.y);
    const radius = 5.5 + Math.min(7.5, Math.log10(1 + liters) * 3.2);
    const oilLabel = `${liters < 10 ? liters.toFixed(2) : liters < 100 ? liters.toFixed(1) : Math.round(liters)}L`;
    const badgeWidth = Math.max(29, oilLabel.length * 5.2 + 5);
    const halo = window.paper.circle(center[0], center[1], 12.6)
      .attr({ fill: '#f0a52b', 'fill-opacity': 0.12, stroke: '#ffc34d',
        'stroke-width': 2.4, 'stroke-opacity': 0.98 });
    const slick = window.paper.ellipse(center[0], center[1] + 6.5, radius, Math.max(2.8, radius * 0.44))
      .attr({ fill: '#080906', stroke: '#ffc34d', 'stroke-width': 1.8, 'fill-opacity': 0.94 });
    const badge = window.paper.rect(center[0] - badgeWidth / 2, center[1] + 4, badgeWidth, 12, 2.5)
      .attr({ fill: '#eea12b', stroke: '#ffe2a0', 'stroke-width': 1, 'fill-opacity': 0.98 });
    const label = window.paper.text(center[0], center[1] + 10, oilLabel)
      .attr({ fill: '#17120b', 'font-size': 8.5, 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' });
    halo.node.classList.add('oil-volume-halo');
    slick.node.classList.add('oil-slick');
    badge.node.classList.add('oil-volume-badge');
    label.node.classList.add('oil-volume-label');
    for (const overlay of [halo, slick, badge, label]) {
      overlay.node.dataset.hexId = String(hex.Hex.id);
      overlay.node.dataset.oilLiters = liters.toFixed(3);
      overlay.node.style.pointerEvents = 'none';
      oilOverlays.push(overlay);
    }
    hexPath.data('oilStroke', '#e8aa3a');
    hexPath.attr({ stroke: '#e8aa3a' });
  }
  bringOilOverlaysToFront();

  for (const hexPath of window.boardHexes) {
    const hex = hexPath.data('hex');
    hexPath.node.classList.add('oil-hex-shape');
    hexPath.node.dataset.hexId = String(hex.Hex.id);
    hexPath.node.dataset.hexX = String(hex.Hex.x);
    hexPath.node.dataset.hexY = String(hex.Hex.y);
    hexPath.node.setAttribute('tabindex', '0');
    hexPath.node.setAttribute('role', 'button');
    const oilLabel = hex.Oil ? Math.max(0, Number(hex.Oil.oil)
      + Number(hex.Oil.oil_rate) * (boardTime - Number(hex.Oil.oil_update_time))) / window.unitsPerLiter : null;
    hexPath.node.setAttribute('aria-label', `Oil Field hex ${hex.Hex.x}, ${hex.Hex.y}${oilLabel === null ? ', oil hidden' : `, ${oilLabel.toFixed(2)} litres oil`}`);
    hexPath.node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      window.hexClick.call(hexPath);
    });
  }
  const decorateDeployedMachines = () => {
    for (const machine of window.boardMachines) {
      machine.set.forEach((element) => {
        element.node.classList.add('oil-machine-shape');
        element.node.style.pointerEvents = 'none';
      });
    }
  };
  decorateDeployedMachines();
  window.__mineThingsOilBaseToggleAnimation ??= window.ToggleAnimation;
  const originalToggleAnimation = window.__mineThingsOilBaseToggleAnimation;
  window.ToggleAnimation = function () {
    originalToggleAnimation();
    decorateDeployedMachines();
    bringOilOverlaysToFront();
  };
  const rackTooltip = document.createElement('aside');
  rackTooltip.id = 'oil-machine-tooltip';
  rackTooltip.className = 'oil-machine-tooltip';
  rackTooltip.setAttribute('role', 'tooltip');
  rackTooltip.hidden = true;
  rackTooltip.innerHTML = '<p class="eyebrow">Machine briefing</p><strong></strong><p></p><small></small><small>Drag to a highlighted hex, or press Enter to select.</small>';
  boardElement?.appendChild(rackTooltip);
  const rackTooltipName = rackTooltip.querySelector('strong');
  const rackTooltipDescription = rackTooltip.querySelector('p:not(.eyebrow)');
  const rackTooltipMeta = rackTooltip.querySelector('small');
  let activeRackMachine = null;
  let focusedRackMachine = null;
  hideRackTooltip = (machine = activeRackMachine) => {
    if (machine) setRackMachineClass(machine, 'is-previewing', false);
    if (!machine || activeRackMachine === machine) {
      activeRackMachine = null;
      rackTooltip.hidden = true;
    }
  };
  const showRackTooltip = (machine) => {
    if (activeRackMachine && activeRackMachine !== machine) {
      setRackMachineClass(activeRackMachine, 'is-previewing', false);
    }
    activeRackMachine = machine;
    setRackMachineClass(machine, 'is-previewing', true);
    const item = machine.machine.Item;
    const machineType = machine.machine.MachineType;
    const description = String(item.description || '').trim()
      || 'No item description has been recorded in the catalog.';
    const rarity = requiredLookup(rarityNames, Number(item.rarity), 'rarity name');
    const power = Number(machineType.power).toLocaleString('en-GB', { maximumFractionDigits: 2 });
    const lifeDays = Number(machineType.lifeDays).toLocaleString('en-GB', { maximumFractionDigits: 2 });
    const quantity = Number(machine.machine.count);
    rackTooltipName.textContent = item.name;
    rackTooltipDescription.textContent = description;
    rackTooltipMeta.textContent = `${rarity} \u00b7 P = ${power} \u00b7 ${lifeDays} day service life \u00b7 ${quantity} ready`;
    rackTooltip.dataset.machineType = machineType.name;
    const [x, y] = machine.startingPos;
    const tooltipWidth = 300;
    const boardWidth = boardElement?.clientWidth || 1000;
    let left;
    let top;
    if (machine.rackZone === 'left') {
      left = 112;
      top = Math.max(24, Math.min(748, y - 58));
    } else if (machine.rackZone === 'right') {
      left = boardWidth - tooltipWidth - 112;
      top = Math.max(24, Math.min(748, y - 58));
    } else {
      left = Math.max(12, Math.min(boardWidth - tooltipWidth - 12, x - tooltipWidth / 2));
      top = Math.min(748, y + 30);
    }
    rackTooltip.style.left = `${left}px`;
    rackTooltip.style.top = `${top}px`;
    rackTooltip.hidden = false;
  };
  for (const machine of rackMachines) {
    machine.set.forEach((element) => {
      element.node.classList.add('oil-rack-machine');
      element.node.dataset.rackZone = machine.rackZone ?? 'top';
    });
    if (machine.circle) {
      machine.circle.node.setAttribute('tabindex', '0');
      machine.circle.node.setAttribute('role', 'button');
      const description = String(machine.machine.Item.description || '').trim()
        || 'No item description has been recorded in the catalog.';
      machine.circle.node.setAttribute('aria-label', `Select ${machine.machine.Item.name}. ${description}`);
      machine.circle.node.setAttribute('aria-describedby', rackTooltip.id);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${machine.machine.Item.name}. ${description}`;
      machine.circle.node.prepend(title);
      machine.circle.node.addEventListener('mouseenter', () => showRackTooltip(machine));
      machine.circle.node.addEventListener('mouseleave', () => {
        if (focusedRackMachine !== machine) hideRackTooltip(machine);
      });
      machine.circle.node.addEventListener('focus', () => {
        focusedRackMachine = machine;
        showRackTooltip(machine);
      });
      machine.circle.node.addEventListener('blur', () => {
        focusedRackMachine = null;
        hideRackTooltip(machine);
      });
      machine.circle.node.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        machine.onclick(event);
      });
    }
  }
  if (window.barrels) window.barrels.forEach((barrel) => { barrel.node.style.pointerEvents = 'none'; });
  if (!window.animate) boardElement?.classList.add('oil-animations-paused');

  const queuedButton = document.getElementById('oil-toggle-queued');
  const animationButton = document.getElementById('oil-toggle-animation');
  const colorButton = document.getElementById('oil-toggle-colors');
  const volumeLabelsButton = document.getElementById('oil-toggle-volume-labels');
  const rendererButton = document.getElementById('oil-toggle-renderer');
  queuedButton?.addEventListener('click', () => {
    window.ToggleQueued();
    queuedButton.textContent = window.showQueued ? 'Show deployed' : 'Show queued';
    status(window.showQueued ? 'Showing queued replacement machines.' : 'Showing deployed machines.');
  });
  animationButton?.addEventListener('click', () => {
    window.ToggleAnimation();
    animationButton.textContent = window.animate ? 'Pause animation' : 'Play animation';
    boardElement?.classList.toggle('oil-animations-paused', !window.animate);
    try { localStorage.setItem('oil-field-animation', window.animate ? 'on' : 'off'); } catch {}
    status(window.animate ? 'Oil and projectile animations are playing.' : 'Animations are paused.');
  });
  colorButton?.addEventListener('click', () => {
    window.ToggleBoardColors();
    colorButton.textContent = window.teamFill ? 'Rarity colours' : 'Ownership colours';
    status(window.teamFill ? 'Hexes are coloured by ownership and availability.' : 'Occupied hexes are coloured by machine rarity.');
  });
  let volumeLabelsHidden = false;
  try {
    volumeLabelsHidden = localStorage.getItem('oil-field-volume-labels') === 'hidden';
  } catch {}
  const renderVolumeLabelPreference = () => {
    boardElement?.classList.toggle('oil-volume-labels-hidden', volumeLabelsHidden);
    if (!volumeLabelsButton) return;
    volumeLabelsButton.textContent = volumeLabelsHidden
      ? 'Show oil volume labels' : 'Hide oil volume labels';
    volumeLabelsButton.setAttribute('aria-pressed', volumeLabelsHidden ? 'true' : 'false');
  };
  volumeLabelsButton?.addEventListener('click', () => {
    volumeLabelsHidden = !volumeLabelsHidden;
    renderVolumeLabelPreference();
    try {
      localStorage.setItem('oil-field-volume-labels', volumeLabelsHidden ? 'hidden' : 'shown');
    } catch {}
    status(volumeLabelsHidden ? 'Oil volume labels hidden.' : 'Oil volume labels shown.');
  });
  const rendererLabel = window.oilRendererMode === 'svgjs' ? 'SVG.js' : 'Raphael';
  if (rendererButton) {
    rendererButton.textContent = `Renderer: ${rendererLabel}`;
    rendererButton.title = `Switch to the ${window.oilRendererMode === 'svgjs' ? 'Raphael' : 'SVG.js'} renderer`;
    rendererButton.addEventListener('click', () => {
      const nextRenderer = window.oilRendererMode === 'svgjs' ? 'raphael' : 'svgjs';
      try { localStorage.setItem('oil-field-renderer', nextRenderer); } catch {}
      rendererButton.disabled = true;
      rendererButton.textContent = `Loading ${nextRenderer === 'svgjs' ? 'SVG.js' : 'Raphael'}…`;
      window.location.reload();
    });
  }
  renderVolumeLabelPreference();
  if (animationButton) animationButton.textContent = window.animate ? 'Pause animation' : 'Play animation';
  status(`Oil Field ready with ${rendererLabel}: ${window.boardHexes.length} hexes, ${visibleOilHexes} containing visible oil, ${window.boardMachines.length} deployed machines, ${rackMachines.length} machine parts in the rack.`);
  };
  initialize();
})();
