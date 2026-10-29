import React, { useRef, useState } from 'react';

const ITEMS = [
  { key: 'verbinden', label: 'Verbinden' },
  { key: 'oefenen', label: 'Training' },
  { key: 'feedback', label: 'Feedback', unavailable: true },
  { key: 'afronden', label: 'Afronden' },
  { key: 'instructeur', label: 'Instructeurinstellingen' },
  { key: 'systeemcontrole', label: 'Systeemcontrole', unavailable: true },
];

export function NavigationMenu({ screen, onNavigate }) {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const titleRef = useRef(null);
  const restoreFocusRef = useRef(true);
  const [expanded, setExpanded] = useState(false);

  function openMenu() {
    if (dialogRef.current?.open) return;
    restoreFocusRef.current = true;
    dialogRef.current.showModal();
    setExpanded(true);
    titleRef.current?.focus();
  }

  function closeMenu(returnFocus = true) {
    restoreFocusRef.current = returnFocus;
    dialogRef.current?.close();
  }

  function handleClose() {
    setExpanded(false);
    if (restoreFocusRef.current) triggerRef.current?.focus();
  }

  function navigate(key) {
    closeMenu(false);
    onNavigate(key);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="menu-button"
        aria-haspopup="dialog"
        aria-controls="main-menu"
        aria-expanded={expanded}
        onClick={openMenu}
      >
        <span aria-hidden="true">☰</span> Menu
      </button>
      <dialog id="main-menu" ref={dialogRef} className="menu-dialog" aria-labelledby="menu-title" onClose={handleClose}>
        <div className="menu-content">
          <h2 id="menu-title" ref={titleRef} tabIndex={-1}>Menu</h2>
          <nav className="menu-links" aria-label="Hoofdnavigatie">
            {ITEMS.map(({ key, label, unavailable }) => (
              <button
                key={key}
                type="button"
                disabled={unavailable}
                aria-current={screen === key ? 'page' : undefined}
                onClick={() => navigate(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <p className="menu-note">Feedback en Systeemcontrole volgen in een volgende stap.</p>
          <button type="button" className="menu-close" onClick={() => closeMenu()}>Menu sluiten</button>
        </div>
      </dialog>
    </>
  );
}
