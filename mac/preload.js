"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("planner", {
  load: () => ipcRenderer.invoke("planner:load"),
  save: (key, value) => ipcRenderer.invoke("planner:save", key, value),
  badge: n => ipcRenderer.send("planner:badge", n),
  notify: (title, body) => ipcRenderer.send("planner:notify", title, body),
  openDataFolder: () => ipcRenderer.send("planner:openDataFolder"),
  onNav: cb => ipcRenderer.on("planner:nav", (_e, v) => cb(v)),
  onNewTask: cb => ipcRenderer.on("planner:newTask", () => cb())
});
