/**
 * Follow-up detection: does this question lean on the previous one ("What is their designation?", "aur vice
 * president?", "उनका पद क्या है?")? Only then is the previous question used to find the subject. A question without such
 * words is a new topic and is answered from its own sources alone (or the honest fallback), never from the old topic.
 *
 * English, Hindi and Hinglish pronouns and continuation words; general vocabulary only, deterministic.
 */

const PRONOUNS = new Set(
  (
    // English
    "they them their theirs he him his she her hers it its this that these those same " +
    // Hinglish
    "unka unki unke unko unhe unhone uska uski uske usko use usne iska iski iske isko ise inka inki inke inko inhe woh wo ye yeh vo"
  ).split(" "),
);
const HINDI_PRONOUN = /(?<![\p{L}\p{M}])(?:उनका|उनकी|उनके|उनको|उन्हें|उन्होंने|उसका|उसकी|उसके|उसको|उसे|उसने|इसका|इसकी|इसके|इसको|इसे|इनका|इनकी|इनके|वह|वो|ये|यह)(?![\p{L}\p{M}])/u;
// a question that starts by continuing the previous one
const CONTINUATION = /^\s*(?:and|also|what about|how about|same for|aur|or|toh|to|phir|fir|और|तो|फिर)\b/iu;
const CONTINUATION_HI = /^\s*(?:और|तो|फिर)(?![\p{L}\p{M}])/u;

export function isFollowUp(question: string): boolean {
  if (CONTINUATION.test(question) || CONTINUATION_HI.test(question) || HINDI_PRONOUN.test(question)) return true;
  const words = question.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((w) => PRONOUNS.has(w));
}
