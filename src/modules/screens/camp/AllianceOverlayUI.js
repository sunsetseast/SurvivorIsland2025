let active = null,
  previous = null,
  handler = null;
const ids = [
  "alliances-overlay",
  "create-alliance-overlay",
  "manage-alliance-overlay",
];
export function text(value, tag = "span", className = "alliance-note") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}
export function button(label, onClick, className = "rect-button") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
export function hideAllianceDialog(id) {
  const element = document.getElementById(id);
  if (element) element.style.display = "none";
  if (active === id) {
    document.removeEventListener("keydown", handler);
    active = null;
    handler = null;
    if (previous?.isConnected) previous.focus();
    previous = null;
  }
}
export function showAllianceDialog(id, onClose) {
  if (!active) previous = document.activeElement;
  if (handler) document.removeEventListener("keydown", handler);
  for (const other of ids) {
    const e = document.getElementById(other);
    if (e) e.style.display = "none";
  }
  const overlay = document.getElementById(id),
    panel = overlay?.querySelector(".overlay-panel");
  if (!panel) return;
  active = id;
  overlay.style.display = "flex";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.tabIndex = -1;
  const title = panel.querySelector("h2");
  if (title) {
    title.id ||= `${id}-title`;
    panel.setAttribute("aria-labelledby", title.id);
  }
  overlay.onclick = (e) => {
    if (e.target === overlay) onClose();
  };
  handler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    }
    if (e.key === "Tab") {
      const targets = [
        ...panel.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
        ),
      ].filter((n) => n.getClientRects().length);
      if (!targets.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0],
        last = targets.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || document.activeElement === panel)
      ) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener("keydown", handler);
  panel.querySelector("button:not(:disabled),input")?.focus();
}
