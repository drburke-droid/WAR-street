from pydantic import BaseModel


class OwnerOut(BaseModel):
    id: int
    name: str
    budget_remaining: int
    transactions_this_week: int
    total_war: float


class RosterEntry(BaseModel):
    slot: str
    player_id: int
    player_name: str
    player_team: str
    player_position: str
    current_price: int
    purchase_price: int
    war_ytd: float


class OwnerDetail(OwnerOut):
    roster: list[RosterEntry] = []
    portfolio_value: int = 0
