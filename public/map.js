document.addEventListener('click', (event) => {
  const link = event.target.closest('.map-city-link[data-city-select]');
  if (!link) return;
  event.preventDefault();
  const form = document.createElement('form');
  form.method = 'post';
  form.action = link.dataset.citySelect;
  document.body.append(form);
  form.submit();
});
