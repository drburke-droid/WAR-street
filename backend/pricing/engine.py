"""
Deterministic pricing engine — Python port of war-street.jsx lines 19-24.
Zero randomness. All price movement traces to real baseball events.
"""

import math

WAR_DOLLAR = 8_000_000   # $8M per WAR
MIN_PRICE = 500_000       # $500K floor
MAX_PRICE = 80_000_000    # $80M cap
GAMES_162 = 162


def sigmoid_blend(games_played: int) -> tuple[float, float]:
    """Return (projection_weight, actual_weight) based on games played.
    Game 1-25: ~85% proj / 15% actual
    Game 81:   ~40/60
    Game 140+: ~8/92
    """
    a = 1.0 / (1.0 + math.exp(-0.05 * (games_played - 81)))
    p = max(0.05, 1.0 - a)
    return p, 1.0 - p


def effective_war(projected: float, ytd: float, games_played: int) -> float:
    """Blend projected WAR with annualized YTD WAR via sigmoid."""
    p_weight, a_weight = sigmoid_blend(games_played)
    if games_played > 0:
        annualized = (ytd / games_played) * GAMES_162
        return max(0.0, p_weight * projected + a_weight * annualized)
    return max(0.0, projected)


def hitter_momentum(recent_ops: float | None, season_ops: float | None,
                     hard_hit: float | None) -> float:
    """OPS ratio momentum for hitters, capped +/-8%."""
    if not hard_hit or not recent_ops or not season_ops or season_ops == 0:
        return 0.0
    return max(-0.08, min(0.08, recent_ops / season_ops - 1.0))


def pitcher_momentum(recent_era: float | None, season_era: float | None,
                      hard_hit: float | None) -> float:
    """Inverse ERA ratio momentum for pitchers, capped +/-8%.
    Lower recent ERA = positive momentum.
    """
    if not hard_hit or recent_era is None or not season_era:
        return 0.0
    if recent_era == 0:
        return 0.08
    return max(-0.08, min(0.08, season_era / recent_era - 1.0))


def calc_price(
    player_type: str,
    projected_war: float,
    war_ytd: float,
    games_played: int,
    prev_price: int | None,
    ownership_pct: float,
    season_ops: float | None = None,
    recent_ops: float | None = None,
    season_era: float | None = None,
    recent_era: float | None = None,
    hard_hit: float | None = None,
) -> dict:
    """Calculate player price using the deterministic formula.

    Returns dict with keys: price, effective_war, momentum
    """
    e_war = effective_war(projected_war, war_ytd, games_played)
    base = e_war * WAR_DOLLAR

    if player_type == "P":
        momentum = pitcher_momentum(recent_era, season_era, hard_hit)
    else:
        momentum = hitter_momentum(recent_ops, season_ops, hard_hit)

    # Hidden popularity premium — never shown to users
    popularity = ownership_pct * 0.10

    fallback_prev = prev_price if prev_price else int(base)
    raw = 0.80 * (base * (1 + popularity)) + 0.20 * (fallback_prev * (1 + momentum))

    # Clamp and round to nearest $10K
    price = max(MIN_PRICE, min(MAX_PRICE, round(raw / 10_000) * 10_000))

    return {"price": price, "effective_war": round(e_war, 2), "momentum": round(momentum, 4)}


def format_price(n: int) -> str:
    """Format price for display: $52.3M / $800K."""
    if abs(n) >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if abs(n) >= 1_000:
        return f"${n // 1_000}K"
    return f"${n}"
