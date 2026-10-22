#!/usr/bin/env python3
"""Build the tiny, source-attributed world electricity snapshot for Atlas.

Source: OWID updated energy catalog CSV (compiled from Ember, EI, EIA, etc.)
No downstream API key. Keep null values null; country/year + unit checks.
Run: python3 scripts/update_electricity_world.py
"""
import csv
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCE = "https://catalog.ourworldindata.org/energy/owid_energy/"
CSV_URL = SOURCE + "owid_energy.csv"
OUT = Path(__file__).resolve().parents[1] / "data" / "electricity-world-annual.json"
COLUMNS = [
    "year", "electricity_generation_twh", "electricity_demand_twh",
    "renewables_electricity_share_pct", "low_carbon_electricity_share_pct",
    "electricity_carbon_intensity_gco2eq_per_kwh", "coal_electricity_twh",
    "nuclear_electricity_twh", "solar_electricity_twh",
    "wind_electricity_twh", "hydro_electricity_twh",
    "gas_electricity_twh", "electricity_net_imports_twh",
]
FIELDS = [
    "year", "generationTWh", "demandTWh", "renewablesPercent",
    "lowCarbonPercent", "carbonIntensityGco2eqKwh", "coalTWh",
    "nuclearTWh", "solarTWh", "windTWh", "hydroTWh", "gasTWh",
    "netImportsTWh",
]


def numeric(value, places=2):
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (ValueError, TypeError):
        return None
    if not (-1e12 < number < 1e12):
        return None
    return round(number, places)


def build(text):
    reader = csv.DictReader(io.StringIO(text))
    missing = set(COLUMNS + ["country", "iso_code"]) - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"Schema changed, columns missing: {sorted(missing)}")
    countries = {}
    for row in reader:
        code = row["iso_code"]
        if not re.fullmatch("[A-Z]{3}", code or ""):
            continue
        year = int(row["year"])
        if not 2000 <= year <= 2100:
            continue
        values = [year] + [
            numeric(row[key], 1 if key.endswith("_pct") or key.endswith("_kwh") else 2)
            for key in COLUMNS[1:]
        ]
        if values[1] is None or values[1] <= 0:
            continue
        countries.setdefault(code, {"name": row["country"], "history": []})["history"].append(values)
    for entry in countries.values():
        entry["history"].sort(key=lambda item: item[0])
    if len(countries) < 150:
        raise ValueError(f"Only {len(countries)} countries, source may be broken")
    return countries


def main():
    with urllib.request.urlopen(CSV_URL, timeout=45) as response:
        csv_text = response.read().decode("utf-8-sig")
    countries = build(csv_text)
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    current_max = max(series["history"][-1][0] for series in countries.values())
    result = {
        "schema": 1,
        "source": SOURCE,
        "origin": "Our World in Data, including Ember, EI, EIA (by field)",
        "sourceLastUpdated": old.get("sourceLastUpdated", "2026-09-10"),
        "license": "Original indicator-specific source licenses apply; Ember CC BY 4.0",
        "minYear": 2000,
        "maxYear": current_max,
        "fields": FIELDS,
        "countries": dict(sorted(countries.items())),
    }
    # Avoid rewriting the file when upstream data has not changed.
    if old and old.get("countries") == result["countries"]:
        print(f"No data changes: {len(countries)} countries, last year {current_max}")
        return
    result["sourceLastUpdated"] = datetime.now(timezone.utc).date().isoformat()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated {len(countries)} countries, last year {current_max}; {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
