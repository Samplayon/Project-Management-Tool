from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import csv
import json
import os


ROOT = Path(__file__).resolve().parent
DATA_FILE_PATH = ROOT / "data" / "project-data.csv"
CSV_COLUMNS = ["collection", "id", "payload_json"]
COLLECTION_KEYS = ["tasks", "alerts", "timers", "statuses", "todoLists", "oneOnOnes"]
EMPTY_STATE = {
    "tasks": [],
    "alerts": [],
    "timers": [],
    "statuses": [],
    "todoLists": [],
    "oneOnOnes": [],
}
CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}


def record_timestamp(record):
    for key in ("updatedAt", "createdAt", "completedAt", "endsAt"):
        try:
            return float(record.get(key) or 0)
        except (TypeError, ValueError):
            return 0
    return 0


def dedupe_records(records):
    records_by_id = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        record_id = str(record.get("id") or "").strip()
        if not record_id:
            continue
        current = records_by_id.get(record_id)
        if current is None or record_timestamp(record) >= record_timestamp(current):
            records_by_id[record_id] = record
    return list(records_by_id.values())


def dedupe_statuses(statuses):
    statuses_by_label = {}
    for status in statuses:
        if not isinstance(status, dict):
            continue
        status_id = str(status.get("id") or "").strip()
        label = str(status.get("label") or "").strip()
        key = (label or status_id).lower()
        if key and key not in statuses_by_label:
            statuses_by_label[key] = status
    return list(statuses_by_label.values())


def normalize_state(state):
    source = state if isinstance(state, dict) else EMPTY_STATE
    return {
        "tasks": dedupe_records(source.get("tasks") if isinstance(source.get("tasks"), list) else []),
        "alerts": dedupe_records(source.get("alerts") if isinstance(source.get("alerts"), list) else []),
        "timers": dedupe_records(source.get("timers") if isinstance(source.get("timers"), list) else []),
        "statuses": dedupe_statuses(source.get("statuses") if isinstance(source.get("statuses"), list) else []),
        "todoLists": dedupe_records(source.get("todoLists") if isinstance(source.get("todoLists"), list) else []),
        "oneOnOnes": dedupe_records(source.get("oneOnOnes") if isinstance(source.get("oneOnOnes"), list) else []),
    }


def read_csv_state():
    if not DATA_FILE_PATH.exists():
        return normalize_state(EMPTY_STATE)

    state = normalize_state(EMPTY_STATE)
    with DATA_FILE_PATH.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            collection = row.get("collection")
            payload = row.get("payload_json")
            if collection not in COLLECTION_KEYS or not payload:
                continue
            try:
                record = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                record["id"] = record.get("id") or row.get("id") or ""
                state[collection].append(record)
    return normalize_state(state)


def write_csv_state(state):
    normalized = normalize_state(state)
    DATA_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = DATA_FILE_PATH.with_suffix(DATA_FILE_PATH.suffix + ".tmp")
    with temporary_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(CSV_COLUMNS)
        for collection in COLLECTION_KEYS:
            for record in normalized[collection]:
                writer.writerow([collection, record.get("id") or "", json.dumps(record, separators=(",", ":"))])
    temporary_path.replace(DATA_FILE_PATH)
    return normalized


class ProjectDeskHandler(BaseHTTPRequestHandler):
    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/project-data"):
            self.send_json(200, {"ok": True, "state": read_csv_state()})
            return
        self.serve_static()

    def do_POST(self):
        if not self.path.startswith("/api/project-data"):
            self.send_json(404, {"ok": False, "error": "Not found"})
            return
        try:
            content_length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(content_length).decode("utf-8")
            body = json.loads(raw_body or "{}")
            state = write_csv_state(body.get("state") or EMPTY_STATE)
            self.send_json(200, {"ok": True, "state": state})
        except Exception as error:
            self.send_json(500, {"ok": False, "error": str(error) or "Unable to save Project Desk data locally"})

    def serve_static(self):
        parsed = urlparse(self.path)
        pathname = unquote(parsed.path)
        relative_path = "index.html" if pathname == "/" else pathname.lstrip("/")
        file_path = (ROOT / relative_path).resolve()

        if ROOT not in file_path.parents and file_path != ROOT:
            self.send_error(403)
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error(404)
            return

        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(file_path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("localhost", port), ProjectDeskHandler)
    print(f"Project Desk running at http://localhost:{port}")
    server.serve_forever()
