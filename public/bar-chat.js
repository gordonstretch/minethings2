(() => {
  'use strict';

  const dataNode = document.getElementById('bar-chat-data');
  const log = document.getElementById('bar-chat-log');
  const participantsNode = document.getElementById('bar-participants');
  const statusNode = document.getElementById('bar-live-status');
  const presenceCount = document.getElementById('bar-presence-count');
  const otherCount = document.getElementById('bar-other-count');
  const form = document.getElementById('bar-compose');
  if (!dataNode || !log || !participantsNode || !statusNode) return;

  const initial = JSON.parse(dataNode.textContent);
  const visitToken = String(initial.visitToken);
  const playerId = Number(initial.playerId);
  let lastMessageId = Math.max(0, ...initial.messages.map((message) => Number(message.id)));
  let polling = false;
  let ended = false;

  function messageNode(message) {
    const article = document.createElement('article');
    article.id = `bar-message-${Number(message.id)}`;
    article.className = `bar-message${Number(message.playerId) === playerId ? ' is-own' : ''}`;
    article.dataset.barMessageId = String(message.id);
    const color = /^[0-9a-f]{6}$/i.test(String(message.color))
      ? String(message.color).toLowerCase() : '55666b';
    article.style.setProperty('--bar-speaker', `#${color}`);
    const speaker = document.createElement('a');
    speaker.className = 'bar-speaker-link';
    speaker.href = `/miners/${encodeURIComponent(message.playerName)}`;
    speaker.textContent = message.playerName;
    const body = document.createElement('p');
    body.textContent = message.body;
    const time = document.createElement('time');
    const sent = new Date(Number(message.createdAt));
    time.dateTime = sent.toISOString();
    time.title = sent.toLocaleString('en-GB');
    time.textContent = sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    article.append(speaker, body, time);
    return article;
  }

  function appendMessages(messages) {
    if (!messages.length) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.querySelector('[data-bar-empty]')?.remove();
    for (const message of messages) {
      const id = Number(message.id);
      if (!Number.isSafeInteger(id) || document.getElementById(`bar-message-${id}`)) continue;
      log.append(messageNode(message));
      lastMessageId = Math.max(lastMessageId, id);
    }
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  function renderParticipants(participants) {
    participantsNode.replaceChildren(...participants.map((participant) => {
      const item = document.createElement('li');
      item.dataset.barParticipantId = String(participant.playerId);
      const signal = document.createElement('i');
      signal.setAttribute('aria-hidden', 'true');
      const link = document.createElement('a');
      link.className = 'bar-person-link';
      link.href = `/miners/${encodeURIComponent(participant.playerName)}`;
      link.textContent = participant.playerName;
      const state = document.createElement('span');
      state.textContent = Number(participant.playerId) === playerId ? 'You' : 'At the bar';
      item.append(signal, link, state);
      return item;
    }));
    presenceCount.textContent = String(participants.length);
    otherCount.textContent = String(Math.max(0, participants.length - 1));
  }

  function endVisit(message) {
    ended = true;
    statusNode.textContent = message;
    statusNode.classList.remove('is-live');
    if (form) {
      form.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
    }
  }

  async function refresh() {
    if (polling || ended) return;
    polling = true;
    try {
      const query = new URLSearchParams({
        visitToken, afterId: String(lastMessageId)
      });
      const response = await fetch(`/api/bar?${query}`, {
        headers: { Accept: 'application/json' }, credentials: 'same-origin'
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const error = new Error(result.error || 'The bar fell silent.');
        error.terminal = response.status === 401 || response.status === 409;
        throw error;
      }
      appendMessages(result.messages ?? []);
      renderParticipants(result.participants ?? []);
      statusNode.textContent = 'Listening';
      statusNode.classList.add('is-live');
    } catch (error) {
      if (error.terminal) endVisit(error.message);
      else {
        statusNode.textContent = 'Reconnecting...';
        statusNode.classList.remove('is-live');
      }
    } finally {
      polling = false;
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (ended) return;
    const input = form.elements.body;
    const button = form.querySelector('button');
    const body = String(input.value ?? '').trim();
    if (!body) return;
    input.disabled = true;
    button.disabled = true;
    try {
      const response = await fetch('/api/bar/messages', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ visitToken, body })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'The message was not heard.');
      appendMessages(result.message ? [result.message] : []);
      input.value = '';
      statusNode.textContent = 'Heard only in this room';
      window.setTimeout(refresh, 0);
    } catch (error) {
      statusNode.textContent = error.message;
    } finally {
      if (!ended) {
        input.disabled = false;
        button.disabled = false;
        input.focus();
      }
    }
  });

  renderParticipants(initial.participants);
  log.scrollTop = log.scrollHeight;
  statusNode.classList.add('is-live');
  window.setInterval(refresh, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
})();
