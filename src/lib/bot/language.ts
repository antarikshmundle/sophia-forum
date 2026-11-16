/**
 * The language to answer in: Hindi (Devanagari), Hinglish (Hindi in Latin letters) or English.
 * Devanagari letters → hi. Otherwise Hinglish when the message uses Hindi function words written in Latin letters
 * (kya, hai, kaise, batao …), else English. General vocabulary only; deterministic.
 */

export type ChatLanguage = "en" | "hi" | "hinglish";

const HINGLISH_WORDS = new Set(
  ("kya kab kaha kahan kahaan kaise kese kaisa kaun kon kaunsa konsa kitna kitni kitne kyun kyu hai hain hota hoti hote tha thi " +
    "mein mai mujhe muje hume humein aap apna apni apne aur bhi nahi nahin nhi batao bataiye bataye btao bata bta chahiye chahie " +
    "karna karo karte kare wala wali wale yeh ye woh wo iska iski uska uski milega milegi milta milti hoga hogi sakta sakti sakte " +
    "kidhar kahin abhi kal aaj").split(" "),
);
// short words that are also English ("me", "to", "ho") only count next to a clear Hinglish word
const WEAK_WORDS = new Set("ka ki ke ko se me pe par ho h na ji".split(" "));

// Hindi question and function words written in Devanagari: one of them makes a mixed-script question Hindi
// ("forum ke faculty mentors कौन हैं?"), even when most letters are Latin.
const HINDI_FUNCTION_WORD = /(?<![\p{L}\p{M}])(?:क्या|कौन|कब|कहाँ|कहां|कैसे|कितना|कितनी|कितने|क्यों|है|हैं|था|थी|थे|का|की|के|को|से|में|और)(?![\p{L}\p{M}])/u;

export function detectLanguage(text: string): ChatLanguage {
  const devanagari = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (devanagari > 0 && (devanagari >= latin * 0.3 || HINDI_FUNCTION_WORD.test(text))) return "hi";
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const strong = words.filter((w) => HINGLISH_WORDS.has(w)).length;
  const weak = words.filter((w) => WEAK_WORDS.has(w)).length;
  return strong >= 2 || (strong >= 1 && weak >= 1) ? "hinglish" : "en";
}

export const LANGUAGE_INSTRUCTION: Record<ChatLanguage, string> = {
  en: "Answer in English.",
  hi:
    "Answer in Hindi, written in Devanagari script: natural, conversational Hindi as a helpful senior student would explain it, " +
    "not a word-for-word translation. Keep names of people, events and the forum, official designations (for example " +
    "\"Assistant Professor & HOD\"), department names, titles and links exactly as written in the sources; do not translate or " +
    "transliterate them. Common English campus words students use (HOD, faculty, event, committee) may stay in English. " +
    "When you refer to yourself, use the feminine first person: \"मैं बता सकती हूँ\", \"मैं मदद कर सकती हूँ\", \"मैं समझा सकती हूँ\"; " +
    "never masculine forms such as \"सकता हूँ\" or \"बताता हूँ\". Do not guess anyone else's gender: refer to people by name and designation.",
  hinglish:
    "Answer in Hinglish: Hindi written in Latin letters, natural and conversational, matching the style of the question and " +
    "using the English words students normally mix in. Keep names of people, events and the forum, official designations, " +
    "department names, titles and links exactly as written in the sources; do not translate them. " +
    "When you refer to yourself, use the feminine first person: \"main bata sakti hoon\", \"main help kar sakti hoon\", " +
    "\"main samjha sakti hoon\"; never masculine forms such as \"sakta hoon\" or \"batata hoon\". Do not guess anyone else's " +
    "gender: refer to people by name and designation.",
};

/**
 * Fixed replies that never come from the model. They are factual and avoid first-person verb forms altogether, so they
 * never contradict the bot's voice; the model's own Hindi/Hinglish answers use the approved feminine first person
 * (LANGUAGE_INSTRUCTION and the system instruction, rule 9). A masculine form here would clash with it.
 */
export const FALLBACK_TEXT: Record<"no-sources" | "not-in-sources" | "rejected" | "injection" | "unavailable", Record<ChatLanguage, string>> = {
  "no-sources": {
    en: "I don't have verified information about that yet. I can only answer from published Sophia Forum content and verified AI & DS Department and PCE documents. Please check the official PCE website or ask the department office.",
    hi: "इस बारे में अभी सत्यापित जानकारी उपलब्ध नहीं है। Sophia Bot के उत्तर केवल Sophia Forum की प्रकाशित सामग्री और सत्यापित AI & DS विभाग व PCE दस्तावेज़ों पर आधारित होते हैं। कृपया PCE की आधिकारिक वेबसाइट देखें या विभाग कार्यालय से संपर्क करें।",
    hinglish: "Iske baare mein abhi verified information available nahi hai. Sophia Bot ke answers sirf Sophia Forum ke published content aur verified AI & DS Department aur PCE documents par based hote hain. Please PCE ki official website dekhein ya department office se contact karein.",
  },
  "not-in-sources": {
    en: "The verified sources I have don't answer that. Please check the official PCE website or ask the department office.",
    hi: "उपलब्ध सत्यापित स्रोतों में इसका उत्तर नहीं है। कृपया PCE की आधिकारिक वेबसाइट देखें या विभाग कार्यालय से संपर्क करें।",
    hinglish: "Available verified sources mein iska answer nahi hai. Please PCE ki official website dekhein ya department office se contact karein.",
  },
  rejected: {
    en: "I couldn't give a properly sourced answer to that, so I won't guess. Please try rephrasing, or check the official PCE website.",
    hi: "इसका सही स्रोत वाला उत्तर नहीं मिल पाया, इसलिए अनुमान से कोई उत्तर नहीं दिया जाएगा। कृपया प्रश्न दूसरे शब्दों में पूछें या PCE की आधिकारिक वेबसाइट देखें।",
    hinglish: "Iska properly sourced answer nahi mil paaya, isliye guess karke koi answer nahi diya jayega. Please question dusre tarike se poochein ya PCE ki official website dekhein.",
  },
  injection: {
    en: "I can only answer questions about Sophia Forum, the AI & DS Department and PCE from verified sources. I can't change how I work.",
    hi: "Sophia Bot में केवल सत्यापित स्रोतों के आधार पर Sophia Forum, AI & DS विभाग और PCE से जुड़े प्रश्नों के उत्तर मिलते हैं, और इसके नियम बदले नहीं जा सकते।",
    hinglish: "Sophia Bot mein sirf verified sources ke basis par Sophia Forum, AI & DS Department aur PCE se jude questions ke answers milte hain, aur iske rules badle nahi ja sakte.",
  },
  unavailable: {
    en: "Sophia Bot can't answer right now. Please try again in a little while.",
    hi: "Sophia Bot से अभी उत्तर नहीं मिल पा रहा है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    hinglish: "Sophia Bot se abhi answer nahi mil pa raha hai. Please thodi der baad phir try karein.",
  },
};
