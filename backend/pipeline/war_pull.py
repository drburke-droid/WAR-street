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


def _match_player(sb, fg_name: str, player_type: str):
    """Match a FanGraphs player name to our DB.

    FanGraphs format: "First Last" or "First De La Cruz"
    Our DB format: "Last F" or "De La Cruz E"

    Strategy:
    1. Try matching by fangraphs_id if IDfg is available (most reliable)
    2. Try last word as last name (works for simple names like "Aaron Judge")
    3. Try compound last name for multi-word names (works for "Elly De La Cruz")
    """
    parts = fg_name.split()
    if len(parts) < 2:
        return None

    # Strategy 1: simple last-name prefix match (covers most players)
    last = parts[-1]
    result = sb.table("players").select("id, name, fangraphs_id").eq("player_type", player_type).ilike("name", f"{last}%").execute()
    if result.data and len(result.data) == 1:
        return result.data[0]

    # Strategy 2: compound last name — "Elly De La Cruz" → search for "De La Cruz%"
    if len(parts) > 2:
        compound_last = " ".join(parts[1:])  # everything after first name
        result = sb.table("players").select("id, name, fangraphs_id").eq("player_type", player_type).ilike("name", f"{compound_last}%").execute()
        if result.data and len(result.data) == 1:
            return result.data[0]

    return None


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

        match = _match_player(sb, name, "H")
        if match:
            update = {
                "war_ytd": round(float(war), 1),
                "games_played": int(games),
            }
            if ops is not None:
                update["season_ops"] = round(float(ops), 3)
            fg_id = row.get("IDfg")
            if fg_id and not match.get("fangraphs_id"):
                update["fangraphs_id"] = int(fg_id)
            sb.table("players").update(update).eq("id", match["id"]).execute()
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

        match = _match_player(sb, name, "P")
        if match:
            update = {
                "war_ytd": round(float(war), 1),
                "games_played": int(games),
            }
            if era is not None:
                update["season_era"] = round(float(era), 2)
            fg_id = row.get("IDfg")
            if fg_id and not match.get("fangraphs_id"):
                update["fangraphs_id"] = int(fg_id)
            sb.table("players").update(update).eq("id", match["id"]).execute()
            pitcher_updates += 1

    print(f"Updated {hitter_updates} hitters, {pitcher_updates} pitchers")


if __name__ == "__main__":
    pull_war()
