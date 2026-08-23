(() => {
  const notice = document.querySelector('#flash-dialog');
  const message = document.querySelector('#flash-dialog-message');
  const dismiss = notice?.querySelector('button');
  if (!notice || !message || !dismiss) return;

  const scrollKey = 'minethings-submit-scroll';
  let hideTimer = null;

  const showFlash = (text) => {
    const cleanText = String(text ?? '').trim();
    if (!cleanText) return;
    message.textContent = cleanText;
    notice.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { notice.hidden = true; }, 8000);
  };

  dismiss.addEventListener('click', () => {
    clearTimeout(hideTimer);
    notice.hidden = true;
  });

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
  showFlash(message.textContent);

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
    const requiresPageNavigation = form.classList.contains('inventory-meld-form')
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
      const nextCity = nextDocument.querySelector('.city-name');
      const currentCity = document.querySelector('.city-name');
      if (nextCity && currentCity) currentCity.replaceWith(document.importNode(nextCity, true));
      document.title = nextDocument.title;
      window.history.replaceState(null, '', `${destination.pathname}${destination.search}${destination.hash}`);
      requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));

      showFlash(nextDocument.querySelector('#flash-dialog-message')?.textContent);
    } catch {
      rememberScroll();
      HTMLFormElement.prototype.submit.call(form);
    } finally {
      delete form.dataset.submitting;
      if (submitter) submitter.disabled = false;
    }
  });
})();
