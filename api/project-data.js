const APPS_SCRIPT_URL = process.env.PROJECT_DESK_APPS_SCRIPT_URL;
const SYNC_SECRET = process.env.PROJECT_DESK_SYNC_SECRET;

const EMPTY_STATE = {
  tasks: [],
  alerts: [],
  timers: [],
  statuses: [],
  todoLists: [],
};

function normalizeState(state) {
  return {
    tasks: Array.isArray(state?.tasks) ? state.tasks : [],
    alerts: Array.isArray(state?.alerts) ? state.alerts : [],
    timers: Array.isArray(state?.timers) ? state.timers : [],
    statuses: Array.isArray(state?.statuses) ? state.statuses : [],
    todoLists: Array.isArray(state?.todoLists) ? state.todoLists : [],
  };
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

async function callAppsScript(payload) {
  if (!APPS_SCRIPT_URL || !SYNC_SECRET) {
    throw new Error("Missing PROJECT_DESK_APPS_SCRIPT_URL or PROJECT_DESK_SYNC_SECRET in Vercel environment variables.");
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      ...payload,
      secret: SYNC_SECRET,
    }),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `Apps Script returned status ${response.status}`);
  }

  return body;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const response = await callAppsScript({ action: "load" });
      sendJson(res, 200, { ok: true, state: normalizeState(response.state || EMPTY_STATE) });
      return;
    }

    if (req.method === "POST") {
      const body = await readRequestBody(req);
      const response = await callAppsScript({
        action: "save",
        state: normalizeState(body.state || EMPTY_STATE),
      });
      sendJson(res, 200, { ok: true, state: normalizeState(response.state || body.state || EMPTY_STATE) });
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Unable to sync Project Desk data" });
  }
};
