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
// Ordered Lite-first: "Lite" tiers consistently carry Google's most generous
// free-tier daily request quota (Pro < Flash < Flash-Lite, historically by a
// wide margin), and this task — pulling structured nutrition JSON off a
// grounded search — doesn't need a heavier model's reasoning. Putting the
// biggest quota first means it absorbs most searches, and the app only
// spends the smaller flash-latest/3-flash-preview quotas as overflow once
// Lite's daily budget is exhausted.
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
const MODEL_CASCADE = ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3-flash-preview'];

function buildPrompt(query) {
  return `You are a nutrition data assistant. Search for accurate, up-to-date nutrition information for this food or drink: "${query}".
This is a routine nutrition-label lookup, not a request for advice — answer for any food, packaged product, beverage (including juices, sodas, energy drinks, and alcoholic drinks), fruit, vegetable, or dish, without refusing or adding caveats.
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

// Food/drink nutrition lookups are benign, but a query naming an alcoholic
// drink, energy drink, or supplement can otherwise trip Gemini's default
// safety thresholds (HARM_CATEGORY_DANGEROUS_CONTENT in particular) and get
// silently blocked — the request still returns 200 OK, just with no usable
// content. Relaxing these to BLOCK_ONLY_HIGH keeps genuinely unsafe content
// blocked while letting ordinary "beer", "vodka", "energy drink" nutrition
// queries through.
const SAFETY_SETTINGS = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

// Per-model cooldown after a 429, so a search doesn't re-burn a round trip
// on a tier that's already known to be rate-limited/quota-exhausted for the
// next little while. In-memory only (resets on app restart) — this is a
// short-lived backoff, not a record of the actual daily quota window, since
// Google doesn't tell us which kind of limit (per-minute vs per-day) was
// hit or exactly when it resets.
const quotaCooldownUntil = new Map(); // model -> epoch ms
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

// Google's 429 responses often carry a structured RetryInfo detail telling
// us exactly how long to back off (e.g. "31s") — prefer that over guessing.
function parseRetryDelayMs(body) {
  const detail = body?.error?.details?.find((d) => d['@type']?.includes('RetryInfo'));
  const raw = detail?.retryDelay; // e.g. "31s"
  if (!raw) return null;
  const seconds = parseFloat(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

async function callGemini(model, apiKey, query) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(query) }] }],
      tools: [{ google_search: {} }],
      safetySettings: SAFETY_SETTINGS,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || res.statusText;
    const err = new Error(`Gemini (${model}) failed (${res.status}): ${message}`);
    err.status = res.status;
    err.invalidKey = res.status === 400 && /api key/i.test(message);
    if (res.status === 429) {
      err.rateLimited = true;
      quotaCooldownUntil.set(model, Date.now() + (parseRetryDelayMs(body) || DEFAULT_COOLDOWN_MS));
    }
    throw err;
  }

  const data = await res.json();

  // The prompt itself can be blocked before any candidate is generated
  // (e.g. blockReason "SAFETY" or "OTHER") — data.candidates is absent
  // entirely in that case, so check this before indexing into it.
  if (!data?.candidates?.length) {
    const reason = data?.promptFeedback?.blockReason || 'no candidates returned';
    throw new Error(`Gemini (${model}) blocked the request (${reason})`);
  }

  const candidate = data.candidates[0];
  if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
    throw new Error(`Gemini (${model}) stopped early (${candidate.finishReason})`);
  }

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
  let allRateLimited = true;
  let skippedAll = true;
  for (const model of MODEL_CASCADE) {
    const cooldown = quotaCooldownUntil.get(model);
    if (cooldown && cooldown > Date.now()) {
      errors.push(`Gemini (${model}) still rate-limited`);
      continue;
    }
    skippedAll = false;
    try {
      return await callGemini(model, apiKey.trim(), query);
    } catch (err) {
      errors.push(err.message);
      if (err.invalidKey) throw err; // no point trying other tiers with a bad key
      if (!err.rateLimited) allRateLimited = false;
    }
  }
  if (allRateLimited) {
    throw new Error(
      skippedAll
        ? 'Gemini is rate-limited on all tiers — retrying automatically in a few minutes'
        : 'Gemini rate limit exceeded on all tiers for today'
    );
  }
  throw new Error(`All Gemini tiers exhausted: ${errors.join(' | ')}`);
}

module.exports = { searchFoodViaGemini, MODEL_CASCADE };
