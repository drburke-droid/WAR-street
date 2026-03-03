"""Auth routes: register and login."""

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth import hash_password, verify_password, create_token
from db.client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Profanity word list — matched as whole words, case-insensitive
_BAD_WORDS = {
    "ass", "asses", "asshole", "assholes",
    "bastard", "bastards", "bitch", "bitches",
    "blowjob", "bollock", "bollocks", "boner",
    "boob", "boobs", "bugger", "butt", "buttplug",
    "clitoris", "cock", "cocks", "coon", "crap",
    "cunt", "cunts", "damn", "dick", "dicks",
    "dildo", "dyke", "fag", "fags", "faggot",
    "fellate", "fellatio", "flange",
    "fuck", "fucked", "fucker", "fuckers", "fucking", "fucks",
    "goddamn", "godsdamn", "handjob",
    "hell", "homo", "horny", "jerk", "jizz",
    "knobend", "labia",
    "muff", "negro", "nigga", "nigger", "niggers",
    "nob", "penis", "piss", "poop",
    "prick", "pube", "pussy", "queer",
    "scrotum", "sex", "shit", "shits", "shitty",
    "skank", "slut", "sluts", "smegma",
    "spunk", "tit", "tits", "tosser", "turd",
    "twat", "vagina", "wank", "wanker", "whore", "whores",
}
_BAD_RE = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in sorted(_BAD_WORDS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def _has_profanity(text: str) -> bool:
    return bool(_BAD_RE.search(text))


class RegisterBody(BaseModel):
    email: str
    password: str
    team_name: str
    first_name: str
    last_name: str


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
    if not body.first_name.strip():
        raise HTTPException(400, "First name is required")
    if not body.last_name.strip():
        raise HTTPException(400, "Last name is required")
    if not body.team_name.strip():
        raise HTTPException(400, "Team name is required")

    for field, label in [
        (body.first_name, "First name"),
        (body.last_name, "Last name"),
        (body.team_name, "Team name"),
    ]:
        if _has_profanity(field):
            raise HTTPException(400, f"{label} contains inappropriate language")

    sb = get_supabase()

    # Check if email already taken
    existing_email = (
        sb.table("owners").select("id").eq("email", email).execute()
    )
    if existing_email.data:
        raise HTTPException(409, "Email already registered")

    # Check if team name already taken
    existing_team = (
        sb.table("owners").select("id").eq("name", body.team_name.strip()).execute()
    )
    if existing_team.data:
        raise HTTPException(409, "Team name already taken")

    # Create new team
    result = sb.table("owners").insert({
        "name": body.team_name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
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
