import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
export function validateRemovalParity() {
  const audit = JSON.parse(
      fs.readFileSync(
        path.join(root, "docs/conversations/qa/removal-methods.json"),
        "utf8",
      ),
    ),
    host = "src/modules/systems/ConversationSystem.js";
  const names = (source) =>
      [...source.matchAll(/^  (?:async )?([\w$]+)\(/gm)].map((x) => x[1]),
    head = names(fs.readFileSync(path.join(root, host), "utf8")),
    errors = [],
    removed = new Set(audit.removed.map((x) => x.name));
  for (const row of audit.removed) {
    if (!["A", "B", "C"].includes(row.category))
      errors.push(`${row.name}: unaddressed removal`);
    if (head.includes(row.name))
      errors.push(`${row.name}: unexpectedly resurrected`);
    if (row.category !== "A" && !row.replacement)
      errors.push(`${row.name}: no replacement`);
    if (
      !row.coverage.length ||
      row.coverage.some((f) => !fs.existsSync(path.join(root, f)))
    )
      errors.push(`${row.name}: missing coverage file`);
  }
  let baselineChecked = false;
  try {
    const baseline = names(
      execFileSync("git", ["show", `${audit.baseline}:${host}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    if (baseline.length !== audit.baselineDefinitions)
      errors.push("baseline snapshot differs");
    const expected = [
      ...new Set(baseline.filter((x) => !head.includes(x))),
    ].sort();
    if (JSON.stringify(expected) !== JSON.stringify([...removed].sort()))
      errors.push("removed inventory incomplete");
    baselineChecked = true;
  } catch {
    /* Shallow CI uses committed exact-baseline inventory. */
  }
  const unrelated = new Set([
      "src/modules/events/JourneyReturnCampEvent.js",
      "src/modules/systems/DealConsequencesSystem.js",
      "src/modules/systems/SocialEngine.js",
      "src/modules/systems/SocialMemorySystem.js",
    ]),
    refs = [];
  function visit(dir) {
    for (const ent of fs.readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const file = dir + "/" + ent.name;
      if (ent.isDirectory()) {
        visit(file);
        continue;
      }
      if (
        !/\.(?:js|mjs|html)$/.test(file) ||
        file === host ||
        file === "qa/ConversationRemovalParityAudit.mjs"
      )
        continue;
      const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
      for (let i = 0; i < lines.length; i++)
        for (const token of lines[i].match(/[\w$]+/g) || [])
          if (removed.has(token)) {
            refs.push({ file, line: i + 1, method: token });
            if (!unrelated.has(file))
              errors.push(`${file}:${i + 1}: ${token} needs owner review`);
          }
    }
  }
  for (const dir of ["src", "test", "qa"]) visit(dir);
  return {
    baseline: audit.baseline,
    baselineChecked,
    baselineDefinitions: audit.baselineDefinitions,
    headDefinitions: head.length,
    removedDefinitions: audit.removedDefinitions,
    removedUnique: removed.size,
    obsolete: audit.removed.filter((x) => x.category === "A").length,
    replaced: audit.removed.filter((x) => x.category === "B").length,
    unrelatedReferences: refs,
    errors,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const r = validateRemovalParity();
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length) process.exitCode = 1;
}
