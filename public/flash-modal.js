(() => {
  'use strict';

  const notice = document.querySelector('#flash-dialog');
  const message = document.querySelector('#flash-dialog-message');
  const title = notice?.querySelector('#flash-dialog-title');
  const mark = notice?.querySelector('.flash-notice-mark');
  const dismiss = notice?.querySelector('button');
  if (!notice || !message || !dismiss) return;

  let items = notice.querySelector('#flash-dialog-items');
  if (!items) {
    items = document.createElement('ul');
    items.id = 'flash-dialog-items';
    items.hidden = true;
    notice.append(items);
  }

  const scrollKey = 'minethings-submit-scroll';
  const seenNoticeKeys = new Set();
  const seenNoticeKeyOrder = [];
  const seenFindingEventIds = new Set();
  const seenFindingEventIdOrder = [];
  let hideTimer = null;
  let timerStartedAt = 0;
  let remainingMs = 0;
  let pointerInside = false;
  let focusInside = false;

  const rememberNoticeKey = (key) => {
    const cleanKey = String(key ?? '').trim();
    if (!cleanKey || seenNoticeKeys.has(cleanKey)) return;
    seenNoticeKeys.add(cleanKey);
    seenNoticeKeyOrder.push(cleanKey);
    if (seenNoticeKeyOrder.length > 100) {
      seenNoticeKeys.delete(seenNoticeKeyOrder.shift());
    }
  };
  const findingEventId = (value) => String(
    value?.eventId ?? value?.event_id ?? value?.findingEventId ?? value?.finding_event_id ?? ''
  ).trim();
  const rememberFindingEventId = (id) => {
    if (!id || seenFindingEventIds.has(id)) return;
    seenFindingEventIds.add(id);
    seenFindingEventIdOrder.push(id);
    if (seenFindingEventIdOrder.length > 1000) {
      seenFindingEventIds.delete(seenFindingEventIdOrder.shift());
    }
  };
  const rememberFindingEventIdsFromRows = () => {
    for (const row of items.querySelectorAll('[data-finding-event-ids]')) {
      for (const id of String(row.dataset.findingEventIds ?? '').split(',')) {
        rememberFindingEventId(id.trim());
      }
    }
  };

  const hasItems = () => items.children.length > 0;
  const hasMessage = () => message.textContent.trim().length > 0;
  const hideNotice = () => {
    clearTimeout(hideTimer);
    hideTimer = null;
    timerStartedAt = 0;
    notice.hidden = true;
  };
  const scheduleHide = (delay = hasItems() ? 16000 : 8000) => {
    clearTimeout(hideTimer);
    remainingMs = Math.max(0, Number(delay) || 0);
    if (pointerInside || focusInside || notice.hidden || remainingMs === 0) return;
    timerStartedAt = Date.now();
    hideTimer = setTimeout(hideNotice, remainingMs);
  };
  const pauseHide = () => {
    if (!hideTimer) return;
    remainingMs = Math.max(0, remainingMs - (Date.now() - timerStartedAt));
    clearTimeout(hideTimer);
    hideTimer = null;
  };
  const resumeHide = () => {
    if (!pointerInside && !focusInside && !notice.hidden) {
      scheduleHide(remainingMs || (hasItems() ? 16000 : 8000));
    }
  };
  const showNotice = () => {
    items.hidden = !hasItems();
    if (!hasMessage() && !hasItems()) return;
    notice.hidden = false;
    scheduleHide(hasItems() ? 16000 : 8000);
  };

  const importChildren = (target, source) => {
    target.replaceChildren(...[...source.childNodes]
      .map((node) => document.importNode(node, true)));
  };
  const syncNoticeFromDocument = (incomingDocument) => {
    const incomingNotice = incomingDocument.querySelector('#flash-dialog');
    const incomingMessage = incomingDocument.querySelector('#flash-dialog-message');
    if (!incomingNotice || !incomingMessage) return false;

    importChildren(message, incomingMessage);
    const incomingTitle = incomingNotice.querySelector('#flash-dialog-title');
    const incomingMark = incomingNotice.querySelector('.flash-notice-mark');
    if (title && incomingTitle) importChildren(title, incomingTitle);
    if (mark && incomingMark) importChildren(mark, incomingMark);
    const incomingItems = incomingDocument.querySelector('#flash-dialog-items');
    if (incomingItems) importChildren(items, incomingItems);
    else items.replaceChildren();
    items.hidden = !hasItems();

    const noticeKey = incomingNotice.dataset.noticeKey ?? '';
    notice.dataset.noticeKey = noticeKey;
    rememberNoticeKey(noticeKey);
    rememberFindingEventIdsFromRows();
    if (hasMessage() || hasItems()) showNotice();
    return true;
  };
  const syncBotBuildNoticeFromDocument = (incomingDocument) => {
    const incoming = incomingDocument.querySelector('#bot-build-burst[data-active="1"]');
    if (!incoming) return;
    document.dispatchEvent(new CustomEvent('minethings:bot-build-part', { detail: {
      noticeKey: incoming.dataset.noticeKey ?? '',
      step: Number(incoming.dataset.step ?? 0),
      colour: incoming.style.getPropertyValue('--bot-burst-colour').trim(),
      progress: incoming.querySelector('#bot-build-burst-progress')?.textContent ?? '',
      shout: incoming.querySelector('#bot-build-burst-shout')?.textContent ?? '',
      text: incoming.querySelector('#bot-build-burst-text')?.textContent ?? '',
      install: incoming.querySelector('#bot-build-burst-install')?.textContent ?? ''
    } }));
  };

  const finitePositiveInteger = (value, fallback = 1) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
  };
  const cleanRarity = (value) => {
    const rarity = Number(value);
    return Number.isInteger(rarity) && rarity >= 1 && rarity <= 6 ? rarity : 0;
  };
  const sameOriginUrl = (value, fallback = '') => {
    if (!value && !fallback) return '';
    try {
      const url = new URL(String(value || fallback), window.location.origin);
      return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol)
        ? `${url.pathname}${url.search}${url.hash}` : fallback;
    } catch {
      return fallback;
    }
  };
  const normaliseFinding = (value) => {
    if (!value || typeof value !== 'object') return null;
    const nestedItem = value.item && typeof value.item === 'object' ? value.item : {};
    const finding = { ...nestedItem, ...value };
    const id = finding.itemId ?? finding.item_id ?? finding.id ?? nestedItem.id ?? '';
    const name = String(finding.itemName ?? finding.item_name ?? finding.name
      ?? nestedItem.name ?? '').trim();
    if (!name) return null;
    const rarity = cleanRarity(finding.rarity ?? finding.rarityId ?? finding.rarity_id
      ?? nestedItem.rarity);
    const fallbackHref = id !== '' ? `/items/${encodeURIComponent(String(id))}` : '';
    return {
      id: String(id),
      name,
      rarity,
      rarityName: String(finding.rarityName ?? finding.rarity_name
        ?? nestedItem.rarityName ?? '').trim(),
      quantity: finitePositiveInteger(finding.quantity ?? finding.count ?? finding.qty),
      href: sameOriginUrl(finding.href ?? finding.url ?? finding.path ?? finding.itemUrl
        ?? finding.item_url, fallbackHref),
      icon: sameOriginUrl(finding.icon ?? finding.image ?? finding.imageUrl
        ?? finding.image_url ?? nestedItem.icon),
      source: String(finding.sourceName ?? finding.source_name ?? finding.sourceLabel
        ?? finding.source_label ?? finding.source ?? '').trim(),
      location: String(finding.locationName ?? finding.location_name ?? finding.location
        ?? finding.cityName ?? finding.city_name ?? '').trim(),
      status: String(finding.statusLabel ?? finding.status_label ?? finding.status
        ?? (finding.autoRecycled === true || finding.auto_recycled === true
          ? 'Auto-recycled into Ore scraps' : 'Added to your things')).trim()
    };
  };
  const itemKey = (finding) => [finding.id || finding.name.toLocaleLowerCase(),
    finding.rarity, finding.source, finding.location, finding.status].join('|');

  const setQuantity = (row, quantity) => {
    const cleanQuantity = finitePositiveInteger(quantity);
    row.dataset.quantity = String(cleanQuantity);
    let quantityNode = row.querySelector('.flash-item-quantity')
      ?? row.querySelector(':scope > a > b');
    if (!quantityNode) {
      quantityNode = document.createElement('b');
      (row.querySelector('a') ?? row).append(quantityNode);
    }
    quantityNode.classList.add('flash-item-quantity');
    quantityNode.textContent = `×${cleanQuantity.toLocaleString('en-GB')}`;
    quantityNode.setAttribute('aria-label', `Quantity ${cleanQuantity.toLocaleString('en-GB')}`);
  };
  const quantityInRow = (row) => finitePositiveInteger(row.dataset.quantity
    || row.querySelector('.flash-item-quantity, :scope > a > b')
      ?.textContent.replace(/[^0-9]/g, ''));
  const createItemRow = (finding, key) => {
    const row = document.createElement('li');
    row.className = `flash-item flash-item-row rarity-${finding.rarity || 'unranked'}`;
    row.dataset.itemKey = key;
    if (finding.id) row.dataset.itemId = finding.id;

    const link = document.createElement('a');
    link.className = `flash-item-link rarity-${finding.rarity || 'unranked'}`;
    link.href = finding.href || '#';

    if (finding.icon) {
      const icon = document.createElement('img');
      icon.className = 'flash-item-icon';
      icon.src = finding.icon;
      icon.alt = '';
      link.append(icon);
    } else {
      const icon = document.createElement('span');
      icon.className = 'flash-item-icon flash-item-icon-fallback';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✦';
      link.append(icon);
    }

    const copy = document.createElement('span');
    copy.className = 'flash-item-copy';
    const itemName = document.createElement('strong');
    itemName.className = 'flash-item-name';
    itemName.textContent = finding.name;
    copy.append(itemName);

    const metadata = [finding.rarityName, finding.source, finding.location, finding.status]
      .filter((entry, index, values) => entry && values.indexOf(entry) === index);
    if (metadata.length) {
      const meta = document.createElement('small');
      meta.className = 'flash-item-meta';
      meta.textContent = metadata.join(' · ');
      copy.append(meta);
    }
    link.append(copy);
    row.append(link);
    setQuantity(row, finding.quantity);
    return row;
  };
  const mergeItem = (finding) => {
    const key = itemKey(finding);
    const existing = [...items.children]
      .find((row) => row.dataset.itemKey === key
        || (!row.dataset.itemKey && finding.id && row.dataset.itemId === finding.id));
    if (existing) {
      setQuantity(existing, quantityInRow(existing) + finding.quantity);
      return;
    }
    items.append(createItemRow(finding, key));
  };
  const findingsFromPayload = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.findings)) return payload.findings;
    if (payload.item && typeof payload.item === 'object'
      && !Array.isArray(payload.item)) return [payload];
    return [payload];
  };

  document.addEventListener('minethings:items-found', (event) => {
    const payload = event.detail;
    const payloadObject = payload && !Array.isArray(payload) && typeof payload === 'object'
      ? payload : {};
    const noticeKey = String(payloadObject.noticeKey ?? payloadObject.notice_key
      ?? payloadObject.eventId ?? payloadObject.event_id ?? payloadObject.revision ?? '').trim();
    if (noticeKey && seenNoticeKeys.has(noticeKey)) return;

    const findings = findingsFromPayload(payload).map((value) => ({
      eventId: findingEventId(value), finding: normaliseFinding(value)
    })).filter(({ eventId, finding }) => finding
      && (!eventId || !seenFindingEventIds.has(eventId)));
    if (!findings.length) return;
    if (notice.hidden) items.replaceChildren();
    findings.forEach(({ eventId, finding }) => {
      mergeItem(finding);
      rememberFindingEventId(eventId);
    });
    if (title) title.textContent = 'Things found';
    if (mark) mark.textContent = '✦';
    rememberNoticeKey(noticeKey);
    if (noticeKey) notice.dataset.noticeKey = noticeKey;

    const explicitMessage = String(payloadObject.message ?? '').trim();
    if (explicitMessage) message.textContent = explicitMessage;
    else {
      const quantity = [...items.children]
        .reduce((sum, row) => sum + quantityInRow(row), 0);
      message.textContent = `Found ${quantity.toLocaleString('en-GB')} new thing${quantity === 1 ? '' : 's'}.`;
    }
    showNotice();
  });

  document.addEventListener('minethings:battle-complete', (event) => {
    const battle = event.detail;
    if (!battle || typeof battle !== 'object') return;
    const noticeKey = String(battle.noticeKey ?? '').trim();
    if (noticeKey && seenNoticeKeys.has(noticeKey)) return;
    const outcome = battle.outcome === 'won' ? 'Victory' : battle.outcome === 'lost'
      ? 'Defeat' : 'Draw';
    if (title) title.textContent = `${outcome} in combat`;
    if (mark) mark.textContent = battle.outcome === 'won'
      ? '\u2694\uFE0F' : battle.outcome === 'lost' ? '\u2620\uFE0F' : '\u2248';
    message.textContent = `${battle.vehicleName} ${battle.outcome} against ${battle.opponentPlayerName}'s ${battle.opponentVehicleName}.`;
    items.replaceChildren();
    const lines = [];
    const summary = battle.summary ?? {};
    if (summary.kind === 'land') {
      lines.push(`${Number(summary.rounds).toLocaleString('en-GB')} combat rounds`);
      lines.push(`Attack ${Number(summary.startingAttack).toFixed(1)} \u2192 ${Number(summary.endingAttack).toFixed(1)}`);
      lines.push(`Armour ${Number(summary.startingArmor).toFixed(1)} \u2192 ${Number(summary.endingArmor).toFixed(1)}; opponent ${Number(summary.opponentEndingArmor).toFixed(1)}`);
      lines.push(`Final blow ${Number(summary.finalBlow).toFixed(1)} damage`);
    } else if (summary.kind === 'sea') {
      lines.push(`${Number(summary.shots)} cannon shots; ${Number(summary.hits)} hits`);
      lines.push(`Finished with ${Number(summary.endingHull)} hull, ${Number(summary.endingSpeed).toFixed(1)} speed, and ${Number(summary.endingCrew)} crew`);
      lines.push(`${Number(summary.crewLost)} crew lost${summary.opponentSunk ? '; opponent sunk' : ''}${summary.chainEscape ? '; chain-shot escape' : ''}`);
    }
    if (battle.pillage) {
      const loot = battle.pillage.kind === 'oil'
        ? `${Number(battle.pillage.trips)} oil-boosted trips`
        : (battle.pillage.items ?? []).map((item) =>
          `${Number(item.quantity)}\u00d7 ${item.name}`).join(', ')
          || battle.pillage.kind;
      lines.push(`Pillage ${battle.pillage.direction}: ${loot}${battle.pillage.disarmed ? ' (disarmed)' : ''}`);
    }
    for (const line of lines) {
      const row = document.createElement('li');
      row.className = 'flash-battle-detail';
      row.textContent = line;
      items.append(row);
    }
    const reportRow = document.createElement('li');
    reportRow.className = 'flash-battle-report';
    const reportLink = document.createElement('a');
    reportLink.href = sameOriginUrl(battle.reportPath, `/battles/${encodeURIComponent(String(battle.battleId))}`);
    reportLink.textContent = 'Open the complete battle report \u2192';
    reportRow.append(reportLink);
    items.append(reportRow);
    rememberNoticeKey(noticeKey);
    if (noticeKey) notice.dataset.noticeKey = noticeKey;
    showNotice();
  });

  dismiss.addEventListener('click', hideNotice);
  notice.addEventListener('pointerenter', () => {
    pointerInside = true;
    pauseHide();
  });
  notice.addEventListener('pointerleave', () => {
    pointerInside = false;
    resumeHide();
  });
  notice.addEventListener('focusin', () => {
    focusInside = true;
    pauseHide();
  });
  notice.addEventListener('focusout', () => requestAnimationFrame(() => {
    focusInside = notice.contains(document.activeElement);
    resumeHide();
  }));

  const rememberScroll = () => {
    sessionStorage.setItem(scrollKey, JSON.stringify({
      pathname: window.location.pathname,
      x: window.scrollX,
      y: window.scrollY
    }));
  };

  const restoreRememberedScroll = () => {
    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;
    sessionStorage.removeItem(scrollKey);
    try {
      const position = JSON.parse(saved);
      if (position.pathname === window.location.pathname) {
        requestAnimationFrame(() => window.scrollTo(position.x, position.y));
      }
    } catch {
      // Ignore invalid data left by an older version of the client.
    }
  };

  restoreRememberedScroll();
  rememberNoticeKey(notice.dataset.noticeKey);
  rememberFindingEventIdsFromRows();
  showNotice();

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;

    const submitter = event.submitter;
    const method = ((submitter?.hasAttribute('formmethod')
      ? submitter.getAttribute('formmethod') : form.getAttribute('method')) || 'get').toLowerCase();
    const actionValue = submitter?.hasAttribute('formaction')
      ? submitter.getAttribute('formaction') : form.getAttribute('action');
    const action = new URL(actionValue || window.location.href, window.location.href);
    const excludedAction = ['/login', '/register', '/logout'].includes(action.pathname);
    const hasPageScripts = Boolean(document.querySelector('#content script'));
    const isDialogForm = method === 'dialog' || form.closest('dialog');
    const requiresPageNavigation = form.hasAttribute('data-native-navigation')
      || form.classList.contains('inventory-meld-form')
      || form.classList.contains('meld-create-form');
    const target = form.getAttribute('target') || '';
    const hasDifferentTarget = Boolean(target && target !== '_self');

    if (method !== 'post' || excludedAction || isDialogForm || hasDifferentTarget
      || hasPageScripts || requiresPageNavigation) {
      if (method === 'post' && !excludedAction && !isDialogForm) rememberScroll();
      return;
    }

    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    form.dataset.submitting = 'true';
    const formData = new FormData(form);
    if (submitter?.name) formData.append(submitter.name, submitter.value);
    if (submitter) submitter.disabled = true;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    try {
      const response = await fetch(action, {
        method: 'POST',
        body: new URLSearchParams(formData),
        credentials: 'same-origin',
        headers: { Accept: 'text/html' }
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const destination = new URL(response.url, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname) {
        window.location.assign(destination.href);
        return;
      }

      const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextContent = nextDocument.querySelector('#content');
      const currentContent = document.querySelector('#content');
      if (!nextContent || !currentContent) throw new Error('Updated page content is unavailable.');

      currentContent.replaceWith(document.importNode(nextContent, true));
      const nextLogin = nextDocument.querySelector('#login');
      const currentLogin = document.querySelector('#login');
      if (nextLogin && currentLogin) currentLogin.replaceWith(document.importNode(nextLogin, true));
      const nextSidebar = nextDocument.querySelector('#left');
      const currentSidebar = document.querySelector('#left');
      if (nextSidebar && currentSidebar) {
        currentSidebar.replaceWith(document.importNode(nextSidebar, true));
      }
      document.title = nextDocument.title;
      window.history.replaceState(null, '', `${destination.pathname}${destination.search}${destination.hash}`);
      requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));

      syncNoticeFromDocument(nextDocument);
      syncBotBuildNoticeFromDocument(nextDocument);
      document.dispatchEvent(new CustomEvent('minethings:content-updated', {
        detail: { root: document.querySelector('#content'), scopes: ['player'] }
      }));
    } catch {
      rememberScroll();
      HTMLFormElement.prototype.submit.call(form);
    } finally {
      delete form.dataset.submitting;
      if (submitter) submitter.disabled = false;
    }
  });
})();
