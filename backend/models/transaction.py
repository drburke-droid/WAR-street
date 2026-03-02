from pydantic import BaseModel
from datetime import datetime


class TransactionCreate(BaseModel):
    player_id: int
    slot: str


class TransactionOut(BaseModel):
    id: int
    owner_id: int
    player_id: int
    action: str
    price: int
    slot: str
    created_at: datetime


class LeaderboardEntry(BaseModel):
    owner_id: int
    name: str
    total_war: float
    portfolio_value: int
