from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
import hashlib
import logging
import math

import httpx
from fastapi import APIRouter, Query
from db.client import get_supabase
from models.player import PlayerOut, PlayerDetail

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/players", tags=["players"])

# MLB team name → abbreviation mapping (API sometimes returns full names)
_MLB_ABBREVS = {
    "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
    "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
    "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
    "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
    "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
    "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
    "New York Yankees": "NYY", "Oakland Athletics": "OAK", "Philadelphia Phillies": "PHI",
    "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD", "San Francisco Giants": "SF",
    "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB",
    "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
}


@lru_cache(maxsize=1)
def _fetch_schedule(today: date) -> dict[str, str]:
    """Fetch today's MLB schedule, return {team_abbrev: opponent_string}."""
    url = f"https://statsapi.mlb.com/api/v1/schedule?date={today}&sportId=1"
    try:
        resp = httpx.get(url, timeout=5)
        resp.raise_for_status()
    except Exception:
        logger.warning("MLB schedule fetch failed for %s", today)
        return {}
    mapping: dict[str, str] = {}
    for game in resp.json().get("dates", [{}])[0].get("games", []):
        try:
            away_name = game["teams"]["away"]["team"]["name"]
            home_name = game["teams"]["home"]["team"]["name"]
            away = _MLB_ABBREVS.get(away_name, away_name[:3].upper())
            home = _MLB_ABBREVS.get(home_name, home_name[:3].upper())
            mapping[away] = f"@{home}"
            mapping[home] = f"v{away}"
        except (KeyError, TypeError):
            continue
    return mapping


def _fake_history(player_id: int, current: float, n: int, pct: float) -> list[float]:
    """Deterministic fake history curve seeded by player_id.

    Walks backward from `current`, applying small pseudo-random steps so
    each player gets a unique but stable sparkline shape.
    """
    seed = hashlib.md5(str(player_id).encode()).digest()
    pts = [current]
    for i in range(n - 1):
        # Use bytes from the hash to get a deterministic -1..+1 value
        b = seed[(i * 2) % len(seed)] ^ seed[(i * 2 + 1) % len(seed)]
        noise = (b / 255.0) * 2 - 1                    # -1 .. +1
        trend = math.sin(i * 0.6 + seed[0] / 50.0)     # gentle wave
        step = 1 + (noise * 0.4 + trend * 0.3) * pct
        pts.append(max(pts[-1] / step, 0.01))
    pts.reverse()  # oldest first
    return pts


def _compute_volume(sb) -> dict[int, int]:
    """Count transactions per player in last 14 days, normalize to 0-100."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    try:
        result = sb.table("transactions").select("player_id").gte("created_at", cutoff).execute()
    except Exception:
        logger.warning("Volume query failed")
        return {}
    counts: dict[int, int] = {}
    for row in result.data:
        pid = row["player_id"]
        counts[pid] = counts.get(pid, 0) + 1
    if not counts:
        return {}
    mx = max(counts.values())
    return {pid: round(c / mx * 100) for pid, c in counts.items()}


@router.get("", response_model=list[PlayerOut])
def list_players(
    team: str | None = Query(None, description="Filter by team abbreviation"),
    position: str | None = Query(None, description="Filter by position (H or P)"),
    sort: str = Query("price", description="Sort field: price, war, name, change"),
    order: str = Query("desc", description="Sort order: asc or desc"),
):
    sb = get_supabase()
    q = sb.table("players").select("*")

    if team:
        q = q.eq("team", team.upper())
    if position:
        q = q.eq("player_type", position.upper())

    result = q.execute()
    players = result.data

    # Compute volume scores and today's schedule
    vol_map = _compute_volume(sb)
    schedule = _fetch_schedule(date.today())

    # Compute change fields
    out = []
    for p in players:
        curr = p["current_price"] or 0
        prev = p["prev_price"] or curr
        change = curr - prev
        pct = round((change / prev * 100) if prev else 0, 1)
        team_abbrev = p["team"]
        out.append(PlayerOut(
            id=p["id"],
            name=p["name"],
            team=team_abbrev,
            position=p["position"],
            player_type=p["player_type"],
            eligible_positions=p["eligible_positions"],
            projected_war=float(p["projected_war"] or 0),
            war_ytd=float(p["war_ytd"] or 0),
            games_played=p["games_played"] or 0,
            current_price=curr,
            prev_price=prev,
            price_change=change,
            price_change_pct=pct,
            volume=vol_map.get(p["id"], 0),
            opponent=schedule.get(team_abbrev, ""),
            tb_k=None,         # future: rolling 14d total bases / K's
            price_history=[round(v) for v in _fake_history(p["id"], curr, 14, 0.06)],
            war_history=[round(v, 1) for v in _fake_history(p["id"], float(p["war_ytd"] or 0.1), 10, 0.15)],
        ))

    # Sort
    sort_keys = {
        "price": lambda x: x.current_price,
        "war": lambda x: x.war_ytd,
        "name": lambda x: x.name,
        "change": lambda x: x.price_change_pct,
        "projected": lambda x: x.projected_war,
    }
    key_fn = sort_keys.get(sort, sort_keys["price"])
    out.sort(key=key_fn, reverse=(order == "desc"))

    return out


@router.get("/{player_id}", response_model=PlayerDetail)
def get_player(player_id: int):
    sb = get_supabase()
    result = sb.table("players").select("*").eq("id", player_id).single().execute()
    p = result.data
    if not p:
        from fastapi import HTTPException
        raise HTTPException(404, "Player not found")

    curr = p["current_price"] or 0
    prev = p["prev_price"] or curr
    change = curr - prev
    pct = round((change / prev * 100) if prev else 0, 1)

    return PlayerDetail(
        id=p["id"],
        name=p["name"],
        team=p["team"],
        position=p["position"],
        player_type=p["player_type"],
        eligible_positions=p["eligible_positions"],
        projected_war=float(p["projected_war"] or 0),
        war_ytd=float(p["war_ytd"] or 0),
        games_played=p["games_played"] or 0,
        current_price=curr,
        prev_price=prev,
        price_change=change,
        price_change_pct=pct,
        season_ops=float(p["season_ops"]) if p.get("season_ops") else None,
        recent_ops=float(p["recent_ops"]) if p.get("recent_ops") else None,
        season_era=float(p["season_era"]) if p.get("season_era") else None,
        recent_era=float(p["recent_era"]) if p.get("recent_era") else None,
        hard_hit_pct=float(p["hard_hit_pct"]) if p.get("hard_hit_pct") else None,
    )
