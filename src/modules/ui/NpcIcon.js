/**
 * NpcIcon.js
 * Creates clickable circular NPC avatar icons.
 */

import { createElement } from "../utils/DOMUtils.js";
import gameManager from "../core/GameManager.js";

export function createNpcIcon(survivor, onClick) {
    const icon = createElement("div", "npc-icon");

    const img = createElement("img", "npc-icon-img");
    img.src = survivor.portrait;   // Your survivor portrait image path
    img.alt = survivor.name;

    icon.appendChild(img);

    // Label (small name under icon)
    const label = createElement("div", "npc-icon-label");
    label.textContent = survivor.name;
    icon.appendChild(label);

    icon.addEventListener("click", () => {
        if (typeof onClick === "function") {
            onClick(survivor);
        }
    });

    return icon;
}