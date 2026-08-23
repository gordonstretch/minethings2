(() => {
  'use strict';

  const script = document.currentScript
    ?? document.querySelector('script[src^="/node/live-updates.js"]');
  if (!script || typeof window.EventSource !== 'function'
    || /^\/oil-field(?:\/|$)/.test(window.location.pathname)) return;

  let revision = Math.max(0, Number(script.dataset.liveRevision) || 0);
  let appliedRevision = revision;
  let updateTimer = null;
  let updateRunning = false;
  let updatePending = false;
  let latestScopes = [];
  let protectedForms = 0;
  const chatPage = /^\/chat(?:\/|$)/.test(window.location.pathname);
  const chatBottomThreshold = 32;
  let chatPane = null;
  let chatFollowingLatest = chatPage;
  let chatProgrammaticScroll = false;

  const setStatus = () => {};

  const chatIsNearBottom = (pane) => pane.scrollHeight - pane.scrollTop
    - pane.clientHeight <= chatBottomThreshold;
  const onChatScroll = () => {
    if (!chatProgrammaticScroll && chatPane) {
      chatFollowingLatest = chatIsNearBottom(chatPane);
    }
  };
  const bindChatPane = () => {
    const pane = chatPage ? document.querySelector('#chat-log') : null;
    if (pane === chatPane) return pane;
    if (chatPane) chatPane.removeEventListener('scroll', onChatScroll);
    chatPane = pane;
    if (chatPane) chatPane.addEventListener('scroll', onChatScroll, { passive: true });
    return chatPane;
  };
  const scrollChatToLatest = () => {
    const pane = bindChatPane();
    if (!pane) return;
    chatProgrammaticScroll = true;
    pane.scrollTop = pane.scrollHeight;
    chatFollowingLatest = true;
    requestAnimationFrame(() => {
      chatProgrammaticScroll = false;
      if (chatPane) chatFollowingLatest = chatIsNearBottom(chatPane);
    });
  };

  const topicsForPath = (pathname) => {
    const topics = new Set(['catalog']);
    if (/^\/(?:exchange|market|containers)/.test(pathname)) topics.add('market');
    if (/^\/(?:factories)/.test(pathname)) {
      topics.add('factories');
      topics.add('market');
    }
    if (/^\/(?:map|cities|move|events)/.test(pathname)) topics.add('world');
    if (/^\/chat/.test(pathname)) topics.add('chat');
    if (/^\/messages/.test(pathname)) topics.add('messages');
    if (/^\/(?:vehicles|ratings)/.test(pathname)) {
      topics.add('vehicles');
      topics.add('world');
    }
    if (/^\/(?:miners|stats|professions)/.test(pathname)) {
      topics.add('players');
      topics.add('stats');
    }
    if (/^\/credits/.test(pathname)) topics.add('payments');
    if (/^\/admin/.test(pathname)) topics.add('all');
    return [...topics];
  };

  const dirtyForm = (element) => element instanceof HTMLFormElement
    && element.dataset.liveDirty === 'true';
  const protectedPreviewScope = (element) => element?.nodeType === Node.ELEMENT_NODE
    && element.matches('[data-live-preview-scope]')
    && Boolean(element.querySelector('[data-preview-binding][name="previewToken"], '
      + '[data-live-preview-panel][data-preview-stale="true"]'));
  const invalidateBoundPreview = (form) => {
    const binding = form.querySelector('[data-preview-binding][name="previewToken"]');
    const scope = form.closest('[data-live-preview-scope]') ?? form;
    const panel = scope.querySelector('[data-live-preview-panel]');
    if (!binding && !panel) return;
    binding?.remove();
    scope.querySelectorAll('[data-preview-commit]').forEach((button) => button.remove());
    if (panel) {
      panel.dataset.previewStale = 'true';
      panel.classList.remove('preview-valid');
      panel.classList.add('preview-invalid');
      panel.setAttribute('aria-live', 'polite');
      const verdict = panel.querySelector('.preview-verdict');
      if (verdict) {
        verdict.textContent = 'Preview stale. Review these changes and preview the loadout again.';
      }
    }
    document.dispatchEvent(new CustomEvent('minethings:preview-invalidated', {
      detail: { form, scope }
    }));
  };
  document.addEventListener('input', (event) => {
    const form = event.target.closest?.('form');
    if (form) {
      form.dataset.liveDirty = 'true';
      if (form.matches('[data-live-preview-form]')) invalidateBoundPreview(form);
    }
  }, true);
  document.addEventListener('change', (event) => {
    const form = event.target.closest?.('form');
    if (form) {
      form.dataset.liveDirty = 'true';
      if (form.matches('[data-live-preview-form]')) invalidateBoundPreview(form);
    }
  }, true);
  document.addEventListener('submit', (event) => {
    const form = event.target.closest?.('form');
    if (form) delete form.dataset.liveDirty;
  }, true);

  const keyFor = (node) => node.nodeType === Node.ELEMENT_NODE && node.id
    ? `${node.tagName}#${node.id}` : '';
  const compatible = (current, incoming) => current?.nodeType === incoming.nodeType
    && (current.nodeType !== Node.ELEMENT_NODE || current.tagName === incoming.tagName);

  const syncAttributes = (current, incoming) => {
    const stateful = new Set(['value', 'checked', 'selected', 'open']);
    for (const attribute of [...current.attributes]) {
      if (!incoming.hasAttribute(attribute.name) && !stateful.has(attribute.name)
        && attribute.name !== 'data-live-dirty') current.removeAttribute(attribute.name);
    }
    for (const attribute of [...incoming.attributes]) {
      if (!stateful.has(attribute.name) && attribute.name !== 'data-live-dirty'
        && current.getAttribute(attribute.name) !== attribute.value) {
        current.setAttribute(attribute.name, attribute.value);
      }
    }
    const active = current === document.activeElement;
    const formIsDirty = current.closest?.('form')?.dataset.liveDirty === 'true';
    if (!active && !formIsDirty) {
      if (current instanceof HTMLInputElement) {
        current.value = incoming.value;
        current.checked = incoming.checked;
      } else if (current instanceof HTMLTextAreaElement) {
        current.value = incoming.value;
      } else if (current instanceof HTMLSelectElement) {
        current.value = incoming.value;
      }
    }
  };

  const morphNode = (current, incoming) => {
    if (!compatible(current, incoming)) {
      const replacement = incoming.cloneNode(true);
      current.replaceWith(replacement);
      return replacement;
    }
    if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
      if (current.nodeValue !== incoming.nodeValue) current.nodeValue = incoming.nodeValue;
      return current;
    }
    if (protectedPreviewScope(current)) {
      protectedForms += Math.max(1, current.querySelectorAll('form').length);
      return current;
    }
    if (dirtyForm(current)) {
      protectedForms += 1;
      return current;
    }
    syncAttributes(current, incoming);
    if (current.matches('script, style')) return current;

    const keyed = new Map([...current.children]
      .map((child) => [keyFor(child), child]).filter(([key]) => key));
    let cursor = current.firstChild;
    for (const desired of [...incoming.childNodes]) {
      const key = keyFor(desired);
      let match = key ? keyed.get(key) : null;
      if (match) {
        if (match !== cursor) current.insertBefore(match, cursor);
      } else if (cursor && !keyFor(cursor) && compatible(cursor, desired)) {
        match = cursor;
      } else {
        match = desired.cloneNode(true);
        current.insertBefore(match, cursor);
      }
      const rendered = morphNode(match, desired);
      cursor = rendered.nextSibling;
    }
    while (cursor) {
      const next = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }
    return current;
  };

  const applyDocument = (incoming) => {
    const shouldFollowChat = chatFollowingLatest;
    protectedForms = 0;
    for (const selector of ['#login', '#navcontainer', '#left', '#content']) {
      const current = document.querySelector(selector);
      const replacement = incoming.querySelector(selector);
      if (current && replacement) morphNode(current, replacement);
    }
    document.title = incoming.title;
    const incomingScript = incoming.querySelector('script[src^="/node/live-updates.js"]');
    appliedRevision = Math.max(appliedRevision,
      Number(incomingScript?.dataset.liveRevision) || 0);
    bindChatPane();
    if (shouldFollowChat) requestAnimationFrame(scrollChatToLatest);
    document.dispatchEvent(new CustomEvent('minethings:content-updated', {
      detail: { root: document.querySelector('#content'), scopes: latestScopes }
    }));
  };

  const updateContent = async () => {
    if (updateRunning) {
      updatePending = true;
      return;
    }
    updateRunning = true;
    updatePending = false;
    setStatus('Updating…', 'updating');
    try {
      const response = await fetch(window.location.href, {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'text/html', 'X-MineThings-Live-Update': '1' }
      });
      if (!response.ok) throw new Error(`Live update failed (${response.status})`);
      const incoming = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!incoming.querySelector('#content')
        || !incoming.querySelector('script[src^="/node/live-updates.js"]')) {
        throw new Error('The live session is no longer available.');
      }
      applyDocument(incoming);
      setStatus(protectedForms
        ? `Updated · preserved ${protectedForms} unfinished ${protectedForms === 1 ? 'form' : 'forms'}`
        : 'Live · updated just now', protectedForms ? 'preserved' : 'ready');
    } catch (error) {
      setStatus(`${error.message} · Retry`, 'error');
    } finally {
      updateRunning = false;
      if (updatePending && revision > appliedRevision) scheduleUpdate();
    }
  };

  const scheduleUpdate = () => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updateContent, 150);
  };
  if (chatPage) {
    bindChatPane();
    requestAnimationFrame(scrollChatToLatest);
    window.addEventListener('load', () => {
      if (chatFollowingLatest) scrollChatToLatest();
    }, { once: true });
  }
  const topics = topicsForPath(window.location.pathname).join(',');
  const stream = new EventSource(`/api/live-updates?since=${revision}&topics=${encodeURIComponent(topics)}`);
  stream.addEventListener('ready', (event) => {
    const payload = JSON.parse(event.data);
    revision = Math.max(revision, Number(payload.revision) || 0);
    appliedRevision = Math.max(appliedRevision, revision);
    setStatus('Live', 'ready');
  });
  stream.addEventListener('change', (event) => {
    const payload = JSON.parse(event.data);
    const incomingRevision = Number(payload.revision) || 0;
    revision = Math.max(revision, incomingRevision);
    if (incomingRevision <= appliedRevision) return;
    latestScopes = payload.scopes ?? [];
    if (updateRunning) updatePending = true;
    else scheduleUpdate();
  });
  stream.addEventListener('error', () => setStatus('Reconnecting live updates…', 'connecting'));
})();
