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

  const updateCurrency = () => {
    const option = currency.selectedOptions[0];
    const maximum = Math.max(0, Number(option?.dataset.max ?? 0));
    const available = option?.dataset.balance ?? '0';
    const unit = option?.dataset.unit ?? '';
    wager.max = String(Math.max(1, maximum));
    if (Number(wager.value) > maximum && maximum > 0) wager.value = String(maximum);
    balance.textContent = unit === 'gold'
      ? `${available}g available` : `${Number(available).toLocaleString('en-GB')} ${unit} available`;
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
    pull.querySelector('span').textContent = 'Reels turning';
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
    const winningCells = new Set(frame.winningCells ?? []);
    const cells = [...machine.querySelectorAll('[data-casino-cell]')];
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
    }
  };

  if (replayFrames.length > 1 && result && replayStatus) {
    result.classList.add('is-replaying');
    machine.setAttribute('aria-busy', 'true');
    replayStatus.hidden = false;
    currency.disabled = true;
    wager.disabled = true;
    pull.disabled = true;
    const pullLabel = pull.querySelector('span');
    if (pullLabel) pullLabel.textContent = 'Bonus spins running';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = (milliseconds) => new Promise((resolve) =>
      window.setTimeout(resolve, milliseconds));
    (async () => {
      try {
        for (const [index, frame] of replayFrames.entries()) {
          const label = index === 0
            ? 'Paid spin' : `Bonus spin ${index} of ${replayFrames.length - 1}`;
          replayStatus.textContent = `${label} \u00b7 reels turning`;
          machine.classList.add('is-spinning');
          await wait(reducedMotion ? 0 : 700);
          renderFrame(frame);
          machine.classList.remove('is-spinning');
          replayStatus.textContent = `${label} \u00b7 ${Number(frame.multiplier) || 0}\u00d7 award \u00b7 holding 3 seconds`;
          await wait(3000);
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
        if (pullLabel) pullLabel.textContent = 'Pull the lever';
        updateCurrency();
      }
    })();
  }
})();
