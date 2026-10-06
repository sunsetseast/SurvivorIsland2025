import eventManager, { GameEvents } from "../core/EventManager.js";
import { buildPlayerScrambleRead } from "./ScramblePresentation.js";
export function textNode(tag, className, text) {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}
export function readButton(label, action, className = "") {
  const e = textNode("button", `scramble-button ${className}`, label);
  e.type = "button";
  e.addEventListener("click", action);
  return e;
}
export function renderReadSections(container, read) {
  container.replaceChildren();
  const jump = textNode("nav", "scramble-read-jump", "");
  jump.setAttribute("aria-label", "Jump to your notes");
  for (const [label, titles, available] of [
    ["Names", ["Names you’ve heard"], read.names.length],
    [
      "Promises",
      ["Your promises", "Promises to you"],
      read.yourPromises.length || read.promisesToYou.length,
    ],
    [
      "Stories",
      ["Different stories", "Warnings & reassurance"],
      read.contradictions.length || read.warnings.length,
    ],
  ])
    if (available)
      jump.appendChild(
        readButton(label, () => {
          const d = [...container.querySelectorAll("details")].find((d) =>
            titles.includes(d.querySelector("summary").textContent),
          );
          if (d) {
            d.open = true;
            d.scrollIntoView({ block: "start" });
            d.querySelector("summary").focus({ preventScroll: true });
          }
        }),
      );
  if (jump.children.length > 1) container.appendChild(jump);
  const section = (title, rows, { open = false, render = null } = {}) => {
    if (!rows.length) return;
    const d = document.createElement("details");
    d.className = "scramble-read-section";
    d.open = open;
    d.appendChild(textNode("summary", "", title));
    const body = textNode("div", "scramble-read-rows", "");
    for (const r of rows) {
      const row = textNode("article", "scramble-read-row", "");
      if (render) render(row, r);
      else {
        row.appendChild(textNode("p", "", r.text));
        if (r.source)
          row.appendChild(textNode("span", "scramble-source", r.source));
      }
      body.appendChild(row);
    }
    d.appendChild(body);
    container.appendChild(d);
  };
  section("Names you’ve heard", read.names, {
    open: true,
    render(row, g) {
      row.appendChild(textNode("h3", "", g.name));
      for (const r of g.lines)
        row.append(
          textNode("p", "", r.text),
          textNode("span", "scramble-source", r.source),
        );
    },
  });
  section("Warnings & reassurance", read.warnings, { open: true });
  section("Different stories", read.contradictions, { open: true });
  section("Your promises", read.yourPromises, { open: true });
  section("Promises to you", read.promisesToYou, { open: true });
  section("Your alliances", read.alliances, {
    render(row, a) {
      row.append(
        textNode("h3", "", a.name),
        textNode("p", "", a.roster),
        textNode("span", "scramble-source", `${a.type} · Your read: ${a.read}`),
      );
      if (a.lastDiscussed)
        row.appendChild(
          textNode("p", "", `Last discussed: ${a.lastDiscussed}`),
        );
      if (a.recent) row.appendChild(textNode("p", "", a.recent));
    },
  });
  section("Working together", read.coalitionClaims);
  section("Idol information", read.idols);
  section("Things you noticed", read.observations);
  if (!container.children.length)
    container.appendChild(
      textNode(
        "p",
        "scramble-read-empty",
        "You haven’t heard a plan yet. Talk to people and see where the night is going.",
      ),
    );
}
export class ScrambleNotebook {
  constructor(gm) {
    this.gm = gm;
    this.unsubscribers = [];
  }
  open(returnFocus = document.activeElement) {
    this.close(false);
    this.returnFocus = returnFocus;
    const d = document.createElement("dialog");
    d.className = "scramble-notebook";
    d.setAttribute("aria-labelledby", "scramble-read-title");
    const header = textNode("header", "scramble-read-header", "");
    header.append(
      textNode("p", "scramble-eyebrow", "Your side of the story"),
      textNode("h2", "", "What I Know"),
    );
    header.querySelector("h2").id = "scramble-read-title";
    header.appendChild(
      textNode(
        "p",
        "",
        "What people said. What you promised. What you noticed.",
      ),
    );
    const content = textNode("div", "scramble-read-content", ""),
      footer = textNode("footer", "scramble-read-footer", "");
    footer.append(
      readButton("Alliance notebook", () => {
        this.close();
        globalThis.window?.openAlliancesOverlay?.();
      }),
      readButton("Back to camp", () => this.close(), "primary"),
    );
    d.append(header, content, footer);
    document.body.appendChild(d);
    this.dialog = d;
    this.content = content;
    this.refresh();
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.close();
    });
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          this.close();
      }
    });
    const on = (event, fn) =>
      this.unsubscribers.push(eventManager.subscribe(event, fn));
    on("camp:readUpdated", () => this.refresh());
    on("camp:timeAdvanced", () => this.refresh());
    on(GameEvents.GAME_LOADED, () => this.close(false));
    on(GameEvents.GAME_PHASE_CHANGED, () => this.close(false));
    d.showModal();
    footer.lastChild.focus({ preventScroll: true });
  }
  refresh() {
    if (!this.content) return;
    const open = new Map(
        [...this.content.querySelectorAll("details")].map((d) => [
          d.querySelector("summary").textContent,
          d.open,
        ]),
      ),
      scroll = this.content.scrollTop,
      focused = this.content.contains(document.activeElement)
        ? document.activeElement.closest("details")?.querySelector("summary")
            .textContent
        : null;
    renderReadSections(this.content, buildPlayerScrambleRead(this.gm));
    for (const d of this.content.querySelectorAll("details"))
      if (open.has(d.querySelector("summary").textContent))
        d.open = open.get(d.querySelector("summary").textContent);
    this.content.scrollTop = scroll;
    if (focused)
      [...this.content.querySelectorAll("summary")]
        .find((s) => s.textContent === focused)
        ?.focus({ preventScroll: true });
  }
  close(restoreFocus = true) {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.content = null;
    for (const off of this.unsubscribers.splice(0)) off();
    if (restoreFocus && this.returnFocus?.isConnected)
      this.returnFocus.focus({ preventScroll: true });
  }
}
