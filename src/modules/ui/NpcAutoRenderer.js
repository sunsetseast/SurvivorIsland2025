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
import { LocationKeys } from "../core/LocationKeys.js";
import { normalizeLocationKey } from "../locations/LocationUtils.js";

// Use your existing debug banner (CampScreen has it globally)
const dbg = window.debugBanner || function(){};

class NpcAutoRenderer {
    constructor() {
        this.initialized = false;
        this.lastKnownPhase = null;
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

        eventManager.subscribe(GameEvents.CAMP_EVENT_STARTED, () => {
            const layer = this.ensureNpcLayer();
            if (layer) {
                layer.innerHTML = "";
            }
        });

        eventManager.subscribe(GameEvents.CAMP_EVENT_ENDED, () => {
            if (gameManager.flags?.campEventActive) return;

            const npcSystem = gameManager?.systems?.npcLocationSystem || npcLocationSystem;
            if (!gameManager || !npcSystem?.assignLocationsForPhase) {
                console.warn?.("NpcAutoRenderer: NPC location system unavailable after camp event");
            } else {
                const currentPhase = gameManager?.getGamePhase?.()
                    || gameManager?.gamePhase
                    || this.lastKnownPhase
                    || "preChallenge";

                try {
                    npcSystem.assignLocationsForPhase(gameManager?.survivors, currentPhase);
                } catch (error) {
                    console.warn?.("NpcAutoRenderer: Failed to assign NPC locations after camp event", error);
                }
            }

            const viewName = window.campScreen?.currentView || this.lastViewName;
            if (viewName) {
                this.renderFor(viewName);
            }
        });

        eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, ({ phase }) => {
            this.lastKnownPhase = phase;
        });

        eventManager.subscribe("npc:locationUpdated", () => {
            if (this.lastViewName) {
                this.renderFor(this.lastViewName);
            }
        });

        // 🟢 Listen for tribe creation → assign NPC locations
        eventManager.subscribe(GameEvents.TRIBES_CREATED, () => {
            const tribe = gameManager.getPlayerTribe();
            dbg("Event: TRIBES_CREATED", { tribe });

            if (tribe) {
                npcLocationSystem.assignLocationsForPhase(tribe.members, gameManager?.getGamePhase?.() || gameManager?.gamePhase);
                dbg("NpcAutoRenderer triggered NPC location assignment", tribe.members);
            }
        });
    }

    /**
     * Called by CampScreen after the view is loaded.
     */
    renderFor(viewName) {
        const normalizedViewName = this.normalizeViewName(viewName);
        dbg("NpcAutoRenderer.renderFor()", normalizedViewName);

        this.lastViewName = normalizedViewName;

        const layer = this.ensureNpcLayer();
        if (!layer) {
            dbg("❌ No #camp-content container found");
            return;
        }

        layer.innerHTML = "";

        if (gameManager.flags?.campEventActive) {
            return;
        }

        this.renderNPCs(normalizedViewName, layer);
    }

    /**
     * Internal icon renderer.
     */
    renderNPCs(viewName, layer) {
        if (!layer) {
            dbg("❌ renderNPCs called with NO layer");
            return;
        }

        layer.innerHTML = "";

        // Get NPCs at this location
        const survivorsHere = npcLocationSystem.getSurvivorsAtLocation(viewName) || [];
        const absentSet = gameManager.flags?.absentFromCampIds;
        const filtered = absentSet ? survivorsHere.filter(s => !absentSet.has(s.id)) : survivorsHere;

        console.log('[NpcAutoRenderer] renderFor', viewName, 'NPC count:', filtered.length);

        dbg("NPCs at location", {
            viewName,
            survivors: survivorsHere,
            locationMap: { ...npcLocationSystem.locations }
        });

        if (filtered.length === 0) {
            dbg("No survivors found for view", viewName);
            return;
        }

        const isTribeFlagView = viewName === LocationKeys.TRIBE_FLAG;
        const iconContainer = createElement("div", {
            className: "npc-icon-container",
            style: `
                position: absolute;
                top: ${isTribeFlagView ? "0" : "14px"};
                left: ${isTribeFlagView ? "0" : "14px"};
                display: ${isTribeFlagView ? "block" : "flex"};
                flex-direction: column;
                gap: 10px;
                width: ${isTribeFlagView ? "100%" : "auto"};
                height: ${isTribeFlagView ? "100%" : "auto"};
                z-index: 999;
                pointer-events: none;
            `
        });

        filtered.forEach(survivor => {
            const baseStyle = `
                width: 55px;
                height: 55px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 0 6px rgba(0,0,0,0.65);
                cursor: pointer;
                background: rgba(0,0,0,0.25);
                background-image: url('${survivor.avatarUrl}');
                background-size: cover;
                background-position: center;
                pointer-events: auto;
            `;

            const icon = createElement("div", {
                className: "npc-icon",
                dataset: { npcId: String(survivor.id) },
                style: `
                    ${baseStyle}
                `
            });

            const currentViewName = viewName;

            icon.addEventListener("click", () => {
                eventManager.publish(GameEvents.NPC_CONFRONTATION, {
                    survivor,
                    location: currentViewName
                });
            });

            if (isTribeFlagView) {
                const positions = [
                    { top: "16%", left: "6%" },
                    { bottom: "20%", left: "6%" },
                    { top: "16%", right: "6%" },
                    { bottom: "20%", right: "6%" },
                    { bottom: "8%", left: "22%" },
                    { bottom: "8%", right: "22%" }
                ];
                const base = positions[iconContainer.childElementCount % positions.length];
                const stackIndex = Math.floor(iconContainer.childElementCount / positions.length);
                const offset = stackIndex * 6;
                Object.assign(icon.style, {
                    position: "absolute",
                    top: base.top ?? "auto",
                    bottom: base.bottom ?? "auto",
                    left: base.left ?? "auto",
                    right: base.right ?? "auto",
                    transform: `translate(${offset}px, ${offset}px)`
                });
            }

            iconContainer.appendChild(icon);
        });

        layer.appendChild(iconContainer);
        this.renderDebugOverlay(viewName, filtered, layer);

        dbg("NPC ICONS RENDERED", { count: filtered.length, viewName });
    }

    normalizeViewName(viewName) {
        if (!viewName || typeof viewName !== "string") {
            return viewName;
        }

        const normalized = normalizeLocationKey(viewName);
        if (normalized) {
            return normalized;
        }

        if (/view$/i.test(viewName)) {
            const currentView = window?.campScreen?.currentView;
            if (currentView) {
                return currentView;
            }
        }

        return viewName;
    }

    renderDebugOverlay(viewName, survivorsHere, layer) {
        const idolSystem = gameManager.systems?.idolSystem;
        const isDebug = idolSystem?.isDebugMode?.() === true;
        if (!isDebug || !layer) return;

        const overlay = createElement("div", {
            className: "npc-debug-overlay",
            style: `
                position: absolute;
                bottom: 8px;
                left: 8px;
                background: rgba(0, 0, 0, 0.6);
                color: #fff;
                font-size: 12px;
                padding: 6px 8px;
                border-radius: 6px;
                z-index: 1000;
                pointer-events: none;
                max-width: 240px;
                line-height: 1.3;
            `
        });

        const rendered = survivorsHere.map(survivor => {
            const loc = normalizeLocationKey(npcLocationSystem.locations?.[survivor.id]) || "unknown";
            return `${survivor.firstName || survivor.id} (${loc})`;
        });

        overlay.innerText = `View: ${viewName}\nNPCs: ${rendered.join(", ") || "none"}`;
        layer.appendChild(overlay);
    }

    ensureNpcLayer() {
        const camp = document.getElementById("camp-content");
        if (!camp) {
            return null;
        }

        let layer = camp.querySelector("#npc-layer");
        if (!layer) {
            layer = document.createElement("div");
            layer.id = "npc-layer";
            layer.style.position = "absolute";
            layer.style.inset = "0";
            layer.style.zIndex = "55";
            layer.style.pointerEvents = "none";
            camp.style.position = camp.style.position || "relative";
            camp.appendChild(layer);
        }

        return layer;
    }
}

const npcAutoRenderer = new NpcAutoRenderer();
export default npcAutoRenderer;
