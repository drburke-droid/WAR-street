"""
Pull updated WAR data from FanGraphs via pybaseball.
Cron: 6:00 AM ET daily during season.

Run: python -m pipeline.war_pull
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pybaseball import batting_stats, pitching_stats
from db.client import get_supabase


def pull_war(season: int = 2026):
    sb = get_supabase()

    # Pull hitter WAR
    print(f"Pulling {season} batting stats from FanGraphs...")
    try:
        hitters = batting_stats(season, qual=0)
    except Exception as e:
        print(f"No batting stats available (preseason?): {e}")
        hitters = None
    hitter_updates = 0
    for _, row in (hitters.iterrows() if hitters is not None else []):
        name = row.get("Name", "")
        war = row.get("WAR", 0)
        games = row.get("G", 0)
        ops = row.get("OPS", None)

        # Try to match by name (FanGraphs format: "First Last")
        # Our DB uses "Last F" — match on last name prefix
        parts = name.split()
        if len(parts) < 2:
            continue
        last = parts[-1]

        result = sb.table("players").select("id, name, fangraphs_id").eq("player_type", "H").ilike("name", f"{last}%").execute()
        if result.data and len(result.data) == 1:
            update = {
                "war_ytd": round(float(war), 1),
                "games_played": int(games),
            }
            if ops is not None:
                update["season_ops"] = round(float(ops), 3)
            # Capture FanGraphs ID if we don't have it yet
            fg_id = row.get("IDfg")
            if fg_id and not result.data[0].get("fangraphs_id"):
                update["fangraphs_id"] = int(fg_id)
            sb.table("players").update(update).eq("id", result.data[0]["id"]).execute()
            hitter_updates += 1

    # Pull pitcher WAR
    print(f"Pulling {season} pitching stats from FanGraphs...")
    try:
        pitchers = pitching_stats(season, qual=0)
    except Exception as e:
        print(f"No pitching stats available (preseason?): {e}")
        pitchers = None
    pitcher_updates = 0
    for _, row in (pitchers.iterrows() if pitchers is not None else []):
        name = row.get("Name", "")
        war = row.get("WAR", 0)
        games = row.get("G", 0)
        era = row.get("ERA", None)

        parts = name.split()
        if len(parts) < 2:
            continue
        last = parts[-1]

        result = sb.table("players").select("id, name, fangraphs_id").eq("player_type", "P").ilike("name", f"{last}%").execute()
        if result.data and len(result.data) == 1:
            update = {
                "war_ytd": round(float(war), 1),
                "games_played": int(games),
            }
            if era is not None:
                update["season_era"] = round(float(era), 2)
            fg_id = row.get("IDfg")
            if fg_id and not result.data[0].get("fangraphs_id"):
                update["fangraphs_id"] = int(fg_id)
            sb.table("players").update(update).eq("id", result.data[0]["id"]).execute()
            pitcher_updates += 1

    print(f"Updated {hitter_updates} hitters, {pitcher_updates} pitchers")


if __name__ == "__main__":
    pull_war()
