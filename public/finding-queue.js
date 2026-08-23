(() => {
  const dialog = document.querySelector('#finding-dialog');
  const cards = document.querySelector('#finding-dialog-cards');
  const acknowledge = document.querySelector('#finding-dialog-ack');
  const status = document.querySelector('#finding-dialog-status');
  if (!dialog || !cards || !acknowledge || !status) return;

  const leaseKey = 'minethings-finding-lease';
  let timer = null;
  let activeToken = sessionStorage.getItem(leaseKey) ?? '';
  const minimumInterval = Number(dialog.dataset.pollMinInterval);
  const emptyInterval = Number(dialog.dataset.pollEmptyInterval);
  const maximumInterval = Number(dialog.dataset.pollMaxInterval);

  const schedule = (delay = emptyInterval) => {
    clearTimeout(timer);
    timer = setTimeout(poll,
      Math.max(minimumInterval, Math.min(Number(delay) || emptyInterval, maximumInterval)));
  };

  async function poll() {
    const flashDialog = document.querySelector('#flash-dialog');
    const meldDialog = document.querySelector('#meld-dialog');
    if (dialog.open || flashDialog?.open || meldDialog?.open) {
      schedule(minimumInterval);
      return;
    }
    try {
      const query = activeToken ? `?lease=${encodeURIComponent(activeToken)}` : '';
      const response = await fetch(`/api/findings${query}`, {
        credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Finding poll failed (${response.status})`);
      const delivery = await response.json();
      if (delivery.state !== 'ready') {
        schedule(delivery.retryAfterMs);
        return;
      }
      activeToken = delivery.token;
      sessionStorage.setItem(leaseKey, activeToken);
      if (document.querySelector('#meld-dialog')?.open) {
        schedule(minimumInterval);
        return;
      }
      cards.innerHTML = delivery.html;
      const total = delivery.findings.reduce((sum, finding) => sum + finding.quantity, 0);
      const rare = delivery.findings.some((finding) => Number(finding.rarity) >= 5);
      const title = dialog.querySelector('#finding-dialog-title');
      const eyebrow = dialog.querySelector('#finding-dialog-eyebrow');
      const intro = dialog.querySelector('#finding-dialog-intro');
      dialog.classList.toggle('finding-dialog-rare', rare);
      dialog.classList.toggle('finding-dialog-routine', !rare);
      eyebrow.textContent = rare ? 'Rare discovery' : 'Mining report';
      title.textContent = rare
        ? (total === 1 ? 'An extraordinary discovery!' : `${total.toLocaleString('en-GB')} exceptional discoveries!`)
        : (total === 1 ? '1 new thing found' : `${total.toLocaleString('en-GB')} new things found`);
      intro.textContent = rare
        ? 'Purple and Orange finds deserve a closer look.'
        : 'Your latest finds are ready to review.';
      status.textContent = rare
        ? 'This rare discovery is recorded. Explore it, or keep digging.'
        : 'Everything is recorded safely. Review it or keep digging.';
      acknowledge.disabled = false;
      dialog.showModal();
      title.focus();
    } catch {
      schedule(emptyInterval);
    }
  }

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  async function acknowledgeFindings(destination = '') {
    if (!activeToken) return;
    acknowledge.disabled = true;
    status.textContent = destination ? 'Opening your discovery…' : 'Recording the occasion…';
    try {
      const response = await fetch('/api/findings/ack', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ token: activeToken })
      });
      if (!response.ok) throw new Error(`Finding acknowledgement failed (${response.status})`);
      activeToken = '';
      sessionStorage.removeItem(leaseKey);
      cards.replaceChildren();
      dialog.close();
      if (destination) window.location.assign(destination);
      else schedule(minimumInterval);
    } catch {
      status.textContent = 'Could not acknowledge these findings. They remain safe; please try again.';
      acknowledge.disabled = false;
    }
  }

  acknowledge.addEventListener('click', () => acknowledgeFindings());
  cards.addEventListener('click', (event) => {
    const destination = event.target.closest('a');
    if (!destination) return;
    event.preventDefault();
    acknowledgeFindings(destination.href);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !dialog.open) schedule(minimumInterval);
  });
  poll();
})();
