const TasksView = (() => {
  let editingTaskId = null;
  let projectsCache = [];

  async function loadProjects() {
    projectsCache = await window.api.projects.list();
    return projectsCache;
  }

  function populateProjectSelect(select, includeAll) {
    select.innerHTML = '';
    if (includeAll) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'All projects';
      select.appendChild(opt);
    }
    for (const p of projectsCache) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    }
  }

  function taskItemHtml(task) {
    const today = todayStr();
    const isOverdue = task.due_date && task.due_date < today && !task.completed;
    const recur = recurrenceLabel(task.recurrence, task.recurrence_interval);
    const priorityChip =
      task.priority === 1
        ? '<span class="chip chip-priority-high">High</span>'
        : task.priority === -1
        ? '<span class="chip chip-priority-low">Low</span>'
        : '';

    const dueBits = [];
    if (task.due_date) {
      dueBits.push(`<span>${isOverdue ? 'Was due' : 'Due'} ${niceDate(task.due_date)}${task.due_time ? ' · ' + task.due_time : ''}</span>`);
    }
    if (task.project_name) {
      dueBits.push(`<span class="chip" style="background:${task.project_color}22; color:${task.project_color}">${escapeHtml(task.project_name)}</span>`);
    }
    if (recur) dueBits.push(`<span class="chip chip-recur">↻ ${recur}</span>`);
    if (isOverdue) dueBits.push('<span class="chip chip-overdue">Overdue</span>');
    if (priorityChip) dueBits.push(priorityChip);

    return `
      <div class="task-item ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" data-id="${task.id}">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-action="toggle">${task.completed ? '✓' : ''}</div>
        <div class="task-main">
          <div class="task-title ${task.completed ? 'strike' : ''}">${escapeHtml(task.title)}</div>
          <div class="task-meta">${dueBits.join('')}</div>
          ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ''}
        </div>
        <div class="task-actions">
          <button class="btn-link" data-action="edit">Edit</button>
          <button class="btn-danger" data-action="delete">Delete</button>
        </div>
      </div>`;
  }

  function attachListHandlers(container) {
    container.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.task-item');
      if (!itemEl) return;
      const id = Number(itemEl.dataset.id);
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'toggle') {
        try {
          const task = await window.api.tasks.get(id);
          if (task.completed) await window.api.tasks.uncomplete(id);
          else await window.api.tasks.complete(id);
          await render();
          if (typeof DashboardView !== 'undefined') DashboardView.render();
        } catch (err) {
          showToast(err.message, true);
        }
      } else if (action === 'edit') {
        openModal(id);
      } else if (action === 'delete') {
        if (confirm('Delete this task?')) {
          await window.api.tasks.delete(id);
          await render();
          if (typeof DashboardView !== 'undefined') DashboardView.render();
        }
      }
    });
  }

  async function render() {
    await loadProjects();
    const projectFilter = document.getElementById('task-filter-project');
    const currentFilterVal = projectFilter.value;
    populateProjectSelect(projectFilter, true);
    if (currentFilterVal) projectFilter.value = currentFilterVal;

    const hideCompleted = document.getElementById('task-filter-hide-completed').checked;
    let tasks = await window.api.tasks.list({ includeCompleted: !hideCompleted });

    if (projectFilter.value) {
      tasks = tasks.filter((t) => String(t.project_id) === projectFilter.value);
    }

    const listEl = document.getElementById('task-list');
    if (tasks.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No tasks here. Create one to get started.</div>';
      return;
    }
    listEl.innerHTML = tasks.map(taskItemHtml).join('');
  }

  function openModal(taskId) {
    editingTaskId = taskId || null;
    const backdrop = document.getElementById('task-modal-backdrop');
    const title = document.getElementById('task-modal-title');
    const form = document.getElementById('task-form');
    form.reset();
    populateProjectSelect(document.getElementById('tf-project'), false);
    document.getElementById('tf-reminder-minutes-wrap').classList.add('hidden');
    document.getElementById('tf-reminder-toggle').checked = false;
    toggleNewProjectRow(false);

    if (taskId) {
      title.textContent = 'Edit Task';
      window.api.tasks.get(taskId).then((task) => {
        document.getElementById('tf-title').value = task.title;
        document.getElementById('tf-notes').value = task.notes || '';
        if (task.project_id) document.getElementById('tf-project').value = task.project_id;
        document.getElementById('tf-priority').value = task.priority;
        document.getElementById('tf-due-date').value = task.due_date || '';
        document.getElementById('tf-due-time').value = task.due_time || '';
        document.getElementById('tf-recurrence').value = task.recurrence || 'none';
        document.getElementById('tf-interval').value = task.recurrence_interval || 1;
        const hasReminder = task.reminder_minutes_before != null;
        document.getElementById('tf-reminder-toggle').checked = hasReminder;
        document.getElementById('tf-reminder-minutes-wrap').classList.toggle('hidden', !hasReminder);
        if (hasReminder) document.getElementById('tf-reminder-minutes').value = task.reminder_minutes_before;
      });
    } else {
      title.textContent = 'New Task';
      document.getElementById('tf-due-date').value = todayStr();
    }
    backdrop.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('task-modal-backdrop').classList.add('hidden');
    editingTaskId = null;
  }

  function toggleNewProjectRow(show) {
    document.getElementById('tf-new-project-row').classList.toggle('hidden', !show);
    if (show) {
      document.getElementById('tf-new-project-name').value = '';
      document.getElementById('tf-new-project-name').focus();
    }
  }

  async function saveNewProject() {
    const name = document.getElementById('tf-new-project-name').value.trim();
    if (!name) return;
    const color = document.getElementById('tf-new-project-color').value;
    const project = await window.api.projects.create(name, color);
    await loadProjects();
    const select = document.getElementById('tf-project');
    populateProjectSelect(select, false);
    select.value = project.id;
    toggleNewProjectRow(false);
    // Also refresh the Tasks page's own project filter dropdown, in case the
    // user cancels the task without saving — the new project should still
    // show up there right away. Preserve whatever filter was active.
    const filterSelect = document.getElementById('task-filter-project');
    const currentFilterVal = filterSelect.value;
    populateProjectSelect(filterSelect, true);
    filterSelect.value = currentFilterVal;
    showToast(`Project "${project.name}" created.`);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const reminderOn = document.getElementById('tf-reminder-toggle').checked;
    const payload = {
      title: document.getElementById('tf-title').value.trim(),
      notes: document.getElementById('tf-notes').value.trim(),
      project_id: document.getElementById('tf-project').value ? Number(document.getElementById('tf-project').value) : null,
      priority: Number(document.getElementById('tf-priority').value),
      due_date: document.getElementById('tf-due-date').value || null,
      due_time: document.getElementById('tf-due-time').value || null,
      recurrence: document.getElementById('tf-recurrence').value,
      recurrence_interval: Number(document.getElementById('tf-interval').value) || 1,
      reminder_minutes_before: reminderOn ? Number(document.getElementById('tf-reminder-minutes').value) || 0 : null,
    };
    if (!payload.title) return;
    if (payload.recurrence !== 'none' && !payload.due_date) {
      showToast('A recurring task needs a due date.', true);
      return;
    }

    try {
      if (editingTaskId) {
        await window.api.tasks.update(editingTaskId, payload);
      } else {
        await window.api.tasks.create(payload);
      }
      closeModal();
      await render();
      if (typeof DashboardView !== 'undefined') DashboardView.render();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function init() {
    attachListHandlers(document.getElementById('task-list'));
    document.getElementById('btn-new-task').addEventListener('click', () => openModal(null));
    document.getElementById('btn-cancel-task').addEventListener('click', closeModal);
    document.getElementById('task-modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'task-modal-backdrop') closeModal();
    });
    document.getElementById('task-form').addEventListener('submit', handleSubmit);
    document.getElementById('tf-add-project-btn').addEventListener('click', () => toggleNewProjectRow(true));
    document.getElementById('tf-new-project-cancel').addEventListener('click', () => toggleNewProjectRow(false));
    document.getElementById('tf-new-project-save').addEventListener('click', () => safeCall(saveNewProject(), 'Could not create project.'));
    document.getElementById('tf-new-project-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); safeCall(saveNewProject(), 'Could not create project.'); }
    });
    document.getElementById('tf-reminder-toggle').addEventListener('change', (e) => {
      document.getElementById('tf-reminder-minutes-wrap').classList.toggle('hidden', !e.target.checked);
    });
    document.getElementById('task-filter-project').addEventListener('change', render);
    document.getElementById('task-filter-hide-completed').addEventListener('change', render);
  }

  return { init, render, openModal, getProjectsCache: () => projectsCache, loadProjects };
})();
