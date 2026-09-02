(() => {
  'use strict';

  const burst = document.querySelector('#bot-build-burst');
  const close = burst?.querySelector('.bot-build-burst-close');
  const progress = burst?.querySelector('#bot-build-burst-progress');
  const shout = burst?.querySelector('#bot-build-burst-shout');
  const text = burst?.querySelector('#bot-build-burst-text');
  const install = burst?.querySelector('#bot-build-burst-install');
  if (!burst || !close || !progress || !shout || !text || !install) return;

  const seenStorageKey = 'minethings-bot-build-notice';
  let hideTimer = null;

  const seenKey = () => {
    try { return sessionStorage.getItem(seenStorageKey) ?? ''; } catch { return ''; }
  };
  const rememberKey = (key) => {
    try { sessionStorage.setItem(seenStorageKey, key); } catch {}
  };
  const hide = () => {
    clearTimeout(hideTimer);
    hideTimer = null;
    burst.hidden = true;
  };
  const detailsFromElement = (element) => ({
    noticeKey: element.dataset.noticeKey ?? '',
    step: Number(element.dataset.step ?? 0),
    colour: element.style.getPropertyValue('--bot-burst-colour').trim(),
    progress: element.querySelector('#bot-build-burst-progress')?.textContent ?? '',
    shout: element.querySelector('#bot-build-burst-shout')?.textContent ?? '',
    text: element.querySelector('#bot-build-burst-text')?.textContent ?? '',
    install: element.querySelector('#bot-build-burst-install')?.textContent ?? ''
  });
  const show = (detail) => {
    const noticeKey = String(detail?.noticeKey ?? '').trim();
    if (!noticeKey || noticeKey === seenKey()) return;
    progress.textContent = String(detail.progress ?? '');
    shout.textContent = String(detail.shout ?? '');
    text.textContent = String(detail.text ?? '');
    install.textContent = String(detail.install ?? '');
    burst.dataset.noticeKey = noticeKey;
    burst.dataset.step = String(Number(detail.step) || 0);
    const colour = String(detail.colour ?? '').trim();
    if (/^#[0-9a-f]{6}$/iu.test(colour)) {
      burst.style.setProperty('--bot-burst-colour', colour);
    }
    rememberKey(noticeKey);
    clearTimeout(hideTimer);
    burst.hidden = false;
    hideTimer = setTimeout(hide, 12000);
  };

  close.addEventListener('click', hide);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !burst.hidden) hide();
  });
  document.addEventListener('minethings:bot-build-part', (event) => show(event.detail));

  if (burst.dataset.active === '1') show(detailsFromElement(burst));
})();
