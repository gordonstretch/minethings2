(() => {
  const breakpoint = window.matchMedia('(max-width: 820px)');
  let mobileOpen = false;
  let boundButton = null;

  const elements = () => ({
    button: document.querySelector('#player-nav-toggle'),
    panel: document.querySelector('#player-nav-panel')
  });

  const render = () => {
    const { button, panel } = elements();
    if (!button || !panel) return;
    const collapsible = breakpoint.matches;
    panel.hidden = collapsible && !mobileOpen;
    button.setAttribute('aria-expanded', String(collapsible && mobileOpen));
    button.querySelector('b')?.replaceChildren(document.createTextNode(mobileOpen ? '−' : '+'));
  };

  const bind = () => {
    const { button } = elements();
    if (!button) return;
    if (button !== boundButton) {
      boundButton = button;
      button.addEventListener('click', () => {
        mobileOpen = !mobileOpen;
        render();
        if (mobileOpen) {
          document.querySelector('#navlist a[aria-current="page"], #navlist a')?.focus();
        }
      });
    }
    render();
  };

  document.documentElement.classList.add('navigation-ready');
  breakpoint.addEventListener('change', () => {
    mobileOpen = false;
    render();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !mobileOpen) return;
    mobileOpen = false;
    render();
    boundButton?.focus();
  });
  document.addEventListener('minethings:content-updated', bind);
  bind();
})();
