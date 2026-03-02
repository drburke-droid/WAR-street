from datetime import datetime, timedelta, timezone
from functools import lru_cache
import logging

import httpx
from fastapi import APIRouter, Query

from models.boxscore import (
    BatterLine, PitcherLine, TeamBox, GameBox, BoxScoreResponse,
    LeaderEntry, LeaderCategory, LeadersResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/boxscores", tags=["boxscores"])

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


def _abbrev(team_name: str) -> str:
    return _MLB_ABBREVS.get(team_name, team_name[:3].upper())


def _safe_avg(season_stats: dict) -> str:
    """Get batting avg from seasonStats (game-level stats don't have avg)."""
    bat = season_stats.get("batting", {})
    avg = bat.get("avg", ".000")
    if avg and avg != "-.---":
        return avg
    return ".000"


def _safe_era(season_stats: dict) -> str:
    """Get ERA from seasonStats."""
    pit = season_stats.get("pitching", {})
    era = pit.get("era", "0.00")
    if era and era != "-.--":
        return era
    return "0.00"


def _build_team_box(game: dict, side: str, box: dict) -> TeamBox:
    """Build a TeamBox from schedule game (linescore) + separate boxscore data."""
    team_data = game["teams"][side]["team"]
    team_name = team_data["name"]
    abbrev = _abbrev(team_name)

    # Line score innings (from schedule hydrate=linescore)
    linescore = game.get("linescore", {})
    innings_data = linescore.get("innings", [])
    innings = []
    for inn in innings_data:
        runs = inn.get(side, {}).get("runs")
        innings.append(runs)

    totals = linescore.get("teams", {}).get(side, {})
    r = totals.get("runs", 0)
    h = totals.get("hits", 0)
    e = totals.get("errors", 0)

    # Batters and pitchers from separate boxscore fetch
    team_box = box.get("teams", {}).get(side, {})
    batting_order = team_box.get("battingOrder", [])
    players_dict = team_box.get("players", {})

    batters: list[BatterLine] = []
    for pid in batting_order:
        key = f"ID{pid}"
        p = players_dict.get(key, {})
        person = p.get("person", {})
        pos = p.get("position", {}).get("abbreviation", "")
        stats = p.get("stats", {}).get("batting", {})
        if not stats or not stats.get("atBats") and not stats.get("plateAppearances"):
            continue
        name = person.get("fullName", "???")
        parts = name.split()
        short = parts[-1] if len(parts) > 1 else name

        # Season avg from seasonStats
        season = p.get("seasonStats", {})
        avg = _safe_avg(season)

        batters.append(BatterLine(
            name=f"{short} {pos}",
            ab=stats.get("atBats", 0),
            r=stats.get("runs", 0),
            h=stats.get("hits", 0),
            rbi=stats.get("rbi", 0),
            bb=stats.get("baseOnBalls", 0),
            so=stats.get("strikeOuts", 0),
            avg=avg,
        ))

    # Pitchers
    pitchers: list[PitcherLine] = []
    pitcher_ids = team_box.get("pitchers", [])
    decisions = game.get("decisions", {})
    for pid in pitcher_ids:
        key = f"ID{pid}"
        p = players_dict.get(key, {})
        person = p.get("person", {})
        stats = p.get("stats", {}).get("pitching", {})
        if not stats or not stats.get("inningsPitched"):
            continue
        name = person.get("fullName", "???")
        parts = name.split()
        short = parts[-1] if len(parts) > 1 else name

        # Check for decision
        decision = ""
        if decisions:
            winner = decisions.get("winner", {})
            loser = decisions.get("loser", {})
            save = decisions.get("save", {})
            if winner and winner.get("id") == pid:
                w = stats.get("wins", 0)
                l = stats.get("losses", 0)
                decision = f" (W, {w}-{l})"
            elif loser and loser.get("id") == pid:
                w = stats.get("wins", 0)
                l = stats.get("losses", 0)
                decision = f" (L, {w}-{l})"
            elif save and save.get("id") == pid:
                sv = stats.get("saves", 0)
                decision = f" (S, {sv})"

        ip = stats.get("inningsPitched", "0.0")
        season = p.get("seasonStats", {})
        era = _safe_era(season)

        pitchers.append(PitcherLine(
            name=f"{short}{decision}",
            ip=str(ip),
            h=stats.get("hits", 0),
            r=stats.get("runs", 0),
            er=stats.get("earnedRuns", 0),
            bb=stats.get("baseOnBalls", 0),
            so=stats.get("strikeOuts", 0),
            era=era,
        ))

    return TeamBox(
        abbrev=abbrev,
        name=team_name,
        innings=innings,
        r=r, h=h, e=e,
        batters=batters,
        pitchers=pitchers,
    )


def _build_notes(game: dict) -> str:
    """Build notes string: WP, LP, SV."""
    parts = []
    decisions = game.get("decisions", {})
    if decisions:
        w = decisions.get("winner", {})
        l = decisions.get("loser", {})
        s = decisions.get("save", {})
        if w:
            parts.append(f"WP: {w.get('fullName', '???').split()[-1]}")
        if l:
            parts.append(f"LP: {l.get('fullName', '???').split()[-1]}")
        if s:
            parts.append(f"SV: {s.get('fullName', '???').split()[-1]}")
    return ". ".join(parts) + ("." if parts else "")


@lru_cache(maxsize=3)
def _fetch_schedule(date_str: str) -> dict:
    """Fetch schedule with linescores and decisions. Cached per date."""
    url = (
        f"https://statsapi.mlb.com/api/v1/schedule"
        f"?date={date_str}&sportId=1"
        f"&hydrate=linescore,decisions"
    )
    resp = httpx.get(url, timeout=15)
    resp.raise_for_status()
    return resp.json()


@lru_cache(maxsize=30)
def _fetch_game_boxscore(game_pk: int) -> dict:
    """Fetch individual game boxscore. Cached per game."""
    url = f"https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()


@router.get("", response_model=BoxScoreResponse)
def get_boxscores(
    date: str | None = Query(None, description="Date in YYYY-MM-DD format (defaults to yesterday ET)"),
):
    if date:
        date_str = date
    else:
        now_utc = datetime.now(timezone.utc)
        eastern = now_utc - timedelta(hours=5)
        yesterday = eastern.date() - timedelta(days=1)
        date_str = yesterday.isoformat()

    try:
        schedule = _fetch_schedule(date_str)
    except Exception:
        logger.exception("MLB schedule fetch failed for %s", date_str)
        return BoxScoreResponse(date=date_str, game_count=0, games=[])

    dates = schedule.get("dates", [])
    if not dates:
        return BoxScoreResponse(date=date_str, game_count=0, games=[])

    games_data = dates[0].get("games", [])
    games: list[GameBox] = []

    for g in games_data:
        try:
            status = g.get("status", {}).get("detailedState", "Unknown")
            if status not in ("Final", "Game Over"):
                if "Final" not in status and "Completed" not in status:
                    continue

            game_pk = g.get("gamePk", 0)

            # Fetch individual boxscore for this game
            try:
                box = _fetch_game_boxscore(game_pk)
            except Exception:
                logger.warning("Boxscore fetch failed for game %s", game_pk)
                box = {}

            linescore = g.get("linescore", {})
            num_innings = linescore.get("currentInning", 9)
            status_str = "Final" if num_innings == 9 else f"Final/{num_innings}"

            away = _build_team_box(g, "away", box)
            home = _build_team_box(g, "home", box)
            notes = _build_notes(g)

            games.append(GameBox(
                game_pk=game_pk,
                status=status_str,
                away=away,
                home=home,
                notes=notes,
            ))
        except Exception:
            logger.exception("Failed to parse game %s", g.get("gamePk", "?"))
            continue

    return BoxScoreResponse(
        date=date_str,
        game_count=len(games),
        games=games,
    )


# ── League Leaders ──────────────────────────────────────────

_LEADER_CATEGORIES = "homeRuns,battingAverage,runsBattedIn,stolenBases,earnedRunAverage,strikeouts,wins,saves"

# (leaderCategory, statGroup from API) → (display name, our stat_group label)
_CATEGORY_DISPLAY = {
    ("homeRuns", "hitting"): ("Home Runs", "hitting"),
    ("battingAverage", "hitting"): ("Batting Avg", "hitting"),
    ("runsBattedIn", "hitting"): ("RBI", "hitting"),
    ("stolenBases", "hitting"): ("Stolen Bases", "hitting"),
    ("earnedRunAverage", "pitching"): ("ERA", "pitching"),
    ("strikeouts", "pitching"): ("Strikeouts", "pitching"),
    ("wins", "pitching"): ("Wins", "pitching"),
    ("saves", "pitching"): ("Saves", "pitching"),
}


@lru_cache(maxsize=2)
def _fetch_leaders(season: str) -> list:
    """Fetch league leaders from MLB Stats API. Cached per season string."""
    url = (
        f"https://statsapi.mlb.com/api/v1/stats/leaders"
        f"?leaderCategories={_LEADER_CATEGORIES}"
        f"&season={season}&sportId=1&limit=5"
    )
    resp = httpx.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    categories = []
    for cat in data.get("leagueLeaders", []):
        cat_key = cat.get("leaderCategory", "")
        api_group = cat.get("statGroup", "")
        display = _CATEGORY_DISPLAY.get((cat_key, api_group))
        if not display:
            continue
        display_name, stat_group = display
        entries = []
        for leader in cat.get("leaders", [])[:5]:
            team_name = leader.get("team", {}).get("name", "")
            entries.append(LeaderEntry(
                rank=leader.get("rank", 0),
                name=leader.get("person", {}).get("fullName", "???"),
                team=_abbrev(team_name),
                value=leader.get("value", ""),
            ))
        categories.append(LeaderCategory(
            category=display_name,
            stat_group=stat_group,
            leaders=entries,
        ))
    return categories


@router.get("/leaders", response_model=LeadersResponse)
def get_leaders(
    season: int | None = Query(None, description="Season year (defaults to current year)"),
):
    now_utc = datetime.now(timezone.utc)
    yr = season or (now_utc - timedelta(hours=5)).year
    try:
        cats = _fetch_leaders(str(yr))
    except Exception:
        logger.exception("MLB leaders fetch failed for %s", yr)
        cats = []
    return LeadersResponse(season=yr, categories=cats)
