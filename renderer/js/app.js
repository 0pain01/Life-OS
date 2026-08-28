const App = (() => {
  const views = {
    dashboard: DashboardView,
    tasks: TasksView,
    nutrition: NutritionView,
    reports: ReportsView,
    settings: SettingsView,
  };

  function showView(name) {
    document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
    document.getElementById(`view-${name}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    const view = views[name];
    if (view && view.render) view.render();
  }

  function initNav() {
    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });
  }

  function init() {
    initNav();
    DashboardView.init();
    TasksView.init();
    NutritionView.init();
    ReportsView.init();
    SettingsView.init();
    showView('dashboard');
  }

  return { init, showView };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
