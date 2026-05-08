const SCRIPT_SECRET_PROPERTY = "PROJECT_DESK_SYNC_SECRET";
const SPREADSHEET_ID_PROPERTY = "PROJECT_DESK_SPREADSHEET_ID";
const SPREADSHEET_NAME = "Project Desk Data";

const TABLES = {
  tasks: {
    sheetName: "Tasks",
    columns: [
      "id",
      "title",
      "project",
      "notes",
      "status",
      "priority",
      "dueAt",
      "reminderAt",
      "checklist",
      "createdAt",
      "updatedAt",
      "notified",
    ],
    jsonColumns: ["checklist", "notified"],
    numberColumns: ["createdAt", "updatedAt"],
  },
  alerts: {
    sheetName: "Alerts",
    columns: ["id", "title", "message", "createdAt"],
    jsonColumns: [],
    numberColumns: ["createdAt"],
  },
  timers: {
    sheetName: "Timers",
    columns: ["id", "label", "endsAt", "createdAt", "completedAt"],
    jsonColumns: [],
    numberColumns: ["endsAt", "createdAt", "completedAt"],
  },
};

function doGet() {
  return jsonResponse_({
    ok: true,
    message: "Project Desk Apps Script storage is running. Use POST with the shared secret to load or save data.",
  });
}

function doPost(event) {
  try {
    const payload = parsePayload_(event);
    authorize_(payload.secret);

    if (payload.action === "load") {
      return jsonResponse_({
        ok: true,
        state: readState_(),
      });
    }

    if (payload.action === "save") {
      const state = normalizeState_(payload.state);
      writeState_(state);
      return jsonResponse_({
        ok: true,
        state,
      });
    }

    throw new Error("Unknown action.");
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message || "Apps Script sync failed.",
    });
  }
}

function setupProjectDeskStorage() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(TABLES).forEach((key) => {
    getOrCreateSheet_(spreadsheet, TABLES[key]);
  });
  Logger.log("Project Desk storage ready: " + spreadsheet.getUrl());
}

function readState_() {
  const spreadsheet = getSpreadsheet_();
  return {
    tasks: readTable_(spreadsheet, TABLES.tasks),
    alerts: readTable_(spreadsheet, TABLES.alerts),
    timers: readTable_(spreadsheet, TABLES.timers),
  };
}

function writeState_(state) {
  const spreadsheet = getSpreadsheet_();
  writeTable_(spreadsheet, TABLES.tasks, state.tasks);
  writeTable_(spreadsheet, TABLES.alerts, state.alerts);
  writeTable_(spreadsheet, TABLES.timers, state.timers);
}

function readTable_(spreadsheet, table) {
  const sheet = getOrCreateSheet_(spreadsheet, table);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, table.columns.length).getValues();
  return values
    .map((row) => rowToRecord_(row, table))
    .filter((record) => record.id);
}

function writeTable_(spreadsheet, table, records) {
  const sheet = getOrCreateSheet_(spreadsheet, table);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, table.columns.length).setValues([table.columns]);

  if (!records.length) return;

  const rows = records.map((record) => table.columns.map((column) => valueToCell_(record[column], column, table)));
  sheet.getRange(2, 1, rows.length, table.columns.length).setValues(rows);
}

function rowToRecord_(row, table) {
  return table.columns.reduce((record, column, index) => {
    record[column] = cellToValue_(row[index], column, table);
    return record;
  }, {});
}

function valueToCell_(value, column, table) {
  if (table.jsonColumns.indexOf(column) >= 0) {
    return JSON.stringify(value || (column === "checklist" ? [] : {}));
  }

  if (value === null || value === undefined) return "";
  return value;
}

function cellToValue_(value, column, table) {
  if (table.jsonColumns.indexOf(column) >= 0) {
    if (!value) return column === "checklist" ? [] : {};
    try {
      return JSON.parse(value);
    } catch (error) {
      return column === "checklist" ? [] : {};
    }
  }

  if (table.numberColumns.indexOf(column) >= 0) {
    return value === "" ? null : Number(value);
  }

  return value === null || value === undefined ? "" : String(value);
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const storedId = properties.getProperty(SPREADSHEET_ID_PROPERTY);

  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (error) {
      properties.deleteProperty(SPREADSHEET_ID_PROPERTY);
    }
  }

  const spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
  properties.setProperty(SPREADSHEET_ID_PROPERTY, spreadsheet.getId());
  return spreadsheet;
}

function getOrCreateSheet_(spreadsheet, table) {
  let sheet = spreadsheet.getSheetByName(table.sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(table.sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, table.columns.length).setValues([table.columns]);
  }

  return sheet;
}

function normalizeState_(state) {
  return {
    tasks: Array.isArray(state && state.tasks) ? state.tasks : [],
    alerts: Array.isArray(state && state.alerts) ? state.alerts : [],
    timers: Array.isArray(state && state.timers) ? state.timers : [],
  };
}

function parsePayload_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("Missing request body.");
  }
  return JSON.parse(event.postData.contents);
}

function authorize_(secret) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty(SCRIPT_SECRET_PROPERTY);
  if (!expectedSecret) {
    throw new Error("Missing PROJECT_DESK_SYNC_SECRET script property.");
  }

  if (String(secret || "") !== expectedSecret) {
    throw new Error("Unauthorized.");
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
