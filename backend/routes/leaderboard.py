from fastapi import APIRouter
from db.client import get_supabase
from models.transaction import LeaderboardEntry

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def get_leaderboard():
    sb = get_supabase()

    # Fetch all owners
    owners = sb.table("owners").select("id, name, total_war").order("total_war", desc=True).execute()

    entries = []
    for o in owners.data:
        # Calculate portfolio value from current roster
        roster = (
            sb.table("roster_entries")
            .select("player_id, players(current_price)")
            .eq("owner_id", o["id"])
            .execute()
        )
        portfolio = sum(r["players"]["current_price"] or 0 for r in roster.data)

        entries.append(LeaderboardEntry(
            owner_id=o["id"],
            name=o["name"],
            total_war=float(o["total_war"] or 0),
            portfolio_value=portfolio,
        ))

    # Sort by total WAR descending
    entries.sort(key=lambda e: e.total_war, reverse=True)
    return entries
