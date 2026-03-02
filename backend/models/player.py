from pydantic import BaseModel


class PlayerOut(BaseModel):
    id: int
    name: str
    team: str
    position: str
    player_type: str
    eligible_positions: list[str]
    projected_war: float
    war_ytd: float
    games_played: int
    current_price: int
    prev_price: int
    price_change: int = 0
    price_change_pct: float = 0.0
    volume: int = 0
    opponent: str = ""
    tb_k: int | None = None
    price_history: list[int] = []
    war_history: list[float] = []


class PlayerDetail(PlayerOut):
    season_ops: float | None = None
    recent_ops: float | None = None
    season_era: float | None = None
    recent_era: float | None = None
    hard_hit_pct: float | None = None
    ownership_pct: float | None = None  # Hidden from regular API; included for admin
