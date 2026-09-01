for (const form of document.querySelectorAll('.admin-weather-form')) {
  const condition = form.elements.namedItem('condition');
  const temperature = form.elements.namedItem('temperatureC');
  const wind = form.elements.namedItem('windKph');
  const rainfall = form.elements.namedItem('rainfallMm');
  if (!(condition instanceof HTMLSelectElement)
    || !(temperature instanceof HTMLInputElement)
    || !(wind instanceof HTMLInputElement)
    || !(rainfall instanceof HTMLInputElement)) continue;
  condition.addEventListener('change', () => {
    const selected = condition.selectedOptions[0];
    if (!selected) return;
    temperature.value = selected.dataset.temperature ?? temperature.value;
    wind.value = selected.dataset.wind ?? wind.value;
    rainfall.value = selected.dataset.rainfall ?? rainfall.value;
  });
}
