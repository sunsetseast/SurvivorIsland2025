# Survivor cast calibration

Baseline: current main `3c1dfce` (merged #341, #342, #343). Research checked September 30, 2026.

## Method and scope

This uses the requested target calibration unchanged. Ratings are bounded simulation interpretations of televised Survivor behavior, not objective measurements or judgments about the people outside the game. We checked full career references, episode/idol/fire records, CBS bio reproductions and reputable firsthand interviews. U.S. Survivor is weighted most strongly; international appearances are supporting evidence for transferable skills. Career references include later appearances where available. No fan ranking or Reddit opinion is a rating source.

Evidence priority: demonstrated events, repetition across seasons, career records, official bios, reputable interviews, then documented reference histories. The brief rationales below identify the strongest anchors, rather than asserting every integer can be proven independently. Sparse evidence stays near neutral, particularly fishing/fire specialties. A single failed attempt is evidence to avoid an elite rating, not proof of permanent inability.

Editable fields only: `bigmove`, `idolhunt`, `idolshare`, `honesty`, `risk`, `aggression`, `paratend`, `leader`, `fishing`, `laziness`, `firemaking`.

`aggression` means forceful strategy/confrontation; `paratend` means paranoia tendency; `laziness` means camp-work avoidance. Honesty is in-game reliability. Idol hunting measures intentional searching; sharing includes disclosure, transfer and ally-directed use. Leadership describes organizing, not construction proficiency.

All Physical, Mental and Social ratings, their aggregates, `traitClass`, and initial runtime fields (`health`, `threat`, `challengeThreat`, `teamPlayer`, needs, roles, inventory) are unchanged. `test/fixtures/protected-cast-main.json` records the exact protected baseline. Tables list changed fields; other editable values are retained at the target value.

## Ozzy Lusth

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 5 | 6 |
| `idolhunt` | 6 | 7 |
| `idolshare` | 3 | 4 |
| `risk` | 5 | 9 |
| `aggression` | 3 | 4 |
| `paratend` | 3 | 4 |
| `leader` | 3 | 6 |
| `fishing` | 9 | 10 |
| `firemaking` | 7 | 9 |

Repeated provider work across U.S. appearances supports exceptional fishing, low work avoidance and strong fire competence. His voluntary South Pacific Redemption Island gambit supports high risk. Micronesia shows an intentional idol find, rather than a gifted advantage.

Evidence: Episode/career record and firsthand post-game interview: [Game Changers provider interview](https://parade.com/564581/joshwigler/survivor-game-changers-ozzy-lusth-exit-interview/). [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/ozzy_lusth.htm).

## Jay Starrett

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 7 | 8 |
| `idolhunt` | 7 | 8 |
| `risk` | 7 | 8 |
| `aggression` | 5 | 6 |
| `firemaking` | 6 | 3 |

The Michaela blindside and Ikabula idol search support proactive strategy and idol aptitude. Fishing experience is supported by his reproduced CBS bio. Millennials vs. Gen X episode 5 shows unsuccessful fire work before Michaela succeeds; athletic ability does not establish fire mastery.

Evidence: Episode record, reproduced CBS bio and interview: [Parade pregame](https://parade.com/504347/joshwigler/survivor-millennials-vs-gen-x-justin-jay-starrett/); [episode 5 recap](https://www.mic.com/articles/157203/survivor-season-33-episode-5-let-s-shake-things-up). [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/jay_starrett.htm).

## Natalie Anderson

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 9 | 10 |
| `idolhunt` | 6 | 7 |
| `idolshare` | 4 | 6 |
| `honesty` | 4 | 5 |
| `risk` | 8 | 9 |
| `aggression` | 7 | 8 |
| `fishing` | 6 | 5 |
| `laziness` | 2 | 1 |

Post-Jeremy San Juan del Sur maneuvering, the Jon/Baylor endgame and idol protection of Jaclyn support very high initiative and calculated risk. Winners at War adds sustained effort and advantage activity. Fishing is neutral rather than inferred from athleticism.

Evidence: Repeated televised strategy and career idol/advantage records. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/natalie_anderson.htm).

## Boston Rob Mariano

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 7 | 10 |
| `idolhunt` | 5 | 7 |
| `idolshare` | 6 | 4 |
| `honesty` | 6 | 4 |
| `risk` | 6 | 7 |
| `aggression` | 8 | 9 |
| `paratend` | 4 | 6 |
| `fishing` | 5 | 6 |
| `firemaking` | 8 | 10 |

Repeated strategic control supports high initiative, leadership and forceful strategic pressure. Heroes vs. Villains camp leadership and fire without flint, plus Island of the Idols fire teaching, support elite firemaking. Leadership does not become construction skill in the adapter.

Evidence: Repeated televised behavior and episode history: [Heroes vs. Villains history](https://survivor.fandom.com/wiki/Rob_Mariano/Heroes_vs._Villains). [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/rob_mariano.htm).

## Andrea Boehlke

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 6 | 7 |
| `idolhunt` | 5 | 6 |
| `idolshare` | 5 | 3 |
| `aggression` | 4 | 5 |
| `firemaking` | 6 | 5 |

Three U.S. appearances support balanced competence and active but non-extreme strategic behavior. In Caramoan she won the clue and Erik located the idol for her; possession alone is not elite searching evidence. Fishing/fire remain neutral in the absence of stronger demonstrated specialties.

Evidence: Career/episode records, distinguishing gifted/assisted idols from intentional finds. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/andrea_boehlke.htm).

## Jeremy Collins

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 7 | 8 |
| `idolhunt` | 6 | 9 |
| `idolshare` | 5 | 9 |
| `risk` | 6 | 7 |
| `aggression` | 4 | 5 |
| `fishing` | 6 | 5 |
| `firemaking` | 7 | 6 |

Two Cambodia searches and the idol used to save Stephen support strong searching and ally protection. Relationship-based meat-shield play supports comparatively measured paranoia and strategic pressure. Fire remains moderately competent, not elite merely because of his occupation.

Evidence: Televised idol finds/play and repeated career strategy. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/jeremy_collins.htm).

## Yul Kwon

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 6 | 9 |
| `idolhunt` | 6 | 7 |
| `idolshare` | 4 | 7 |
| `risk` | 5 | 4 |
| `paratend` | 3 | 2 |
| `leader` | 8 | 9 |
| `laziness` | 1 | 2 |
| `firemaking` | 7 | 6 |

Cook Islands idol discovery and deliberate leverage with Penner support high consequential strategy and leadership, with measured risk, pressure and paranoia. Revealing the idol to allies/opponents supports sharing. Fishing stays neutral; strategic skill is not wilderness skill.

Evidence: Televised idol/negotiation history across U.S. appearances. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/yul_kwon.htm).

## Kim Spradlin

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 8 | 10 |
| `idolhunt` | 4 | 8 |
| `idolshare` | 3 | 6 |
| `honesty` | 8 | 7 |
| `paratend` | 3 | 2 |
| `laziness` | 2 | 1 |
| `firemaking` | 7 | 6 |

One World control, an idol find and disclosure to Chelsea support quiet leadership and strategic initiative. Winners at War adds another find, sharing half with Sophie and an ally-directed play. High leadership is paired with low pressure/paranoia. Sparse fishing evidence remains neutral.

Evidence: Repeated televised leadership, idol finds and sharing records. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/kim_spradlin.htm).

## Tony Vlachos

| Field | Prior | New |
| --- | ---: | ---: |
| `idolhunt` | 9 | 10 |
| `idolshare` | 2 | 4 |
| `honesty` | 2 | 1 |
| `aggression` | 8 | 9 |
| `paratend` | 8 | 10 |
| `leader` | 8 | 9 |
| `fishing` | 4 | 3 |
| `laziness` | 4 | 3 |
| `firemaking` | 6 | 9 |

Repeated Cagayan/Winners at War idol searches, surveillance constructions and rapid strategic shifts justify extreme searching, paranoia and risk. His Winners at War fire win supports strong fire ability. Cooperative work is still possible; paranoia is a tendency, not access to hidden plans.

Evidence: Repeated televised searches/surveillance, career idol record and final-four fire result; U.S. evidence receives most weight. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/tony_vlachos.htm).

## Cirie Fields

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 8 | 10 |
| `idolhunt` | 3 | 2 |
| `idolshare` | 3 | 4 |
| `honesty` | 5 | 6 |
| `risk` | 5 | 6 |
| `aggression` | 2 | 3 |
| `paratend` | 6 | 5 |
| `leader` | 4 | 6 |
| `fishing` | 3 | 4 |
| `laziness` | 7 | 5 |

Consequential Panama/Micronesia strategy and later social maneuvering support exceptional initiative independent of wilderness ability. Panama fire defeat and subsequent Australian fire tiebreak evidence support weak firemaking. The lack of an idol-search specialty does not reduce her protected social/mental ratings.

Evidence: U.S. career/episode records; Australian fire result used only as supporting survival evidence. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/cirie_fields.htm).

## Sandra Diaz-Twine

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 6 | 7 |
| `idolhunt` | 3 | 6 |
| `idolshare` | 5 | 8 |
| `aggression` | 6 | 8 |
| `paratend` | 5 | 4 |
| `leader` | 3 | 4 |
| `fishing` | 2 | 7 |
| `laziness` | 8 | 3 |
| `firemaking` | 3 | 5 |

Pearl Islands camp work evidence contradicts the previous high work-avoidance value. Fishing/camping experience supports provider competence; blunt strategic confrontation supports high pressure without assuming controlling leadership. The Winners at War Denise idol transaction supports sharing/transfer willingness.

Evidence: Career records and firsthand fellow-contestant interview: [Andrew Savage on Sandra’s camp work](https://parade.com/418933/joshwigler/survivor-gives-andrew-savage-another-shot/); [CBS profile reproduction](https://survivor.fandom.com/wiki/Sandra_Diaz-Twine). [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/sandra_diaz-twine.htm).

## Kelley Wentworth

| Field | Prior | New |
| --- | ---: | ---: |
| `idolhunt` | 9 | 10 |
| `honesty` | 3 | 4 |
| `leader` | 5 | 6 |
| `laziness` | 4 | 3 |
| `firemaking` | 6 | 5 |

Cambodia searches, high-impact idol protection and risk under minority pressure support elite idol hunting. Edge of Extinction adds another find. Sensitive advantage information was usually guarded; searching and sharing remain separate. Fishing/fire stay neutral.

Evidence: Repeated televised idol searches/plays and career records. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/kelley_wentworth.htm).

## Parvati Shallow

| Field | Prior | New |
| --- | ---: | ---: |
| `idolhunt` | 7 | 8 |
| `idolshare` | 6 | 10 |
| `aggression` | 3 | 4 |
| `paratend` | 5 | 4 |
| `fishing` | 5 | 4 |

Micronesia coalition moves and the Heroes vs. Villains double-idol handoff to Sandra/Jerri support exceptional initiative, risk and sharing. A found idol is distinguished from Russell’s transferred idol. Leadership is not loudness, and guarded strategic truthfulness is not a moral judgment.

Evidence: Repeated televised strategy and the documented two-idol ally protection play. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/parvati_shallow.htm).

## Michele Fitzgerald

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 5 | 6 |
| `idolhunt` | 3 | 4 |
| `risk` | 4 | 6 |
| `aggression` | 2 | 3 |
| `paratend` | 3 | 6 |
| `firemaking` | 4 | 6 |

Kaôh Rōng and Winners at War support resilient, relationship-oriented play with moderate initiative/pressure. Fire practice and willingness are meaningful but do not establish an elite fire victory. Idol possession through an advantage transaction is not equivalent to strong intentional hunting.

Evidence: Career records and televised endgame behavior; uncertain survival specialties remain moderate. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/michele_fitzgerald.htm).

## Wendell Holland

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 6 | 7 |
| `idolhunt` | 4 | 5 |
| `idolshare` | 6 | 5 |
| `honesty` | 8 | 7 |
| `aggression` | 3 | 4 |
| `leader` | 6 | 8 |
| `laziness` | 2 | 1 |
| `firemaking` | 7 | 10 |

Ghost Island shelter construction using his furniture background and the final-four fire win support exceptional practical effort and firemaking. Winners at War also shows shelter work. High effort plus existing physical ratings informs shelter work; leader is not treated as a building skill.

Evidence: Televised campcraft/fire result and firsthand interview: [Wendell’s building experience](https://morewhatnot.com/2018/02/07/survivor-castaway-wendell-im-not-devil-im-not-russell-hantz/). [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/wendell_holland.htm).

## Tyson Apostol

| Field | Prior | New |
| --- | ---: | ---: |
| `bigmove` | 8 | 9 |
| `idolhunt` | 5 | 9 |
| `idolshare` | 6 | 2 |
| `risk` | 6 | 9 |
| `fishing` | 6 | 5 |
| `laziness` | 6 | 5 |
| `firemaking` | 6 | 7 |

Both Blood vs. Water idol finds, controlled disclosure and the rock draw support high hunting/risk with low sharing. A relaxed camp persona supports moderate work avoidance rather than poor competence. Humor is not evidence of random or universally reckless behavior.

Evidence: Televised idol searches/ownership and rock-draw record across U.S. appearances. [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/tyson_apostol.htm).

## Carolyn Wiger

| Field | Prior | New |
| --- | ---: | ---: |
| `idolhunt` | 6 | 9 |
| `idolshare` | 3 | 2 |
| `honesty` | 5 | 7 |
| `aggression` | 5 | 6 |
| `laziness` | 5 | 4 |
| `firemaking` | 5 | 7 |

Finding the Tika cage key/idol, concealing possession and planting the fake-idol setup support searching, secrecy and calculated risk. Emotional openness is not equated with complete strategic truthfulness or erratic choices. Fishing remains modest; fire is competent rather than an asserted championship skill.

Evidence: Televised actions and firsthand interview: [Dalton Ross midgame interview](https://ew.com/tv/survivor-44-carolyn-wiger-merge-interview/). The verified interview/episode evidence is the anchor here; the career-reference page was unavailable during verification.

## Russell Hantz

| Field | Prior | New |
| --- | ---: | ---: |
| `idolshare` | 1 | 6 |
| `aggression` | 9 | 10 |
| `paratend` | 8 | 9 |
| `leader` | 8 | 9 |
| `fishing` | 4 | 3 |
| `laziness` | 5 | 6 |
| `firemaking` | 4 | 5 |

Repeated clue-less searches, forceful strategic shifts and extensive in-game deception justify extreme hunting, initiative, risk and pressure. Samoa camp sabotage supports cooperative-work avoidance, not inactivity. Fishing/fire are not inflated by idol success.

Evidence: Repeated U.S. episode/idol records; sabotage corroborated in a firsthand interview: [Sandra postgame](https://www.tvguide.com/news/survivor-winner-sandra-1018585/). [Career, episode and bio reference](https://truedorktimes.com/survivor/cast/russell_hantz.htm).

## Runtime interpretation and limits

`CampBehaviorProfile` derives bounded drives from the existing 1–10 attributes; it is never serialized. Missing/non-finite custom or old-save attributes use neutral 5. Fishing and fire ratings dominate their NPC work skill; gathering/shelter use existing physical ratings, effort and modest current condition. No persistent general survival/campcraft stat is added. Work avoidance influences willingness, not the ability to do every unrelated action. Hands-on player minigames are preserved.

Stats tilt activity weights, success distributions, privacy/risk choices and information disclosure. Needs, assigned responsibilities, relationships, owned urgent information and fatigue still matter. Even an extreme rating cannot eliminate alternative activities or guarantee fire success. High idol-sharing increases private ally disclosure; existing idol transfer/play mechanics are preserved.

Camp knowledge stays in SocialMemory. Read-only owner projections feed bounded Strategy preferences and private/rumor Tribal facts. Visible meetings do not transmit private content. Direct statements, relays and inference retain different provenance; listeners never receive the speaker’s hidden lie marker. Legacy #343 hearsay is not retroactively promoted to firsthand/direct knowledge. Uncertain campcraft ratings and long-season balance should be revisited with playtesting; this pass does not retune challenge performance or later-game architecture.
