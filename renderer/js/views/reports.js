const ReportsView = (() => {
  let range = 'week'; // 'day' | 'week' | 'month' | 'year'
  let metric = 'calories';

  const RANGE_TITLES = {
    day: 'Last 30 days',
    week: 'Last 12 weeks',
    month: 'Last 12 months',
    year: 'Last 5 years',
  };

  // Calendar state — separate from the trend range above, so switching
  // Day/Week/Month/Year up top doesn't disturb whatever month/day the user
  // has navigated to below.
  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let calYear, calMonth; // calMonth is 0-indexed
  let selectedDate;

  function monthRange(year, month) {
    return { start: formatDate(new Date(year, month, 1)), end: formatDate(new Date(year, month + 1, 0)) };
  }

  function calendarLogItemHtml(entry) {
    const mealLabel = entry.meal[0].toUpperCase() + entry.meal.slice(1);
    return `
      <div class="food-log-item">
        <div class="food-log-main">
          <div class="food-log-name">${escapeHtml(entry.food_name)}</div>
          <div class="food-log-meta">${mealLabel} · ${entry.quantity}× ${entry.serving_size}${entry.serving_unit}</div>
        </div>
        <div class="food-log-macros">${round1(entry.calories)} kcal<br/>P${round1(entry.protein)} F${round1(entry.fat)} C${round1(entry.carbs)}</div>
      </div>`;
  }

  async function renderCalendarDetail() {
    const [totals, logs] = await Promise.all([
      window.api.foodLogs.dailyTotals(selectedDate),
      window.api.foodLogs.forDate(selectedDate),
    ]);
    const header = `
      <div class="calendar-day-detail-header">
        <h3>${niceDate(selectedDate)}</h3>
        <div class="calendar-day-detail-totals">${round1(totals.calories)} kcal · P${round1(totals.protein)} F${round1(totals.fat)} C${round1(totals.carbs)}</div>
      </div>`;
    const list = logs.length
      ? `<div class="food-log-list">${logs.map(calendarLogItemHtml).join('')}</div>`
      : '<div class="empty-state">No food logged this day.</div>';
    document.getElementById('report-calendar-detail').innerHTML = header + list;
  }

  async function renderCalendar() {
    document.getElementById('report-calendar-weekdays').innerHTML = WEEKDAY_LABELS.map((d) => `<div>${d}</div>`).join('');
    const monthDate = new Date(calYear, calMonth, 1);
    document.getElementById('cal-month-label').textContent = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const { start, end } = monthRange(calYear, calMonth);
    const rows = await window.api.foodLogs.rangeTotals(start, end);
    const daysWithData = new Set(rows.filter((r) => (r.calories || 0) > 0).map((r) => r.date));

    const firstWeekday = monthDate.getDay(); // 0 = Sunday
    const numDays = new Date(calYear, calMonth + 1, 0).getDate();
    const today = todayStr();

    let cells = '';
    for (let i = 0; i < firstWeekday; i++) cells += '<button class="calendar-day is-empty" tabindex="-1"></button>';
    for (let day = 1; day <= numDays; day++) {
      const dateStr = formatDate(new Date(calYear, calMonth, day));
      const classes = ['calendar-day'];
      if (dateStr === today) classes.push('is-today');
      if (dateStr === selectedDate) classes.push('is-selected');
      if (daysWithData.has(dateStr)) classes.push('has-data');
      cells += `<button class="${classes.join(' ')}" data-date="${dateStr}">${day}</button>`;
    }
    document.getElementById('report-calendar-grid').innerHTML = cells;

    await renderCalendarDetail();
  }

  async function render() {
    document.getElementById('report-title').textContent = RANGE_TITLES[range];
    document.getElementById('report-metrics').innerHTML = metricTabsHtml(metric);

    const settings = await window.api.settings.get();
    const targets = {
      calories: Number(settings.daily_calories),
      protein: Number(settings.daily_protein),
      fat: Number(settings.daily_fat),
      carbs: Number(settings.daily_carbs),
    };

    const bucketed = await computeTrend(range);
    renderTrendChart(document.getElementById('report-canvas'), bucketed, metric, targets[metric]);

    // Averages are computed over days that actually have a log entry
    // (not diluted by untracked days), across the same span as the chart.
    const cfg = trendRangeConfig(range);
    const rawRows = await window.api.foodLogs.rangeTotals(cfg.start, cfg.end);
    const daysWithData = rawRows.length || 1;
    const avg = (key) => round1(rawRows.reduce((sum, r) => sum + (r[key] || 0), 0) / daysWithData);
    const avgTotals = { calories: avg('calories'), protein: avg('protein'), fat: avg('fat'), carbs: avg('carbs') };
    renderProgressList(document.getElementById('report-averages'), avgTotals, targets);

    await renderCalendar();
  }

  function init() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    selectedDate = todayStr();

    document.getElementById('report-range').addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      range = btn.dataset.range;
      document.querySelectorAll('#report-range .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
    document.getElementById('report-metrics').addEventListener('click', (e) => {
      const btn = e.target.closest('.trend-metric-tab');
      if (!btn) return;
      metric = btn.dataset.metric;
      render();
    });
    document.getElementById('cal-prev-month').addEventListener('click', () => {
      calMonth -= 1;
      if (calMonth < 0) { calMonth = 11; calYear -= 1; }
      renderCalendar();
    });
    document.getElementById('cal-next-month').addEventListener('click', () => {
      calMonth += 1;
      if (calMonth > 11) { calMonth = 0; calYear += 1; }
      renderCalendar();
    });
    document.getElementById('cal-today-btn').addEventListener('click', () => {
      const n = new Date();
      calYear = n.getFullYear();
      calMonth = n.getMonth();
      selectedDate = todayStr();
      renderCalendar();
    });
    document.getElementById('report-calendar-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.calendar-day:not(.is-empty)');
      if (!btn || !btn.dataset.date) return;
      selectedDate = btn.dataset.date;
      renderCalendar();
    });
    window.addEventListener('resize', () => {
      if (!document.getElementById('view-reports').classList.contains('hidden')) render();
    });
  }

  return { init, render };
})();
