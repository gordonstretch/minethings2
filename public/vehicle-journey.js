(() => {
  const maximumLegs = 12;
  const bound = new WeakSet();

  const selectedDestination = (select) => Number(
    select?.selectedOptions?.[0]?.dataset.destinationCityId
  );

  const bindPlanner = (form) => {
    if (bound.has(form)) return;
    const first = form.querySelector('[data-journey-first]');
    const list = form.querySelector('[data-journey-legs]');
    const add = form.querySelector('[data-add-journey-leg]');
    const summary = form.querySelector('[data-journey-summary]');
    const data = form.querySelector('[data-journey-routes]');
    if (!first || !list || !add || !summary || !data) return;

    let routes;
    try {
      routes = JSON.parse(data.textContent);
    } catch {
      add.disabled = true;
      summary.textContent = 'Onward route information is unavailable.';
      return;
    }
    const byOrigin = new Map();
    for (const route of routes) {
      const origin = Number(route.originCityId);
      if (!byOrigin.has(origin)) byOrigin.set(origin, []);
      byOrigin.get(origin).push(route);
    }
    const protectUnsentItinerary = () => {
      form.dataset.liveDirty = 'true';
    };

    const fillSelect = (select, options, selectedRouteId = null) => {
      select.replaceChildren();
      for (const route of options) {
        const option = document.createElement('option');
        option.value = String(route.routeId);
        option.dataset.destinationCityId = String(route.destinationCityId);
        option.textContent = route.label;
        option.selected = Number(route.routeId) === Number(selectedRouteId);
        select.append(option);
      }
    };

    const refresh = () => {
      let origin = selectedDestination(first);
      const rows = [...list.querySelectorAll('li')];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const select = row.querySelector('select');
        const options = byOrigin.get(origin) ?? [];
        if (!options.length) {
          for (const trailing of rows.slice(index)) trailing.remove();
          break;
        }
        const selectedRouteId = select.value;
        fillSelect(select, options, selectedRouteId);
        select.name = `journeyRoute_${index + 1}`;
        row.querySelector('[data-leg-label]').textContent = `Leg ${index + 2}`;
        origin = selectedDestination(select);
      }
      const currentRows = [...list.querySelectorAll('li')];
      const lastSelect = currentRows.at(-1)?.querySelector('select') ?? first;
      const finalDestination = selectedDestination(lastSelect);
      add.disabled = first.disabled || currentRows.length + 1 >= maximumLegs
        || !(byOrigin.get(finalDestination)?.length);
      const legCount = currentRows.length + 1;
      const finalLabel = lastSelect.selectedOptions[0]?.textContent ?? 'selected destination';
      summary.textContent = legCount === 1
        ? 'Add an onward leg to continue automatically after arrival. Cargo stays aboard until the final stop.'
        : `${legCount} legs planned. Final stop: ${finalLabel}. Each onward leg departs immediately.`;
    };

    const appendLeg = () => {
      const previous = list.lastElementChild?.querySelector('select') ?? first;
      const origin = selectedDestination(previous);
      const options = byOrigin.get(origin) ?? [];
      if (!options.length || list.children.length + 1 >= maximumLegs) return;
      const row = document.createElement('li');
      const label = document.createElement('label');
      const labelText = document.createElement('span');
      const select = document.createElement('select');
      const remove = document.createElement('button');
      labelText.dataset.legLabel = '';
      label.append(labelText, select);
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        protectUnsentItinerary();
        row.remove();
        refresh();
      });
      select.addEventListener('change', refresh);
      row.append(label, remove);
      list.append(row);
      fillSelect(select, options);
      refresh();
      select.focus();
    };

    first.addEventListener('change', refresh);
    add.addEventListener('click', () => {
      protectUnsentItinerary();
      appendLeg();
    });
    bound.add(form);
    refresh();
  };

  const bind = () => document.querySelectorAll('[data-journey-planner]').forEach(bindPlanner);
  document.addEventListener('minethings:content-updated', bind);
  bind();
})();
