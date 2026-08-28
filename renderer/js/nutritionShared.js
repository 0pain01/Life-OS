// Shared nutrition-visualization helpers used by the Dashboard, Nutrition,
// and Reports views, so a macro's color/label/unit means the same thing
// everywhere and the trend-bucketing logic isn't duplicated three times.

const MACRO_COLORS = {
  calories: '#6c5ce7',
  protein: '#6c5ce7',
  fat: '#f5883d',
  carbs: '#22c55e',
};
const MACRO_LABEL = { calories: 'Calories', protein: 'Protein', fat: 'Fat', carbs: 'Carbs' };
const MACRO_UNIT = { calories: 'kcal', protein: 'g', fat: 'g', carbs: 'g' };
const MACRO_KEYS = ['calories', 'protein', 'fat', 'carbs'];

// Splits today's totals into protein/fat/carb *calorie* contribution (1g
// protein/carb = 4 kcal, 1g fat = 9 kcal) — the nutritionally correct basis
// for a "where did today's calories come from" pie, while still labeling
// each slice with the more useful gram amount.
function macroCalorieSegments(totals) {
  return [
    { key: 'protein', label: 'Protein', grams: totals.protein || 0, value: (totals.protein || 0) * 4, color: MACRO_COLORS.protein },
    { key: 'fat', label: 'Fat', grams: totals.fat || 0, value: (totals.fat || 0) * 9, color: MACRO_COLORS.fat },
    { key: 'carbs', label: 'Carbs', grams: totals.carbs || 0, value: (totals.carbs || 0) * 4, color: MACRO_COLORS.carbs },
  ];
}

function renderMacroDonut(canvasEl, legendEl, totals) {
  const segments = macroCalorieSegments(totals);
  drawDonutChart(canvasEl, {
    segments,
    centerLabel: `${Math.round(totals.calories || 0)}`,
    centerSubLabel: 'kcal today',
  });
  if (legendEl) {
    legendEl.innerHTML = segments
      .map(
        (s) => `
      <div class="donut-legend-row">
        <span class="dot" style="background:${s.color}"></span>
        <span class="legend-name">${s.label}</span>
        <span class="legend-val">${round1(s.grams)}g</span>
      </div>`
      )
      .join('');
  }
}

function renderProgressList(container, totals, targets) {
  container.innerHTML = MACRO_KEYS.map((key) => {
    const value = round1(totals[key] || 0);
    const target = Number(targets[key]) || 0;
    const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
    const over = target > 0 && value > target;
    const color = MACRO_COLORS[key];
    return `
      <div class="progress-row">
        <div class="progress-label">
          <span><span class="dot" style="background:${color}"></span>${MACRO_LABEL[key]}</span>
          <span>${value} / ${target} ${MACRO_UNIT[key]}</span>
        </div>
        <div class="progress-track"><div class="progress-fill ${over ? 'over' : ''}" style="width:${pct}%;${over ? '' : `background:${color}`}"></div></div>
      </div>`;
  }).join('');
}

// Fetches and buckets food-log totals for a trend range. range: 'day' |
// 'week' | 'month' | 'year'. Returns bucketed rows with .label and the four
// macro keys, averaged per day within each bucket (see bucketDailyRows).
async function computeTrend(range) {
  const cfg = trendRangeConfig(range);
  const rows = await window.api.foodLogs.rangeTotals(cfg.start, cfg.end);
  return bucketDailyRows(rows, cfg.start, cfg.end, cfg.bucket);
}

function renderTrendChart(canvasEl, bucketed, metric, targetValue) {
  const labels = bucketed.map((b) => b.label);
  const values = bucketed.map((b) => round1(b[metric] || 0));
  drawLineChart(canvasEl, {
    labels,
    series: [{ values, color: MACRO_COLORS[metric] }],
    target: targetValue || 0,
  });
}

function metricTabsHtml(activeMetric) {
  return MACRO_KEYS.map((key) => {
    const active = key === activeMetric;
    return `
      <button class="trend-metric-tab ${active ? 'active' : ''}" data-metric="${key}"
        style="${active ? `background:${MACRO_COLORS[key]};border-color:${MACRO_COLORS[key]}` : ''}">
        <span class="dot" style="background:${active ? '#fff' : MACRO_COLORS[key]}"></span>${MACRO_LABEL[key]}
      </button>`;
  }).join('');
}
