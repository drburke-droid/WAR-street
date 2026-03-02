from pydantic import BaseModel


class BatterLine(BaseModel):
    name: str        # "Judge RF"
    ab: int
    r: int
    h: int
    rbi: int
    bb: int
    so: int
    avg: str         # ".310"


class PitcherLine(BaseModel):
    name: str        # "Cole (W, 5-1)"
    ip: str          # "6.2"
    h: int
    r: int
    er: int
    bb: int
    so: int
    era: str         # "3.45"


class TeamBox(BaseModel):
    abbrev: str      # "NYY"
    name: str        # "New York Yankees"
    innings: list[int | None]  # per-inning runs
    r: int
    h: int
    e: int
    batters: list[BatterLine]
    pitchers: list[PitcherLine]


class GameBox(BaseModel):
    game_pk: int
    status: str      # "Final", "Final/10"
    away: TeamBox
    home: TeamBox
    notes: str       # "WP: Cole. LP: Burnes. SV: Holmes. HR: Judge (30)."


class BoxScoreResponse(BaseModel):
    date: str
    game_count: int
    games: list[GameBox]


class LeaderEntry(BaseModel):
    rank: int
    name: str       # "Aaron Judge"
    team: str       # "NYY"
    value: str      # "52" or ".331"


class LeaderCategory(BaseModel):
    category: str           # "Home Runs"
    stat_group: str         # "hitting" or "pitching"
    leaders: list[LeaderEntry]


class LeadersResponse(BaseModel):
    season: int
    categories: list[LeaderCategory]
