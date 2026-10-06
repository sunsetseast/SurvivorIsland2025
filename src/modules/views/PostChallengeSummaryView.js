import strategyPhaseSystem from "../systems/StrategyPhaseSystem.js";
import gameManager from "../core/GameManager.js";
import { buildPlayerScrambleRead } from "../ui/ScramblePresentation.js";
import {
  textNode,
  readButton,
  renderReadSections,
} from "../ui/ScrambleNotebook.js";
export default function renderPostChallengeSummaryView(container) {
  container.replaceChildren();
  const safe = strategyPhaseSystem.playerTribeSafe,
    read = buildPlayerScrambleRead(gameManager),
    wrapper = textNode("section", "post-challenge-summary before-tribal", "");
  wrapper.setAttribute("aria-labelledby", "before-tribal-title");
  const header = textNode("header", "before-tribal-header", "");
  header.appendChild(
    textNode(
      "p",
      "scramble-eyebrow",
      safe ? "Back at camp" : "The beach grows quiet",
    ),
  );
  const title = textNode("h1", "", safe ? "Tonight at camp" : "Before Tribal");
  title.id = "before-tribal-title";
  title.tabIndex = -1;
  header.append(
    title,
    textNode(
      "p",
      "",
      safe
        ? "Take a moment with what you heard today."
        : "One last read of the night. You decide who to believe.",
    ),
  );
  const scroll = textNode("div", "scramble-read-content", "");
  renderReadSections(scroll, read);
  const footer = textNode("footer", "before-tribal-footer", "");
  if (!safe)
    footer.append(
      textNode(
        "p",
        "scramble-current-plan",
        read.currentPlan
          ? `Your current plan: ${read.currentPlan}`
          : "Your vote is still yours to decide.",
      ),
      textNode(
        "p",
        "scramble-plan-freedom",
        "You can still vote however you choose at Tribal.",
      ),
    );
  const button = readButton(
    safe ? "Return to camp" : "Head to Tribal Council",
    () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        strategyPhaseSystem.proceedAfterSummary();
      } catch (error) {
        button.disabled = false;
        throw error;
      }
    },
    "primary",
  );
  footer.appendChild(button);
  wrapper.append(header, scroll, footer);
  container.appendChild(wrapper);
  document.getElementById("action-buttons")?.replaceChildren();
  queueMicrotask(() => {
    if (title.isConnected) title.focus({ preventScroll: true });
  });
}
