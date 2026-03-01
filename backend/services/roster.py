"""Buy/sell logic with slot validation, budget checks, and transaction limits."""

from fastapi import HTTPException
from db.client import get_supabase

HITTER_SLOTS = {"C", "1B", "2B", "3B", "SS", "OF1", "OF2", "OF3"}
PITCHER_SLOTS = {"SP1", "SP2", "SP3", "SP4", "RP"}
ALL_SLOTS = HITTER_SLOTS | PITCHER_SLOTS
MAX_TX_PER_WEEK = 2


def _validate_slot(slot: str, eligible: list[str]):
    if slot not in ALL_SLOTS:
        raise HTTPException(400, f"Invalid slot: {slot}")
    if slot not in eligible:
        raise HTTPException(400, f"Player not eligible for slot {slot}")


def buy_player(owner_id: int, player_id: int, slot: str) -> dict:
    sb = get_supabase()

    # Fetch owner
    owner = sb.table("owners").select("*").eq("id", owner_id).single().execute()
    if not owner.data:
        raise HTTPException(404, "Owner not found")
    owner = owner.data

    # Check transaction limit
    if owner["transactions_this_week"] >= MAX_TX_PER_WEEK:
        raise HTTPException(400, "Transaction limit reached (2/week)")

    # Fetch player
    player = sb.table("players").select("*").eq("id", player_id).single().execute()
    if not player.data:
        raise HTTPException(404, "Player not found")
    player = player.data

    # Validate slot eligibility
    _validate_slot(slot, player["eligible_positions"])

    # Check slot is empty
    existing = (
        sb.table("roster_entries")
        .select("id")
        .eq("owner_id", owner_id)
        .eq("slot", slot)
        .execute()
    )
    if existing.data:
        raise HTTPException(400, f"Slot {slot} is already filled")

    price = player["current_price"]

    # Check budget
    if owner["budget_remaining"] < price:
        raise HTTPException(400, "Insufficient budget")

    # Insert roster entry
    sb.table("roster_entries").insert({
        "owner_id": owner_id,
        "player_id": player_id,
        "slot": slot,
        "purchase_price": price,
    }).execute()

    # Update owner budget and tx count
    sb.table("owners").update({
        "budget_remaining": owner["budget_remaining"] - price,
        "transactions_this_week": owner["transactions_this_week"] + 1,
    }).eq("id", owner_id).execute()

    # Log transaction
    sb.table("transactions").insert({
        "owner_id": owner_id,
        "player_id": player_id,
        "action": "BUY",
        "price": price,
        "slot": slot,
    }).execute()

    # Recalculate ownership percentage for this player
    _update_ownership_pct(sb, player_id)

    return {"action": "BUY", "player": player["name"], "price": price, "slot": slot}


def sell_player(owner_id: int, player_id: int, slot: str) -> dict:
    sb = get_supabase()

    # Fetch owner
    owner = sb.table("owners").select("*").eq("id", owner_id).single().execute()
    if not owner.data:
        raise HTTPException(404, "Owner not found")
    owner = owner.data

    # Check transaction limit
    if owner["transactions_this_week"] >= MAX_TX_PER_WEEK:
        raise HTTPException(400, "Transaction limit reached (2/week)")

    # Verify roster entry exists
    entry = (
        sb.table("roster_entries")
        .select("*")
        .eq("owner_id", owner_id)
        .eq("player_id", player_id)
        .eq("slot", slot)
        .single()
        .execute()
    )
    if not entry.data:
        raise HTTPException(404, "Player not in that roster slot")

    # Get current price for sell value
    player = sb.table("players").select("*").eq("id", player_id).single().execute()
    price = player.data["current_price"]

    # Remove roster entry
    sb.table("roster_entries").delete().eq("id", entry.data["id"]).execute()

    # Update owner budget and tx count
    sb.table("owners").update({
        "budget_remaining": owner["budget_remaining"] + price,
        "transactions_this_week": owner["transactions_this_week"] + 1,
    }).eq("id", owner_id).execute()

    # Log transaction
    sb.table("transactions").insert({
        "owner_id": owner_id,
        "player_id": player_id,
        "action": "SELL",
        "price": price,
        "slot": slot,
    }).execute()

    # Recalculate ownership percentage
    _update_ownership_pct(sb, player_id)

    return {"action": "SELL", "player": player.data["name"], "price": price, "slot": slot}


def _update_ownership_pct(sb, player_id: int):
    """Recalculate ownership_pct for a player based on how many owners hold them."""
    total_owners = sb.table("owners").select("id", count="exact").execute()
    total = total_owners.count or 1

    holders = (
        sb.table("roster_entries")
        .select("id", count="exact")
        .eq("player_id", player_id)
        .execute()
    )
    held = holders.count or 0

    pct = round((held / total) * 100, 2)
    sb.table("players").update({"ownership_pct": pct}).eq("id", player_id).execute()
