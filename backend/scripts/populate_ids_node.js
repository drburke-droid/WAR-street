/**
 * Populate mlb_id and fangraphs_id for players in Supabase.
 *
 * Uses MLB Stats API for mlb_id + Chadwick register CSV for fangraphs_id.
 * Run: node backend/scripts/populate_ids_node.js
 */

const https = require("https");

const SB_HOST = "ygqojakabdtbzfxapzhf.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlncW9qYWthYmR0YnpmeGFwemhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjMxODEwMywiZXhwIjoyMDg3ODk0MTAzfQ.VkF3MyClQc_s7tz8gi056Vi_x2Lzr6UHd32jC0KHFuY";

const TEAM_IDS = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CHW: 145,
  CIN: 113, CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118,
  LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121,
  NYY: 147, OAK: 133, PHI: 143, PIT: 134, SD: 135, SF: 137,
  SEA: 136, STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
};

function fetch(urlOrOpts) {
  return new Promise((resolve, reject) => {
    const opts = typeof urlOrOpts === "string"
      ? { hostname: "", path: "", headers: { "User-Agent": "Node" } }
      : urlOrOpts;
    const doReq = (url) => {
      https.get(url, { headers: { "User-Agent": "Node" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doReq(res.headers.location);
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      }).on("error", reject);
    };
    if (typeof urlOrOpts === "string") doReq(urlOrOpts);
    else {
      const req = https.request(urlOrOpts, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      });
      req.on("error", reject);
      if (opts._body) req.write(opts._body);
      req.end();
    }
  });
}

function sbGet(path) {
  return fetch({
    hostname: SB_HOST, path: "/rest/v1/" + path, method: "GET",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
  });
}

function sbPatch(id, update) {
  const body = JSON.stringify(update);
  return fetch({
    hostname: SB_HOST, path: "/rest/v1/players?id=eq." + id, method: "PATCH",
    headers: {
      apikey: SB_KEY, Authorization: "Bearer " + SB_KEY,
      "Content-Type": "application/json", Prefer: "return=representation",
      "Content-Length": Buffer.byteLength(body),
    },
    _body: body,
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function norm(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['.]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseDbName(dbName) {
  const parts = dbName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const initials = parts[parts.length - 1].toLowerCase();
  const last = norm(parts.slice(0, -1).join(" "));
  return { last, initials };
}

function parseMlbName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const firstName = norm(parts[0]);
  const last = norm(parts.slice(1).join(" "));
  return { last, firstInitial: firstName[0], firstName, fullNorm: norm(fullName) };
}

// ── Load Chadwick Register ──
async function loadChadwick() {
  console.log("Loading Chadwick register from GitHub...");
  const suffixes = "0123456789abcdef".split("");
  const mlbToFg = new Map();   // mlb_id -> fg_id
  const nameToIds = new Map(); // "last first_initial" -> [{mlb_id, fg_id}]

  for (const s of suffixes) {
    const url = `https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-${s}.csv`;
    const csv = await fetch(url);
    const lines = csv.split("\n");
    const header = lines[0].split(",");
    const mlbCol = header.indexOf("key_mlbam");
    const fgCol = header.indexOf("key_fangraphs");
    const lastCol = header.indexOf("name_last");
    const firstCol = header.indexOf("name_first");

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const mlbId = parseInt(cols[mlbCol]) || 0;
      const fgId = parseInt(cols[fgCol]) || 0;
      const lastName = (cols[lastCol] || "").trim().toLowerCase();
      const firstName = (cols[firstCol] || "").trim().toLowerCase();

      if (mlbId > 0 && fgId > 0) {
        mlbToFg.set(mlbId, fgId);
      }
      if (mlbId > 0 && lastName && firstName) {
        const key = `${norm(lastName)} ${firstName[0]}`;
        if (!nameToIds.has(key)) nameToIds.set(key, []);
        nameToIds.get(key).push({ mlb_id: mlbId, fg_id: fgId, firstName, lastName });
      }
    }
    process.stdout.write(`  people-${s}.csv ✓  `);
  }
  console.log(`\nChadwick loaded: ${mlbToFg.size} mlb→fg mappings, ${nameToIds.size} name keys`);
  return { mlbToFg, nameToIds };
}

// ── Fetch MLB API rosters ──
async function fetchAllMlbPlayers() {
  console.log("Fetching MLB rosters...");
  const players = new Map();

  for (const season of [2025, 2026]) {
    try {
      const data = await fetch({
        hostname: "statsapi.mlb.com",
        path: `/api/v1/sports/1/players?season=${season}`,
        method: "GET", headers: {},
      });
      if (data.people) {
        for (const p of data.people) {
          players.set(p.id, {
            mlb_id: p.id,
            fullName: p.fullName || `${p.firstName} ${p.lastName}`,
            team: p.currentTeam?.abbreviation || "",
          });
        }
      }
      console.log(`  Season ${season}: ${data.people?.length || 0} players`);
    } catch {}
  }

  // Also fetch full rosters for depth (40-man + 60-day IL)
  for (const [abbrev, tid] of Object.entries(TEAM_IDS)) {
    for (const rosterType of ["fullRoster", "depthChart"]) {
      try {
        const data = await fetch({
          hostname: "statsapi.mlb.com",
          path: `/api/v1/teams/${tid}/roster/${rosterType}?season=2025`,
          method: "GET", headers: {},
        });
        const roster = data.roster || data.roster || [];
        for (const entry of roster) {
          const p = entry.person;
          if (p && p.id && !players.has(p.id)) {
            players.set(p.id, { mlb_id: p.id, fullName: p.fullName, team: abbrev });
          }
        }
      } catch {}
    }
    await sleep(30);
  }

  console.log(`Total MLB players: ${players.size}`);
  return [...players.values()];
}

async function run() {
  // Load data sources in parallel
  const [chadwick, mlbPlayers] = await Promise.all([
    loadChadwick(),
    fetchAllMlbPlayers(),
  ]);
  const { mlbToFg, nameToIds } = chadwick;

  // Build MLB API lookup maps
  const mlbByLastInit = new Map();
  const mlbByLastFirst = new Map();
  for (const mp of mlbPlayers) {
    const parsed = parseMlbName(mp.fullName);
    if (!parsed) continue;
    mp._parsed = parsed;
    const k1 = `${parsed.last} ${parsed.firstInitial}`;
    if (!mlbByLastInit.has(k1)) mlbByLastInit.set(k1, []);
    mlbByLastInit.get(k1).push(mp);
    const k2 = `${parsed.last} ${parsed.firstName}`;
    if (!mlbByLastFirst.has(k2)) mlbByLastFirst.set(k2, []);
    mlbByLastFirst.get(k2).push(mp);
  }

  // Get DB state
  const needMlb = await sbGet("players?select=id,name,team,mlb_id,fangraphs_id&mlb_id=is.null&order=id");
  const needFg = await sbGet("players?select=id,name,team,mlb_id,fangraphs_id&fangraphs_id=eq.-1&mlb_id=not.is.null&order=id");
  const allPlayers = await sbGet("players?select=id,mlb_id&mlb_id=not.is.null");
  const usedMlbIds = new Set(allPlayers.map((p) => p.mlb_id));

  console.log(`\nPlayers needing mlb_id: ${needMlb.length}`);
  console.log(`Players needing fangraphs_id (has mlb): ${needFg.length}\n`);

  // ── Phase 1: Fix MLB IDs ──
  console.log("═══ PHASE 1: MLB IDs ═══");
  let mlbMatched = 0, mlbFailed = 0;
  const newlyMatched = [];

  for (const p of needMlb) {
    const parsed = parseDbName(p.name);
    if (!parsed) { console.log(`  SKIP (unparseable): ${p.name}`); mlbFailed++; continue; }

    let match = null;

    // Strategy 1: multi-char initial (disambiguated: "Sanchez Je", "Rogers Tr")
    if (parsed.initials.length > 1) {
      const key = `${parsed.last} ${parsed.initials}`;
      const candidates = mlbByLastFirst.get(key);
      if (candidates?.length === 1) match = candidates[0];
      else if (candidates?.length > 1) {
        const byTeam = candidates.filter((c) => c.team === p.team);
        if (byTeam.length === 1) match = byTeam[0];
      }
    }

    // Strategy 2: last + first initial
    if (!match) {
      const key = `${parsed.last} ${parsed.initials[0]}`;
      const candidates = mlbByLastInit.get(key);
      if (candidates?.length === 1) match = candidates[0];
      else if (candidates?.length > 1) {
        const byTeam = candidates.filter((c) => c.team === p.team);
        if (byTeam.length === 1) match = byTeam[0];
        else if (byTeam.length > 1 && parsed.initials.length > 1) {
          const narrowed = byTeam.filter((c) =>
            c._parsed?.firstName.startsWith(parsed.initials)
          );
          if (narrowed.length === 1) match = narrowed[0];
        }
      }
    }

    // Strategy 3: hyphenated/compound names — try partial last name
    if (!match && parsed.last.includes(" ")) {
      const lastPart = parsed.last.split(" ").pop();
      for (const mp of mlbPlayers) {
        if (!mp._parsed) continue;
        if (mp._parsed.last.includes(lastPart) && mp._parsed.firstInitial === parsed.initials[0] && mp.team === p.team) {
          match = mp; break;
        }
      }
    }

    // Strategy 4: try Chadwick register name lookup (catches players not in MLB API)
    if (!match) {
      const key = `${parsed.last} ${parsed.initials[0]}`;
      const chadCandidates = nameToIds.get(key);
      if (chadCandidates?.length === 1 && !usedMlbIds.has(chadCandidates[0].mlb_id)) {
        match = { mlb_id: chadCandidates[0].mlb_id, fullName: `${chadCandidates[0].firstName} ${chadCandidates[0].lastName}`, team: "?" };
      } else if (chadCandidates?.length > 1) {
        // Multi-char initial narrowing
        const narrowed = chadCandidates.filter(c => c.firstName.startsWith(parsed.initials));
        if (narrowed.length === 1 && !usedMlbIds.has(narrowed[0].mlb_id)) {
          match = { mlb_id: narrowed[0].mlb_id, fullName: `${narrowed[0].firstName} ${narrowed[0].lastName}`, team: "?" };
        }
      }
    }

    if (match && !usedMlbIds.has(match.mlb_id)) {
      // Also grab fg_id from Chadwick if available
      const fgId = mlbToFg.get(match.mlb_id);
      const update = { mlb_id: match.mlb_id };
      if (fgId && fgId > 0) update.fangraphs_id = fgId;

      const res = await sbPatch(p.id, update);
      if (Array.isArray(res) && res.length > 0) {
        console.log(`  ✓ id=${p.id} ${p.name} (${p.team}) -> mlb=${match.mlb_id}${fgId ? " fg=" + fgId : ""} [${match.fullName}]`);
        usedMlbIds.add(match.mlb_id);
        mlbMatched++;
      } else {
        console.log(`  ERR id=${p.id} ${p.name}: ${JSON.stringify(res)}`);
        mlbFailed++;
      }
    } else if (match && usedMlbIds.has(match.mlb_id)) {
      console.log(`  COLLISION id=${p.id} ${p.name}: mlb_id ${match.mlb_id} already used`);
      mlbFailed++;
    } else {
      console.log(`  MISS id=${p.id} ${p.name} (${p.team}) [${parsed.last} ${parsed.initials}]`);
      mlbFailed++;
    }
  }
  console.log(`\nMLB ID results: ${mlbMatched} matched, ${mlbFailed} failed\n`);

  // ── Phase 2: Fix FanGraphs IDs using Chadwick mlb→fg mapping ──
  console.log("═══ PHASE 2: FanGraphs IDs ═══");
  // Re-fetch players that have mlb_id but bad fangraphs_id
  const needFgNow = await sbGet("players?select=id,name,team,mlb_id,fangraphs_id&or=(fangraphs_id.eq.-1,fangraphs_id.is.null)&mlb_id=not.is.null&order=id");
  let fgMatched = 0, fgFailed = 0;

  for (const p of needFgNow) {
    const fgId = mlbToFg.get(p.mlb_id);
    if (fgId && fgId > 0) {
      const res = await sbPatch(p.id, { fangraphs_id: fgId });
      if (Array.isArray(res) && res.length > 0) {
        console.log(`  ✓ id=${p.id} ${p.name} -> fg=${fgId}`);
        fgMatched++;
      } else {
        console.log(`  ERR id=${p.id} ${p.name}: ${JSON.stringify(res)}`);
        fgFailed++;
      }
    } else {
      // Try Chadwick name lookup as fallback
      const parsed = parseDbName(p.name);
      if (parsed) {
        const key = `${parsed.last} ${parsed.initials[0]}`;
        const cands = nameToIds.get(key);
        if (cands) {
          // Match by mlb_id first
          const byMlb = cands.find(c => c.mlb_id === p.mlb_id);
          if (byMlb && byMlb.fg_id > 0) {
            const res = await sbPatch(p.id, { fangraphs_id: byMlb.fg_id });
            if (Array.isArray(res) && res.length > 0) {
              console.log(`  ✓ id=${p.id} ${p.name} -> fg=${byMlb.fg_id} (name match)`);
              fgMatched++;
              continue;
            }
          }
        }
      }
      console.log(`  MISS id=${p.id} ${p.name} (mlb=${p.mlb_id}) — not in Chadwick`);
      fgFailed++;
    }
  }

  console.log(`\nFanGraphs ID results: ${fgMatched} matched, ${fgFailed} still missing`);
  console.log("\nDone!");
}

run().catch(console.error);
