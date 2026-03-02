import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
//  WAR STREET -- Responsive: Palm Pilot (mobile) / Bloomberg (desktop)
// ═══════════════════════════════════════════════════════════════

const API = import.meta.env.DEV ? "http://localhost:8000" : "https://war-street-production.up.railway.app";
const BUDGET = 300_000_000;
const MAX_TX = 6;
const HSLOTS = ["C","1B","2B","3B","SS","OF1","OF2","OF3"];
const PSLOTS = ["SP1","SP2","SP3","SP4","RP"];
const SLOTS = [...HSLOTS,...PSLOTS];
const dSlot = s => s.replace(/\d+$/,"");
const GP = 45;

// ── Display Helpers ──
const f$=n=>Math.abs(n)>=1e6?`${(n/1e6).toFixed(1)}M`:Math.abs(n)>=1e3?`${(n/1e3).toFixed(0)}K`:`${n}`;
function simChg(p,fr){const base=p.c-p.pp;const bp=+((base)/Math.max(p.pp,1)*100).toFixed(1);const sc={"1D":1,"1W":.6,"2W":.35,"1M":.18};return{raw:Math.round(base*(sc[fr]||1)),pct:+(bp*(sc[fr]||1)).toFixed(1)}}
function oSlots(r,el){const f={};r.forEach(x=>{f[x.slot]=1});return el.filter(s=>!f[s])}
function fits(r,pl){return oSlots(r,pl.el).length>0}


// ── Inline Sparkline ──
const Spark = (pts, color, w=48, h=14) => {
  if(!pts||!pts.length) return <span style={{color:"#1a1a1a"}}>---</span>;
  const mn=Math.min(...pts), mx=Math.max(...pts), rng=mx-mn||1;
  const d=pts.map((v,i)=>`${(i/(pts.length-1))*w},${h-(((v-mn)/rng)*h)}`).join(" ");
  return <svg width={w} height={h} style={{verticalAlign:"middle"}}><polyline points={d} fill="none" stroke={color} strokeWidth={1.2}/></svg>;
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
const [vw, setVw] = useState("MKT");
const [cur, setCur] = useState(1);
const [ft, setFt] = useState("ALL");
const [so, setSo] = useState("PRICE");
const [q, setQ] = useState("");
const [sel, setSel] = useState(null);
const [ta, setTa] = useState("B");
const [sl, setSl] = useState(null);
const [msg, setMsg] = useState(null);
const [chgFrame, setChgFrame] = useState("1D");
const [menu, setMenu] = useState(false);
const frames = ["1D","1W","2W","1M"];

const [me, setMe] = useState({ id:1, nm:"...", r:[], tx:0, budget:BUDGET, pv:0, tw:0 });
const [lb, setLb] = useState([]);

// ── API Fetches ──
useEffect(() => {
fetch(`${API}/players`).then(r=>r.json()).then(data=>setRaw(data.map(p=>({
  id:p.id, nm:p.name, tm:p.team, ps:p.position, tp:p.player_type,
  el:p.eligible_positions, pj:p.projected_war, w:p.war_ytd, gp:p.games_played,
  c:p.current_price, pp:p.prev_price, d:p.price_change, dp:p.price_change_pct,
  vol:p.volume??0, opp:p.opponent??"", tbk:p.tb_k??null,
  prH:p.price_history??[], wH:p.war_history??[]
})))).catch(()=>{});
}, []);

const refreshOwner = useCallback(() => {
fetch(`${API}/owners/${cur}`).then(r=>r.json()).then(data=>setMe({
  id:data.id, nm:data.name,
  r:data.roster.map(e=>({pid:e.player_id,slot:e.slot,paid:e.purchase_price})),
  tx:data.transactions_this_week, budget:data.budget_remaining,
  pv:data.portfolio_value, tw:data.total_war
})).catch(()=>{});
}, [cur]);

useEffect(() => { refreshOwner() }, [refreshOwner]);

const refreshLb = useCallback(() => {
fetch(`${API}/leaderboard`).then(r=>r.json()).then(data=>setLb(data.map(e=>({
  id:e.owner_id, nm:e.name, w:e.total_war, v:e.portfolio_value
})))).catch(()=>{});
}, []);

useEffect(() => { refreshLb() }, [refreshLb]);

// ── Derived State ──
const pl = raw;
const pM = useMemo(() => Object.fromEntries(pl.map(p => [p.id,p])), [pl]);
const rE = SLOTS.map(s => { const e=me.r.find(x=>x.slot===s); return{slot:s,p:e?pM[e.pid]:null,paid:e?.paid||0}});
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
if(me.tx>=MAX_TX) return flash("NO TX LEFT","E");
if(p.c>rem) return flash("NO FUNDS","E");
if(!s) return flash("SELECT SLOT","E");
try{
  const res=await fetch(`${API}/transactions/buy`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({owner_id:cur,player_id:p.id,slot:s})});
  if(!res.ok){const err=await res.json();return flash(err.detail||"BUY FAILED","E")}
  const data=await res.json();
  flash(`BUY ${data.player} > ${dSlot(data.slot)} @ ${f$(data.price)}`);
  refreshOwner();refreshLb();
}catch(e){flash("NETWORK ERROR","E")}
setSel(null);
};
const sell = async (p) => {
if(me.tx>=MAX_TX) return flash("NO TX LEFT","E");
const e=me.r.find(x=>x.pid===p.id);
try{
  const res=await fetch(`${API}/transactions/sell`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({owner_id:cur,player_id:p.id,slot:e?.slot})});
  if(!res.ok){const err=await res.json();return flash(err.detail||"SELL FAILED","E")}
  const data=await res.json();
  const pl2=data.price-(e?.paid||0);
  flash(`SELL ${data.player} @ ${f$(data.price)} [${pl2>=0?"+":""}${f$(pl2)}]`);
  refreshOwner();refreshLb();
}catch(e){flash("NETWORK ERROR","E")}
setSel(null);
};
const cycleFrame = () => { setChgFrame(f=>frames[(frames.indexOf(f)+1)%frames.length]) };

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
setSel({...p,paid:me.r.find(x=>x.pid===p.id)?.paid});setTa("S");
};

// ═══════════════════════════════════════════════════════════
//  MOBILE -- Palm Pilot
// ═══════════════════════════════════════════════════════════
if (isMobile) {
const fg="#2d4a2d",bgc="#b8c8a0",bg2="#a8b890",brd="#8a9a72",hi="#c8d8b0",lo="#7a8a62",vlo="#5a6a42";
const pad={padding:"2px 3px",whiteSpace:"nowrap"};
const th2={...pad,color:lo,textAlign:"left",borderBottom:`1px solid ${brd}`,position:"sticky",top:0,background:bgc,fontSize:8,zIndex:2};
const td2={...pad,borderBottom:`1px solid ${brd}`,fontSize:9};

return (
  <div style={{background:"#1a1a1a",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"10px 0"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=JetBrains+Mono:wght@800&display=swap');
      .palm-screen::-webkit-scrollbar{width:3px}
      .palm-screen::-webkit-scrollbar-thumb{background:${lo}}
      .palm-screen::-webkit-scrollbar-track{background:${bgc}}
    `}</style>

    {/* Palm Device — real image frame */}
    <div style={{
      position:"relative",
      width: "min(339px, 92vw)",
      aspectRatio: "278/494",
    }}>
      {/* LCD Screen — positioned in the transparent cutout */}
      <div className="palm-screen" style={{
        position:"absolute",
        left:"5.04%", top:"10.93%",
        width:"92.09%", height:"68.02%",
        background: bgc,
        overflow:"hidden",
        display:"flex", flexDirection:"column",
        fontFamily:"'Silkscreen',monospace",
        color: fg,
        zIndex:1,
      }}>
        {/* LCD pixel grid overlay */}
        <div style={{position:"absolute",inset:0,background:`repeating-linear-gradient(0deg,rgba(0,0,0,0.03) 0px,rgba(0,0,0,0.03) 1px,transparent 1px,transparent 2px)`,pointerEvents:"none",zIndex:3}}/>

        {/* Flash */}
        {msg&&<div style={{position:"absolute",top:0,left:0,right:0,padding:"2px 4px",background:msg.e==="E"?"#c85555":vlo,color:bgc,fontSize:8,zIndex:20,textAlign:"center"}}>{msg.m}</div>}

        {/* Header */}
        <div style={{padding:"2px 4px",borderBottom:`1px solid ${brd}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <span onClick={()=>setMenu(m=>!m)} style={{cursor:"pointer",fontSize:10,color:lo,lineHeight:1}}>☰</span>
            <span style={{fontFamily:"'JetBrains Mono'",fontWeight:800,fontSize:10,color:vlo,letterSpacing:1}}>WAR ST.</span>
          </div>
          <span style={{fontSize:7,color:lo}}>GM{GP} '26</span>
        </div>

        {/* Menu dropdown */}
        {menu&&<>
          <div onClick={()=>setMenu(false)} style={{position:"absolute",inset:0,zIndex:14}}/>
          <div style={{position:"absolute",top:16,left:2,background:hi,border:`1px solid ${fg}`,zIndex:15,width:"70%",maxHeight:"80%",overflow:"auto"}} className="palm-screen">
            <div style={{padding:"2px 5px",fontSize:8,color:vlo,borderBottom:`1px solid ${brd}`,fontWeight:700}}>MENU</div>
            {["Profile","Settings"].map((l,i)=>
              <div key={i} onClick={()=>setMenu(false)} style={{padding:"3px 5px",fontSize:8,color:fg,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background=bg2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{l}</div>)}
            <div style={{padding:"2px 5px",fontSize:7,color:lo,borderBottom:`1px solid ${brd}`}}>SWITCH TEAM</div>
            <div style={{maxHeight:100,overflowY:"auto"}} className="palm-screen">
              {lb.map(o=>
                <div key={o.id} onClick={()=>{setCur(o.id);setMenu(false)}} style={{padding:"1px 5px",fontSize:7,cursor:"pointer",color:o.id===cur?vlo:fg,fontWeight:o.id===cur?700:400}}
                  onMouseEnter={e=>e.currentTarget.style.background=bg2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{o.nm}{o.id===cur?" ◄":""}</div>)}
            </div>
          </div>
        </>}

        {/* Status */}
        <div style={{padding:"1px 4px",borderBottom:`1px solid ${brd}`,fontSize:7,color:lo,display:"flex",gap:4,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
          <span>${f$(rem)}</span>
          <span>W:{tW.toFixed(1)}</span>
          <span>TX:{MAX_TX-me.tx}</span>
          <span>{me.r.length}/13</span>
          <div style={{marginLeft:"auto",display:"flex",gap:1}}>
            {["MKT","PORT","RNK","?"].map(v=>
              <span key={v} onClick={()=>setVw(v)} style={{cursor:"pointer",padding:"0 3px",fontSize:7,color:vw===v?bgc:lo,background:vw===v?vlo:"transparent",borderRadius:1}}>{v}</span>)}
          </div>
        </div>

        {/* Content */}
        <div className="palm-screen" style={{flex:1,overflow:"auto",padding:"1px 0"}}>
          {/* MARKET */}
          {vw==="MKT"&&<div>
            <div style={{display:"flex",gap:2,padding:"1px 3px",alignItems:"center",fontSize:7,flexWrap:"wrap"}}>
              {["ALL","HIT","PIT"].map(v=>
                <span key={v} onClick={()=>setFt(v)} style={{cursor:"pointer",color:ft===v?bgc:lo,background:ft===v?vlo:"transparent",padding:"0 2px",borderRadius:1}}>{v}</span>)}
              <span style={{color:brd}}>|</span>
              {["$","WAR","Δ","AZ"].map((v,i)=>{const k=["PRICE","WAR","CHG","AZ"][i];return(
                <span key={k} onClick={()=>setSo(k)} style={{cursor:"pointer",color:so===k?bgc:lo,background:so===k?vlo:"transparent",padding:"0 2px",borderRadius:1}}>{v}</span>)})}
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="find" style={{marginLeft:"auto",width:40,background:"transparent",border:`1px solid ${brd}`,color:fg,fontFamily:"inherit",fontSize:7,padding:"0 2px"}}/>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                <th style={{...th2,width:65}}>NAME</th>
                <th style={{...th2,width:22}}>TM</th>
                <th style={{...th2,width:24}}>PS</th>
                <th style={{...th2,width:36}}>$</th>
                <th style={{...th2,width:28,cursor:"pointer"}} onClick={cycleFrame}>Δ<span style={{color:vlo,fontSize:6}}>[{chgFrame}]</span></th>
                <th style={{...th2,width:20}}>W</th>
                <th style={{...th2,width:22}}></th>
              </tr></thead>
              <tbody>
                {mk.map(p=>{
                  const mine=has(p.id);const ok=!mine&&fits(me.r,p);const no=!mine&&!ok;
                  const ch=simChg(p,chgFrame);
                  const pos=[...new Set(p.el.map(dSlot))].join("/");
                  return(
                    <tr key={p.id} style={{background:mine?hi:"transparent"}}>
                      <td style={{...td2,color:mine?vlo:fg,fontWeight:mine?700:400,overflow:"hidden",textOverflow:"ellipsis",maxWidth:65}}>{p.nm}</td>
                      <td style={{...td2,color:lo,fontSize:7}}>{p.tm}</td>
                      <td style={{...td2,fontSize:7}} title={pos}>{pos}</td>
                      <td style={{...td2,fontWeight:700}}>{f$(p.c)}</td>
                      <td style={td2}>{ch.pct>=0?"+":""}{ch.pct}%</td>
                      <td style={td2}>{p.w.toFixed(1)}</td>
                      <td style={{...td2,textAlign:"center"}}>
                        {mine?<span onClick={()=>openSell(p)} style={{cursor:"pointer",color:"#885555",fontSize:8,fontWeight:700}}>SELL</span>
                        :ok?<span onClick={()=>openBuy(p)} style={{cursor:"pointer",color:vlo,fontSize:8,fontWeight:700}}>BUY</span>
                        :<span style={{color:brd,fontSize:7}}>--</span>}
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>}

          {/* PORTFOLIO */}
          {vw==="PORT"&&<div style={{padding:"0 1px"}}>
            <div style={{fontSize:7,color:lo,padding:"1px 3px"}}>{me.nm}</div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["SL","PLAYER","$","PD","P/L","W",""].map(h=><th key={h} style={th2}>{h}</th>)}</tr></thead>
              <tbody>
                {rE.map(({slot:s,p,paid})=>{
                  if(!p)return<tr key={s}><td style={{...td2,color:brd,fontSize:8}}>{dSlot(s)}</td><td colSpan={6} style={{...td2,color:brd,fontSize:7}}>-- empty --</td></tr>;
                  const pl2=p.c-paid;
                  return<tr key={s}>
                    <td style={{...td2,color:vlo,fontWeight:700,fontSize:8}}>{dSlot(s)}</td>
                    <td style={{...td2,fontSize:8}}>{p.nm}</td>
                    <td style={{...td2,fontWeight:700}}>{f$(p.c)}</td>
                    <td style={{...td2,color:lo,fontSize:7}}>{f$(paid)}</td>
                    <td style={{...td2,fontWeight:700}}>{pl2>=0?"+":""}{f$(pl2)}</td>
                    <td style={td2}>{p.w.toFixed(1)}</td>
                    <td style={td2}><span onClick={()=>openSell(p)} style={{cursor:"pointer",color:"#885555",fontSize:8}}>✕</span></td>
                  </tr>})}
              </tbody>
            </table>
          </div>}

          {/* STANDINGS */}
          {vw==="RNK"&&<div style={{padding:"0 1px"}}>
            <div style={{fontSize:7,color:lo,padding:"1px 3px"}}>STANDINGS</div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["#","TEAM","WAR","VAL"].map(h=><th key={h} style={th2}>{h}</th>)}</tr></thead>
              <tbody>
                {lb.map((o,i)=><tr key={o.id} style={{background:o.id===cur?hi:"transparent"}}>
                  <td style={{...td2,color:i<3?vlo:lo,fontWeight:i<3?700:400}}>{i+1}</td>
                  <td style={{...td2,fontWeight:o.id===cur?700:400,fontSize:8}}>{o.nm}{o.id===cur?" ◄":""}</td>
                  <td style={{...td2,fontWeight:700}}>{o.w.toFixed(1)}</td>
                  <td style={{...td2,color:lo,fontSize:8}}>{f$(o.v)}</td>
                </tr>)}
              </tbody>
            </table>
            <div style={{fontSize:7,color:brd,padding:"2px 3px"}}>Rosters hidden.</div>
          </div>}

          {/* HELP */}
          {vw==="?"&&<div style={{padding:"3px 5px",fontSize:8,lineHeight:1.6}}>
            <div style={{fontWeight:700,fontSize:9,marginBottom:2,color:vlo}}>RULES</div>
            {[["$",`$${BUDGET/1e6}M cap, 13 slots`],["POS","C 1B 2B 3B SS 3×OF 4×SP RP"],["OWN","Shared. Rosters hidden."],["WIN","Most cumulative WAR"],["TX",`${MAX_TX}/wk`],["Δ","Tap header: 1D/1W/2W/1M"]].map(([t,d],i)=>
              <div key={i}><span style={{color:vlo,fontWeight:700}}>{t}</span> <span style={{color:fg}}>{d}</span></div>)}
          </div>}
        </div>

        {/* Modal */}
        {sel&&<div onClick={()=>setSel(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)",zIndex:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:hi,border:`2px solid ${fg}`,padding:"6px 8px",width:"85%",maxHeight:"80%",overflow:"auto"}}>
            <div style={{fontWeight:700,fontSize:10,marginBottom:2,color:vlo}}>{ta==="B"?"BUY":"SELL"}: {sel.nm}</div>
            <div style={{fontSize:7,color:lo,marginBottom:3}}>{sel.tm} | {[...new Set(sel.el.map(dSlot))].join("/")}</div>
            <div style={{fontSize:8,marginBottom:2}}><span style={{color:lo}}>$ </span><span style={{fontWeight:700}}>{f$(sel.c)}</span> <span style={{color:lo}}>W </span>{sel.w.toFixed(1)}</div>
            {ta==="B"&&<>
              <div style={{fontSize:7,color:lo,marginBottom:1}}>SLOT:</div>
              <div style={{display:"flex",gap:2,flexWrap:"wrap",marginBottom:3}}>
                {[...new Set(sel.el.map(dSlot))].map(ds=>{
                  const matching=sel.el.filter(s=>dSlot(s)===ds);const openM=oSlots(me.r,matching);const ok=openM.length>0;const isSel=sl&&dSlot(sl)===ds;
                  return<span key={ds} onClick={()=>ok&&setSl(openM[0])} style={{padding:"0 4px",fontSize:8,border:`1px solid ${isSel?fg:ok?brd:"#ccc"}`,color:isSel?bgc:ok?fg:"#ccc",background:isSel?fg:"transparent",cursor:ok?"pointer":"default"}}>{ds}</span>})}
              </div>
              <div style={{fontSize:7,marginBottom:3}}><span style={{color:lo}}>Left: </span>{f$(rem)}<span style={{color:lo}}> After: </span>{f$(rem-sel.c)}</div>
            </>}
            {ta==="S"&&sel.paid!=null&&<div style={{fontSize:7,marginBottom:3}}><span style={{color:lo}}>Paid: </span>{f$(sel.paid)}<span style={{color:lo}}> P/L: </span>{(()=>{const x=sel.c-sel.paid;return<span style={{color:x>=0?vlo:"#885555"}}>{x>=0?"+":""}{f$(x)}</span>})()}</div>}
            <div style={{display:"flex",gap:3}}>
              <span onClick={()=>setSel(null)} style={{cursor:"pointer",padding:"1px 6px",border:`1px solid ${brd}`,fontSize:8,color:lo}}>CANCEL</span>
              <span onClick={()=>ta==="B"?buy(sel,sl):sell(sel)} style={{cursor:(ta==="B"&&!sl)?"default":"pointer",padding:"1px 6px",fontSize:8,fontWeight:700,border:`1px solid ${fg}`,color:bgc,background:ta==="B"?(sl?vlo:brd):"#885555",opacity:(ta==="B"&&!sl) ? 0.4 : 1}}>{ta==="B"?`BUY > ${sl?dSlot(sl):"..."}`:"SELL"}</span>
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
    </div>
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
<div style={{background:bg,color:g,minHeight:"100vh",fontFamily:"'VT323',monospace",fontSize:20}}>
<style>{`@import url('https://fonts.googleapis.com/css2?family=VT323&family=JetBrains+Mono:wght@800&display=swap'); *{box-sizing:border-box} *::-webkit-scrollbar{width:6px} *::-webkit-scrollbar-thumb{background:#2a2a2a} *::-webkit-scrollbar-track{background:${bg}} tr:hover td{background:#111 !important} ::selection{background:${g};color:${bg}} input::placeholder{color:#333} .crt::before{content:"";position:fixed;top:0;left:0;width:100%;height:100%;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15) 0px,rgba(0,0,0,0.15) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:1000} .crt::after{content:"";position:fixed;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.4) 100%);pointer-events:none;z-index:999}`}</style>
<div className="crt">
{/* Flash */}
{msg&&<div style={{position:"fixed",top:0,left:0,right:0,padding:"4px 16px",background:msg.e==="E"?"#331111":"#113311",color:msg.e==="E"?neg:g,zIndex:2000,fontSize:18,textAlign:"center",borderBottom:`1px solid ${msg.e==="E"?neg:g}`}}>{msg.m}</div>}

    {/* Header */}
    <div style={{padding:"6px 12px",borderBottom:`1px solid ${brd_d}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{position:"relative"}}>
          <span onClick={()=>setMenu(m=>!m)} style={{cursor:"pointer",color:dim,fontSize:24,lineHeight:1}}>☰</span>
          {menu&&(<>
            <div onClick={()=>setMenu(false)} style={{position:"fixed",inset:0,zIndex:80}}/>
            <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:bg,border:`1px solid ${brd_d}`,zIndex:81,minWidth:220}}>
              <div style={{padding:"6px 14px",color:amb,borderBottom:`1px solid ${brd_d}`,fontSize:14}}>{me.nm}</div>
              {[["Profile Info",()=>{}],["Settings",()=>{}]].map(([label,fn],i)=>(
                <div key={i} onClick={()=>{fn();setMenu(false)}} style={{padding:"8px 14px",cursor:"pointer",color:wh,fontSize:16}} onMouseEnter={e=>e.currentTarget.style.background="#111"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{label}</div>))}
              <div style={{padding:"6px 14px",borderBottom:`1px solid ${brd_d}`,fontSize:16,color:dim}}>SWITCH TEAM</div>
              <div style={{maxHeight:200,overflowY:"auto"}}>
                {lb.map(o=>(
                  <div key={o.id} onClick={()=>{setCur(o.id);setMenu(false)}} style={{padding:"6px 14px",cursor:"pointer",color:o.id===cur?amb:wh,fontSize:16}} onMouseEnter={e=>e.currentTarget.style.background="#111"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{o.nm}{o.id===cur?" ◄":""}</div>))}
              </div>
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
        <div style={{maxHeight:"calc(100vh - 200px)",overflowY:"auto",overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:900,tableLayout:"fixed"}}>
            <thead><tr>
              <th style={{...th2_d,position:"sticky",left:0,zIndex:3,background:bg,width:110}}>PLAYER</th>
              <th style={{...th2_d,width:40,textAlign:"center"}}></th>
              <th style={{...th2_d,width:36}}>TM</th>
              <th style={{...th2_d,width:55}}>POS</th>
              <th style={{...th2_d,width:60}}>PRICE</th>
              <th style={{...th2_d,width:48,textAlign:"center"}}>$</th>
              <th style={{...th2_d,cursor:"pointer",userSelect:"none",width:55}} onClick={cycleFrame}>CHG <span style={{color:amb}}>[{chgFrame}]</span></th>
              <th style={{...th2_d,width:40}}>WAR</th>
              <th style={{...th2_d,width:48,textAlign:"center"}}>W</th>
              <th style={{...th2_d,width:50}}>VOL</th>
              <th style={{...th2_d,width:36}}>OPP</th>
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
                      {mine?<span onClick={()=>openSell(p)} style={{cursor:"pointer",background:neg,color:bg,padding:"1px 8px",fontWeight:700,fontSize:14}}>SELL</span>
                      :ok?<span onClick={()=>openBuy(p)} style={{cursor:"pointer",background:g,color:bg,padding:"1px 8px",fontWeight:700,fontSize:14}}>BUY</span>
                      :<span style={{color:"#1a1a1a"}}>---</span>}
                    </td>
                    <td style={{...td2_d,color:dim}}>{p.tm}</td>
                    <td style={{...td2_d,overflow:"hidden",textOverflow:"ellipsis"}} title={[...new Set(p.el.map(dSlot))].join("/")}>{[...new Set(p.el.map(dSlot))].join("/")}</td>
                    <td style={{...td2_d,color:wh}}>{f$(p.c)}</td>
                    <td style={{...td2_d,textAlign:"center"}}>{Spark(p.prH,wh)}</td>
                    <td style={{...td2_d,color:ch.pct>=0?g:neg}}>{ch.pct>=0?"+":""}{ch.pct}%</td>
                    <td style={td2_d}>{p.w.toFixed(1)}</td>
                    <td style={{...td2_d,textAlign:"center"}}>{Spark(p.wH,g)}</td>
                    <td style={td2_d}>
                      <div style={{display:"inline-block",verticalAlign:"middle",width:30,height:6,background:"#1a1a1a",marginRight:4}}>
                        <div style={{width:`${vol}%`,height:"100%",background:vol>66?amb:vol>33?g:dim}}/>
                      </div>
                      <span style={{fontSize:12}}>{vol}</span>
                    </td>
                    <td style={{...td2_d,color:p.opp?dim:"#1a1a1a",fontSize:14}}>{p.opp||"--"}</td>
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
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["SLOT","PLAYER","TM","PRICE","PAID","P/L","WAR",""].map((h,i)=><th key={h} style={th2_d}>{h}</th>)}</tr></thead>
          <tbody>
            {rE.map(({slot:s,p,paid})=>{
              if(!p)return(<tr key={s}><td style={{...td2_d,color:"#2a2a2a"}}>{dSlot(s)}</td><td colSpan={7} style={{...td2_d,color:"#1a1a1a"}}>-- empty --</td></tr>);
              const pl2=p.c-paid;
              return(<tr key={s}>
                <td style={{...td2_d,color:amb}}>{dSlot(s)}</td>
                <td style={{...td2_d,color:wh}}>{p.nm}</td>
                <td style={{...td2_d,color:dim}}>{p.tm}</td>
                <td style={{...td2_d,color:wh}}>{f$(p.c)}</td>
                <td style={{...td2_d,color:dim}}>{f$(paid)}</td>
                <td style={{...td2_d,color:pl2>=0?g:neg}}>{pl2>=0?"+":""}{f$(pl2)}</td>
                <td style={td2_d}>{p.w.toFixed(1)}</td>
                <td style={td2_d}><span onClick={()=>openSell(p)} style={{cursor:"pointer",background:neg,color:bg,padding:"1px 8px",fontWeight:700,fontSize:14}}>SELL</span></td>
              </tr>)})}
          </tbody>
        </table>
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
        {[["BUDGET",`$${(BUDGET/1e6)}M. Fill 13 roster slots.`],["ROSTER","C 1B 2B 3B SS OF OF OF SP SP SP SP RP"],["ELIG","Players fill only qualified positions."],["OWNERSHIP","Shared. Multiple owners can hold same player."],["SCORING","Cumulative WAR. Highest total wins."],["PRICE","Projection/actual blend + momentum + hidden demand."],["CHG","Click column header to cycle: 1D / 1W / 2W / 1M"],["TX",`${MAX_TX} per week. Buy or sell = 1 tx.`],["PRIVACY","Rosters hidden. Standings show WAR + value only."]].map(([t,d],i)=>(
          <div key={i} style={{marginBottom:5}}><span style={{color:amb}}>{t}</span><span style={{color:dim}}> -- {d}</span></div>))}
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
          <div style={{marginBottom:8,fontSize:18}}>
            <span style={{color:dim}}>BUDGET </span>{f$(rem)}
            <span style={{color:dim,marginLeft:12}}>AFTER </span>
            <span style={{color:rem-sel.c>=0?g:neg}}>{f$(rem-sel.c)}</span>
          </div>
        </>)}
        {ta==="S"&&sel.paid!=null&&(
          <div style={{marginBottom:8,fontSize:18}}>
            <span style={{color:dim}}>PAID </span>{f$(sel.paid)}
            <span style={{color:dim,marginLeft:12}}>P/L </span>
            {(()=>{const x=sel.c-sel.paid;return<span style={{color:x>=0?g:neg}}>{x>=0?"+":""}{f$(x)}</span>})()}
          </div>)}
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <span onClick={()=>setSel(null)} style={{cursor:"pointer",color:dim,padding:"3px 12px",border:`1px solid ${brd_d}`}}>CANCEL</span>
          <span onClick={()=>ta==="B"?buy(sel,sl):sell(sel)} style={{cursor:(ta==="B"&&!sl)?"default":"pointer",color:bg,fontWeight:700,padding:"3px 16px",background:ta==="B"?(sl?g:"#333"):neg,opacity:(ta==="B"&&!sl) ? 0.3 : 1}}>{ta==="B"?`BUY > ${sl?dSlot(sl):"..."}`:"SELL"}</span>
        </div>
        <div style={{color:"#222",marginTop:6,fontSize:20}}>{MAX_TX-me.tx} tx remaining</div>
      </div>
    </div>)}
  </div>
</div>

);
}