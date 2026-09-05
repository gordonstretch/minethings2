(() => {
  'use strict';

  const filterRoot = () => document.querySelector('[data-chat-filters]');
  const storageKey = (root) => `minethings.chat-filters.v2.${root.dataset.chatPlayerId}`;
  const emptyState = () => ({ ratingTiers: [], hideWorldEvents: true, hiddenRegions: [] });

  const loadState = (root) => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(root)) ?? 'null');
      if (!saved || typeof saved !== 'object') return emptyState();
      return {
        ratingTiers: Array.isArray(saved.ratingTiers)
          ? saved.ratingTiers.map(Number).filter(Number.isSafeInteger) : [],
        hideWorldEvents: Boolean(saved.hideWorldEvents),
        hiddenRegions: Array.isArray(saved.hiddenRegions)
          ? saved.hiddenRegions.map(Number).filter(Number.isSafeInteger) : []
      };
    } catch {
      return emptyState();
    }
  };

  const saveState = (root, state) => {
    try {
      localStorage.setItem(storageKey(root), JSON.stringify(state));
    } catch {
      // Filtering still works for this page when browser storage is unavailable.
    }
  };

  const stateFromControls = (root) => ({
    ratingTiers: [...root.querySelectorAll('[data-chat-rating-tier]:checked')]
      .map((input) => Number(input.value)).filter(Number.isSafeInteger),
    hideWorldEvents: Boolean(root.querySelector('[data-chat-hide-world-events]')?.checked),
    hiddenRegions: [...root.querySelectorAll('[data-chat-hidden-region]:checked')]
      .map((input) => Number(input.value)).filter(Number.isSafeInteger)
  });

  const setControls = (root, state) => {
    const ratingTiers = new Set(state.ratingTiers);
    root.querySelectorAll('[data-chat-rating-tier]').forEach((input) => {
      input.checked = ratingTiers.has(Number(input.value));
    });
    const worldControl = root.querySelector('[data-chat-hide-world-events]');
    if (worldControl) worldControl.checked = state.hideWorldEvents;
    const hidden = new Set(state.hiddenRegions);
    root.querySelectorAll('[data-chat-hidden-region]').forEach((input) => {
      input.checked = hidden.has(Number(input.value));
    });
  };

  const numberList = (value) => String(value ?? '').split(',')
    .filter(Boolean).map(Number).filter(Number.isSafeInteger);

  const applyFilters = () => {
    const root = filterRoot();
    if (!root) return;
    const state = stateFromControls(root);
    const ratingTiers = new Set(state.ratingTiers);
    const hiddenRegions = new Set(state.hiddenRegions);
    const rows = [...document.querySelectorAll('#chat-log [data-chat-row]')];
    let visible = 0;
    for (const row of rows) {
      const ratingTier = Number(row.dataset.chatRatingTier);
      const wrongRatingTier = ratingTiers.size > 0 && Number.isFinite(ratingTier)
        && ratingTier > 0 && !ratingTiers.has(ratingTier);
      const hiddenWorldEvent = state.hideWorldEvents && row.dataset.chatKind === 'world';
      const hiddenRegion = numberList(row.dataset.chatMapIds)
        .some((mapId) => hiddenRegions.has(mapId));
      row.hidden = wrongRatingTier || hiddenWorldEvent || hiddenRegion;
      if (!row.hidden) visible += 1;
    }

    const active = ratingTiers.size > 0 || state.hideWorldEvents || hiddenRegions.size > 0;
    const traffic = document.querySelector('#chat-traffic-count');
    if (traffic) {
      traffic.textContent = `${visible.toLocaleString('en-GB')}${active
        ? ` of ${rows.length.toLocaleString('en-GB')}` : ''} ${visible === 1
        ? 'transmission' : 'transmissions'}`;
    }
    const summary = root.querySelector('[data-chat-filter-summary]');
    if (summary) {
      summary.textContent = active
        ? `${visible.toLocaleString('en-GB')} of ${rows.length.toLocaleString('en-GB')} visible.`
        : 'Showing all traffic.';
    }
    const filteredEmpty = document.querySelector('#chat-filter-empty');
    if (filteredEmpty) filteredEmpty.hidden = rows.length === 0 || visible > 0;
  };

  const restoreAndApply = () => {
    const root = filterRoot();
    if (!root) return;
    setControls(root, loadState(root));
    applyFilters();
  };

  document.addEventListener('change', (event) => {
    const root = event.target.closest?.('[data-chat-filters]');
    if (!root || !event.target.matches('input')) return;
    const state = stateFromControls(root);
    saveState(root, state);
    applyFilters();
  });
  document.addEventListener('click', (event) => {
    const reset = event.target.closest?.('[data-chat-filter-reset]');
    if (!reset) return;
    const root = reset.closest('[data-chat-filters]');
    if (!root) return;
    const state = emptyState();
    setControls(root, state);
    saveState(root, state);
    applyFilters();
  });
  document.addEventListener('minethings:content-updated', restoreAndApply);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreAndApply, { once: true });
  } else {
    restoreAndApply();
  }
})();
