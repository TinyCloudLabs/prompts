"""Disposable SQL semantics fixture, independent of guide prose; never user data."""
import json
import sqlite3

# This app-owned fixture deliberately uses its own schema, not a generic app model.
sql = """
SELECT periods.month, m.unit, COUNT(m.value) AS measurement_count,
       AVG(m.value) AS mean_recorded_value,
       MIN(m.occurrence_date) AS first_reading,
       MAX(m.occurrence_date) AS last_reading
FROM (
  SELECT ? AS month, ? AS start_date, ? AS end_date
  UNION ALL SELECT ?, ?, ?
) AS periods
LEFT JOIN measurements AS m
  ON m.metric = ?
 AND m.occurrence_date >= periods.start_date
 AND m.occurrence_date < periods.end_date
GROUP BY periods.month, m.unit
ORDER BY periods.month, m.unit
"""
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
    "fixture-owned parameterized SQL executes", "half-open occurrence-date boundaries",
    "capture date ignored", "counts readings including duplicate days",
    "other metrics excluded", "units kept separate",
    "August-minus-March means", "missing month null mean", "empty dataset null means"
], "passed": True}, indent=2))
