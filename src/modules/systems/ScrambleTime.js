// Semantic post-immunity durations and lifecycle; no wall-clock dependencies.
export const ScrambleState = Object.freeze({ RETURN_EVENT: 'return_event', ACTIVE: 'scramble_active',
  FINAL: 'final_minutes', RESOLVING: 'resolving', BEFORE_TRIBAL: 'before_tribal', COMPLETE: 'complete' });
export const SCRAMBLE_SECONDS = 3600;
export const scrambleConversationSeconds = ({ turns = 0, strategy = false, topics = '' } = {}) => {
  const base = /deal|offer_|alliance_commitment|split_vote/i.test(topics) ? 300 :
    /target|pitch|vote|warning|verify|idol|strateg/i.test(topics) ? 180 :
    /gossip|rumor|intel/i.test(topics) ? 120 : strategy ? 180 : 90;
  return Math.min(480, base + Math.min(6, Math.max(0, turns)) * 30);
};
