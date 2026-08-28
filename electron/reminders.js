const { Notification } = require('electron');
const db = require('./db');
const { todayStr } = require('./recurrence');

const CHECK_INTERVAL_MS = 60 * 1000; // check every minute
let timer = null;

function minutesUntil(dueDateStr, dueTimeStr) {
  if (!dueDateStr) return Infinity;
  const time = dueTimeStr || '23:59';
  const target = new Date(`${dueDateStr}T${time}:00`);
  return (target.getTime() - Date.now()) / 60000;
}

function checkReminders() {
  // Independent of the reminders_enabled setting — this just keeps
  // completed recurring tasks rolling to their next occurrence once the
  // calendar day moves past their due_date, even if desktop notifications
  // are turned off.
  db.rollForwardCompletedRecurring();

  const settings = db.getSettings();
  if (settings.reminders_enabled !== '1') return;

  const tasks = db.listTasks({ includeCompleted: false });
  const today = todayStr();

  for (const task of tasks) {
    if (!task.due_date) continue;

    // Overdue: remind once per day it stays overdue.
    if (task.due_date < today) {
      const key = `overdue:${task.due_date}`;
      if (task.last_reminded_key !== key) {
        notify('Overdue task', task);
        db.setLastRemindedKey(task.id, key);
      }
      continue;
    }

    // Upcoming: remind once when within the reminder window.
    if (task.reminder_minutes_before == null) continue;
    const mins = minutesUntil(task.due_date, task.due_time);
    const key = `upcoming:${task.due_date}:${task.due_time || ''}`;
    if (mins <= task.reminder_minutes_before && mins >= -1 && task.last_reminded_key !== key) {
      notify('Upcoming task', task);
      db.setLastRemindedKey(task.id, key);
    }
  }
}

function notify(title, task) {
  if (!Notification.isSupported()) return;
  const when = task.due_time ? `${task.due_date} ${task.due_time}` : task.due_date;
  new Notification({
    title: `${title}: ${task.title}`,
    body: `Due ${when}${task.project_name ? ' · ' + task.project_name : ''}`,
    silent: false,
  }).show();
}

function start() {
  if (timer) return;
  checkReminders();
  timer = setInterval(checkReminders, CHECK_INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, checkReminders };
