const SettingsView = (() => {
  let currentCustomFoods = []; // cached list from the last renderCustomFoods(), for the Edit button lookup

  async function loadInto() {
    const settings = await window.api.settings.get();
    document.getElementById('set-reminders-enabled').checked = settings.reminders_enabled === '1';
    document.getElementById('set-default-reminder').value = settings.default_reminder_minutes;
    document.getElementById('set-gemini-key').value = settings.gemini_api_key || '';
    await renderProjects();
    await renderCustomFoods();
  }

  function projectRowHtml(p) {
    return `
      <div class="project-row" data-id="${p.id}">
        <span class="project-swatch" style="background:${p.color}"></span>
        <span class="project-name">${escapeHtml(p.name)}</span>
        <button class="btn-danger" data-action="delete-project">Delete</button>
      </div>`;
  }

  async function renderProjects() {
    const projects = await window.api.projects.list();
    document.getElementById('settings-projects').innerHTML = projects.map(projectRowHtml).join('');
  }

  async function saveAll() {
    const entries = {
      reminders_enabled: document.getElementById('set-reminders-enabled').checked ? '1' : '0',
      default_reminder_minutes: document.getElementById('set-default-reminder').value,
      gemini_api_key: document.getElementById('set-gemini-key').value.trim(),
    };
    for (const [key, value] of Object.entries(entries)) {
      await window.api.settings.set(key, value);
    }
    showToast('Settings saved.');
  }

  async function addProject() {
    const name = document.getElementById('new-project-name').value.trim();
    if (!name) return;
    const color = document.getElementById('new-project-color').value;
    await window.api.projects.create(name, color);
    document.getElementById('new-project-name').value = '';
    await renderProjects();
    if (typeof TasksView !== 'undefined') TasksView.render();
  }

  function customFoodRowHtml(f) {
    return `
      <div class="project-row" data-id="${f.id}">
        <span class="project-name">${escapeHtml(f.name)}${f.brand ? ` <span class="hint">· ${escapeHtml(f.brand)}</span>` : ''}</span>
        <span class="hint">${round1(f.calories_per_100)} kcal/100g</span>
        <button class="btn-link" data-action="edit-custom-food">Edit</button>
        <button class="btn-danger" data-action="delete-custom-food">Delete</button>
      </div>`;
  }

  async function renderCustomFoods() {
    const foods = await window.api.foods.listCustom();
    currentCustomFoods = foods;
    const container = document.getElementById('settings-custom-foods');
    container.innerHTML = foods.length
      ? foods.map(customFoodRowHtml).join('')
      : '<div class="empty-state">No custom foods yet.</div>';
  }

  function openCustomFoodEditModal(food) {
    document.getElementById('ecf-name').value = food.name;
    document.getElementById('ecf-brand').value = food.brand || '';
    document.getElementById('ecf-calories').value = food.calories_per_100;
    document.getElementById('ecf-protein').value = food.protein_per_100;
    document.getElementById('ecf-fat').value = food.fat_per_100;
    document.getElementById('ecf-carbs').value = food.carbs_per_100;
    document.getElementById('ecf-satfat').value = food.saturated_fat_per_100 ?? '';
    document.getElementById('ecf-sugar').value = food.sugar_per_100 ?? '';
    document.getElementById('ecf-fiber').value = food.fiber_per_100 ?? '';
    document.getElementById('ecf-sodium').value = food.sodium_per_100 ?? '';
    document.getElementById('edit-custom-food-modal-backdrop').dataset.editingId = food.id;
    document.getElementById('edit-custom-food-modal-backdrop').classList.remove('hidden');
  }

  function closeCustomFoodEditModal() {
    document.getElementById('edit-custom-food-modal-backdrop').classList.add('hidden');
  }

  async function saveCustomFoodEdit() {
    const backdrop = document.getElementById('edit-custom-food-modal-backdrop');
    const id = Number(backdrop.dataset.editingId);
    const name = document.getElementById('ecf-name').value.trim();
    if (!name) {
      showToast('Name is required.', true);
      return;
    }
    const optional = (elId) => {
      const v = document.getElementById(elId).value;
      return v === '' ? null : Number(v);
    };
    await window.api.foods.update(id, {
      name,
      brand: document.getElementById('ecf-brand').value.trim(),
      calories_per_100: Number(document.getElementById('ecf-calories').value) || 0,
      protein_per_100: Number(document.getElementById('ecf-protein').value) || 0,
      fat_per_100: Number(document.getElementById('ecf-fat').value) || 0,
      carbs_per_100: Number(document.getElementById('ecf-carbs').value) || 0,
      saturated_fat_per_100: optional('ecf-satfat'),
      sugar_per_100: optional('ecf-sugar'),
      fiber_per_100: optional('ecf-fiber'),
      sodium_per_100: optional('ecf-sodium'),
    });
    closeCustomFoodEditModal();
    await renderCustomFoods();
    showToast('Custom food updated.');
  }

  function init() {
    document.getElementById('btn-save-settings').addEventListener('click', saveAll);
    document.getElementById('btn-add-project').addEventListener('click', addProject);
    document.getElementById('settings-projects').addEventListener('click', async (e) => {
      if (!e.target.closest('[data-action="delete-project"]')) return;
      const row = e.target.closest('.project-row');
      const id = Number(row.dataset.id);
      if (confirm('Delete this project? Tasks stay, but lose their project link.')) {
        await window.api.projects.delete(id);
        await renderProjects();
        if (typeof TasksView !== 'undefined') TasksView.render();
      }
    });

    document.getElementById('settings-custom-foods').addEventListener('click', async (e) => {
      const row = e.target.closest('.project-row');
      if (!row) return;
      const id = Number(row.dataset.id);
      if (e.target.closest('[data-action="edit-custom-food"]')) {
        const food = currentCustomFoods.find((f) => f.id === id);
        if (food) openCustomFoodEditModal(food);
      } else if (e.target.closest('[data-action="delete-custom-food"]')) {
        if (confirm('Delete this custom food? Any existing food log entries keep their logged values.')) {
          await window.api.foods.delete(id);
          await renderCustomFoods();
        }
      }
    });
    document.getElementById('btn-cancel-custom-food-edit').addEventListener('click', closeCustomFoodEditModal);
    document.getElementById('btn-save-custom-food-edit').addEventListener('click', saveCustomFoodEdit);
    document.getElementById('edit-custom-food-modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'edit-custom-food-modal-backdrop') closeCustomFoodEditModal();
    });
  }

  return { init, render: loadInto };
})();
