/**
 * @module NpcAutoRenderer
 * Automatically injects NPC icons into ANY Camp View that loads.
 */

import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { gameManager } from "../core/index.js";
import eventManager, { GameEvents } from "../core/EventManager.js";
import { createElement } from "../utils/DOMUtils.js";

class NpcAutoRenderer {
    constructor() {
        this.active = false;
    }

    initialize() {
        if (this.active) {
            console.log(`⚠️ NpcAutoRenderer already initialized`);
            return;
        }
        this.active = true;
        console.log(`✅ NpcAutoRenderer initialized and subscribed to CAMP_VIEW_LOADED`);

        // Listen to the actual event fired by CampScreen
        eventManager.subscribe(GameEvents.CAMP_VIEW_LOADED, ({ viewName, container }) => {
            console.log(`🔔 CAMP_VIEW_LOADED event received for: "${viewName}"`);
            this.renderNPCs(viewName, container);
        });
    }

    renderNPCs(viewName, container) {
        console.log(`🎯 NpcAutoRenderer.renderNPCs called for viewName: "${viewName}"`);
        
        if (!container) {
            console.log(`❌ No container provided`);
            return;
        }

        // Clear old NPC icons
        const oldIcons = container.querySelectorAll(".npc-icon");
        oldIcons.forEach(icon => icon.remove());

        // Get NPCs assigned to this location
        const survivors = npcLocationSystem.getSurvivorsAtLocation(viewName);
        console.log(`📍 Survivors at location "${viewName}":`, survivors);
        
        if (!survivors || survivors.length === 0) {
            console.log(`⚠️ No survivors at this location`);
            return;
        }

        // Create NPC icon stack
        const iconContainer = createElement("div", {
            className: "npc-icon-container",
            style: `
                position: absolute;
                top: 14px;
                left: 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                z-index: 50;
            `
        });

        survivors.forEach(survivor => {
            const icon = createElement("img", {
                className: "npc-icon",
                src: survivor.avatarUrl,
                alt: survivor.firstName,
                style: `
                    width: 55px;
                    height: 55px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 0 6px rgba(0,0,0,0.6);
                    cursor: pointer;
                `
            });

            icon.addEventListener("click", () => {
                eventManager.publish("NPC_ICON_CLICKED", {
                    survivor,
                    location: viewName
                });
            });

            iconContainer.appendChild(icon);
        });

        container.appendChild(iconContainer);
    }
}

const npcAutoRenderer = new NpcAutoRenderer();
export default npcAutoRenderer;