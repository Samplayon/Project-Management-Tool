const SYNC_API_URL = "/api/project-data";

const EMPTY_REMOTE_STATE = {
  tasks: [],
  alerts: [],
  timers: [],
};

const LEGACY_LOCAL_STORAGE_KEYS = {
  tasks: "project-desk-tasks-v1",
  alerts: "project-desk-alerts-v1",
  timers: "project-desk-timers-v1",
};

const STATUSES = [
  { id: "todo", label: "To do" },
  { id: "active", label: "In progress" },
  { id: "waiting", label: "Waiting" },
  { id: "done", label: "Done" },
];

const state = {
  tasks: [],
  alerts: [],
  timers: [],
  search: "",
  project: "all",
  due: "all",
  sync: {
    ready: false,
    saving: false,
    error: "",
  },
};

const els = {
  taskForm: document.querySelector("#task-form"),
  taskTitle: document.querySelector("#task-title"),
  taskProject: document.querySelector("#task-project"),
  taskNotes: document.querySelector("#task-notes"),
  taskStatus: document.querySelector("#task-status"),
  taskPriority: document.querySelector("#task-priority"),
  taskDue: document.querySelector("#task-due"),
  taskReminder: document.querySelector("#task-reminder"),
  taskChecklist: document.querySelector("#task-checklist"),
  timerForm: document.querySelector("#timer-form"),
  timerLabel: document.querySelector("#timer-label"),
  timerMinutes: document.querySelector("#timer-minutes"),
  timerList: document.querySelector("#timer-list"),
  board: document.querySelector("#board"),
  summary: document.querySelector("#summary-strip"),
  searchInput: document.querySelector("#search-input"),
  projectFilter: document.querySelector("#project-filter"),
  dueFilter: document.querySelector("#due-filter"),
  alertList: document.querySelector("#alert-list"),
  clearAlerts: document.querySelector("#clear-alerts"),
  dueSoonList: document.querySelector("#due-soon-list"),
  notificationPermission: document.querySelector("#notification-permission"),
  newTaskButton: document.querySelector("#new-task-button"),
  dialog: document.querySelector("#task-dialog"),
  editForm: document.querySelector("#edit-task-form"),
  dialogTitle: document.querySelector("#dialog-title"),
  editTaskId: document.querySelector("#edit-task-id"),
  editTitle: document.querySelector("#edit-title"),
  editProject: document.querySelector("#edit-project"),
  editNotes: document.querySelector("#edit-notes"),
  editStatus: document.querySelector("#edit-status"),
  editPriority: document.querySelector("#edit-priority"),
  editDue: document.querySelector("#edit-due"),
  editReminder: document.querySelector("#edit-reminder"),
  editChecklistList: document.querySelector("#edit-checklist-list"),
  addChecklistItem: document.querySelector("#add-checklist-item"),
  saveTask: document.querySelector("#save-task"),
  deleteTask: document.querySelector("#delete-task"),
  closeDialog: document.querySelector("#close-dialog"),
  cancelEdit: document.querySelector("#cancel-edit"),
  syncStatus: document.querySelector("#sync-status"),
};

function uid(prefix) {
  if (window.crypto && window.crypto.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value) {
  return (value || "").trim();
}

function nowMs() {
  return Date.now();
}

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalInputValue(value) {
  const date = parseLocalDate(value);
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  const date = parseLocalDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getTaskDueState(task) {
  if (!task.dueAt) return "none";
  const due = parseLocalDate(task.dueAt);
  if (!due) return "none";
  const current = new Date();
  if (task.status !== "done" && due.getTime() < nowMs()) return "overdue";
  if (isSameDay(due, current)) return "today";
  const weekAhead = nowMs() + 7 * 24 * 60 * 60 * 1000;
  if (due.getTime() <= weekAhead) return "week";
  return "later";
}

function getChecklistProgress(task) {
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const total = checklist.length;
  const done = checklist.filter((item) => item.done).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function normalizeRemoteState(remoteState) {
  return {
    tasks: Array.isArray(remoteState?.tasks) ? remoteState.tasks.map(normalizeTask) : [],
    alerts: Array.isArray(remoteState?.alerts) ? remoteState.alerts.map(normalizeAlert) : [],
    timers: Array.isArray(remoteState?.timers) ? remoteState.timers.map(normalizeTimer) : [],
  };
}

function normalizeTask(task) {
  return {
    id: task.id || uid("task"),
    title: task.title || "",
    project: task.project || "",
    notes: task.notes || "",
    status: task.status || "todo",
    priority: task.priority || "normal",
    dueAt: task.dueAt || "",
    reminderAt: task.reminderAt || "",
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
    createdAt: Number(task.createdAt) || nowMs(),
    updatedAt: Number(task.updatedAt) || nowMs(),
    notified: task.notified && typeof task.notified === "object" ? task.notified : {},
  };
}

function normalizeAlert(alert) {
  return {
    id: alert.id || uid("alert"),
    title: alert.title || "",
    message: alert.message || "",
    createdAt: Number(alert.createdAt) || nowMs(),
  };
}

function normalizeTimer(timer) {
  return {
    id: timer.id || uid("timer"),
    label: timer.label || "",
    endsAt: Number(timer.endsAt) || nowMs(),
    createdAt: Number(timer.createdAt) || nowMs(),
    completedAt: timer.completedAt ? Number(timer.completedAt) : null,
  };
}

function getStateItemCount(savedState) {
  return savedState.tasks.length + savedState.alerts.length + savedState.timers.length;
}

function mergeRecordsById(primaryRecords, secondaryRecords, timestampKey) {
  const recordsById = new Map(primaryRecords.map((record) => [record.id, record]));

  secondaryRecords.forEach((record) => {
    const current = recordsById.get(record.id);
    const currentTime = Number(current?.[timestampKey] || current?.createdAt || 0);
    const nextTime = Number(record?.[timestampKey] || record?.createdAt || 0);

    if (!current || nextTime >= currentTime) {
      recordsById.set(record.id, record);
    }
  });

  return [...recordsById.values()];
}

function mergeSavedStates(remoteState, legacyState) {
  return {
    tasks: mergeRecordsById(remoteState.tasks, legacyState.tasks, "updatedAt"),
    alerts: mergeRecordsById(remoteState.alerts, legacyState.alerts, "createdAt"),
    timers: mergeRecordsById(remoteState.timers, legacyState.timers, "createdAt"),
  };
}

function loadLegacyLocalState() {
  try {
    return normalizeRemoteState({
      tasks: JSON.parse(localStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.tasks) || "[]"),
      alerts: JSON.parse(localStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.alerts) || "[]"),
      timers: JSON.parse(localStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.timers) || "[]"),
    });
  } catch (error) {
    return normalizeRemoteState(EMPTY_REMOTE_STATE);
  }
}

function clearLegacyLocalState() {
  Object.values(LEGACY_LOCAL_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

function getPersistableState() {
  return {
    tasks: state.tasks,
    alerts: state.alerts,
    timers: state.timers,
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }

  return body;
}

async function loadRemoteState() {
  state.sync.ready = false;
  state.sync.error = "";
  renderSyncStatus();

  try {
    const response = await requestJson(SYNC_API_URL);
    const remoteState = normalizeRemoteState(response.state || EMPTY_REMOTE_STATE);
    state.tasks = remoteState.tasks;
    state.alerts = remoteState.alerts;
    state.timers = remoteState.timers;

    const legacyState = loadLegacyLocalState();
    if (getStateItemCount(legacyState) > 0) {
      const mergedState = mergeSavedStates(remoteState, legacyState);
      state.tasks = mergedState.tasks;
      state.alerts = mergedState.alerts;
      state.timers = mergedState.timers;
      await persist();

      if (!state.sync.error) {
        clearLegacyLocalState();
        showToast("Moved local browser data to Google Drive");
      }
    }
  } catch (error) {
    state.sync.error = error.message;
    showToast(`Drive sync failed: ${error.message}`);
  } finally {
    state.sync.ready = true;
    renderSyncStatus();
  }
}

let pendingSaveCount = 0;
let saveQueue = Promise.resolve();

function persist() {
  const snapshot = getPersistableState();
  pendingSaveCount += 1;
  state.sync.saving = true;
  renderSyncStatus();

  saveQueue = saveQueue
    .catch(() => {})
    .then(() => requestJson(SYNC_API_URL, {
      method: "POST",
      body: JSON.stringify({ state: snapshot }),
    }))
    .then(() => {
      state.sync.error = "";
    })
    .catch((error) => {
      state.sync.error = error.message;
      showToast(`Drive save failed: ${error.message}`);
    })
    .finally(() => {
      pendingSaveCount = Math.max(0, pendingSaveCount - 1);
      state.sync.saving = pendingSaveCount > 0;
      renderSyncStatus();
    });

  return saveQueue;
}

function matchesFilters(task) {
  const query = state.search.toLowerCase();
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const checklistText = checklist.map((item) => item.text).join(" ");
  const haystack = `${task.title} ${task.project} ${task.notes} ${checklistText}`.toLowerCase();
  const matchesSearch = !query || haystack.includes(query);
  const matchesProject = state.project === "all" || (task.project || "No project") === state.project;
  const dueState = getTaskDueState(task);
  let matchesDue = true;

  if (state.due === "overdue") matchesDue = dueState === "overdue";
  if (state.due === "today") matchesDue = dueState === "today";
  if (state.due === "week") matchesDue = dueState === "today" || dueState === "week";
  if (state.due === "none") matchesDue = dueState === "none";

  return matchesSearch && matchesProject && matchesDue;
}

function getVisibleTasks() {
  return state.tasks.filter(matchesFilters).sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    const aDue = parseLocalDate(a.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER;
    const bDue = parseLocalDate(b.dueAt)?.getTime() || Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return b.createdAt - a.createdAt;
  });
}

function render() {
  renderProjectFilter();
  renderSummary();
  renderBoard();
  renderAlerts();
  renderDueSoon();
  renderTimers();
  renderNotificationButton();
  renderSyncStatus();
}

function renderSyncStatus() {
  if (!els.syncStatus) return;

  els.syncStatus.classList.toggle("error", Boolean(state.sync.error));
  els.syncStatus.classList.toggle("saving", state.sync.saving);

  if (state.sync.error) {
    els.syncStatus.textContent = `Google Drive sync unavailable: ${state.sync.error}`;
  } else if (state.sync.saving) {
    els.syncStatus.textContent = "Saving to Google Drive...";
  } else if (state.sync.ready) {
    els.syncStatus.textContent = "Synced with Google Drive";
  } else {
    els.syncStatus.textContent = "Connecting to Google Drive...";
  }
}

function renderProjectFilter() {
  const current = els.projectFilter.value || state.project;
  const projects = [...new Set(state.tasks.map((task) => task.project || "No project"))].sort();
  els.projectFilter.innerHTML = [
    `<option value="all">All projects</option>`,
    ...projects.map((project) => `<option value="${escapeAttr(project)}">${escapeHtml(project)}</option>`),
  ].join("");
  els.projectFilter.value = projects.includes(current) || current === "all" ? current : "all";
  state.project = els.projectFilter.value;
}

function renderSummary() {
  const activeTasks = state.tasks.filter((task) => task.status !== "done");
  const overdue = activeTasks.filter((task) => getTaskDueState(task) === "overdue").length;
  const today = activeTasks.filter((task) => getTaskDueState(task) === "today").length;
  const complete = state.tasks.filter((task) => task.status === "done").length;
  const items = [
    ["Open", activeTasks.length],
    ["Overdue", overdue],
    ["Due today", today],
    ["Done", complete],
  ];

  els.summary.innerHTML = items.map(([label, value]) => `
    <div class="summary-item">
      <span class="summary-value">${value}</span>
      <span class="summary-label">${label}</span>
    </div>
  `).join("");
}

function renderBoard() {
  const visible = getVisibleTasks();
  els.board.innerHTML = STATUSES.map((status) => {
    const tasks = visible.filter((task) => task.status === status.id);
    return `
      <section class="board-column" aria-label="${escapeAttr(status.label)} tasks">
        <div class="column-header">
          <h2 class="column-title">${escapeHtml(status.label)}</h2>
          <span class="column-count">${tasks.length}</span>
        </div>
        <div class="task-list">
          ${tasks.length ? tasks.map(renderTaskCard).join("") : `<p class="empty-state">No tasks here.</p>`}
        </div>
      </section>
    `;
  }).join("");
}

function renderTaskCard(task) {
  const progress = getChecklistProgress(task);
  const dueState = getTaskDueState(task);
  const duePill = task.dueAt ? `<span class="pill ${dueState === "overdue" ? "overdue" : dueState === "today" ? "today" : "due"}">${dueState === "overdue" ? "Overdue" : "Due"} ${escapeHtml(formatDateTime(task.dueAt))}</span>` : "";
  const reminderPill = task.reminderAt ? `<span class="pill reminder">Reminder ${escapeHtml(formatDateTime(task.reminderAt))}</span>` : "";
  const projectPill = `<span class="pill">${escapeHtml(task.project || "No project")}</span>`;
  const priorityPill = task.priority !== "normal" ? `<span class="pill ${escapeAttr(task.priority)}">${escapeHtml(capitalize(task.priority))}</span>` : "";
  const notes = task.notes ? `<p class="task-card-notes">${escapeHtml(truncate(task.notes, 120))}</p>` : "";
  const checklist = progress.total ? `
    <div>
      <div class="checklist-preview">
        <span class="pill">${progress.done}/${progress.total} checklist</span>
      </div>
      <div class="progress-bar" aria-label="Checklist progress">
        <div class="progress-fill" style="width: ${progress.percent}%"></div>
      </div>
    </div>
  ` : "";

  return `
    <button class="task-card ${task.status === "done" ? "done" : ""}" type="button" data-task-id="${escapeAttr(task.id)}">
      <div class="task-card-meta">${projectPill}${priorityPill}</div>
      <h3 class="task-card-title">${escapeHtml(task.title)}</h3>
      ${notes}
      ${checklist}
      <div class="task-card-footer">${duePill}${reminderPill}</div>
    </button>
  `;
}

function renderAlerts() {
  const alerts = [...state.alerts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  els.alertList.innerHTML = alerts.length ? alerts.map((alert) => `
    <div class="alert-item">
      <div>
        <strong>${escapeHtml(alert.title)}</strong>
        <span>${escapeHtml(alert.message)}</span>
      </div>
      <span class="alert-time">${escapeHtml(formatDateTime(alert.createdAt))}</span>
    </div>
  `).join("") : `<p class="empty-state">No alerts yet.</p>`;
}

function renderDueSoon() {
  const upcoming = state.tasks
    .filter((task) => task.status !== "done" && task.dueAt)
    .sort((a, b) => parseLocalDate(a.dueAt).getTime() - parseLocalDate(b.dueAt).getTime())
    .slice(0, 8);

  els.dueSoonList.innerHTML = upcoming.length ? upcoming.map((task) => `
    <button class="due-item" type="button" data-task-id="${escapeAttr(task.id)}">
      <span>
        <strong>${escapeHtml(task.title)}</strong>
        <span class="due-time">${escapeHtml(formatDateTime(task.dueAt))}</span>
      </span>
      <span class="pill ${getTaskDueState(task)}">${escapeHtml(task.project || "No project")}</span>
    </button>
  `).join("") : `<p class="empty-state">Nothing scheduled.</p>`;
}

function renderTimers() {
  const activeTimers = state.timers.filter((timer) => !timer.completedAt);
  els.timerList.innerHTML = activeTimers.length ? activeTimers.map((timer) => {
    const remaining = Math.max(0, timer.endsAt - nowMs());
    return `
      <div class="timer-card">
        <div>
          <strong>${escapeHtml(timer.label)}</strong>
          <span class="timer-time">${escapeHtml(formatDuration(remaining))}</span>
        </div>
        <button class="ghost-button" type="button" data-timer-id="${escapeAttr(timer.id)}">Stop</button>
      </div>
    `;
  }).join("") : `<p class="empty-state">No active timers.</p>`;
}

function renderNotificationButton() {
  if (!("Notification" in window)) {
    els.notificationPermission.textContent = "Notifications unavailable";
    els.notificationPermission.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    els.notificationPermission.textContent = "Notifications enabled";
    els.notificationPermission.disabled = true;
  } else if (Notification.permission === "denied") {
    els.notificationPermission.textContent = "Notifications blocked";
    els.notificationPermission.disabled = true;
  } else {
    els.notificationPermission.textContent = "Enable notifications";
    els.notificationPermission.disabled = false;
  }
}

function addTaskFromForm(event) {
  event.preventDefault();
  const checklist = normalizeText(els.taskChecklist.value)
    .split("\n")
    .map((text) => normalizeText(text))
    .filter(Boolean)
    .map((text) => ({ id: uid("check"), text, done: false }));

  state.tasks.unshift({
    id: uid("task"),
    title: normalizeText(els.taskTitle.value),
    project: normalizeText(els.taskProject.value),
    notes: normalizeText(els.taskNotes.value),
    status: els.taskStatus.value,
    priority: els.taskPriority.value,
    dueAt: els.taskDue.value ? new Date(els.taskDue.value).toISOString() : "",
    reminderAt: els.taskReminder.value ? new Date(els.taskReminder.value).toISOString() : "",
    checklist,
    createdAt: nowMs(),
    updatedAt: nowMs(),
    notified: {},
  });

  els.taskForm.reset();
  els.taskStatus.value = "todo";
  els.taskPriority.value = "normal";
  persist();
  render();
  showToast("Task added");
}

function openTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  els.editTaskId.value = task.id;
  els.dialogTitle.textContent = task.title;
  els.editTitle.value = task.title;
  els.editProject.value = task.project || "";
  els.editNotes.value = task.notes || "";
  els.editStatus.value = task.status;
  els.editPriority.value = task.priority;
  els.editDue.value = toLocalInputValue(task.dueAt);
  els.editReminder.value = toLocalInputValue(task.reminderAt);
  renderChecklistEditor(task);
  els.dialog.showModal();
}

function renderChecklistEditor(task) {
  els.editChecklistList.innerHTML = task.checklist.length ? task.checklist.map((item) => `
    <div class="checklist-row" data-check-id="${escapeAttr(item.id)}">
      <input type="checkbox" ${item.done ? "checked" : ""} aria-label="Checklist item complete">
      <input type="text" value="${escapeAttr(item.text)}" aria-label="Checklist item text">
      <button class="icon-button" type="button" aria-label="Remove checklist item">x</button>
    </div>
  `).join("") : `<p class="empty-state">No checklist items yet.</p>`;
}

function collectChecklistEditor() {
  return [...els.editChecklistList.querySelectorAll(".checklist-row")].map((row) => ({
    id: row.dataset.checkId || uid("check"),
    done: row.querySelector('input[type="checkbox"]').checked,
    text: normalizeText(row.querySelector('input[type="text"]').value),
  })).filter((item) => item.text);
}

function saveEditedTask() {
  const task = state.tasks.find((item) => item.id === els.editTaskId.value);
  if (!task) return;
  const oldDue = task.dueAt;
  const oldReminder = task.reminderAt;

  task.title = normalizeText(els.editTitle.value);
  task.project = normalizeText(els.editProject.value);
  task.notes = normalizeText(els.editNotes.value);
  task.status = els.editStatus.value;
  task.priority = els.editPriority.value;
  task.dueAt = els.editDue.value ? new Date(els.editDue.value).toISOString() : "";
  task.reminderAt = els.editReminder.value ? new Date(els.editReminder.value).toISOString() : "";
  task.checklist = collectChecklistEditor();
  task.updatedAt = nowMs();

  if (task.dueAt !== oldDue || task.reminderAt !== oldReminder) {
    task.notified = {};
  }

  persist();
  render();
  els.dialog.close();
  showToast("Task saved");
}

function deleteEditedTask() {
  const taskId = els.editTaskId.value;
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  persist();
  render();
  els.dialog.close();
  showToast("Task deleted");
}

function addChecklistEditorItem() {
  if (els.editChecklistList.querySelector(".empty-state")) {
    els.editChecklistList.innerHTML = "";
  }

  const row = document.createElement("div");
  row.className = "checklist-row";
  row.dataset.checkId = uid("check");
  row.innerHTML = `
    <input type="checkbox" aria-label="Checklist item complete">
    <input type="text" aria-label="Checklist item text">
    <button class="icon-button" type="button" aria-label="Remove checklist item">x</button>
  `;
  els.editChecklistList.append(row);
  row.querySelector('input[type="text"]').focus();
}

function startTimer(event) {
  event.preventDefault();
  const minutes = Math.max(1, Number(els.timerMinutes.value || 1));
  const label = normalizeText(els.timerLabel.value) || `${minutes} minute timer`;

  state.timers.push({
    id: uid("timer"),
    label,
    endsAt: nowMs() + minutes * 60 * 1000,
    createdAt: nowMs(),
    completedAt: null,
  });

  els.timerLabel.value = "";
  persist();
  render();
}

function stopTimer(timerId) {
  state.timers = state.timers.filter((timer) => timer.id !== timerId);
  persist();
  render();
}

function checkNotifications() {
  const current = nowMs();
  let changed = false;

  state.tasks.forEach((task) => {
    if (task.status === "done") return;
    if (task.reminderAt && !task.notified?.reminder && parseLocalDate(task.reminderAt)?.getTime() <= current) {
      sendAlert("Reminder", task.title, `Reminder hit for ${task.title}`);
      task.notified = { ...task.notified, reminder: true };
      changed = true;
    }

    if (task.dueAt && !task.notified?.due && parseLocalDate(task.dueAt)?.getTime() <= current) {
      sendAlert("Due now", task.title, `${task.title} is due now`);
      task.notified = { ...task.notified, due: true };
      changed = true;
    }
  });

  state.timers.forEach((timer) => {
    if (!timer.completedAt && timer.endsAt <= current) {
      timer.completedAt = current;
      sendAlert("Timer done", timer.label, `${timer.label} finished`);
      changed = true;
    }
  });

  if (changed) {
    persist();
    render();
  } else {
    renderTimers();
  }
}

function sendAlert(title, message, browserMessage) {
  state.alerts.push({
    id: uid("alert"),
    title,
    message,
    createdAt: nowMs(),
  });

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body: browserMessage || message,
      tag: `${title}-${message}`,
      requireInteraction: false,
    });
  }

  showToast(`${title}: ${message}`);
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function truncate(value, length) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

let toastTimer = null;

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 2800);
}

els.taskForm.addEventListener("submit", addTaskFromForm);
els.timerForm.addEventListener("submit", startTimer);

els.board.addEventListener("click", (event) => {
  const card = event.target.closest("[data-task-id]");
  if (card) openTask(card.dataset.taskId);
});

els.dueSoonList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-task-id]");
  if (card) openTask(card.dataset.taskId);
});

els.timerList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-timer-id]");
  if (button) stopTimer(button.dataset.timerId);
});

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderBoard();
});

els.projectFilter.addEventListener("change", (event) => {
  state.project = event.target.value;
  renderBoard();
});

els.dueFilter.addEventListener("change", (event) => {
  state.due = event.target.value;
  renderBoard();
});

els.clearAlerts.addEventListener("click", () => {
  state.alerts = [];
  persist();
  renderAlerts();
});

els.notificationPermission.addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  await Notification.requestPermission();
  renderNotificationButton();
});

els.newTaskButton.addEventListener("click", () => {
  els.taskTitle.focus();
});

els.saveTask.addEventListener("click", saveEditedTask);
els.deleteTask.addEventListener("click", deleteEditedTask);
els.addChecklistItem.addEventListener("click", addChecklistEditorItem);
els.closeDialog.addEventListener("click", () => els.dialog.close());
els.cancelEdit.addEventListener("click", () => els.dialog.close());

els.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEditedTask();
});

els.editChecklistList.addEventListener("click", (event) => {
  const remove = event.target.closest("button");
  if (!remove) return;
  remove.closest(".checklist-row")?.remove();
  if (!els.editChecklistList.querySelector(".checklist-row")) {
    els.editChecklistList.innerHTML = `<p class="empty-state">No checklist items yet.</p>`;
  }
});

els.editChecklistList.addEventListener("change", () => {
  const task = state.tasks.find((item) => item.id === els.editTaskId.value);
  if (!task) return;
  task.checklist = collectChecklistEditor();
  task.updatedAt = nowMs();
  persist();
  render();
});

async function initialize() {
  render();
  await loadRemoteState();
  render();
  window.setInterval(checkNotifications, 1000);
}

initialize();
