document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('.vehicle-comparison-sort');
  if (!button) return;
  const header = button.closest('th');
  const table = button.closest('.vehicle-comparison-table');
  const body = table?.tBodies?.[0];
  if (!header || !table || !body) return;

  const direction = header.getAttribute('aria-sort') === 'ascending'
    ? 'descending'
    : header.getAttribute('aria-sort') === 'descending'
      ? 'ascending'
      : button.dataset.sortDefault ?? 'ascending';
  const type = header.dataset.sortType;
  const columnIndex = header.cellIndex;
  const rows = [...body.rows].map((row, index) => ({ row, index }));
  rows.sort((first, second) => {
    const firstValue = first.row.cells[columnIndex]?.dataset.sortValue ?? '';
    const secondValue = second.row.cells[columnIndex]?.dataset.sortValue ?? '';
    if (!firstValue && secondValue) return 1;
    if (firstValue && !secondValue) return -1;
    let order = 0;
    if (type === 'number') order = Number(firstValue) - Number(secondValue);
    else order = firstValue.localeCompare(secondValue, 'en', { numeric: true });
    if (direction === 'descending') order *= -1;
    return order || first.index - second.index;
  });
  body.append(...rows.map(({ row }) => row));

  for (const sortableHeader of table.querySelectorAll('th[aria-sort]')) {
    sortableHeader.setAttribute('aria-sort', 'none');
    const indicator = sortableHeader.querySelector('[data-sort-indicator]');
    if (indicator) indicator.textContent = '↕';
  }
  header.setAttribute('aria-sort', direction);
  const indicator = button.querySelector('[data-sort-indicator]');
  if (indicator) indicator.textContent = direction === 'ascending' ? '↑' : '↓';
});
