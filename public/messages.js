(() => {
  const selectAll = () => document.querySelector('[data-message-select-all]');
  const messageChoices = () => [...document.querySelectorAll(
    'input[data-message-select][form="message-bulk"]'
  )];

  const syncSelection = () => {
    const control = selectAll();
    if (!control) return;
    const choices = messageChoices();
    const selected = choices.filter((choice) => choice.checked).length;
    control.disabled = choices.length === 0;
    control.checked = choices.length > 0 && selected === choices.length;
    control.indeterminate = selected > 0 && selected < choices.length;
    const count = document.querySelector('[data-message-selected-count]');
    if (count) count.textContent = String(selected);
  };

  document.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-message-select-all]')) {
      for (const choice of messageChoices()) choice.checked = event.target.checked;
      syncSelection();
      return;
    }
    if (event.target.matches?.('[data-message-select]')) syncSelection();
  });
  document.addEventListener('minethings:content-updated', syncSelection);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncSelection, { once: true });
  } else {
    syncSelection();
  }
})();
