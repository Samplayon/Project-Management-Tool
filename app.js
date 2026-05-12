const SYNC_API_URL = "/api/project-data";
const HOME_TODO_ID = "home-todo";
const DEFAULT_HOME_TODO_TITLE = "To-do list";

const DEFAULT_STATUSES = [
  { id: "todo", label: "To do" },
  { id: "active", label: "In progress" },
  { id: "waiting", label: "Waiting" },
  { id: "done", label: "Done" },
];

const TEAM_ONE_ON_ONES = [
  { id: "tyler", name: "Tyler", initials: "T" },
  { id: "johnny-huynh", name: "Johnny Huynh", initials: "JH" },
  { id: "kyle-snider-fst", name: "Kyle Snider-FST", initials: "KS" },
  { id: "luke-stapleton-fst", name: "Luke Stapleton - FST", initials: "LS" },
  { id: "mattie-mcmillan-benton", name: "Mattie Mcmillan Benton", initials: "MB" },
  { id: "michael-rakestraw", name: "Michael Rakestraw", initials: "MR" },
  { id: "mickey-gettemy", name: "Mickey Gettemy", initials: "MG" },
  { id: "sunshine-patterson", name: "Sunshine Patterson", initials: "SP" },
];

const EMPTY_REMOTE_STATE = {
  tasks: [],
  alerts: [],
  timers: [],
  statuses: DEFAULT_STATUSES,
  todoLists: [createDefaultHomeTodo()],
  oneOnOnes: createDefaultOneOnOnes(),
};

const state = {
  tasks: [],
  alerts: [],
  timers: [],
  statuses: createDefaultStatuses(),
  todoLists: [createDefaultHomeTodo()],
  oneOnOnes: createDefaultOneOnOnes(),
  search: "",
  project: "all",
  due: "all",
  sync: {
    ready: false,
    saving: false,
    error: "",
  },
};

const taskDragState = {
  taskId: "",
};

const oneOnOneOpenIds = new Set();
let linkedTodoNotesOpen = false;

const els = {
  board: document.querySelector("#board"),
  summary: document.querySelector("#summary-strip"),
  searchInput: document.querySelector("#search-input"),
  projectFilter: document.querySelector("#project-filter"),
  dueFilter: document.querySelector("#due-filter"),
  addListButton: document.querySelector("#add-list-button"),
  homeTodoTitle: document.querySelector("#home-todo-title"),
  homeTodoNotes: document.querySelector("#home-todo-notes"),
  homeTodoLinkedNotesToggle: document.querySelector("#home-todo-linked-notes-toggle"),
  homeTodoLinkedNotesPanel: document.querySelector("#home-todo-linked-notes-panel"),
  homeTodoChecklistShell: document.querySelector("#home-todo-checklist-shell"),
  homeTodoChecklist: document.querySelector("#home-todo-checklist"),
  homeTodoAddItem: document.querySelector("#home-todo-add-item"),
  homeTodoAddHeader: document.querySelector("#home-todo-add-header"),
  homeTodoModeButtons: [...document.querySelectorAll("[data-todo-mode]")],
  alertList: document.querySelector("#alert-list"),
  clearAlerts: document.querySelector("#clear-alerts"),
  dueSoonList: document.querySelector("#due-soon-list"),
  oneOnOneList: document.querySelector("#one-on-one-list"),
  notificationPermission: document.querySelector("#notification-permission"),
  newTaskButton: document.querySelector("#new-task-button"),
  dialog: document.querySelector("#task-dialog"),
  editForm: document.querySelector("#edit-task-form"),
  dialogMode: document.querySelector("#dialog-mode"),
  dialogTitle: document.querySelector("#dialog-title"),
  editTaskId: document.querySelector("#edit-task-id"),
  editTitle: document.querySelector("#edit-title"),
  editProject: document.querySelector("#edit-project"),
  editNotes: document.querySelector("#edit-notes"),
  editStatus: document.querySelector("#edit-status"),
  editPriority: document.querySelector("#edit-priority"),
  editDue: document.querySelector("#edit-due"),
  editReminder: document.querySelector("#edit-reminder"),
  editLinkedTodo: document.querySelector("#edit-linked-todo"),
  editLinkedTodoNotesWrap: document.querySelector("#edit-linked-todo-notes-wrap"),
  editLinkedTodoNotes: document.querySelector("#edit-linked-todo-notes"),
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

function createDefaultStatuses() {
  return DEFAULT_STATUSES.map((status) => ({ ...status }));
}

function createDefaultHomeTodo() {
  return {
    id: HOME_TODO_ID,
    title: DEFAULT_HOME_TODO_TITLE,
    mode: "notes",
    notes: "",
    items: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function createDefaultOneOnOnes() {
  return TEAM_ONE_ON_ONES.map((person) => ({
    ...person,
    notes: [],
    createdAt: 0,
    updatedAt: 0,
  }));
}

function getTodayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value) {
  const dateKey = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : getTodayDateKey();
}

function parseDateKey(value) {
  const dateKey = normalizeDateKey(value);
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toStatusIdBase(label) {
  return normalizeText(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "list";
}

function createStatusId(label, statuses = state.statuses) {
  const base = toStatusIdBase(label);
  const existingIds = new Set(statuses.map((status) => status.id));
  let id = base;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function statusLabelFromId(statusId) {
  return normalizeText(statusId)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => capitalize(part))
    .join(" ") || "List";
}

function normalizeStatuses(statuses, tasks = []) {
  const source = Array.isArray(statuses) && statuses.length ? statuses : createDefaultStatuses();
  const normalized = [];
  const seenIds = new Set();
  const seenLabels = new Set();

  source.forEach((status, index) => {
    const label = normalizeText(status?.label) || `List ${index + 1}`;
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) return;

    const base = normalizeText(status?.id) || toStatusIdBase(label);
    let id = base;
    let suffix = 2;

    while (seenIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    normalized.push({ id, label });
    seenIds.add(id);
    seenLabels.add(labelKey);
  });

  tasks.forEach((task) => {
    if (!task.status || seenIds.has(task.status)) return;
    normalized.push({
      id: task.status,
      label: statusLabelFromId(task.status),
    });
    seenIds.add(task.status);
  });

  return normalized.length ? normalized : createDefaultStatuses();
}

function getDefaultStatusId() {
  return state.statuses[0]?.id || "todo";
}

function getHomeTodoList() {
  if (!state.todoLists.length) {
    state.todoLists = [createDefaultHomeTodo()];
  }

  return state.todoLists[0];
}

function getTodoListById(todoListId) {
  const id = normalizeText(todoListId);
  if (!id) return null;
  return state.todoLists.find((todoList) => todoList.id === id) || null;
}

function getLinkedTodoList(task) {
  return getTodoListById(task?.linkedTodoListId);
}

function getTasksLinkedToTodoList(todoListId) {
  const id = normalizeText(todoListId);
  if (!id) return [];
  return state.tasks.filter((task) => task.linkedTodoListId === id);
}

function getTodoChecklistRows(todoList) {
  if (!todoList || todoList.mode !== "checklist") return [];
  return todoList.items.filter((item) => normalizeText(item.text));
}

function getTodoChecklistProgress(todoList) {
  const rows = getTodoChecklistRows(todoList).filter((item) => item.type !== "heading");
  const done = rows.filter((item) => item.done).length;
  return {
    total: rows.length,
    done,
  };
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

function formatDateHeader(value) {
  return new Intl.DateTimeFormat([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseDateKey(value));
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDueState(value, isComplete = false) {
  if (!value) return "none";
  const due = parseLocalDate(value);
  if (!due) return "none";
  const current = new Date();
  if (!isComplete && due.getTime() < nowMs()) return "overdue";
  if (isSameDay(due, current)) return "today";
  const weekAhead = nowMs() + 7 * 24 * 60 * 60 * 1000;
  if (due.getTime() <= weekAhead) return "week";
  return "later";
}

function getTaskDueState(task) {
  return getDueState(task.dueAt, task.status === "done");
}

function getStatusById(statusId) {
  return state.statuses.find((status) => status.id === statusId) || null;
}

function getChecklistItemDueState(item) {
  return getDueState(item.dueAt, item.done);
}

function normalizeChecklistItem(item) {
  return {
    id: item?.id || uid("check"),
    text: normalizeText(item?.text),
    done: Boolean(item?.done),
    dueAt: item?.dueAt || "",
    notified: item?.notified && typeof item.notified === "object" ? item.notified : {},
  };
}

function normalizeChecklistGroups(checklist) {
  if (!Array.isArray(checklist)) return [];

  const hasChecklistGroups = checklist.some((item) => Array.isArray(item?.items));
  if (!hasChecklistGroups) {
    const items = checklist.map(normalizeChecklistItem).filter((item) => item.text);
    return items.length ? [{ id: uid("checklist"), title: "Checklist", items }] : [];
  }

  return checklist
    .map((group, index) => {
      const title = normalizeText(group?.title);
      const items = Array.isArray(group?.items)
        ? group.items.map(normalizeChecklistItem).filter((item) => item.text)
        : [];

      if (!title && !items.length) return null;

      return {
        id: group?.id || uid("checklist"),
        title: title || `Checklist ${index + 1}`,
        items,
      };
    })
    .filter(Boolean);
}

function getChecklistProgress(task) {
  const checklists = normalizeChecklistGroups(task.checklist);
  const total = checklists.reduce((sum, checklist) => sum + checklist.items.length, 0);
  const done = checklists.reduce((sum, checklist) => (
    sum + checklist.items.filter((item) => item.done).length
  ), 0);
  const dueDates = checklists.reduce((sum, checklist) => (
    sum + checklist.items.filter((item) => item.dueAt).length
  ), 0);
  return {
    total,
    done,
    dueDates,
    groups: checklists.length,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

function getRecordTimestamp(record) {
  return Number(record?.updatedAt || record?.createdAt || record?.completedAt || record?.endsAt || 0);
}

function dedupeRecordsById(records) {
  const recordsById = new Map();

  records.forEach((record) => {
    const id = normalizeText(record?.id);
    if (!id) return;

    const current = recordsById.get(id);
    if (!current || getRecordTimestamp(record) >= getRecordTimestamp(current)) {
      recordsById.set(id, record);
    }
  });

  return [...recordsById.values()];
}

function normalizeRemoteState(remoteState) {
  const tasks = dedupeRecordsById(Array.isArray(remoteState?.tasks) ? remoteState.tasks.map(normalizeTask) : []);

  return {
    tasks,
    alerts: dedupeRecordsById(Array.isArray(remoteState?.alerts) ? remoteState.alerts.map(normalizeAlert) : []),
    timers: dedupeRecordsById(Array.isArray(remoteState?.timers) ? remoteState.timers.map(normalizeTimer) : []),
    statuses: normalizeStatuses(dedupeRecordsById(remoteState?.statuses || []), tasks),
    todoLists: dedupeRecordsById(normalizeTodoLists(remoteState?.todoLists || remoteState?.todoList)),
    oneOnOnes: normalizeOneOnOnes(remoteState?.oneOnOnes),
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
    linkedTodoListId: normalizeText(task.linkedTodoListId),
    linkedTodoNotes: typeof task.linkedTodoNotes === "string" ? task.linkedTodoNotes : "",
    checklist: normalizeChecklistGroups(task.checklist),
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

function normalizeTodoLists(todoLists) {
  const source = Array.isArray(todoLists) ? todoLists : todoLists ? [todoLists] : [];
  const normalized = source.map(normalizeTodoList).filter(Boolean);
  return normalized.length ? normalized : [createDefaultHomeTodo()];
}

function normalizeTodoList(todoList) {
  if (!todoList || typeof todoList !== "object") return null;
  const createdAt = Number(todoList.createdAt) || nowMs();

  return {
    id: todoList.id || HOME_TODO_ID,
    title: normalizeText(todoList.title) || DEFAULT_HOME_TODO_TITLE,
    mode: todoList.mode === "checklist" ? "checklist" : "notes",
    notes: typeof todoList.notes === "string" ? todoList.notes : "",
    items: Array.isArray(todoList.items) ? todoList.items.map(normalizeTodoItem) : [],
    createdAt,
    updatedAt: Number(todoList.updatedAt) || createdAt,
  };
}

function normalizeTodoItem(item) {
  const type = item?.type === "heading" ? "heading" : "item";

  return {
    id: item?.id || uid("todo-item"),
    type,
    text: typeof item?.text === "string" ? item.text : "",
    done: type === "item" ? Boolean(item?.done) : false,
  };
}

function normalizeOneOnOnes(oneOnOnes) {
  const defaults = createDefaultOneOnOnes();
  const peopleById = new Map(defaults.map((person) => [person.id, person]));

  if (Array.isArray(oneOnOnes)) {
    oneOnOnes.forEach((person) => {
      const normalized = normalizeOneOnOne(person);
      if (!normalized) return;
      peopleById.set(normalized.id, {
        ...peopleById.get(normalized.id),
        ...normalized,
      });
    });
  }

  return [
    ...defaults.map((person) => peopleById.get(person.id)),
    ...[...peopleById.values()].filter((person) => !TEAM_ONE_ON_ONES.some((teamPerson) => teamPerson.id === person.id)),
  ];
}

function normalizeOneOnOne(person) {
  if (!person || typeof person !== "object") return null;
  const id = normalizeText(person.id);
  if (!id) return null;
  const teamPerson = TEAM_ONE_ON_ONES.find((item) => item.id === id);
  const createdAt = Number(person.createdAt) || nowMs();

  return {
    id,
    name: normalizeText(person.name) || teamPerson?.name || statusLabelFromId(id),
    initials: normalizeText(person.initials) || teamPerson?.initials || getInitials(person.name || id),
    notes: Array.isArray(person.notes) ? person.notes.map(normalizeOneOnOneNote).filter(Boolean) : [],
    createdAt,
    updatedAt: Number(person.updatedAt) || createdAt,
  };
}

function normalizeOneOnOneNote(note) {
  if (!note || typeof note !== "object") return null;
  const createdAt = Number(note.createdAt) || nowMs();

  return {
    id: note.id || uid("one-on-one-note"),
    date: normalizeDateKey(note.date),
    text: typeof note.text === "string" ? note.text : "",
    createdAt,
    updatedAt: Number(note.updatedAt) || createdAt,
  };
}

function getInitials(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "1:1";
}

function getPersistableState() {
  return {
    tasks: state.tasks,
    alerts: state.alerts,
    timers: state.timers,
    statuses: state.statuses,
    todoLists: state.todoLists,
    oneOnOnes: state.oneOnOnes,
  };
}

function applySavedState(savedState) {
  state.tasks = savedState.tasks;
  state.alerts = savedState.alerts;
  state.timers = savedState.timers;
  state.statuses = savedState.statuses;
  state.todoLists = savedState.todoLists;
  state.oneOnOnes = savedState.oneOnOnes;
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
    applySavedState(remoteState);
  } catch (error) {
    state.sync.error = error.message;
    showToast(`CSV load failed: ${error.message}`);
  } finally {
    state.sync.ready = true;
    renderSyncStatus();
  }
}

let pendingSaveCount = 0;
let saveQueue = Promise.resolve();
let saveVersion = 0;
let homeTodoSaveTimer = null;
let oneOnOneSaveTimer = null;

function persist() {
  const snapshot = getPersistableState();
  const currentSaveVersion = saveVersion + 1;
  saveVersion = currentSaveVersion;
  pendingSaveCount += 1;
  state.sync.saving = true;
  renderSyncStatus();

  saveQueue = saveQueue
    .catch(() => {})
    .then(() => requestJson(SYNC_API_URL, {
      method: "POST",
      body: JSON.stringify({ state: snapshot }),
    }))
    .then((response) => {
      if (currentSaveVersion === saveVersion && response.state) {
        applySavedState(normalizeRemoteState(response.state));
      }
      state.sync.error = "";
      return true;
    })
    .catch((error) => {
      state.sync.error = error.message;
      showToast(`CSV save failed: ${error.message}`);
      return false;
    })
    .finally(() => {
      pendingSaveCount = Math.max(0, pendingSaveCount - 1);
      state.sync.saving = pendingSaveCount > 0;
      renderSyncStatus();
    });

  return saveQueue;
}

function scheduleHomeTodoPersist() {
  window.clearTimeout(homeTodoSaveTimer);
  homeTodoSaveTimer = window.setTimeout(() => {
    homeTodoSaveTimer = null;
    persist();
  }, 450);
}

function scheduleOneOnOnePersist() {
  window.clearTimeout(oneOnOneSaveTimer);
  oneOnOneSaveTimer = window.setTimeout(() => {
    oneOnOneSaveTimer = null;
    persist();
  }, 450);
}

function matchesFilters(task) {
  const query = state.search.toLowerCase();
  const checklistText = normalizeChecklistGroups(task.checklist)
    .map((checklist) => checklist.items.map((item) => (
      `${checklist.title} ${item.text} ${formatDateTime(item.dueAt)}`
    )).join(" "))
    .join(" ");
  const linkedTodo = getLinkedTodoList(task);
  const linkedTodoText = linkedTodo
    ? `${linkedTodo.title} ${task.linkedTodoNotes} ${getTodoChecklistRows(linkedTodo).map((item) => item.text).join(" ")}`
    : "";
  const haystack = `${task.title} ${task.project} ${task.notes} ${checklistText} ${linkedTodoText}`.toLowerCase();
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
  renderStatusControls();
  renderHomeTodo();
  renderProjectFilter();
  renderSummary();
  renderBoard();
  renderAlerts();
  renderDueSoon();
  renderOneOnOnes();
  renderNotificationButton();
  renderSyncStatus();
}

function renderSyncStatus() {
  if (!els.syncStatus) return;

  els.syncStatus.classList.toggle("error", Boolean(state.sync.error));
  els.syncStatus.classList.toggle("saving", state.sync.saving);

  if (state.sync.error) {
    els.syncStatus.textContent = `Project CSV unavailable: ${state.sync.error}`;
  } else if (state.sync.saving) {
    els.syncStatus.textContent = "Saving to CSV...";
  } else if (state.sync.ready) {
    els.syncStatus.textContent = "Saved to CSV";
  } else {
    els.syncStatus.textContent = "Loading project CSV...";
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

function renderStatusControls() {
  const editStatus = getStatusById(els.editStatus.value) ? els.editStatus.value : getDefaultStatusId();

  renderStatusOptions(els.editStatus, editStatus);
}

function renderStatusOptions(select, selectedStatusId) {
  if (!select) return;

  select.innerHTML = state.statuses.map((status) => (
    `<option value="${escapeAttr(status.id)}">${escapeHtml(status.label)}</option>`
  )).join("");
  select.value = getStatusById(selectedStatusId) ? selectedStatusId : getDefaultStatusId();
}

function renderHomeTodo() {
  const todoList = getHomeTodoList();
  const isChecklistMode = todoList.mode === "checklist";

  if (document.activeElement !== els.homeTodoTitle) {
    els.homeTodoTitle.value = todoList.title;
  }

  if (document.activeElement !== els.homeTodoNotes) {
    els.homeTodoNotes.value = todoList.notes;
  }

  els.homeTodoModeButtons.forEach((button) => {
    const isActive = button.dataset.todoMode === todoList.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  els.homeTodoNotes.hidden = isChecklistMode;
  els.homeTodoChecklistShell.hidden = !isChecklistMode;
  els.homeTodoChecklist.innerHTML = todoList.items.length
    ? todoList.items.map(renderHomeTodoItem).join("")
    : `<p class="empty-state">No checklist rows yet.</p>`;
  renderHomeTodoLinkedNotes(todoList);
}

function renderHomeTodoItem(item) {
  if (item.type === "heading") {
    return `
      <div class="home-todo-entry home-todo-subheader" data-todo-item-id="${escapeAttr(item.id)}">
        <input class="home-todo-entry-text home-todo-subheader-text" type="text" value="${escapeAttr(item.text)}" aria-label="To-do sub-header text">
        <button class="icon-button" type="button" data-todo-action="remove-item" aria-label="Remove to-do sub-header">x</button>
      </div>
    `;
  }

  return `
    <div class="home-todo-entry home-todo-item ${item.done ? "done" : ""}" data-todo-item-id="${escapeAttr(item.id)}">
      <input type="checkbox" ${item.done ? "checked" : ""} aria-label="To-do item complete">
      <input class="home-todo-entry-text home-todo-item-text" type="text" value="${escapeAttr(item.text)}" aria-label="To-do item text">
      <button class="icon-button" type="button" data-todo-action="remove-item" aria-label="Remove to-do item">x</button>
    </div>
  `;
}

function renderHomeTodoLinkedNotes(todoList = getHomeTodoList()) {
  const linkedTasks = getTasksLinkedToTodoList(todoList.id);
  const hasLinkedTasks = linkedTasks.length > 0;

  els.homeTodoLinkedNotesToggle.hidden = !hasLinkedTasks;
  els.homeTodoLinkedNotesToggle.classList.toggle("is-active", hasLinkedTasks && linkedTodoNotesOpen);
  els.homeTodoLinkedNotesToggle.setAttribute("aria-expanded", String(hasLinkedTasks && linkedTodoNotesOpen));

  if (!hasLinkedTasks) {
    linkedTodoNotesOpen = false;
    els.homeTodoLinkedNotesPanel.hidden = true;
    els.homeTodoLinkedNotesPanel.innerHTML = "";
    return;
  }

  els.homeTodoLinkedNotesPanel.hidden = !linkedTodoNotesOpen;
  if (!linkedTodoNotesOpen) {
    els.homeTodoLinkedNotesPanel.innerHTML = "";
    return;
  }

  els.homeTodoLinkedNotesPanel.innerHTML = linkedTasks.map(renderHomeTodoLinkedNote).join("");
}

function renderHomeTodoLinkedNote(task) {
  return `
    <label class="home-todo-linked-note" data-linked-task-id="${escapeAttr(task.id)}">
      <span>${escapeHtml(task.title || "Untitled card")}</span>
      <textarea class="home-todo-linked-note-input" rows="3" aria-label="Linked card note for ${escapeAttr(task.title || "Untitled card")}">${escapeHtml(task.linkedTodoNotes)}</textarea>
    </label>
  `;
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
  els.board.style.setProperty("--board-column-count", state.statuses.length);
  els.board.innerHTML = state.statuses.map((status) => {
    const tasks = visible.filter((task) => task.status === status.id);
    return `
      <section class="board-column" aria-label="${escapeAttr(status.label)} tasks" data-status-id="${escapeAttr(status.id)}">
        <div class="column-header">
          <h2 class="column-title">${escapeHtml(status.label)}</h2>
          <div class="column-header-actions">
            <span class="column-count">${tasks.length}</span>
            <button class="icon-button column-delete-button" type="button" data-status-action="delete" data-status-id="${escapeAttr(status.id)}" aria-label="Delete ${escapeAttr(status.label)} list">x</button>
          </div>
        </div>
        <div class="task-list" data-status-id="${escapeAttr(status.id)}">
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
  const linkedTodo = renderLinkedTodoCard(task);
  const checklistLabel = progress.total
    ? `${progress.done}/${progress.total} items`
    : `${progress.groups} checklist${progress.groups === 1 ? "" : "s"}`;
  const checklist = progress.groups ? `
    <div>
      <div class="checklist-preview">
        <span class="pill">${escapeHtml(checklistLabel)}</span>
        ${progress.groups > 1 && progress.total ? `<span class="pill">${progress.groups} checklists</span>` : ""}
        ${progress.dueDates ? `<span class="pill">${progress.dueDates} item due date${progress.dueDates === 1 ? "" : "s"}</span>` : ""}
      </div>
      ${progress.total ? `<div class="progress-bar" aria-label="Checklist progress">
        <div class="progress-fill" style="width: ${progress.percent}%"></div>
      </div>` : ""}
    </div>
  ` : "";

  return `
    <button class="task-card ${task.status === "done" ? "done" : ""}" type="button" draggable="true" data-task-id="${escapeAttr(task.id)}" data-status-id="${escapeAttr(task.status)}">
      <div class="task-card-meta">${projectPill}${priorityPill}</div>
      <h3 class="task-card-title">${escapeHtml(task.title)}</h3>
      ${notes}
      ${linkedTodo}
      ${checklist}
      <div class="task-card-footer">${duePill}${reminderPill}</div>
    </button>
  `;
}

function renderLinkedTodoCard(task) {
  const todoList = getLinkedTodoList(task);
  if (!todoList) return "";

  const rows = getTodoChecklistRows(todoList);
  const progress = getTodoChecklistProgress(todoList);
  const progressPill = progress.total
    ? `<span class="pill">${progress.done}/${progress.total} linked items</span>`
    : `<span class="pill">Linked checklist</span>`;
  const linkedNotes = task.linkedTodoNotes
    ? `<p class="task-card-linked-note">${escapeHtml(truncate(task.linkedTodoNotes, 180))}</p>`
    : "";
  const rowMarkup = rows.length
    ? `<div class="linked-todo-card-list">${rows.map(renderLinkedTodoCardRow).join("")}</div>`
    : `<p class="task-card-linked-empty">No checklist rows yet.</p>`;

  return `
    <section class="task-card-linked-todo" aria-label="Linked to-do checklist">
      <div class="checklist-preview">
        <span class="pill">${escapeHtml(todoList.title)}</span>
        ${progressPill}
      </div>
      ${linkedNotes}
      ${rowMarkup}
    </section>
  `;
}

function renderLinkedTodoCardRow(item) {
  if (item.type === "heading") {
    return `<div class="linked-todo-card-heading">${escapeHtml(item.text)}</div>`;
  }

  return `
    <div class="linked-todo-card-row ${item.done ? "done" : ""}">
      <span>${item.done ? "[x]" : "[ ]"}</span>
      <span>${escapeHtml(item.text)}</span>
    </div>
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
  const taskEntries = state.tasks
    .filter((task) => task.status !== "done" && task.dueAt)
    .map((task) => ({
      id: task.id,
      title: task.title,
      subtitle: task.project || "No project",
      dueAt: task.dueAt,
      dueState: getTaskDueState(task),
    }));
  const checklistEntries = state.tasks.flatMap((task) => normalizeChecklistGroups(task.checklist)
    .flatMap((checklist) => checklist.items
      .filter((item) => !item.done && item.dueAt)
      .map((item) => ({
        id: task.id,
        title: item.text,
        subtitle: `${task.title} / ${checklist.title}`,
        dueAt: item.dueAt,
        dueState: getChecklistItemDueState(item),
      }))));
  const upcoming = [...taskEntries, ...checklistEntries]
    .sort((a, b) => parseLocalDate(a.dueAt).getTime() - parseLocalDate(b.dueAt).getTime())
    .slice(0, 8);

  els.dueSoonList.innerHTML = upcoming.length ? upcoming.map((entry) => `
    <button class="due-item" type="button" data-task-id="${escapeAttr(entry.id)}">
      <span>
        <strong>${escapeHtml(entry.title)}</strong>
        <span>${escapeHtml(entry.subtitle)}</span>
        <span class="due-time">${escapeHtml(formatDateTime(entry.dueAt))}</span>
      </span>
      <span class="pill ${entry.dueState}">${entry.dueState === "overdue" ? "Overdue" : "Due"}</span>
    </button>
  `).join("") : `<p class="empty-state">Nothing scheduled.</p>`;
}

function renderOneOnOnes() {
  if (!els.oneOnOneList) return;

  els.oneOnOneList.innerHTML = state.oneOnOnes.map(renderOneOnOneCard).join("");
}

function renderOneOnOneCard(person) {
  const noteGroups = groupOneOnOneNotes(person.notes);
  const noteMarkup = noteGroups.length
    ? noteGroups.map(([date, notes]) => renderOneOnOneDateGroup(date, notes)).join("")
    : `<p class="empty-state">No notes yet.</p>`;

  return `
    <details class="one-on-one-card" data-one-on-one-id="${escapeAttr(person.id)}" ${oneOnOneOpenIds.has(person.id) ? "open" : ""}>
      <summary class="one-on-one-card-header">
        <strong>${escapeHtml(person.name)}</strong>
      </summary>
      <div class="one-on-one-card-body">
        <div class="one-on-one-note-composer">
          <label>
            Date
            <input class="one-on-one-date" type="date" value="${escapeAttr(getTodayDateKey())}">
          </label>
          <label>
            Note
            <textarea class="one-on-one-draft" rows="3"></textarea>
          </label>
          <button class="secondary-button one-on-one-add-note" type="button" data-one-on-one-action="add-note">Add note</button>
        </div>
        <div class="one-on-one-notes">
          ${noteMarkup}
        </div>
      </div>
    </details>
  `;
}

function groupOneOnOneNotes(notes) {
  const groups = new Map();

  [...notes]
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      return dateCompare || b.createdAt - a.createdAt;
    })
    .forEach((note) => {
      if (!groups.has(note.date)) groups.set(note.date, []);
      groups.get(note.date).push(note);
    });

  return [...groups.entries()];
}

function renderOneOnOneDateGroup(date, notes) {
  return `
    <section class="one-on-one-date-group">
      <h3>${escapeHtml(formatDateHeader(date))}</h3>
      <div class="one-on-one-note-list">
        ${notes.map(renderOneOnOneNote).join("")}
      </div>
    </section>
  `;
}

function renderOneOnOneNote(note) {
  return `
    <div class="one-on-one-note" data-one-on-one-note-id="${escapeAttr(note.id)}">
      <textarea class="one-on-one-note-text" rows="3" aria-label="Edit 1:1 note">${escapeHtml(note.text)}</textarea>
      <button class="icon-button" type="button" data-one-on-one-action="delete-note" aria-label="Delete 1:1 note">x</button>
    </div>
  `;
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

function openNewTask() {
  els.editForm.reset();
  els.editTaskId.value = "";
  els.dialogMode.textContent = "New task";
  els.dialogTitle.textContent = "New task";
  els.editStatus.value = getDefaultStatusId();
  els.editPriority.value = "normal";
  els.deleteTask.hidden = true;
  els.saveTask.textContent = "Add task";
  renderLinkedTodoEditor();
  renderChecklistEditor({ checklist: [] });
  els.dialog.showModal();
  els.editTitle.focus();
}

function openTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  els.editTaskId.value = task.id;
  els.dialogMode.textContent = "Edit task";
  els.dialogTitle.textContent = task.title;
  els.editTitle.value = task.title;
  els.editProject.value = task.project || "";
  els.editNotes.value = task.notes || "";
  els.editStatus.value = task.status;
  els.editPriority.value = task.priority;
  els.editDue.value = toLocalInputValue(task.dueAt);
  els.editReminder.value = toLocalInputValue(task.reminderAt);
  els.deleteTask.hidden = false;
  els.saveTask.textContent = "Save";
  renderLinkedTodoEditor(task);
  renderChecklistEditor(task);
  els.dialog.showModal();
}

function renderLinkedTodoEditor(task = {}) {
  const currentId = normalizeText(task.linkedTodoListId);
  const options = [
    `<option value="">No linked to-do checklist</option>`,
    ...state.todoLists.map((todoList) => {
      const modeLabel = todoList.mode === "checklist" ? "" : " (free type)";
      return `<option value="${escapeAttr(todoList.id)}">${escapeHtml(todoList.title)}${modeLabel}</option>`;
    }),
  ];

  els.editLinkedTodo.innerHTML = options.join("");
  els.editLinkedTodo.value = getTodoListById(currentId) ? currentId : "";
  els.editLinkedTodoNotes.value = task.linkedTodoNotes || "";
  renderLinkedTodoNotesField();
}

function renderLinkedTodoNotesField() {
  const isLinked = Boolean(els.editLinkedTodo.value);
  els.editLinkedTodoNotesWrap.hidden = !isLinked;
  if (!isLinked) {
    els.editLinkedTodoNotes.value = "";
  }
}

function collectLinkedTodoFields() {
  const linkedTodoListId = normalizeText(els.editLinkedTodo.value);
  return {
    linkedTodoListId,
    linkedTodoNotes: linkedTodoListId ? normalizeText(els.editLinkedTodoNotes.value) : "",
  };
}

function renderChecklistEditor(task) {
  const checklists = normalizeChecklistGroups(task.checklist);
  els.editChecklistList.innerHTML = checklists.length
    ? checklists.map(renderChecklistGroupEditor).join("")
    : `<p class="empty-state">No checklists yet.</p>`;
}

function renderChecklistGroupEditor(checklist) {
  const items = checklist.items.length
    ? checklist.items.map(renderChecklistItemEditor).join("")
    : `<p class="empty-state checklist-empty">No items yet.</p>`;

  return `
    <section class="checklist-group" data-checklist-id="${escapeAttr(checklist.id)}">
      <div class="checklist-group-heading">
        <label class="checklist-title-label">
          <span>Checklist title</span>
          <input class="checklist-title-input" type="text" value="${escapeAttr(checklist.title)}" aria-label="Checklist title">
        </label>
        <div class="checklist-group-actions">
          <button class="ghost-button" type="button" data-checklist-action="add-item">Add item</button>
          <button class="icon-button" type="button" data-checklist-action="remove-list" aria-label="Remove checklist">x</button>
        </div>
      </div>
      <div class="checklist-items">
        ${items}
      </div>
    </section>
  `;
}

function renderChecklistItemEditor(item) {
  return `
    <div class="checklist-row" data-check-id="${escapeAttr(item.id)}">
      <input type="checkbox" ${item.done ? "checked" : ""} aria-label="Checklist item complete">
      <div class="checklist-row-body">
        <input type="text" value="${escapeAttr(item.text)}" aria-label="Checklist item text">
        <label class="checklist-due-label">
          <span>Due</span>
          <input class="checklist-due-input" type="datetime-local" value="${escapeAttr(toLocalInputValue(item.dueAt))}">
        </label>
      </div>
      <button class="icon-button" type="button" data-checklist-action="remove-item" aria-label="Remove checklist item">x</button>
    </div>
  `;
}

function findExistingChecklistItem(taskId, checkId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !checkId) return null;

  for (const checklist of normalizeChecklistGroups(task.checklist)) {
    const existing = checklist.items.find((item) => item.id === checkId);
    if (existing) return existing;
  }

  return null;
}

function collectChecklistEditor() {
  return [...els.editChecklistList.querySelectorAll(".checklist-group")]
    .map((group, index) => {
      const title = normalizeText(group.querySelector(".checklist-title-input")?.value);
      const items = [...group.querySelectorAll(".checklist-row")].map((row) => {
        const id = row.dataset.checkId || uid("check");
        const dueInputValue = row.querySelector(".checklist-due-input")?.value || "";
        const dueAt = dueInputValue ? new Date(dueInputValue).toISOString() : "";
        const existing = findExistingChecklistItem(els.editTaskId.value, id);
        const notified = existing?.dueAt === dueAt
          ? existing.notified
          : {};

        return {
          id,
          done: row.querySelector('input[type="checkbox"]').checked,
          text: normalizeText(row.querySelector('input[type="text"]').value),
          dueAt,
          notified,
        };
      }).filter((item) => item.text);

      if (!title && !items.length) return null;

      return {
        id: group.dataset.checklistId || uid("checklist"),
        title: title || `Checklist ${index + 1}`,
        items,
      };
    })
    .filter(Boolean);
}

async function saveEditedTask() {
  if (!els.editForm.reportValidity()) return;

  const title = normalizeText(els.editTitle.value);
  if (!title) {
    els.editTitle.focus();
    showToast("Task name is required");
    return;
  }

  const task = state.tasks.find((item) => item.id === els.editTaskId.value);
  const linkedTodoFields = collectLinkedTodoFields();
  if (!task) {
    const timestamp = nowMs();
    const newTask = {
      id: uid("task"),
      title,
      project: normalizeText(els.editProject.value),
      notes: normalizeText(els.editNotes.value),
      status: els.editStatus.value,
      priority: els.editPriority.value,
      dueAt: els.editDue.value ? new Date(els.editDue.value).toISOString() : "",
      reminderAt: els.editReminder.value ? new Date(els.editReminder.value).toISOString() : "",
      ...linkedTodoFields,
      checklist: collectChecklistEditor(),
      createdAt: timestamp,
      updatedAt: timestamp,
      notified: {},
    };

    state.tasks.unshift(newTask);
    const saved = await persist();
    if (!saved) {
      state.tasks = state.tasks.filter((item) => item.id !== newTask.id);
      return;
    }
    render();
    els.dialog.close();
    showToast("Task added");
    return;
  }

  const previousTask = JSON.parse(JSON.stringify(task));
  const oldDue = task.dueAt;
  const oldReminder = task.reminderAt;

  task.title = title;
  task.project = normalizeText(els.editProject.value);
  task.notes = normalizeText(els.editNotes.value);
  task.status = els.editStatus.value;
  task.priority = els.editPriority.value;
  task.dueAt = els.editDue.value ? new Date(els.editDue.value).toISOString() : "";
  task.reminderAt = els.editReminder.value ? new Date(els.editReminder.value).toISOString() : "";
  task.linkedTodoListId = linkedTodoFields.linkedTodoListId;
  task.linkedTodoNotes = linkedTodoFields.linkedTodoNotes;
  task.checklist = collectChecklistEditor();
  task.updatedAt = nowMs();

  if (task.dueAt !== oldDue || task.reminderAt !== oldReminder) {
    task.notified = {};
  }

  const saved = await persist();
  if (!saved) {
    Object.assign(task, previousTask);
    return;
  }
  render();
  els.dialog.close();
  showToast("Task saved");
}

async function deleteEditedTask() {
  const taskId = els.editTaskId.value;
  const previousTasks = state.tasks;
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  const saved = await persist();
  if (!saved) {
    state.tasks = previousTasks;
    return;
  }
  render();
  els.dialog.close();
  showToast("Task deleted");
}

function addChecklistEditorGroup() {
  if (!els.editChecklistList.querySelector(".checklist-group")) {
    els.editChecklistList.innerHTML = "";
  }

  const checklistCount = els.editChecklistList.querySelectorAll(".checklist-group").length;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderChecklistGroupEditor({
    id: uid("checklist"),
    title: `Checklist ${checklistCount + 1}`,
    items: [],
  });
  const group = wrapper.firstElementChild;
  els.editChecklistList.append(group);
  group.querySelector(".checklist-title-input").focus();
  persistChecklistEditor();
}

function addChecklistItemToGroup(group) {
  const list = group.querySelector(".checklist-items");
  if (list.querySelector(".empty-state")) {
    list.innerHTML = "";
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderChecklistItemEditor({ id: uid("check"), text: "", done: false });
  const row = wrapper.firstElementChild;
  list.append(row);
  row.querySelector('input[type="text"]').focus();
}

function persistChecklistEditor() {
  const task = state.tasks.find((item) => item.id === els.editTaskId.value);
  if (!task) return;
  task.checklist = collectChecklistEditor();
  task.updatedAt = nowMs();
  persist();
  render();
}

function checkNotifications() {
  const current = nowMs();
  let changed = false;

  state.tasks.forEach((task) => {
    if (task.status === "done") return;
    task.checklist = normalizeChecklistGroups(task.checklist);

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

    task.checklist.forEach((checklist) => {
      checklist.items.forEach((item) => {
        if (item.done) return;
        const itemLabel = `${task.title}: ${item.text}`;

        if (item.dueAt && !item.notified?.due && parseLocalDate(item.dueAt)?.getTime() <= current) {
          sendAlert("Checklist item due", itemLabel, `${itemLabel} is due now`);
          item.notified = { ...item.notified, due: true };
          changed = true;
        }
      });
    });
  });

  if (changed) {
    persist();
    render();
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

function getDropColumn(event) {
  return event.target.closest(".board-column[data-status-id]");
}

function clearDragTargets() {
  els.board.querySelectorAll(".board-column.drag-over").forEach((column) => {
    column.classList.remove("drag-over");
  });
}

function moveTaskToStatus(taskId, statusId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const status = getStatusById(statusId);
  if (!task || !status) return;

  clearDragTargets();

  if (task.status === status.id) return;

  task.status = status.id;
  task.updatedAt = nowMs();
  persist();
  render();
  showToast(`Moved to ${status.label}`);
}

function addStatus() {
  const label = normalizeText(window.prompt("Name the new list"));
  if (!label) return;

  const duplicate = state.statuses.some((status) => status.label.toLowerCase() === label.toLowerCase());
  if (duplicate) {
    showToast("That list already exists");
    return;
  }

  const status = {
    id: createStatusId(label),
    label,
  };

  state.statuses.push(status);
  persist();
  render();
  showToast(`${status.label} list added`);
}

function deleteStatus(statusId) {
  const status = getStatusById(statusId);
  if (!status) return;

  if (state.statuses.length <= 1) {
    showToast("Keep at least one list on the board");
    return;
  }

  const tasksInStatus = state.tasks.filter((task) => task.status === status.id);
  const remainingStatuses = state.statuses.filter((item) => item.id !== status.id);
  const fallbackStatus = remainingStatuses[0];
  const taskMessage = tasksInStatus.length
    ? ` ${tasksInStatus.length} task${tasksInStatus.length === 1 ? "" : "s"} will move to ${fallbackStatus.label}.`
    : "";

  if (!window.confirm(`Delete the ${status.label} list?${taskMessage}`)) return;

  state.statuses = remainingStatuses;
  state.tasks = state.tasks.map((task) => {
    if (task.status !== status.id) return task;
    return {
      ...task,
      status: fallbackStatus.id,
      updatedAt: nowMs(),
    };
  });

  persist();
  render();
  showToast(`${status.label} list deleted`);
}

function updateHomeTodo(updates, shouldRender = false, saveImmediately = false) {
  const todoList = getHomeTodoList();
  const currentTime = nowMs();

  Object.assign(todoList, updates, {
    createdAt: todoList.createdAt || currentTime,
    updatedAt: currentTime,
  });

  if (saveImmediately) {
    window.clearTimeout(homeTodoSaveTimer);
    homeTodoSaveTimer = null;
    persist();
  } else {
    scheduleHomeTodoPersist();
  }

  if (shouldRender) {
    renderHomeTodo();
  }

  if (getTasksLinkedToTodoList(todoList.id).length) {
    renderBoard();
  }
}

function updateHomeTodoItem(itemId, updates, shouldRender = false, saveImmediately = false) {
  const todoList = getHomeTodoList();
  const items = todoList.items.map((item) => (
    item.id === itemId ? { ...item, ...updates } : item
  ));

  updateHomeTodo({ items }, shouldRender, saveImmediately);
}

function addHomeTodoItem(type = "item") {
  const todoList = getHomeTodoList();
  const isHeading = type === "heading";
  const item = {
    id: uid("todo-item"),
    type: isHeading ? "heading" : "item",
    text: "",
    done: false,
  };

  updateHomeTodo({ items: [...todoList.items, item] }, true, true);
  els.homeTodoChecklist.querySelector(".home-todo-entry:last-child .home-todo-entry-text")?.focus();
}

function addHomeTodoHeader() {
  addHomeTodoItem("heading");
}

function removeHomeTodoItem(itemId) {
  const todoList = getHomeTodoList();
  updateHomeTodo({
    items: todoList.items.filter((item) => item.id !== itemId),
  }, true, true);
}

function updateLinkedTodoNotes(taskId, notes) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  task.linkedTodoNotes = notes;
  task.updatedAt = nowMs();
  scheduleHomeTodoPersist();
  renderBoard();
}

function getOneOnOne(personId) {
  return state.oneOnOnes.find((person) => person.id === personId) || null;
}

function getOneOnOneNote(person, noteId) {
  return person?.notes.find((note) => note.id === noteId) || null;
}

function addOneOnOneNote(card) {
  const person = getOneOnOne(card?.dataset.oneOnOneId);
  if (!person) return;

  const draftInput = card.querySelector(".one-on-one-draft");
  const dateInput = card.querySelector(".one-on-one-date");
  const text = normalizeText(draftInput?.value);

  if (!text) {
    draftInput?.focus();
    showToast("Add a note first");
    return;
  }

  const timestamp = nowMs();
  person.notes.unshift({
    id: uid("one-on-one-note"),
    date: normalizeDateKey(dateInput?.value),
    text,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  person.updatedAt = timestamp;

  oneOnOneOpenIds.add(person.id);
  renderOneOnOnes();
  persist();
  showToast("1:1 note added");
}

function updateOneOnOneNote(card, noteTextArea) {
  const person = getOneOnOne(card?.dataset.oneOnOneId);
  const note = getOneOnOneNote(person, noteTextArea.closest("[data-one-on-one-note-id]")?.dataset.oneOnOneNoteId);
  if (!person || !note) return;

  const timestamp = nowMs();
  note.text = noteTextArea.value;
  note.updatedAt = timestamp;
  person.updatedAt = timestamp;
  scheduleOneOnOnePersist();
}

function deleteOneOnOneNote(card, noteId) {
  const person = getOneOnOne(card?.dataset.oneOnOneId);
  if (!person || !noteId) return;

  person.notes = person.notes.filter((note) => note.id !== noteId);
  person.updatedAt = nowMs();
  oneOnOneOpenIds.add(person.id);
  renderOneOnOnes();
  persist();
  showToast("1:1 note deleted");
}

els.board.addEventListener("click", (event) => {
  const statusAction = event.target.closest("[data-status-action]");
  if (statusAction) {
    event.preventDefault();
    deleteStatus(statusAction.dataset.statusId);
    return;
  }

  const card = event.target.closest("[data-task-id]");
  if (card) openTask(card.dataset.taskId);
});

els.board.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".task-card[data-task-id]");
  if (!card) return;

  taskDragState.taskId = card.dataset.taskId;
  card.classList.add("dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskDragState.taskId);
  }
});

els.board.addEventListener("dragover", (event) => {
  const column = getDropColumn(event);
  if (!taskDragState.taskId || !column) return;

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }

  clearDragTargets();
  column.classList.add("drag-over");
});

els.board.addEventListener("dragleave", (event) => {
  const column = getDropColumn(event);
  if (!column || column.contains(event.relatedTarget)) return;
  column.classList.remove("drag-over");
});

els.board.addEventListener("drop", (event) => {
  const column = getDropColumn(event);
  if (!column) return;

  event.preventDefault();
  const taskId = event.dataTransfer?.getData("text/plain") || taskDragState.taskId;
  moveTaskToStatus(taskId, column.dataset.statusId);
});

els.board.addEventListener("dragend", (event) => {
  event.target.closest(".task-card")?.classList.remove("dragging");
  taskDragState.taskId = "";
  clearDragTargets();
});

els.dueSoonList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-task-id]");
  if (card) openTask(card.dataset.taskId);
});

els.oneOnOneList.addEventListener("toggle", (event) => {
  const card = event.target.closest("details[data-one-on-one-id]");
  if (!card || event.target !== card) return;

  if (card.open) {
    oneOnOneOpenIds.add(card.dataset.oneOnOneId);
  } else {
    oneOnOneOpenIds.delete(card.dataset.oneOnOneId);
  }
}, true);

els.oneOnOneList.addEventListener("click", (event) => {
  const action = event.target.closest("[data-one-on-one-action]");
  if (!action) return;

  const card = action.closest("[data-one-on-one-id]");
  if (action.dataset.oneOnOneAction === "add-note") {
    addOneOnOneNote(card);
    return;
  }

  if (action.dataset.oneOnOneAction === "delete-note") {
    const note = action.closest("[data-one-on-one-note-id]");
    deleteOneOnOneNote(card, note?.dataset.oneOnOneNoteId);
  }
});

els.oneOnOneList.addEventListener("input", (event) => {
  if (!event.target.classList.contains("one-on-one-note-text")) return;
  updateOneOnOneNote(event.target.closest("[data-one-on-one-id]"), event.target);
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

els.addListButton.addEventListener("click", addStatus);

els.homeTodoTitle.addEventListener("input", (event) => {
  updateHomeTodo({ title: event.target.value || DEFAULT_HOME_TODO_TITLE });
});

els.homeTodoNotes.addEventListener("input", (event) => {
  updateHomeTodo({ notes: event.target.value });
});

els.homeTodoLinkedNotesToggle.addEventListener("click", () => {
  linkedTodoNotesOpen = !linkedTodoNotesOpen;
  renderHomeTodoLinkedNotes();
  if (linkedTodoNotesOpen) {
    els.homeTodoLinkedNotesPanel.querySelector("textarea")?.focus();
  }
});

els.homeTodoLinkedNotesPanel.addEventListener("input", (event) => {
  if (!event.target.classList.contains("home-todo-linked-note-input")) return;
  const note = event.target.closest("[data-linked-task-id]");
  updateLinkedTodoNotes(note?.dataset.linkedTaskId, event.target.value);
});

els.homeTodoModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    updateHomeTodo({
      mode: button.dataset.todoMode === "checklist" ? "checklist" : "notes",
    }, true, true);
  });
});

els.homeTodoAddItem.addEventListener("click", () => addHomeTodoItem());
els.homeTodoAddHeader.addEventListener("click", addHomeTodoHeader);

els.homeTodoChecklist.addEventListener("input", (event) => {
  const item = event.target.closest(".home-todo-entry");
  if (!item || !event.target.classList.contains("home-todo-entry-text")) return;
  updateHomeTodoItem(item.dataset.todoItemId, { text: event.target.value });
});

els.homeTodoChecklist.addEventListener("change", (event) => {
  const item = event.target.closest(".home-todo-item");
  if (!item || event.target.type !== "checkbox") return;
  updateHomeTodoItem(item.dataset.todoItemId, { done: event.target.checked }, true, true);
});

els.homeTodoChecklist.addEventListener("click", (event) => {
  const button = event.target.closest("[data-todo-action='remove-item']");
  if (!button) return;
  const item = button.closest(".home-todo-entry");
  if (item) removeHomeTodoItem(item.dataset.todoItemId);
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

els.newTaskButton.addEventListener("click", openNewTask);

els.saveTask.addEventListener("click", saveEditedTask);
els.deleteTask.addEventListener("click", deleteEditedTask);
els.addChecklistItem.addEventListener("click", addChecklistEditorGroup);
els.editLinkedTodo.addEventListener("change", renderLinkedTodoNotesField);
els.closeDialog.addEventListener("click", () => els.dialog.close());
els.cancelEdit.addEventListener("click", () => els.dialog.close());

els.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEditedTask();
});

els.editChecklistList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-checklist-action]");
  if (!button) return;

  const action = button.dataset.checklistAction;
  const group = button.closest(".checklist-group");

  if (action === "add-item" && group) {
    addChecklistItemToGroup(group);
  }

  if (action === "remove-item" && group) {
    button.closest(".checklist-row")?.remove();
    if (!group.querySelector(".checklist-row")) {
      group.querySelector(".checklist-items").innerHTML = `<p class="empty-state checklist-empty">No items yet.</p>`;
    }
  }

  if (action === "remove-list") {
    group?.remove();
    if (!els.editChecklistList.querySelector(".checklist-group")) {
      els.editChecklistList.innerHTML = `<p class="empty-state">No checklists yet.</p>`;
    }
  }

  persistChecklistEditor();
});

els.editChecklistList.addEventListener("change", persistChecklistEditor);

async function initialize() {
  render();
  await loadRemoteState();
  render();
  window.setInterval(checkNotifications, 1000);
}

initialize();
