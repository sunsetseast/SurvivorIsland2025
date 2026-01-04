import { clamp } from '../utils/CommonUtils.js';

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
      'palmsContributedThisPhase',
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

  createDay1TasksFromPlan(tribe, phaseId) {
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const newPhaseId = phaseId || this.getCurrentPhaseId();
    const alreadyCreated = (state.tasks || []).some(task => task.phaseId === newPhaseId && task.type?.includes('_short'));
    if (alreadyCreated) return;

    const plan = tribe?.day1Plan || {};
    const getAssignees = role => {
      const candidates = [
        plan.assignments?.[role],
        plan.roles?.[role],
        plan[`${role}Team`],
        plan[`${role}Ids`],
        plan[`${role}`]
      ];
      if (role === 'fire') candidates.push(plan.fireBuilder);
      if (role === 'resources') candidates.push(plan.materialsTeam, plan.materialsIds, plan.materials);
      if (role === 'float') candidates.push(plan.floaterIds, plan.floatIds, plan.floatTeam, plan.floaters);
      const chosen = candidates.find(Array.isArray);
      return uniqueIds(chosen || []);
    };

    const roleDefinitions = {
      shelter: {
        short: {
          title: 'Shelter: Raise it by 1 this phase',
          description: 'Shelter: Raise it by 1 this phase',
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
          title: 'Fire: Build it up 1 stage this phase',
          description: 'Fire: Build it up 1 stage this phase',
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
      food: {
        short: {
          title: 'Food: Gather 3 coconuts this phase',
          description: 'Food: Gather 3 coconuts this phase',
          target: { coconutsThisPhase: 3 },
          progress: { coconutsThisPhase: 0 },
          rewards: { teamPlayer: 2 },
          penalties: { teamPlayer: -2, suspicion: 1 }
        },
        long: {
          title: 'Food: Catch a rare fish (long-term)',
          description: 'Food: Catch a rare fish (long-term)',
          target: { fish3Total: 1 },
          progress: { fish3Total: 0 },
          rewards: { teamPlayer: 4 },
          penalties: {}
        }
      },
      resources: {
        short: {
          title: 'Resources: Contribute 5 bamboo + 1 palm this phase',
          description: 'Resources: Contribute 5 bamboo + 1 palm this phase',
          target: { bambooContributedThisPhase: 5, palmsContributedThisPhase: 1 },
          progress: { bambooContributedThisPhase: 0, palmsContributedThisPhase: 0 },
          rewards: { teamPlayer: 2 },
          penalties: { teamPlayer: -2, suspicion: 1 }
        },
        long: {
          title: 'Resources: Stockpile 10 bamboo + 2 palms (long-term)',
          description: 'Resources: Stockpile 10 bamboo + 2 palms (long-term)',
          target: { bambooContributedTotal: 10, palmsContributedTotal: 2 },
          progress: { bambooContributedTotal: 0, palmsContributedTotal: 0 },
          rewards: { teamPlayer: 4 },
          penalties: {}
        }
      },
      float: {
        short: {
          title: 'Float: Help anywhere this phase',
          description: 'Float: Help anywhere this phase',
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
      state.tasks.push({
        id: `${role}_short_${newPhaseId}`,
        title: def.short.title,
        description: def.short.description,
        type: `${role}_short`,
        role,
        assignees,
        deadline: 'phase',
        phaseId: newPhaseId,
        status: 'active',
        progress: { ...def.short.progress },
        target: { ...def.short.target },
        rewards: { ...def.short.rewards },
        penalties: { ...def.short.penalties },
        meta: {}
      });

      state.tasks.push({
        id: `${role}_long`,
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
        meta: { ...(def.long.meta || {}), rewardApplied: false }
      });
    });
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

    if (type === 'camp_contribute' || bamboo || palms || firewood) {
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.role === 'resources') {
          ensureProgressFields(task.progress, ['bambooContributedTotal', 'palmsContributedTotal', 'bambooContributedThisPhase', 'palmsContributedThisPhase']);
          task.progress.bambooContributedTotal += bamboo;
          task.progress.palmsContributedTotal += palms;
          if (task.deadline === 'phase') {
            task.progress.bambooContributedThisPhase += bamboo;
            task.progress.palmsContributedThisPhase += palms;
          }
          this.updateTaskCompletion(task, tribe);
        }
        if (task.role === 'float') {
          ensureProgressFields(task.progress, ['firewoodThisPhase', 'bambooContributedThisPhase', 'palmsContributedThisPhase', 'coconutsThisPhase', 'fishAnyThisPhase', 'firewoodContributedTotal', 'bambooContributedTotal', 'palmsContributedTotal', 'coconutsTotal', 'fishAnyTotal']);
          task.progress.firewoodThisPhase += firewood;
          task.progress.bambooContributedThisPhase += bamboo;
          task.progress.palmsContributedThisPhase += palms;
          task.progress.firewoodContributedTotal += firewood;
          task.progress.bambooContributedTotal += bamboo;
          task.progress.palmsContributedTotal += palms;
          this.updateFloatCategories(task);
          this.updateTaskCompletion(task, tribe);
        }
      });
    }

    if (['camp_gather_food', 'camp_food', 'camp_gather'].includes(type) || entry?.resource === 'coconut' || coconutsFromEntry > 0) {
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.role === 'food') {
          ensureProgressFields(task.progress, ['coconutsThisPhase', 'fish3Total']);
          task.progress.coconutsThisPhase += coconutsFromEntry;
          this.updateTaskCompletion(task, tribe);
        }
        if (task.role === 'float') {
          ensureProgressFields(task.progress, ['coconutsThisPhase', 'coconutsTotal']);
          task.progress.coconutsThisPhase += coconutsFromEntry;
          task.progress.coconutsTotal += coconutsFromEntry;
          this.updateFloatCategories(task);
          this.updateTaskCompletion(task, tribe);
        }
      });
    }

    if (type === 'camp_fishing' || type === 'camp_fish') {
      tasks.forEach(task => {
        if (task.status !== 'active') return;
        if (task.role === 'food') {
          ensureProgressFields(task.progress, ['fish3Total', 'fishAnyThisPhase']);
          if (fishType === 3) {
            task.progress.fish3Total += fishCount;
          }
          task.progress.fishAnyThisPhase += fishCount;
          this.updateTaskCompletion(task, tribe);
        }
        if (task.role === 'float') {
          ensureProgressFields(task.progress, ['fishAnyThisPhase', 'fishAnyTotal']);
          task.progress.fishAnyThisPhase += fishCount;
          task.progress.fishAnyTotal += fishCount;
          this.updateFloatCategories(task);
          this.updateTaskCompletion(task, tribe);
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
      task.status = 'complete';
      if (task.deadline === 'none') {
        this.applyRewards(tribe, task, { immediate: true });
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
      case 'food_short':
        return (p.coconutsThisPhase || 0) >= 3;
      case 'food_long':
        return (p.fish3Total || 0) >= 1;
      case 'resources_short':
        return (p.bambooContributedThisPhase || 0) >= 5 && (p.palmsContributedThisPhase || 0) >= 1;
      case 'resources_long':
        return (p.bambooContributedTotal || 0) >= 10 && (p.palmsContributedTotal || 0) >= 2;
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
      case 'food_short':
        return (p.coconutsThisPhase || 0) > 0;
      case 'resources_short':
        return (p.bambooContributedThisPhase || 0) > 0 || (p.palmsContributedThisPhase || 0) > 0;
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
    if (teamPlayerDelta === 0) return;

    task.assignees.forEach(id => this.adjustSurvivorStats(tribe, id, { teamPlayer: teamPlayerDelta }));

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

  adjustSurvivorStats(tribe, survivorId, { teamPlayer = 0, suspicion = 0 } = {}) {
    const survivor = tribe?.members?.find?.(m => `${m.id}` === `${survivorId}`);
    if (!survivor) return;
    const existingTeam = survivor.teamPlayer != null ? survivor.teamPlayer : 50;
    const existingSuspicion = survivor.suspicion != null ? survivor.suspicion : 0;
    survivor.teamPlayer = clamp(existingTeam + teamPlayer, 0, 100);
    survivor.suspicion = clamp(existingSuspicion + suspicion, 0, 100);
  }

  evaluatePhaseForTribe(gameManager, tribe, phaseId) {
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return;
    const currentPhaseId = phaseId || this.getCurrentPhaseId(gameManager);
    if (state.lastEvaluatedPhaseId === currentPhaseId) return;

    this.ingestCampLogForTribe(gameManager, tribe);

    (state.tasks || []).forEach(task => {
      if (task.deadline !== 'phase' || task.phaseId !== currentPhaseId) return;
      if (task.status === 'complete') {
        if (!task.meta?.rewardApplied) {
          this.applyRewards(tribe, task, { immediate: true });
          task.meta = task.meta || {};
          task.meta.rewardApplied = true;
        }
        return;
      }
      if (task.status !== 'active') return;
      const zeroProgress = !this.hasProgress(task);
      this.applyPenalties(tribe, task, { zeroProgress });
      task.status = 'failed';
    });

    state.lastEvaluatedPhaseId = currentPhaseId;
  }

  getVisibleTasksForPlayer(gameManager) {
    const gm = gameManager || this.gameManager;
    const tribe = gm?.getPlayerTribe?.();
    const state = this.ensureTribeTaskState(tribe);
    if (!state) return [];

    this.ingestCampLogForTribe(gm, tribe);

    const activeShort = (state.tasks || []).filter(task => task.deadline === 'phase' && task.status === 'active');
    const completedShort = (state.tasks || []).filter(task => task.deadline === 'phase' && task.status === 'complete');
    const longTerm = (state.tasks || []).filter(task => task.deadline === 'none');

    const summaryFor = task => {
      if (!task) return '';
      const progressText = this.progressSummary(task);
      return progressText ? `${task.title} (${progressText})` : task.title;
    };

    const lines = [...activeShort, ...completedShort, ...longTerm].map(summaryFor).filter(Boolean).slice(0, 4);
    while (lines.length < 4) lines.push('');
    return lines;
  }

  progressSummary(task) {
    const p = task.progress || {};
    switch (task.type) {
      case 'shelter_short':
        return `${p.shelterDelta || 0}/1`;
      case 'shelter_long':
        return `${p.shelterLevel || 0}/4`;
      case 'fire_short':
        return `${p.fireDelta || 0}/1`;
      case 'fire_long':
        return `${p.fireLevel || 0}/4`;
      case 'food_short':
        return `${p.coconutsThisPhase || 0}/3`;
      case 'food_long':
        return `${p.fish3Total || 0}/1`;
      case 'resources_short':
        return `${p.bambooContributedThisPhase || 0}/5 bamboo, ${p.palmsContributedThisPhase || 0}/1 palms`;
      case 'resources_long':
        return `${p.bambooContributedTotal || 0}/10 bamboo, ${p.palmsContributedTotal || 0}/2 palms`;
      case 'float_short': {
        const options = [];
        options.push(`firewood ${p.firewoodThisPhase || 0}/10`);
        options.push(`bamboo ${p.bambooContributedThisPhase || 0}/5`);
        options.push(`palms ${p.palmsContributedThisPhase || 0}/1`);
        options.push(`coconuts ${p.coconutsThisPhase || 0}/3`);
        options.push(`fish ${p.fishAnyThisPhase || 0}/1`);
        return options.join(' | ');
      }
      case 'float_long':
        return `${(task.meta?.categories || []).length}/2 categories`;
      default:
        return '';
    }
  }
}
