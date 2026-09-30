"""Execute the guide's actual SQL against synthetic SQLite records, never user data."""
import json
import re
import sqlite3
from pathlib import Path

guide = Path(__file__).resolve().parents[2] / "quickstart/retrieve-data.md"
sql = re.findall(r"```sql\n(.*?)\n```", guide.read_text(), re.S)[0]
params = ["2026-03", "2026-03-01", "2026-04-01",
          "2026-08", "2026-08-01", "2026-09-01", "weight"]
db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE measurements (metric TEXT, value REAL, unit TEXT, occurrence_date TEXT, captured_at TEXT)")
rows = [
    ("weight", 60, "kg", "2026-03-01", "2026-09-29"),
    ("weight", 64, "kg", "2026-03-31", "2026-09-29"),
    ("weight", 999, "kg", "2026-04-01", "2026-08-01"),
    ("weight", 70, "kg", "2026-08-01", "2026-09-29"),
    ("weight", 74, "kg", "2026-08-01", "2026-09-29"),
    ("weight", 72, "kg", "2026-08-31", "2026-09-29"),
    ("weight", 999, "kg", "2026-09-01", "2026-03-01"),
    ("sleep", 8, "hours", "2026-08-01", "2026-09-29"),
]
db.executemany("INSERT INTO measurements VALUES (?, ?, ?, ?, ?)", rows)
expected = [
    ("2026-03", "kg", 2, 62.0, "2026-03-01", "2026-03-31"),
    ("2026-08", "kg", 3, 72.0, "2026-08-01", "2026-08-31"),
]
actual = db.execute(sql, params).fetchall()
assert actual == expected, actual
assert actual[1][3] - actual[0][3] == 10.0
db.execute("INSERT INTO measurements VALUES (?, ?, ?, ?, ?)",
           ("weight", 150, "lb", "2026-08-02", "2026-09-29"))
assert db.execute(sql, params).fetchall() == expected + [
    ("2026-08", "lb", 1, 150.0, "2026-08-02", "2026-08-02")]
db.execute("DELETE FROM measurements WHERE occurrence_date >= ?", ["2026-08-01"])
assert db.execute(sql, params).fetchall() == expected[:1] + [
    ("2026-08", None, 0, None, None, None)]
db.execute("DELETE FROM measurements")
assert db.execute(sql, params).fetchall() == [
    ("2026-03", None, 0, None, None, None),
    ("2026-08", None, 0, None, None, None)]
print(json.dumps({"classification": "synthetic SQLite only", "checks": [
    "actual guide SQL executes", "half-open occurrence-date boundaries",
    "capture date ignored", "counts readings including duplicate days",
    "other metrics excluded", "units kept separate",
    "August-minus-March means", "missing month null mean", "empty dataset null means"
], "passed": True}, indent=2))
