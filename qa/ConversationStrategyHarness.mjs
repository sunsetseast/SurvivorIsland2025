import assert from "node:assert/strict";
import { makeScrambleQa } from "./ScrambleSimulationHarness.mjs";
import { quiet } from "./LivingCampSimulationHarness.mjs";
export function makeConversationStrategyQa() {
  return quiet(() => {
    const s = makeScrambleQa({
      seed: 97,
      names: ["Sandra", "Jeremy", "Michele", "Tony", "Parvati"],
    });
    s.idle();
    s.strategy.scramble.meetings = [];
    s.strategy.scramble.nextApproachAt = -1;
    s.gm.systems.allianceSystem.reset();
    s.memory.deserialize({});
    s.conversation.engine.objectives.deserialize();
    const by = (name) => s.activity.members().find((p) => p.firstName === name),
      e = s.conversation.engine;
    const names = ["Sandra", "Jeremy", "Michele", "Tony", "Parvati"];
    for (const person of s.activity.npcs())
      for (const other of s.activity.members())
        if (person.id !== other.id) {
          s.gm.systems.trustSystem.setTrust(person.id, other.id, 75);
          s.gm.systems.relationshipSystem.setRelationship(
            person.id,
            other.id,
            50,
          );
        }
    const t = by("Tony");
    for (const name of ["Sandra", "Jeremy", "Parvati"]) {
      const person = by(name);
      s.strategy.updateNpcIntentTarget(person.id, t.id, {
        absoluteConfidence: 0.35,
        intentStatus: "lean",
      });
      s.strategy.reasoning.state(person.id).preferredTargetId = t.id;
    }
    const j = by("Jeremy");
    j.gameplayStyle = "Power Player";
    j.honesty = 9;
    j.paratend = 2;
    j.aggression = 5;
    j.risk = 6;
    j.loyalty = 7;
    const m = by("Michele");
    m.gameplayStyle = "Social Genius";
    m.paratend = 5;
    m.honesty = 9;
    m.loyalty = 5;
    m.risk = 7;
    s.strategy.updateNpcIntentTarget(m.id, t.id, {
      absoluteConfidence: 0.2,
      intentStatus: "lean",
    });
    s.strategy.reasoning.state(m.id).preferredTargetId = t.id;
    s.gm.systems.trustSystem.setTrust(m.id, by("Parvati").id, 95);
    s.gm.systems.trustSystem.setTrust(j.id, by("Sandra").id, 90);
    const sand = by("Sandra");
    sand.gameplayStyle = "Shadow Strategist";
    sand.risk = 6;
    sand.honesty = 5;
    sand.loyalty = 5;
    s.by = by;
    s.e = e;
    s.act = (type, speaker, listener, fields = {}) =>
      e.resolve(
        e.action(type, {
          speakerId: speaker.id,
          listenerIds: [listener.id],
          ...fields,
        }),
      );
    s.travel = (person, place) => {
      s.activity.interrupt(person, "qa_route");
      return s.activity.start(person, {
        type: "travel",
        location: place,
        duration: 45,
        goal: { type: "idle_at_camp", location: place, duration: 3000 },
      });
    };
    s.task = () => Object.values(e.tasks.records).at(-1);
    return s;
  });
}
export function runBlindside({
  reload = false,
  refuse = false,
  lie = false,
  ignore = false,
  leak = false,
} = {}) {
  return quiet(() => {
    const s = makeConversationStrategyQa(),
      sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony"),
      p = s.by("Parvati"),
      events = [];
    // Public departure, then real arrival. Jeremy has seen where Michele went.
    s.travel(m, "waterWell");
    s.wait(45);
    assert.ok(s.present(m, "waterWell"));
    const recruit = s.act("ask_vote", sand, j, { subjectId: t.id });
    events.push({ step: "recruit Jeremy", response: recruit.responses[0] });
    assert.equal(recruit.responses[0].stance, "committed");
    const objective = s.e.objectives.establish(sand.id, {
      type: "blindside",
      targetId: t.id,
      explicit: true,
    });
    if (refuse) {
      s.gm.systems.allianceSystem.createAlliance({
        memberIds: [m.id, t.id],
        type: "core",
      });
      m.loyalty = 10;
      m.honesty = 10;
    }
    if (lie) {
      s.gm.systems.allianceSystem.createAlliance({
        memberIds: [m.id, t.id],
        type: "core",
      });
      m.gameplayStyle = "Lethal Charmer";
      m.loyalty = 10;
      m.honesty = 1;
      m.deception = 10;
    }
    // Isolate the reply variants from the separate automatic alliance-meeting
    // scheduler, which would legitimately move Michele away during the route.
    if (refuse || lie) {
      s.strategy.scramble.meetings = [];
      s.strategy.scramble.scheduleAlliances = () => {};
    }
    if (ignore) {
      j.gameplayStyle = "Lethal Charmer";
      j.honesty = 1;
    }
    const assignment = s.act("delegate", sand, j, {
      subjectId: m.id,
      planTargetId: t.id,
      requestedAction: "recruit",
      objectiveId: objective.id,
      keepSourcePrivate: true,
    });
    const task = s.task();
    objective.taskIds.push(task.id);
    events.push({
      step: "assignment",
      response: assignment.responses[0],
      id: task.id,
    });
    if (leak) {
      s.gm.systems.allianceSystem.createAlliance({
        memberIds: [j.id, t.id],
        type: "core",
      });
      task.executionMode = "leak";
    }
    if (ignore) task.executionMode = "ignore";
    let saved = false;
    for (
      let ticks = 0;
      ticks < 50 &&
      s.e.tasks.get(task.id).status !== "reported" &&
      !["ignored", "refused"].includes(s.e.tasks.get(task.id).status);
      ticks++
    ) {
      s.wait(30);
      const actor = s.e.person(j.id);
      if (reload && !saved && actor.campActivity?.type === "travel") {
        saved = true;
        const before = JSON.stringify(s.e.tasks.serialize());
        s.restore();
        assert.equal(JSON.stringify(s.e.tasks.serialize()), before);
      }
    }
    const currentTask = s.e.tasks.get(task.id),
      known = s.e.tasks.knownTasks(sand.id).find((k) => k.id === task.id);
    events.push({
      step: "completed task",
      status: currentTask.status,
      report: known.report,
      actual: currentTask.outcome,
    });
    if (!ignore && !leak && !refuse && !lie) {
      assert.equal(currentTask.outcome?.stance, "conditional");
      assert.equal(currentTask.status, "reported");
      assert.match(known.report.line, /condition/);
      // Sandra has learned a requirement by a report; she cannot see Michele's mind.
      const adopted = s.e
        .knowledge(sand.id)
        .find((k) => k.delegationId === task.id && k.topic === "commitment");
      assert.ok(adopted.conditions.some((c) => c.voterId === p.id));
    }
    return {
      events,
      task: JSON.parse(JSON.stringify(currentTask)),
      objective: JSON.parse(JSON.stringify(objective)),
      saved,
      actualVotes: Object.fromEntries(
        s.activity
          .npcs()
          .map((x) => [
            x.firstName,
            s.strategy.getNpcTargetIntent(x.id)?.targetId,
          ]),
      ),
      projection: {
        engine: s.e.serialize(),
        strategy: s.strategy.serialize(),
        memory: s.memory.serialize(),
        camp: s.activity.serialize(),
      },
    };
  });
}
