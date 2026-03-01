"""
Nightly price recalculation and weekly transaction reset.
Cron: 6:30 AM ET daily (prices), Monday 12:00 AM (tx reset).

Run: python -m pipeline.recalc
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date
from services.pricing import recalculate_all_prices, recalculate_owner_war, reset_weekly_transactions


def nightly():
    """Run the full nightly recalculation."""
    print("Recalculating all player prices...")
    count = recalculate_all_prices()
    print(f"Updated prices for {count} players")

    print("Recalculating owner WAR totals...")
    recalculate_owner_war()
    print("Done")


def monday_reset():
    """Reset weekly transaction counters (run Monday midnight)."""
    if date.today().weekday() == 0:  # Monday
        print("Monday — resetting weekly transaction counters...")
        reset_weekly_transactions()
        print("Done")
    else:
        print(f"Not Monday (day {date.today().weekday()}), skipping tx reset")


if __name__ == "__main__":
    nightly()
    monday_reset()
