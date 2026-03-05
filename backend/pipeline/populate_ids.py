"""
Populate mlb_id and fangraphs_id for all players using pybaseball's Chadwick register.
One-time setup script — also available as admin endpoint.

Run: python -m pipeline.populate_ids
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pybaseball import chadwick_register
from db.client import get_supabase


NAME_FIXES = {
    # Reversed names (first name + last initial → last name + first initial)
    3: "Chisholm J",       # was "Jazz C" (Jazz Chisholm Jr., NYY)
    1179: "Turner T",      # was "Trea T" (Trea Turner, PHI) — duplicate of id 132
    1229: "Hoskins R",     # was "Rhys H" (Rhys Hoskins, MIL)
    2088: "Brieske B",     # was "Beau B" (Beau Brieske, DET)
    2218: "Iglesias R",    # was "Raisel I" (Raisel Iglesias, ATL)
    2333: "Underwood T",   # was "Underwood Jr T" (Duane Underwood Jr., PIT)
    2386: "Nelson R",      # was "Ryne N" (Ryne Nelson, ARI)
}


def populate_ids():
    sb = get_supabase()

    # Fix known bad names in DB before matching
    print("Fixing known bad player names...")
    for player_id, correct_name in NAME_FIXES.items():
        sb.table("players").update({"name": correct_name}).eq("id", player_id).execute()
    print(f"Fixed {len(NAME_FIXES)} names")

    print("Loading Chadwick register...")
    reg = chadwick_register()
    # Keep only rows with both MLB and FanGraphs IDs
    reg = reg.dropna(subset=["key_mlbam", "key_fangraphs"])
    reg = reg[reg["key_mlbam"] > 0]
    print(f"Register has {len(reg)} players with both IDs")

    # Build lookup: "last_lower first_initial_lower" -> (mlb_id, fg_id)
    # Handle duplicates by preferring the most recent (highest mlb_id)
    lookup = {}
    for _, row in reg.iterrows():
        last = str(row.get("name_last", "")).strip().lower()
        first = str(row.get("name_first", "")).strip().lower()
        if not last or not first:
            continue
        key = f"{last} {first[0]}"
        mlb_id = int(row["key_mlbam"])
        fg_id = int(row["key_fangraphs"])
        # Prefer higher mlb_id (more recent player) for duplicate keys
        if key not in lookup or mlb_id > lookup[key][0]:
            lookup[key] = (mlb_id, fg_id)

    print(f"Built lookup with {len(lookup)} unique name keys")

    # Also build a last-name-only lookup for fallback matching
    last_only = {}
    for _, row in reg.iterrows():
        last = str(row.get("name_last", "")).strip().lower()
        first = str(row.get("name_first", "")).strip().lower()
        if not last or not first:
            continue
        mlb_id = int(row.get("key_mlbam", 0))
        fg_id = int(row.get("key_fangraphs", 0))
        if mlb_id <= 0:
            continue
        last_only.setdefault(last, []).append((first, mlb_id, fg_id))

    # Match against our DB players
    result = sb.table("players").select("id, name, mlb_id, fangraphs_id").execute()
    players = result.data
    matched = 0
    skipped = 0
    errors = 0
    used_mlb_ids = set()

    # Collect mlb_ids already in DB to avoid duplicate key violations
    for p in players:
        if p.get("mlb_id"):
            used_mlb_ids.add(p["mlb_id"])

    for p in players:
        if p.get("mlb_id") and p.get("fangraphs_id"):
            skipped += 1
            continue

        # Our DB format: "Last F" (e.g., "Judge A", "De La Cruz E")
        # Last word is the initial; everything before is the last name
        db_name = p["name"].strip()
        parts = db_name.split()
        if len(parts) < 2:
            continue
        initial = parts[-1].lower()
        last = " ".join(parts[:-1]).lower()
        # Strip "jr" suffix if present (e.g., "Underwood Jr T")
        last = last.replace(" jr", "")
        key = f"{last} {initial[0]}"

        ids = lookup.get(key)

        # Fallback: try last-name-only lookup if exact key missed
        if not ids and last in last_only:
            candidates = last_only[last]
            # Filter to candidates whose first name starts with our initial
            matches = [(f, m, fg) for f, m, fg in candidates if f and f[0] == initial[0]]
            if len(matches) == 1:
                ids = (matches[0][1], matches[0][2])

        if ids:
            mlb_id, fg_id = ids
            # Skip if this mlb_id is already used by another player
            if mlb_id in used_mlb_ids and not p.get("mlb_id"):
                print(f"  Skipping {db_name}: mlb_id {mlb_id} already in use")
                errors += 1
                continue
            update = {}
            if not p.get("mlb_id"):
                update["mlb_id"] = mlb_id
                used_mlb_ids.add(mlb_id)
            if not p.get("fangraphs_id"):
                update["fangraphs_id"] = fg_id
            if update:
                try:
                    sb.table("players").update(update).eq("id", p["id"]).execute()
                    matched += 1
                except Exception as e:
                    print(f"  Error updating {db_name}: {e}")
                    errors += 1
        else:
            print(f"  No match: {db_name} (key: {key})")

    print(f"Matched {matched}, skipped {skipped} (already had IDs), "
          f"errors {errors}, unmatched {len(players) - matched - skipped - errors}")


if __name__ == "__main__":
    populate_ids()
