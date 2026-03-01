"""
Pull yesterday's box scores from MLB Stats API for momentum calculations.
Cron: 6:15 AM ET daily during season.

Run: python -m pipeline.boxscores
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, timedelta
import httpx
from db.client import get_supabase

MLB_API = "https://statsapi.mlb.com/api/v1"


def pull_boxscores(game_date: date | None = None):
    if game_date is None:
        game_date = date.today() - timedelta(days=1)

    date_str = game_date.strftime("%Y-%m-%d")
    print(f"Pulling box scores for {date_str}...")

    sb = get_supabase()

    # Get schedule for the date
    resp = httpx.get(f"{MLB_API}/schedule", params={
        "date": date_str,
        "sportId": 1,
        "hydrate": "boxscore",
    })
    data = resp.json()

    if not data.get("dates"):
        print("No games found")
        return

    games = data["dates"][0].get("games", [])
    print(f"Found {len(games)} games")

    # Extract player stats from box scores
    # This collects recent performance data for momentum calculations
    updates = 0
    for game in games:
        boxscore = game.get("boxscore", {})
        if not boxscore:
            continue

        for side in ["away", "home"]:
            team_data = boxscore.get("teams", {}).get(side, {})
            batters = team_data.get("batters", [])
            players_data = team_data.get("players", {})

            for player_key, player_info in players_data.items():
                stats = player_info.get("stats", {})
                batting = stats.get("batting", {})
                pitching = stats.get("pitching", {})

                if batting.get("atBats", 0) > 0:
                    # Calculate single-game OPS for recent performance tracking
                    ab = batting.get("atBats", 0)
                    hits = batting.get("hits", 0)
                    walks = batting.get("baseOnBalls", 0)
                    hbp = batting.get("hitByPitch", 0)
                    sf = batting.get("sacFlies", 0)
                    tb = batting.get("totalBases", 0)
                    pa = ab + walks + hbp + sf

                    if pa > 0 and ab > 0:
                        obp = (hits + walks + hbp) / pa
                        slg = tb / ab
                        game_ops = round(obp + slg, 3)

                        # Store as recent_ops (simplified: last game OPS)
                        mlb_id = player_info.get("person", {}).get("id")
                        if mlb_id:
                            result = sb.table("players").select("id").eq("mlb_id", mlb_id).execute()
                            if result.data:
                                sb.table("players").update({
                                    "recent_ops": game_ops
                                }).eq("id", result.data[0]["id"]).execute()
                                updates += 1

                if pitching.get("inningsPitched", "0") != "0":
                    era_str = pitching.get("earnedRuns", 0)
                    ip_str = pitching.get("inningsPitched", "0")
                    ip = float(ip_str)
                    if ip > 0:
                        game_era = round(float(era_str) * 9 / ip, 2)
                        mlb_id = player_info.get("person", {}).get("id")
                        if mlb_id:
                            result = sb.table("players").select("id").eq("mlb_id", mlb_id).execute()
                            if result.data:
                                sb.table("players").update({
                                    "recent_era": game_era
                                }).eq("id", result.data[0]["id"]).execute()
                                updates += 1

    print(f"Updated {updates} player momentum stats")


if __name__ == "__main__":
    pull_boxscores()
