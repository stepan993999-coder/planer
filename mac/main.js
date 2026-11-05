"use strict";
const { app, BrowserWindow, ipcMain, Menu, dialog, shell, nativeTheme, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("Планер");

const DATA_DIR = () => app.getPath("userData");
const DATA_FILE = () => path.join(DATA_DIR(), "planner-data.json");
const SETTINGS_FILE = () => path.join(DATA_DIR(), "settings.json");
const BACKUP_DIR = () => path.join(DATA_DIR(), "Резервные копии");

let win = null;
let data = {};
let settings = { theme: "system", bounds: null };

/* ---------- файлы ---------- */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}
function writeJSONAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}
function dailyBackup() {
  try {
    if (!fs.existsSync(DATA_FILE())) return;
    fs.mkdirSync(BACKUP_DIR(), { recursive: true });
    const d = new Date();
    const name = `planner-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
    const target = path.join(BACKUP_DIR(), name);
    if (!fs.existsSync(target)) fs.copyFileSync(DATA_FILE(), target);
    const all = fs.readdirSync(BACKUP_DIR()).filter(f => /^planner-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (all.length > 30) fs.unlinkSync(path.join(BACKUP_DIR(), all.shift()));
  } catch (e) { /* резервная копия не критична */ }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { writeJSONAtomic(DATA_FILE(), data); }
    catch (e) { dialog.showErrorBox("Не удалось сохранить данные", String(e.message || e)); }
  }, 300);
}
function flushSave() {
  clearTimeout(saveTimer);
  try { writeJSONAtomic(DATA_FILE(), data); } catch (e) {}
}
function saveSettings() { try { writeJSONAtomic(SETTINGS_FILE(), settings); } catch (e) {} }

/* ---------- IPC ---------- */
const KEYS = ["tasks", "events", "finance", "goals", "habits", "notes", "loans"];
ipcMain.handle("planner:load", () => data);
ipcMain.handle("planner:save", (_e, key, value) => {
  if (!KEYS.includes(key)) return false;
  data[key] = value;
  scheduleSave();
  return true;
});
ipcMain.on("planner:badge", (_e, n) => {
  if (process.platform === "darwin" && app.dock) app.dock.setBadge(n > 0 ? String(n) : "");
});
ipcMain.on("planner:notify", (_e, title, body) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
});
ipcMain.on("planner:openDataFolder", () => shell.openPath(DATA_DIR()));

/* ---------- экспорт / импорт ---------- */
async function exportData() {
  const d = new Date();
  const res = await dialog.showSaveDialog(win, {
    title: "Экспорт данных планера",
    defaultPath: path.join(app.getPath("documents"), `Планер ${d.toLocaleDateString("ru-RU")}.json`),
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (res.canceled || !res.filePath) return;
  flushSave();
  fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), "utf8");
  dialog.showMessageBox(win, { type: "info", message: "Данные сохранены", detail: res.filePath });
}
async function importData() {
  const res = await dialog.showOpenDialog(win, {
    title: "Импорт данных планера",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (res.canceled || !res.filePaths[0]) return;
  const incoming = readJSON(res.filePaths[0], null);
  if (!incoming || typeof incoming !== "object" || !KEYS.some(k => k in incoming)) {
    dialog.showErrorBox("Файл не подходит", "В этом файле нет данных планера. Выберите файл, сохранённый через «Экспорт данных».");
    return;
  }
  const ok = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Заменить", "Отмена"],
    defaultId: 1, cancelId: 1,
    message: "Заменить текущие данные?",
    detail: "Все задачи, события, финансы, кредиты, цели, привычки и заметки будут заменены данными из файла. Перед заменой сделается резервная копия."
  });
  if (ok.response !== 0) return;
  flushSave();
  try {
    fs.mkdirSync(BACKUP_DIR(), { recursive: true });
    fs.copyFileSync(DATA_FILE(), path.join(BACKUP_DIR(), `перед-импортом-${Date.now()}.json`));
  } catch (e) {}
  data = {};
  for (const k of KEYS) if (k in incoming) data[k] = incoming[k];
  flushSave();
  win && win.webContents.reload();
}

/* ---------- меню ---------- */
function setTheme(t) {
  settings.theme = t;
  nativeTheme.themeSource = t;
  saveSettings();
  buildMenu();
}
function go(view) { if (win) { win.show(); win.webContents.send("planner:nav", view); } }

function buildMenu() {
  const sections = [
    ["overview", "Обзор"], ["calendar", "Календарь"], ["tasks", "Задачи"], ["finance", "Финансы"], ["loans", "Кредиты"],
    ["goals", "Цели"], ["habits", "Привычки"], ["notes", "Заметки"]
  ];
  const template = [
    {
      label: "Планер",
      submenu: [
        { role: "about", label: "О программе «Планер»" },
        { type: "separator" },
        { role: "services", label: "Службы" },
        { type: "separator" },
        { role: "hide", label: "Скрыть «Планер»" },
        { role: "hideOthers", label: "Скрыть остальные" },
        { role: "unhide", label: "Показать все" },
        { type: "separator" },
        { role: "quit", label: "Завершить «Планер»" }
      ]
    },
    {
      label: "Файл",
      submenu: [
        { label: "Новая задача", accelerator: "CmdOrCtrl+N", click: () => win && win.webContents.send("planner:newTask") },
        { type: "separator" },
        { label: "Экспорт данных…", accelerator: "CmdOrCtrl+Shift+E", click: exportData },
        { label: "Импорт данных…", click: importData },
        { type: "separator" },
        { label: "Показать папку с данными", click: () => shell.openPath(DATA_DIR()) },
        { type: "separator" },
        { role: "close", label: "Закрыть окно" }
      ]
    },
    {
      label: "Правка",
      submenu: [
        { role: "undo", label: "Отменить" },
        { role: "redo", label: "Повторить" },
        { type: "separator" },
        { role: "cut", label: "Вырезать" },
        { role: "copy", label: "Копировать" },
        { role: "paste", label: "Вставить" },
        { role: "selectAll", label: "Выбрать всё" }
      ]
    },
    {
      label: "Вид",
      submenu: [
        ...sections.map(([id, name], i) => ({ label: name, accelerator: `CmdOrCtrl+${i + 1}`, click: () => go(id) })),
        { type: "separator" },
        {
          label: "Тема", submenu: [
            { label: "Как в системе", type: "radio", checked: settings.theme === "system", click: () => setTheme("system") },
            { label: "Светлая", type: "radio", checked: settings.theme === "light", click: () => setTheme("light") },
            { label: "Тёмная", type: "radio", checked: settings.theme === "dark", click: () => setTheme("dark") }
          ]
        },
        { type: "separator" },
        { role: "resetZoom", label: "Обычный размер" },
        { role: "zoomIn", label: "Увеличить" },
        { role: "zoomOut", label: "Уменьшить" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Полноэкранный режим" }
      ]
    },
    {
      label: "Окно",
      role: "windowMenu",
      submenu: [
        { role: "minimize", label: "Свернуть" },
        { role: "zoom", label: "Изменить масштаб окна" },
        { type: "separator" },
        { role: "front", label: "Все окна — на передний план" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- окно ---------- */
function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1240,
    height: b.height || 820,
    x: b.x, y: b.y,
    minWidth: 960,
    minHeight: 620,
    title: "Планер",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    vibrancy: "sidebar",
    visualEffectState: "followWindow",
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());

  const remember = () => { if (win && !win.isMinimized() && !win.isFullScreen()) { settings.bounds = win.getBounds(); saveSettings(); } };
  win.on("resized", remember);
  win.on("moved", remember);

  // внешние ссылки — в браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.on("closed", () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    data = readJSON(DATA_FILE(), {});
    settings = Object.assign(settings, readJSON(SETTINGS_FILE(), {}));
    nativeTheme.themeSource = settings.theme || "system";
    dailyBackup();
    app.setAboutPanelOptions({
      applicationName: "Планер",
      applicationVersion: app.getVersion(),
      copyright: "Календарь, задачи, финансы, цели и привычки"
    });
    buildMenu();
    createWindow();
    app.on("activate", () => { if (!win) createWindow(); else win.show(); });
  });

  app.on("before-quit", flushSave);
  app.on("window-all-closed", () => { flushSave(); if (process.platform !== "darwin") app.quit(); });
}
