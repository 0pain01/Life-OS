const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { nextDueDate, catchUpDueDate, todayStr } = require('./recurrence');
const { seedIndianFoods } = require('./indianFoodsSeed');

let db;

function init(userDataPath) {
  const dir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'daybook.sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate();
  seedDefaults();
  rollForwardCompletedRecurring();
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6b7f6b',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT DEFAULT '',
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      due_date TEXT,                 -- 'YYYY-MM-DD' or NULL
      due_time TEXT,                 -- 'HH:MM' or NULL
      recurrence TEXT NOT NULL DEFAULT 'none', -- none|daily|weekly|monthly|yearly
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      reminder_minutes_before INTEGER, -- NULL = no reminder
      priority INTEGER NOT NULL DEFAULT 0, -- 0 normal, 1 high, -1 low
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      last_reminded_key TEXT,        -- dedupe key so we don't renotify repeatedly
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      due_date TEXT,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'custom', -- usda|off|custom
      external_id TEXT,
      name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      serving_size REAL NOT NULL DEFAULT 100,   -- grams (or ml) per default serving
      serving_unit TEXT NOT NULL DEFAULT 'g',
      serving_label TEXT DEFAULT '',            -- e.g. "1 slice", "1 cup"
      calories_per_100 REAL NOT NULL DEFAULT 0,
      protein_per_100 REAL NOT NULL DEFAULT 0,
      fat_per_100 REAL NOT NULL DEFAULT 0,
      carbs_per_100 REAL NOT NULL DEFAULT 0,
      saturated_fat_per_100 REAL,   -- optional extended fields — NULL means "not provided"
      sugar_per_100 REAL,
      fiber_per_100 REAL,
      sodium_per_100 REAL,          -- mg per 100g
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source, external_id)
    );

    CREATE TABLE IF NOT EXISTS food_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
      date TEXT NOT NULL,           -- 'YYYY-MM-DD'
      meal TEXT NOT NULL DEFAULT 'snack', -- breakfast|lunch|dinner|snack
      food_name TEXT NOT NULL,      -- snapshot, survives food edits/deletes
      quantity REAL NOT NULL DEFAULT 1,  -- number of servings
      serving_size REAL NOT NULL DEFAULT 100,
      serving_unit TEXT NOT NULL DEFAULT 'g',
      calories REAL NOT NULL DEFAULT 0,
      protein REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0,
      carbs REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);
  `);

  // CREATE TABLE IF NOT EXISTS only applies to brand-new databases — for an
  // existing one (from before these columns existed), add them here.
  for (const col of ['saturated_fat_per_100', 'sugar_per_100', 'fiber_per_100', 'sodium_per_100']) {
    ensureColumn('foods', col, 'REAL');
  }
}

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedDefaults() {
  const defaults = {
    daily_calories: '2000',
    daily_protein: '150',
    daily_fat: '65',
    daily_carbs: '250',
    reminders_enabled: '1',
    default_reminder_minutes: '30',
    gemini_api_key: '',
  };
  const existing = new Set(db.prepare('SELECT key FROM settings').all().map(r => r.key));
  const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) {
      if (!existing.has(k)) insert.run(k, v);
    }
    if (db.prepare('SELECT COUNT(*) c FROM projects').get().c === 0) {
      db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)').run('Inbox', '#6b7f6b');
    }
  });
  tx();
  seedIndianFoods(db);
}

// ---------- Settings ----------
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
  return getSettings();
}

// ---------- Projects ----------
function listProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY name').all();
}

function createProject(name, color) {
  const info = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)').run(name, color || '#6b7f6b');
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
}

function updateProject(id, { name, color }) {
  db.prepare('UPDATE projects SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?').run(
    name ?? null,
    color ?? null,
    id
  );
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function deleteProject(id) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return true;
}

// ---------- Tasks ----------
function listTasks({ includeCompleted = true } = {}) {
  rollForwardCompletedRecurring();
  const sql = `
    SELECT t.*, p.name AS project_name, p.color AS project_color
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    ${includeCompleted ? '' : 'WHERE t.completed = 0'}
    ORDER BY
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      t.due_time ASC,
      t.priority DESC,
      t.id ASC
  `;
  return db.prepare(sql).all();
}

function getTask(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function createTask(task) {
  const info = db
    .prepare(
      `INSERT INTO tasks
        (title, notes, project_id, due_date, due_time, recurrence, recurrence_interval, reminder_minutes_before, priority)
       VALUES (@title, @notes, @project_id, @due_date, @due_time, @recurrence, @recurrence_interval, @reminder_minutes_before, @priority)`
    )
    .run({
      title: task.title,
      notes: task.notes || '',
      project_id: task.project_id || null,
      due_date: task.due_date || null,
      due_time: task.due_time || null,
      recurrence: task.recurrence || 'none',
      recurrence_interval: task.recurrence_interval || 1,
      reminder_minutes_before: task.reminder_minutes_before ?? null,
      priority: task.priority || 0,
    });
  return getTask(info.lastInsertRowid);
}

function updateTask(id, fields) {
  const current = getTask(id);
  if (!current) return null;
  const merged = { ...current, ...fields };
  db.prepare(
    `UPDATE tasks SET
      title = @title,
      notes = @notes,
      project_id = @project_id,
      due_date = @due_date,
      due_time = @due_time,
      recurrence = @recurrence,
      recurrence_interval = @recurrence_interval,
      reminder_minutes_before = @reminder_minutes_before,
      priority = @priority,
      updated_at = datetime('now')
    WHERE id = @id`
  ).run({
    id,
    title: merged.title,
    notes: merged.notes || '',
    project_id: merged.project_id || null,
    due_date: merged.due_date || null,
    due_time: merged.due_time || null,
    recurrence: merged.recurrence || 'none',
    recurrence_interval: merged.recurrence_interval || 1,
    reminder_minutes_before: merged.reminder_minutes_before ?? null,
    priority: merged.priority || 0,
  });
  return getTask(id);
}

function deleteTask(id) {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return true;
}

// Complete a task — always just marks it done for its current due_date,
// whether recurring or one-off. Recurring tasks don't jump to their next
// occurrence immediately: they stay visibly completed (struck through) on
// today's list until the calendar day actually moves past their due_date,
// at which point rollForwardCompletedRecurring() advances them and resets
// completed so the next occurrence shows up as pending. This keeps "check
// it off" from making the task appear to vanish/relocate mid-day.
function completeTask(id) {
  const task = getTask(id);
  if (!task) return null;
  db.prepare('INSERT INTO task_completions (task_id, due_date) VALUES (?, ?)').run(id, task.due_date);
  db.prepare(
    `UPDATE tasks SET completed = 1, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(id);
  return getTask(id);
}

function uncompleteTask(id) {
  db.prepare(`UPDATE tasks SET completed = 0, completed_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
  return getTask(id);
}

// Advances any completed recurring task whose due_date has fallen strictly
// in the past to its next occurrence and clears completed, so it reappears
// as pending. Call this before reading task lists — cheap no-op when
// nothing is stale.
function rollForwardCompletedRecurring() {
  const today = todayStr();
  const stale = db
    .prepare(`SELECT * FROM tasks WHERE completed = 1 AND recurrence != 'none' AND due_date < ?`)
    .all(today);
  for (const task of stale) {
    const advanced = nextDueDate(task.due_date, task.recurrence, task.recurrence_interval);
    const next = catchUpDueDate(advanced, task.recurrence, task.recurrence_interval);
    db.prepare(
      `UPDATE tasks SET due_date = ?, completed = 0, completed_at = NULL, last_reminded_key = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(next, task.id);
  }
}

function tasksDueOn(dateStr) {
  rollForwardCompletedRecurring();
  return db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.due_date = ?
       ORDER BY t.completed ASC, t.due_time ASC, t.priority DESC`
    )
    .all(dateStr);
}

function overdueTasks() {
  rollForwardCompletedRecurring();
  const today = todayStr();
  return db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.due_date IS NOT NULL AND t.due_date < ? AND t.completed = 0
       ORDER BY t.due_date ASC`
    )
    .all(today);
}

function setLastRemindedKey(id, key) {
  db.prepare('UPDATE tasks SET last_reminded_key = ? WHERE id = ?').run(key, id);
}

// ---------- Foods ----------
function searchLocalFoods(query) {
  return db
    .prepare(`SELECT * FROM foods WHERE name LIKE ? OR brand LIKE ? ORDER BY name LIMIT 25`)
    .all(`%${query}%`, `%${query}%`);
}

function upsertFood(food) {
  const existing = food.external_id
    ? db.prepare('SELECT * FROM foods WHERE source = ? AND external_id = ?').get(food.source, food.external_id)
    : null;
  if (existing) return existing;
  const info = db
    .prepare(
      `INSERT INTO foods
        (source, external_id, name, brand, serving_size, serving_unit, serving_label, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, saturated_fat_per_100, sugar_per_100, fiber_per_100, sodium_per_100)
       VALUES (@source, @external_id, @name, @brand, @serving_size, @serving_unit, @serving_label, @calories_per_100, @protein_per_100, @fat_per_100, @carbs_per_100, @saturated_fat_per_100, @sugar_per_100, @fiber_per_100, @sodium_per_100)`
    )
    .run({
      source: food.source || 'custom',
      external_id: food.external_id || null,
      name: food.name,
      brand: food.brand || '',
      serving_size: food.serving_size || 100,
      serving_unit: food.serving_unit || 'g',
      serving_label: food.serving_label || '',
      calories_per_100: food.calories_per_100 || 0,
      protein_per_100: food.protein_per_100 || 0,
      fat_per_100: food.fat_per_100 || 0,
      carbs_per_100: food.carbs_per_100 || 0,
      // Optional extended fields — left NULL (not 0) when not provided, so
      // "unknown" stays distinguishable from "genuinely zero".
      saturated_fat_per_100: food.saturated_fat_per_100 ?? null,
      sugar_per_100: food.sugar_per_100 ?? null,
      fiber_per_100: food.fiber_per_100 ?? null,
      sodium_per_100: food.sodium_per_100 ?? null,
    });
  return db.prepare('SELECT * FROM foods WHERE id = ?').get(info.lastInsertRowid);
}

function createCustomFood(food) {
  return upsertFood({ ...food, source: 'custom', external_id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}` });
}

function listCustomFoods() {
  return db.prepare(`SELECT * FROM foods WHERE source = 'custom' ORDER BY name`).all();
}

function updateFood(id, fields) {
  const current = db.prepare('SELECT * FROM foods WHERE id = ?').get(id);
  if (!current) return null;
  const merged = { ...current, ...fields };
  db.prepare(
    `UPDATE foods SET
      name = @name,
      brand = @brand,
      serving_size = @serving_size,
      serving_unit = @serving_unit,
      calories_per_100 = @calories_per_100,
      protein_per_100 = @protein_per_100,
      fat_per_100 = @fat_per_100,
      carbs_per_100 = @carbs_per_100,
      saturated_fat_per_100 = @saturated_fat_per_100,
      sugar_per_100 = @sugar_per_100,
      fiber_per_100 = @fiber_per_100,
      sodium_per_100 = @sodium_per_100
    WHERE id = @id`
  ).run({
    id,
    name: merged.name,
    brand: merged.brand || '',
    serving_size: merged.serving_size || 100,
    serving_unit: merged.serving_unit || 'g',
    calories_per_100: merged.calories_per_100 || 0,
    protein_per_100: merged.protein_per_100 || 0,
    fat_per_100: merged.fat_per_100 || 0,
    carbs_per_100: merged.carbs_per_100 || 0,
    saturated_fat_per_100: merged.saturated_fat_per_100 ?? null,
    sugar_per_100: merged.sugar_per_100 ?? null,
    fiber_per_100: merged.fiber_per_100 ?? null,
    sodium_per_100: merged.sodium_per_100 ?? null,
  });
  return db.prepare('SELECT * FROM foods WHERE id = ?').get(id);
}

// Deleting a food leaves any existing food_logs rows in place (their
// macros are a snapshot taken at log time, not a live reference) — the
// food_id foreign key just goes NULL, per the table's ON DELETE SET NULL.
function deleteFood(id) {
  db.prepare('DELETE FROM foods WHERE id = ?').run(id);
  return true;
}

// ---------- Food logs ----------
function logFood(entry) {
  const info = db
    .prepare(
      `INSERT INTO food_logs
        (food_id, date, meal, food_name, quantity, serving_size, serving_unit, calories, protein, fat, carbs)
       VALUES (@food_id, @date, @meal, @food_name, @quantity, @serving_size, @serving_unit, @calories, @protein, @fat, @carbs)`
    )
    .run(entry);
  return db.prepare('SELECT * FROM food_logs WHERE id = ?').get(info.lastInsertRowid);
}

function deleteFoodLog(id) {
  db.prepare('DELETE FROM food_logs WHERE id = ?').run(id);
  return true;
}

function updateFoodLog(id, fields) {
  const current = db.prepare('SELECT * FROM food_logs WHERE id = ?').get(id);
  if (!current) return null;
  const merged = { ...current, ...fields };
  db.prepare(
    `UPDATE food_logs SET
      meal = @meal,
      quantity = @quantity,
      serving_size = @serving_size,
      calories = @calories,
      protein = @protein,
      fat = @fat,
      carbs = @carbs
    WHERE id = @id`
  ).run({
    id,
    meal: merged.meal,
    quantity: merged.quantity,
    serving_size: merged.serving_size,
    calories: merged.calories,
    protein: merged.protein,
    fat: merged.fat,
    carbs: merged.carbs,
  });
  return db.prepare('SELECT * FROM food_logs WHERE id = ?').get(id);
}

function foodLogsForDate(dateStr) {
  return db.prepare('SELECT * FROM food_logs WHERE date = ? ORDER BY id ASC').all(dateStr);
}

function dailyTotals(dateStr) {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(calories), 0) AS calories,
        COALESCE(SUM(protein), 0) AS protein,
        COALESCE(SUM(fat), 0) AS fat,
        COALESCE(SUM(carbs), 0) AS carbs
       FROM food_logs WHERE date = ?`
    )
    .get(dateStr);
  return row;
}

function totalsInRange(startDate, endDate) {
  return db
    .prepare(
      `SELECT date,
        SUM(calories) AS calories,
        SUM(protein) AS protein,
        SUM(fat) AS fat,
        SUM(carbs) AS carbs
       FROM food_logs
       WHERE date >= ? AND date <= ?
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(startDate, endDate);
}

module.exports = {
  init,
  get db() {
    return db;
  },
  getSettings,
  setSetting,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  uncompleteTask,
  tasksDueOn,
  overdueTasks,
  rollForwardCompletedRecurring,
  setLastRemindedKey,
  searchLocalFoods,
  upsertFood,
  createCustomFood,
  listCustomFoods,
  updateFood,
  deleteFood,
  logFood,
  deleteFoodLog,
  updateFoodLog,
  foodLogsForDate,
  dailyTotals,
  totalsInRange,
};
