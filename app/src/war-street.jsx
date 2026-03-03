import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
//  WAR STREET -- Responsive: Palm Pilot (mobile) / Bloomberg (desktop)
// ═══════════════════════════════════════════════════════════════

const API = import.meta.env.DEV ? "http://localhost:8000" : "https://war-street-production.up.railway.app";
const BUDGET = 300_000_000;
const MAX_TX = 6;
const OPENING_DAY = new Date("2026-03-26T00:00:00");
const isPreseason = () => new Date() < OPENING_DAY;
const HSLOTS = ["C","1B","2B","3B","SS","OF1","OF2","OF3"];
const PSLOTS = ["SP1","SP2","SP3","SP4","RP"];
const SLOTS = [...HSLOTS,...PSLOTS];
const P_HOLD = 14;
const holdDays = (slot,pat) => { if(!PSLOTS.includes(slot)||!pat||isPreseason()) return 0; const d=Math.floor((Date.now()-new Date(pat).getTime())/864e5); return Math.max(P_HOLD-d,0) };
const dSlot = s => s.replace(/\d+$/,"");
const GP = 45;

// ── Display Helpers ──
const f$=n=>Math.abs(n)>=1e6?`${(n/1e6).toFixed(1)}M`:Math.abs(n)>=1e3?`${(n/1e3).toFixed(0)}K`:`${n}`;
function simChg(p,fr){const base=p.c-p.pp;const bp=+((base)/Math.max(p.pp,1)*100).toFixed(1);const sc={"1D":1,"1W":.6,"2W":.35,"1M":.18};return{raw:Math.round(base*(sc[fr]||1)),pct:+(bp*(sc[fr]||1)).toFixed(1)}}
function oSlots(r,el){const f={};r.forEach(x=>{f[x.slot]=1});return el.filter(s=>!f[s])}
function fits(r,pl){return oSlots(r,pl.el).length>0}
function minFill(roster,allPlayers){const f={};roster.forEach(x=>{f[x.slot]=1});let cost=0,slots=0;SLOTS.forEach(s=>{if(f[s])return;slots++;const cheap=allPlayers.filter(p=>p.el.includes(s)).reduce((m,p)=>p.c<m?p.c:m,Infinity);if(cheap<Infinity)cost+=cheap});return{cost,slots}}


// ── Inline Sparkline ──
const Spark = (pts, color, w=48, h=14, threshold) => {
  if(!pts||!pts.length) return <span style={{color:"#1a1a1a"}}>---</span>;
  const mn=Math.min(...pts), mx=Math.max(...pts), rng=mx-mn||1;
  const px=(v,i)=>[(i/(pts.length-1))*w, h-(((v-mn)/rng)*h)];
  if(threshold==null){
    const d=pts.map((v,i)=>px(v,i).join(",")).join(" ");
    return <svg width={w} height={h} style={{verticalAlign:"middle"}}><polyline points={d} fill="none" stroke={color} strokeWidth={1.2}/></svg>;
  }
  // Multi-color: green above threshold, red below, split at crossings
  const segs=[];
  const tY=h-(((threshold-mn)/rng)*h);
  for(let i=0;i<pts.length-1;i++){
    const [x1,y1]=px(pts[i],i),[x2,y2]=px(pts[i+1],i+1);
    const a=pts[i]>=threshold, b=pts[i+1]>=threshold;
    if(a===b){segs.push({x1,y1,x2,y2,c:a?"#33ff33":"#ff3333"})}
    else{const t=(threshold-pts[i])/(pts[i+1]-pts[i]);const mx2=x1+t*(x2-x1);
      segs.push({x1,y1,x2:mx2,y2:tY,c:a?"#33ff33":"#ff3333"});
      segs.push({x1:mx2,y1:tY,x2,y2,c:b?"#33ff33":"#ff3333"})}
  }
  return <svg width={w} height={h} style={{verticalAlign:"middle"}}>{segs.map((s,i)=>
    <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.c} strokeWidth={1.2}/>
  )}</svg>;
};

// ── useIsMobile Hook ──
function useIsMobile(breakpoint = 768) {
const [isMobile, setIsMobile] = useState(
typeof window !== "undefined" ? window.innerWidth < breakpoint : false
);
useEffect(() => {
const check = () => setIsMobile(window.innerWidth < breakpoint);
window.addEventListener("resize", check);
return () => window.removeEventListener("resize", check);
}, [breakpoint]);
return isMobile;
}

// ── Crawling Ticker (Desktop only) ──
function Ticker({ items }) {
const ref = useRef(null);
const inner = useRef(null);
const pos = useRef(0);
const raf = useRef(null);
useEffect(() => {
const el = ref.current;
const inn = inner.current;
if (!el || !inn) return;
const speed = 0.6;
const tick = () => {
pos.current -= speed;
const w = inn.scrollWidth / 2;
if (pos.current <= -w) pos.current += w;
inn.style.transform = `translateX(${pos.current}px)`;
raf.current = requestAnimationFrame(tick);
};
raf.current = requestAnimationFrame(tick);
return () => cancelAnimationFrame(raf.current);
}, [items]);
return (
<div ref={ref} style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
<div ref={inner} style={{ display: "inline-block", willChange: "transform" }}>
{[0,1].map(k => (
<span key={k} style={{ display: "inline" }}>
{items.map((it, i) => (
<span key={`${k}-${i}`} style={{ marginRight: 28, display: "inline" }}>
<span style={{ color: "#555" }}>{it.nm}</span>
{" "}<span style={{ color: "#aaa" }}>{it.pr}</span>
{" "}<span style={{ color: it.up ? "#33ff33" : "#ff3333" }}>{it.up ? "▲" : "▼"}{it.chg}</span>
<span style={{ color: "#333", margin: "0 8px" }}>│</span>
</span>
))}
</span>
))}
</div>
</div>
);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
const isMobile = useIsMobile();
const [raw, setRaw] = useState([]);
const [vw, setVw] = useState("PORT");
const palmScrollRef = useRef(null);
const [cur, setCur] = useState(() => {
  const saved = localStorage.getItem("warstreet_owner");
  return saved ? parseInt(saved, 10) : null;
});
const [loginPhase, setLoginPhase] = useState("boot");
const [typedText, setTypedText] = useState("");
const [logoOpacity, setLogoOpacity] = useState(0);
const [teamName, setTeamName] = useState("");
const [loginError, setLoginError] = useState(null);
const [loginEmail, setLoginEmail] = useState("");
const [loginPassword, setLoginPassword] = useState("");
const [regStep, setRegStep] = useState(1);
const [firstName, setFirstName] = useState("");
const [lastName, setLastName] = useState("");
const [selectedCity, setSelectedCity] = useState("");
const [cityLoading, setCityLoading] = useState(false);
const [token, setToken] = useState(() => localStorage.getItem("warstreet_token"));
const [ft, setFt] = useState("ALL");
const [so, setSo] = useState("PRICE");
const [q, setQ] = useState("");
const [sel, setSel] = useState(null);
const [ta, setTa] = useState("B");
const [sl, setSl] = useState(null);
const [msg, setMsg] = useState(null);
const [chgFrame, setChgFrame] = useState("1D");
const [sparkFrame, setSparkFrame] = useState("SZN");
const [menu, setMenu] = useState(false);
const frames = ["1D","1W","2W","1M"];
const sparkFrames = ["1W","1M","SZN"];

const [me, setMe] = useState({ id:null, nm:"...", fn:"", ln:"", em:"", ca:"", r:[], tx:0, budget:BUDGET, pv:0, tw:0 });
const [lb, setLb] = useState([]);
const [pwCur, setPwCur] = useState("");
const [pwNew, setPwNew] = useState("");
const [pwConfirm, setPwConfirm] = useState("");
const [pwMsg, setPwMsg] = useState(null);
const [pwLoading, setPwLoading] = useState(false);
const [showPaper, setShowPaper] = useState(false);
const [boxData, setBoxData] = useState(null);
const [boxLoading, setBoxLoading] = useState(false);
const [leaders, setLeaders] = useState(null);

// ── localStorage sync ──
useEffect(() => {
  if (cur !== null) localStorage.setItem("warstreet_owner", String(cur));
  else localStorage.removeItem("warstreet_owner");
  if (token) localStorage.setItem("warstreet_token", token);
  else localStorage.removeItem("warstreet_token");
}, [cur, token]);

// ── authFetch: attach JWT to protected requests ──
const authFetch = useCallback((url, opts = {}) => {
  const headers = { ...opts.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(url, { ...opts, headers });
}, [token]);

// ── API Fetches ──
useEffect(() => {
if (!cur) return;
fetch(`${API}/players`).then(r=>r.json()).then(data=>setRaw(data.map(p=>({
  id:p.id, nm:p.name, tm:p.team, ps:p.position, tp:p.player_type,
  el:p.eligible_positions, pj:p.projected_war, w:p.war_ytd, gp:p.games_played,
  c:p.current_price, pp:p.prev_price, d:p.price_change, dp:p.price_change_pct,
  vol:p.volume??0, opp:p.opponent??"", tbk:p.tb_k??null,
  prH:p.price_history??[], wH:p.war_history??[]
})))).catch(()=>{});
}, [cur]);

const refreshOwner = useCallback(() => {
if (!cur || !token) return;
authFetch(`${API}/owners/${cur}`).then(r=>{
  if(r.status===401){setCur(null);setToken(null);throw new Error("unauthorized")}
  if(!r.ok){if(r.status===404){setCur(null)}throw new Error("not found")}return r.json()
}).then(data=>setMe({
  id:data.id, nm:data.name,
  fn:data.first_name||"", ln:data.last_name||"", em:data.email||"", ca:data.created_at||"",
  r:data.roster.map(e=>({pid:e.player_id,slot:e.slot,paid:e.purchase_price,pat:e.purchased_at})),
  tx:data.transactions_this_week, budget:data.budget_remaining,
  pv:data.portfolio_value, tw:data.total_war
})).catch(()=>{});
}, [cur, token, authFetch]);

useEffect(() => { refreshOwner() }, [refreshOwner]);

const refreshLb = useCallback(() => {
fetch(`${API}/leaderboard`).then(r=>r.json()).then(data=>setLb(data.map(e=>({
  id:e.owner_id, nm:e.name, w:e.total_war, v:e.portfolio_value
})))).catch(()=>{});
}, []);

useEffect(() => { refreshLb() }, [refreshLb]);

// ── Login Animation Effects ──
const WELCOME_MSG = `WAR STREET v1.0\n(C) 2026 Burke Industries\n\nInitializing market data feed...... OK\nLoading player valuations........... OK\nConnecting to trading floor......... OK\n\nREADY.`;

useEffect(() => {
  if (cur !== null || loginPhase !== "boot") return;
  const steps = [0, 0.08, 0.15, 0.25, 0.4, 0.6, 0.8, 1.0];
  const timers = steps.map((op, i) => setTimeout(() => {
    setLogoOpacity(op);
    if (i === steps.length - 1) setTimeout(() => setLoginPhase("typing"), 400);
  }, i * 300));
  return () => timers.forEach(clearTimeout);
}, [cur, loginPhase]);

useEffect(() => {
  if (cur !== null || loginPhase !== "typing") return;
  let i = 0;
  const iv = setInterval(() => {
    i++;
    setTypedText(WELCOME_MSG.slice(0, i));
    if (i >= WELCOME_MSG.length) { clearInterval(iv); setTimeout(() => setLoginPhase("menu"), 600); }
  }, 40);
  return () => clearInterval(iv);
}, [cur, loginPhase]);

const doLogout = useCallback(() => {
  setCur(null); setToken(null); setLoginPhase("boot"); setTypedText(""); setLogoOpacity(0);
  setTeamName(""); setLoginEmail(""); setLoginPassword(""); setLoginError(null); setMenu(false);
  setRegStep(1); setFirstName(""); setLastName(""); setSelectedCity("");
  setMe({ id:null, nm:"...", fn:"", ln:"", em:"", ca:"", r:[], tx:0, budget:BUDGET, pv:0, tw:0 });
  setRaw([]);
}, []);

const doChangePassword = async () => {
  setPwMsg(null);
  if (!pwCur || !pwNew) { setPwMsg({t:"Current and new password required",e:true}); return; }
  if (pwNew.length < 6) { setPwMsg({t:"New password must be at least 6 characters",e:true}); return; }
  if (pwNew !== pwConfirm) { setPwMsg({t:"New passwords do not match",e:true}); return; }
  setPwLoading(true);
  try {
    const res = await authFetch(`${API}/auth/change-password`, { method:"POST", body:JSON.stringify({ current_password:pwCur, new_password:pwNew }) });
    if (res.status===401) { setPwMsg({t:"Current password is incorrect",e:true}); setPwLoading(false); return; }
    if (!res.ok) { const err = await res.json(); setPwMsg({t:err.detail||"Failed",e:true}); setPwLoading(false); return; }
    setPwMsg({t:"Password changed successfully",e:false}); setPwCur(""); setPwNew(""); setPwConfirm("");
  } catch(e) { setPwMsg({t:"Network error",e:true}); }
  setPwLoading(false);
};

// Clear password fields when navigating away from settings
useEffect(() => {
  if (vw !== "SET" && vw !== "SETTINGS") { setPwCur(""); setPwNew(""); setPwConfirm(""); setPwMsg(null); }
}, [vw]);

const doLogin = async () => {
  if (!loginEmail.trim() || !loginPassword) return;
  setLoginError(null);
  try {
    const res = await fetch(`${API}/auth/login`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }) });
    if (!res.ok) { const err = await res.json(); setLoginError(err.detail || "LOGIN FAILED"); return; }
    const data = await res.json();
    setToken(data.token); setCur(data.owner_id);
  } catch(e) { setLoginError("NETWORK ERROR"); }
};

const doCreateTeam = async () => {
  const fullTeamName = selectedCity ? `${selectedCity} ${teamName}`.trim() : teamName.trim();
  if (!fullTeamName || !loginEmail.trim() || !loginPassword || !firstName.trim() || !lastName.trim()) return;
  setLoginError(null);
  try {
    const res = await fetch(`${API}/auth/register`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword, team_name: fullTeamName, first_name: firstName.trim(), last_name: lastName.trim() }) });
    if (!res.ok) { const err = await res.json(); setLoginError(err.detail || "CREATE FAILED"); return; }
    const data = await res.json();
    setToken(data.token); setCur(data.owner_id);
  } catch(e) { setLoginError("NETWORK ERROR"); }
};

// ── Derived State ──
const pl = raw;
const pM = useMemo(() => Object.fromEntries(pl.map(p => [p.id,p])), [pl]);
const rE = SLOTS.map(s => { const e=me.r.find(x=>x.slot===s); return{slot:s,p:e?pM[e.pid]:null,paid:e?.paid||0,pat:e?.pat}});
const filled = me.r.map(x => pM[x.pid]).filter(Boolean);
const tW = me.tw ?? filled.reduce((s,p) => s+(p.w||0), 0);
const pV = me.pv ?? filled.reduce((s,p) => s+(p.c||0), 0);
const sp = me.r.reduce((s,x) => s+x.paid, 0);
const rem = me.budget ?? BUDGET;
const has = pid => me.r.some(x => x.pid === pid);

const mk = useMemo(() => {
let l = [...pl];
if (ft==="HIT") l=l.filter(p=>p.tp==="H");
if (ft==="PIT") l=l.filter(p=>p.tp==="P");
if (q) l=l.filter(p=>p.nm.toLowerCase().includes(q.toLowerCase())||p.tm.toLowerCase().includes(q.toLowerCase()));
const ss = {PRICE:(a,b)=>b.c-a.c, WAR:(a,b)=>b.w-a.w, CHG:(a,b)=>simChg(b,chgFrame).pct-simChg(a,chgFrame).pct, AZ:(a,b)=>a.nm.localeCompare(b.nm), VOL:(a,b)=>(b.vol||0)-(a.vol||0)};
l.sort(ss[so]||ss.PRICE); return l;
}, [pl,ft,so,q,chgFrame]);

const flash = useCallback((m,e) => { setMsg({m,e}); setTimeout(()=>setMsg(null),2500) },[]);

const buy = async (p,s) => {
if(!isPreseason()&&me.tx>=MAX_TX) return flash("NO TX LEFT","E");
if(p.c>rem) return flash("NO FUNDS","E");
const mf=minFill([...me.r,{slot:s}],raw);
if(rem-p.c<mf.cost) return flash(`NEED $${f$(mf.cost)} FOR ${mf.slots} SLOTS`,"E");
if(!s) return flash("SELECT SLOT","E");
try{
  const res=await authFetch(`${API}/transactions/buy`,{method:"POST",body:JSON.stringify({player_id:p.id,slot:s})});
  if(res.status===401){doLogout();return flash("SESSION EXPIRED","E")}
  if(!res.ok){const err=await res.json();return flash(err.detail||"BUY FAILED","E")}
  const data=await res.json();
  flash(`BUY ${data.player} > ${dSlot(data.slot)} @ ${f$(data.price)}`);
  refreshOwner();refreshLb();
}catch(e){flash("NETWORK ERROR","E")}
setSel(null);
};
const sell = async (p) => {
if(!isPreseason()&&me.tx>=MAX_TX) return flash("NO TX LEFT","E");
const e=me.r.find(x=>x.pid===p.id);
const hd=holdDays(e?.slot,e?.pat);
if(hd>0) return flash(`HOLD ${hd}D (pitcher)`,"E");
try{
  const res=await authFetch(`${API}/transactions/sell`,{method:"POST",body:JSON.stringify({player_id:p.id,slot:e?.slot})});
  if(res.status===401){doLogout();return flash("SESSION EXPIRED","E")}
  if(!res.ok){const err=await res.json();return flash(err.detail||"SELL FAILED","E")}
  const data=await res.json();
  const pl2=data.price-(e?.paid||0);
  flash(`SELL ${data.player} @ ${f$(data.price)} [${pl2>=0?"+":""}${f$(pl2)}]`);
  refreshOwner();refreshLb();
}catch(e){flash("NETWORK ERROR","E")}
setSel(null);
};
const cycleFrame = () => { setChgFrame(f=>frames[(frames.indexOf(f)+1)%frames.length]) };
const cycleSparkFrame = () => { setSparkFrame(f=>sparkFrames[(sparkFrames.indexOf(f)+1)%sparkFrames.length]) };

const openPaper = async () => {
  setShowPaper(true);
  if (boxData) return;
  setBoxLoading(true);
  try {
    const [boxRes, ldRes] = await Promise.all([
      fetch(`${API}/boxscores`),
      fetch(`${API}/boxscores/leaders?season=2025`)
    ]);
    setBoxData(await boxRes.json());
    try { setLeaders(await ldRes.json()); } catch(e) { /* leaders optional */ }
  } catch(e) { /* silent */ }
  setBoxLoading(false);
};

useEffect(() => {
  const onKey = e => { if (e.key === "Escape") setShowPaper(false) };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);

const tickerItems = useMemo(() => [...pl].sort((a,b)=>b.c-a.c).filter(p=>p.c>=10_000_000).slice(0,30).map(p => {
const ch = simChg(p,"1D");
return { nm: p.nm.split(" ")[0], pr: f$(p.c), chg: Math.abs(ch.pct)+"%", up: ch.pct >= 0 };
}), [pl]);

// ─── Shared helpers for both UIs ───
const openBuy = (p) => {
const os=oSlots(me.r,p.el);
const ds=[...new Set(os.map(dSlot))];
setSel(p);setTa("B");setSl(ds.length===1?os[0]:null);
};
const openSell = (p) => {
const e=me.r.find(x=>x.pid===p.id);
setSel({...p,paid:e?.paid,pat:e?.pat,rSlot:e?.slot});setTa("S");
};

// ═══════════════════════════════════════════════════════════
//  LOGIN SCREEN (cur === null)
// ═══════════════════════════════════════════════════════════
if (cur === null) {
  const loginInputStyle = {background:"transparent",border:"none",borderBottom:"1px solid currentColor",color:"inherit",fontFamily:"inherit",fontSize:"inherit",padding:"2px 4px",flex:1,minWidth:0,outline:"none",caretColor:"currentColor"};
  const clearLoginFields = () => { setLoginEmail(""); setLoginPassword(""); setTeamName(""); setLoginError(null); setRegStep(1); setFirstName(""); setLastName(""); setSelectedCity(""); };

  const loginMenu = (phase, setPhase) => {
    if (phase === "menu") return (
      <div style={{marginTop:16}}>
        <div onClick={()=>{clearLoginFields();setPhase("signin")}} style={{cursor:"pointer",marginBottom:6}} onMouseEnter={e=>e.currentTarget.style.opacity=0.7} onMouseLeave={e=>e.currentTarget.style.opacity=1}>{"> [1] SIGN IN"}</div>
        <div onClick={()=>{clearLoginFields();setPhase("create")}} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity=0.7} onMouseLeave={e=>e.currentTarget.style.opacity=1}>{"> [2] CREATE NEW TEAM"}</div>
      </div>
    );
    if (phase === "signin") return (
      <div style={{marginTop:12}}>
        <div style={{marginBottom:4}}>ENTER CREDENTIALS:</div>
        <div style={{marginBottom:4}}>{"──────────────────────"}</div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
          <span>EMAIL:</span>
          <input value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} autoFocus
            style={loginInputStyle}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
          <span>PASS:</span>
          <input value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} type="password"
            onKeyDown={e=>{if(e.key==="Enter")doLogin()}}
            style={loginInputStyle}/>
        </div>
        {loginError&&<div style={{color:"#ff3333",marginBottom:4}}>{loginError}</div>}
        <div style={{display:"flex",gap:8}}>
          <span onClick={doLogin} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity=0.7} onMouseLeave={e=>e.currentTarget.style.opacity=1}>[LOGIN]</span>
          <span onClick={()=>{setLoginPhase("menu");clearLoginFields()}} style={{cursor:"pointer",opacity:0.6}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.6}>[BACK]</span>
        </div>
        <div style={{marginTop:8,opacity:0.5,fontSize:"inherit"}}>Forgot password? Contact league admin.</div>
      </div>
    );
    if (phase === "create") {
      const goStep2 = () => {
        if (!firstName.trim() || !lastName.trim()) { setLoginError("FIRST AND LAST NAME REQUIRED"); return; }
        setLoginError(null); setRegStep(2);
        setCityLoading(true);
        fetch("http://ip-api.com/json/?fields=city,regionName")
          .then(r=>r.json()).then(data=>{ setSelectedCity(data.city || data.regionName || ""); })
          .catch(()=>setSelectedCity(""))
          .finally(()=>setCityLoading(false));
      };
      const goStep3 = () => {
        if (!teamName.trim()) { setLoginError("TEAM NICKNAME REQUIRED"); return; }
        setLoginError(null); setRegStep(3);
      };
      const stepBack = (to) => { setLoginError(null); setRegStep(to); };

      if (regStep === 1) return (
        <div style={{marginTop:12}}>
          <div style={{marginBottom:4}}>STEP 1/3 — YOUR NAME:</div>
          <div style={{marginBottom:4}}>{"──────────────────────"}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <span>FIRST:</span>
            <input value={firstName} onChange={e=>setFirstName(e.target.value)} autoFocus maxLength={30}
              style={loginInputStyle}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span>LAST:</span>
            <input value={lastName} onChange={e=>setLastName(e.target.value)} maxLength={30}
              onKeyDown={e=>{if(e.key==="Enter")goStep2()}}
              style={loginInputStyle}/>
          </div>
          {loginError&&<div style={{color:"#ff3333",marginBottom:4}}>{loginError}</div>}
          <div style={{display:"flex",gap:8}}>
            <span onClick={goStep2} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity=0.7} onMouseLeave={e=>e.currentTarget.style.opacity=1}>[NEXT]</span>
            <span onClick={()=>{setLoginPhase("menu");clearLoginFields()}} style={{cursor:"pointer",opacity:0.6}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.6}>[BACK]</span>
          </div>
        </div>
      );
      if (regStep === 2) return (
        <div style={{marginTop:12}}>
          <div style={{marginBottom:4}}>STEP 2/3 — TEAM NAME:</div>
          <div style={{marginBottom:4}}>{"──────────────────────"}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <span>CITY:</span>
            {cityLoading ? <span style={{opacity:0.5}}>DETECTING...</span> :
              <input value={selectedCity} onChange={e=>setSelectedCity(e.target.value)} maxLength={30}
                style={loginInputStyle} placeholder="e.g. Seattle"/>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span>TEAM:</span>
            <span style={{opacity:0.5}}>{selectedCity ? `${selectedCity} ` : ""}</span>
            <input value={teamName} onChange={e=>setTeamName(e.target.value)} autoFocus maxLength={30}
              onKeyDown={e=>{if(e.key==="Enter")goStep3()}}
              style={loginInputStyle} placeholder="e.g. Squeezes"/>
          </div>
          <div style={{fontSize:"inherit",opacity:0.5,marginBottom:6}}>
            PREVIEW: {selectedCity ? `${selectedCity} ${teamName}` : teamName || "..."}
          </div>
          {loginError&&<div style={{color:"#ff3333",marginBottom:4}}>{loginError}</div>}
          <div style={{display:"flex",gap:8}}>
            <span onClick={goStep3} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity=0.7} onMouseLeave={e=>e.currentTarget.style.opacity=1}>[NEXT]</span>
            <span onClick={()=>stepBack(1)} style={{cursor:"pointer",opacity:0.6}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.6}>[BACK]</span>
          </div>
        </div>
      );
      if (regStep === 3) return (
        <div style={{marginTop:12}}>
          <div style={{marginBottom:4}}>STEP 3/3 — CREDENTIALS:</div>
          <div style={{marginBottom:4}}>{"──────────────────────"}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <span>EMAIL:</span>
            <input value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} autoFocus
              style={loginInputStyle}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span>PASS:</span>
            <input value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} type="password"
              onKeyDown={e=>{if(e.key==="Enter")doCreateTeam()}}
              style={loginInputStyle}/>
          </div>
          {loginError&&<div style={{color:"#ff3333",marginBottom:4}}>{loginError}</div>}
          <div style={{display:"flex",gap:8}}>
            <span onClick={doCreateTeam} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity=0.7} onMouseLeave={e=>e.currentTarget.style.opacity=1}>[CREATE]</span>
            <span onClick={()=>stepBack(2)} style={{cursor:"pointer",opacity:0.6}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.6}>[BACK]</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // ── Desktop Login ──
  if (!isMobile) return (
    <div style={{background:"#2a2520",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@800&display=swap'); @import url('https://fonts.cdnfonts.com/css/perfect-dos-vga-437'); *{box-sizing:border-box} @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}} .crt-login input{caret-color:#33ff33} .crt-login .crt::before{content:"";position:absolute;top:0;left:0;width:100%;height:100%;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15) 0px,rgba(0,0,0,0.15) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:1000} .crt-login .crt::after{content:"";position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.4) 100%);pointer-events:none;z-index:999}`}</style>
      <div style={{position:"relative",width:"min(100vw, calc(100vh * 1080 / 608))",height:"min(100vh, calc(100vw * 608 / 1080))"}}>
        <div className="crt-login" style={{position:"absolute",left:"28.70%",top:"2.80%",width:"46.67%",height:"68.26%",borderRadius:6,background:"#0a0a0a",overflow:"hidden",zIndex:1}}>
          <div style={{width:"100%",height:"100%",overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            <div className="crt" style={{position:"absolute",inset:0,pointerEvents:"none"}}/>
            <div style={{position:"relative",zIndex:1001,textAlign:"center",padding:"20px 30px",width:"100%",maxWidth:600}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:48,color:"#ff9900",letterSpacing:"8px",opacity:logoOpacity,transition:"none",textShadow:"0 0 20px rgba(255,153,0,0.3)",transform:"scaleX(1.4)",transformOrigin:"center"}}>WAR STREET</div>
              <div style={{fontFamily:"'Perfect DOS VGA 437',monospace",fontSize:16,color:"#555",marginTop:4,letterSpacing:"2px",opacity:logoOpacity}}>FANTASY BASEBALL STOCK MARKET</div>
              {loginPhase !== "boot" && (
                <div style={{fontFamily:"'Perfect DOS VGA 437',monospace",fontSize:20,color:"#33ff33",textAlign:"left",marginTop:20,lineHeight:1.4}}>
                  <pre style={{margin:0,fontFamily:"inherit",whiteSpace:"pre-wrap"}}>{typedText}{(loginPhase==="typing"||loginPhase==="menu")&&<span style={{animation:"blink 1s step-end infinite"}}>█</span>}</pre>
                  {loginMenu(loginPhase, setLoginPhase)}
                </div>
              )}
            </div>
          </div>
        </div>
        <img src="/WAR-street/monitor-frame.png" alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:2}}/>
      </div>
    </div>
  );

  // ── Mobile Login ──
  const fg_m="#2d4a2d",bgc_m="#b8c8a0",brd_m="#8a9a72",lo_m="#7a8a62",vlo_m="#5a6a42";
  return (
    <div style={{background:"#1a1a1a",height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",padding:0,overflow:"hidden",maxWidth:"100vw",touchAction:"none",position:"fixed",inset:0}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=JetBrains+Mono:wght@800&display=swap'); @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}} html,body{overflow:hidden !important;position:fixed !important;width:100% !important;height:100% !important;touch-action:none} .palm-login input{caret-color:#2d4a2d}`}</style>
      <div style={{position:"relative",width:"min(120vw, calc(100dvh * 768 / 1376))",height:"min(100dvh, calc(120vw * 1376 / 768))",touchAction:"none",marginTop:"-6vh"}}>
        <div className="palm-login" style={{position:"absolute",left:"4.30%",top:"10.68%",width:"94.01%",height:"68.75%",borderRadius:12,background:bgc_m,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Silkscreen',monospace",color:fg_m,zIndex:1,touchAction:"none"}}>
          <div style={{position:"absolute",inset:0,background:`repeating-linear-gradient(0deg,rgba(0,0,0,0.03) 0px,rgba(0,0,0,0.03) 1px,transparent 1px,transparent 2px)`,pointerEvents:"none",zIndex:3}}/>
          <div style={{position:"relative",zIndex:4,textAlign:"center",padding:"10px 16px",maxWidth:"90%"}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:23,color:vlo_m,letterSpacing:"2px",opacity:logoOpacity}}>WAR STREET</div>
            <div style={{fontSize:10,color:lo_m,marginTop:3,opacity:logoOpacity}}>FANTASY BASEBALL STOCK MARKET</div>
            {loginPhase !== "boot" && (
              <div style={{fontSize:12,color:fg_m,textAlign:"left",marginTop:12,lineHeight:1.5}}>
                <pre style={{margin:0,fontFamily:"inherit",whiteSpace:"pre-wrap",fontSize:12}}>{typedText}{(loginPhase==="typing"||loginPhase==="menu")&&<span style={{animation:"blink 1s step-end infinite"}}>█</span>}</pre>
                {loginMenu(loginPhase, setLoginPhase)}
              </div>
            )}
          </div>
        </div>
        <img src="/WAR-street/palm-frame.png" alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:2}}/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MOBILE -- Palm Pilot
// ═══════════════════════════════════════════════════════════
if (isMobile) {
const fg="#2d4a2d",bgc="#b8c8a0",bg2="#a8b890",brd="#8a9a72",hi="#c8d8b0",lo="#7a8a62",vlo="#5a6a42";
const pad={padding:"3px 4px",whiteSpace:"nowrap"};
const th2={...pad,color:lo,textAlign:"left",borderBottom:`1px solid ${brd}`,position:"sticky",top:0,background:bgc,fontSize:13,zIndex:2};
const td2={...pad,borderBottom:`1px solid ${brd}`,fontSize:14};

return (
  <div style={{background:"#1a1a1a",height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",padding:0,overflow:"hidden",maxWidth:"100vw",touchAction:"none",position:"fixed",inset:0}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=JetBrains+Mono:wght@800&display=swap');
      @import url('https://fonts.cdnfonts.com/css/rojal');
      html,body{overflow:hidden !important;position:fixed !important;width:100% !important;height:100% !important;touch-action:none}
      .palm-screen{overflow-x:hidden !important}
      .palm-scroll{overflow-y:auto !important;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain}
      .palm-screen::-webkit-scrollbar{width:3px}
      .palm-screen::-webkit-scrollbar-thumb{background:${lo}}
      .palm-screen::-webkit-scrollbar-track{background:${bgc}}
    `}</style>

    {/* Palm Device — real image frame */}
    <div style={{
      position:"relative",
      width: "min(120vw, calc(100dvh * 768 / 1376))",
      height: "min(100dvh, calc(120vw * 1376 / 768))",
      touchAction:"none",
      marginTop:"-6vh",
    }}>
      {/* LCD Screen — positioned in the transparent cutout */}
      <div className="palm-screen" style={{
        position:"absolute",
        left:"4.30%", top:"10.68%",
        width:"94.01%", height:"68.75%",
        borderRadius: 12,
        background: bgc,
        overflow:"hidden",
        overscrollBehavior:"contain",
        display:"flex", flexDirection:"column",
        fontFamily:"'Silkscreen',monospace",
        color: fg,
        zIndex:1,
      }}>
        {/* LCD pixel grid overlay */}
        <div style={{position:"absolute",inset:0,background:`repeating-linear-gradient(0deg,rgba(0,0,0,0.03) 0px,rgba(0,0,0,0.03) 1px,transparent 1px,transparent 2px)`,pointerEvents:"none",zIndex:3}}/>

        {/* Flash */}
        {msg&&<div style={{position:"absolute",top:0,left:0,right:0,padding:"2px 4px",background:msg.e==="E"?"#c85555":vlo,color:bgc,fontSize:11,zIndex:20,textAlign:"center"}}>{msg.m}</div>}

        {/* Header — overflowX hidden on all mobile content */}
        <div style={{padding:"3px 6px",borderBottom:`1px solid ${brd}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span onClick={()=>setMenu(m=>!m)} style={{cursor:"pointer",fontSize:16,color:lo,lineHeight:1}}>☰</span>
            <span style={{fontFamily:"'JetBrains Mono'",fontWeight:800,fontSize:15,color:vlo,letterSpacing:1}}>WAR ST.</span>
          </div>
          <span style={{fontSize:12,color:lo}}>GM{GP} '26</span>
        </div>

        {/* Menu dropdown */}
        {menu&&<>
          <div onClick={()=>setMenu(false)} style={{position:"absolute",inset:0,zIndex:14}}/>
          <div style={{position:"absolute",top:22,left:2,background:hi,border:`1px solid ${fg}`,zIndex:15,width:"70%",maxHeight:"80%",overflow:"auto"}} className="palm-screen">
            <div style={{padding:"3px 6px",fontSize:13,color:vlo,borderBottom:`1px solid ${brd}`,fontWeight:700}}>MENU</div>
            {[["Profile",()=>setVw("PRO")],["Settings",()=>setVw("SET")]].map(([l,fn],i)=>
              <div key={i} onClick={()=>{fn();setMenu(false)}} style={{padding:"4px 6px",fontSize:13,color:fg,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background=bg2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{l}</div>)}
            <div onClick={()=>{doLogout();setMenu(false)}} style={{padding:"4px 6px",fontSize:13,color:"#885555",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=bg2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Log Out</div>
          </div>
        </>}

        {/* Status */}
        <div style={{padding:"2px 6px",borderBottom:`1px solid ${brd}`,fontSize:12,color:lo,display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
          <span>${f$(rem)}</span>
          <span>W:{tW.toFixed(1)}</span>
          <span>TX:{MAX_TX-me.tx}</span>
          <span>{me.r.length}/13</span>
          <div style={{marginLeft:"auto",display:"flex",gap:2}}>
            {["MKT","PORT","RNK","?"].map(v=>
              <span key={v} onClick={()=>setVw(v)} style={{cursor:"pointer",padding:"1px 5px",fontSize:12,color:vw===v?bgc:lo,background:vw===v?vlo:"transparent",borderRadius:1}}>{v}</span>)}
          </div>
        </div>

        {/* Content */}
        <div ref={palmScrollRef} className="palm-screen palm-scroll" style={{flex:1,overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",padding:"1px 0"}}>
          {/* MARKET */}
          {vw==="MKT"&&<div>
            <div style={{display:"flex",gap:3,padding:"2px 4px",alignItems:"center",fontSize:12,flexWrap:"wrap"}}>
              {["ALL","HIT","PIT"].map(v=>
                <span key={v} onClick={()=>setFt(v)} style={{cursor:"pointer",color:ft===v?bgc:lo,background:ft===v?vlo:"transparent",padding:"1px 4px",borderRadius:1}}>{v}</span>)}
              <span style={{color:brd}}>|</span>
              {["$","WAR","Δ","AZ"].map((v,i)=>{const k=["PRICE","WAR","CHG","AZ"][i];return(
                <span key={k} onClick={()=>setSo(k)} style={{cursor:"pointer",color:so===k?bgc:lo,background:so===k?vlo:"transparent",padding:"1px 4px",borderRadius:1}}>{v}</span>)})}
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="find" style={{marginLeft:"auto",width:50,background:"transparent",border:`1px solid ${brd}`,color:fg,fontFamily:"inherit",fontSize:10,padding:"1px 3px"}}/>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
              <thead><tr>
                <th style={{...th2,width:"28%"}}>NAME</th>
                <th style={{...th2,width:"12%"}}>TM</th>
                <th style={{...th2,width:"12%"}}>PS</th>
                <th style={{...th2,width:"16%"}}>$</th>
                <th style={{...th2,width:"14%",cursor:"pointer"}} onClick={cycleFrame}>Δ<span style={{color:vlo,fontSize:8}}>[{chgFrame}]</span></th>
                <th style={{...th2,width:"8%"}}>W</th>
                <th style={{...th2,width:"10%"}}></th>
              </tr></thead>
              <tbody>
                {mk.map(p=>{
                  const mine=has(p.id);const ok=!mine&&fits(me.r,p);const no=!mine&&!ok;
                  const ch=simChg(p,chgFrame);
                  const allPos=[...new Set(p.el.map(dSlot))];
                  const pos=allPos.length>2?allPos.slice(0,2).join("/")+"/..":allPos.join("/");
                  return(
                    <tr key={p.id} style={{background:mine?hi:"transparent"}}>
                      <td style={{...td2,color:mine?vlo:fg,fontWeight:mine?700:400,overflow:"hidden",textOverflow:"ellipsis"}}>{p.nm}</td>
                      <td style={{...td2,color:lo,fontSize:12}}>{p.tm}</td>
                      <td style={{...td2,fontSize:11}} title={allPos.join("/")}>{pos}</td>
                      <td style={{...td2,fontWeight:700}}>{f$(p.c)}</td>
                      <td style={td2}>{ch.pct>=0?"+":""}{ch.pct}%</td>
                      <td style={td2}>{p.w.toFixed(1)}</td>
                      <td style={{...td2,textAlign:"center"}}>
                        {mine?<span onClick={()=>openSell(p)} style={{cursor:"pointer",color:"#885555",fontSize:13,fontWeight:700}}>SELL</span>
                        :ok?<span onClick={()=>openBuy(p)} style={{cursor:"pointer",color:vlo,fontSize:13,fontWeight:700}}>BUY</span>
                        :<span style={{color:brd,fontSize:12}}>--</span>}
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>}

          {/* PORTFOLIO */}
          {vw==="PORT"&&<div style={{padding:"0 2px",overflowX:"hidden"}}>
            <div style={{fontSize:12,color:lo,padding:"2px 4px"}}>{me.nm}</div>
            {me.r.length===0?<div style={{padding:"6px 6px",fontSize:12,lineHeight:1.6,color:fg}}>
              <div style={{fontWeight:700,fontSize:13,color:vlo,marginBottom:4}}>WELCOME TO WAR STREET</div>
              <div style={{marginBottom:4}}>You manage a fantasy baseball team. Buy and sell MLB players like stocks — their prices move with on-field performance and demand.</div>
              <div style={{marginBottom:6,color:vlo,fontWeight:700,cursor:"pointer"}} onClick={()=>setVw("MKT")}>{"> GO TO MARKET TO BUY PLAYERS"}</div>
              <div style={{marginBottom:4}}><span style={{color:vlo,fontWeight:700}}>BUDGET</span> ${BUDGET/1e6}M to fill 13 roster slots</div>
              <div style={{marginBottom:4}}><span style={{color:vlo,fontWeight:700}}>GOAL</span> Highest cumulative WAR at season end wins</div>
              <div style={{marginBottom:4}}><span style={{color:vlo,fontWeight:700}}>TX</span> {MAX_TX}/wk once season starts{isPreseason()?" (unlimited now)":""}</div>
              <div style={{marginBottom:4}}><span style={{color:"#885555",fontWeight:700}}>HOLD</span> Pitchers locked {P_HOLD} days after purchase</div>
            </div>
            :<>
            <div style={{display:"flex",justifyContent:"space-between",padding:"2px 4px",fontSize:12,color:lo}}>
              <span>WAR: <span style={{color:fg,fontWeight:700}}>{me.tw.toFixed(1)}</span></span>
              <span>Val: <span style={{color:fg,fontWeight:700}}>{f$(me.pv)}</span></span>
              <span>Left: <span style={{color:fg,fontWeight:700}}>{f$(me.budget)}</span></span>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
              <colgroup>
                <col style={{width:"12%"}}/>
                <col style={{width:"36%"}}/>
                <col style={{width:"18%"}}/>
                <col style={{width:"18%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"6%"}}/>
              </colgroup>
              <thead><tr>{["SL","PLAYER","$","P/L","W",""].map(h=><th key={h} style={th2}>{h}</th>)}</tr></thead>
              <tbody>
                {rE.map(({slot:s,p,paid,pat})=>{
                  if(!p)return<tr key={s}><td style={{...td2,color:brd}}>{dSlot(s)}</td><td colSpan={5} style={{...td2,color:brd}}>-- empty --</td></tr>;
                  const pl2=p.c-paid;const hd=holdDays(s,pat);
                  return<tr key={s}>
                    <td style={{...td2,color:vlo,fontWeight:700}}>{dSlot(s)}</td>
                    <td style={{...td2,overflow:"hidden",textOverflow:"ellipsis"}}>{p.nm}{hd>0?<span style={{color:"#885555",fontSize:10}}> {hd}d</span>:null}</td>
                    <td style={{...td2,fontWeight:700}}>{f$(p.c)}</td>
                    <td style={{...td2,fontWeight:700}}>{pl2>=0?"+":""}{f$(pl2)}</td>
                    <td style={td2}>{p.w.toFixed(1)}</td>
                    <td style={td2}><span onClick={()=>openSell(p)} style={{cursor:"pointer",color:hd>0?brd:"#885555",fontSize:13}}>{hd>0?"◼":"✕"}</span></td>
                  </tr>})}
              </tbody>
            </table>
            </>}
          </div>}

          {/* STANDINGS */}
          {vw==="RNK"&&<div style={{padding:"0 2px",overflowX:"hidden"}}>
            <div style={{fontSize:12,color:lo,padding:"2px 4px"}}>STANDINGS</div>
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
              <thead><tr>
                <th style={{...th2,width:"8%"}}>#</th>
                <th style={{...th2,width:"50%"}}>TEAM</th>
                <th style={{...th2,width:"20%"}}>WAR</th>
                <th style={{...th2,width:"22%"}}>VAL</th>
              </tr></thead>
              <tbody>
                {lb.map((o,i)=><tr key={o.id} style={{background:o.id===cur?hi:"transparent"}}>
                  <td style={{...td2,color:i<3?vlo:lo,fontWeight:i<3?700:400}}>{i+1}</td>
                  <td style={{...td2,fontWeight:o.id===cur?700:400,overflow:"hidden",textOverflow:"ellipsis"}}>{o.nm}{o.id===cur?" ◄":""}</td>
                  <td style={{...td2,fontWeight:700}}>{o.w.toFixed(1)}</td>
                  <td style={{...td2,color:lo}}>{f$(o.v)}</td>
                </tr>)}
              </tbody>
            </table>
            <div style={{fontSize:12,color:brd,padding:"2px 4px"}}>Rosters hidden.</div>
          </div>}

          {/* HELP */}
          {vw==="?"&&<div style={{padding:"4px 6px",fontSize:13,lineHeight:1.6}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:3,color:vlo}}>RULES</div>
            {[["$",`$${BUDGET/1e6}M cap, 13 slots`],["POS","C 1B 2B 3B SS 3×OF 4×SP RP"],["OWN","Shared. Rosters hidden."],["WIN","Most cumulative WAR"],["TX",`${MAX_TX}/wk`],["HOLD",`Pitchers locked ${P_HOLD} days`],["Δ","Tap header: 1D/1W/2W/1M"]].map(([t,d],i)=>
              <div key={i}><span style={{color:t==="HOLD"?"#885555":vlo,fontWeight:700}}>{t}</span> <span style={{color:fg}}>{d}</span></div>)}
          </div>}

          {/* PROFILE */}
          {vw==="PRO"&&<div style={{padding:"4px 6px",fontSize:13,lineHeight:1.8}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:3,color:vlo}}>PROFILE</div>
            <div><span style={{color:lo}}>TEAM </span><span style={{fontWeight:700}}>{me.nm}</span></div>
            <div><span style={{color:lo}}>NAME </span>{me.fn} {me.ln}</div>
            <div><span style={{color:lo}}>EMAIL </span>{me.em}</div>
            <div><span style={{color:lo}}>MEMBER SINCE </span>{me.ca?new Date(me.ca).toLocaleDateString():"-"}</div>
            <div style={{borderTop:`1px solid ${brd}`,marginTop:4,paddingTop:4}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:3,color:vlo}}>SEASON STATS</div>
              <div><span style={{color:lo}}>WAR </span><span style={{fontWeight:700}}>{tW.toFixed(1)}</span></div>
              <div><span style={{color:lo}}>VALUE </span><span style={{fontWeight:700}}>{f$(pV)}</span></div>
              <div><span style={{color:lo}}>BUDGET </span>{f$(rem)}</div>
              <div><span style={{color:lo}}>SPENT </span>{f$(sp)}</div>
              <div><span style={{color:lo}}>P/L </span><span style={{color:pV-sp>=0?vlo:"#885555"}}>{pV-sp>=0?"+":""}{f$(pV-sp)}</span></div>
              <div><span style={{color:lo}}>ROSTER </span>{me.r.length}/13</div>
              <div><span style={{color:lo}}>TX LEFT </span>{MAX_TX-me.tx}/{MAX_TX}</div>
            </div>
          </div>}

          {/* SETTINGS */}
          {vw==="SET"&&<div style={{padding:"4px 6px",fontSize:13,lineHeight:1.8}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:3,color:vlo}}>SETTINGS</div>
            <div style={{marginBottom:2,color:lo}}>CHANGE PASSWORD</div>
            <div style={{marginBottom:4}}>{"──────────────────────"}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{color:lo,minWidth:48}}>CUR:</span>
              <input value={pwCur} onChange={e=>setPwCur(e.target.value)} type="password"
                style={{background:"transparent",border:`1px solid ${brd}`,color:fg,fontFamily:"inherit",fontSize:12,padding:"2px 4px",flex:1,minWidth:0}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{color:lo,minWidth:48}}>NEW:</span>
              <input value={pwNew} onChange={e=>setPwNew(e.target.value)} type="password"
                style={{background:"transparent",border:`1px solid ${brd}`,color:fg,fontFamily:"inherit",fontSize:12,padding:"2px 4px",flex:1,minWidth:0}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
              <span style={{color:lo,minWidth:48}}>CFM:</span>
              <input value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} type="password"
                onKeyDown={e=>{if(e.key==="Enter")doChangePassword()}}
                style={{background:"transparent",border:`1px solid ${brd}`,color:fg,fontFamily:"inherit",fontSize:12,padding:"2px 4px",flex:1,minWidth:0}}/>
            </div>
            {pwMsg&&<div style={{color:pwMsg.e?"#885555":vlo,marginBottom:4,fontSize:12}}>{pwMsg.t}</div>}
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <span onClick={pwLoading?undefined:doChangePassword} style={{cursor:pwLoading?"default":"pointer",padding:"2px 8px",border:`1px solid ${fg}`,color:bgc,background:vlo,opacity:pwLoading?0.5:1}}>{pwLoading?"...":"SAVE"}</span>
            </div>
            <div style={{borderTop:`1px solid ${brd}`,paddingTop:6}}>
              <span onClick={doLogout} style={{cursor:"pointer",color:"#885555",fontWeight:700}}>LOG OUT</span>
            </div>
          </div>}
        </div>

        {/* Button legend — pinned to bottom of LCD when roster is empty */}
        {vw==="PORT"&&me.r.length===0&&<div style={{flexShrink:0,padding:"3px 6px 4px",borderTop:`1px solid ${brd}`,fontSize:8,color:lo,display:"flex",justifyContent:"space-between",gap:1,textAlign:"center"}}>
          {["Scores","Portfolio","Scroll","Market","Settings"].map((lbl,i)=>
            <div key={i} style={{flex:1,lineHeight:1.2}}>
              <div style={{fontWeight:700,color:fg}}>{lbl}</div>
              <div style={{color:brd,fontSize:9}}>v</div>
            </div>)}
        </div>}

        {/* Modal */}
        {sel&&<div onClick={()=>setSel(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)",zIndex:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:hi,border:`2px solid ${fg}`,padding:"8px 10px",width:"85%",maxHeight:"80%",overflow:"auto"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:3,color:vlo}}>{ta==="B"?"BUY":"SELL"}: {sel.nm}</div>
            <div style={{fontSize:12,color:lo,marginBottom:4}}>{sel.tm} | {[...new Set(sel.el.map(dSlot))].join("/")}</div>
            <div style={{fontSize:13,marginBottom:3}}><span style={{color:lo}}>$ </span><span style={{fontWeight:700}}>{f$(sel.c)}</span> <span style={{color:lo}}>W </span>{sel.w.toFixed(1)}</div>
            {ta==="B"&&<>
              <div style={{fontSize:12,color:lo,marginBottom:2}}>SLOT:</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:4}}>
                {[...new Set(sel.el.map(dSlot))].map(ds=>{
                  const matching=sel.el.filter(s=>dSlot(s)===ds);const openM=oSlots(me.r,matching);const ok=openM.length>0;const isSel=sl&&dSlot(sl)===ds;
                  return<span key={ds} onClick={()=>ok&&setSl(openM[0])} style={{padding:"2px 6px",fontSize:13,border:`1px solid ${isSel?fg:ok?brd:"#ccc"}`,color:isSel?bgc:ok?fg:"#ccc",background:isSel?fg:"transparent",cursor:ok?"pointer":"default"}}>{ds}</span>})}
              </div>
              <div style={{fontSize:12,marginBottom:4}}><span style={{color:lo}}>Left: </span>{f$(rem)}<span style={{color:lo}}> After: </span>{f$(rem-sel.c)}</div>
              {(()=>{const mf=minFill([...me.r,...(sl?[{slot:sl}]:[])],raw);return mf.slots>0?<div style={{fontSize:12,marginBottom:4,color:rem-sel.c<mf.cost?"#885555":lo}}>RESERVE: ${f$(mf.cost)} ({mf.slots} slots)</div>:null})()}
              {sl&&PSLOTS.includes(sl)&&!isPreseason()&&<div style={{fontSize:12,marginBottom:4,color:"#885555",fontWeight:700}}>LOCKED {P_HOLD} DAYS (pitcher)</div>}
            </>}
            {ta==="S"&&sel.paid!=null&&<div style={{fontSize:12,marginBottom:4}}><span style={{color:lo}}>Paid: </span>{f$(sel.paid)}<span style={{color:lo}}> P/L: </span>{(()=>{const x=sel.c-sel.paid;return<span style={{color:x>=0?vlo:"#885555"}}>{x>=0?"+":""}{f$(x)}</span>})()}</div>}
            {ta==="S"&&(()=>{const hd=holdDays(sel.rSlot,sel.pat);return hd>0?<div style={{fontSize:12,marginBottom:4,color:"#885555"}}>HOLD: {hd}d remaining (pitcher)</div>:null})()}
            {(()=>{const locked=ta==="S"&&holdDays(sel.rSlot,sel.pat)>0;return<div style={{display:"flex",gap:4}}>
              <span onClick={()=>setSel(null)} style={{cursor:"pointer",padding:"2px 8px",border:`1px solid ${brd}`,fontSize:13,color:lo}}>CANCEL</span>
              <span onClick={()=>!locked&&(ta==="B"?buy(sel,sl):sell(sel))} style={{cursor:(ta==="B"&&!sl)||locked?"default":"pointer",padding:"2px 8px",fontSize:13,fontWeight:700,border:`1px solid ${fg}`,color:bgc,background:ta==="B"?(sl?vlo:brd):locked?brd:"#885555",opacity:(ta==="B"&&!sl)||locked ? 0.4 : 1}}>{ta==="B"?`BUY > ${sl?dSlot(sl):"..."}`:locked?"LOCKED":"SELL"}</span>
            </div>})()}
            </div>
          </div>
        </div>}
      </div>

      {/* Palm frame image overlay */}
      <img src="/WAR-street/palm-frame.png" alt="" style={{
        position:"absolute", inset:0,
        width:"100%", height:"100%",
        pointerEvents:"none",
        zIndex:2,
      }}/>

      {/* Palm physical button hotspots */}
      {(()=>{
        const DBG = false;
        const bst = (left,top,w,h,color) => ({position:"absolute",left,top,width:w,height:h,zIndex:3,cursor:"pointer",borderRadius:h==="7.6%"||h==="7.4%"||h==="7%"||h==="7.1%"?"50%":"40%",
          ...(DBG?{background:color,opacity:0.5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,fontFamily:"sans-serif"}:{})
        });
        const scrollBy = (dir) => { if(palmScrollRef.current) palmScrollRef.current.scrollBy({top:dir*80,behavior:"smooth"}); };
        return <>
          <div onClick={openPaper} style={bst("5.5%","84.9%","14.8%","7.4%","rgba(255,0,0,0.7)")} title="Box Scores"/>
          <div onClick={()=>setVw("PORT")} style={bst("25.8%","84.7%","14.8%","7.6%","rgba(0,180,0,0.7)")} title="Portfolio"/>
          <div onClick={()=>scrollBy(-1)} style={bst("44.5%","85.6%","14.1%","3.3%","rgba(0,100,255,0.7)")} title="Scroll Up"/>
          <div onClick={()=>scrollBy(1)} style={bst("44.5%","91.9%","13.8%","1.5%","rgba(0,200,200,0.7)")} title="Scroll Down"/>
          <div onClick={()=>setVw("MKT")} style={bst("64.1%","85.2%","14.3%","7%","rgba(255,140,0,0.7)")} title="Market"/>
          <div onClick={()=>setMenu(m=>!m)} style={bst("84.6%","85%","10.2%","7.1%","rgba(160,0,220,0.7)")} title="Settings"/>
        </>;
      })()}
    </div>

    {/* Mobile newspaper overlay — at viewport level, outside Palm container */}
    {showPaper&&<>
      <div onClick={()=>setShowPaper(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:100}}/>
      <div style={{position:"fixed",left:"3%",top:"calc(env(safe-area-inset-top) + 8px)",width:"94%",bottom:"calc(env(safe-area-inset-bottom) + 8px)",zIndex:101,background:"#ddd5c3",borderRadius:2,boxShadow:"0 8px 40px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",fontFamily:"'Source Sans 3','Segoe UI',sans-serif",color:"#1a1a1a",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:"url(/WAR-street/newsprint-texture.jpg)",backgroundSize:"cover",opacity:0.55,pointerEvents:"none",zIndex:0}}/>
        <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,transparent 1px,transparent 2px),repeating-linear-gradient(90deg,rgba(0,0,0,0.02) 0px,transparent 1px,transparent 3px)",pointerEvents:"none",zIndex:0}}/>
        <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",height:"100%"}}>
        <div style={{padding:"6px 10px 0",flexShrink:0,textAlign:"center",position:"relative"}}>
          <div onClick={()=>setShowPaper(false)} style={{position:"absolute",right:6,top:4,cursor:"pointer",fontSize:28,color:"#444",fontFamily:"sans-serif",lineHeight:1,padding:"8px 10px",zIndex:2}}>✕</div>
          <div style={{borderTop:"2px solid #000",borderBottom:"1px solid #000",height:3,marginBottom:3}}/>
          <div style={{fontFamily:"'Rojal','Georgia',serif",fontSize:28,fontWeight:400,letterSpacing:-0.5,margin:"2px 0",lineHeight:1.1}}>THE W<span style={{fontSize:"50%"}}>.</span>A<span style={{fontSize:"50%"}}>.</span>R<span style={{fontSize:"50%"}}>.</span> STREET JOURNAL</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",margin:"3px 0 4px",fontSize:8,color:"#444"}}>
            <span style={{fontStyle:"italic"}}>{boxData?(()=>{const d=new Date(boxData.date+"T12:00:00");return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})})():"..."}</span>
            <span style={{letterSpacing:1,fontWeight:700,fontSize:8}}>BASEBALL SCORES</span>
            <span>B14</span>
          </div>
          <div style={{borderTop:"1px solid #000",borderBottom:"1px solid #000",height:2}}/>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"8px 10px",WebkitOverflowScrolling:"touch"}}>
          {/* Fantasy: Team Rankings + Top Movers */}
          <div style={{borderBottom:"2px solid #000",paddingBottom:4,marginBottom:4}}>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:2}}>TEAM RANKINGS</div>
                {(()=>{
                  const sorted=[...lb].sort((a,b)=>b.w-a.w);
                  const top10=sorted.slice(0,10);
                  const myRank=sorted.findIndex(o=>o.id===cur);
                  const myInTop=myRank>=0&&myRank<10;
                  return<>
                    {top10.map((o,i)=><div key={o.id} style={{fontSize:8,lineHeight:1.3,display:"flex",justifyContent:"space-between",fontWeight:o.id===cur?700:400}}>
                      <span>{i+1}. {o.nm}</span>
                      <span style={{fontWeight:600}}>{o.w.toFixed(1)}</span>
                    </div>)}
                    {!myInTop&&myRank>=0&&<>
                      <div style={{fontSize:8,color:"#888",textAlign:"center",lineHeight:1.4}}>...</div>
                      <div style={{fontSize:8,lineHeight:1.3,display:"flex",justifyContent:"space-between",fontWeight:700}}>
                        <span>{myRank+1}. {sorted[myRank].nm}</span>
                        <span style={{fontWeight:600}}>{sorted[myRank].w.toFixed(1)}</span>
                      </div>
                    </>}
                  </>;
                })()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:2}}>TOP MOVERS</div>
                {(()=>{
                  const movers=[...raw].filter(p=>p.prH&&p.prH.length>1).map(p=>({nm:p.nm,tm:p.tm,chg:p.c-p.prH[0]})).sort((a,b)=>b.chg-a.chg).slice(0,10);
                  return movers.map((p,i)=><div key={i} style={{fontSize:8,lineHeight:1.3,display:"flex",justifyContent:"space-between"}}>
                    <span>{i+1}. {p.nm}</span>
                    <span style={{fontWeight:600}}>{p.chg>=0?"+":""}{f$(p.chg)}</span>
                  </div>);
                })()}
              </div>
            </div>
          </div>
          {leaders&&leaders.categories&&leaders.categories.length>0&&<div style={{borderBottom:"2px solid #000",paddingBottom:4,marginBottom:4}}>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:2}}>BATTING</div>
                {leaders.categories.filter(c=>c.stat_group==="hitting").map(cat=><div key={cat.category} style={{marginBottom:3}}>
                  <div style={{fontSize:9,fontWeight:700,borderBottom:"1px solid #ccc",paddingBottom:1,marginBottom:1}}>{cat.category}</div>
                  {cat.leaders.map(l=><div key={l.rank} style={{fontSize:9,lineHeight:1.3,display:"flex",justifyContent:"space-between"}}>
                    <span>{l.rank}. {l.name.split(" ").pop()} <span style={{color:"#888"}}>{l.team}</span></span>
                    <span style={{fontWeight:600}}>{l.value}</span>
                  </div>)}
                </div>)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:2}}>PITCHING</div>
                {leaders.categories.filter(c=>c.stat_group==="pitching").map(cat=><div key={cat.category} style={{marginBottom:3}}>
                  <div style={{fontSize:9,fontWeight:700,borderBottom:"1px solid #ccc",paddingBottom:1,marginBottom:1}}>{cat.category}</div>
                  {cat.leaders.map(l=><div key={l.rank} style={{fontSize:9,lineHeight:1.3,display:"flex",justifyContent:"space-between"}}>
                    <span>{l.rank}. {l.name.split(" ").pop()} <span style={{color:"#888"}}>{l.team}</span></span>
                    <span style={{fontWeight:600}}>{l.value}</span>
                  </div>)}
                </div>)}
              </div>
            </div>
          </div>}
          {boxLoading&&<div style={{textAlign:"center",padding:20,color:"#888",fontStyle:"italic",fontSize:12}}>Fetching scores...</div>}
          {boxData&&boxData.game_count===0&&<div style={{textAlign:"center",padding:20,color:"#888",fontStyle:"italic",fontSize:12}}>No games found for {boxData.date}.</div>}
          {boxData&&boxData.game_count>0&&<div style={{columnCount:2,columnGap:12,marginTop:2}}>
            {boxData.games.map(gm=>{
              const aw=gm.away, hm=gm.home;
              const maxInn=Math.max(aw.innings.length,hm.innings.length,9);
              const grp=(inn)=>{const out=[];for(let i=0;i<maxInn;i+=3){out.push(inn.slice(i,i+3).map(v=>v!=null?v:0).join(""));}return out;};
              return<div key={gm.game_pk} style={{breakInside:"avoid",pageBreakInside:"avoid",marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:11,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:1}}>{aw.r>=hm.r?aw.name:hm.name} {Math.max(aw.r,hm.r)}, {aw.r<hm.r?aw.name:hm.name} {Math.min(aw.r,hm.r)}</div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:700,lineHeight:1.2,marginTop:1}}>
                  <span>{aw.name}</span><span>{aw.r}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:700,lineHeight:1.2}}>
                  <span>{hm.name}</span><span>{hm.r}</span>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontSize:9,lineHeight:1.1,marginTop:1}}>
                  <tbody>
                    {[aw,hm].map(tm=><tr key={tm.abbrev}>
                      <th style={{textAlign:"left",width:"22%",fontWeight:700,borderTop:"1px solid #000",padding:"1px 0"}}>{tm.name.split(" ").pop()}</th>
                      {grp(tm.innings).map((g3,i)=><td key={i} style={{textAlign:"right",width:"10%",borderTop:"1px solid #000",padding:"1px 1px"}}>{g3}</td>)}
                      <td style={{textAlign:"right",borderTop:"1px solid #000",padding:"1px 1px"}}>—</td>
                      <td style={{textAlign:"right",fontWeight:700,borderTop:"1px solid #000",padding:"1px 1px"}}>{tm.r}</td>
                      <td style={{textAlign:"right",borderTop:"1px solid #000",padding:"1px 1px"}}>{tm.h}</td>
                      <td style={{textAlign:"right",borderTop:"1px solid #000",padding:"1px 1px"}}>{tm.e}</td>
                    </tr>)}
                  </tbody>
                </table>
                {[aw,hm].map(tm=><div key={tm.abbrev+"-b"}>
                  <div style={{fontSize:9,fontWeight:700,margin:"2px 0 0",borderBottom:"1px solid #000"}}>{tm.name.split(" ").pop()}</div>
                  <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontSize:9,lineHeight:1.1}}>
                    <thead><tr>
                      <th style={{width:"30%",textAlign:"left",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>Player</th>
                      {["AB","R","H","BI","BB","SO"].map(h=><th key={h} style={{width:"5%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>{h}</th>)}
                      <th style={{width:"8%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>Avg</th>
                    </tr></thead>
                    <tbody>
                      {tm.batters.map((b,i)=><tr key={i}>
                        <td style={{textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",padding:"0 0"}}>{b.name}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{b.ab}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{b.r}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{b.h}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{b.rbi}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{b.bb}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{b.so}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{b.avg}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>)}
                {[aw,hm].map(tm=><div key={tm.abbrev+"-p"}>
                  <div style={{fontSize:9,fontWeight:700,margin:"2px 0 0",borderBottom:"1px solid #000"}}>{tm.name.split(" ").pop()} Pitching</div>
                  <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontSize:9,lineHeight:1.1}}>
                    <thead><tr>
                      <th style={{width:"37%",textAlign:"left",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>Pitcher</th>
                      <th style={{width:"5%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>IP</th>
                      {["H","R","ER","BB","SO"].map(h=><th key={h} style={{width:"5%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>{h}</th>)}
                      <th style={{width:"10%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>ERA</th>
                    </tr></thead>
                    <tbody>
                      {tm.pitchers.map((p,i)=><tr key={i}>
                        <td style={{textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",padding:"0 0"}}>{p.name}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{p.ip}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{p.h}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{p.r}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{p.er}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{p.bb}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{p.so}</td>
                        <td style={{textAlign:"right",padding:"0 0"}}>{p.era}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>)}
                {gm.notes&&<div style={{fontSize:9,lineHeight:1.2,padding:"2px 0",borderTop:"1px solid #000",marginTop:1}}>{gm.notes}</div>}
              </div>})}
          </div>}
        </div>
        </div>
      </div>
    </>}
  </div>
);

}

// ═══════════════════════════════════════════════════════════
//  DESKTOP -- Bloomberg Terminal
// ═══════════════════════════════════════════════════════════
const g="#33ff33",bg="#0a0a0a",bg2_d="#0f0f0f",brd_d="#1e1e1e",dim="#555",amb="#ff9900",neg="#ff3333",wh="#ccc";
const pad_d={padding:"3px 8px",whiteSpace:"nowrap"};
const th2_d={...pad_d,color:dim,textAlign:"left",borderBottom:`1px solid ${brd_d}`,position:"sticky",top:0,background:bg,zIndex:2,fontSize:16};
const td2_d={...pad_d,borderBottom:`1px solid #161616`};

return(
<div style={{background:"#2a2520",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
<style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@800&family=Source+Sans+3:wght@200..900&display=swap'); @import url('https://fonts.cdnfonts.com/css/rojal'); @import url('https://fonts.cdnfonts.com/css/perfect-dos-vga-437'); *{box-sizing:border-box} .crt-screen *::-webkit-scrollbar{width:0;display:none} .crt-screen>.crt-scroll::-webkit-scrollbar{width:8px;display:block} .crt-screen>.crt-scroll::-webkit-scrollbar-thumb{background:#555;border-radius:3px} .crt-screen>.crt-scroll::-webkit-scrollbar-track{background:#1a1a1a} .crt-screen tr:hover td{background:#111 !important} .crt-screen ::selection{background:${g};color:${bg}} .crt-screen input::placeholder{color:#333} .crt-screen .crt::before{content:"";position:absolute;top:0;left:0;width:100%;height:100%;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15) 0px,rgba(0,0,0,0.15) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:1000} .crt-screen .crt::after{content:"";position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.4) 100%);pointer-events:none;z-index:999} .np-scroll::-webkit-scrollbar{width:6px} .np-scroll::-webkit-scrollbar-thumb{background:#bbb;border-radius:3px} .np-scroll::-webkit-scrollbar-track{background:transparent} .np-scroll table{border-collapse:collapse;table-layout:fixed;width:100%} .np-scroll td,.np-scroll th{overflow:hidden}`}</style>

{/* Monitor container */}
<div style={{position:"relative",width:"min(100vw, calc(100vh * 1080 / 608))",height:"min(100vh, calc(100vw * 608 / 1080))"}}>
  {/* Screen area — positioned in the transparent cutout */}
  <div className="crt-screen" style={{position:"absolute",left:"28.70%",top:"2.80%",width:"46.67%",height:"68.26%",borderRadius:6,background:bg,overflow:"hidden",zIndex:1}}>
    <div className="crt-scroll" style={{width:"100%",height:"100%",overflow:"auto",color:g,fontFamily:"'Perfect DOS VGA 437',monospace",fontSize:17,position:"relative"}}>
      <div className="crt" style={{position:"relative",minHeight:"100%"}}>
{/* Flash */}
{msg&&<div style={{position:"absolute",top:0,left:0,right:0,padding:"4px 16px",background:msg.e==="E"?"#331111":"#113311",color:msg.e==="E"?neg:g,zIndex:2000,fontSize:18,textAlign:"center",borderBottom:`1px solid ${msg.e==="E"?neg:g}`}}>{msg.m}</div>}

    {/* Header */}
    <div style={{padding:"6px 12px",borderBottom:`1px solid ${brd_d}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{position:"relative"}}>
          <span onClick={()=>setMenu(m=>!m)} style={{cursor:"pointer",color:dim,fontSize:24,lineHeight:1}}>☰</span>
          {menu&&(<>
            <div onClick={()=>setMenu(false)} style={{position:"fixed",inset:0,zIndex:80}}/>
            <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:bg,border:`1px solid ${brd_d}`,zIndex:81,minWidth:220}}>
              <div style={{padding:"6px 14px",color:amb,borderBottom:`1px solid ${brd_d}`,fontSize:14}}>{me.nm}</div>
              {[["Profile Info",()=>setVw("PROF")],["Settings",()=>setVw("SETTINGS")]].map(([label,fn],i)=>(
                <div key={i} onClick={()=>{fn();setMenu(false)}} style={{padding:"8px 14px",cursor:"pointer",color:wh,fontSize:16}} onMouseEnter={e=>e.currentTarget.style.background="#111"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{label}</div>))}
              <div onClick={()=>{doLogout();setMenu(false)}} style={{padding:"8px 14px",cursor:"pointer",color:neg,fontSize:16}} onMouseEnter={e=>e.currentTarget.style.background="#111"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Log Out</div>
            </div>
          </>)}
        </div>
        <span style={{color:amb,fontWeight:800,fontSize:32,flexShrink:0,letterSpacing:"2px",fontFamily:"'JetBrains Mono',monospace"}}>WAR STREET</span>
      </div>
      <span style={{color:dim,fontSize:18,flexShrink:0}}>MLB 2026 GM {GP}</span>
    </div>

    {/* Status */}
    <div style={{padding:"3px 12px",borderBottom:`1px solid ${brd_d}`,display:"flex",gap:16,color:dim,fontSize:16,flexWrap:"wrap",alignItems:"center"}}>
      <span>BUDGET <span style={{color:amb}}>{f$(rem)}</span></span>
      <span>WAR <span style={{color:g}}>{tW.toFixed(1)}</span></span>
      <span>VALUE <span style={{color:g}}>{f$(pV)}</span></span>
      <span>P/L <span style={{color:pV-sp>=0?g:neg}}>{pV-sp>=0?"+":""}{f$(pV-sp)}</span></span>
      <span>TX <span style={{color:me.tx>=MAX_TX?neg:g}}>{MAX_TX-me.tx}</span>/{MAX_TX}</span>
      <span>ROSTER {me.r.length}/13</span>
      <span style={{color:"#2a2a2a",margin:"0 4px"}}>│</span>
      {["MKT","PORT","RANK","HELP"].map(v=>
        <span key={v} onClick={()=>setVw(v)} style={{cursor:"pointer",padding:"1px 8px",color:vw===v?bg:dim,background:vw===v?g:"transparent"}}>{v}</span>)}
    </div>

    {/* Ticker */}
    <div style={{padding:"3px 0",borderBottom:`1px solid ${brd_d}`,background:"#060606",fontSize:18}}>
      <Ticker items={tickerItems}/>
    </div>

    <div style={{padding:"8px 12px"}}>
      {/* MARKET */}
      {vw==="MKT"&&(<div>
        <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"center",flexWrap:"wrap",fontSize:16}}>
          <span style={{color:dim}}>SHOW</span>
          {["ALL","HIT","PIT"].map(v=>
            <span key={v} onClick={()=>setFt(v)} style={{cursor:"pointer",color:ft===v?bg:dim,background:ft===v?g:"transparent",padding:"1px 8px"}}>{v}</span>)}
          <span style={{color:"#2a2a2a"}}>│</span>
          <span style={{color:dim}}>SORT</span>
          {["PRICE","WAR","CHG","AZ","VOL"].map(v=>
            <span key={v} onClick={()=>setSo(v)} style={{cursor:"pointer",color:so===v?bg:dim,background:so===v?g:"transparent",padding:"1px 8px"}}>{v}</span>)}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="> search" style={{marginLeft:"auto",background:"transparent",border:`1px solid ${brd_d}`,color:g,fontFamily:"inherit",fontSize:16,padding:"2px 8px",width:180}}/>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:750,tableLayout:"fixed"}}>
            <thead><tr>
              <th style={{...th2_d,position:"sticky",left:0,zIndex:3,background:bg,width:110}}>PLAYER</th>
              <th style={{...th2_d,width:40,textAlign:"center"}}></th>
              <th style={{...th2_d,width:36}}>TM</th>
              <th style={{...th2_d,width:55}}>POS</th>
              <th style={{...th2_d,width:60}}>PRICE</th>
              <th style={{...th2_d,width:48,textAlign:"center",cursor:"pointer",userSelect:"none"}} onClick={cycleSparkFrame}>$ <span style={{color:amb}}>[{sparkFrame}]</span></th>
              <th style={{...th2_d,cursor:"pointer",userSelect:"none",width:55}} onClick={cycleFrame}>CHG <span style={{color:amb}}>[{chgFrame}]</span></th>
              <th style={{...th2_d,width:40}}>WAR</th>
              <th style={{...th2_d,width:50}}>VOL</th>
              <th style={{...th2_d,width:36}}>TB/K</th>
            </tr></thead>
            <tbody>
              {mk.map(p=>{
                const mine=has(p.id);const ok=!mine&&fits(me.r,p);const no=!mine&&!ok;
                const ch=simChg(p,chgFrame);
                const vol=p.vol||0;
                return(
                  <tr key={p.id} style={{background:mine?"#081208":"transparent"}}>
                    <td style={{...td2_d,color:mine?amb:wh,position:"sticky",left:0,background:mine?"#081208":bg,zIndex:1}}>{p.nm}</td>
                    <td style={{...td2_d,textAlign:"center"}}>
                      {mine?<span onClick={()=>openSell(p)} style={{cursor:"pointer",background:neg,color:bg,padding:"1px 0",fontWeight:700,fontSize:14,display:"inline-block",width:44,textAlign:"center"}}>SELL</span>
                      :ok?<span onClick={()=>openBuy(p)} style={{cursor:"pointer",background:g,color:bg,padding:"1px 0",fontWeight:700,fontSize:14,display:"inline-block",width:44,textAlign:"center"}}>BUY</span>
                      :<span style={{color:"#1a1a1a"}}>---</span>}
                    </td>
                    <td style={{...td2_d,color:dim}}>{p.tm}</td>
                    <td style={{...td2_d,overflow:"hidden",textOverflow:"ellipsis"}} title={[...new Set(p.el.map(dSlot))].join("/")}>{[...new Set(p.el.map(dSlot))].join("/")}</td>
                    <td style={{...td2_d,color:wh}}>{f$(p.c)}</td>
                    <td style={{...td2_d,textAlign:"center"}}>{(()=>{const pts=sparkFrame==="1W"?p.prH.slice(-7):sparkFrame==="1M"?p.prH.slice(-30):p.prH;const open=p.prH.length?p.prH[0]:null;return Spark(pts,wh,48,14,open)})()}</td>
                    <td style={{...td2_d,color:ch.pct>=0?g:neg}}>{ch.pct>=0?"+":""}{ch.pct}%</td>
                    <td style={td2_d}>{p.w.toFixed(1)}</td>
                    <td style={td2_d}>
                      <div style={{display:"inline-block",verticalAlign:"middle",width:30,height:6,background:"#1a1a1a",marginRight:4}}>
                        <div style={{width:`${vol}%`,height:"100%",background:vol>66?amb:vol>33?g:dim}}/>
                      </div>
                      <span style={{fontSize:12}}>{vol}</span>
                    </td>
                    <td style={{...td2_d,color:p.tbk!=null?wh:"#1a1a1a",fontSize:14}}>{p.tbk!=null?p.tbk:"--"}</td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      </div>)}

      {/* PORTFOLIO */}
      {vw==="PORT"&&(<div>
        <div style={{color:dim,marginBottom:6,fontSize:18}}>ROSTER -- {me.nm}</div>
        {me.r.length===0?<div style={{padding:"8px 0",lineHeight:1.8}}>
          <div style={{color:amb,marginBottom:6}}>WELCOME TO WAR STREET</div>
          <div style={{color:wh,marginBottom:4}}>Buy and sell MLB players like stocks. Prices move with on-field performance and demand.</div>
          <div style={{marginBottom:4}}><span style={{color:amb}}>BUDGET</span> <span style={{color:wh}}>${BUDGET/1e6}M to fill 13 roster slots</span></div>
          <div style={{marginBottom:4}}><span style={{color:amb}}>GOAL</span> <span style={{color:wh}}>Highest cumulative WAR at season end wins</span></div>
          <div style={{marginBottom:4}}><span style={{color:amb}}>TX</span> <span style={{color:wh}}>{MAX_TX}/wk once season starts{isPreseason()?" (unlimited now)":""}</span></div>
          <div style={{marginBottom:4}}><span style={{color:neg}}>HOLD</span> <span style={{color:wh}}>Pitchers locked {P_HOLD} days after purchase</span></div>
          <div style={{marginBottom:8}}><span style={{color:amb}}>Check the newspaper below the monitor for yesterday's box scores and standings.</span></div>
          <div><span onClick={()=>setVw("MKT")} style={{cursor:"pointer",color:bg,background:g,padding:"2px 12px",fontWeight:700}}>&gt; GO TO MARKET</span></div>
        </div>
        :<table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
          <colgroup>
            <col style={{width:"7%"}}/>
            <col style={{width:"25%"}}/>
            <col style={{width:"7%"}}/>
            <col style={{width:"13%"}}/>
            <col style={{width:"13%"}}/>
            <col style={{width:"13%"}}/>
            <col style={{width:"9%"}}/>
            <col style={{width:"13%"}}/>
          </colgroup>
          <thead><tr>{["SLOT","PLAYER","TM","PRICE","PAID","P/L","WAR",""].map((h,i)=><th key={h} style={th2_d}>{h}</th>)}</tr></thead>
          <tbody>
            {rE.map(({slot:s,p,paid,pat})=>{
              if(!p)return(<tr key={s}><td style={{...td2_d,color:"#2a2a2a"}}>{dSlot(s)}</td><td colSpan={7} style={{...td2_d,color:"#1a1a1a"}}>-- empty --</td></tr>);
              const pl2=p.c-paid;const hd=holdDays(s,pat);
              return(<tr key={s}>
                <td style={{...td2_d,color:amb}}>{dSlot(s)}</td>
                <td style={{...td2_d,color:wh,overflow:"hidden",textOverflow:"ellipsis"}}>{p.nm}{hd>0?<span style={{color:neg,fontSize:12}}> {hd}d</span>:null}</td>
                <td style={{...td2_d,color:dim}}>{p.tm}</td>
                <td style={{...td2_d,color:wh}}>{f$(p.c)}</td>
                <td style={{...td2_d,color:dim}}>{f$(paid)}</td>
                <td style={{...td2_d,color:pl2>=0?g:neg}}>{pl2>=0?"+":""}{f$(pl2)}</td>
                <td style={td2_d}>{p.w.toFixed(1)}</td>
                <td style={td2_d}>{hd>0?<span style={{color:dim,fontSize:12}}>{hd}d</span>:<span onClick={()=>openSell(p)} style={{cursor:"pointer",background:neg,color:bg,padding:"1px 8px",fontWeight:700,fontSize:14}}>SELL</span>}</td>
              </tr>)})}
          </tbody>
        </table>}
      </div>)}

      {/* STANDINGS */}
      {vw==="RANK"&&(<div>
        <div style={{color:dim,marginBottom:6,fontSize:18}}>STANDINGS</div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["#","TEAM","WAR","VALUE"].map(h=><th key={h} style={th2_d}>{h}</th>)}</tr></thead>
          <tbody>
            {lb.map((o,i)=>(<tr key={o.id} style={{background:o.id===cur?"#081208":"transparent"}}>
              <td style={{...td2_d,color:i<3?amb:dim}}>{i+1}</td>
              <td style={{...td2_d,color:o.id===cur?amb:wh}}>{o.nm}{o.id===cur?" ◄":""}</td>
              <td style={td2_d}>{o.w.toFixed(1)}</td>
              <td style={{...td2_d,color:dim}}>{f$(o.v)}</td>
            </tr>))}
          </tbody>
        </table>
        <div style={{marginTop:10,color:"#222"}}>Rosters are private.</div>
      </div>)}

      {/* HELP */}
      {vw==="HELP"&&(<div style={{maxWidth:580}}>
        <div style={{color:amb,marginBottom:8,fontSize:28}}>RULES</div>
        {[["BUDGET",`$${(BUDGET/1e6)}M. Fill 13 roster slots.`],["ROSTER","C 1B 2B 3B SS OF OF OF SP SP SP SP RP"],["ELIG","Players fill only qualified positions."],["OWNERSHIP","Shared. Multiple owners can hold same player."],["SCORING","Cumulative WAR. Highest total wins."],["PRICE","Projection/actual blend + momentum + hidden demand."],["CHG","Click column header to cycle: 1D / 1W / 2W / 1M"],["TX",`${MAX_TX} per week. Buy or sell = 1 tx.`],["HOLD",`Pitchers locked ${P_HOLD} days after purchase. No day-trading arms.`],["PRIVACY","Rosters hidden. Standings show WAR + value only."]].map(([t,d],i)=>(
          <div key={i} style={{marginBottom:5}}><span style={{color:t==="HOLD"?neg:amb}}>{t}</span><span style={{color:dim}}> -- {d}</span></div>))}
      </div>)}

      {/* PROFILE */}
      {vw==="PROF"&&(<div style={{maxWidth:580}}>
        <div style={{color:amb,marginBottom:8,fontSize:28}}>PROFILE</div>
        <div style={{lineHeight:2.2,fontSize:18}}>
          <div><span style={{color:dim}}>TEAM </span><span style={{color:wh,fontWeight:700}}>{me.nm}</span></div>
          <div><span style={{color:dim}}>NAME </span><span style={{color:wh}}>{me.fn} {me.ln}</span></div>
          <div><span style={{color:dim}}>EMAIL </span><span style={{color:wh}}>{me.em}</span></div>
          <div><span style={{color:dim}}>MEMBER SINCE </span><span style={{color:wh}}>{me.ca?new Date(me.ca).toLocaleDateString():"-"}</span></div>
        </div>
        <div style={{borderTop:`1px solid ${brd_d}`,marginTop:10,paddingTop:10}}>
          <div style={{color:amb,marginBottom:6,fontSize:22}}>SEASON STATS</div>
          <div style={{lineHeight:2.2,fontSize:18}}>
            <div><span style={{color:dim}}>TOTAL WAR </span><span style={{color:g,fontWeight:700}}>{tW.toFixed(1)}</span></div>
            <div><span style={{color:dim}}>PORTFOLIO VALUE </span><span style={{color:g,fontWeight:700}}>{f$(pV)}</span></div>
            <div><span style={{color:dim}}>BUDGET </span><span style={{color:amb}}>{f$(rem)}</span></div>
            <div><span style={{color:dim}}>SPENT </span><span style={{color:wh}}>{f$(sp)}</span></div>
            <div><span style={{color:dim}}>P/L </span><span style={{color:pV-sp>=0?g:neg}}>{pV-sp>=0?"+":""}{f$(pV-sp)}</span></div>
            <div><span style={{color:dim}}>ROSTER </span>{me.r.length}/13</div>
            <div><span style={{color:dim}}>TX LEFT </span><span style={{color:me.tx>=MAX_TX?neg:g}}>{MAX_TX-me.tx}</span>/{MAX_TX}</div>
          </div>
        </div>
      </div>)}

      {/* SETTINGS */}
      {vw==="SETTINGS"&&(<div style={{maxWidth:480}}>
        <div style={{color:amb,marginBottom:8,fontSize:28}}>SETTINGS</div>
        <div style={{color:dim,marginBottom:6,fontSize:18}}>CHANGE PASSWORD</div>
        <div style={{marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <span style={{color:dim,minWidth:100,fontSize:16}}>CURRENT</span>
            <input value={pwCur} onChange={e=>setPwCur(e.target.value)} type="password"
              style={{background:"transparent",border:`1px solid ${brd_d}`,color:g,fontFamily:"inherit",fontSize:16,padding:"4px 8px",flex:1}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <span style={{color:dim,minWidth:100,fontSize:16}}>NEW</span>
            <input value={pwNew} onChange={e=>setPwNew(e.target.value)} type="password"
              style={{background:"transparent",border:`1px solid ${brd_d}`,color:g,fontFamily:"inherit",fontSize:16,padding:"4px 8px",flex:1}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <span style={{color:dim,minWidth:100,fontSize:16}}>CONFIRM</span>
            <input value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} type="password"
              onKeyDown={e=>{if(e.key==="Enter")doChangePassword()}}
              style={{background:"transparent",border:`1px solid ${brd_d}`,color:g,fontFamily:"inherit",fontSize:16,padding:"4px 8px",flex:1}}/>
          </div>
          {pwMsg&&<div style={{color:pwMsg.e?neg:g,marginBottom:6,fontSize:16}}>{pwMsg.t}</div>}
          <span onClick={pwLoading?undefined:doChangePassword} style={{cursor:pwLoading?"default":"pointer",color:bg,fontWeight:700,padding:"4px 16px",background:pwLoading?"#333":g,fontSize:16}}>{pwLoading?"...":"SAVE PASSWORD"}</span>
        </div>
        <div style={{borderTop:`1px solid ${brd_d}`,marginTop:16,paddingTop:12}}>
          <span onClick={doLogout} style={{cursor:"pointer",color:neg,fontWeight:700,fontSize:18}}>LOG OUT</span>
        </div>
      </div>)}
    </div>

    {/* Modal */}
    {sel&&(<div onClick={()=>setSel(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:bg,border:`1px solid ${g}`,padding:"20px 28px",minWidth:320}}>
        <div style={{color:amb,fontSize:26,marginBottom:6}}>{ta==="B"?"BUY":"SELL"}</div>
        <div style={{color:wh,fontSize:26,marginBottom:2}}>{sel.nm}</div>
        <div style={{color:dim,marginBottom:8,fontSize:18}}>{sel.tm} -- ELIG: {[...new Set(sel.el.map(dSlot))].join(" / ")}</div>
        <div style={{display:"flex",gap:16,marginBottom:4,fontSize:22}}>
          <span><span style={{color:dim}}>PRICE </span><span style={{color:wh}}>{f$(sel.c)}</span></span>
          <span><span style={{color:dim}}>WAR </span>{sel.w.toFixed(1)}</span>
        </div>
        <div style={{marginBottom:8,fontSize:22}}>
          <span style={{color:dim}}>CHG </span>
          {(()=>{const ch=simChg(sel,chgFrame);return<span style={{color:ch.pct>=0?g:neg}}>{ch.pct>=0?"+":""}{ch.pct}%</span>})()}
        </div>
        {ta==="B"&&(<>
          <div style={{color:dim,marginBottom:4,fontSize:18}}>SELECT SLOT</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {[...new Set(sel.el.map(dSlot))].map(ds=>{
              const matching=sel.el.filter(s=>dSlot(s)===ds);const openM=oSlots(me.r,matching);const ok=openM.length>0;const isSel=sl&&dSlot(sl)===ds;
              return<span key={ds} onClick={()=>ok&&setSl(openM[0])} style={{padding:"3px 12px",cursor:ok?"pointer":"default",border:`1px solid ${isSel?g:ok?brd_d:"#1a1a1a"}`,color:isSel?bg:ok?g:"#2a2a2a",background:isSel?g:"transparent"}}>{ds}</span>})}
          </div>
          <div style={{marginBottom:4,fontSize:18}}>
            <span style={{color:dim}}>BUDGET </span>{f$(rem)}
            <span style={{color:dim,marginLeft:12}}>AFTER </span>
            <span style={{color:rem-sel.c>=0?g:neg}}>{f$(rem-sel.c)}</span>
          </div>
          {(()=>{const mf=minFill([...me.r,...(sl?[{slot:sl}]:[])],raw);return mf.slots>0?<div style={{marginBottom:8,fontSize:16,color:rem-sel.c<mf.cost?neg:dim}}>RESERVE: ${f$(mf.cost)} ({mf.slots} slots)</div>:null})()}
          {sl&&PSLOTS.includes(sl)&&!isPreseason()&&<div style={{marginBottom:8,fontSize:16,color:neg,fontWeight:700}}>LOCKED {P_HOLD} DAYS (pitcher)</div>}
        </>)}
        {ta==="S"&&sel.paid!=null&&(
          <div style={{marginBottom:8,fontSize:18}}>
            <span style={{color:dim}}>PAID </span>{f$(sel.paid)}
            <span style={{color:dim,marginLeft:12}}>P/L </span>
            {(()=>{const x=sel.c-sel.paid;return<span style={{color:x>=0?g:neg}}>{x>=0?"+":""}{f$(x)}</span>})()}
          </div>)}
        {ta==="S"&&(()=>{const hd=holdDays(sel.rSlot,sel.pat);return hd>0?<div style={{marginBottom:8,fontSize:16,color:neg}}>HOLD: {hd}d remaining (pitcher)</div>:null})()}
        {(()=>{const locked=ta==="S"&&holdDays(sel.rSlot,sel.pat)>0;return<div style={{display:"flex",gap:8,marginTop:4}}>
          <span onClick={()=>setSel(null)} style={{cursor:"pointer",color:dim,padding:"3px 12px",border:`1px solid ${brd_d}`}}>CANCEL</span>
          <span onClick={()=>!locked&&(ta==="B"?buy(sel,sl):sell(sel))} style={{cursor:(ta==="B"&&!sl)||locked?"default":"pointer",color:bg,fontWeight:700,padding:"3px 16px",background:ta==="B"?(sl?g:"#333"):locked?"#333":neg,opacity:(ta==="B"&&!sl)||locked ? 0.3 : 1}}>{ta==="B"?`BUY > ${sl?dSlot(sl):"..."}`:locked?"LOCKED":"SELL"}</span>
        </div>})()}
        <div style={{color:"#222",marginTop:6,fontSize:20}}>{MAX_TX-me.tx} tx remaining</div>
      </div>
    </div>)}
      </div>
    </div>
  </div>

  {/* Monitor frame overlay */}
  <img src="/WAR-street/monitor-frame.png" alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:2}}/>

  {/* Newspaper hotspot — clickable area over the newspaper in the desk image */}
  {/* Newspaper hotspot — right-angle triangle: left edge 15% up from bottom-left, to bottom-center */}
  <div onClick={openPaper} style={{position:"absolute",left:0,bottom:0,width:"50%",height:"15%",zIndex:3,cursor:"pointer",clipPath:"polygon(0 0, 0 100%, 100% 100%)"}} title="Yesterday's Box Scores"/>

  {/* Newspaper overlay */}
  {showPaper&&<>
    {/* Backdrop */}
    <div onClick={()=>setShowPaper(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9}}/>
    {/* Newspaper — waldrn.com layout + newsprint texture */}
    <div style={{position:"absolute",left:"8%",top:"2%",width:"84%",height:"94%",zIndex:10,background:"#ddd5c3",borderRadius:1,boxShadow:"0 8px 40px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",fontFamily:"'Source Sans 3','Segoe UI',sans-serif",color:"#1a1a1a",overflow:"hidden"}}>
      {/* Newsprint texture overlay */}
      <div style={{position:"absolute",inset:0,backgroundImage:"url(/WAR-street/newsprint-texture.jpg)",backgroundSize:"cover",opacity:0.55,pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,transparent 1px,transparent 2px),repeating-linear-gradient(90deg,rgba(0,0,0,0.02) 0px,transparent 1px,transparent 3px),repeating-linear-gradient(45deg,rgba(0,0,0,0.01) 0px,transparent 1px,transparent 6px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 30% 20%,rgba(180,160,120,0.15),transparent 60%),radial-gradient(ellipse at 70% 80%,rgba(160,140,100,0.12),transparent 50%)",pointerEvents:"none",zIndex:0}}/>
      {/* Content (above texture) */}
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Masthead */}
      <div style={{padding:"10px 16px 0",flexShrink:0,textAlign:"center",position:"relative"}}>
        <div onClick={()=>setShowPaper(false)} style={{position:"absolute",right:10,top:8,cursor:"pointer",fontSize:18,color:"#888",fontFamily:"sans-serif",lineHeight:1,zIndex:2}}>✕</div>
        {/* Top rule */}
        <div style={{borderTop:"2px solid #000",borderBottom:"1px solid #000",height:4,marginBottom:4}}/>
        <div style={{fontFamily:"'Rojal','Georgia',serif",fontSize:90,fontWeight:400,letterSpacing:-1,margin:"2px 0",lineHeight:1}}>THE W<span style={{fontSize:"50%"}}>.</span>A<span style={{fontSize:"50%"}}>.</span>R<span style={{fontSize:"50%"}}>.</span> STREET JOURNAL</div>
        {/* Subhead + info row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",margin:"4px 0 6px",fontSize:10,color:"#444"}}>
          <span style={{fontStyle:"italic"}}>{boxData?(()=>{const d=new Date(boxData.date+"T12:00:00");return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})})():"..."}</span>
          <span style={{letterSpacing:2,fontWeight:700,fontSize:11}}>BASEBALL SCORES</span>
          <span>B14</span>
        </div>
        {/* Bottom rule */}
        <div style={{borderTop:"1px solid #000",borderBottom:"1px solid #000",height:2}}/>
      </div>

      {/* Scrollable body */}
      <div className="np-scroll" style={{flex:1,overflow:"auto",padding:"8px 14px"}}>

        {/* League Leaders + Fantasy Rankings + Top Movers */}
        {leaders&&leaders.categories&&leaders.categories.length>0&&<div style={{borderBottom:"2px solid #000",paddingBottom:6,marginBottom:6}}>
          <div style={{display:"flex",gap:16}}>
            {/* Batting column */}
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:3}}>BATTING</div>
              {leaders.categories.filter(c=>c.stat_group==="hitting").map(cat=><div key={cat.category} style={{marginBottom:4}}>
                <div style={{fontSize:10,fontWeight:700,borderBottom:"1px solid #ccc",paddingBottom:1,marginBottom:1}}>{cat.category}</div>
                {cat.leaders.map(l=><div key={l.rank} style={{fontSize:10,lineHeight:1.3,display:"flex",justifyContent:"space-between"}}>
                  <span>{l.rank}. {l.name.split(" ").pop()} <span style={{color:"#888"}}>{l.team}</span></span>
                  <span style={{fontWeight:600}}>{l.value}</span>
                </div>)}
              </div>)}
            </div>
            {/* Pitching column */}
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:3}}>PITCHING</div>
              {leaders.categories.filter(c=>c.stat_group==="pitching").map(cat=><div key={cat.category} style={{marginBottom:4}}>
                <div style={{fontSize:10,fontWeight:700,borderBottom:"1px solid #ccc",paddingBottom:1,marginBottom:1}}>{cat.category}</div>
                {cat.leaders.map(l=><div key={l.rank} style={{fontSize:10,lineHeight:1.3,display:"flex",justifyContent:"space-between"}}>
                  <span>{l.rank}. {l.name.split(" ").pop()} <span style={{color:"#888"}}>{l.team}</span></span>
                  <span style={{fontWeight:600}}>{l.value}</span>
                </div>)}
              </div>)}
            </div>
            {/* Fantasy Team Rankings by WAR */}
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:3}}>TEAM RANKINGS</div>
              {(()=>{
                const sorted=[...lb].sort((a,b)=>b.w-a.w);
                const top20=sorted.slice(0,20);
                const myRank=sorted.findIndex(o=>o.id===cur);
                const myInTop=myRank>=0&&myRank<20;
                return<>
                  {top20.map((o,i)=><div key={o.id} style={{fontSize:10,lineHeight:1.3,display:"flex",justifyContent:"space-between",fontWeight:o.id===cur?700:400}}>
                    <span>{i+1}. {o.nm}</span>
                    <span style={{fontWeight:600}}>{o.w.toFixed(1)}</span>
                  </div>)}
                  {!myInTop&&myRank>=0&&<>
                    <div style={{fontSize:10,color:"#888",textAlign:"center",lineHeight:1.6}}>...</div>
                    <div style={{fontSize:10,lineHeight:1.3,display:"flex",justifyContent:"space-between",fontWeight:700}}>
                      <span>{myRank+1}. {sorted[myRank].nm}</span>
                      <span style={{fontWeight:600}}>{sorted[myRank].w.toFixed(1)}</span>
                    </div>
                  </>}
                </>;
              })()}
            </div>
            {/* Most Appreciated Players */}
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:3}}>TOP MOVERS</div>
              <div style={{fontSize:9,fontWeight:700,borderBottom:"1px solid #ccc",paddingBottom:1,marginBottom:2}}>Since Opening Day</div>
              {(()=>{
                const movers=[...raw].filter(p=>p.prH&&p.prH.length>1).map(p=>({nm:p.nm,tm:p.tm,chg:p.c-p.prH[0]})).sort((a,b)=>b.chg-a.chg).slice(0,20);
                return movers.map((p,i)=><div key={i} style={{fontSize:10,lineHeight:1.3,display:"flex",justifyContent:"space-between"}}>
                  <span>{i+1}. {p.nm} <span style={{color:"#888"}}>{p.tm}</span></span>
                  <span style={{fontWeight:600}}>{p.chg>=0?"+":""}{f$(p.chg)}</span>
                </div>);
              })()}
            </div>
          </div>
        </div>}

        {boxLoading&&<div style={{textAlign:"center",padding:30,color:"#888",fontStyle:"italic",fontSize:13}}>Fetching scores...</div>}
        {boxData&&boxData.game_count===0&&<div style={{textAlign:"center",padding:30,color:"#888",fontStyle:"italic",fontSize:13}}>No games found for {boxData.date}.</div>}

        {/* 3-column game grid (CSS columns like waldrn) */}
        {boxData&&boxData.game_count>0&&<div style={{columnCount:4,columnGap:14,marginTop:4}}>
          {boxData.games.map(gm=>{
            const aw=gm.away, hm=gm.home;
            // Group innings in 3s for newspaper-style linescore
            const maxInn=Math.max(aw.innings.length,hm.innings.length,9);
            const grp=(inn)=>{const out=[];for(let i=0;i<maxInn;i+=3){out.push(inn.slice(i,i+3).map(v=>v!=null?v:0).join(""));}return out;};
            return<div key={gm.game_pk} style={{breakInside:"avoid",pageBreakInside:"avoid",marginBottom:14}}>

              {/* Game header */}
              <div style={{fontWeight:700,fontSize:13,borderBottom:"1px solid #000",paddingBottom:1,marginBottom:2}}>{aw.r>=hm.r?aw.name:hm.name} {Math.max(aw.r,hm.r)}, {aw.r<hm.r?aw.name:hm.name} {Math.min(aw.r,hm.r)}</div>

              {/* Team lines with score */}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,lineHeight:1.2,marginTop:1}}>
                <span>{aw.name}</span><span>{aw.r}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,lineHeight:1.2}}>
                <span>{hm.name}</span><span>{hm.r}</span>
              </div>

              {/* Linescore table */}
              <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontSize:10,lineHeight:1.1,marginTop:2}}>
                <tbody>
                  {[aw,hm].map(tm=><tr key={tm.abbrev}>
                    <th style={{textAlign:"left",width:"22%",fontWeight:700,borderTop:"1px solid #000",padding:"1px 0"}}>{tm.name.split(" ").pop()}</th>
                    {grp(tm.innings).map((g3,i)=><td key={i} style={{textAlign:"right",width:"10%",borderTop:"1px solid #000",padding:"1px 2px"}}>{g3}</td>)}
                    <td style={{textAlign:"right",borderTop:"1px solid #000",padding:"1px 2px"}}>—</td>
                    <td style={{textAlign:"right",fontWeight:700,borderTop:"1px solid #000",padding:"1px 2px"}}>{tm.r}</td>
                    <td style={{textAlign:"right",borderTop:"1px solid #000",padding:"1px 2px"}}>{tm.h}</td>
                    <td style={{textAlign:"right",borderTop:"1px solid #000",padding:"1px 2px"}}>{tm.e}</td>
                  </tr>)}
                </tbody>
              </table>

              {/* Batting — away then home */}
              {[aw,hm].map(tm=><div key={tm.abbrev+"-b"}>
                <div style={{fontSize:10,fontWeight:700,margin:"3px 0 0",borderBottom:"1px solid #000"}}>{tm.name.split(" ").pop()}</div>
                <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontSize:10,lineHeight:1.1}}>
                  <thead><tr>
                    <th style={{width:"30%",textAlign:"left",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>Player</th>
                    {["AB","R","H","BI","BB","SO"].map(h=><th key={h} style={{width:"5%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>{h}</th>)}
                    <th style={{width:"8%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>Avg</th>
                  </tr></thead>
                  <tbody>
                    {tm.batters.map((b,i)=><tr key={i}>
                      <td style={{textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",padding:"0 0"}}>{b.name}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{b.ab}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{b.r}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{b.h}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{b.rbi}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{b.bb}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{b.so}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{b.avg}</td>
                    </tr>)}
                    <tr style={{fontWeight:700}}>
                      <td style={{textAlign:"left",padding:"0 0"}}>Totals</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{tm.batters.reduce((s,b)=>s+b.ab,0)}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{tm.r}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{tm.h}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{tm.batters.reduce((s,b)=>s+b.rbi,0)}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{tm.batters.reduce((s,b)=>s+b.bb,0)}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{tm.batters.reduce((s,b)=>s+b.so,0)}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}></td>
                    </tr>
                  </tbody>
                </table>
              </div>)}

              {/* Pitching — away then home */}
              {[aw,hm].map(tm=><div key={tm.abbrev+"-p"}>
                <div style={{fontSize:10,fontWeight:700,margin:"3px 0 0",borderBottom:"1px solid #000"}}>{tm.name.split(" ").pop()} Pitching</div>
                <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontSize:10,lineHeight:1.1}}>
                  <thead><tr>
                    <th style={{width:"37%",textAlign:"left",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>Pitcher</th>
                    <th style={{width:"5%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>IP</th>
                    {["H","R","ER","BB","SO"].map(h=><th key={h} style={{width:"5%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>{h}</th>)}
                    <th style={{width:"10%",textAlign:"right",borderTop:"1px solid #000",fontWeight:700,padding:"1px 0"}}>ERA</th>
                  </tr></thead>
                  <tbody>
                    {tm.pitchers.map((p,i)=><tr key={i}>
                      <td style={{textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",padding:"0 0"}}>{p.name}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{p.ip}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{p.h}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{p.r}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{p.er}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{p.bb}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{p.so}</td>
                      <td style={{textAlign:"right",padding:"0 0"}}>{p.era}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>)}

              {/* Notes */}
              {gm.notes&&<div style={{fontSize:10,lineHeight:1.2,padding:"3px 0",borderTop:"1px solid #000",marginTop:2}}>{gm.notes}</div>}
            </div>})}
        </div>}
      </div>
      </div>
    </div>
  </>}
</div>
</div>

);
}