(() => {
  const form = document.querySelector('[data-mine-roster]');
  if (!form) return;
  const list = form.querySelector('.mine-roster-list');
  const orderField = form.querySelector('[data-mine-order]');
  const status = form.querySelector('[data-roster-status]');
  const limit = Number(form.dataset.activeLimit);
  const currentShift = Number(form.dataset.currentShift);
  if (!list || !orderField || !status || !Number.isSafeInteger(limit) || limit < 1
    || !Number.isSafeInteger(currentShift)) return;

  const rows = () => [...list.querySelectorAll('[data-mine-roster-row]')];
  const checkbox = (row, shiftIndex) => row.querySelector(
    `[data-roster-shift-choice][data-shift-index="${shiftIndex}"] input[type="checkbox"]`
  );

  const update = () => {
    const orderedRows = rows();
    const totals = [];
    for (const [index, row] of orderedRows.entries()) {
      const priority = row.querySelector('[data-roster-priority]');
      if (priority) priority.textContent = String(index + 1);
      const earlier = row.querySelector('[data-roster-move="earlier"]');
      const later = row.querySelector('[data-roster-move="later"]');
      if (earlier) earlier.disabled = index === 0;
      if (later) later.disabled = index === orderedRows.length - 1;
    }
    for (let shiftIndex = 0; shiftIndex < 3; shiftIndex += 1) {
      let rostered = 0;
      let working = 0;
      for (const row of orderedRows) {
        const input = checkbox(row, shiftIndex);
        const choice = input?.closest('[data-roster-shift-choice]');
        if (!input || !choice) continue;
        const isRostered = input.checked;
        const isWorking = isRostered && working < limit;
        if (isRostered) rostered += 1;
        if (isWorking) working += 1;
        choice.classList.toggle('is-working', isWorking);
        choice.classList.toggle('is-standby', isRostered && !isWorking);
        choice.classList.toggle('is-off', !isRostered);
        const cellState = choice.querySelector('[data-roster-cell-state]');
        if (cellState) {
          cellState.textContent = isWorking ? 'Working' : isRostered ? 'Standby' : 'Off duty';
        }
      }
      const standby = Math.max(0, rostered - working);
      totals.push({ rostered, working, standby });
      const count = form.querySelector(
        `[data-roster-shift-card][data-shift-index="${shiftIndex}"] [data-roster-shift-count]`
      );
      if (count) count.textContent = `${working} working${standby ? ` · ${standby} standby` : ''}`;
    }
    for (const row of orderedRows) {
      const currentInput = checkbox(row, currentShift);
      const currentChoice = currentInput?.closest('[data-roster-shift-choice]');
      row.classList.toggle('is-active', Boolean(currentChoice?.classList.contains('is-working')));
    }
    orderField.value = orderedRows.map((row) => row.dataset.mineId).join(',');
    const workingNow = form.closest('main')?.querySelector('[data-roster-current-working]');
    const standbyNow = form.closest('main')?.querySelector('[data-roster-current-standby]');
    if (workingNow) workingNow.textContent = String(totals[currentShift]?.working ?? 0);
    if (standbyNow) standbyNow.textContent = String(totals[currentShift]?.standby ?? 0);
    const dailyAssignments = totals.reduce((sum, shift) => sum + shift.working, 0);
    status.textContent = `${dailyAssignments} of ${limit * 3} available robot-shifts assigned. Standby robots take over only when their priority reaches the active allowance.`;
  };

  form.addEventListener('change', (event) => {
    if (event.target.matches?.('.mine-shift-choice input[type="checkbox"]')) update();
  });
  form.addEventListener('click', (event) => {
    const move = event.target.closest?.('[data-roster-move]');
    if (move) {
      const row = move.closest('[data-mine-roster-row]');
      if (!row) return;
      if (move.dataset.rosterMove === 'earlier' && row.previousElementSibling) {
        list.insertBefore(row, row.previousElementSibling);
      } else if (move.dataset.rosterMove === 'later' && row.nextElementSibling) {
        list.insertBefore(row.nextElementSibling, row);
      }
      update();
      return;
    }
    const fillShift = event.target.closest?.('[data-roster-fill-shift]');
    const clearShift = event.target.closest?.('[data-roster-clear-shift]');
    if (fillShift || clearShift) {
      const shiftIndex = Number((fillShift ?? clearShift).dataset[
        fillShift ? 'rosterFillShift' : 'rosterClearShift'
      ]);
      for (const [index, row] of rows().entries()) {
        const input = checkbox(row, shiftIndex);
        if (input) input.checked = Boolean(fillShift) && index < limit;
      }
      update();
      return;
    }
    if (event.target.closest?.('[data-roster-fill-all]')) {
      for (const [index, row] of rows().entries()) {
        for (let shiftIndex = 0; shiftIndex < 3; shiftIndex += 1) {
          const input = checkbox(row, shiftIndex);
          if (input) input.checked = index < limit;
        }
      }
      update();
      return;
    }
    if (event.target.closest?.('[data-roster-clear-all]')) {
      for (const row of rows()) {
        for (let shiftIndex = 0; shiftIndex < 3; shiftIndex += 1) {
          const input = checkbox(row, shiftIndex);
          if (input) input.checked = false;
        }
      }
      update();
    }
  });
  form.addEventListener('submit', update);
  update();
})();
