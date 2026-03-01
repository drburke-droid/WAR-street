from fastapi import APIRouter, Query
from db.client import get_supabase
from models.player import PlayerOut, PlayerDetail

router = APIRouter(prefix="/players", tags=["players"])


@router.get("", response_model=list[PlayerOut])
def list_players(
    team: str | None = Query(None, description="Filter by team abbreviation"),
    position: str | None = Query(None, description="Filter by position (H or P)"),
    sort: str = Query("price", description="Sort field: price, war, name, change"),
    order: str = Query("desc", description="Sort order: asc or desc"),
):
    sb = get_supabase()
    q = sb.table("players").select("*")

    if team:
        q = q.eq("team", team.upper())
    if position:
        q = q.eq("player_type", position.upper())

    result = q.execute()
    players = result.data

    # Compute change fields
    out = []
    for p in players:
        curr = p["current_price"] or 0
        prev = p["prev_price"] or curr
        change = curr - prev
        pct = round((change / prev * 100) if prev else 0, 1)
        out.append(PlayerOut(
            id=p["id"],
            name=p["name"],
            team=p["team"],
            position=p["position"],
            player_type=p["player_type"],
            eligible_positions=p["eligible_positions"],
            projected_war=float(p["projected_war"] or 0),
            war_ytd=float(p["war_ytd"] or 0),
            games_played=p["games_played"] or 0,
            current_price=curr,
            prev_price=prev,
            price_change=change,
            price_change_pct=pct,
        ))

    # Sort
    sort_keys = {
        "price": lambda x: x.current_price,
        "war": lambda x: x.war_ytd,
        "name": lambda x: x.name,
        "change": lambda x: x.price_change_pct,
        "projected": lambda x: x.projected_war,
    }
    key_fn = sort_keys.get(sort, sort_keys["price"])
    out.sort(key=key_fn, reverse=(order == "desc"))

    return out


@router.get("/{player_id}", response_model=PlayerDetail)
def get_player(player_id: int):
    sb = get_supabase()
    result = sb.table("players").select("*").eq("id", player_id).single().execute()
    p = result.data
    if not p:
        from fastapi import HTTPException
        raise HTTPException(404, "Player not found")

    curr = p["current_price"] or 0
    prev = p["prev_price"] or curr
    change = curr - prev
    pct = round((change / prev * 100) if prev else 0, 1)

    return PlayerDetail(
        id=p["id"],
        name=p["name"],
        team=p["team"],
        position=p["position"],
        player_type=p["player_type"],
        eligible_positions=p["eligible_positions"],
        projected_war=float(p["projected_war"] or 0),
        war_ytd=float(p["war_ytd"] or 0),
        games_played=p["games_played"] or 0,
        current_price=curr,
        prev_price=prev,
        price_change=change,
        price_change_pct=pct,
        season_ops=float(p["season_ops"]) if p.get("season_ops") else None,
        recent_ops=float(p["recent_ops"]) if p.get("recent_ops") else None,
        season_era=float(p["season_era"]) if p.get("season_era") else None,
        recent_era=float(p["recent_era"]) if p.get("recent_era") else None,
        hard_hit_pct=float(p["hard_hit_pct"]) if p.get("hard_hit_pct") else None,
    )
