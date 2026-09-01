(() => {
  document.addEventListener('click', (event) => {
    const control = event.target.closest?.('[data-shuttle-deselect-all]');
    if (!control) return;
    const form = control.closest('.vehicle-shuttle-form');
    if (!form) return;
    const categories = form.querySelectorAll(
      '.vehicle-shuttle-categories input[type="checkbox"]:checked'
    );
    for (const category of categories) {
      category.checked = false;
      category.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
})();
