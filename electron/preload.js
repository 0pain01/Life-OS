const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel) {
  return (...args) =>
    ipcRenderer.invoke(channel, ...args).then((res) => {
      if (!res || res.ok !== true) {
        throw new Error((res && res.error) || `IPC call failed: ${channel}`);
      }
      return res.data;
    });
}

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: invoke('settings:get'),
    set: invoke('settings:set'),
  },
  projects: {
    list: invoke('projects:list'),
    create: invoke('projects:create'),
    update: invoke('projects:update'),
    delete: invoke('projects:delete'),
  },
  tasks: {
    list: invoke('tasks:list'),
    get: invoke('tasks:get'),
    create: invoke('tasks:create'),
    update: invoke('tasks:update'),
    delete: invoke('tasks:delete'),
    complete: invoke('tasks:complete'),
    uncomplete: invoke('tasks:uncomplete'),
    dueOn: invoke('tasks:dueOn'),
    overdue: invoke('tasks:overdue'),
  },
  foods: {
    search: invoke('foods:search'),
    createCustom: invoke('foods:createCustom'),
    upsertFromRemote: invoke('foods:upsertFromRemote'),
    lookupBarcode: invoke('foods:lookupBarcode'),
    listCustom: invoke('foods:listCustom'),
    update: invoke('foods:update'),
    delete: invoke('foods:delete'),
  },
  foodLogs: {
    forDate: invoke('foodLogs:forDate'),
    log: invoke('foodLogs:log'),
    delete: invoke('foodLogs:delete'),
    update: invoke('foodLogs:update'),
    dailyTotals: invoke('foodLogs:dailyTotals'),
    rangeTotals: invoke('foodLogs:rangeTotals'),
  },
});
