"""
Create 12 test owner entries with $300M budget each.

Run: python -m scripts.seed_teams
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.client import get_supabase

TEAM_NAMES = [
    "Wall Street Bulls",
    "Bearish Bombers",
    "Margin Call Mets",
    "Short Squeeze Sox",
    "Dividend Dodgers",
    "Bull Market Braves",
    "Penny Stock Pirates",
    "Blue Chip Jays",
    "IPO Astros",
    "HODL Rangers",
    "Futures Phillies",
    "Options Angels",
]


def seed():
    sb = get_supabase()
    rows = [{"name": name} for name in TEAM_NAMES]
    result = sb.table("owners").upsert(rows, on_conflict="name").execute()
    print(f"Seeded {len(result.data)} teams")
    for o in result.data:
        print(f"  ID {o['id']}: {o['name']} (${o['budget_remaining']:,})")


if __name__ == "__main__":
    seed()
