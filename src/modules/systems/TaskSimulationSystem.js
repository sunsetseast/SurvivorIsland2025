import { clamp, getRandomInt } from '../utils/CommonUtils.js';
import { GamePhase } from '../core/GameManager.js';

const SHELTER_REQUIREMENTS = { bamboo: 5, palms: 1 };
const FIRE_REQUIREMENTS = { firewood: 10 };

const DEFAULT_DELTAS = {
  bamboo: 0,
  palms: 0,
  firewood: 0,
  coconuts: 0,
  fish1: 0,
  fish2: 0,
  fish3: 0
};

const RESOURCE_DISPLAY_NAMES = {
  bamboo: 'bamboo',
  palms: 'palms',
  firewood: 'firewood',
  coconuts: 'coconuts',
  fish1: 'small fish',
  fish2: 'big fish',
  fish3: 'rare fish'
};

export default class TaskSimulationSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
  }

  runCheckpoint(checkpoint, { triggerDramaEvent = true } = {}) {
    const gm = this.gameManager;
    if (!gm) return null;

    gm.flags = gm.flags || {};
    const isMid = checkpoint === 'mid';
    const flagKey = isMid ? 'taskSimMidCompleted' : 'taskSimEndCompleted';
    const idKey = isMid ? 'taskSimMidReportId' : 'taskSimEndReportId';

    if (gm.flags[flagKey]) {
      console.log(`[TaskSim] checkpoint ${checkpoint} already completed`);
      return null;
    }

    const tribe = gm.getPlayerTribe?.() || gm.playerTribe;
    if (!tribe) return null;

    console.log(`[TaskSim] running checkpoint ${checkpoint}`);

    const report = this.buildCheckpointReportBase(checkpoint, tribe);
    this.simulateGatherPass(checkpoint, tribe, report);
    if (checkpoint === 'end') {
      this.simulateBuildPass(checkpoint, tribe, report);
      this.applyFloatAssistCredits(report, tribe);
    } else {
      this.populateMidpointSnapshots(tribe, report);
      this.evaluateMidpointIntent(report, tribe);
    }
    this.finalizeCheckpoint(report, tribe, { triggerDramaEvent });

    gm.flags[flagKey] = true;
    gm.flags[idKey] = report.id;
    gm.saveGame?.();

    return report;
  }

  buildCheckpointReportBase(checkpoint, tribe) {
    const gm = this.gameManager;
    const day = gm.getCurrentDay?.() ?? gm.day ?? 1;
    const phaseId = gm.taskSystem?.getCurrentPhaseId?.(gm) ?? gm.getCurrentCampPhaseId?.() ?? `day${day}_phase1`;
    const stockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
    const stockpileBefore = this.cloneStockpile(stockpile);
    const assignments = this.getAssignmentsFromPlanOrTasks(gm, tribe);

    return {
      id: `${day}_${checkpoint}_${phaseId}`,
      day,
      phaseId,
      checkpoint,
      tribeId: tribe.id ?? tribe.name ?? tribe.tribeId ?? 'tribe',
      stockpileBefore: { ...stockpileBefore },
      stockpileAfter: { ...stockpileBefore },
      deltas: { ...DEFAULT_DELTAS },
      assignments,
      contributions: [],
      builds: {
        shelter: {
          required: { ...SHELTER_REQUIREMENTS },
          hadBefore: {},
          succeeded: false,
          attemptedBy: null,
          pivotedToGather: false,
          gatheredByBuilder: {},
          missing: {},
          blamed: []
        },
        fire: {
          required: { ...FIRE_REQUIREMENTS },
          hadBefore: {},
          succeeded: false,
          attemptedBy: null,
          pivotedToGather: false,
          gatheredByBuilder: {},
          missing: {},
          blamed: []
        }
      },
      teamPlayerDeltas: [],
      relationshipDeltasProposed: [],
      relationshipDeltasApplied: [],
      drama: { shouldTrigger: false, score: 0, reasons: [], candidates: [] },
      uiIntent: null,
      floatCredits: []
    };
  }

  simulateGatherPass(checkpoint, tribe, report) {
    const gm = this.gameManager;
    const assignments = report.assignments || {};
    const gatherRoles = Object.keys(assignments).filter(role => ['wood', 'resources', 'float'].includes(role));

    gatherRoles.forEach(role => {
      const ids = assignments[role] || [];
      ids.forEach(id => {
        const survivor = this.getSurvivorById(tribe, id);
        if (!survivor) return;
        const effort = this.getWorkMultiplier(survivor);

        if (role === 'resources') {
          const coconuts = this.rollAmount(0, 2, effort);
          const palms = this.rollAmount(0, 1, effort);
          if (coconuts) this.addContribution(id, role, 'coconuts', coconuts, report, tribe);
          if (palms) this.addContribution(id, role, 'palms', palms, report, tribe);
        } else if (role === 'wood') {
          const bamboo = this.rollAmount(0, 3, effort);
          const firewood = this.rollAmount(0, 4, effort);
          if (bamboo) this.addContribution(id, role, 'bamboo', bamboo, report, tribe);
          if (firewood) this.addContribution(id, role, 'firewood', firewood, report, tribe);
        } else if (role === 'float') {
          const picks = ['bamboo', 'palms', 'firewood', 'coconuts'];
          const chosen = picks[getRandomInt(0, picks.length - 1)];
          const max = chosen === 'firewood' ? 4 : chosen === 'bamboo' ? 3 : chosen === 'coconuts' ? 2 : 1;
          const amount = this.rollAmount(0, max, effort);
          if (amount) this.addContribution(id, role, chosen, amount, report, tribe);
        }
      });
    });
  }

  simulateBuildPass(checkpoint, tribe, report) {
    const gm = this.gameManager;
    const assignments = report.assignments || {};
    const playerId = gm.getPlayerSurvivor?.()?.id;

    const runBuild = (buildType, requirements) => {
      const buildData = report.builds[buildType];
      const assignedIds = assignments[buildType] || [];
      const primaryBuilderId = assignedIds[0] ?? null;
      buildData.attemptedBy = primaryBuilderId;

      const stockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
      buildData.hadBefore = this.pickRequirementSnapshot(stockpile, requirements);

      if (!primaryBuilderId) return;
      const isPlayerAssigned = playerId && assignedIds.some(id => String(id) === String(playerId));
      const playerDidBuild = this.didPlayerBuild(buildType, playerId);

      let builderId = primaryBuilderId;
      if (
        checkpoint === 'end' &&
        isPlayerAssigned &&
        !playerDidBuild &&
        String(primaryBuilderId) === String(playerId)
      ) {
        const missing = this.computeMissing(requirements, stockpile);
        const missingTotal = Object.values(missing).reduce((sum, amount) => sum + amount, 0);
        if (missingTotal > 0) {
          buildData.missing = { ...missing };
          const blamed = this.resolveBlame(buildType, missing, assignments, report);
          buildData.blamed = blamed;
          this.addBlameDeltas(report, builderId, blamed, missing, buildType);
          console.log(`[TaskSim] ${buildType} build skipped by player, missing materials`);
          return;
        }

        builderId = this.selectStepUpBuilder(assignedIds, assignments, playerId) || primaryBuilderId;
        if (builderId && String(builderId) !== String(playerId)) {
          this.pushRelationshipDelta(
            report,
            builderId,
            playerId,
            -3,
            `stepped_up_${buildType}`,
            ['npc_step_up', buildType]
          );
        }
      }

      buildData.attemptedBy = builderId;

      const attempt = this.tryConsumeAndBuild(tribe, buildType, requirements, report, builderId);
      if (attempt.success) {
        buildData.succeeded = true;
        console.log(`[TaskSim] ${buildType} build succeeded`);
        return;
      }

      if (attempt.missing) {
        buildData.pivotedToGather = true;
        console.log(`[TaskSim] ${buildType} build blocked, pivoting to gather`);

        Object.entries(attempt.missing).forEach(([resource, missingAmount]) => {
          const gathered = this.rollBuilderGatherAmount(missingAmount, this.getSurvivorById(tribe, builderId));
          if (gathered > 0) {
            buildData.gatheredByBuilder[resource] = (buildData.gatheredByBuilder[resource] || 0) + gathered;
            this.addContribution(builderId, buildType, resource, gathered, report, tribe);
          }
        });

        const retry = this.tryConsumeAndBuild(tribe, buildType, requirements, report, builderId);
        if (retry.success) {
          buildData.succeeded = true;
          console.log(`[TaskSim] ${buildType} build succeeded after pivot`);
          return;
        }

        buildData.missing = { ...(retry.missing || attempt.missing) };
        const blamed = this.resolveBlame(buildType, buildData.missing, assignments, report);
        buildData.blamed = blamed;
        this.addBlameDeltas(report, builderId, blamed, buildData.missing, buildType);
        console.log(`[TaskSim] ${buildType} build still blocked after pivot`);
      }
    };

    runBuild('fire', FIRE_REQUIREMENTS);
    runBuild('shelter', SHELTER_REQUIREMENTS);
  }

  populateMidpointSnapshots(tribe, report) {
    const gm = this.gameManager;
    const stockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
    Object.entries(report.builds).forEach(([buildType, buildData]) => {
      buildData.hadBefore = this.pickRequirementSnapshot(stockpile, buildData.required || {});
      buildData.attemptedBy = (report.assignments?.[buildType] || [])[0] ?? null;
    });
  }

  evaluateMidpointIntent(report, tribe) {
    const gm = this.gameManager;
    const playerId = gm.getPlayerSurvivor?.()?.id;
    if (gm.day !== 1 || gm.gamePhase !== GamePhase.PRE_CHALLENGE) {
      report.uiIntent = null;
      report.drama.shouldTrigger = false;
      return;
    }
    const stockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
    const assignments = report.assignments || {};
    let dramaCandidate = null;
    let builderReady = null;

    Object.entries(report.builds).forEach(([buildType, buildData]) => {
      const required = buildData.required || {};
      const missing = this.computeMissing(required, stockpile);
      const missingEntries = Object.entries(missing || {});
      if (!missingEntries.length) {
        const assignedIds = assignments[buildType] || [];
        if (playerId && assignedIds.some(id => String(id) === String(playerId)) && !builderReady) {
          builderReady = {
            type: 'builder_ready',
            builderId: playerId,
            buildType
          };
        }
        return;
      }

      const requiredTotal = Object.values(required).reduce((sum, amt) => sum + amt, 0) || 1;
      const missingTotal = missingEntries.reduce((sum, [, amt]) => sum + amt, 0);
      const missingFraction = missingTotal / requiredTotal;
      const [topic, missingAmount] = missingEntries.sort((a, b) => b[1] - a[1])[0] || ['bamboo', 0];
      const blamedId = this.resolveBlame(buildType, { [topic]: missingAmount }, assignments, report)[0] || null;

      if (missingFraction >= 0.3 && blamedId && buildData.attemptedBy && !dramaCandidate) {
        dramaCandidate = {
          type: 'drama',
          builderId: buildData.attemptedBy,
          blamedId,
          topic,
          missing: { ...missing },
          required: { ...required },
          buildType
        };
      }
    });

    report.drama.shouldTrigger = Boolean(dramaCandidate);
    report.uiIntent = dramaCandidate || builderReady;
    if (dramaCandidate) {
      report.drama.candidates.push({
        type: 'callout',
        builderId: dramaCandidate.builderId,
        blamedId: dramaCandidate.blamedId,
        topic: dramaCandidate.topic,
        intensity: clamp(
          (dramaCandidate.missing?.[dramaCandidate.topic] / (dramaCandidate.required?.[dramaCandidate.topic] || 1)) || 0,
          0,
          1
        ),
        context: {
          required: dramaCandidate.required?.[dramaCandidate.topic] || 0,
          had: report.builds?.[dramaCandidate.buildType]?.hadBefore?.[dramaCandidate.topic] || 0,
          missing: dramaCandidate.missing?.[dramaCandidate.topic] || 0,
          pivoted: false
        }
      });
    }

    console.log(`[TaskSim] midpoint intent: ${report.uiIntent?.type || 'none'}`);
  }

  finalizeCheckpoint(report, tribe, { triggerDramaEvent = true } = {}) {
    const gm = this.gameManager;
    const stockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
    report.stockpileAfter = this.cloneStockpile(stockpile);

    gm.campLog = gm.campLog || [];
    gm.campLog.push({ ...report, type: 'checkpoint_report', timestamp: Date.now() });

    const shouldApply =
      report.checkpoint === 'end' ||
      report.uiIntent?.type !== 'drama' ||
      !triggerDramaEvent;
    if (shouldApply) {
      report.relationshipDeltasApplied = this.applyRelationshipDeltas(report.relationshipDeltasProposed);
    }

    gm.taskSystem?.ingestCampLogForTribe?.(gm, tribe);

    if (report.relationshipDeltasApplied.length) {
      console.log(`[TaskSim] applied relationship deltas (${report.relationshipDeltasApplied.length})`);
    }
  }

  addContribution(survivorId, role, resource, amount, report, tribe) {
    const gm = this.gameManager;
    if (!amount || amount <= 0) return;
    const stockpileKey = resource === 'coconut' ? 'coconuts' : resource;
    const safeResource = stockpileKey === 'coconut' ? 'coconuts' : stockpileKey;

    report.contributions.push({
      survivorId,
      role,
      resource: safeResource,
      amount,
      source: 'sim'
    });

    if (report.deltas[safeResource] != null) {
      report.deltas[safeResource] += amount;
    }

    if (gm.addToStockpile) {
      gm.addToStockpile(tribe, safeResource, amount);
    }
    const stockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
    report.stockpileAfter = this.cloneStockpile(stockpile);

    const entry = {
      day: gm.getCurrentDay?.() ?? gm.day ?? 1,
      actorId: survivorId,
      role,
      resource: safeResource === 'coconuts' ? 'coconut' : safeResource,
      amount,
      source: 'sim',
      timestamp: Date.now()
    };

    if (['coconuts', 'fish1', 'fish2', 'fish3'].includes(safeResource)) {
      entry.type = 'camp_contribute_food';
      entry.food = {
        coconuts: safeResource === 'coconuts' ? amount : 0,
        fish1: safeResource === 'fish1' ? amount : 0,
        fish2: safeResource === 'fish2' ? amount : 0,
        fish3: safeResource === 'fish3' ? amount : 0
      };
      if (safeResource.startsWith('fish')) {
        entry.fish = {
          type: Number(safeResource.replace('fish', '')),
          count: amount
        };
        entry.count = amount;
      }
    } else {
      entry.type = 'camp_contribute';
      entry.resources = { [safeResource]: amount };
      entry[safeResource] = amount;
    }

    gm.campLog = gm.campLog || [];
    gm.campLog.push(entry);

    console.log(`[TaskSim] contributions ${safeResource} +${amount} (role=${role})`);
  }

  tryConsumeAndBuild(tribe, buildType, requirements, report, attemptedById) {
    const gm = this.gameManager;
    if (!tribe || !requirements) return { success: false };

    const stockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
    const missing = this.computeMissing(requirements, stockpile);
    const missingTotal = Object.values(missing).reduce((sum, amount) => sum + amount, 0);

    if (missingTotal > 0) {
      return { success: false, missing };
    }

    Object.entries(requirements).forEach(([resource, amount]) => {
      gm.consumeFromStockpile?.(tribe, resource, amount);
      if (report.deltas[resource] != null) {
        report.deltas[resource] -= amount;
      }
    });

    const updatedStockpile = gm.ensureStockpileExists?.(tribe) ?? tribe.stockpile ?? {};
    report.stockpileAfter = this.cloneStockpile(updatedStockpile);

    const beforeValue = buildType === 'shelter' ? tribe.shelter || 0 : tribe.fire || 0;
    const afterValue = beforeValue + 1;

    if (buildType === 'shelter') tribe.shelter = afterValue;
    if (buildType === 'fire') tribe.fire = afterValue;

    const entry = {
      type: buildType === 'shelter' ? 'camp_shelter_build' : 'camp_fire_build',
      day: gm.getCurrentDay?.() ?? gm.day ?? 1,
      actorId: attemptedById,
      success: true,
      phase: 'build',
      timestamp: Date.now()
    };

    if (buildType === 'shelter') {
      entry.shelterBefore = beforeValue;
      entry.shelterAfter = afterValue;
    } else {
      entry.fireBefore = beforeValue;
      entry.fireAfter = afterValue;
    }

    gm.campLog = gm.campLog || [];
    gm.campLog.push(entry);

    return { success: true };
  }

  getAssignmentsFromPlanOrTasks(gameManager, tribe) {
    const assignments = {
      fire: [],
      shelter: [],
      wood: [],
      resources: [],
      water: [],
      float: []
    };

    const plan = tribe?.day1Plan || tribe?.plan || {};

    const mergeIds = (target, values) => {
      const existing = assignments[target] || [];
      const next = [...existing];
      (values || []).forEach(value => {
        if (value == null) return;
        const id = typeof value === 'object' ? value.id : value;
        if (id == null) return;
        const key = String(id);
        if (!next.some(existingId => String(existingId) === key)) {
          next.push(id);
        }
      });
      assignments[target] = next;
    };

    if (plan) {
      mergeIds('fire', plan.fireIds || plan.fire || plan.fireTeam || plan.fireBuilder);
      mergeIds('shelter', plan.shelterIds || plan.shelter || plan.shelterTeam);
      mergeIds('wood', plan.woodIds || plan.wood || plan.woodTeam || plan.materialsIds || plan.materials || plan.materialsTeam);
      mergeIds('resources', plan.resourcesIds || plan.resources || plan.resourcesTeam || plan.foodIds || plan.food || plan.foodTeam);
      mergeIds('float', plan.floatIds || plan.floaterIds || plan.float || plan.floatTeam || plan.floaters);
      mergeIds('water', plan.waterIds || plan.waterTeam);
    }

    if (!Object.values(assignments).some(list => list.length)) {
      const tasks = tribe?.taskState?.tasks || [];
      tasks.forEach(task => {
        if (!task?.role || !Array.isArray(task.assignedIds)) return;
        if (!assignments[task.role]) assignments[task.role] = [];
        mergeIds(task.role, task.assignedIds);
      });
    }

    return assignments;
  }

  getPlayerRole(tribe) {
    const gm = this.gameManager;
    const playerId = gm.getPlayerSurvivor?.()?.id;
    if (!playerId) return null;
    const assignments = this.getAssignmentsFromPlanOrTasks(gm, tribe);
    return Object.keys(assignments).find(role => assignments[role].some(id => String(id) === String(playerId))) || null;
  }

  selectStepUpBuilder(assignedIds = [], assignments = {}, playerId) {
    const nonPlayer = assignedIds.find(id => String(id) !== String(playerId));
    if (nonPlayer) return nonPlayer;
    const floatId = (assignments.float || []).find(id => String(id) !== String(playerId));
    if (floatId) return floatId;
    const woodId = (assignments.wood || []).find(id => String(id) !== String(playerId));
    return woodId || null;
  }

  rollBuilderGatherAmount(missingAmount, survivor) {
    if (!missingAmount || missingAmount <= 0) return 0;
    const effort = this.getWorkMultiplier(survivor);
    const base = clamp(Math.round(missingAmount * effort), 1, missingAmount);
    return clamp(base, 0, missingAmount);
  }

  resolveBlame(buildType, missing, assignments, report) {
    if (!missing) return [];
    const missingEntries = Object.entries(missing);
    if (!missingEntries.length) return [];

    const [resource] = missingEntries.sort((a, b) => b[1] - a[1])[0];
    const roleKey = this.getResponsibleRole(resource);
    if (!roleKey) return [];
    const roleIds = assignments[roleKey] || [];
    if (!roleIds.length) return [];

    const scored = roleIds.map(id => ({
      id,
      amount: this.getContributionAmount(report, id, resource)
    }));
    scored.sort((a, b) => a.amount - b.amount);
    const blamedId = scored[0]?.id;
    return blamedId ? [blamedId] : [];
  }

  addBlameDeltas(report, builderId, blamedIds, missing, buildType) {
    if (!builderId || !blamedIds?.length) return;
    const missingTotal = Object.values(missing || {}).reduce((sum, amt) => sum + amt, 0);
    const delta = missingTotal >= 4 ? -5 : -2;
    blamedIds.forEach(blamedId => {
      this.pushRelationshipDelta(
        report,
        builderId,
        blamedId,
        delta,
        `missed_${buildType}_delivery`,
        ['blame', buildType]
      );
    });
  }

  applyFloatAssistCredits(report, tribe) {
    const gm = this.gameManager;
    const assignments = report.assignments || {};
    const floatIds = assignments.float || [];
    if (!floatIds.length) return;

    Object.entries(report.builds).forEach(([buildType, buildData]) => {
      const missing = this.computeMissing(buildData.required || {}, buildData.hadBefore || {});
      const missingEntries = Object.entries(missing || {});
      if (!missingEntries.length) return;

      const creditedFloats = new Set();
      missingEntries.forEach(([resource, missingAmount]) => {
        if (!missingAmount) return;
        const roleKey = this.getResponsibleRole(resource);
        if (!roleKey) return;
        const responsibleIds = assignments[roleKey] || [];
        if (!responsibleIds.length) return;

        const floatContribution = floatIds.reduce((sum, id) => sum + this.getContributionAmount(report, id, resource), 0);
        if (!floatContribution) return;

        floatIds.forEach(floatId => {
          if (creditedFloats.has(floatId)) return;
          const contributorAmount = this.getContributionAmount(report, floatId, resource);
          if (!contributorAmount) return;
          creditedFloats.add(floatId);
          const delta = clamp(getRandomInt(1, 3), 1, 3);
          this.applyTeamPlayerDelta(report, tribe, floatId, delta, 'float_step_up');

          if (buildData.attemptedBy) {
            this.pushRelationshipDelta(
              report,
              buildData.attemptedBy,
              floatId,
              2,
              `float_help_${buildType}`,
              ['float_credit', buildType]
            );
          }

          const floatSurvivor = this.getSurvivorById(tribe, floatId);
          const floatName = floatSurvivor?.firstName || 'Float';
          const resourceName = RESOURCE_DISPLAY_NAMES[resource] || resource;
          report.floatCredits.push({
            floatId,
            buildType,
            resource,
            amount: contributorAmount,
            teamPlayerDelta: delta,
            text: `${floatName} stepped up when the assigned gatherer fell short on ${resourceName}.`
          });

          gm.campLog = gm.campLog || [];
          gm.campLog.push({
            type: 'float_step_up',
            day: gm.getCurrentDay?.() ?? gm.day ?? 1,
            floatId,
            buildType,
            resource,
            amount: contributorAmount,
            teamPlayerDelta: delta,
            text: `${floatName} stepped up when the assigned gatherer fell short on ${resourceName}.`
          });
        });
      });
    });
  }

  applyTeamPlayerDelta(report, tribe, survivorId, delta, reason) {
    if (!survivorId || !delta) return;
    const survivor = this.getSurvivorById(tribe, survivorId);
    if (!survivor) return;
    const current = Number.isFinite(survivor.teamPlayer) ? survivor.teamPlayer : 50;
    survivor.teamPlayer = clamp(current + delta, 0, 100);
    report.teamPlayerDeltas.push({ survivorId, delta, reason });
  }

  getResponsibleRole(resource) {
    if (['bamboo', 'firewood'].includes(resource)) return 'wood';
    if (['palms', 'coconuts'].includes(resource)) return 'resources';
    return null;
  }

  getContributionAmount(report, survivorId, resource) {
    if (!report?.contributions?.length) return 0;
    return report.contributions
      .filter(entry => String(entry.survivorId) === String(survivorId) && entry.resource === resource)
      .reduce((sum, entry) => sum + (entry.amount || 0), 0);
  }

  pushRelationshipDelta(report, fromId, toId, delta, reason, tags = []) {
    if (!fromId || !toId || !delta) return;
    report.relationshipDeltasProposed.push({
      fromId,
      toId,
      delta,
      reason,
      tags: Array.isArray(tags) ? tags : []
    });
  }

  applyRelationshipDeltas(deltas) {
    const gm = this.gameManager;
    const relationshipSystem = gm.systems?.relationshipSystem;
    const applied = [];

    (deltas || []).forEach(delta => {
      if (!delta?.fromId || !delta?.toId || !delta?.delta) return;
      if (relationshipSystem?.changeRelationship) {
        relationshipSystem.changeRelationship(delta.fromId, delta.toId, delta.delta);
      } else {
        gm.campLog = gm.campLog || [];
        gm.campLog.push({
          type: 'relationship_delta',
          day: gm.getCurrentDay?.() ?? gm.day ?? 1,
          timestamp: Date.now(),
          ...delta
        });
      }
      applied.push({ ...delta });
    });

    return applied;
  }

  didPlayerBuild(buildType, playerId) {
    if (!playerId) return false;
    const gm = this.gameManager;
    const day = gm.getCurrentDay?.() ?? gm.day ?? 1;
    const type = buildType === 'shelter' ? 'camp_shelter_build' : 'camp_fire_build';
    return (gm.campLog || []).some(entry => entry.type === type && entry.actorId === playerId && entry.day === day);
  }

  getSurvivorById(tribe, survivorId) {
    if (!tribe?.members) return null;
    return tribe.members.find(member => String(member.id) === String(survivorId)) || null;
  }

  getWorkMultiplier(survivor) {
    const teamPlayer = Number.isFinite(survivor?.teamPlayer) ? survivor.teamPlayer : 5;
    const lazy = Number.isFinite(survivor?.lazy)
      ? survivor.lazy
      : Number.isFinite(survivor?.laziness)
        ? survivor.laziness
        : 5;
    const adjustment = clamp((teamPlayer - lazy + 10) / 10, 0.6, 1.4);
    return adjustment;
  }

  rollAmount(min, max, multiplier = 1) {
    const raw = getRandomInt(min, max);
    return clamp(Math.round(raw * multiplier), min, max);
  }

  pickRequirementSnapshot(stockpile, requirements) {
    const snapshot = {};
    Object.keys(requirements).forEach(key => {
      snapshot[key] = stockpile?.[key] ?? 0;
    });
    return snapshot;
  }

  computeMissing(requirements, stockpile) {
    const missing = {};
    Object.entries(requirements || {}).forEach(([key, value]) => {
      const had = stockpile?.[key] ?? 0;
      const diff = value - had;
      if (diff > 0) missing[key] = diff;
    });
    return missing;
  }

  cloneStockpile(stockpile = {}) {
    return {
      firewood: stockpile.firewood || 0,
      bamboo: stockpile.bamboo || 0,
      palms: stockpile.palms || 0,
      water: stockpile.water || 0,
      coconuts: stockpile.coconuts || 0,
      fish1: stockpile.fish1 || 0,
      fish2: stockpile.fish2 || 0,
      fish3: stockpile.fish3 || 0
    };
  }
}
