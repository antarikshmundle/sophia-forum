import { analyze } from "./knowledge/text";
import type { ChatLanguage } from "./language";

/**
 * Ambiguous leadership questions ("Who leads the student council?", "Who is in charge?", "forum kaun sambhalta hai?",
 * "प्रभारी कौन है?"). Several people could be meant (the HOD, the forum President or Vice President, the Secretary, the
 * faculty mentors), and the published records only state who holds which ROLE, never who "leads" or "manages". So:
 *
 *   none       not a generic leadership question, or it names a role, person or specific thing ("Who is the HOD?",
 *              "Who is the technical team head?"): answered as usual
 *   resolved   leadership wording + the department ("Who leads the department?", "विभाग का प्रमुख कौन है?"): the head
 *              of a department is its HOD by definition, so retrieval looks for the HOD
 *   ambiguous  leadership wording without the department (the forum, the council, or nothing at all): the bot asks a
 *              short clarification question listing the roles that exist in the published records, without calling
 *              the model
 *
 * Deterministic, English/Hindi/Hinglish. A question without a domain of its own takes the domain of the visitor's
 * previous question ("Tell me about the AI & DS department" → "Who is in charge?" → HOD).
 */

export type LeadershipRole = "hod" | "president" | "vicePresident" | "secretary" | "facultyCoordinator" | "facultyMentors";

export type LeadershipDecision =
  | { kind: "none" }
  | { kind: "resolved"; role: "hod"; retrievalQuery: string }
  | { kind: "ambiguous"; scope: "forum" | "general" };

const LEADERSHIP = new RegExp(
  [
    // English
    "\\b(?:lead|leads|leading|leader|leaders|led|head|heads|headed|in[- ]?charge|incharge|manage|manages|managing|manager|managers|run|runs|running|chief|boss|responsible)\\b",
    "\\b(?:top|main|key) (?:person|people|authority)\\b",
    // Hinglish
    "\\b(?:lead (?:karta|karti|karte|karega|karegi)|pramukh|mukhiya|sanchalak|sambhalta|sambhalti|sambhalte|chalata|chalati|chalate|sabse (?:bada|badi|bade|upar))\\b",
  ].join("|"),
  "i",
);
const LEADERSHIP_HI = /(?<![\p{L}\p{M}])(?:प्रमुख|मुखिया|प्रभारी|इंचार्ज|नेतृत्व|नेता|लीडर|हेड|बॉस|संचालक|संचालन|चलाता|चलाती|चलाते|संभालता|संभालती|संभालते|ज़िम्मेदार|जिम्मेदार|मुख्य व्यक्ति|सबसे बड़ा|सबसे बड़ी|सबसे बड़े)(?![\p{L}\p{M}])/u;

const terms = (text: string) => new Set(analyze(text).exact);
const termsOf = (words: string) => new Set(analyze(words).exact);

/** A named role (or a role-like word) makes the question specific. */
const SPECIFIC_ROLES = termsOf(
  "hod president vice secretary treasurer principal director dean faculty mentor mentors coordinator coordinators samanvayak समन्वयक",
);
/** Words of the leadership vocabulary itself (removed before deciding whether anything specific is left). */
const LEADERSHIP_TERMS = termsOf(
  "lead leads leading leader leaders led head heads headed charge incharge manage manages managing manager managers run runs running chief boss " +
    "responsible top key person people authority karta karti karte karega karegi pramukh mukhiya sanchalak sambhalta sambhalti sambhalte chalata " +
    "chalati chalate sabse bada badi bade upar प्रमुख मुखिया प्रभारी इंचार्ज नेतृत्व नेता लीडर हेड बॉस संचालक संचालन चलाता चलाती चलाते संभालता " +
    "संभालती संभालते ज़िम्मेदार जिम्मेदार मुख्य व्यक्ति सबसे बड़ा बड़ी बड़े करता करती करते",
);
const FORUM_DOMAIN = termsOf("forum sophia team council committee student students club parishad परिषद छात्र फोरम सोफिया");
const DEPARTMENT_DOMAIN = termsOf("department dept vibhag विभाग ai ds aids data science artificial intelligence");
/** Words that add no subject of their own. */
const FILLER = termsOf("pce college nagpur overall currently now here our the main");

function domainOf(text: string): "forum" | "department" | null {
  const t = terms(text);
  if ([...t].some((x) => FORUM_DOMAIN.has(x))) return "forum";
  if ([...t].some((x) => DEPARTMENT_DOMAIN.has(x))) return "department";
  return null;
}

export function classifyLeadershipQuestion(question: string, previousQuestion?: string): LeadershipDecision {
  const lower = question.normalize("NFKC").toLowerCase();
  if (!LEADERSHIP.test(lower) && !LEADERSHIP_HI.test(lower)) return { kind: "none" };
  const t = terms(question);
  if ([...t].some((x) => SPECIFIC_ROLES.has(x))) return { kind: "none" };
  // anything else of substance (a team, an event, a place, a name) makes the question specific
  const rest = [...t].filter((x) => !LEADERSHIP_TERMS.has(x) && !FORUM_DOMAIN.has(x) && !DEPARTMENT_DOMAIN.has(x) && !FILLER.has(x));
  if (rest.length) return { kind: "none" };
  const domain = domainOf(question) ?? (previousQuestion ? domainOf(previousQuestion) : null);
  if (domain === "department") return { kind: "resolved", role: "hod", retrievalQuery: `${question} HOD` };
  return { kind: "ambiguous", scope: domain === "forum" ? "forum" : "general" };
}

/** Which roles a clarification may offer, in order, for each scope. */
export const CLARIFY_ROLES: Record<"forum" | "general", LeadershipRole[]> = {
  general: ["hod", "president", "vicePresident", "facultyCoordinator", "facultyMentors"],
  forum: ["president", "vicePresident", "secretary", "facultyCoordinator", "facultyMentors"],
};

/** How to check that a role exists in the published records: a search query and a test on its results. */
export const ROLE_PROBES: Record<LeadershipRole, { query: string; matches: (r: { title: string; text: string; docId: string }) => boolean }> = {
  hod: { query: "HOD", matches: (r) => /\bHOD\b/.test(r.title) },
  president: { query: "president", matches: (r) => /(?:^|,\s*)President$/.test(r.title) },
  vicePresident: { query: "vice president", matches: (r) => /Vice President$/.test(r.title) },
  secretary: { query: "secretary", matches: (r) => /Secretary$/.test(r.title) },
  facultyCoordinator: { query: "faculty coordinator", matches: (r) => /faculty coordinator/i.test(`${r.title} ${r.text}`) },
  facultyMentors: { query: "faculty mentors", matches: (r) => r.docId.startsWith("cms/faculty/") },
};

const LABELS: Record<LeadershipRole, Record<ChatLanguage, string>> = {
  hod: { en: "the HOD of the AI & DS Department", hi: "AI & DS विभाग के HOD", hinglish: "AI & DS Department ke HOD" },
  president: { en: "the Sophia Forum President", hi: "Sophia Forum के President", hinglish: "Sophia Forum ke President" },
  vicePresident: { en: "the Sophia Forum Vice President", hi: "Sophia Forum के Vice President", hinglish: "Sophia Forum ke Vice President" },
  secretary: { en: "the Sophia Forum Secretary", hi: "Sophia Forum के Secretary", hinglish: "Sophia Forum ke Secretary" },
  facultyCoordinator: { en: "the faculty coordinator", hi: "faculty coordinator", hinglish: "faculty coordinator" },
  facultyMentors: { en: "the faculty mentors", hi: "faculty mentors", hinglish: "faculty mentors" },
};

/** Example questions for each role: the clarification only suggests questions for roles it offers. */
const EXAMPLE: Record<LeadershipRole, Record<ChatLanguage, string>> = {
  hod: { en: "Who is the HOD?", hi: "HOD कौन हैं?", hinglish: "HOD kaun hain?" },
  president: { en: "Who is the Sophia Forum President?", hi: "Sophia Forum के President कौन हैं?", hinglish: "Sophia Forum ke President kaun hain?" },
  vicePresident: { en: "Who is the Vice President?", hi: "Vice President कौन हैं?", hinglish: "Vice President kaun hain?" },
  secretary: { en: "Who is the Secretary?", hi: "Secretary कौन हैं?", hinglish: "Secretary kaun hain?" },
  facultyCoordinator: { en: "Who is the faculty coordinator?", hi: "faculty coordinator कौन हैं?", hinglish: "faculty coordinator kaun hain?" },
  facultyMentors: { en: "Who are the faculty mentors?", hi: "faculty mentors कौन हैं?", hinglish: "faculty mentors kaun hain?" },
};

/** The fixed clarification question (never model output; no first-person forms). */
export function clarificationText(roles: LeadershipRole[], language: ChatLanguage): string {
  const labels = roles.map((r) => LABELS[r][language]);
  const or = { en: "or", hi: "या", hinglish: "ya" }[language];
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ${or} ${labels[labels.length - 1]}` : labels[0];
  const examples = roles.slice(0, 2).map((r) => `"${EXAMPLE[r][language]}"`).join(` ${or} `);
  if (language === "hi") return `इस सवाल से एक से ज़्यादा लोगों का मतलब हो सकता है। आप किसके बारे में पूछ रहे हैं: ${list}? कृपया पद का नाम लेकर दोबारा पूछें, जैसे ${examples}`;
  if (language === "hinglish") return `Is sawaal se ek se zyada log matlab ho sakte hain. Aap kiske baare mein pooch rahe hain: ${list}? Please role ka naam lekar dobara poochiye, jaise ${examples}`;
  return `That could mean more than one person. Do you mean ${list}? Please ask again with the role, for example ${examples}`;
}
