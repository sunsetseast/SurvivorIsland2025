import { clamp, getRandomInt } from '../utils/CommonUtils.js';

const ZERO = 0;

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function uniqueIds(ids = []) {
  const set = new Set((ids || []).map(id => (typeof id === 'object' ? id.id : id)).filter(Boolean));
  return Array.from(set).map(id => `${id}`);
}

function ensureProgressFields(progress, keys = []) {
  keys.forEach(key => {
    if (progress[key] == null || Number.isNaN(progress[key])) {
      progress[key] = 0;
    }
  });
}

export default class TaskSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
  }

  ensureTribeTaskState(tribe) {
    if (!tribe) return null;
    tribe.taskState = tribe.taskState || {
      activePhaseId: null,
      tasks: [],
      lastIngestIndex: 0,
      lastEvaluatedPhaseId: null
    };
    tribe.taskState.tasks = tribe.taskState.tasks || [];
    return tribe.taskState;
  }

  getCurrentPhaseId(gm = this.gameManager) {
    if (gm?.getCurrentCampPhaseId) {
      return gm.getCurrentCampPhaseId();
    }
    const day = gm?.day || 1;
    return `day${day}_phase1`;
  }

  startPhaseForTribe(tribe, phaseId) {
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const newPhase = phaseId || this.getCurrentPhaseId();
    if (state.activePhaseId === newPhase) return;
    state.activePhaseId = newPhase;

    (state.tasks || []).forEach(task => {
      if (task.deadline === 'phase') {
        task.phaseId = task.phaseId || newPhase;
        this.resetPhaseCounters(task);
        if (task.status === 'failed') {
          task.status = 'active';
        }
      }
    });
  }

  resetPhaseCounters(task) {
    if (!task?.progress) return;
    const keys = [
      'bambooContributedThisPhase',
      'bambooThisPhase',
      'palmsContributedThisPhase',
      'palmsThisPhase',
      'coconutsThisPhase',
      'firewoodThisPhase',
      'fishAnyThisPhase'
    ];
    keys.forEach(key => {
      if (task.progress[key] != null) {
        task.progress[key] = 0;
      }
    });
    if (task.type === 'shelter_short') task.progress.shelterDelta = 0;
    if (task.type === 'fire_short') task.progress.fireDelta = 0;
  }

  createDay1TasksFromPlan(tribe, phaseId, { force = false } = {}) {
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const newPhaseId = phaseId || this.getCurrentPhaseId();
    if (force) {
      state.tasks = (state.tasks || []).filter(task => !(task.deadline === 'phase' && task.phaseId === newPhaseId && task.type?.includes('_short')));
      if (state.lastEvaluatedPhaseId === newPhaseId) {
        state.lastEvaluatedPhaseId = null;
      }
    }
    const alreadyCreated = (state.tasks || []).some(task => task.phaseId === newPhaseId && task.type?.includes('_short'));
    if (alreadyCreated) return;

    const plan = tribe?.day1Plan || {};
    const getAssignees = role => {
      const assignments = plan.assignments || {};
      const assignmentAliases = { wood: 'materials', resources: 'food', float: 'flex' };
      const assignmentList = Array.isArray(assignments[role])
        ? assignments[role]
        : Array.isArray(assignments[assignmentAliases[role]])
          ? assignments[assignmentAliases[role]]
          : undefined;
      const candidates = [
        assignmentList,
        assignments[role],
        plan.roles?.[role],
        plan[`${role}Team`],
        plan[`${role}Ids`],
        plan[`${role}`]
      ];
      if (role === 'fire') candidates.push(plan.fireBuilder);
      if (role === 'wood') candidates.push(plan.woodTeam, plan.woodIds, plan.materialsTeam, plan.materialsIds, plan.materials);
      if (role === 'resources') candidates.push(plan.resourcesTeam, plan.resourcesIds, plan.foodTeam, plan.foodIds, plan.food);
      if (role === 'float') candidates.push(plan.floaterIds, plan.floatIds, plan.floatTeam, plan.floaters);
      const chosen = candidates.find(Array.isArray);
      return uniqueIds(chosen || []);
    };

    const roleDefinitions = {
      shelter: {
        short: {
          title: 'Build shelter once materials are gathered.',
          description: 'Build shelter once materials are gathered.',
          target: { shelterDelta: 1 },
          progress: { shelterDelta: 0 },
          rewards: { teamPlayer: 2 },
          penalties: { teamPlayer: -2, suspicion: 1 }
        },
        long: {
          title: 'Shelter: Reach level 4 (long-term)',
          description: 'Shelter: Reach level 4 (long-term)',
          target: { shelterLevel: 4 },
          progress: { shelterLevel: tribe?.shelter || 0 },
          rewards: { teamPlayer: 4 },
          penalties: {}
        }
      },
      fire: {
        short: {
          title: 'Build fire once enough firewood is gathered.',
          description: 'Build fire once enough firewood is gathered.',
          target: { fireDelta: 1 },
          progress: { fireDelta: 0 },
          rewards: { teamPlayer: 2 },
          penalties: { teamPlayer: -2, suspicion: 1 }
        },
        long: {
          title: 'Fire: Reach stage 4 (long-term)',
          description: 'Fire: Reach stage 4 (long-term)',
          target: { fireLevel: 4 },
          progress: { fireLevel: tribe?.fire || 0 },
          rewards: { teamPlayer: 4 },
          penalties: {}
        }
      },
      wood: {
        short: [
          {
            key: 'bamboo',
            title: 'GATHER 5 BAMBOO.',
            description: 'GATHER 5 BAMBOO.',
            target: { bambooThisPhase: 5 },
            progress: { bambooThisPhase: 0 },
            rewards: { teamPlayer: 2 },
            penalties: { teamPlayer: -2, suspicion: 1 }
          },
          {
            key: 'firewood',
            title: 'GATHER 10 FIREWOOD.',
            description: 'GATHER 10 FIREWOOD.',
            target: { firewoodThisPhase: 10 },
            progress: { firewoodThisPhase: 0 },
            rewards: { teamPlayer: 2 },
            penalties: { teamPlayer: -2, suspicion: 1 }
          }
        ]
      },
      resources: {
        short: [
          {
            key: 'coconuts',
            title: 'GATHER 3 COCONUTS.',
            description: 'GATHER 3 COCONUTS.',
            target: { coconutsThisPhase: 3 },
            progress: { coconutsThisPhase: 0 },
            rewards: { teamPlayer: 2 },
            penalties: { teamPlayer: -2, suspicion: 1 }
          },
          {
            key: 'palms',
            title: 'GATHER 1 PALM.',
            description: 'GATHER 1 PALM.',
            target: { palmsThisPhase: 1 },
            progress: { palmsThisPhase: 0 },
            rewards: { teamPlayer: 2 },
            penalties: { teamPlayer: -2, suspicion: 1 }
          }
        ]
      },
      float: {
        short: {
          title: 'Assist the tribe where needed.',
          description: 'Assist the tribe where needed.',
          target: {},
          progress: { firewoodThisPhase: 0, bambooContributedThisPhase: 0, palmsContributedThisPhase: 0, coconutsThisPhase: 0, fishAnyThisPhase: 0 },
          rewards: { teamPlayer: 2 },
          penalties: { teamPlayer: -2, suspicion: 1 }
        },
        long: {
          title: 'Float: Contribute 2 different resources (long-term)',
          description: 'Float: Contribute 2 different resources (long-term)',
          target: { categories: 2 },
          progress: { firewoodContributedTotal: 0, bambooContributedTotal: 0, palmsContributedTotal: 0, coconutsTotal: 0, fishAnyTotal: 0 },
          rewards: { teamPlayer: 4 },
          penalties: {},
          meta: { categories: [] }
        }
      }
    };

    Object.entries(roleDefinitions).forEach(([role, def]) => {
      const assignees = getAssignees(role);
      const shortDefs = Array.isArray(def.short) ? def.short : [def.short];
      shortDefs.forEach(shortDef => {
        const shortKey = shortDef?.key ? `${role}_${shortDef.key}_short_${newPhaseId}` : `${role}_short_${newPhaseId}`;
        const shortType = shortDef?.type || (shortDef?.key ? `${role}_${shortDef.key}_short` : `${role}_short`);
        const shortExists = (state.tasks || []).some(task => task.id === shortKey);

        if (!shortExists) {
          state.tasks.push({
            id: shortKey,
            title: shortDef.title,
            description: shortDef.description,
            type: shortType,
            role,
            assignees,
            deadline: 'phase',
            phaseId: newPhaseId,
            status: 'active',
            progress: { ...shortDef.progress },
            target: { ...shortDef.target },
            rewards: { ...shortDef.rewards },
            penalties: { ...shortDef.penalties },
            meta: { claimed: false, rewardApplied: false }
          });
        }
      });

      const longId = `${role}_long`;
      const longExists = (state.tasks || []).some(task => task.id === longId);
      if (def.long && !longExists) {
        state.tasks.push({
          id: longId,
          title: def.long.title,
          description: def.long.description,
          type: `${role}_long`,
          role,
          assignees,
          deadline: 'none',
          phaseId: null,
          status: 'active',
          progress: { ...def.long.progress },
          target: { ...def.long.target },
          rewards: { ...def.long.rewards },
          penalties: { ...def.long.penalties },
          meta: { ...(def.long.meta || {}), claimed: false, rewardApplied: false }
        });
      }
    });

    this.ensureOptionalFishingTasks(state, tribe);
  }

  ensureOptionalFishingTasks(state, tribe) {
    if (!state || !tribe) return;
    const baseId = 'fish_optional_base';
    const baseExists = (state.tasks || []).some(task => task.id === baseId);
    if (baseExists) return;

    const assignees = (tribe.members || []).map(member => `${member.id}`);
    state.tasks.push({
      id: baseId,
      title: 'FISHING: CATCH 1 FISH (ANY KIND)',
      description: 'FISHING: CATCH 1 FISH (ANY KIND)',
      type: 'fish_optional_base',
      role: 'fishing',
      assignees,
      deadline: 'none',
      phaseId: null,
      status: 'active',
      progress: { fishAnyTotal: 0 },
      target: { fishAnyTotal: 1 },
      rewards: { teamPlayer: 2 },
      penalties: {},
      meta: { optional: true, claimed: false, rewardApplied: false, followupUnlocked: false }
    });
  }

  unlockFishingFollowupTask(tribe, baseTask) {
    const state = this.ensureTribeTaskState(tribe);
    if (!state || !baseTask || baseTask.meta?.followupUnlocked) return;

    const options = [
      {
        id: 'fish_optional_followup_big_one',
        title: 'Fishing: Catch 1 big fish (optional)',
        description: 'Fishing: Catch 1 big fish (optional)',
        progress: { fish2Total: 0 },
        target: { fish2Total: 1 },
        rewards: { teamPlayer: 3 }
      },
      {
        id: 'fish_optional_followup_big_two',
        title: 'Fishing: Catch 2 big fish (optional)',
        description: 'Fishing: Catch 2 big fish (optional)',
        progress: { fish2Total: 0 },
        target: { fish2Total: 2 },
        rewards: { teamPlayer: 4 }
      },
      {
        id: 'fish_optional_followup_small_five',
        title: 'Fishing: Catch 5 small fish (optional)',
        description: 'Fishing: Catch 5 small fish (optional)',
        progress: { fish1Total: 0 },
        target: { fish1Total: 5 },
        rewards: { teamPlayer: 3 }
      },
      {
        id: 'fish_optional_followup_rare_one',
        title: 'Fishing: Catch 1 rare fish (optional)',
        description: 'Fishing: Catch 1 rare fish (optional)',
        progress: { fish3Total: 0 },
        target: { fish3Total: 1 },
        rewards: { teamPlayer: 5, threat: 1 }
      }
    ];

    const choice = options[getRandomInt(0, options.length - 1)];
    const exists = (state.tasks || []).some(task => task.id === choice.id);
    if (!exists) {
      state.tasks.push({
        id: choice.id,
        title: choice.title,
        description: choice.description,
        type: choice.id,
        role: 'fishing',
        assignees: baseTask.assignees || [],
        deadline: 'none',
        phaseId: null,
        status: 'active',
        progress: { ...choice.progress },
        target: { ...choice.target },
        rewards: { ...choice.rewards },
        penalties: {},
        meta: { optional: true, claimed: false, rewardApplied: false }
      });
    }

    baseTask.meta = baseTask.meta || {};
    baseTask.meta.followupUnlocked = true;
  }

  updateOptionalFishProgress(task, fishType, fishCount) {
    if (!task || !fishCount) return;
    if (task.type === 'fish_optional_base') {
      ensureProgressFields(task.progress, ['fishAnyTotal']);
      task.progress.fishAnyTotal += fishCount;
      return;
    }

    if (task.type === 'fish_optional_followup_big_one' || task.type === 'fish_optional_followup_big_two') {
      ensureProgressFields(task.progress, ['fish2Total']);
      if (fishType === 2) task.progress.fish2Total += fishCount;
      return;
    }

    if (task.type === 'fish_optional_followup_small_five') {
      ensureProgressFields(task.progress, ['fish1Total']);
      if (fishType === 1) task.progress.fish1Total += fishCount;
      return;
    }

    if (task.type === 'fish_optional_followup_rare_one') {
      ensureProgressFields(task.progress, ['fish3Total']);
      if (fishType === 3) task.progress.fish3Total += fishCount;
    }
  }

  recordResourceGain(survivorId, resourceKey, amount = 0, source = 'gain', tribeOverride = null) {
    if (!amount) return;
    const gm = this.gameManager;
    const tribe = tribeOverride || gm?.getPlayerTribe?.() || gm?.playerTribe;
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const playerId = survivorId || gm?.getPlayerSurvivor?.()?.id;
    if (!playerId) return;

    const normalizedResource = resourceKey === 'coconut' ? 'coconuts' : resourceKey === 'palm' ? 'palms' : resourceKey;
    const fishCount = ['fish1', 'fish2', 'fish3', 'fish'].includes(normalizedResource) ? amount : 0;
    const fishType = normalizedResource === 'fish1' ? 1 : normalizedResource === 'fish2' ? 2 : normalizedResource === 'fish3' ? 3 : null;

    const resourcePayload = {
      bamboo: normalizedResource === 'bamboo' ? amount : 0,
      firewood: normalizedResource === 'firewood' ? amount : 0,
      coconuts: normalizedResource === 'coconuts' ? amount : 0,
      palms: normalizedResource === 'palms' ? amount : 0,
      fishCount,
      fishType,
      source
    };

    (state.tasks || []).forEach(task => {
      if (!task || task.status !== 'active') return;
      const isMine = Array.isArray(task.assignees) && task.assignees.some(id => `${id}` === `${playerId}`);
      if (!isMine) return;
      this.applyResourceProgress(task, resourcePayload, tribe);
    });
  }

  applyResourceProgress(task, { bamboo = 0, firewood = 0, coconuts = 0, palms = 0, fishCount = 0, fishType = null } = {}, tribe = null) {
    if (!task || task.status !== 'active') return;

    switch (task.type) {
      case 'wood_bamboo_short':
        ensureProgressFields(task.progress, ['bambooThisPhase']);
        task.progress.bambooThisPhase += bamboo;
        break;
      case 'wood_firewood_short':
        ensureProgressFields(task.progress, ['firewoodThisPhase']);
        task.progress.firewoodThisPhase += firewood;
        break;
      case 'resources_coconuts_short':
        ensureProgressFields(task.progress, ['coconutsThisPhase']);
        task.progress.coconutsThisPhase += coconuts;
        break;
      case 'resources_palms_short':
        ensureProgressFields(task.progress, ['palmsThisPhase']);
        task.progress.palmsThisPhase += palms;
        break;
      case 'wood_short':
        ensureProgressFields(task.progress, ['bambooContributedThisPhase', 'firewoodThisPhase']);
        task.progress.bambooContributedThisPhase += bamboo;
        task.progress.firewoodThisPhase += firewood;
        break;
      case 'resources_short':
        ensureProgressFields(task.progress, ['coconutsThisPhase', 'palmsContributedThisPhase']);
        task.progress.coconutsThisPhase += coconuts;
        task.progress.palmsContributedThisPhase += palms;
        break;
      case 'float_short':
        ensureProgressFields(task.progress, ['firewoodThisPhase', 'bambooContributedThisPhase', 'palmsContributedThisPhase', 'coconutsThisPhase', 'fishAnyThisPhase']);
        task.progress.firewoodThisPhase += firewood;
        task.progress.bambooContributedThisPhase += bamboo;
        task.progress.palmsContributedThisPhase += palms;
        task.progress.coconutsThisPhase += coconuts;
        task.progress.fishAnyThisPhase += fishCount;
        break;
      case 'float_long':
        ensureProgressFields(task.progress, ['firewoodContributedTotal', 'bambooContributedTotal', 'palmsContributedTotal', 'coconutsTotal', 'fishAnyTotal']);
        task.progress.firewoodContributedTotal += firewood;
        task.progress.bambooContributedTotal += bamboo;
        task.progress.palmsContributedTotal += palms;
        task.progress.coconutsTotal += coconuts;
        task.progress.fishAnyTotal += fishCount;
        this.updateFloatCategories(task);
        break;
      default:
        break;
    }

    if (task.type?.startsWith('fish_optional')) {
      this.updateOptionalFishProgress(task, fishType, fishCount);
    }

    this.updateTaskCompletion(task, tribe || this.gameManager?.getPlayerTribe?.() || this.gameManager?.playerTribe);
  }

  ingestCampLogForTribe(gameManager, tribe) {
    const gm = gameManager || this.gameManager;
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const log = Array.isArray(gm?.campLog) ? gm.campLog : [];
    const startIndex = state.lastIngestIndex || 0;
    for (let i = startIndex; i < log.length; i++) {
      this.ingestCampLogEntry(gm, tribe, log[i]);
    }
    state.lastIngestIndex = log.length;
  }

  ingestCampLogEntry(gameManager, tribe, entry = {}) {
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const tasks = state.tasks || [];
    const type = entry?.type || '';

    const bamboo = safeNumber(entry?.resources?.bamboo ?? entry?.bamboo);
    const palms = safeNumber(entry?.resources?.palms ?? entry?.palms);
    const firewood = safeNumber(entry?.resources?.firewood ?? entry?.firewood);

    const coconutsFromEntry = safeNumber(entry?.food?.coconuts ?? entry?.coconuts ?? (entry?.resource === 'coconut' ? entry?.count : ZERO));
    const fishType = entry?.fish?.type ?? entry?.fishType;
    const fishCount = safeNumber(entry?.fish?.count ?? entry?.count);
    const fish1 = safeNumber(entry?.fish1 ?? entry?.resources?.fish1);
    const fish2 = safeNumber(entry?.fish2 ?? entry?.resources?.fish2);
    const fish3 = safeNumber(entry?.fish3 ?? entry?.resources?.fish3);
    const fishTotal = fishCount || fish1 + fish2 + fish3;

    if (type === 'camp_shelter_build') {
      const before = safeNumber(entry?.shelterBefore);
      const after = safeNumber(entry?.shelterAfter ?? (Number.isFinite(entry?.shelterBefore) ? entry.shelterBefore + 1 : before + 1));
      const delta = Math.max(0, after - before);
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.type === 'shelter_short') {
          ensureProgressFields(task.progress, ['shelterDelta']);
          task.progress.shelterDelta += delta;
          this.updateTaskCompletion(task, tribe);
        }
        if (task.type === 'shelter_long') {
          ensureProgressFields(task.progress, ['shelterLevel']);
          task.progress.shelterLevel = Math.max(task.progress.shelterLevel || 0, after);
          this.updateTaskCompletion(task, tribe);
        }
      });
    }

    if (type === 'camp_fire_build') {
      const before = safeNumber(entry?.fireBefore);
      const after = safeNumber(entry?.fireAfter ?? (Number.isFinite(entry?.fireBefore) ? entry.fireBefore + 1 : before + 1));
      const delta = Math.max(0, after - before);
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.type === 'fire_short') {
          ensureProgressFields(task.progress, ['fireDelta']);
          task.progress.fireDelta += delta;
          this.updateTaskCompletion(task, tribe);
        }
        if (task.type === 'fire_long') {
          ensureProgressFields(task.progress, ['fireLevel']);
          task.progress.fireLevel = Math.max(task.progress.fireLevel || 0, after);
          this.updateTaskCompletion(task, tribe);
        }
      });
    }

    if (type === 'camp_contribute' || bamboo || palms || firewood || coconutsFromEntry || fishTotal) {
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (['wood', 'resources', 'float'].includes(task.role) || task.type?.startsWith('fish_optional')) {
          this.applyResourceProgress(task, {
            bamboo,
            firewood,
            coconuts: coconutsFromEntry,
            palms,
            fishCount: fishTotal,
            fishType
          }, tribe);
          if (fish1 || fish2 || fish3) {
            if (task.type?.startsWith('fish_optional')) {
              if (fish1) this.updateOptionalFishProgress(task, 1, fish1);
              if (fish2) this.updateOptionalFishProgress(task, 2, fish2);
              if (fish3) this.updateOptionalFishProgress(task, 3, fish3);
              this.updateTaskCompletion(task, tribe);
            }
          }
        }
      });
    }

    if (type === 'camp_contribute_food') {
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.role === 'resources' || task.role === 'float' || task.type?.startsWith('fish_optional')) {
          this.applyResourceProgress(task, {
            coconuts: coconutsFromEntry,
            fishCount,
            fishType
          }, tribe);
        }
      });
    }

    if (['camp_gather_food', 'camp_food', 'camp_gather'].includes(type) || entry?.resource === 'coconut' || coconutsFromEntry > 0) {
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.role === 'resources' || task.role === 'float') {
          this.applyResourceProgress(task, { coconuts: coconutsFromEntry }, tribe);
        }
      });
    }

    if (type === 'camp_fishing' || type === 'camp_fish') {
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.role === 'float' || task.type?.startsWith('fish_optional')) {
          this.applyResourceProgress(task, { fishCount, fishType }, tribe);
        }
      });
    }
  }

  updateFloatCategories(task) {
    if (!task?.progress || task.role !== 'float') return;
    task.meta = task.meta || { categories: [] };
    const categories = new Set(task.meta.categories || []);
    if ((task.progress.firewoodContributedTotal || 0) > 0) categories.add('firewood');
    if ((task.progress.bambooContributedTotal || 0) > 0) categories.add('bamboo');
    if ((task.progress.palmsContributedTotal || 0) > 0) categories.add('palms');
    if ((task.progress.coconutsTotal || 0) > 0) categories.add('coconuts');
    if ((task.progress.fishAnyTotal || 0) > 0) categories.add('fish');
    task.meta.categories = Array.from(categories);
  }

  updateTaskCompletion(task, tribe) {
    if (!task || task.status !== 'active') return;
    if (this.isTaskComplete(task)) {
      task.meta = task.meta || {};
      if (task.meta.claimed == null) task.meta.claimed = false;
      if (task.meta.rewardApplied == null) task.meta.rewardApplied = false;
      task.status = 'complete';
      if (task.type === 'fish_optional_base') {
        this.unlockFishingFollowupTask(tribe, task);
      }
    }
  }

  isTaskComplete(task) {
    const p = task.progress || {};
    switch (task.type) {
      case 'shelter_short':
        return (p.shelterDelta || 0) >= 1;
      case 'shelter_long':
        return (p.shelterLevel || 0) >= 4;
      case 'fire_short':
        return (p.fireDelta || 0) >= 1;
      case 'fire_long':
        return (p.fireLevel || 0) >= 4;
      case 'wood_bamboo_short':
        return (p.bambooThisPhase || 0) >= 5;
      case 'wood_firewood_short':
        return (p.firewoodThisPhase || 0) >= 10;
      case 'wood_short':
        return (p.bambooContributedThisPhase || 0) > 0 || (p.firewoodThisPhase || 0) > 0;
      case 'resources_coconuts_short':
        return (p.coconutsThisPhase || 0) >= 3;
      case 'resources_palms_short':
        return (p.palmsThisPhase || 0) >= 1;
      case 'resources_short':
        return (p.coconutsThisPhase || 0) >= 3;
      case 'fish_optional_base':
        return (p.fishAnyTotal || 0) >= 1;
      case 'fish_optional_followup_big_one':
        return (p.fish2Total || 0) >= 1;
      case 'fish_optional_followup_big_two':
        return (p.fish2Total || 0) >= 2;
      case 'fish_optional_followup_small_five':
        return (p.fish1Total || 0) >= 5;
      case 'fish_optional_followup_rare_one':
        return (p.fish3Total || 0) >= 1;
      case 'float_short':
        return (
          (p.firewoodThisPhase || 0) >= 10 ||
          (p.bambooContributedThisPhase || 0) >= 5 ||
          (p.palmsContributedThisPhase || 0) >= 1 ||
          (p.coconutsThisPhase || 0) >= 3 ||
          (p.fishAnyThisPhase || 0) >= 1
        );
      case 'float_long':
        return Array.isArray(task.meta?.categories) && task.meta.categories.length >= 2;
      default:
        return false;
    }
  }

  hasProgress(task) {
    const p = task.progress || {};
    switch (task.type) {
      case 'shelter_short':
        return (p.shelterDelta || 0) > 0;
      case 'fire_short':
        return (p.fireDelta || 0) > 0;
      case 'wood_bamboo_short':
        return (p.bambooThisPhase || 0) > 0;
      case 'wood_firewood_short':
        return (p.firewoodThisPhase || 0) > 0;
      case 'wood_short':
        return (p.bambooContributedThisPhase || 0) > 0 || (p.firewoodThisPhase || 0) > 0;
      case 'resources_coconuts_short':
        return (p.coconutsThisPhase || 0) > 0;
      case 'resources_palms_short':
        return (p.palmsThisPhase || 0) > 0;
      case 'resources_short':
        return (p.coconutsThisPhase || 0) > 0 || (p.palmsContributedThisPhase || 0) > 0;
      case 'float_short':
        return (
          (p.firewoodThisPhase || 0) > 0 ||
          (p.bambooContributedThisPhase || 0) > 0 ||
          (p.palmsContributedThisPhase || 0) > 0 ||
          (p.coconutsThisPhase || 0) > 0 ||
          (p.fishAnyThisPhase || 0) > 0
        );
      default:
        return false;
    }
  }

  applyRewards(tribe, task, { immediate = false } = {}) {
    if (!tribe || !task?.assignees?.length) return;
    if (task.deadline === 'none' && task.meta?.rewardApplied) return;

    const teamPlayerDelta = task.rewards?.teamPlayer || 0;
    const threatDelta = task.rewards?.threat || 0;
    if (teamPlayerDelta === 0 && threatDelta === 0) return;

    task.assignees.forEach(id => this.adjustSurvivorStats(tribe, id, { teamPlayer: teamPlayerDelta, threat: threatDelta }));

    if (task.deadline === 'none') {
      task.meta = task.meta || {};
      task.meta.rewardApplied = true;
    } else if (immediate) {
      task.meta = task.meta || {};
      task.meta.rewardApplied = true;
    }
  }

  applyPenalties(tribe, task, { zeroProgress = false } = {}) {
    if (!tribe || !task?.assignees?.length) return;
    const baseTeamPlayer = task.penalties?.teamPlayer || 0;
    const suspicionPenalty = zeroProgress ? (task.penalties?.suspicion || 0) : 0;
    const teamPlayerDelta = baseTeamPlayer;
    if (teamPlayerDelta === 0 && suspicionPenalty === 0) return;

    task.assignees.forEach(id => this.adjustSurvivorStats(tribe, id, { teamPlayer: teamPlayerDelta, suspicion: suspicionPenalty }));
  }

  adjustSurvivorStats(tribe, survivorId, { teamPlayer = 0, suspicion = 0, threat = 0 } = {}) {
    const survivor = tribe?.members?.find?.(m => `${m.id}` === `${survivorId}`);
    if (!survivor) return;
    const existingTeam = survivor.teamPlayer != null ? survivor.teamPlayer : 50;
    const existingSuspicion = survivor.suspicion != null ? survivor.suspicion : 0;
    const existingThreat = survivor.threat != null ? survivor.threat : 0;
    survivor.teamPlayer = clamp(existingTeam + teamPlayer, 0, 100);
    survivor.suspicion = clamp(existingSuspicion + suspicion, 0, 100);
    survivor.threat = clamp(existingThreat + threat, 0, 10);
  }

  evaluatePhaseForTribe(gameManager, tribe, phaseId) {
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const currentPhaseId = phaseId || this.getCurrentPhaseId(gameManager);
    if (state.lastEvaluatedPhaseId === currentPhaseId) return;

    this.ingestCampLogForTribe(gameManager, tribe);

    (state.tasks || []).forEach(task => {
      if (task.deadline !== 'phase' || task.phaseId !== currentPhaseId) return;
      if (task.status === 'complete') return;
      if (task.status !== 'active') return;
      const zeroProgress = !this.hasProgress(task);
      this.applyPenalties(tribe, task, { zeroProgress });
      task.status = 'failed';
    });

    state.lastEvaluatedPhaseId = currentPhaseId;
  }

  claimTaskForPlayer(gameManager, taskId) {
    const gm = gameManager || this.gameManager;
    const tribe = gm?.getPlayerTribe?.();
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return { ok: false, reason: 'no_state' };

    const playerId = gm?.getPlayerSurvivor?.()?.id || gm?.player?.id;
    if (!playerId) return { ok: false, reason: 'no_player' };

    const task = (state.tasks || []).find(t => `${t.id}` === `${taskId}`);
    if (!task) return { ok: false, reason: 'no_task' };
    const isMine = Array.isArray(task.assignees) && task.assignees.some(id => `${id}` === `${playerId}`);
    if (!isMine) return { ok: false, reason: 'not_assigned' };
    if (task.status !== 'complete') return { ok: false, reason: 'not_complete' };
    if (task.meta?.claimed) return { ok: false, reason: 'already_claimed' };

    task.meta = task.meta || {};

    if (!task.meta.rewardApplied) {
      this.applyRewards(tribe, task, { immediate: true });
    }

    task.meta.claimed = true;
    task.meta.rewardApplied = true;
    task.status = task.status === 'complete' ? 'claimed' : task.status;

    const player = gm?.getPlayerSurvivor?.();
    const rewards = task.rewards || {};
    const rewardEntries = Object.entries(rewards).filter(([, delta]) => delta != null && delta !== 0);
    const rewardText = rewardEntries
      .map(([key, delta]) => `${delta >= 0 ? '+' : ''}${delta} ${key.replace(/([A-Z])/g, ' $1').trim()}`)
      .join(', ');

    return {
      ok: true,
      task,
      rewardText,
      playerName: player?.firstName || player?.name || 'You'
    };
  }

  hasClaimableTasksForPlayer(gameManager) {
    const gm = gameManager || this.gameManager;
    const tribe = gm?.getPlayerTribe?.();
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return false;

    const playerId = gm?.getPlayerSurvivor?.()?.id || gm?.player?.id;
    if (!playerId) return false;

    this.ingestCampLogForTribe(gm, tribe);

    const isMine = task => Array.isArray(task?.assignees) && task.assignees.some(id => `${id}` === `${playerId}`);
    return (state.tasks || []).some(task => isMine(task) && task.status === 'complete' && task.meta?.claimed !== true);
  }

  getVisibleTasksForPlayer(gameManager) {
    const gm = gameManager || this.gameManager;
    const tribe = gm?.getPlayerTribe?.();
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return { lines: ['', '', '', ''], tasksForUI: [] };

    const playerId = gm?.getPlayerSurvivor?.()?.id || gm?.player?.id;
    if (!playerId) return { lines: ['', '', '', ''], tasksForUI: [] };

    this.ingestCampLogForTribe(gm, tribe);

    const isMine = task => Array.isArray(task?.assignees) && task.assignees.some(id => `${id}` === `${playerId}`);

    const activeShort = (state.tasks || []).filter(task => task.deadline === 'phase' && task.status === 'active' && isMine(task));
    const claimableShort = (state.tasks || []).filter(
      task => task.deadline === 'phase' && task.status === 'complete' && task.meta?.claimed !== true && isMine(task)
    );
    const longTerm = (state.tasks || []).filter(
      task => task.deadline === 'none' && task.status === 'active' && task.meta?.claimed !== true && isMine(task)
    );
    const claimableLong = (state.tasks || []).filter(
      task => task.deadline === 'none' && task.status === 'complete' && task.meta?.claimed !== true && isMine(task)
    );

    const ordered = [...activeShort, ...claimableShort, ...longTerm, ...claimableLong].slice(0, 4);

    const tasksForUI = ordered.map(task => {
      const progressText = this.progressSummary(task);
      const titleLine = progressText ? `${task.title} (${progressText})` : task.title;
      return {
        id: task.id,
        titleLine,
        status: task.status,
        claimable: task.status === 'complete' && task.meta?.claimed !== true
      };
    });

    const lines = tasksForUI.map(t => t.titleLine).slice(0, 4);
    while (lines.length < 4) lines.push('');

    return { lines, tasksForUI };
  }

  progressSummary(task) {
    const p = task.progress || {};
    switch (task.type) {
      case 'shelter_short':
        return '';
      case 'shelter_long':
        return `${p.shelterLevel || 0}/4`;
      case 'fire_short':
        return '';
      case 'fire_long':
        return `${p.fireLevel || 0}/4`;
      case 'wood_bamboo_short':
        return `${p.bambooThisPhase || 0}/5`;
      case 'wood_firewood_short':
        return `${p.firewoodThisPhase || 0}/10`;
      case 'wood_short':
        return '';
      case 'resources_coconuts_short':
        return `${p.coconutsThisPhase || 0}/3`;
      case 'resources_palms_short':
        return `${p.palmsThisPhase || 0}/1`;
      case 'resources_short':
        return `${p.coconutsThisPhase || 0}/3`;
      case 'fish_optional_base':
        return `${p.fishAnyTotal || 0}/1`;
      case 'fish_optional_followup_big_one':
        return `${p.fish2Total || 0}/1 big fish`;
      case 'fish_optional_followup_big_two':
        return `${p.fish2Total || 0}/2 big fish`;
      case 'fish_optional_followup_small_five':
        return `${p.fish1Total || 0}/5 small fish`;
      case 'fish_optional_followup_rare_one':
        return `${p.fish3Total || 0}/1 rare fish`;
      case 'float_short': {
        return '';
      }
      case 'float_long':
        return `${(task.meta?.categories || []).length}/2 categories`;
      default:
        return '';
    }
  }
}
