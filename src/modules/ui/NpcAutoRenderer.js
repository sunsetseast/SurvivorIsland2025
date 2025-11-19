/**
 * @module NpcAutoRenderer
 * Automatically injects NPC icons into ANY Camp View that loads.
 * Works with new location keys and CampScreen’s CAMP_VIEW_LOADED event.
 */
window.debugBanner = window.debugBanner || function(){};
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { gameManager } from "../core/index.js";
import eventManager, { GameEvents } from "../core/EventManager.js";
import { createElement } from "../utils/DOMUtils.js";

// Use your existing debug banner (CampScreen has it globally)
const dbg = window.debugBanner || function(){};

class NpcAutoRenderer {
    constructor() {
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;
        this.initialized = true;

        dbg("NpcAutoRenderer INITIALIZED");

        // 🟢 Listen for camp view changes
        eventManager.subscribe(GameEvents.CAMP_VIEW_LOADED, ({ viewName }) => {
            dbg("Event: CAMP_VIEW_LOADED received by NpcAutoRenderer", viewName);
            this.renderFor(viewName);
        });

        // 🟢 Listen for tribe creation → assign NPC locations
        eventManager.subscribe(GameEvents.TRIBES_CREATED, () => {
            const tribe = gameManager.getPlayerTribe();
            dbg("Event: TRIBES_CREATED", { tribe });

            if (tribe) {
                npcLocationSystem.assignLocationsForPhase(tribe.members);
                dbg("NpcAutoRenderer triggered NPC location assignment", tribe.members);
            }
        });
    }

    /**
     * Called by CampScreen after the view is loaded.
     */
    renderFor(viewName) {
        dbg("NpcAutoRenderer.renderFor()", viewName);

        const container = document.getElementById("camp-content");
        if (!container) {
            dbg("❌ No #camp-content container found");
            return;
        }

        this.renderNPCs(viewName, container);
    }

    /**
     * Internal icon renderer.
     */
    renderNPCs(viewName, container) {
        if (!container) {
            dbg("❌ renderNPCs called with NO container");
            return;
        }

        // Clear old icons
        const old = container.querySelectorAll(".npc-icon-container");
        old.forEach(el => el.remove());

        // Get NPCs at this location
        const survivors = npcLocationSystem.getSurvivorsAtLocation(viewName);

        dbg("NPCs at location", {
            viewName,
            survivors,
            locationMap: { ...npcLocationSystem.locations }
        });

        if (!survivors || survivors.length === 0) {
            dbg("No survivors found for view", viewName);
            return;
        }

        // Create the container
        const iconContainer = createElement("div", {
            className: "npc-icon-container",
            style: `
                position: absolute;
                top: 14px;
                left: 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                z-index: 999;
                pointer-events: auto;
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
                    box-shadow: 0 0 6px rgba(0,0,0,0.65);
                    cursor: pointer;
                    background: rgba(0,0,0,0.25);
                `
            });

            icon.addEventListener("click", () => {
                eventManager.publish("npc:iconClicked", {
                    survivor,
                    location: viewName
                });
            });

            iconContainer.appendChild(icon);
        });

        container.appendChild(iconContainer);

        dbg("NPC ICONS RENDERED", { count: survivors.length, viewName });
    }
}

const npcAutoRenderer = new NpcAutoRenderer();
export default npcAutoRenderer;