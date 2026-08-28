const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('path');
const db = require('./db');
const reminders = require('./reminders');
const nutritionApi = require('./nutritionApi');

// Pins the userData path (and thus the SQLite DB location) to the app's
// original internal name, independent of whatever product/display name
// package.json carries. Without this, rebranding the app in package.json
// would silently point Electron at a brand-new %APPDATA% folder and orphan
// everyone's existing tasks and food logs, which live under the old name.
app.setName('Daybook');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#f6f3ec',
    title: 'Life OS',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  db.init(app.getPath('userData'));
  registerIpc();

  // Auto-grant camera access for the barcode scanner — this app only ever
  // loads its own local UI, so there's no untrusted content to gate.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  createWindow();
  reminders.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  reminders.stop();
  if (process.platform !== 'darwin') app.quit();
});

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const result = await fn(...args);
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function registerIpc() {
  // Settings
  handle('settings:get', () => db.getSettings());
  handle('settings:set', (key, value) => db.setSetting(key, value));

  // Projects
  handle('projects:list', () => db.listProjects());
  handle('projects:create', (name, color) => db.createProject(name, color));
  handle('projects:update', (id, fields) => db.updateProject(id, fields));
  handle('projects:delete', (id) => db.deleteProject(id));

  // Tasks
  handle('tasks:list', (opts) => db.listTasks(opts || {}));
  handle('tasks:get', (id) => db.getTask(id));
  handle('tasks:create', (task) => db.createTask(task));
  handle('tasks:update', (id, fields) => db.updateTask(id, fields));
  handle('tasks:delete', (id) => db.deleteTask(id));
  handle('tasks:complete', (id) => db.completeTask(id));
  handle('tasks:uncomplete', (id) => db.uncompleteTask(id));
  handle('tasks:dueOn', (date) => db.tasksDueOn(date));
  handle('tasks:overdue', () => db.overdueTasks());

  // Nutrition: food search & catalog
  handle('foods:search', async (query) => {
    const local = db.searchLocalFoods(query);
    const settings = db.getSettings();
    const remote = await nutritionApi.searchFood(query, { geminiApiKey: settings.gemini_api_key });
    return { local, remote: remote.results, warnings: remote.warnings };
  });
  handle('foods:createCustom', (food) => db.createCustomFood(food));
  handle('foods:upsertFromRemote', (food) => db.upsertFood(food));
  handle('foods:lookupBarcode', async (barcode) => {
    const food = await nutritionApi.lookupBarcode(barcode);
    return food;
  });
  handle('foods:listCustom', () => db.listCustomFoods());
  handle('foods:update', (id, fields) => db.updateFood(id, fields));
  handle('foods:delete', (id) => db.deleteFood(id));

  // Nutrition: logging
  handle('foodLogs:forDate', (date) => db.foodLogsForDate(date));
  handle('foodLogs:log', (entry) => db.logFood(entry));
  handle('foodLogs:delete', (id) => db.deleteFoodLog(id));
  handle('foodLogs:update', (id, fields) => db.updateFoodLog(id, fields));
  handle('foodLogs:dailyTotals', (date) => db.dailyTotals(date));
  handle('foodLogs:rangeTotals', (start, end) => db.totalsInRange(start, end));
}
