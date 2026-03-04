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


def populate_ids():
    sb = get_supabase()

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

    # Match against our DB players
    result = sb.table("players").select("id, name, mlb_id, fangraphs_id").execute()
    players = result.data
    matched = 0
    skipped = 0

    for p in players:
        if p.get("mlb_id") and p.get("fangraphs_id"):
            skipped += 1
            continue

        # Our DB format: "Last F" (e.g., "Judge A", "Ohtani S")
        db_name = p["name"].strip()
        parts = db_name.split()
        if len(parts) < 2:
            continue
        last = parts[0].lower()
        first_initial = parts[1][0].lower() if parts[1] else ""
        key = f"{last} {first_initial}"

        ids = lookup.get(key)
        if ids:
            update = {}
            if not p.get("mlb_id"):
                update["mlb_id"] = ids[0]
            if not p.get("fangraphs_id"):
                update["fangraphs_id"] = ids[1]
            if update:
                sb.table("players").update(update).eq("id", p["id"]).execute()
                matched += 1
        else:
            print(f"  No match: {db_name} (key: {key})")

    print(f"Matched {matched}, skipped {skipped} (already had IDs), "
          f"unmatched {len(players) - matched - skipped}")


if __name__ == "__main__":
    populate_ids()
