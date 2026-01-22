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

        console.log('[NpcAutoRenderer] renderFor', viewName, 'NPC count:', survivorsHere.length);

        dbg("NPCs at location", {
            viewName,
            survivors: survivorsHere,
            locationMap: { ...npcLocationSystem.locations }
        });

        if (survivorsHere.length === 0) {
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
                pointer-events: none;
            `
        });

        survivorsHere.forEach(survivor => {
            const icon = createElement("div", {
                className: "npc-icon",
                dataset: { npcId: String(survivor.id) },
                style: `
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
                `
            });

            const currentViewName = viewName;

            icon.addEventListener("click", () => {
                eventManager.publish(GameEvents.NPC_CONFRONTATION, {
                    survivor,
                    location: currentViewName
                });
            });

            iconContainer.appendChild(icon);
        });

        layer.appendChild(iconContainer);

        dbg("NPC ICONS RENDERED", { count: survivorsHere.length, viewName });
    }

    normalizeViewName(viewName) {
        if (!viewName || typeof viewName !== "string") {
            return viewName;
        }

        const trimmed = viewName.trim();
        const normalizedMap = {
            [LocationKeys.SHELTER.toLowerCase()]: LocationKeys.SHELTER,
            [LocationKeys.CAMPFIRE.toLowerCase()]: LocationKeys.CAMPFIRE,
            [LocationKeys.WATER_WELL.toLowerCase()]: LocationKeys.WATER_WELL,
            [LocationKeys.BEACH.toLowerCase()]: LocationKeys.BEACH,
            [LocationKeys.ROCKY_SHORE.toLowerCase()]: LocationKeys.ROCKY_SHORE,
            [LocationKeys.WATERFALL_TRAIL.toLowerCase()]: LocationKeys.WATERFALL_TRAIL,
            [LocationKeys.JUNGLE_TRAIL.toLowerCase()]: LocationKeys.JUNGLE_TRAIL,
            [LocationKeys.MOUNTAIN_TRAIL.toLowerCase()]: LocationKeys.MOUNTAIN_TRAIL,
            [LocationKeys.TREE_MAIL.toLowerCase()]: LocationKeys.TREE_MAIL,
            [LocationKeys.TRIBE_FLAG.toLowerCase()]: LocationKeys.TRIBE_FLAG,
            [LocationKeys.FORK1.toLowerCase()]: LocationKeys.FORK1,
            [LocationKeys.FORK2.toLowerCase()]: LocationKeys.FORK2,
            [LocationKeys.FORK3.toLowerCase()]: LocationKeys.FORK3,
            [LocationKeys.FIREWOOD.toLowerCase()]: LocationKeys.FIREWOOD,
            [LocationKeys.BAMBOO.toLowerCase()]: LocationKeys.BAMBOO,
            [LocationKeys.SHAKE.toLowerCase()]: LocationKeys.SHAKE,
            [LocationKeys.FISHING.toLowerCase()]: LocationKeys.FISHING,
            [LocationKeys.FIRE.toLowerCase()]: LocationKeys.FIRE,
            [LocationKeys.SUMMARY.toLowerCase()]: LocationKeys.SUMMARY,
            [LocationKeys.STRATEGY_SUMMARY.toLowerCase()]: LocationKeys.STRATEGY_SUMMARY,
            flag: LocationKeys.TRIBE_FLAG,
            treemail: LocationKeys.TREE_MAIL,
            rocky: LocationKeys.ROCKY_SHORE
        };

        const lower = trimmed.toLowerCase();
        const normalized = lower.replace(/[\s_-]+/g, "");
        if (normalizedMap[lower]) {
            return normalizedMap[lower];
        }
        if (normalizedMap[normalized]) {
            return normalizedMap[normalized];
        }

        if (/view$/i.test(trimmed)) {
            const currentView = window?.campScreen?.currentView;
            if (currentView) {
                return currentView;
            }

            const baseName = trimmed.replace(/view$/i, "");
            const baseLower = baseName.toLowerCase();
            const baseNormalized = baseLower.replace(/[\s_-]+/g, "");
            if (normalizedMap[baseLower]) {
                return normalizedMap[baseLower];
            }
            if (normalizedMap[baseNormalized]) {
                return normalizedMap[baseNormalized];
            }

            return baseName.charAt(0).toLowerCase() + baseName.slice(1);
        }

        return trimmed;
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
