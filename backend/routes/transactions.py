from fastapi import APIRouter, Depends
from auth import get_current_owner
from models.transaction import TransactionCreate
from services.roster import buy_player, sell_player

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/buy")
def buy(tx: TransactionCreate, owner_id: int = Depends(get_current_owner)):
    return buy_player(owner_id, tx.player_id, tx.slot)


@router.post("/sell")
def sell(tx: TransactionCreate, owner_id: int = Depends(get_current_owner)):
    return sell_player(owner_id, tx.player_id, tx.slot)
