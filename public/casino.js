(() => {
  const form = document.querySelector('#casino-spin-form');
  const machine = document.querySelector('#casino-machine');
  const currency = document.querySelector('#casino-currency');
  const wager = document.querySelector('#casino-wager');
  const balance = document.querySelector('#casino-balance');
  const pull = document.querySelector('#casino-pull');
  const result = document.querySelector('.casino-result');
  const replayStatus = document.querySelector('#casino-replay-status');
  if (!form || !machine || !currency || !wager || !balance || !pull) return;

  const machineKey = /^[a-z][a-z0-9-]{1,30}$/.test(machine.dataset.casinoMachine ?? '')
    ? machine.dataset.casinoMachine : 'thing-o-matic';
  const pullLabel = pull.querySelector('span');
  const readyPullLabels = {
    'thing-o-matic': 'Pull the lever',
    'bromo-sporefall': 'Start the drop',
    'kings-lockbox': 'Open the lockbox',
    'cinderwake-fuse-five': 'Light the fuse',
    'ashfall-spore-ring': 'Turn the ring',
    'stormcrag-timber-twins': 'Drop the timbers',
    'emberdeep-three-verses': 'Compose a verse',
    'frostmere-aurora-mirror': 'Charge the aurora',
    'brimstone-furnace-four': 'Fire the furnace',
    'tzolkin-worldwheel-seven': 'Turn the worldwheel'
  };
  const submittingLabels = {
    'thing-o-matic': 'Reels turning',
    'bromo-sporefall': 'Spores falling',
    'kings-lockbox': 'Tumblers turning',
    'cinderwake-fuse-five': 'Fuse burning',
    'ashfall-spore-ring': 'Ring turning',
    'stormcrag-timber-twins': 'Timbers falling',
    'emberdeep-three-verses': 'Ink moving',
    'frostmere-aurora-mirror': 'Aurora charging',
    'brimstone-furnace-four': 'Furnace firing',
    'tzolkin-worldwheel-seven': 'World turning'
  };
  const DEFAULT_FRAME_HOLD_MS = 3000;
  const MAXIMUM_FRAME_HOLD_MS = 5000;

  const replayFrames = (() => {
    try {
      const frames = JSON.parse(machine.dataset.casinoFrames ?? '[]');
      return Array.isArray(frames) ? frames : [];
    } catch {
      return [];
    }
  })();
  let submitting = false;
  let replaying = replayFrames.length > 1;

  const replayKind = (frame, index) => {
    const configured = String(frame?.replayKind ?? '').trim().toLowerCase();
    if (/^[a-z][a-z0-9-]{0,30}$/.test(configured)) return configured;
    if (!index) return 'initial';
    if (machineKey === 'bromo-sporefall') return 'cascade';
    if (machineKey === 'kings-lockbox') return 'hold-respin';
    return 'bonus-spin';
  };

  const replayLabel = (frame, index, kind) => {
    const configured = typeof frame?.label === 'string' ? frame.label.trim() : '';
    if (configured) return configured.slice(0, 120);
    if (!index) {
      if (machineKey === 'bromo-sporefall') return 'Initial drop';
      if (machineKey === 'kings-lockbox') return 'Initial reveal';
      return 'Paid spin';
    }
    if (kind === 'cascade') return `Cascade ${index}`;
    if (kind === 'hold-respin') return `Lockbox respin ${index}`;
    return `Bonus spin ${index} of ${replayFrames.length - 1}`;
  };

  const frameHoldMs = (frame) => {
    const configured = Number(frame?.holdMs);
    if (!Number.isFinite(configured)) return DEFAULT_FRAME_HOLD_MS;
    return Math.min(MAXIMUM_FRAME_HOLD_MS, Math.max(0, Math.round(configured)));
  };

  const holdSummary = (milliseconds) => {
    if (milliseconds === 0) return '';
    if (milliseconds % 1000 === 0) {
      const seconds = milliseconds / 1000;
      return `holding ${seconds} second${seconds === 1 ? '' : 's'}`;
    }
    return `holding ${milliseconds.toLocaleString('en-GB')} milliseconds`;
  };

  const remainingAttemptsSummary = (frame) => {
    const attempts = Number(frame?.remainingAttempts);
    if (!Number.isSafeInteger(attempts) || attempts < 0) return '';
    return `${attempts} attempt${attempts === 1 ? '' : 's'} remaining`;
  };

  const setFrameKind = (kind, frame) => {
    const screen = machine.querySelector('.casino-screen-frame');
    machine.dataset.casinoReplayKind = kind;
    if (screen) screen.dataset.casinoReplayKind = kind;
    machine.classList.toggle('is-cascade-frame', kind === 'cascade');
    machine.classList.toggle('is-hold-frame', kind === 'hold-respin');
    machine.classList.toggle('is-bonus-frame', kind === 'bonus-spin');
    const attempts = Number(frame?.remainingAttempts);
    if (Number.isSafeInteger(attempts) && attempts >= 0) {
      machine.dataset.casinoRemainingAttempts = String(attempts);
      if (screen) screen.dataset.casinoRemainingAttempts = String(attempts);
    } else {
      delete machine.dataset.casinoRemainingAttempts;
      if (screen) delete screen.dataset.casinoRemainingAttempts;
    }
  };

  const replayAction = (kind) => {
    if (kind === 'cascade') return 'spores falling';
    if (kind === 'hold-respin') return 'open slots turning';
    return 'reels turning';
  };

  const replayPullText = () => {
    const kinds = replayFrames.map((frame, index) => replayKind(frame, index));
    if (kinds.includes('cascade')) return 'Cascades resolving';
    if (kinds.includes('hold-respin')) return 'Lockbox respins running';
    return 'Bonus spins running';
  };

  const updateCurrency = () => {
    const option = currency.selectedOptions[0];
    const maximum = Math.max(0, Number(option?.dataset.max ?? 0));
    const available = option?.dataset.balance ?? '0';
    const voucher = Math.max(0, Number(option?.dataset.voucher ?? 0));
    const unit = option?.dataset.unit ?? '';
    wager.max = String(Math.max(1, maximum));
    if (Number(wager.value) > maximum && maximum > 0) wager.value = String(maximum);
    balance.textContent = unit === 'gold'
      ? `${available}g available`
      : `${Number(available).toLocaleString('en-GB')} ${unit} available${voucher > 0
        ? `, including ${voucher.toLocaleString('en-GB')} voucher` : ''}`;
    pull.disabled = replaying || maximum < Number(wager.min || 1);
  };
  currency.addEventListener('change', updateCurrency);
  updateCurrency();

  form.addEventListener('submit', (event) => {
    if (replaying) {
      event.preventDefault();
      return;
    }
    if (submitting) return;
    if (!form.reportValidity()) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    submitting = true;
    machine.classList.add('is-spinning');
    if (pullLabel) pullLabel.textContent = submittingLabels[machineKey] ?? 'Machine running';
    currency.disabled = true;
    wager.disabled = true;
    pull.disabled = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      currency.disabled = false;
      wager.disabled = false;
      pull.disabled = false;
      form.requestSubmit();
    }, reducedMotion ? 0 : 850);
  });

  const renderFrame = (frame) => {
    const cells = [...machine.querySelectorAll('[data-casino-cell]')];
    const cellIndex = (value) => {
      const index = Number(value);
      return Number.isSafeInteger(index) && index >= 0 && index < cells.length ? index : null;
    };
    const winningValues = Array.isArray(frame?.winningCells)
      ? frame.winningCells
      : Array.isArray(frame?.wins) ? frame.wins.flatMap((win) => win?.cells ?? []) : [];
    const winningCells = new Set(winningValues.map(cellIndex).filter((index) => index !== null));
    const lockedCells = new Set((Array.isArray(frame?.lockedCells) ? frame.lockedCells : [])
      .map(cellIndex).filter((index) => index !== null));
    for (const [index, cell] of cells.entries()) {
      const symbol = frame.grid?.[index];
      if (!symbol) continue;
      const bonus = symbol.kind === 'bonus';
      cell.className = 'casino-reel-cell';
      if (bonus) {
        cell.classList.add('casino-bonus-cell');
        if (/^[a-z][a-z0-9-]{1,30}$/.test(String(symbol.id))) {
          cell.classList.add(`casino-bonus-${symbol.id}`);
        }
        cell.dataset.casinoBonus = String(symbol.id);
      } else {
        const rarity = Number(symbol.rarity);
        if (Number.isInteger(rarity) && rarity >= 0 && rarity <= 6) {
          cell.classList.add(`rarity-${rarity}`);
        }
        delete cell.dataset.casinoBonus;
      }
      if (winningCells.has(index)) {
        cell.classList.add('is-winning');
        cell.dataset.winning = 'true';
      } else delete cell.dataset.winning;
      if (lockedCells.has(index)) {
        cell.classList.add('is-locked');
        cell.dataset.locked = 'true';
      } else delete cell.dataset.locked;

      const halo = document.createElement('span');
      halo.className = 'casino-symbol-halo';
      halo.setAttribute('aria-hidden', 'true');
      const art = document.createElement(bonus ? 'span' : 'img');
      if (bonus) {
        art.className = 'casino-bonus-glyph';
        art.setAttribute('aria-hidden', 'true');
        art.textContent = symbol.glyph ?? '';
      } else {
        art.src = symbol.icon ?? '';
        art.alt = '';
      }
      const name = document.createElement('strong');
      name.textContent = symbol.name ?? '';
      const type = document.createElement('small');
      type.textContent = bonus ? 'Bonus symbol' : symbol.rarityName ?? '';
      cell.replaceChildren(halo, art, name, type);
      const cellDescription = [symbol.name, bonus ? 'Bonus symbol' : symbol.rarityName];
      if (winningCells.has(index)) cellDescription.push('Winning');
      if (lockedCells.has(index)) cellDescription.push('Locked');
      cell.setAttribute('aria-label', cellDescription.filter(Boolean).join(', '));
    }
  };

  if (replayFrames.length > 1 && result && replayStatus) {
    result.classList.add('is-replaying');
    machine.setAttribute('aria-busy', 'true');
    replayStatus.hidden = false;
    currency.disabled = true;
    wager.disabled = true;
    pull.disabled = true;
    if (pullLabel) pullLabel.textContent = replayPullText();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = (milliseconds) => new Promise((resolve) =>
      window.setTimeout(resolve, milliseconds));
    (async () => {
      try {
        for (const [index, frame] of replayFrames.entries()) {
          const kind = replayKind(frame, index);
          const label = replayLabel(frame, index, kind);
          setFrameKind(kind, frame);
          replayStatus.textContent = `${label} \u00b7 ${replayAction(kind)}`;
          machine.classList.add('is-spinning');
          await wait(reducedMotion ? 0 : 700);
          renderFrame(frame);
          machine.classList.remove('is-spinning');
          const statusParts = [
            label,
            `${Number(frame.multiplier) || 0}\u00d7 award`,
            remainingAttemptsSummary(frame),
            holdSummary(frameHoldMs(frame))
          ].filter(Boolean);
          replayStatus.textContent = statusParts.join(' \u00b7 ');
          await wait(frameHoldMs(frame));
        }
      } finally {
        machine.classList.remove('is-spinning');
        const outcome = result.dataset.casinoOutcome;
        if (['is-jackpot', 'is-win', 'is-loss'].includes(outcome)) {
          result.classList.add(outcome);
        }
        if (outcome === 'is-jackpot') machine.classList.add('has-jackpot');
        replayStatus.hidden = true;
        result.classList.remove('is-replaying');
        machine.removeAttribute('aria-busy');
        for (const concealed of document.querySelectorAll('[data-casino-concealed]')) {
          concealed.hidden = true;
        }
        for (const revealed of document.querySelectorAll('[data-casino-reveal]')) {
          revealed.hidden = false;
        }
        replaying = false;
        currency.disabled = false;
        wager.disabled = false;
        if (pullLabel) pullLabel.textContent = readyPullLabels[machineKey] ?? 'Play again';
        updateCurrency();
      }
    })();
  }
})();
