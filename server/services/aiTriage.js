// ─────────────────────────────────────────────────────────────────
// services/aiTriage.js — AI-powered emergency severity classification
// ─────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS:
//   Static priorityScore (from EMERGENCY_TYPE enum) treats every
//   "cardiac" request the same, whether it's mild chest tightness
//   or a full arrest. This service reads the patient's free-text
//   description and produces a more granular, context-aware score
//   — plus first-aid guidance we can push to the caller immediately.
//
// WHY GROQ (not a paid API):
//   Groq offers a free tier that's plenty for a portfolio project —
//   no credit card, generous daily limits, and it's fast. This is
//   the ONLY file that talks to an AI provider — every other file
//   (dispatch.js, requestController.js, etc.) just consumes whatever
//   JSON this function returns, so swapping providers again later
//   (or adding a paid one for production) only ever means editing
//   this one file.
//
// RELIABILITY RULE:
//   Dispatch must NEVER hang waiting on an LLM. This function has a
//   hard timeout and always falls back to the static score on any
//   failure (timeout, API error, malformed response). AI here is an
//   enhancement layer, never a single point of failure.
// ─────────────────────────────────────────────────────────────────

const { PRIORITY_SCORES } = require('../utils/constants');

const AI_TIMEOUT_MS = 3000; // never block dispatch for more than 3s
const MODEL = 'llama-3.1-8b-instant'; // fast + free tier, good enough for classification

const SYSTEM_PROMPT = `You are an emergency triage assistant for an ambulance dispatch system.
Given a patient's short description of their emergency, respond with ONLY a JSON object
(no markdown, no preamble, no explanation) in this exact shape:

{
  "severityLevel": "critical" | "high" | "moderate" | "low",
  "priorityScore": <integer 0-100, where 100 is most urgent>,
  "suspectedCondition": "<short phrase, e.g. 'possible cardiac arrest'>",
  "reasoning": "<one sentence, for the dispatcher/audit log>",
  "firstAidSteps": ["<step 1>", "<step 2>", "<step 3>"]
}

Guidelines:
- Be conservative: if in doubt, classify higher severity rather than lower.
- firstAidSteps should be 2-4 short, safe, layperson-actionable instructions
  a caller can follow while waiting (e.g. "Keep the patient still", "Do not give food or water").
- Never suggest anything requiring medical training beyond basic first aid (CPR, pressure, positioning).
- If the description is vague or empty, use "moderate" severity and generic safety steps.
- This service operates in India. If a step would normally mention calling emergency
  services, refer to "108" (India's national ambulance/emergency number), never "911".
- Respond with ONLY the JSON object, nothing else.`;

/**
 * Classify an emergency using Groq (free tier), with timeout + fallback.
 * @param {string} description - patient's free-text description
 * @param {string} emergencyType - the enum type (cardiac/trauma/etc) as fallback context
 * @returns {Promise<object>} triage result — always resolves, never throws
 */
const classifyEmergency = async (description, emergencyType) => {
  const fallback = {
    severityLevel: 'unknown',
    priorityScore: PRIORITY_SCORES[emergencyType] || 50,
    suspectedCondition: null,
    reasoning: 'AI triage unavailable — used static priority score.',
    firstAidSteps: [],
    source: 'fallback',
  };

  // Skip the AI call entirely if there's nothing to classify
  if (!description || description.trim().length === 0) {
    return fallback;
  }

  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️  GROQ_API_KEY not set — skipping AI triage, using fallback.');
    return fallback;
  }

  try {
    const result = await Promise.race([
      callGroq(description, emergencyType),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI triage timeout')), AI_TIMEOUT_MS)
      ),
    ]);

    return { ...result, source: 'ai' };
  } catch (error) {
    console.error(`❌ AI triage failed: ${error.message} — falling back to static score`);
    return fallback;
  }
};

const callGroq = async (description, emergencyType) => {
  // Groq uses the same request shape as OpenAI's chat completions API
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      temperature: 0.3, // low temperature — this is a classification task, not creative writing
      response_format: { type: 'json_object' }, // Groq/Llama supports forced JSON output
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Emergency type: ${emergencyType}\nPatient description: "${description}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Groq API returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;

  if (!rawText) {
    throw new Error('No content in Groq response');
  }

  // response_format:json_object guarantees valid JSON, but strip fences defensively anyway
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate shape — malformed response should fall back, not corrupt data
  if (
    typeof parsed.priorityScore !== 'number' ||
    parsed.priorityScore < 0 ||
    parsed.priorityScore > 100
  ) {
    throw new Error('AI response failed validation');
  }

  return {
    severityLevel: parsed.severityLevel || 'moderate',
    priorityScore: Math.round(parsed.priorityScore),
    suspectedCondition: parsed.suspectedCondition || null,
    reasoning: parsed.reasoning || '',
    firstAidSteps: Array.isArray(parsed.firstAidSteps) ? parsed.firstAidSteps.slice(0, 4) : [],
  };
};

module.exports = { classifyEmergency };