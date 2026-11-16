/**
 * Text analysis for keyword retrieval in English, Hindi (Devanagari) and Hinglish (Hindi in Latin letters).
 *
 *   normalizeText   clean display text: Unicode NFKC, LF line ends, no control characters, tidy whitespace
 *   analyze         searchable terms of a text, in two tiers:
 *                     exact   lowercased tokens without stopwords, with common campus words in any of the three
 *                             languages mapped to one concept ("pravesh", "प्रवेश", "admissions" → "admission")
 *                     folded  a spelling-tolerant key for Latin tokens, for the many ways Hinglish and Indian names
 *                             are written ("Shubham"/"Shubam", "Preeti"/"Priti", "fees"/"fee")
 *
 * The vocabulary below is language, not institutional fact: it never adds information to an answer, it only helps a
 * question find the document that holds the answer. It is deterministic and has no dependencies.
 */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g;

/** Display text: NFKC, LF line ends, no control or zero-width characters, single spaces, at most one blank line. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const LATIN = /^[a-z0-9]+$/;

/** Lowercased word tokens (letters, combining marks and digits) for search; Latin accents removed, Devanagari unified. */
export function tokenize(text: string): string[] {
  const t = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Latin accents only (Devanagari vowel signs are also marks and must stay)
    .normalize("NFC")
    .toLowerCase()
    .replace(/़/g, "") // nukta: क़ → क, ज़ → ज
    .replace(/ँ/g, "ं"); // chandrabindu → anusvara: कहाँ / कहां
  return t.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

// Question and function words that carry no topic, in English, Hinglish and Hindi.
const STOPWORDS = new Set(
  (
    // English
    "a an the is are was were be been am do does did can could will would shall should may might must i me my mine we us our " +
    "you your yours he him his she her hers it its they them their theirs this that these those there here what which who whom whose when where why how " +
    "of for to in on at by with from into about as and or but if then than so not no yes any some all please tell show give " +
    "know want need get let also just more most very much many such like " +
    // Hinglish
    "kya kab kaha kahan kahaan kaise kese kaisa kaun kon kaunsa konsa kitna kitni kitne kyun kyu hai hain he hei ho hota hoti hote " +
    "tha thi the thhe ka ki ke ko se me mein mai main mujhe muje mujhko hume humein hum tum aap apna apni apne par pe aur ya bhi " +
    "toh to na nahi nahin nhi batao bataiye bataye btao bata bta batana chahiye chahie chaiye kar karo karna karte kare wala wali " +
    "wale ek yeh ye woh wo iska iski iske uska uski uske hota h ji sir madam mam bhai yaar hua hue hui kiya kiye " +
    "unka unki unke unko unhe unhone inka inki inke inko " +
    // Hindi
    "क्या कब कहां कहाँ कैसे कैसा कौन कौनसा कितना कितनी कितने क्यों है हैं हो होता होती होते था थी थे का की के को से में मैं मुझे " +
    "हम हमें आप अपना अपनी अपने पर और या भी तो न नहीं बताओ बताइए बताइये बताएं चाहिए कर करें करना वाला वाली वाले एक यह ये वह वो " +
    "इसका इसकी इसके उसका उसकी उसके जी हुआ हुए हुई किया किए किये उनका उनकी उनके उनको उन्हें उन्होंने इनका इनकी इनके"
  )
    .split(" ")
    .flatMap((w) => tokenize(w)),
);

/**
 * Campus concepts: every spelling on the right is indexed and searched as the concept on the left. English plurals,
 * common misspellings, Hinglish transliterations and Hindi words. Keep entries to general vocabulary.
 */
const CONCEPTS: Record<string, string> = {
  admission: "admission admissions admit admitted pravesh parvesh dakhila daakhila दाखिला प्रवेश एडमिशन",
  fee: "fee fees shulk shulka फीस शुल्क",
  college: "college colleges collage clg mahavidyalaya mahavidyalay कॉलेज कालेज महाविद्यालय",
  department: "department departments dept vibhag vibhaag विभाग डिपार्टमेंट",
  faculty: "faculty faculties teacher teachers teach teaches teaching professor professors prof shikshak adhyapak pradhyapak padhate padhati फैकल्टी शिक्षक अध्यापक प्राध्यापक पढ़ाते पढ़ाती",
  hod: "hod विभागाध्यक्ष एचओडी",
  // committee roles (the two-word "vice president" forms are PHRASES below)
  president: "president presidents adhyaksh adhyaksha अध्यक्ष प्रेसिडेंट",
  secretary: "secretary secretaries sachiv सचिव सेक्रेटरी",
  treasurer: "treasurer treasurers koshadhyaksh koshadhyaksha कोषाध्यक्ष ट्रेजरर",
  principal: "principal pradhanacharya pracharya प्रिंसिपल प्राचार्य",
  director: "director directors nideshak निदेशक डायरेक्टर",
  library: "library libraries pustakalaya pustakalay लाइब्रेरी पुस्तकालय",
  hostel: "hostel hostels chhatravas chatravas छात्रावास हॉस्टल",
  exam: "exam exams examination examinations pariksha priksha परीक्षा एग्जाम",
  timing: "timing timings time times samay समय टाइमिंग",
  contact: "contact contacts sampark संपर्क कॉन्टैक्ट",
  phone: "phone mobile telephone फोन मोबाइल",
  email: "email emails mail ईमेल",
  address: "address location located pata sthan पता स्थान लोकेशन",
  event: "event events karyakram aayojan कार्यक्रम आयोजन इवेंट",
  placement: "placement placements naukri नौकरी प्लेसमेंट",
  scholarship: "scholarship scholarships chhatravritti chatravritti छात्रवृत्ति स्कॉलरशिप",
  syllabus: "syllabus curriculum pathyakram पाठ्यक्रम सिलेबस",
  result: "result results parinam natija परिणाम नतीजा रिजल्ट",
  course: "course courses programme programmes program programs कोर्स",
  canteen: "canteen cafeteria कैंटीन",
  transport: "transport bus buses बस",
  campus: "campus parisar परिसर कैंपस",
  team: "team teams council टीम",
  committee: "committee committees samiti समिति कमेटी",
  member: "member members sadasya सदस्य मेंबर",
  student: "student students chhatra vidyarthi छात्र विद्यार्थी स्टूडेंट",
  gallery: "gallery galleries photo photos tasveer tasvir गैलरी फोटो तस्वीर",
  video: "video videos वीडियो",
  mission: "mission uddeshya उद्देश्य मिशन",
  vision: "vision drishti दृष्टि विज़न विजन",
  objective: "objective objectives lakshya लक्ष्य",
  forum: "forum forums manch मंच फोरम",
  sophia: "sophia sofia सोफिया",
  nagpur: "nagpur नागपुर",
  rule: "rule rules policy policies niyam niti नियम नीति पॉलिसी",
  attendance: "attendance upasthiti hajri हाजिरी उपस्थिति",
  holiday: "holiday holidays chhutti chutti छुट्टी अवकाश",
  registration: "registration register registrations panjikaran पंजीकरण रजिस्ट्रेशन",
  message: "message messages sandesh संदेश मैसेज",
  history: "history itihas इतिहास",
  milestone: "milestone milestones",
  engineering: "engineering engineer engineers abhiyantriki इंजीनियरिंग",
  ai: "ai एआई",
  data: "data डेटा",
  science: "science vigyan विज्ञान साइंस",
};

const CONCEPT_OF = new Map<string, string>();
for (const [concept, spellings] of Object.entries(CONCEPTS)) {
  for (const s of [concept, ...spellings.split(" ")]) for (const t of tokenize(s)) CONCEPT_OF.set(t, concept);
}

/**
 * Spelling-tolerant key for a Latin token: long vowels shortened (ee→i, oo→u), h after a consonant dropped
 * (Shubham → subam), w→v, ph→f, z→j, q→k, repeated letters collapsed, and an English plural s removed.
 */
export function fold(token: string): string {
  if (!LATIN.test(token) || /^\d+$/.test(token)) return token;
  let t = token.replace(/ee/g, "i").replace(/oo/g, "u").replace(/ph/g, "f").replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k");
  t = t.replace(/([bcdfgjklmnprstvx])h/g, "$1");
  t = t.replace(/(.)\1+/g, "$1");
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  return t;
}

export interface Terms {
  exact: string[];
  folded: string[];
}

// Multi-word names of a concept, replaced before tokenizing (on lowercased text).
const PHRASES: [RegExp, string][] = [
  [/\bhead of (?:the )?(?:department|dept)\b/g, " hod "],
  // "who heads the AI and DS department", "department head"
  [/\bheads? (?:of )?(?:the )?(?:ai ?(?:&|and) ?ds )?(?:department|dept)\b/g, " hod "],
  [/\b(?:department|dept) head\b/g, " hod "],
  [/\bvibhag (?:pramukh|adhyaksh)\b/g, " hod "],
  [/विभाग प्रमुख/g, " hod "],
  // vice president: the Hindi/Hinglish one-word forms become the two English words the team records use
  // (whole word only, so विभागाध्यक्ष and अध्यक्ष are untouched)
  [/(?<![\p{L}\p{M}])उपाध्यक्ष(?![\p{L}\p{M}])/gu, " vice president "],
  [/\bupadhyaksha?\b/g, " vice president "],
];

/** Searchable terms of a text (repeats kept: they count as term frequency). */
export function analyze(text: string): Terms {
  let lowered = text.normalize("NFKC").toLowerCase();
  for (const [phrase, concept] of PHRASES) lowered = lowered.replace(phrase, concept);
  const exact: string[] = [];
  for (const token of tokenize(lowered)) {
    if (STOPWORDS.has(token)) continue;
    if (LATIN.test(token) && token.length < 2 && !/\d/.test(token)) continue; // single letters carry nothing
    exact.push(CONCEPT_OF.get(token) ?? token);
  }
  return { exact, folded: exact.map(fold) };
}
