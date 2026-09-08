(() => {
  const form = document.querySelector('[data-vehicle-convoy-form]');
  if (!form) return;
  const minimum = Number(form.dataset.minSize);
  const maximum = Number(form.dataset.maxSize);
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)
    || minimum < 2 || maximum < minimum) return;
  const companions = [...form.querySelectorAll(
    '[data-convoy-choice] input[type="checkbox"][name^="vehicle_"]'
  )];
  const status = form.querySelector('[data-convoy-selection-status]');
  const order = form.querySelector('[data-convoy-order]');
  const available = form.querySelector('[data-convoy-available]');
  const orderField = form.querySelector('[data-convoy-member-order]');
  if (!status || !order || !available || !orderField) return;
  const maximumCompanions = maximum - 1;

  const sortAvailable = () => {
    const rows = [...available.querySelectorAll('[data-convoy-choice]')];
    rows.sort((first, second) =>
      Number(first.dataset.originalIndex) - Number(second.dataset.originalIndex));
    for (const row of rows) available.append(row);
  };

  const update = () => {
    const selectedCompanions = companions.filter((checkbox) => checkbox.checked).length;
    const total = selectedCompanions + 1;
    for (const checkbox of companions) {
      checkbox.disabled = !checkbox.checked && selectedCompanions >= maximumCompanions;
    }
    const orderedRows = [...order.querySelectorAll('[data-convoy-choice]')];
    for (const [index, row] of orderedRows.entries()) {
      row.classList.add('is-selected');
      const position = row.querySelector('[data-convoy-position]');
      if (position) position.textContent = String(index + 1);
      const earlier = row.querySelector('[data-convoy-move="earlier"]');
      const later = row.querySelector('[data-convoy-move="later"]');
      if (earlier) earlier.disabled = index === 0;
      if (later) later.disabled = index === orderedRows.length - 1;
    }
    for (const row of available.querySelectorAll('[data-convoy-choice]')) {
      row.classList.remove('is-selected');
    }
    orderField.value = orderedRows.map((row) => row.dataset.vehicleId).join(',');
    orderField.disabled = false;
    if (total < minimum) {
      const needed = minimum - total;
      status.textContent = `${total} of ${maximum} transports selected. Select at least ${needed} more.`;
    } else if (total === maximum) {
      status.textContent = `${total} of ${maximum} transports selected. Convoy is full.`;
    } else {
      const available = maximum - total;
      status.textContent = `${total} of ${maximum} transports selected. You can select up to ${available} more.`;
    }
  };

  form.addEventListener('change', (event) => {
    if (!event.target.matches?.('input[type="checkbox"][name^="vehicle_"]')) return;
    const row = event.target.closest('[data-convoy-choice]');
    if (!row) return;
    if (event.target.checked) order.append(row);
    else {
      available.append(row);
      sortAvailable();
    }
    update();
  });
  form.addEventListener('click', (event) => {
    const control = event.target.closest?.('[data-convoy-move]');
    if (!control) return;
    const row = control.closest('[data-convoy-choice]');
    if (!row || row.parentElement !== order) return;
    if (control.dataset.convoyMove === 'earlier' && row.previousElementSibling) {
      order.insertBefore(row, row.previousElementSibling);
    } else if (control.dataset.convoyMove === 'later' && row.nextElementSibling) {
      order.insertBefore(row.nextElementSibling, row);
    }
    update();
  });
  form.addEventListener('reset', () => setTimeout(() => {
    for (const checkbox of companions) {
      const row = checkbox.closest('[data-convoy-choice]');
      if (row && !checkbox.checked) available.append(row);
    }
    const leader = form.querySelector('[data-convoy-locked]');
    if (leader) order.append(leader);
    sortAvailable();
    update();
  }, 0));
  update();
})();
