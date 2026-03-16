import fs from "node:fs";
import path from "node:path";

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export type CategoryPromptSettings = {
  includeVisuals: boolean;
  maxVisualCluesPerCategory: number;
  reasoningEffort: ReasoningEffort;
  maxImageSearchTries: number;
  commonsThumbWidth: number;
  preferPhotos: boolean;
  includeExamples?: boolean;
  includeFillTemplate?: boolean;
};

export type BenchmarkPromptSettings = {
  include_visuals?: boolean;
  max_visual_clues_per_category?: number;
  reasoning_effort?: ReasoningEffort;
  max_image_search_tries?: number;
  commons_thumb_width?: number;
  prefer_photos?: boolean;
  include_examples?: boolean;
  include_fill_template?: boolean;
};

export type BenchmarkPromptFiles = {
  category?: string;
  final?: string;
};

export type BenchmarkPromptWorkflow = {
  reasoning_effort?: ReasoningEffort;
  prompt_preset?: "baseline" | "update";
  prompt_files?: BenchmarkPromptFiles;
  prompt_settings?: BenchmarkPromptSettings;
  category_prompt_suffix?: string;
  final_prompt_suffix?: string;
};

const BASELINE_CATEGORY_TEMPLATE = `You are a professional Jeopardy clue writer.

TASK:
Write ONE complete Jeopardy category titled: "$CATEGORY"

VALUES:
- Exactly 5 clues with values $VALUES_JSON (ascending).
- Difficulty strictly increases with value.

JEOPARDY STYLE RULES:
- Clues are statements (NO question marks).
- Answers are phrased as questions and must end with a single "?".
- Use standard Jeopardy formats:
  - "Who is/was ...?"
  - "What is/are ...?"
  - "What is \\"(Title)\\"?"
- Avoid: "called", "known as", "name of" unless unavoidable.
- Do NOT include the category title verbatim in any clue or answer.
- Do NOT include the answer in the clue (no exact answer string, case-insensitive).
- Factual, verifiable, and uniquely identifiable (no subjective phrasing).

ANTI-VAGUENESS:
- Do NOT use: "often", "sometimes", "many", "some", "considered", "various", "widely", "may be".
- For clues at $MID_VALUE and higher, include at least TWO disambiguating anchors
  (e.g., year + proper noun, title + author, location + event, official name + date).

VARIETY:
- Avoid repeating the same lead-in structure more than twice.
- Do not reuse the same person/work/event across different clues.
- Avoid near-duplicate clue styles (don't make all 5 "This ___ is..." in a row).

$DIFFICULTY_RUBRIC

$VISUAL_RULES

OUTPUT:
Return ONLY valid JSON in this exact shape (no markdown, no extra text):
$JSON_SCHEMA_SNIPPET

STRICT:
- Exactly 5 values.
- "values" must be exactly $VALUES_JSON in ascending order.
- Valid JSON only. No trailing commas. No extra keys at the top level.

$REASONING_RULES
$FILL_TEMPLATE_EXAMPLE
$WORKED_EXAMPLES
$CATEGORY_PROMPT_SUFFIX`;

const BASELINE_FINAL_TEMPLATE = `You are a professional Jeopardy Final Jeopardy writer.

TASK:
Create ONE Final Jeopardy clue for category: "$CATEGORY"

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
$FINAL_PROMPT_SUFFIX`;

const UPDATE_CATEGORY_TEMPLATE = `You are writing ONE Jeopardy category as valid JSON.

Category title: "$CATEGORY"
Clue values: $VALUES_JSON

Return JSON only. No markdown. No commentary.

Hard requirements:
- Exactly 5 clues.
- "values" must be exactly $VALUES_JSON in ascending order.
- Clues are statements, never questions.
- Every answer must be Jeopardy-form and end with exactly one "?".
- Allowed answer starts: "Who is", "Who was", "What is", "What are", "Where is", "What is \\"...\\"?"
- Do not include the category title verbatim in any clue or answer.
- Do not include the exact answer string inside the clue.
- Each clue must have exactly one best answer.
- No duplicate answers.
- No subjective or vague wording.
- Use valid JSON only, with proper escaping.

Difficulty:
$DIFFICULTY_RUBRIC

Anti-vagueness:
- Never use: "often", "sometimes", "many", "some", "considered", "various", "widely", "may be".
- For clues at $MID_VALUE and higher, include at least TWO concrete anchors.
- Prefer concrete anchors like year, place, title, official name, person, event, or institution.
- If a harder clue feels ambiguous, make it easier rather than clever.

Quality bar:
- Low-value clues should be direct and broadly known.
- High-value clues can be harder, but must still be uniquely pinned.
- Prefer shorter, cleaner clue sentences over ornate phrasing.
- Avoid repeating the same lead-in structure more than twice.
- Do not reuse the same person, work, or event across clues.

$VISUAL_RULES

Output shape:
$JSON_SCHEMA_SNIPPET

Pre-submit checklist:
- Is every clue uniquely solvable?
- Is every clue factually verifiable?
- Does every clue avoid the answer text?
- Does every answer use correct Jeopardy formatting?
- Is the JSON valid?

$REASONING_RULES
$FILL_TEMPLATE_EXAMPLE
$WORKED_EXAMPLES
$CATEGORY_PROMPT_SUFFIX`;

const UPDATE_FINAL_TEMPLATE = `You are writing ONE Final Jeopardy clue as valid JSON.

Category title: "$CATEGORY"

Return JSON only. No markdown. No commentary.

Hard requirements:
- Exactly 1 clue and 1 answer.
- Clue is a statement, never a question.
- Answer must be Jeopardy-form and end with exactly one "?".
- Allowed answer starts: "Who is", "Who was", "What is", "What are", "Where is", "What is \\"...\\"?"
- Do not include the category title verbatim in clue or answer.
- Clue must have exactly one best answer.
- Use valid JSON only.

Anti-vagueness:
- Never use: "often", "sometimes", "many", "some", "considered", "various", "widely", "may be".
- Include at least THREE concrete anchors in the clue.
- If the clue feels ambiguous, make it easier rather than clever.

Output shape:
{
  "category": "Category Name",
  "values": [
    { "question": "Clue text", "answer": "Correct response phrased as a question?" }
  ]
}

Pre-submit checklist:
- Single best answer; no plausible alternates.
- No question mark in clue text.
- Answer ends with exactly one "?".
- JSON is valid and properly escaped.

$FINAL_PROMPT_SUFFIX`;

const PROMPT_PRESETS = {
  baseline: {
    category: BASELINE_CATEGORY_TEMPLATE,
    final: BASELINE_FINAL_TEMPLATE,
  },
  update: {
    category: UPDATE_CATEGORY_TEMPLATE,
    final: UPDATE_FINAL_TEMPLATE,
  },
} as const;

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

function reasoningRules(reasoningEffort: ReasoningEffort) {
  if (reasoningEffort === "off") return "";

  const intensity =
    reasoningEffort === "low"
      ? "Do a quick pass and fix obvious issues."
      : reasoningEffort === "medium"
        ? "Do a careful pass and fix anything questionable."
        : "Be extremely strict. Rewrite anything even slightly ambiguous.";

  return `
VERIFICATION STEP (${reasoningEffort.toUpperCase()}):
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
  const ex1 = `
EXAMPLE 1 (STRUCTURE + STYLE ONLY; DO NOT REUSE FACTS):
{
  "category": "Rivers of the World",
  "values": [
    { "value": 200, "question": "This river flows through Paris before reaching the English Channel.", "answer": "What is the Seine?" },
    { "value": 400, "question": "With headwaters in Lake Victoria, this river runs north through Uganda and Sudan.", "answer": "What is the Nile?" },
    { "value": 600, "question": "In 1932, the Hoover Dam began controlling this river that forms much of the Arizona-Nevada border.", "answer": "What is the Colorado River?" },
    { "value": 800, "question": "The city of Manaus sits near the confluence of this river and the Rio Negro in Brazil.", "answer": "What is the Amazon River?" },
    { "value": 1000, "question": "Known as the Lancang in China, this river becomes the Mekong as it continues into Southeast Asia.", "answer": "What is the Mekong River?" }
  ]
}
`.trim();

  const ex2 = `
EXAMPLE 2 (STRUCTURE + STYLE ONLY; DO NOT REUSE FACTS):
{
  "category": "Literary Villains",
  "values": [
    { "value": 200, "question": "This Shakespeare villain manipulates Othello into believing his wife is unfaithful.", "answer": "Who is Iago?" },
    { "value": 400, "question": "In Dostoevsky's 'Crime and Punishment', Raskolnikov murders this pawnbroker.", "answer": "Who is Alyona Ivanovna?" },
    { "value": 600, "question": "This Dickens villain runs the brutal boys' school Dotheboys Hall in 'Nicholas Nickleby'.", "answer": "Who is Wackford Squeers?" },
    { "value": 800, "question": "Cormac McCarthy's 'No Country for Old Men' features this unstoppable killer who uses a captive bolt pistol as his weapon of choice.", "answer": "Who is Anton Chigurh?" },
    { "value": 1000, "question": "In Nabokov's 'Lolita', Humbert Humbert refers to his rival Clare Quilty by this occupation, which Quilty actually holds.", "answer": "What is a playwright?" }
  ]
}
`.trim();

  const ex3 = `
EXAMPLE 3 (STRUCTURE + STYLE ONLY; DO NOT REUSE FACTS):
{
  "category": "European Capitals",
  "values": [
    { "value": 200, "question": "This capital sits on the River Thames and is home to Buckingham Palace.", "answer": "What is London?" },
    { "value": 400, "question": "This Italian capital is home to the Colosseum, the largest amphitheater ever built.", "answer": "What is Rome?" },
    { "value": 600, "question": "This capital on the Danube is formed by the historic towns of Buda and Pest.", "answer": "What is Budapest?" },
    { "value": 800, "question": "This capital's Charles Bridge crosses the Vltava River.", "answer": "What is Prague?" },
    { "value": 1000, "question": "The Althing, founded in 930 AD at Thingvellir, serves as the parliament of this North Atlantic island nation's capital.", "answer": "What is Reykjavik?" }
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
    { "value": 1000, "question": "Often called 'La Sagrada Familia,' this basilica in Barcelona was designed by Antoni Gaudi.", "answer": "What is the Basilica de la Sagrada Familia?" }
  ]
}
`.trim();

  return includeVisuals ? [ex1, ex2, ex3, ex4Visual].join("\n\n") : [ex1, ex2, ex3].join("\n\n");
}

function collapsePromptWhitespace(prompt: string) {
  return prompt
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderTemplate(template: string, substitutions: Record<string, string>) {
  return collapsePromptWhitespace(
    template.replace(/\$([A-Z_]+)/g, (_match, key: string) => substitutions[key] ?? ""),
  );
}

function tryReadPromptFile(filePath: string, baseDir?: string) {
  const candidates = [
    baseDir ? path.resolve(baseDir, filePath) : "",
    path.resolve(process.cwd(), filePath),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8");
    }
  }

  return null;
}

function resolvePromptPreset(workflow?: BenchmarkPromptWorkflow) {
  return workflow?.prompt_preset === "update" ? "update" : "baseline";
}

function resolvePromptTemplate(
  kind: keyof (typeof PROMPT_PRESETS)["baseline"],
  workflow?: BenchmarkPromptWorkflow,
  baseDir?: string,
) {
  const filePath = workflow?.prompt_files?.[kind];
  if (filePath) {
    const fromFile = tryReadPromptFile(filePath, baseDir);
    if (!fromFile) {
      throw new Error(`Prompt template not found: ${filePath}`);
    }
    return fromFile;
  }

  return PROMPT_PRESETS[resolvePromptPreset(workflow)][kind];
}

export function defaultPromptSettings(workflow?: BenchmarkPromptWorkflow): CategoryPromptSettings {
  const settings = workflow?.prompt_settings ?? {};
  const reasoningEffort = workflow?.reasoning_effort ?? settings.reasoning_effort ?? "off";

  return {
    includeVisuals: Boolean(settings.include_visuals ?? false),
    maxVisualCluesPerCategory: Number(settings.max_visual_clues_per_category ?? 2),
    reasoningEffort,
    maxImageSearchTries: Number(settings.max_image_search_tries ?? 6),
    commonsThumbWidth: Number(settings.commons_thumb_width ?? 1600),
    preferPhotos: Boolean(settings.prefer_photos ?? true),
    includeExamples: Boolean(settings.include_examples ?? true),
    includeFillTemplate: Boolean(settings.include_fill_template ?? true),
  };
}

export function buildCategoryPromptFromWorkflow(
  category: string,
  double: boolean,
  workflow?: BenchmarkPromptWorkflow,
  baseDir?: string,
) {
  const settings = defaultPromptSettings(workflow);
  const values = valuesFor(double);
  const template = resolvePromptTemplate("category", workflow, baseDir);

  return renderTemplate(template, {
    CATEGORY: category,
    VALUES_JSON: JSON.stringify(values),
    MID_VALUE: String(values[2]),
    DIFFICULTY_RUBRIC: difficultyRubric(values),
    VISUAL_RULES: visualRules(settings),
    JSON_SCHEMA_SNIPPET: jsonSchemaSnippet(values, settings.includeVisuals),
    REASONING_RULES: reasoningRules(settings.reasoningEffort),
    FILL_TEMPLATE_EXAMPLE: settings.includeFillTemplate
      ? fillTemplateExample(values, settings.includeVisuals)
      : "",
    WORKED_EXAMPLES: settings.includeExamples ? workedExamples(settings.includeVisuals) : "",
    CATEGORY_PROMPT_SUFFIX: String(workflow?.category_prompt_suffix ?? "").trim(),
  });
}

export function buildFinalPromptFromWorkflow(
  category: string,
  workflow?: BenchmarkPromptWorkflow,
  baseDir?: string,
) {
  const template = resolvePromptTemplate("final", workflow, baseDir);

  return renderTemplate(template, {
    CATEGORY: category,
    FINAL_PROMPT_SUFFIX: String(workflow?.final_prompt_suffix ?? "").trim(),
  });
}
