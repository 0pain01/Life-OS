// Local, fully offline OCR via a vendored Tesseract.js build — no cloud
// vision API, no network calls. Used for two distinct things:
//   1. Reading a food package photo to search for the product (replaces the
//      old live-camera barcode scanner, which stayed blurry even after
//      adding zoom — a single deliberate photo the user frames and confirms
//      is fundamentally more reliable than continuous auto-scanning).
//   2. Reading a nutrition-facts-panel photo to auto-fill a custom food's
//      optional nutrition values.
// The worker is created once and reused — spinning one up costs real time
// (loading the WASM core + language data), so paying that cost per photo
// would make the feature feel sluggish.

let ocrWorkerPromise = null;

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker('eng', 1, {
      workerPath: 'js/vendor/tesseract/worker.min.js',
      workerBlobURL: false,
      // Pointed at one specific core file rather than a directory: we know
      // exactly which Chromium ships with this app (via Electron), so we
      // don't need Tesseract's runtime SIMD-capability detection — and
      // skipping it means we don't have to vendor every core variant it
      // might otherwise pick.
      corePath: 'js/vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
      langPath: 'js/vendor/tesseract/lang',
      logger: () => {},
    });
  }
  return ocrWorkerPromise;
}

async function runOcr(imageSource) {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(imageSource);
  return data.text || '';
}

// Looks for a run of digits matching common barcode lengths (EAN-8, UPC-A,
// EAN-13, GTIN-14), tolerating spaces OCR sometimes inserts mid-number.
function extractBarcodeDigits(text) {
  const matches = text.match(/\d[\d \t]{6,18}\d/g) || [];
  for (const m of matches) {
    const digits = m.replace(/[^\d]/g, '');
    if ([8, 12, 13, 14].includes(digits.length)) return digits;
  }
  return null;
}

// Best-effort guess at a search query from a package-front photo: the
// longest line that looks like text (not a stray number/symbol run) is
// usually the product or brand name.
function bestSearchGuessFromText(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const candidates = lines.filter((l) => /[a-zA-Z]{3,}/.test(l) && !/^\d+$/.test(l));
  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0].slice(0, 60);
}

function firstNumberMatching(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

// Best-effort extraction of a nutrition-facts panel's numbers. Deliberately
// approximate — OCR on printed labels (small fonts, glossy packaging,
// varied layouts) is never perfect, so this is meant to pre-fill a form the
// user reviews, not to be trusted blindly.
function parseNutritionLabel(text) {
  const t = text.replace(/\r/g, '');
  return {
    calories: firstNumberMatching(t, [/energy[^\d]{0,15}(\d+(?:\.\d+)?)\s*k?cal/i, /calories[^\d]{0,10}(\d+(?:\.\d+)?)/i]),
    protein: firstNumberMatching(t, [/protein[^\d]{0,10}(\d+(?:\.\d+)?)\s*g/i]),
    fat: firstNumberMatching(t, [/total\s*fat[^\d]{0,10}(\d+(?:\.\d+)?)\s*g/i, /\bfat[^\d]{0,10}(\d+(?:\.\d+)?)\s*g/i]),
    carbs: firstNumberMatching(t, [/(?:total\s*)?carbohydrate[s]?[^\d]{0,10}(\d+(?:\.\d+)?)\s*g/i]),
    saturatedFat: firstNumberMatching(t, [/sat(?:urated)?\.?\s*fat[^\d]{0,10}(\d+(?:\.\d+)?)\s*g/i]),
    sugar: firstNumberMatching(t, [/sugars?[^\d]{0,10}(\d+(?:\.\d+)?)\s*g/i]),
    fiber: firstNumberMatching(t, [/(?:dietary\s*)?fib(?:er|re)[^\d]{0,10}(\d+(?:\.\d+)?)\s*g/i]),
    sodium: firstNumberMatching(t, [/sodium[^\d]{0,10}(\d+(?:\.\d+)?)\s*mg/i]),
  };
}
