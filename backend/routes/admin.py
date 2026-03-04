"""Admin routes: weekly reset, cleanup, password reset, pipeline triggers. Protected by JWT_SECRET as admin key."""

import logging
import os
import secrets

from fastapi import APIRouter, HTTPException, Header

from auth import hash_password
from db.client import get_supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _check_admin_key(x_admin_key: str = Header(None)):
    """Verify the request carries the admin key (same as JWT_SECRET)."""
    expected = os.getenv("JWT_SECRET", "")
    if not x_admin_key or x_admin_key != expected:
        raise HTTPException(403, "Forbidden")


@router.post("/reset-transactions")
def reset_transactions(x_admin_key: str = Header(None)):
    """Reset all owners' transactions_this_week to 0. Run every Monday."""
    _check_admin_key(x_admin_key)
    sb = get_supabase_admin()
    result = (
        sb.table("owners")
        .update({"transactions_this_week": 0})
        .gte("transactions_this_week", 1)
        .execute()
    )
    count = len(result.data) if result.data else 0
    return {"reset": count, "message": f"Reset transactions for {count} owner(s)"}


@router.post("/reset-password/{owner_id}")
def reset_password(owner_id: int, x_admin_key: str = Header(None)):
    """Generate a temporary password for an owner. Admin distributes it out-of-band."""
    _check_admin_key(x_admin_key)
    sb = get_supabase_admin()
    temp_password = secrets.token_urlsafe(8)
    result = (
        sb.table("owners")
        .update({"password_hash": hash_password(temp_password)})
        .eq("id", owner_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Owner not found")
    return {"owner_id": owner_id, "temp_password": temp_password}


@router.delete("/owners/{owner_id}")
def delete_owner(owner_id: int, x_admin_key: str = Header(None)):
    """Delete an owner and their roster/transaction data."""
    _check_admin_key(x_admin_key)
    sb = get_supabase_admin()
    sb.table("transactions").delete().eq("owner_id", owner_id).execute()
    sb.table("roster_entries").delete().eq("owner_id", owner_id).execute()
    result = sb.table("owners").delete().eq("id", owner_id).execute()
    if not result.data:
        raise HTTPException(404, "Owner not found")
    return {"deleted": owner_id}


# --------------- Pipeline triggers ---------------

@router.post("/pipeline/war-pull")
def pipeline_war_pull(x_admin_key: str = Header(None)):
    """Pull updated WAR from FanGraphs via pybaseball."""
    _check_admin_key(x_admin_key)
    try:
        from pipeline.war_pull import pull_war
        pull_war()
        return {"status": "ok", "step": "war-pull"}
    except Exception as e:
        logger.exception("war-pull failed")
        raise HTTPException(500, f"war-pull failed: {e}")


@router.post("/pipeline/boxscores")
def pipeline_boxscores(x_admin_key: str = Header(None)):
    """Pull yesterday's box scores from MLB Stats API."""
    _check_admin_key(x_admin_key)
    try:
        from pipeline.boxscores import pull_boxscores
        pull_boxscores()
        return {"status": "ok", "step": "boxscores"}
    except Exception as e:
        logger.exception("boxscores failed")
        raise HTTPException(500, f"boxscores failed: {e}")


@router.post("/pipeline/recalc")
def pipeline_recalc(x_admin_key: str = Header(None)):
    """Recalculate all prices and owner WAR totals."""
    _check_admin_key(x_admin_key)
    try:
        from pipeline.recalc import nightly
        nightly()
        return {"status": "ok", "step": "recalc"}
    except Exception as e:
        logger.exception("recalc failed")
        raise HTTPException(500, f"recalc failed: {e}")
