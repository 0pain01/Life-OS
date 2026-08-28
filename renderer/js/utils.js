// Shared helpers used across all view modules.

function todayStr() {
  const d = new Date();
  return formatDate(d);
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return formatDate(dt);
}

function niceDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function showToast(message, isError) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.toggle('toast-error', !!isError);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
}

function recurrenceLabel(recurrence, interval) {
  if (!recurrence || recurrence === 'none') return null;
  const n = interval && interval > 1 ? interval : 1;
  const unit = { daily: 'day', monthly: 'month', yearly: 'year' }[recurrence];
  if (!unit) return null;
  return n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`;
}

function addMonthsStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  const daysInMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(d, daysInMonth));
  return formatDate(dt);
}

function isoWeekKey(dateStr) {
  // Monday-start week bucket key (not strict ISO week numbering — just needs
  // to be stable and sortable as a string).
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayIdx = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - dayIdx);
  return formatDate(dt);
}

// range: 'day' | 'week' | 'month' | 'year' — how far back to fetch and at
// what granularity to bucket it for a trend chart.
function trendRangeConfig(range) {
  const end = todayStr();
  if (range === 'day') return { start: addDays(end, -29), end, bucket: 'day' };
  if (range === 'week') return { start: addDays(end, -7 * 11), end, bucket: 'week' };
  if (range === 'month') return { start: addMonthsStr(end, -11), end, bucket: 'month' };
  return { start: addMonthsStr(end, -60), end, bucket: 'year' };
}

// Buckets sparse daily {date, calories, protein, fat, carbs} rows into the
// requested granularity, filling gaps with zero and averaging per-day within
// each bucket (so a weekly/monthly/yearly point stays comparable against a
// daily goal reference line).
function bucketDailyRows(rows, start, end, bucket) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const filled = [];
  let d = start;
  while (d <= end) {
    const r = byDate.get(d);
    filled.push({
      date: d,
      calories: r?.calories || 0,
      protein: r?.protein || 0,
      fat: r?.fat || 0,
      carbs: r?.carbs || 0,
    });
    d = addDays(d, 1);
  }

  if (bucket === 'day') {
    // "Mon" alone repeats ~4x over a 30-day window with no way to tell
    // which Monday — use a short numeric date instead.
    return filled.map((r) => {
      const [, m, d] = r.date.split('-');
      return { key: r.date, label: `${d}/${m}`, ...r };
    });
  }

  const buckets = new Map();
  for (const r of filled) {
    let key, label;
    if (bucket === 'week') {
      key = isoWeekKey(r.date);
      label = key.slice(5);
    } else if (bucket === 'month') {
      key = r.date.slice(0, 7);
      const [y, m] = key.split('-').map(Number);
      label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    } else {
      key = r.date.slice(0, 4);
      label = key;
    }
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, calories: 0, protein: 0, fat: 0, carbs: 0, count: 0 });
    }
    const b = buckets.get(key);
    b.calories += r.calories;
    b.protein += r.protein;
    b.fat += r.fat;
    b.carbs += r.carbs;
    b.count += 1;
  }

  return Array.from(buckets.values())
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => ({
      key: b.key,
      label: b.label,
      calories: b.calories / b.count,
      protein: b.protein / b.count,
      fat: b.fat / b.count,
      carbs: b.carbs / b.count,
    }));
}

async function safeCall(promise, fallbackMsg) {
  try {
    return await promise;
  } catch (err) {
    showToast(fallbackMsg || err.message, true);
    throw err;
  }
}
