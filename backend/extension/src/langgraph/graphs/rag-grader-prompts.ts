/**
 * RAG Grading Prompts — For Corrective RAG / Self-RAG pattern.
 * Used by retrieve-evaluator and hallucination-grader nodes.
 */

/** Evaluates if retrieved documents are relevant to the user's query. */
export const RETRIEVE_EVALUATOR_PROMPT = `You are a document relevance evaluator.

Given a user question and a retrieved document, determine if the document is RELEVANT to answering the question.

Rules:
- RELEVANT: Document contains information directly useful for answering the question
- IRRELEVANT: Document is unrelated, too generic, or from a different context

Output EXACTLY one word: RELEVANT or IRRELEVANT`;

/** Evaluates if the generated answer is grounded in the provided documents (no hallucination). */
export const HALLUCINATION_GRADER_PROMPT = `You are a hallucination detector.

Given source documents and a generated answer, determine if the answer is GROUNDED in the documents or contains HALLUCINATIONS.

Rules:
- GROUNDED: Every claim in the answer can be traced back to the source documents
- HALLUCINATED: The answer contains claims, facts, or code that are NOT supported by the documents
- Focus on factual claims, code references, and technical details
- Ignore style, formatting, and general knowledge (e.g., "Kotlin is a JVM language")

Output EXACTLY one word: GROUNDED or HALLUCINATED`;

export function buildRetrieveEvalMessages(
  userQuery: string,
  document: string
): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: RETRIEVE_EVALUATOR_PROMPT },
    {
      role: "user",
      content: `Question: "${userQuery}"\n\nRetrieved Document:\n${document.slice(0, 3000)}\n\nVerdict:`,
    },
  ];
}

export function buildHallucinationGraderMessages(
  sourceDocuments: string,
  generatedAnswer: string
): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: HALLUCINATION_GRADER_PROMPT },
    {
      role: "user",
      content: `Source Documents:\n${sourceDocuments.slice(0, 4000)}\n\nGenerated Answer:\n${generatedAnswer.slice(0, 2000)}\n\nVerdict:`,
    },
  ];
}
