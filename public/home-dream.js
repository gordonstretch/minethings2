(() => {
  const dialog = document.querySelector('#home-dream-dialog');
  const openButton = document.querySelector('#home-dream-open');
  const data = document.querySelector('#home-dream-data');
  if (!(dialog instanceof HTMLDialogElement) || !(openButton instanceof HTMLButtonElement)
    || !(data instanceof HTMLScriptElement)) return;

  let things;
  try {
    things = JSON.parse(data.textContent ?? '[]');
  } catch {
    return;
  }
  if (!Array.isArray(things) || !things.length) return;

  const slots = [...dialog.querySelectorAll('[data-dream-slot]')];
  const whisper = dialog.querySelector('#home-dream-whisper');
  let deck = [];
  let timer = null;
  let slotCursor = 0;

  const shuffle = () => {
    deck = [...things];
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [deck[index], deck[swap]] = [deck[swap], deck[index]];
    }
  };

  const nextThing = (currentId = '') => {
    if (!deck.length) shuffle();
    let next = deck.pop();
    if (things.length > 1 && String(next.id) === String(currentId)) {
      deck.unshift(next);
      next = deck.pop();
    }
    return next;
  };

  const paint = (slot, thing) => {
    const image = slot.querySelector('img');
    const label = slot.querySelector('span');
    if (!(image instanceof HTMLImageElement) || !(label instanceof HTMLElement)) return;
    slot.dataset.itemId = String(thing.id);
    image.src = thing.icon;
    image.alt = thing.name;
    label.textContent = thing.name;
    slot.title = `Legendary ${thing.name}`;
    if (whisper) whisper.textContent = `Legendary ${thing.name} drifts past the bed.`;
  };

  const changeThing = () => {
    const slot = slots[slotCursor % slots.length];
    slotCursor += 1;
    const next = nextThing(slot.dataset.itemId);
    slot.classList.add('is-changing');
    window.setTimeout(() => {
      paint(slot, next);
      slot.classList.remove('is-changing');
    }, 300);
  };

  const startDream = () => {
    shuffle();
    slots.forEach((slot) => paint(slot, nextThing()));
    slotCursor = 0;
    if (timer !== null) window.clearInterval(timer);
    timer = window.setInterval(changeThing, 2200);
  };

  const endDream = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    document.body.classList.remove('home-dream-open');
    openButton.focus();
  };

  openButton.addEventListener('click', () => {
    startDream();
    document.body.classList.add('home-dream-open');
    dialog.showModal();
  });
  dialog.addEventListener('close', endDream);
})();
