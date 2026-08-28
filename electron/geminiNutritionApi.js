// Gemini-based nutrition lookup — an optional, user-configured alternative
// to Open Food Facts. Uses Gemini's Google Search grounding tool so answers
// are anchored in live web results rather than pure model recall, which
// matters for factual nutrition numbers (an ungrounded LLM can plausibly
// hallucinate a calorie count).
//
// Cascades across three model tiers, each with its own separate free-tier
// daily quota in Google AI Studio, so one tier running dry doesn't stop
// lookups — it just moves to the next.
//
// The exact model lineup here is a moving target — verified live against
// the API at build time, not assumed:
//   - gemini-2.0-flash ("Gemini 2" in the AI Studio quota dashboard) is
//     fully removed from the API (404 "no longer available").
//   - gemini-2.5-flash and gemini-2.5-flash-lite are *also* gated off for
//     this account (404 "no longer available to new users" — Google
//     restricts new accounts to its current model generation).
//   - gemini-flash-latest ("Default"), gemini-3-flash-preview, and
//     gemini-3.5-flash-lite were all confirmed directly callable.
// If Google's lineup shifts again, update this list — nothing else in this
// file depends on the specific model names.
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_CASCADE = ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite'];

function buildPrompt(query) {
  return `You are a nutrition data assistant. Search for accurate, up-to-date nutrition information for this food or drink: "${query}".
Prefer official manufacturer nutrition labels or recognized nutrition databases over guesses.
Respond with ONLY a JSON object — no markdown formatting, no code fences, no explanation — in exactly this shape:
{"results":[{"name":"string","brand":"string","serving_size_g":number,"calories_per_100g":number,"protein_per_100g":number,"fat_per_100g":number,"carbs_per_100g":number,"saturated_fat_per_100g":number_or_null,"sugar_per_100g":number_or_null,"fiber_per_100g":number_or_null,"sodium_per_100g_mg":number_or_null}]}
Include up to 5 of the most relevant distinct matches (e.g. different brands or variants), most likely match first. All nutrition values must be normalized per 100g (or 100ml for drinks) even if the source lists a different serving size. If you can't find reliable data for this query, respond with {"results":[]}.`;
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeGeminiResult(r) {
  return {
    source: 'gemini',
    external_id: null,
    name: r.name || 'Unknown',
    brand: r.brand || '',
    serving_size: 100,
    serving_unit: 'g',
    serving_label: r.serving_size_g ? `${r.serving_size_g}g` : '',
    calories_per_100: Number(r.calories_per_100g) || 0,
    protein_per_100: Number(r.protein_per_100g) || 0,
    fat_per_100: Number(r.fat_per_100g) || 0,
    carbs_per_100: Number(r.carbs_per_100g) || 0,
    saturated_fat_per_100: r.saturated_fat_per_100g ?? null,
    sugar_per_100: r.sugar_per_100g ?? null,
    fiber_per_100: r.fiber_per_100g ?? null,
    sodium_per_100: r.sodium_per_100g_mg ?? null,
  };
}

async function callGemini(model, apiKey, query) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(query) }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || res.statusText;
    const err = new Error(`Gemini (${model}) failed (${res.status}): ${message}`);
    err.status = res.status;
    err.invalidKey = res.status === 400 && /api key/i.test(message);
    throw err;
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error(`Gemini (${model}) returned an unparseable response`);
  }
  return parsed.results.filter((r) => r && r.name).map(normalizeGeminiResult);
}

/**
 * Search nutrition facts via Gemini, cascading across model tiers when one
 * hits its daily quota (or any other per-model failure). Throws only if
 * every tier fails; an invalid API key fails fast rather than burning
 * through the whole cascade for nothing.
 */
async function searchFoodViaGemini(query, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('No Gemini API key configured');
  }
  const errors = [];
  for (const model of MODEL_CASCADE) {
    try {
      return await callGemini(model, apiKey.trim(), query);
    } catch (err) {
      errors.push(err.message);
      if (err.invalidKey) throw err; // no point trying other tiers with a bad key
    }
  }
  throw new Error(`All Gemini tiers exhausted: ${errors.join(' | ')}`);
}

module.exports = { searchFoodViaGemini, MODEL_CASCADE };
