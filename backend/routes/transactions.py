from fastapi import APIRouter
from models.transaction import TransactionCreate
from services.roster import buy_player, sell_player

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/buy")
def buy(tx: TransactionCreate):
    return buy_player(tx.owner_id, tx.player_id, tx.slot)


@router.post("/sell")
def sell(tx: TransactionCreate):
    return sell_player(tx.owner_id, tx.player_id, tx.slot)
