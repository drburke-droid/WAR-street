"""Price recalculation orchestration — runs the engine on all players."""

from db.client import get_supabase
from pricing.engine import calc_price


def recalculate_all_prices():
    """Pull all players, recalculate prices, write back to DB."""
    sb = get_supabase()
    result = sb.table("players").select("*").execute()
    players = result.data

    for p in players:
        result = calc_price(
            player_type=p["player_type"],
            projected_war=float(p["projected_war"] or 0),
            war_ytd=float(p["war_ytd"] or 0),
            games_played=p["games_played"] or 0,
            prev_price=p["current_price"],
            ownership_pct=(p["ownership_pct"] or 0) / 100,  # stored as 0-100, engine wants 0-1
            season_ops=float(p["season_ops"]) if p.get("season_ops") else None,
            recent_ops=float(p["recent_ops"]) if p.get("recent_ops") else None,
            season_era=float(p["season_era"]) if p.get("season_era") else None,
            recent_era=float(p["recent_era"]) if p.get("recent_era") else None,
            hard_hit=float(p["hard_hit_pct"]) if p.get("hard_hit_pct") else None,
        )

        sb.table("players").update({
            "prev_price": p["current_price"],
            "current_price": result["price"],
        }).eq("id", p["id"]).execute()

    return len(players)


def recalculate_owner_war():
    """Update total_war for each owner based on their roster players' war_ytd."""
    sb = get_supabase()
    owners = sb.table("owners").select("id").execute()

    for o in owners.data:
        roster = (
            sb.table("roster_entries")
            .select("player_id")
            .eq("owner_id", o["id"])
            .execute()
        )
        if not roster.data:
            sb.table("owners").update({"total_war": 0}).eq("id", o["id"]).execute()
            continue

        player_ids = [r["player_id"] for r in roster.data]
        players = (
            sb.table("players")
            .select("war_ytd")
            .in_("id", player_ids)
            .execute()
        )
        total = sum(float(p["war_ytd"] or 0) for p in players.data)
        sb.table("owners").update({"total_war": round(total, 1)}).eq("id", o["id"]).execute()


def reset_weekly_transactions():
    """Reset all owners' transaction counters (run Monday midnight)."""
    sb = get_supabase()
    sb.table("owners").update({"transactions_this_week": 0}).neq("id", 0).execute()
