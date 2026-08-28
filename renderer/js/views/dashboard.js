const DashboardView = (() => {
  const ICON_FLAME =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>';
  const ICON_CLIPBOARD =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-3"/><path d="M9 14l2 2 4-4"/></svg>';
  const ICON_CHECK_CIRCLE =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9"/></svg>';
  const ICON_ALERT =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  const ICON_CLIPBOARD_DOWN =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-3"/><path d="M12 11v6"/><path d="M9.5 14.5L12 17l2.5-2.5"/></svg>';

  function miniTaskHtml(task) {
    return `
      <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-action="toggle">${task.completed ? '✓' : ''}</div>
        <div class="task-main">
          <div class="task-title ${task.completed ? 'strike' : ''}">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${task.due_time ? `<span>${task.due_time}</span>` : ''}
            ${task.project_name ? `<span class="chip" style="background:${task.project_color}22; color:${task.project_color}">${escapeHtml(task.project_name)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }

  function miniOverdueHtml(task) {
    return `
      <div class="task-item overdue" data-id="${task.id}">
        <div class="task-checkbox" data-action="toggle"></div>
        <div class="task-main">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta"><span class="chip chip-overdue">Was due ${niceDate(task.due_date)}</span></div>
        </div>
      </div>`;
  }

  async function handleToggle(container) {
    container.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.task-item');
      if (!itemEl || !e.target.closest('[data-action="toggle"]')) return;
      const id = Number(itemEl.dataset.id);
      const task = await window.api.tasks.get(id);
      if (task.completed) await window.api.tasks.uncomplete(id);
      else await window.api.tasks.complete(id);
      await render();
      if (typeof TasksView !== 'undefined') TasksView.render();
    });
  }

  async function render() {
    const heading = document.getElementById('dashboard-date-heading');
    const sub = document.getElementById('dashboard-date-sub');
    const now = new Date();
    heading.textContent = now.toLocaleDateString(undefined, { weekday: 'long' });
    sub.textContent = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

    const today = todayStr();
    const [dueToday, overdue, totals, settings] = await Promise.all([
      window.api.tasks.dueOn(today),
      window.api.tasks.overdue(),
      window.api.foodLogs.dailyTotals(today),
      window.api.settings.get(),
    ]);

    const dueEl = document.getElementById('dashboard-tasks');
    dueEl.innerHTML = dueToday.length
      ? dueToday.map(miniTaskHtml).join('')
      : '<div class="empty-state">Nothing due today. 🎉</div>';

    const overdueEl = document.getElementById('dashboard-overdue');
    overdueEl.innerHTML = overdue.length
      ? overdue.map(miniOverdueHtml).join('')
      : `<div class="empty-state">${ICON_CLIPBOARD_DOWN}Nothing overdue.</div>`;

    const targets = {
      calories: Number(settings.daily_calories),
      protein: Number(settings.daily_protein),
      fat: Number(settings.daily_fat),
      carbs: Number(settings.daily_carbs),
    };

    const pendingDueToday = dueToday.filter((t) => !t.completed).length;
    const caloriesLeft = Math.round((targets.calories || 0) - (totals.calories || 0));
    const overdueColor = overdue.length ? 'var(--danger)' : 'var(--macro-carbs)';
    const overdueSoft = overdue.length ? 'var(--danger-soft)' : 'var(--macro-carbs-soft)';
    document.getElementById('dashboard-hero-stats').innerHTML = `
      <div class="hero-stat">
        <div class="stat-icon" style="background:var(--accent-soft); color:var(--accent);">${ICON_FLAME}</div>
        <div>
          <div class="stat-number" style="color:${caloriesLeft < 0 ? 'var(--warn)' : 'var(--accent)'}">${caloriesLeft < 0 ? `+${Math.abs(caloriesLeft)}` : caloriesLeft}</div>
          <div class="stat-label">${caloriesLeft < 0 ? 'kcal over' : 'kcal left'}</div>
        </div>
      </div>
      <div class="hero-stat">
        <div class="stat-icon" style="background:var(--warn-soft); color:var(--warn);">${ICON_CLIPBOARD}</div>
        <div>
          <div class="stat-number" style="color:var(--warn)">${pendingDueToday}</div>
          <div class="stat-label">Due today</div>
        </div>
      </div>
      <div class="hero-stat">
        <div class="stat-icon" style="background:${overdueSoft}; color:${overdueColor};">${overdue.length ? ICON_ALERT : ICON_CHECK_CIRCLE}</div>
        <div>
          <div class="stat-number" style="color:${overdueColor}">${overdue.length}</div>
          <div class="stat-label">Overdue</div>
        </div>
      </div>`;

    renderMacroDonut(document.getElementById('dashboard-donut'), document.getElementById('dashboard-donut-legend'), totals);
  }

  function init() {
    handleToggle(document.getElementById('dashboard-tasks'));
    handleToggle(document.getElementById('dashboard-overdue'));
    document.querySelectorAll('[data-view-link]').forEach((btn) => {
      btn.addEventListener('click', () => App.showView(btn.dataset.viewLink));
    });
    // The donut/trend canvases size themselves to their container at draw
    // time, then keep that pixel width until redrawn — without this, they
    // go stale (and can overflow their panel) whenever the window is
    // resized while this view is showing, since nothing else triggers a
    // redraw. Reports/Nutrition already do this same thing.
    window.addEventListener('resize', () => {
      if (!document.getElementById('view-dashboard').classList.contains('hidden')) render();
    });
  }

  return { init, render };
})();
