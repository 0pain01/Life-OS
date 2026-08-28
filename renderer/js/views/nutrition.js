const NutritionView = (() => {
  let selectedFood = null; // normalized food record (has id OR needs upsert from remote)
  let editingLogEntry = null; // the food_logs row being edited, or null when logging a new entry
  let currentLogs = []; // the currently-rendered day's food_logs rows, cached for the Edit button

  // Photo-based product lookup. Rather than a continuous live-scanning
  // camera loop (which stayed blurry even with zoom — CSS/software zoom on
  // a video stream magnifies the existing blur, it can't add sharpness),
  // this captures ONE deliberate photo — from the camera or an existing
  // file — and reads it with local OCR. The user gets to frame, focus, and
  // confirm the shot instead of fighting a jittery auto-decode loop.
  let captureStream = null; // raw MediaStream, while the single-shot camera capture is open
  let captureVideoEl = null;
  let pendingCaptureHandler = null; // (blob) => Promise<void>, set by whichever button opened the capture UI

  function currentDate() {
    return document.getElementById('nutrition-date').value || todayStr();
  }

  function macroPreviewFor(food, quantity, servingSize) {
    const grams = (quantity || 0) * (servingSize || 0);
    const factor = grams / 100;
    return {
      calories: round1(food.calories_per_100 * factor),
      protein: round1(food.protein_per_100 * factor),
      fat: round1(food.fat_per_100 * factor),
      carbs: round1(food.carbs_per_100 * factor),
    };
  }

  const SOURCE_LABELS = { seed_in: 'Indian dish', custom: 'custom', off: 'Open Food Facts', gemini: 'AI estimate' };

  function foodResultHtml(food, isLocal) {
    const tag = SOURCE_LABELS[food.source] || (isLocal ? 'saved' : food.source);
    return `
      <div class="food-result-item" data-source="${food.source}" data-ext-id="${escapeHtml(food.external_id || '')}" data-local-id="${isLocal ? food.id : ''}">
        <div>
          <div class="food-result-name">${escapeHtml(food.name)}</div>
          <div class="food-result-meta">${escapeHtml(food.brand || '')} ${food.brand ? '·' : ''} ${Math.round(food.calories_per_100)} kcal/100${food.serving_unit || 'g'}</div>
        </div>
        <span class="food-source-tag">${tag}</span>
      </div>`;
  }

  async function doSearch() {
    const query = document.getElementById('food-search-input').value.trim();
    const status = document.getElementById('food-search-status');
    const results = document.getElementById('food-search-results');
    if (!query) return;
    status.textContent = 'Searching…';
    results.innerHTML = '';
    document.getElementById('food-log-form').classList.add('hidden');

    try {
      const res = await window.api.foods.search(query);
      const items = [
        ...res.local.map((f) => ({ f, isLocal: true })),
        ...res.remote.map((f) => ({ f, isLocal: false })),
      ];
      if (items.length === 0) {
        status.textContent = 'No results. Try a different term, or add a custom food below.';
      } else {
        status.textContent = res.warnings && res.warnings.length ? `Some sources unavailable: ${res.warnings.join(' | ')}` : '';
      }
      results.innerHTML = items.map(({ f, isLocal }) => foodResultHtml(f, isLocal)).join('');
      results._items = items;
    } catch (err) {
      status.textContent = `Search failed: ${err.message}`;
    }
  }

  // Opens the shared single-shot camera capture UI. `handler` receives the
  // captured frame as a Blob once the user clicks Capture.
  async function openCameraCapture(handler) {
    pendingCaptureHandler = handler;
    document.getElementById('photo-capture-wrap').classList.remove('hidden');
    try {
      captureStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.setAttribute('muted', 'true');
      video.playsInline = true;
      const container = document.getElementById('photo-capture-reader');
      container.innerHTML = '';
      container.appendChild(video);
      video.srcObject = captureStream;
      await video.play();
      captureVideoEl = video;
    } catch (err) {
      showToast(`Camera unavailable: ${err.message}`, true);
      closeCameraCapture();
    }
  }

  function closeCameraCapture() {
    document.getElementById('photo-capture-wrap').classList.add('hidden');
    if (captureStream) {
      captureStream.getTracks().forEach((t) => t.stop());
      captureStream = null;
    }
    captureVideoEl = null;
    document.getElementById('photo-capture-reader').innerHTML = '';
  }

  async function captureShot() {
    if (!captureVideoEl) return;
    const canvas = document.createElement('canvas');
    canvas.width = captureVideoEl.videoWidth;
    canvas.height = captureVideoEl.videoHeight;
    canvas.getContext('2d').drawImage(captureVideoEl, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const handler = pendingCaptureHandler;
    closeCameraCapture();
    if (handler && blob) await handler(blob);
  }

  // OCRs a package photo, tries any barcode-looking digit run against Open
  // Food Facts first (most precise match), then falls back to a plain text
  // search seeded with the best-guessed product/brand name from the photo.
  async function handleSearchPhoto(blobOrFile) {
    const status = document.getElementById('food-search-status');
    status.textContent = 'Reading photo…';
    try {
      const text = await runOcr(blobOrFile);
      const barcode = extractBarcodeDigits(text);
      const guess = bestSearchGuessFromText(text);
      if (guess) document.getElementById('food-search-input').value = guess;

      if (barcode) {
        status.textContent = `Found a number that looks like a barcode (${barcode}) — looking it up…`;
        const food = await window.api.foods.lookupBarcode(barcode);
        if (food) {
          selectFoodForLogging(food);
          status.textContent = '';
          return;
        }
      }
      if (guess) {
        await doSearch();
      } else {
        status.textContent = "Couldn't read any text from that photo clearly — try typing the name instead.";
      }
    } catch (err) {
      status.textContent = `Couldn't read the photo: ${err.message}`;
    }
  }

  async function lookupAndSelectBarcode(code) {
    const status = document.getElementById('food-search-status');
    status.textContent = `Looking up barcode ${code}…`;
    try {
      const food = await window.api.foods.lookupBarcode(code);
      if (food) {
        selectFoodForLogging(food);
        status.textContent = '';
      } else {
        status.textContent = `No product found for barcode ${code}. Try a text search, or add it as a custom food below.`;
      }
    } catch (err) {
      status.textContent = `Barcode lookup failed: ${err.message}`;
    }
  }

  async function handleManualBarcodeLookup() {
    const input = document.getElementById('barcode-manual-input');
    const code = input.value.trim();
    if (!code) return;
    document.getElementById('food-search-results').innerHTML = '';
    document.getElementById('food-log-form').classList.add('hidden');
    await lookupAndSelectBarcode(code);
  }

  function selectFoodForLogging(food) {
    editingLogEntry = null;
    selectedFood = food;
    document.getElementById('flf-name').textContent = food.name;
    document.getElementById('flf-unit').textContent = food.serving_unit || 'g';
    document.getElementById('flf-quantity').value = 1;
    document.getElementById('flf-serving-size').value = food.serving_size || 100;
    document.getElementById('food-log-form').classList.remove('hidden');
    updateMacroPreview();
  }

  // Editing an existing log entry doesn't need to re-look-up the food — it
  // scales the entry's OWN already-logged macros proportionally to the new
  // quantity/serving size. This works whether or not the underlying food
  // record still exists (it may have been edited or deleted since), and
  // avoids silently swapping in a possibly-different food's current values.
  function macroPreviewForEdit(entry, quantity, servingSize) {
    const originalGrams = (entry.quantity || 1) * (entry.serving_size || 100);
    const newGrams = (quantity || 0) * (servingSize || 0);
    const factor = originalGrams > 0 ? newGrams / originalGrams : 0;
    return {
      calories: round1(entry.calories * factor),
      protein: round1(entry.protein * factor),
      fat: round1(entry.fat * factor),
      carbs: round1(entry.carbs * factor),
    };
  }

  function openEditLogForm(entry) {
    selectedFood = null;
    editingLogEntry = entry;
    document.getElementById('food-modal-title').textContent = 'Edit Log Entry';
    document.getElementById('food-modal-search-section').classList.add('hidden');
    document.getElementById('custom-food-toggle').classList.add('hidden');
    document.getElementById('flf-name').textContent = entry.food_name;
    document.getElementById('flf-unit').textContent = entry.serving_unit || 'g';
    document.getElementById('flf-meal').value = entry.meal;
    document.getElementById('flf-quantity').value = entry.quantity;
    document.getElementById('flf-serving-size').value = entry.serving_size;
    document.getElementById('btn-confirm-food-log').textContent = 'Save changes';
    document.getElementById('food-log-form').classList.remove('hidden');
    document.getElementById('food-modal-backdrop').classList.remove('hidden');
    updateMacroPreview();
  }

  function updateMacroPreview() {
    const quantity = Number(document.getElementById('flf-quantity').value) || 0;
    const servingSize = Number(document.getElementById('flf-serving-size').value) || 0;
    let m;
    if (editingLogEntry) {
      m = macroPreviewForEdit(editingLogEntry, quantity, servingSize);
    } else if (selectedFood) {
      m = macroPreviewFor(selectedFood, quantity, servingSize);
    } else {
      return;
    }
    document.getElementById('flf-macro-preview').innerHTML = `
      <span><strong>${m.calories}</strong> kcal</span>
      <span><strong>${m.protein}</strong>g protein</span>
      <span><strong>${m.fat}</strong>g fat</span>
      <span><strong>${m.carbs}</strong>g carbs</span>`;
  }

  async function confirmLog() {
    const quantity = Number(document.getElementById('flf-quantity').value) || 0;
    const servingSize = Number(document.getElementById('flf-serving-size').value) || 0;

    if (editingLogEntry) {
      const m = macroPreviewForEdit(editingLogEntry, quantity, servingSize);
      await window.api.foodLogs.update(editingLogEntry.id, {
        meal: document.getElementById('flf-meal').value,
        quantity,
        serving_size: servingSize,
        calories: m.calories,
        protein: m.protein,
        fat: m.fat,
        carbs: m.carbs,
      });
      closeFoodModal();
      await render();
      if (typeof DashboardView !== 'undefined') DashboardView.render();
      showToast('Log entry updated.');
      return;
    }

    if (!selectedFood) return;
    let food = selectedFood;
    if (!food.id) {
      // Remote result not yet cached locally — persist it so future logs reuse it.
      food = await window.api.foods.upsertFromRemote(food);
    }
    const effectiveServingSize = servingSize || food.serving_size;
    const m = macroPreviewFor(food, quantity, effectiveServingSize);

    await window.api.foodLogs.log({
      food_id: food.id,
      date: currentDate(),
      meal: document.getElementById('flf-meal').value,
      food_name: food.name,
      quantity,
      serving_size: effectiveServingSize,
      serving_unit: food.serving_unit || 'g',
      calories: m.calories,
      protein: m.protein,
      fat: m.fat,
      carbs: m.carbs,
    });

    closeFoodModal();
    await render();
    if (typeof DashboardView !== 'undefined') DashboardView.render();
    showToast('Logged.');
  }

  // OCRs a nutrition-facts-panel photo and pre-fills whatever values it can
  // confidently parse out. Best-effort — always reviewed by the user before
  // saving, never trusted blindly.
  async function handleCustomFoodPhoto(blobOrFile) {
    const status = document.getElementById('cf-ocr-status');
    status.textContent = 'Reading nutrition label…';
    try {
      const text = await runOcr(blobOrFile);
      const parsed = parseNutritionLabel(text);
      const fieldMap = {
        calories: 'cf-calories',
        protein: 'cf-protein',
        fat: 'cf-fat',
        carbs: 'cf-carbs',
        saturatedFat: 'cf-satfat',
        sugar: 'cf-sugar',
        fiber: 'cf-fiber',
        sodium: 'cf-sodium',
      };
      let foundCount = 0;
      for (const [key, elId] of Object.entries(fieldMap)) {
        if (parsed[key] != null) {
          document.getElementById(elId).value = parsed[key];
          foundCount += 1;
        }
      }
      status.textContent =
        foundCount > 0
          ? `Filled in ${foundCount} value${foundCount > 1 ? 's' : ''} from the photo — please double-check before saving.`
          : "Couldn't confidently read nutrition values from that photo — you can enter them manually.";
    } catch (err) {
      status.textContent = `Couldn't read the photo: ${err.message}`;
    }
  }

  async function addCustomFood() {
    const name = document.getElementById('cf-name').value.trim();
    if (!name) {
      showToast('Custom food needs a name.', true);
      return;
    }
    const optional = (id) => {
      const v = document.getElementById(id).value;
      return v === '' ? null : Number(v);
    };
    const food = await window.api.foods.createCustom({
      name,
      brand: document.getElementById('cf-brand').value.trim(),
      serving_size: 100,
      serving_unit: 'g',
      calories_per_100: Number(document.getElementById('cf-calories').value) || 0,
      protein_per_100: Number(document.getElementById('cf-protein').value) || 0,
      fat_per_100: Number(document.getElementById('cf-fat').value) || 0,
      carbs_per_100: Number(document.getElementById('cf-carbs').value) || 0,
      saturated_fat_per_100: optional('cf-satfat'),
      sugar_per_100: optional('cf-sugar'),
      fiber_per_100: optional('cf-fiber'),
      sodium_per_100: optional('cf-sodium'),
    });
    showToast('Custom food added.');
    selectFoodForLogging(food);
  }

  function foodLogItemHtml(entry) {
    const mealLabel = entry.meal[0].toUpperCase() + entry.meal.slice(1);
    return `
      <div class="food-log-item" data-id="${entry.id}">
        <div class="food-log-main">
          <div class="food-log-name">${escapeHtml(entry.food_name)}</div>
          <div class="food-log-meta">${mealLabel} · ${entry.quantity}× ${entry.serving_size}${entry.serving_unit}</div>
        </div>
        <div class="food-log-macros">
          ${round1(entry.calories)} kcal<br/>P${round1(entry.protein)} F${round1(entry.fat)} C${round1(entry.carbs)}
        </div>
        <div class="food-log-actions">
          <button class="btn-link" data-action="edit-log">Edit</button>
          <button class="btn-danger" data-action="delete-log">✕</button>
        </div>
      </div>`;
  }

  let trendRange = 'week';
  let trendMetric = 'calories';

  async function render() {
    const dateInput = document.getElementById('nutrition-date');
    if (!dateInput.value) dateInput.value = todayStr();
    const date = dateInput.value;

    const [totals, settings, logs] = await Promise.all([
      window.api.foodLogs.dailyTotals(date),
      window.api.settings.get(),
      window.api.foodLogs.forDate(date),
    ]);

    const targets = {
      calories: Number(settings.daily_calories),
      protein: Number(settings.daily_protein),
      fat: Number(settings.daily_fat),
      carbs: Number(settings.daily_carbs),
    };

    renderMacroDonut(document.getElementById('nutrition-donut'), document.getElementById('nutrition-donut-legend'), totals);
    renderProgressList(document.getElementById('nutrition-progress'), totals, targets);

    currentLogs = logs;
    const logEl = document.getElementById('nutrition-log');
    logEl.innerHTML = logs.length
      ? logs.map(foodLogItemHtml).join('')
      : '<div class="empty-state">No food logged for this day yet.</div>';

    await renderTrend();
  }

  async function renderTrend() {
    const settings = await window.api.settings.get();
    const targets = {
      calories: Number(settings.daily_calories),
      protein: Number(settings.daily_protein),
      fat: Number(settings.daily_fat),
      carbs: Number(settings.daily_carbs),
    };
    document.getElementById('nutrition-trend-metrics').innerHTML = metricTabsHtml(trendMetric);
    const bucketed = await computeTrend(trendRange);
    renderTrendChart(document.getElementById('nutrition-trend-canvas'), bucketed, trendMetric, targets[trendMetric]);
  }

  async function loadGoals() {
    const settings = await window.api.settings.get();
    document.getElementById('goal-calories').value = settings.daily_calories;
    document.getElementById('goal-protein').value = settings.daily_protein;
    document.getElementById('goal-fat').value = settings.daily_fat;
    document.getElementById('goal-carbs').value = settings.daily_carbs;
  }

  async function saveGoals() {
    await window.api.settings.set('daily_calories', document.getElementById('goal-calories').value);
    await window.api.settings.set('daily_protein', document.getElementById('goal-protein').value);
    await window.api.settings.set('daily_fat', document.getElementById('goal-fat').value);
    await window.api.settings.set('daily_carbs', document.getElementById('goal-carbs').value);
    showToast('Goals saved.');
    await render();
    if (typeof DashboardView !== 'undefined') DashboardView.render();
  }

  function openFoodModal() {
    document.getElementById('food-modal-title').textContent = 'Log Food';
    document.getElementById('food-modal-search-section').classList.remove('hidden');
    document.getElementById('custom-food-toggle').classList.remove('hidden');
    document.getElementById('btn-confirm-food-log').textContent = 'Add to log';
    document.getElementById('food-search-input').value = '';
    document.getElementById('barcode-manual-input').value = '';
    document.getElementById('food-search-status').textContent = '';
    document.getElementById('food-search-results').innerHTML = '';
    document.getElementById('food-log-form').classList.add('hidden');
    document.getElementById('cf-ocr-status').textContent = '';
    selectedFood = null;
    editingLogEntry = null;
    document.getElementById('food-modal-backdrop').classList.remove('hidden');
    document.getElementById('food-search-input').focus();
  }

  async function closeFoodModal() {
    closeCameraCapture();
    document.getElementById('food-modal-backdrop').classList.add('hidden');
    selectedFood = null;
    editingLogEntry = null;
  }

  function init() {
    document.getElementById('nutrition-date').value = todayStr();
    document.getElementById('nutrition-date').addEventListener('change', render);
    document.getElementById('btn-log-food').addEventListener('click', openFoodModal);
    document.getElementById('btn-close-food-modal').addEventListener('click', closeFoodModal);
    document.getElementById('btn-cancel-food').addEventListener('click', () => {
      if (editingLogEntry) {
        closeFoodModal();
        return;
      }
      document.getElementById('food-log-form').classList.add('hidden');
      selectedFood = null;
    });
    document.getElementById('food-modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'food-modal-backdrop') closeFoodModal();
    });
    document.getElementById('btn-food-search').addEventListener('click', doSearch);

    document.getElementById('btn-photo-file').addEventListener('click', () => document.getElementById('package-photo-input').click());
    document.getElementById('package-photo-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) handleSearchPhoto(file);
    });
    document.getElementById('btn-photo-camera').addEventListener('click', () => openCameraCapture(handleSearchPhoto));
    document.getElementById('btn-cf-photo-file').addEventListener('click', () => document.getElementById('cf-photo-input').click());
    document.getElementById('cf-photo-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) handleCustomFoodPhoto(file);
    });
    document.getElementById('btn-cf-photo-camera').addEventListener('click', () => openCameraCapture(handleCustomFoodPhoto));
    document.getElementById('btn-capture-shot').addEventListener('click', captureShot);
    document.getElementById('btn-cancel-photo-capture').addEventListener('click', closeCameraCapture);

    document.getElementById('btn-manual-barcode-lookup').addEventListener('click', handleManualBarcodeLookup);
    document.getElementById('barcode-manual-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleManualBarcodeLookup();
      }
    });
    document.getElementById('food-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });
    document.getElementById('food-search-results').addEventListener('click', (e) => {
      const item = e.target.closest('.food-result-item');
      if (!item) return;
      const results = document.getElementById('food-search-results');
      const idx = Array.from(results.children).indexOf(item);
      const { f } = results._items[idx];
      selectFoodForLogging(f);
    });
    document.getElementById('flf-quantity').addEventListener('input', updateMacroPreview);
    document.getElementById('flf-serving-size').addEventListener('input', updateMacroPreview);
    document.getElementById('btn-confirm-food-log').addEventListener('click', confirmLog);
    document.getElementById('btn-add-custom-food').addEventListener('click', addCustomFood);

    document.getElementById('nutrition-log').addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.food-log-item');
      if (!itemEl) return;
      const id = Number(itemEl.dataset.id);
      if (e.target.closest('[data-action="delete-log"]')) {
        await window.api.foodLogs.delete(id);
        await render();
        if (typeof DashboardView !== 'undefined') DashboardView.render();
      } else if (e.target.closest('[data-action="edit-log"]')) {
        const entry = currentLogs.find((l) => l.id === id);
        if (entry) openEditLogForm(entry);
      }
    });

    document.getElementById('nutrition-trend-range').addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      trendRange = btn.dataset.range;
      document.querySelectorAll('#nutrition-trend-range .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderTrend();
    });
    document.getElementById('nutrition-trend-metrics').addEventListener('click', (e) => {
      const btn = e.target.closest('.trend-metric-tab');
      if (!btn) return;
      trendMetric = btn.dataset.metric;
      renderTrend();
    });
    document.getElementById('btn-save-goals').addEventListener('click', saveGoals);
    window.addEventListener('resize', () => {
      if (!document.getElementById('view-nutrition').classList.contains('hidden')) renderTrend();
    });
  }

  return {
    init,
    render: async () => {
      await loadGoals();
      await render();
    },
  };
})();
