import type { AiSettings } from "./types";

/**
 * Picks which configured model handles a piece of work.
 *
 * Two models are configured for content: a fast default, and a stronger one
 * for material that needs actual reasoning rather than transcription. Most
 * course content is the former — definitions, protocol names, lab
 * instructions — and paying reasoning latency on all of it is what made the
 * first pass over these courses so slow.
 *
 * The signal is the text itself. Maths shows up as notation far more reliably
 * than as vocabulary, so the test is weighted towards symbols and LaTeX, with
 * wording ("derive", "prove", "推导") as a secondary cue. Being wrong is cheap
 * in both directions: a missed switch answers with the fast model, a false one
 * costs some latency.
 */

// Notation: LaTeX delimiters, maths operators, comparison and set symbols,
// Greek letters, super/subscript digits — and the plain-text spellings people
// actually type, since "Var(X) = E[X^2]" is a maths question however it is
// written and carries none of the above.
const NOTATION =
  /\$\$?[^$]+\$\$?|\\\(|\\\[|\\frac|\\sum|\\int|\\sqrt|[∑∫√∂∇≈≠≤≥∈∉⊂∪∩±×÷→⇒∞]|[α-ωΑ-Ω]|[⁰¹²³⁴⁵⁶⁷⁸⁹]|\w\^\w|\b(?:Var|Cov|Pr|E|P|log|ln|exp|lim|max|min|sum)\s*[([]/;

// Wording that asks for working rather than recall.
const REASONING_WORDS =
  /\b(derive|derivation|prove|proof|theorem|lemma|calculate|compute|solve|evaluate|integral|probability|variance|expectation|complexity|big-?o|asymptotic|throughput|latency|bandwidth-delay|cpi|speedup|amdahl)\b|推导|证明|计算|求解|定理|复杂度|概率|方差|期望/i;

// A formula or two in a long document doesn't make it a maths document; this
// is roughly "notation shows up more than once per couple of thousand
// characters", which separates a derivation-heavy deck from a networking one
// that mentions one equation.
const NOTATION_DENSITY = 2000;

export function looksMathematical(text: string): boolean {
  if (!text) return false;
  if (REASONING_WORDS.test(text)) return true;

  const matches = text.match(new RegExp(NOTATION.source, "g"));
  if (!matches) return false;
  // A short question with any notation at all is asking about maths.
  if (text.length < 400) return true;
  return matches.length >= Math.max(2, Math.floor(text.length / NOTATION_DENSITY));
}

export type ModelTask = "content" | "translate";

/**
 * The model id for a unit of work. `sample` is the text being worked on —
 * a question, a document, a chapter's points — and decides whether the
 * reasoning model is warranted.
 */
export function pickModel(settings: AiSettings, task: ModelTask, sample = ""): string {
  if (task === "translate") {
    return settings.translateModel?.trim() || settings.model;
  }
  const reasoning = settings.reasoningModel?.trim();
  if (reasoning && looksMathematical(sample)) return reasoning;
  return settings.model;
}
