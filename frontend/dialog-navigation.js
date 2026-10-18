// SPDX-License-Identifier: AGPL-3.0-only
// Reuse native dialog close/cancel events for mouse, Escape and Android Back.
export function mountDialogNavigation({canReturn}) {
  const parents = new Map();
  function watch(dialog) {
    if (dialog.dataset.navigationReady) return;
    dialog.dataset.navigationReady = 'true';
    dialog.addEventListener('close', () => {
      const parent = parents.get(dialog);
      parents.delete(dialog);
      if (parent && canReturn() && !document.querySelector('dialog[open]')) {
        parent.showModal();
      }
    });
  }
  return {
    openChild(childId, parentId) {
      const child = document.getElementById(childId);
      const parent = document.getElementById(parentId);
      watch(child);
      if (parent.open) { parents.set(child, parent); parent.close(); }
      child.showModal();
    },
    dismissAll() {
      parents.clear();
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    }
  };
}
