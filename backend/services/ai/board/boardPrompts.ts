// backend/services/ai/boardPrompts.ts

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export type CategoryPromptSettings = {
  includeVisuals: boolean;
  maxVisualCluesPerCategory: number;

  reasoningEffort: ReasoningEffort;

  // These are only used for the VISUAL rules text (not required for schema)
  maxImageSearchTries: number;
  commonsThumbWidth: number;
  preferPhotos: boolean;

  /**
   * Optional: include worked examples in the prompt.
   * Costs tokens but tends to increase consistency.
   */
  includeExamples?: boolean;

  /**
   * Optional: include a "fill this out" template example.
   * Costs tokens but helps lock the schema.
   */
  includeFillTemplate?: boolean;
};

export function valuesFor(double: boolean) {
  return double ? [400, 800, 1200, 1600, 2000] : [200, 400, 600, 800, 1000];
}

function jsonSchemaSnippet(values: number[], includeVisuals: boolean) {
  if (includeVisuals) {
    return `{"category":"Category Name","values":[
  {"value":${values[0]},"question":"Clue text","answer":"Correct response phrased as a question?","visual":{"commonsSearchQueries":["query 1","query 2"]}},
  {"value":${values[1]},"question":"...","answer":"...?"},
  {"value":${values[2]},"question":"...","answer":"...?"},
  {"value":${values[3]},"question":"...","answer":"...?"},
  {"value":${values[4]},"question":"...","answer":"...?"}
]}`;
  }

  return `{"category":"Category Name","values":[
  {"value":${values[0]},"question":"Clue text","answer":"Correct response phrased as a question?"},
  {"value":${values[1]},"question":"...","answer":"...?"},
  {"value":${values[2]},"question":"...","answer":"...?"},
  {"value":${values[3]},"question":"...","answer":"...?"},
  {"value":${values[4]},"question":"...","answer":"...?"}
]}`;
}

function difficultyRubric(values: number[]) {
  return `
DIFFICULTY RUBRIC:
- ${values[0]}: direct, widely-known fact (single-hop recall).
- ${values[1]}: still common knowledge but slightly more specific.
- ${values[2]}: one extra detail or inference; still uniquely pinned.
- ${values[3]}: niche but fair; must include strong disambiguating anchors.
- ${values[4]}: hardest; may be multi-hop but must remain unambiguous and verifiable.
`.trim();
}

function reasoningRules(settings: CategoryPromptSettings) {
  if (settings.reasoningEffort === "off") return "";

  const intensity =
    settings.reasoningEffort === "low"
      ? "Do a quick pass and fix obvious issues."
      : settings.reasoningEffort === "medium"
        ? "Do a careful pass and fix anything questionable."
        : "Be extremely strict. Rewrite anything even slightly ambiguous.";

  return `
VERIFICATION STEP (${settings.reasoningEffort.toUpperCase()}):
- ${intensity}
- Fact-check every clue/answer pair.
- Ensure each clue has exactly ONE best answer (no plausible alternates).
- Ensure clue text contains NO question marks.
- Ensure every answer:
  - ends with exactly one "?"
  - uses standard Jeopardy form: "Who is/was ...?", "What is/are ...?", "Where is ...?", "What is \\"(Title)\\"?"
- Ensure the clue does NOT contain the answer string (case-insensitive substring match).
- Ensure no duplicate answers.
- Ensure valid JSON with proper escaping (no unescaped double quotes in strings).
- If you revise any item, re-check all items again.
`.trim();
}

function visualRules(settings: CategoryPromptSettings) {
  if (!settings.includeVisuals) return "";

  return `
VISUAL CLUES (optional per clue):
- Make up to ${settings.maxVisualCluesPerCategory} of the 5 clues visual (or choose none).
- Visual clues MUST still be solvable from the text alone (image is a bonus, not required).
- ONLY choose subjects easy to find an exact picture of (famous people, famous places, everyday objects).
- If a clue is visual, add:
  "visual": { "commonsSearchQueries": ["...", "..."] }
- Provide EXACTLY 2 search queries, designed to find the SAME specific subject.
- Queries must be exact-match oriented:
  - Prefer proper nouns, official names, specific objects (not generic categories).
  - No URLs, no filenames.
- Do not exceed ${settings.maxImageSearchTries} tries when searching images (system rule).
- Thumbnail target width is ${settings.commonsThumbWidth}px (system rule).
- preferPhotos=${settings.preferPhotos ? "true" : "false"} (system preference).
`.trim();
}

/**
 * A "fill this out" template the model can mirror.
 * IMPORTANT: Instruct the model NOT to reuse these facts; it’s structure-only.
 */
function fillTemplateExample(values: number[], includeVisuals: boolean) {
  if (includeVisuals) {
    return `
FILL TEMPLATE (STRUCTURE ONLY; DO NOT REUSE FACTS):
{
  "category": "YOUR CATEGORY NAME",
  "values": [
    {
      "value": ${values[0]},
      "question": "A direct, common-knowledge clue statement with no question mark.",
      "answer": "What is/are ...?",
      "visual": { "commonsSearchQueries": ["Specific subject query 1", "Specific subject query 2"] }
    },
    { "value": ${values[1]}, "question": "Slightly harder clue statement.", "answer": "Who is/was ...?" },
    { "value": ${values[2]}, "question": "Medium clue with at least two anchors (e.g., year + proper noun).", "answer": "What is ...?" },
    { "value": ${values[3]}, "question": "Hard clue with strong anchors; still uniquely solvable.", "answer": "Where is ...?" },
    { "value": ${values[4]}, "question": "Hardest clue; may be multi-hop but unambiguous.", "answer": "What is ...?" }
  ]
}
`.trim();
  }

  return `
FILL TEMPLATE (STRUCTURE ONLY; DO NOT REUSE FACTS):
{
  "category": "YOUR CATEGORY NAME",
  "values": [
    { "value": ${values[0]}, "question": "A direct, common-knowledge clue statement with no question mark.", "answer": "What is/are ...?" },
    { "value": ${values[1]}, "question": "Slightly harder clue statement.", "answer": "Who is/was ...?" },
    { "value": ${values[2]}, "question": "Medium clue with at least two anchors (e.g., year + proper noun).", "answer": "What is ...?" },
    { "value": ${values[3]}, "question": "Hard clue with strong anchors; still uniquely solvable.", "answer": "Where is ...?" },
    { "value": ${values[4]}, "question": "Hardest clue; may be multi-hop but unambiguous.", "answer": "What is ...?" }
  ]
}
`.trim();
}

function workedExamples(includeVisuals: boolean) {
  // NOTE: These are intended to show STYLE + DISAMBIGUATION, not be copied.
  // Keep categories varied so the model learns broad patterns.

  const ex1 = `
EXAMPLE 1 (STRUCTURE + STYLE ONLY; DO NOT REUSE FACTS):
{
  "category": "Rivers of the World",
  "values": [
    { "value": 200, "question": "This river flows through Paris before reaching the English Channel.", "answer": "What is the Seine?" },
    { "value": 400, "question": "With headwaters in Lake Victoria, this river runs north through Uganda and Sudan.", "answer": "What is the Nile?" },
    { "value": 600, "question": "In 1932, the Hoover Dam began controlling this river that forms much of the Arizona–Nevada border.", "answer": "What is the Colorado River?" },
    { "value": 800, "question": "The city of Manaus sits near the confluence of this river and the Rio Negro in Brazil.", "answer": "What is the Amazon River?" },
    { "value": 1000, "question": "Known as the Lancang in China, this river becomes the Mekong as it continues into Southeast Asia.", "answer": "What is the Mekong River?" }
  ]
}
`.trim();

  const ex2 = `
EXAMPLE 4 (STRUCTURE + STYLE ONLY; DO NOT REUSE FACTS):
{
  "category": "3-Letter Airport Codes",
  "values": [
    { "value": 200, "question": "LAX is the IATA code for this major airport serving Los Angeles.", "answer": "What is Los Angeles International Airport?" },
    { "value": 400, "question": "In New York City, JFK is the IATA code for this airport in Queens.", "answer": "What is John F. Kennedy International Airport?" },
    { "value": 600, "question": "Paris’s main international airport uses this IATA code: CDG.", "answer": "What is Charles de Gaulle Airport?" },
    { "value": 800, "question": "Tokyo’s busy airport abbreviated HND is better known by this neighborhood name.", "answer": "What is Haneda Airport?" },
    { "value": 1000, "question": "Chicago’s O’Hare uses the code ORD, inherited from this earlier airport name.", "answer": "What is Orchard Field Airport?" }
  ]
}
`.trim();

  const ex3 = `
EXAMPLE 3 (STRUCTURE + STYLE ONLY; DO NOT REUSE FACTS):
{
  "category": "European Capitals",
  "values": [
    { "value": 200, "question": "This capital sits on the River Thames and is home to Buckingham Palace.", "answer": "What is London?" },
    { "value": 400, "question": "The Colosseum is a landmark in this capital city.", "answer": "What is Rome?" },
    { "value": 600, "question": "This capital on the Danube is formed by the historic towns of Buda and Pest.", "answer": "What is Budapest?" },
    { "value": 800, "question": "This capital's Charles Bridge crosses the Vltava River.", "answer": "What is Prague?" },
    { "value": 1000, "question": "The Althing, founded in 930, is associated with this capital in the world's oldest continuing parliament tradition.", "answer": "What is Reykjavík?" }
  ]
}
`.trim();

  const ex4Visual = `
EXAMPLE 4 (VISUAL FORMAT ONLY; DO NOT REUSE FACTS):
{
  "category": "Famous Landmarks",
  "values": [
    {
      "value": 200,
      "question": "This Paris iron lattice tower was completed in 1889 for a World's Fair.",
      "answer": "What is the Eiffel Tower?",
      "visual": { "commonsSearchQueries": ["Eiffel Tower Paris 1889", "Tour Eiffel Paris landmark"] }
    },
    { "value": 400, "question": "This statue in New York Harbor was a gift from France and was dedicated in 1886.", "answer": "What is the Statue of Liberty?" },
    { "value": 600, "question": "Machu Picchu, an Inca citadel, sits in this South American country.", "answer": "What is Peru?" },
    { "value": 800, "question": "This ancient amphitheater in Rome began construction under Emperor Vespasian.", "answer": "What is the Colosseum?" },
    { "value": 1000, "question": "Often called 'La Sagrada Família,' this basilica in Barcelona was designed by Antoni Gaudí.", "answer": "What is the Basílica de la Sagrada Família?" }
  ]
}
`.trim();

  // Keep 3–5 examples. If visuals enabled, include the visual-form example too.
  return includeVisuals ? [ex1, ex2, ex3, ex4Visual].join("\n\n") : [ex1, ex2, ex3].join("\n\n");
}

export function categoryPrompt(
  category: string,
  double: boolean,
  settings: CategoryPromptSettings,
) {
  const values = valuesFor(double);

  const rules = `
You are a professional Jeopardy clue writer.

TASK:
Write ONE complete Jeopardy category titled: "${category}"

VALUES:
- Exactly 5 clues with values ${JSON.stringify(values)} (ascending).
- Difficulty strictly increases with value.

JEOPARDY STYLE RULES:
- Clues are statements (NO question marks).
- Answers are phrased as questions and must end with a single "?".
- Use standard Jeopardy formats:
  - "Who is/was ...?"
  - "What is/are ...?"
  - "Where is ...?"
  - "What is \\"(Title)\\"?"
- Avoid: "called", "known as", "name of" unless unavoidable.
- Do NOT include the category title verbatim in any clue or answer.
- Do NOT include the answer in the clue (no exact answer string, case-insensitive).
- Factual, verifiable, and uniquely identifiable (no subjective phrasing).

ANTI-VAGUENESS:
- Do NOT use: "often", "sometimes", "many", "some", "considered", "various", "widely", "may be".
- For clues at ${values[2]} and higher, include at least TWO disambiguating anchors
  (e.g., year + proper noun, title + author, location + event, official name + date).

VARIETY:
- Avoid repeating the same lead-in structure more than twice.
- Do not reuse the same person/work/event across different clues.
- Avoid near-duplicate clue styles (don’t make all 5 "This ___ is..." in a row).

${difficultyRubric(values)}

${visualRules(settings)}

OUTPUT:
Return ONLY valid JSON in this exact shape (no markdown, no extra text):
${jsonSchemaSnippet(values, settings.includeVisuals)}

STRICT:
- Exactly 5 values.
- "values" must be exactly ${JSON.stringify(values)} in ascending order.
- Valid JSON only. No trailing commas. No extra keys at the top level.

${reasoningRules(settings)}
`.trim();

  const template = settings.includeFillTemplate
    ? `\n\n${fillTemplateExample(values, settings.includeVisuals)}`
    : "";

  const examples = settings.includeExamples ? `\n\n${workedExamples(settings.includeVisuals)}` : "";

  return `${rules}${template}${examples}`.trim();
}

export function finalPrompt(category: string) {
  return `
You are a professional Jeopardy Final Jeopardy writer.

TASK:
Create ONE Final Jeopardy clue for category: "${category}"

RULES:
- Exactly ONE clue and ONE response.
- Very difficult, but uniquely solvable.
- Factual, unambiguous, verifiable.
- Do NOT include the category title verbatim in clue/answer.
- Clue is a statement (NO question mark).
- Answer is a question and ends with "?" using standard Jeopardy format.

ANTI-VAGUENESS:
- Do NOT use: "often", "sometimes", "many", "some", "considered", "various", "widely", "may be".
- Include at least THREE disambiguating anchors in the clue
  (e.g., year + proper noun + title; location + date + official name; quote + speaker + event).

OUTPUT ONLY valid JSON in this exact shape:

{
  "category": "Category Name",
  "values": [
    { "question": "Clue text", "answer": "Correct response phrased as a question?" }
  ]
}

STRICT:
- Exactly 1 value.
- No markdown. No extra text. Valid JSON only.

FINAL CHECK (silently revise until all pass):
- Single best answer; no plausible alternates.
- No question mark in clue text.
- Answer ends with "?" and uses standard Jeopardy format.
- JSON is valid and properly escaped.
`.trim();
}
