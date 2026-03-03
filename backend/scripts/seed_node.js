/**
 * Node.js seed script — ports seed_players.py + pricing engine to JS.
 * Reads player data from seed_players.py and upserts to Supabase.
 *
 * Usage: node seed_node.js
 */

const fs = require('fs');
const path = require('path');

// ── Supabase config ──
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ygqojakabdtbzfxapzhf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// ── Pricing engine (ported from pricing/engine.py) ──
const WAR_DOLLAR = 8_000_000;
const MIN_PRICE  = 500_000;
const MAX_PRICE  = 80_000_000;
const GAMES_162  = 162;
const GP         = 45;

function sigmoidBlend(gamesPlayed) {
  const a = 1.0 / (1.0 + Math.exp(-0.05 * (gamesPlayed - 81)));
  const p = Math.max(0.05, 1.0 - a);
  return [p, 1.0 - p];
}

function effectiveWar(projected, ytd, gamesPlayed) {
  const [pW, aW] = sigmoidBlend(gamesPlayed);
  if (gamesPlayed > 0) {
    const annualized = (ytd / gamesPlayed) * GAMES_162;
    return Math.max(0.0, pW * projected + aW * annualized);
  }
  return Math.max(0.0, projected);
}

function hitterMomentum(recentOps, seasonOps, hardHit) {
  if (!hardHit || !recentOps || !seasonOps || seasonOps === 0) return 0.0;
  return Math.max(-0.08, Math.min(0.08, recentOps / seasonOps - 1.0));
}

function pitcherMomentum(recentEra, seasonEra, hardHit) {
  if (!hardHit || recentEra == null || !seasonEra) return 0.0;
  if (recentEra === 0) return 0.08;
  return Math.max(-0.08, Math.min(0.08, seasonEra / recentEra - 1.0));
}

function calcPrice(playerType, projectedWar, warYtd, gamesPlayed, prevPrice, ownershipPct, opts = {}) {
  const eWar = effectiveWar(projectedWar, warYtd, gamesPlayed);
  const base = eWar * WAR_DOLLAR;

  let momentum;
  if (playerType === 'P') {
    momentum = pitcherMomentum(opts.recentEra, opts.seasonEra, opts.hardHit);
  } else {
    momentum = hitterMomentum(opts.recentOps, opts.seasonOps, opts.hardHit);
  }

  const popularity = ownershipPct * 0.10;
  const fallbackPrev = prevPrice || Math.round(base);
  const raw = 0.80 * (base * (1 + popularity)) + 0.20 * (fallbackPrev * (1 + momentum));

  const price = Math.max(MIN_PRICE, Math.min(MAX_PRICE, Math.round(raw / 10_000) * 10_000));
  return { price, effective_war: Math.round(eWar * 100) / 100, momentum: Math.round(momentum * 10000) / 10000 };
}

// ── Parse seed_players.py ──
function parseSeedFile() {
  const filePath = path.join(__dirname, 'seed_players.py');
  const content = fs.readFileSync(filePath, 'utf8');

  const hittersMatch = content.match(/HITTERS\s*=\s*\[([\s\S]*?)\n\]/);
  const pitchersMatch = content.match(/PITCHERS\s*=\s*\[([\s\S]*?)\n\]/);

  if (!hittersMatch || !pitchersMatch) {
    throw new Error('Could not parse HITTERS or PITCHERS from seed_players.py');
  }

  const parseEntries = (block) => {
    const entries = [];
    const re = /\{[^}]+\}/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      let s = m[0].replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
      entries.push(JSON.parse(s));
    }
    return entries;
  };

  return {
    hitters: parseEntries(hittersMatch[1]),
    pitchers: parseEntries(pitchersMatch[1]),
  };
}

// ── Build rows ──
function buildRows(hitters, pitchers) {
  const rows = [];

  for (const h of hitters) {
    const prevPrice = Math.round((h.pj || 2) * WAR_DOLLAR);
    const result = calcPrice('H', h.pj, h.w, GP, prevPrice, 0, {
      seasonOps: h.so, recentOps: h.r3, hardHit: h.hd,
    });
    rows.push({
      id: h.id,
      name: h.nm,
      team: h.tm,
      position: h.ps,
      player_type: 'H',
      eligible_positions: h.el,
      projected_war: h.pj,
      war_ytd: h.w,
      games_played: GP,
      current_price: result.price,
      prev_price: prevPrice,
      season_ops: h.so,
      recent_ops: h.r3,
      season_era: null,
      recent_era: null,
      hard_hit_pct: h.hd,
    });
  }

  for (const p of pitchers) {
    const prevPrice = Math.round((p.pj || 2) * WAR_DOLLAR);
    const result = calcPrice('P', p.pj, p.w, GP, prevPrice, 0, {
      seasonEra: p.se, recentEra: p.r3, hardHit: p.hd,
    });
    rows.push({
      id: p.id,
      name: p.nm,
      team: p.tm,
      position: p.ps,
      player_type: 'P',
      eligible_positions: p.el,
      projected_war: p.pj,
      war_ytd: p.w,
      games_played: GP,
      current_price: result.price,
      prev_price: prevPrice,
      season_ops: null,
      recent_ops: null,
      season_era: p.se,
      recent_era: p.r3,
      hard_hit_pct: p.hd,
    });
  }

  return rows;
}

// ── Upsert to Supabase in batches ──
async function upsertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`);
  }
  return res.status;
}

async function main() {
  console.log('Parsing seed_players.py...');
  const { hitters, pitchers } = parseSeedFile();
  console.log(`Found ${hitters.length} hitters, ${pitchers.length} pitchers`);

  console.log('Calculating prices...');
  const rows = buildRows(hitters, pitchers);
  console.log(`Built ${rows.length} player rows`);

  // Upsert in batches of 100
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const status = await upsertBatch(batch);
    inserted += batch.length;
    console.log(`  Upserted ${inserted}/${rows.length} (HTTP ${status})`);
  }

  console.log(`\nDone! Seeded ${rows.length} players (${hitters.length} hitters, ${pitchers.length} pitchers)`);
}

main().catch(err => { console.error(err); process.exit(1); });
