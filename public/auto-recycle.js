(() => {
  const initialize = () => {
    const form = document.querySelector('.auto-recycle-form');
    const submit = document.querySelector('#auto-recycle-submit');
    if (!form || !submit || form.dataset.autoRecycleReady === 'true') return;
    form.dataset.autoRecycleReady = 'true';

    const update = () => {
      const choices = [...form.querySelectorAll('input[name^="recycle_"]')];
      for (const choice of choices) {
        const [, cityId, itemId] = choice.name.split('_');
        const quantity = form.elements.namedItem(`quantity_${cityId}_${itemId}`);
        if (quantity) quantity.disabled = !choice.checked;
      }
      submit.disabled = !choices.some((choice) => choice.checked);
    };
    form.addEventListener('change', update);
    update();
  };
  initialize();
  document.addEventListener('minethings:content-updated', initialize);
})();
