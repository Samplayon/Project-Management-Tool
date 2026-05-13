const fs = require("fs/promises");
const path = require("path");

const DATA_FILE_PATH = path.join(process.cwd(), "data", "project-data.csv");
const CSV_COLUMNS = ["collection", "id", "payload_json"];
const COLLECTION_KEYS = ["tasks", "alerts", "timers", "statuses", "todoLists", "oneOnOnes", "stickyNotes", "bigPictureReminders"];

const EMPTY_STATE = {
  tasks: [],
  alerts: [],
  timers: [],
  statuses: [],
  todoLists: [],
  oneOnOnes: [],
  stickyNotes: [],
  bigPictureReminders: [],
};

function normalizeState(state) {
  return {
    tasks: dedupeRecordsById(Array.isArray(state?.tasks) ? state.tasks : []),
    alerts: dedupeRecordsById(Array.isArray(state?.alerts) ? state.alerts : []),
    timers: dedupeRecordsById(Array.isArray(state?.timers) ? state.timers : []),
    statuses: dedupeStatuses(Array.isArray(state?.statuses) ? state.statuses : []),
    todoLists: dedupeRecordsById(Array.isArray(state?.todoLists) ? state.todoLists : []),
    oneOnOnes: dedupeRecordsById(Array.isArray(state?.oneOnOnes) ? state.oneOnOnes : []),
    stickyNotes: dedupeRecordsById(Array.isArray(state?.stickyNotes) ? state.stickyNotes : []),
    bigPictureReminders: dedupeRecordsById(Array.isArray(state?.bigPictureReminders) ? state.bigPictureReminders : []),
  };
}

function getRecordTimestamp(record) {
  return Number(record?.updatedAt || record?.createdAt || record?.completedAt || record?.endsAt || 0);
}

function dedupeRecordsById(records) {
  const recordsById = new Map();

  records.forEach((record) => {
    const id = String(record?.id || "").trim();
    if (!id) return;

    const current = recordsById.get(id);
    if (!current || getRecordTimestamp(record) >= getRecordTimestamp(current)) {
      recordsById.set(id, record);
    }
  });

  return [...recordsById.values()];
}

function dedupeStatuses(statuses) {
  const statusesByLabel = new Map();

  statuses.forEach((status) => {
    const id = String(status?.id || "").trim();
    const label = String(status?.label || "").trim();
    const key = (label || id).toLowerCase();
    if (!key || statusesByLabel.has(key)) return;
    statusesByLabel.set(key, status);
  });

  return [...statusesByLabel.values()];
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function serializeCsvRow(row) {
  return row.map(escapeCsvCell).join(",");
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

async function readLocalCsvState() {
  let csvText = "";

  try {
    csvText = await fs.readFile(DATA_FILE_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return normalizeState(EMPTY_STATE);
    throw error;
  }

  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return normalizeState(EMPTY_STATE);

  const header = rows[0];
  const collectionIndex = header.indexOf("collection");
  const idIndex = header.indexOf("id");
  const payloadIndex = header.indexOf("payload_json");
  const state = normalizeState(EMPTY_STATE);

  rows.slice(1).forEach((row) => {
    const collection = row[collectionIndex];
    const payloadJson = row[payloadIndex];
    if (!COLLECTION_KEYS.includes(collection) || !payloadJson) return;

    try {
      const record = JSON.parse(payloadJson);
      if (record && typeof record === "object") {
        state[collection].push({
          ...record,
          id: record.id || row[idIndex] || "",
        });
      }
    } catch (error) {
      // Skip malformed rows so one bad CSV entry does not block the whole app.
    }
  });

  return normalizeState(state);
}

async function writeLocalCsvState(state) {
  const normalized = normalizeState(state);
  const rows = [CSV_COLUMNS];

  COLLECTION_KEYS.forEach((collection) => {
    normalized[collection].forEach((record) => {
      rows.push([
        collection,
        record?.id || "",
        JSON.stringify(record || {}),
      ]);
    });
  });

  const csvText = `${rows.map(serializeCsvRow).join("\n")}\n`;
  const dataDirectory = path.dirname(DATA_FILE_PATH);
  const temporaryPath = `${DATA_FILE_PATH}.tmp`;

  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, csvText, "utf8");
  await fs.rename(temporaryPath, DATA_FILE_PATH);

  return normalized;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const state = await readLocalCsvState();
      sendJson(res, 200, { ok: true, state });
      return;
    }

    if (req.method === "POST") {
      const body = await readRequestBody(req);
      const state = await writeLocalCsvState(body.state || EMPTY_STATE);
      sendJson(res, 200, { ok: true, state });
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Unable to save Project Desk data locally" });
  }
};
