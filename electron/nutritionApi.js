// Free nutrition data lookups via Open Food Facts: https://world.openfoodfacts.org
// Fully open, no API key required, and has real coverage of Indian packaged
// brands (Amul, Britannia, Haldiram's, MTR, Parle, Maggi, etc. — Indian
// barcodes carry the 890 GS1 country prefix). For home-style/generic Indian
// dishes (dal, roti, biryani, idli...) that packaged-goods databases don't
// cover, see indianFoodsSeed.js, which seeds the local catalog directly.

const { searchFoodViaGemini } = require('./geminiNutritionApi');

const OFF_BASE = 'https://world.openfoodfacts.org';
const USER_AGENT = 'LifeOS-DesktopApp/1.0 (local nutrition tracker)';

function per100FromOffProduct(p) {
  const n = p.nutriments || {};
  // Open Food Facts nutriments are typically per 100g/100ml already.
  const calories = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0);
  return {
    calories_per_100: calories || 0,
    protein_per_100: n['proteins_100g'] || 0,
    fat_per_100: n['fat_100g'] || 0,
    carbs_per_100: n['carbohydrates_100g'] || 0,
    // Optional extended fields, when OFF has them (sodium is reported in
    // grams by OFF; our schema stores mg, so convert).
    saturated_fat_per_100: n['saturated-fat_100g'] ?? null,
    sugar_per_100: n['sugars_100g'] ?? null,
    fiber_per_100: n['fiber_100g'] ?? null,
    sodium_per_100: n['sodium_100g'] != null ? n['sodium_100g'] * 1000 : null,
  };
}

function normalizeOffProduct(p) {
  return {
    source: 'off',
    external_id: p.code,
    name: p.product_name,
    brand: p.brands || '',
    serving_size: 100,
    serving_unit: 'g',
    serving_label: p.serving_size || '',
    ...per100FromOffProduct(p),
  };
}

const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,quantity';

// Open Food Facts returns an HTML error page (not JSON) when it's
// rate-limiting or temporarily down — turning that into an error message
// used to dump the raw HTML markup into the UI. This maps status codes to
// short, human-readable text instead.
function friendlyOffError(status, bodyText) {
  if (status === 503 || status === 429) return 'Open Food Facts is temporarily busy — try again in a moment.';
  if (status >= 500) return 'Open Food Facts is temporarily unavailable.';
  if (status === 404) return 'Open Food Facts had no data for that.';
  const looksLikeHtml = /^\s*<(!doctype|html)/i.test(bodyText || '');
  if (looksLikeHtml || !bodyText) return `Open Food Facts request failed (${status}).`;
  return bodyText.slice(0, 150);
}

async function fetchOffJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(friendlyOffError(res.status, text));
  }
  return res.json();
}

// Plain text search — matches against product *name*. A query like "yogabar"
// only surfaces products whose name literally contains that word, which
// misses anything named e.g. "Chocolate Protein Shake" with brand "Yogabar"
// stored separately. searchByBrand below covers that gap.
async function searchByName(query) {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(
    query
  )}&search_simple=1&action=process&json=1&page_size=25&fields=${OFF_FIELDS}`;
  const data = await fetchOffJson(url);
  return (data.products || []).filter((p) => p.product_name);
}

// Brand-facet search — returns every product tagged under a brand whose name
// contains the query, regardless of what the product itself is named. This
// is what actually finds "everything a brand makes."
async function searchByBrand(query) {
  const url = `${OFF_BASE}/cgi/search.pl?tagtype_0=brands&tag_contains_0=contains&tag_0=${encodeURIComponent(
    query
  )}&json=1&page_size=40&fields=${OFF_FIELDS}`;
  const data = await fetchOffJson(url);
  return (data.products || []).filter((p) => p.product_name);
}

async function searchOpenFoodFacts(query) {
  const [nameResult, brandResult] = await Promise.allSettled([searchByName(query), searchByBrand(query)]);

  const products = [];
  const seenCodes = new Set();
  const addAll = (list) => {
    for (const p of list) {
      if (p.code && seenCodes.has(p.code)) continue;
      if (p.code) seenCodes.add(p.code);
      products.push(p);
    }
  };
  if (nameResult.status === 'fulfilled') addAll(nameResult.value);
  if (brandResult.status === 'fulfilled') addAll(brandResult.value);

  // Only throw if BOTH searches failed — a rate-limited/unavailable brand
  // search shouldn't hide perfectly good name-search results, and vice versa.
  if (nameResult.status === 'rejected' && brandResult.status === 'rejected') {
    throw nameResult.reason;
  }
  return products.map(normalizeOffProduct);
}

/**
 * Look up a single product by its barcode (EAN-13/UPC/etc, as read off a
 * package or decoded from a camera scan). Returns null if OFF has no record
 * for that code.
 */
async function lookupBarcode(barcode) {
  const code = String(barcode).trim();
  if (!code) return null;
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(
    code
  )}.json?fields=code,product_name,brands,nutriments,serving_size,quantity`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(friendlyOffError(res.status, text));
  }
  const data = await res.json();
  if (data.status !== 1 || !data.product || !data.product.product_name) return null;
  return normalizeOffProduct({ ...data.product, code: data.product.code || code });
}

/**
 * Search local catalog first (custom entries + seeded Indian dishes, both
 * already fast/offline). For the remote lookup: if a Gemini API key is
 * configured, try Gemini first (search-grounded, so it's citing live
 * results rather than guessing from training data) — it's not tied to Open
 * Food Facts' product catalog, so it can answer for home-style dishes and
 * niche/regional items OFF doesn't carry. If Gemini has no key configured,
 * or every model tier in its cascade fails (daily quota, outage, etc.),
 * fall back to Open Food Facts. Gemini results are tagged source:'gemini'
 * so the UI can label them as AI-estimated rather than sourced product data.
 */
async function searchFood(query, { geminiApiKey } = {}) {
  let geminiError = null;
  if (geminiApiKey && geminiApiKey.trim()) {
    try {
      const results = await searchFoodViaGemini(query, geminiApiKey);
      if (results.length > 0) return { results, warnings: [] };
      // Gemini succeeded but found nothing for this query — fall through to
      // Open Food Facts silently, same as before; this isn't a failure worth
      // surfacing.
    } catch (err) {
      // Fall through to Open Food Facts below, but remember why Gemini
      // didn't come through so the user isn't left guessing whether the AI
      // search is working at all.
      geminiError = err.message;
    }
  }
  try {
    const results = await searchOpenFoodFacts(query);
    const warnings = geminiError ? [`AI search unavailable (${geminiError}) — showing Open Food Facts results instead`] : [];
    return { results, warnings };
  } catch (err) {
    const warnings = geminiError ? [geminiError, err.message] : [err.message];
    return { results: [], warnings };
  }
}

module.exports = { searchFood, searchOpenFoodFacts, lookupBarcode };
