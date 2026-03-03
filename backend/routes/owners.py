from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_owner
from db.client import get_supabase
from models.owner import OwnerDetail, RosterEntry

router = APIRouter(prefix="/owners", tags=["owners"])


@router.get("/{owner_id}", response_model=OwnerDetail)
def get_owner(owner_id: int, token_owner: int = Depends(get_current_owner)):
    if token_owner != owner_id:
        raise HTTPException(403, "Not authorized to view this owner")

    sb = get_supabase()

    # Fetch owner
    result = sb.table("owners").select("*").eq("id", owner_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Owner not found")
    o = result.data

    # Fetch roster with player details
    roster_rows = (
        sb.table("roster_entries")
        .select("slot, purchase_price, purchased_at, player_id, players(name, team, position, current_price, war_ytd)")
        .eq("owner_id", owner_id)
        .execute()
    )

    roster = []
    portfolio_value = 0
    for r in roster_rows.data:
        p = r["players"]
        curr_price = p["current_price"] or 0
        portfolio_value += curr_price
        roster.append(RosterEntry(
            slot=r["slot"],
            player_id=r["player_id"],
            player_name=p["name"],
            player_team=p["team"],
            player_position=p["position"],
            current_price=curr_price,
            purchase_price=r["purchase_price"],
            war_ytd=float(p["war_ytd"] or 0),
            purchased_at=r["purchased_at"],
        ))

    return OwnerDetail(
        id=o["id"],
        name=o["name"],
        first_name=o.get("first_name"),
        last_name=o.get("last_name"),
        budget_remaining=o["budget_remaining"],
        transactions_this_week=o["transactions_this_week"],
        total_war=float(o["total_war"] or 0),
        roster=roster,
        portfolio_value=portfolio_value,
    )
