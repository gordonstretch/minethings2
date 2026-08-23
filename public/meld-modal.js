(() => {
  const dialog = document.querySelector('#meld-dialog');
  const acknowledge = document.querySelector('#meld-dialog-ack');
  const title = document.querySelector('#meld-dialog-title');
  if (!dialog || !acknowledge || !title) return;

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  acknowledge.addEventListener('click', () => dialog.close());
  dialog.showModal();
  title.focus();
})();
