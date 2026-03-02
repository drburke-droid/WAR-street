"""Auth routes: register (claim team) and login."""

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth import hash_password, verify_password, create_token
from db.client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterBody(BaseModel):
    email: str
    password: str
    team_name: str


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(body: RegisterBody):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email format")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    sb = get_supabase()

    # Check if email already taken
    existing_email = (
        sb.table("owners").select("id").eq("email", email).execute()
    )
    if existing_email.data:
        raise HTTPException(409, "Email already registered")

    # Check if team name exists
    existing_team = (
        sb.table("owners")
        .select("id, email")
        .eq("name", body.team_name.strip())
        .execute()
    )

    if existing_team.data:
        team = existing_team.data[0]
        if team.get("email"):
            raise HTTPException(409, "Team name already taken")
        # Claim unclaimed team — attach credentials
        sb.table("owners").update({
            "email": email,
            "password_hash": hash_password(body.password),
        }).eq("id", team["id"]).execute()
        token = create_token(team["id"])
        return {"token": token, "owner_id": team["id"], "team_name": body.team_name.strip()}

    # Create new team
    result = sb.table("owners").insert({
        "name": body.team_name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
    }).execute()
    if not result.data:
        raise HTTPException(400, "Could not create team")
    owner = result.data[0]
    token = create_token(owner["id"])
    return {"token": token, "owner_id": owner["id"], "team_name": owner["name"]}


@router.post("/login")
def login(body: LoginBody):
    email = body.email.strip().lower()
    sb = get_supabase()

    result = sb.table("owners").select("*").eq("email", email).execute()
    if not result.data:
        raise HTTPException(401, "Invalid email or password")
    owner = result.data[0]

    if not owner.get("password_hash"):
        raise HTTPException(401, "Invalid email or password")

    if not verify_password(body.password, owner["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = create_token(owner["id"])
    return {"token": token, "owner_id": owner["id"], "team_name": owner["name"]}
