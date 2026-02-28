import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
//  WAR STREET -- Responsive: Palm Pilot (mobile) / Bloomberg (desktop)
// ═══════════════════════════════════════════════════════════════

const WAR$ = 8_000_000;
const MIN_P = 500_000;
const MAX_P = 80_000_000;
const G162 = 162;
const BUDGET = 160_000_000;
const MAX_TX = 2;
const HSLOTS = ["C","1B","2B","3B","SS","OF1","OF2","OF3"];
const PSLOTS = ["SP1","SP2","SP3","SP4","RP"];
const SLOTS = [...HSLOTS,...PSLOTS];
const dSlot = s => s.replace(/\d+$/,"");
const GP = 45;

// ── Pricing Engine ──
function bw(gp){const a=1/(1+Math.exp(-.05*(gp-81)));const p=Math.max(.05,1-a);return{p,a:1-p}}
function ew(proj,ytd,gp){const{p,a}=bw(gp);let ann=proj;if(gp>0){const r=(ytd/gp)*G162;ann=Math.max(0,p*proj+a*r)}return Math.max(0,ann)}
function hm(r3,s,h){if(!h||!r3||!s||s===0)return 0;return Math.max(-.08,Math.min(.08,(r3/s-1)))}
function pm2(r3,s,h){if(!h||r3==null||!s)return 0;if(r3===0)return .08;return Math.max(-.08,Math.min(.08,(s/r3-1)))}
function calcP(pl,op){const e=ew(pl.pj,pl.w,pl.gp);const b=e*WAR$;const m=pl.tp==="P"?pm2(pl.r3,pl.se,pl.hd):hm(pl.r3,pl.so,pl.hd);const pop=op*.10;const raw=.80*(b*(1+pop))+.20*((pl.pp||b)*(1+m));const p=Math.max(MIN_P,Math.min(MAX_P,Math.round(raw/10000)*10000));return{p,e,m}}
const f$=n=>Math.abs(n)>=1e6?`${(n/1e6).toFixed(1)}M`:Math.abs(n)>=1e3?`${(n/1e3).toFixed(0)}K`:`${n}`;
function simChg(p,fr){const base=p.c-p.pp;const bp=+((base)/Math.max(p.pp,1)*100).toFixed(1);const sc={"1D":1,"1W":.6,"2W":.35,"1M":.18};return{raw:Math.round(base*(sc[fr]||1)),pct:+(bp*(sc[fr]||1)).toFixed(1)}}
function oSlots(r,el){const f={};r.forEach(x=>{f[x.slot]=1});return el.filter(s=>!f[s])}
function fits(r,pl){return oSlots(r,pl.el).length>0}

// ── Player Database ──
const mkP=()=>{
const H=[
{id:1,nm:"Judge A",tm:"NYY",ps:"OF",el:["OF1","OF2","OF3"],pj:7.5,w:1.8,so:0.95,r3:1.1,hd:1},
{id:3,nm:"Jazz C",tm:"NYY",ps:"3B/OF",el:["3B","2B","SS","OF1","OF2","OF3"],pj:3,w:0.8,so:0.75,r3:0.95,hd:1},
{id:4,nm:"Rizzo A",tm:"NYY",ps:"1B",el:["1B"],pj:1,w:0.2,so:0.62,r3:0.58,hd:1},
{id:5,nm:"Volpe A",tm:"NYY",ps:"SS",el:["SS"],pj:3.5,w:0.9,so:0.72,r3:0.76,hd:1},
{id:6,nm:"Torres G",tm:"NYY",ps:"2B",el:["2B","SS"],pj:2.5,w:0.5,so:0.71,r3:0.65,hd:1},
{id:7,nm:"Wells A",tm:"NYY",ps:"C",el:["C"],pj:2,w:0.4,so:0.68,r3:0.72,hd:1},
{id:8,nm:"Dominguez J",tm:"NYY",ps:"OF",el:["OF1","OF2","OF3"],pj:2.5,w:0.7,so:0.73,r3:0.85,hd:1},
{id:9,nm:"Cabrera O",tm:"NYY",ps:"SS/2B",el:["SS","2B"],pj:1.5,w:0.3,so:0.66,r3:0.61,hd:1},
{id:10,nm:"Devers R",tm:"BOS",ps:"3B",el:["3B"],pj:5,w:1.3,so:0.87,r3:1.15,hd:1},
{id:11,nm:"Bregman A",tm:"BOS",ps:"3B/SS",el:["3B","SS"],pj:4,w:0.9,so:0.79,r3:0.85,hd:1},
{id:12,nm:"Duran J",tm:"BOS",ps:"OF",el:["OF1","OF2","OF3"],pj:4,w:1.2,so:0.81,r3:0.83,hd:1},
{id:13,nm:"Yoshida M",tm:"BOS",ps:"OF",el:["OF1","OF2","OF3"],pj:2.5,w:0.6,so:0.76,r3:0.74,hd:1},
{id:14,nm:"Turner J",tm:"BOS",ps:"SS",el:["SS","2B"],pj:2,w:0.5,so:0.7,r3:0.68,hd:1},
{id:15,nm:"O'Neill T",tm:"BOS",ps:"OF",el:["OF1","OF2","OF3"],pj:3,w:0.8,so:0.78,r3:0.91,hd:1},
{id:16,nm:"Casas T",tm:"BOS",ps:"1B",el:["1B"],pj:3,w:0.7,so:0.75,r3:0.73,hd:1},
{id:17,nm:"McGuire R",tm:"BOS",ps:"C",el:["C"],pj:1.5,w:0.3,so:0.65,r3:0.62,hd:1},
{id:18,nm:"Henderson G",tm:"BAL",ps:"SS",el:["SS","3B"],pj:6.5,w:1.7,so:0.89,r3:1.2,hd:1},
{id:19,nm:"Rutschman A",tm:"BAL",ps:"C",el:["C","1B"],pj:4,w:0.9,so:0.78,r3:0.72,hd:1},
{id:20,nm:"Mullins C",tm:"BAL",ps:"OF",el:["OF1","OF2","OF3"],pj:2.5,w:0.6,so:0.72,r3:0.7,hd:1},
{id:21,nm:"Santander A",tm:"BAL",ps:"OF",el:["OF1","OF2","OF3"],pj:3.5,w:1,so:0.8,r3:0.84,hd:1},
{id:22,nm:"Westburg J",tm:"BAL",ps:"2B/3B",el:["2B","3B","SS"],pj:3.5,w:0.9,so:0.77,r3:0.82,hd:1},
{id:23,nm:"Mountcastle R",tm:"BAL",ps:"1B",el:["1B"],pj:2.5,w:0.6,so:0.74,r3:0.71,hd:1},
{id:24,nm:"Holliday J",tm:"BAL",ps:"SS/2B",el:["SS","2B"],pj:3,w:0.8,so:0.75,r3:0.8,hd:1},
{id:25,nm:"Cowser C",tm:"BAL",ps:"OF",el:["OF1","OF2","OF3"],pj:2.5,w:0.7,so:0.73,r3:0.69,hd:1},
{id:26,nm:"Guerrero V",tm:"TOR",ps:"1B",el:["1B"],pj:4.5,w:1.1,so:0.85,r3:0.88,hd:1},
{id:27,nm:"Bichette B",tm:"TOR",ps:"SS",el:["SS"],pj:3,w:0.6,so:0.74,r3:0.7,hd:1},
{id:28,nm:"Springer G",tm:"TOR",ps:"OF",el:["OF1","OF2","OF3"],pj:2,w:0.5,so:0.72,r3:0.75,hd:1},
{id:29,nm:"Kirk A",tm:"TOR",ps:"C",el:["C"],pj:3,w:0.8,so:0.78,r3:0.76,hd:1},
{id:30,nm:"Varsho D",tm:"TOR",ps:"OF/C",el:["OF1","OF2","OF3","C"],pj:3,w:0.7,so:0.74,r3:0.78,hd:1},
{id:33,nm:"Arozarena R",tm:"TB",ps:"OF",el:["OF1","OF2","OF3"],pj:3,w:0.8,so:0.77,r3:0.81,hd:1},
{id:34,nm:"Ramirez H",tm:"TB",ps:"SS",el:["SS","3B"],pj:2.5,w:0.6,so:0.73,r3:0.7,hd:1},
{id:36,nm:"Lowe B",tm:"TB",ps:"1B",el:["1B"],pj:2.5,w:0.6,so:0.74,r3:0.72,hd:0},
{id:37,nm:"Paredes I",tm:"TB",ps:"3B",el:["3B","1B","2B"],pj:2,w:0.5,so:0.71,r3:0.68,hd:1},
{id:40,nm:"Ramirez J",tm:"CLE",ps:"3B",el:["3B","2B"],pj:6,w:1.6,so:0.86,r3:0.87,hd:1},
{id:41,nm:"Naylor J",tm:"CLE",ps:"1B",el:["1B"],pj:3.5,w:0.9,so:0.8,r3:0.83,hd:1},
{id:42,nm:"Kwan S",tm:"CLE",ps:"OF",el:["OF1","OF2","OF3"],pj:4,w:1.1,so:0.82,r3:0.8,hd:1},
{id:43,nm:"Gimenez A",tm:"CLE",ps:"2B",el:["2B","SS"],pj:3,w:0.7,so:0.74,r3:0.71,hd:1},
{id:47,nm:"Torkelson S",tm:"DET",ps:"1B",el:["1B"],pj:2,w:0.4,so:0.7,r3:0.68,hd:1},
{id:48,nm:"Greene R",tm:"DET",ps:"OF",el:["OF1","OF2","OF3"],pj:3,w:0.8,so:0.76,r3:0.82,hd:1},
{id:54,nm:"Witt B",tm:"KC",ps:"SS",el:["SS","3B"],pj:7,w:2,so:0.92,r3:0.95,hd:1},
{id:55,nm:"Perez S",tm:"KC",ps:"C",el:["C","1B"],pj:2.5,w:0.8,so:0.76,r3:0.8,hd:1},
{id:56,nm:"Pasquantino V",tm:"KC",ps:"1B",el:["1B"],pj:3,w:0.8,so:0.78,r3:0.76,hd:1},
{id:61,nm:"Correa C",tm:"MIN",ps:"SS",el:["SS"],pj:4,w:1,so:0.81,r3:0.84,hd:1},
{id:62,nm:"Buxton B",tm:"MIN",ps:"OF",el:["OF1","OF2","OF3"],pj:3.5,w:0.8,so:0.79,r3:0.87,hd:0},
{id:63,nm:"Lewis R",tm:"MIN",ps:"OF",el:["OF1","OF2","OF3"],pj:3.5,w:1,so:0.79,r3:0.81,hd:1},
{id:65,nm:"Jeffers R",tm:"MIN",ps:"C",el:["C"],pj:2.5,w:0.6,so:0.73,r3:0.7,hd:1},
{id:68,nm:"Robert L",tm:"CHW",ps:"OF",el:["OF1","OF2","OF3"],pj:3,w:0.5,so:0.69,r3:0.55,hd:1},
{id:69,nm:"Vaughn A",tm:"CHW",ps:"1B/OF",el:["1B","OF1","OF2","OF3"],pj:2.5,w:0.6,so:0.73,r3:0.71,hd:1},
{id:75,nm:"Alvarez Y",tm:"HOU",ps:"OF",el:["OF1","OF2","OF3"],pj:5,w:1.3,so:0.89,r3:0.96,hd:1},
{id:76,nm:"Altuve J",tm:"HOU",ps:"2B",el:["2B"],pj:3.5,w:0.9,so:0.8,r3:0.78,hd:1},
{id:79,nm:"Pena J",tm:"HOU",ps:"SS",el:["SS","3B"],pj:3.5,w:0.9,so:0.78,r3:0.82,hd:1},
{id:82,nm:"Walker C",tm:"HOU",ps:"1B",el:["1B"],pj:3.5,w:1,so:0.81,r3:0.82,hd:1},
{id:84,nm:"Trout M",tm:"LAA",ps:"OF",el:["OF1","OF2","OF3"],pj:2,w:0.4,so:0.75,r3:0.72,hd:1},
{id:85,nm:"Neto Z",tm:"LAA",ps:"SS",el:["SS"],pj:2.5,w:0.6,so:0.71,r3:0.74,hd:1},
{id:91,nm:"Rengifo L",tm:"LAA",ps:"2B/SS",el:["2B","SS","3B"],pj:2.5,w:0.6,so:0.74,r3:0.72,hd:1},
{id:92,nm:"Rodriguez J",tm:"SEA",ps:"OF",el:["OF1","OF2","OF3"],pj:4,w:0.9,so:0.77,r3:0.82,hd:1},
{id:98,nm:"Raleigh C",tm:"SEA",ps:"C",el:["C"],pj:2.5,w:0.7,so:0.73,r3:0.76,hd:1},
{id:99,nm:"Crawford JP",tm:"SEA",ps:"SS",el:["SS"],pj:3,w:0.7,so:0.74,r3:0.72,hd:1},
{id:100,nm:"Seager C",tm:"TEX",ps:"SS",el:["SS","3B"],pj:5.5,w:1.5,so:0.88,r3:1.05,hd:1},
{id:101,nm:"Semien M",tm:"TEX",ps:"2B",el:["2B","SS"],pj:4.5,w:1.1,so:0.8,r3:0.75,hd:1},
{id:105,nm:"Heim J",tm:"TEX",ps:"C",el:["C"],pj:2,w:0.5,so:0.7,r3:0.68,hd:1},
{id:108,nm:"Rooker B",tm:"OAK",ps:"OF/1B",el:["OF1","OF2","OF3","1B"],pj:3,w:0.8,so:0.78,r3:0.82,hd:1},
{id:110,nm:"Langeliers S",tm:"OAK",ps:"C",el:["C"],pj:2,w:0.5,so:0.7,r3:0.68,hd:1},
{id:114,nm:"Butler L",tm:"OAK",ps:"SS",el:["SS"],pj:2,w:0.5,so:0.71,r3:0.73,hd:1},
{id:115,nm:"Acuna R",tm:"ATL",ps:"OF",el:["OF1","OF2","OF3"],pj:4,w:0.8,so:0.78,r3:0.92,hd:1},
{id:116,nm:"Riley A",tm:"ATL",ps:"3B",el:["3B"],pj:4.5,w:1.1,so:0.83,r3:0.86,hd:1},
{id:117,nm:"Olson M",tm:"ATL",ps:"1B",el:["1B"],pj:3.5,w:0.7,so:0.74,r3:0.69,hd:1},
{id:118,nm:"Ozuna M",tm:"ATL",ps:"OF",el:["OF1","OF2","OF3"],pj:2.5,w:0.7,so:0.77,r3:0.8,hd:1},
{id:119,nm:"Albies O",tm:"ATL",ps:"2B",el:["2B"],pj:3.5,w:0.7,so:0.74,r3:0.68,hd:1},
{id:120,nm:"Harris M",tm:"ATL",ps:"OF",el:["OF1","OF2","OF3"],pj:4,w:1,so:0.8,r3:0.83,hd:1},
{id:121,nm:"Murphy S",tm:"ATL",ps:"C",el:["C"],pj:3,w:0.7,so:0.76,r3:0.73,hd:1},
{id:123,nm:"Soto J",tm:"NYM",ps:"OF",el:["OF1","OF2","OF3"],pj:7,w:1.9,so:0.94,r3:0.78,hd:1},
{id:124,nm:"Lindor F",tm:"NYM",ps:"SS",el:["SS"],pj:5.5,w:1.5,so:0.85,r3:0.83,hd:1},
{id:125,nm:"Alonso P",tm:"NYM",ps:"1B",el:["1B"],pj:2.5,w:0.6,so:0.73,r3:1.3,hd:1},
{id:126,nm:"Nimmo B",tm:"NYM",ps:"OF",el:["OF1","OF2","OF3"],pj:3.5,w:0.9,so:0.79,r3:0.77,hd:1},
{id:129,nm:"Alvarez F",tm:"NYM",ps:"C",el:["C"],pj:2.5,w:0.6,so:0.73,r3:0.75,hd:1},
{id:131,nm:"Harper B",tm:"PHI",ps:"1B/OF",el:["1B","OF1","OF2","OF3"],pj:4.5,w:1.2,so:0.86,r3:0.9,hd:1},
{id:132,nm:"Turner T",tm:"PHI",ps:"SS",el:["SS","2B"],pj:4.5,w:1,so:0.79,r3:0.65,hd:1},
{id:133,nm:"Schwarber K",tm:"PHI",ps:"OF",el:["OF1","OF2","OF3"],pj:3,w:0.8,so:0.78,r3:0.84,hd:1},
{id:134,nm:"Bohm A",tm:"PHI",ps:"3B",el:["3B","1B"],pj:3.5,w:0.9,so:0.8,r3:0.78,hd:1},
{id:136,nm:"Realmuto J",tm:"PHI",ps:"C",el:["C"],pj:2.5,w:0.6,so:0.71,r3:0.75,hd:1},
{id:139,nm:"Abrams C",tm:"WSH",ps:"SS/OF",el:["SS","2B","OF1","OF2","OF3"],pj:3.5,w:1,so:0.77,r3:0.76,hd:1},
{id:140,nm:"Wood J",tm:"WSH",ps:"OF",el:["OF1","OF2","OF3"],pj:3.5,w:1,so:0.79,r3:0.84,hd:1},
{id:146,nm:"Arraez L",tm:"MIA",ps:"2B/1B",el:["2B","1B","3B"],pj:3.5,w:0.9,so:0.81,r3:0.79,hd:1},
{id:153,nm:"Tucker K",tm:"CHC",ps:"OF",el:["OF1","OF2","OF3"],pj:5,w:1.1,so:0.84,r3:0.88,hd:0},
{id:154,nm:"Happ I",tm:"CHC",ps:"OF/3B",el:["OF1","OF2","OF3","3B"],pj:3,w:0.8,so:0.78,r3:0.77,hd:1},
{id:155,nm:"Swanson D",tm:"CHC",ps:"SS",el:["SS"],pj:3.5,w:0.8,so:0.75,r3:0.73,hd:1},
{id:157,nm:"Suzuki S",tm:"CHC",ps:"OF",el:["OF1","OF2","OF3"],pj:3,w:0.8,so:0.77,r3:0.75,hd:1},
{id:160,nm:"Amaya M",tm:"CHC",ps:"C",el:["C"],pj:2,w:0.5,so:0.7,r3:0.68,hd:1},
{id:162,nm:"Contreras W",tm:"MIL",ps:"C",el:["C"],pj:4,w:1.1,so:0.83,r3:0.87,hd:1},
{id:164,nm:"Chourio J",tm:"MIL",ps:"OF",el:["OF1","OF2","OF3"],pj:3,w:1,so:0.79,r3:0.81,hd:1},
{id:166,nm:"Turang B",tm:"MIL",ps:"2B/SS",el:["2B","SS"],pj:2.5,w:0.7,so:0.73,r3:0.7,hd:1},
{id:170,nm:"Goldschmidt P",tm:"STL",ps:"1B",el:["1B"],pj:2,w:0.4,so:0.7,r3:0.68,hd:1},
{id:171,nm:"Arenado N",tm:"STL",ps:"3B",el:["3B"],pj:3,w:0.7,so:0.76,r3:0.74,hd:1},
{id:172,nm:"Winn M",tm:"STL",ps:"SS",el:["SS"],pj:3.5,w:0.9,so:0.77,r3:0.8,hd:1},
{id:176,nm:"Edman T",tm:"STL",ps:"2B/SS",el:["2B","SS","OF1","OF2","OF3"],pj:3,w:0.7,so:0.74,r3:0.73,hd:1},
{id:178,nm:"De La Cruz E",tm:"CIN",ps:"SS/OF",el:["SS","3B","OF1","OF2","OF3"],pj:3.5,w:1,so:0.76,r3:0.89,hd:1},
{id:180,nm:"Steer S",tm:"CIN",ps:"3B/2B",el:["3B","2B"],pj:3,w:0.8,so:0.77,r3:0.74,hd:1},
{id:185,nm:"Stephenson T",tm:"CIN",ps:"C",el:["C"],pj:2.5,w:0.6,so:0.73,r3:0.71,hd:1},
{id:186,nm:"Reynolds B",tm:"PIT",ps:"OF",el:["OF1","OF2","OF3"],pj:3.5,w:0.9,so:0.79,r3:0.83,hd:1},
{id:188,nm:"Cruz O",tm:"PIT",ps:"SS",el:["SS"],pj:2.5,w:0.6,so:0.72,r3:0.76,hd:1},
{id:193,nm:"Ohtani S",tm:"LAD",ps:"OF",el:["OF1","OF2","OF3"],pj:8.5,w:2.1,so:0.985,r3:1.25,hd:1},
{id:194,nm:"Betts M",tm:"LAD",ps:"SS/OF",el:["SS","2B","OF1","OF2","OF3"],pj:6,w:1.4,so:0.87,r3:0.91,hd:1},
{id:195,nm:"Freeman F",tm:"LAD",ps:"1B",el:["1B"],pj:5,w:1.3,so:0.85,r3:0.84,hd:1},
{id:198,nm:"Smith W",tm:"LAD",ps:"C",el:["C"],pj:3.5,w:0.9,so:0.79,r3:0.83,hd:1},
{id:199,nm:"Muncy M",tm:"LAD",ps:"3B/1B",el:["3B","1B","2B"],pj:3,w:0.7,so:0.76,r3:0.79,hd:1},
{id:202,nm:"Adames W",tm:"SF",ps:"SS",el:["SS","3B"],pj:4.5,w:1.2,so:0.81,r3:0.79,hd:1},
{id:203,nm:"Chapman M",tm:"SF",ps:"3B",el:["3B"],pj:3.5,w:0.9,so:0.79,r3:0.83,hd:1},
{id:210,nm:"Estrada T",tm:"SF",ps:"2B",el:["2B","SS"],pj:2.5,w:0.6,so:0.73,r3:0.71,hd:1},
{id:211,nm:"Machado M",tm:"SD",ps:"3B",el:["3B","SS"],pj:4.5,w:1.1,so:0.83,r3:0.86,hd:1},
{id:212,nm:"Tatis F",tm:"SD",ps:"OF/SS",el:["OF1","OF2","OF3","SS"],pj:4.5,w:1,so:0.82,r3:0.9,hd:1},
{id:213,nm:"Cronenworth J",tm:"SD",ps:"2B/1B",el:["2B","1B","SS"],pj:3,w:0.7,so:0.75,r3:0.73,hd:1},
{id:217,nm:"Campusano L",tm:"SD",ps:"C",el:["C"],pj:2,w:0.5,so:0.71,r3:0.68,hd:1},
{id:219,nm:"Marte K",tm:"ARI",ps:"2B",el:["2B","3B","SS"],pj:4.5,w:1.2,so:0.85,r3:0.84,hd:1},
{id:220,nm:"Carroll C",tm:"ARI",ps:"OF/SS",el:["OF1","OF2","OF3","SS"],pj:4,w:1,so:0.8,r3:0.83,hd:1},
{id:223,nm:"Moreno G",tm:"ARI",ps:"C",el:["C"],pj:3,w:0.8,so:0.77,r3:0.8,hd:1},
{id:228,nm:"Tovar E",tm:"COL",ps:"SS",el:["SS"],pj:3,w:0.8,so:0.76,r3:0.78,hd:1},
{id:230,nm:"Doyle B",tm:"COL",ps:"2B",el:["2B"],pj:2.5,w:0.6,so:0.74,r3:0.72,hd:1},
];
const P=[
{id:501,nm:"Cole G",tm:"NYY",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:5,w:1.2,se:3.2,r3:3.6,hd:1},
{id:502,nm:"Fried M",tm:"NYY",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4.5,w:1.1,se:3.3,r3:3,hd:1},
{id:507,nm:"Houck T",tm:"BOS",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:1,se:3.4,r3:3.1,hd:1},
{id:509,nm:"Bello B",tm:"BOS",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.5,r3:3.3,hd:1},
{id:511,nm:"Bradish K",tm:"BAL",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:0.9,se:3.3,r3:3.1,hd:1},
{id:516,nm:"Gausman K",tm:"TOR",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1,se:3.2,r3:3,hd:1},
{id:523,nm:"Eflin Z",tm:"TB",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.4,r3:3.2,hd:1},
{id:526,nm:"Bibee T",tm:"CLE",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:1,se:3.3,r3:3.1,hd:1},
{id:530,nm:"Clase E",tm:"CLE",ps:"RP",el:["RP"],pj:2.5,w:0.8,se:1.8,r3:0,hd:1},
{id:531,nm:"Skubal T",tm:"DET",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:6,w:1.9,se:2.2,r3:1.5,hd:1},
{id:536,nm:"Lugo S",tm:"KC",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:1.2,se:2.9,r3:2.1,hd:1},
{id:537,nm:"Ragans C",tm:"KC",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:0.9,se:3.4,r3:3.5,hd:0},
{id:541,nm:"Lopez P",tm:"MIN",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:1,se:3.3,r3:3.2,hd:1},
{id:545,nm:"Duran Jh",tm:"MIN",ps:"RP",el:["RP"],pj:2,w:0.6,se:2.5,r3:2.2,hd:1},
{id:546,nm:"Crochet G",tm:"CHW",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:0.7,se:3.4,r3:3.2,hd:1},
{id:551,nm:"Valdez F",tm:"HOU",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1.1,se:3.2,r3:3.8,hd:1},
{id:555,nm:"Pressly R",tm:"HOU",ps:"RP",el:["RP"],pj:1.5,w:0.4,se:3.2,r3:2.9,hd:1},
{id:561,nm:"Castillo L",tm:"SEA",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1,se:3.2,r3:3,hd:1},
{id:562,nm:"Gilbert L",tm:"SEA",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1.1,se:3,r3:2.8,hd:1},
{id:565,nm:"Munoz A",tm:"SEA",ps:"RP",el:["RP"],pj:2,w:0.6,se:2.4,r3:2.1,hd:1},
{id:567,nm:"Eovaldi N",tm:"TEX",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.4,r3:3.2,hd:1},
{id:576,nm:"Sale C",tm:"ATL",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4.5,w:1.5,se:2.8,r3:2.2,hd:1},
{id:577,nm:"Strider S",tm:"ATL",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:2,w:0.5,se:4.2,r3:3.8,hd:1},
{id:580,nm:"Iglesias R",tm:"ATL",ps:"RP",el:["RP"],pj:2,w:0.6,se:2.6,r3:2.3,hd:1},
{id:581,nm:"Severino L",tm:"NYM",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.5,r3:3.3,hd:1},
{id:586,nm:"Wheeler Z",tm:"PHI",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:6.5,w:1.8,se:2.4,r3:1.8,hd:1},
{id:588,nm:"Nola A",tm:"PHI",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1.1,se:3.1,r3:2.9,hd:1},
{id:592,nm:"Gore M",tm:"WSH",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.4,r3:3.2,hd:1},
{id:601,nm:"Imanaga S",tm:"CHC",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:1,se:3.1,r3:2.9,hd:1},
{id:603,nm:"Steele J",tm:"CHC",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.4,r3:3.2,hd:1},
{id:606,nm:"Peralta F",tm:"MIL",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:1,se:3.2,r3:3,hd:1},
{id:610,nm:"Williams D",tm:"MIL",ps:"RP",el:["RP"],pj:2,w:0.6,se:2.6,r3:2.3,hd:1},
{id:611,nm:"Gray S",tm:"STL",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:1,se:3.4,r3:2.9,hd:1},
{id:612,nm:"Helsley R",tm:"STL",ps:"RP",el:["RP"],pj:2.5,w:0.9,se:2,r3:1.5,hd:1},
{id:616,nm:"Greene H",tm:"CIN",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.6,r3:4.1,hd:1},
{id:622,nm:"Jones J",tm:"PIT",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.4,r3:3.2,hd:1},
{id:625,nm:"Bednar D",tm:"PIT",ps:"RP",el:["RP"],pj:2,w:0.5,se:2.8,r3:2.5,hd:1},
{id:626,nm:"Yamamoto Y",tm:"LAD",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1,se:3.1,r3:2.7,hd:1},
{id:628,nm:"Glasnow T",tm:"LAD",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1.1,se:2.8,r3:2.5,hd:1},
{id:630,nm:"Scott T",tm:"LAD",ps:"RP",el:["RP"],pj:2,w:0.7,se:2.5,r3:1.8,hd:1},
{id:631,nm:"Webb L",tm:"SF",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:4,w:1.2,se:3,r3:2.5,hd:1},
{id:636,nm:"Cease D",tm:"SD",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:1,se:3.5,r3:3.4,hd:1},
{id:638,nm:"King M",tm:"SD",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3,w:0.8,se:3.3,r3:3.1,hd:1},
{id:640,nm:"Suarez R",tm:"SD",ps:"RP",el:["RP"],pj:2,w:0.6,se:2.4,r3:2.1,hd:1},
{id:641,nm:"Burnes C",tm:"ARI",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:5,w:1.4,se:3.1,r3:2.8,hd:0},
{id:643,nm:"Kelly M",tm:"ARI",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:3.5,w:0.9,se:3.2,r3:3,hd:1},
{id:645,nm:"Sewald P",tm:"ARI",ps:"RP",el:["RP"],pj:1.5,w:0.4,se:3.3,r3:3,hd:1},
{id:648,nm:"Quantrill C",tm:"COL",ps:"SP",el:["SP1","SP2","SP3","SP4"],pj:2,w:0.5,se:4.3,r3:4.1,hd:1},
];
return[...H.map(h=>({...h,tp:"H",gp:GP,pp:(h.pj||2)*WAR$})),...P.map(p=>({...p,tp:"P",gp:GP,pp:(p.pj||2)*WAR$}))];
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
const [raw] = useState(mkP);
const [vw, setVw] = useState("MKT");
const [cur, setCur] = useState("o1");
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

const [ow, setOw] = useState(() => {
const o = {};
["DIAMOND DOGS","MOUND MAVS","SLUGGER CITY","THE DINGERS","CURVEBALL KINGS",
"STOLEN BASES","RALLY MONKEYS","HOT CORNER","PEN BANDITS","WALK-OFF W."].forEach((n,i) => {
o[`o${i+1}`] = { id:`o${i+1}`, nm:n, r:[], tx:0 };
}); return o;
});

const nO = Object.keys(ow).length;
const me = ow[cur];
const om = useMemo(() => { const m = {}; Object.values(ow).forEach(o => o.r.forEach(x => { m[x.pid] = (m[x.pid]||0)+1 })); return m }, [ow]);
const pl = useMemo(() => raw.map(p => {
const oc = om[p.id]||0;
const { p:pr, e, m: mm } = calcP(p, oc/nO);
return { ...p, c:pr, e, m:mm, d:pr-p.pp, dp:+((pr-p.pp)/Math.max(p.pp,1)*100).toFixed(1) };
}), [raw, om, nO]);
const pM = useMemo(() => Object.fromEntries(pl.map(p => [p.id,p])), [pl]);
const rE = SLOTS.map(s => { const e=me.r.find(x=>x.slot===s); return{slot:s,p:e?pM[e.pid]:null,paid:e?.paid||0}});
const filled = me.r.map(x => pM[x.pid]).filter(Boolean);
const tW = filled.reduce((s,p) => s+(p.w||0), 0);
const pV = filled.reduce((s,p) => s+(p.c||0), 0);
const sp = me.r.reduce((s,x) => s+x.paid, 0);
const rem = BUDGET - sp;
const has = pid => me.r.some(x => x.pid === pid);

const mk = useMemo(() => {
let l = [...pl];
if (ft==="HIT") l=l.filter(p=>p.tp==="H");
if (ft==="PIT") l=l.filter(p=>p.tp==="P");
if (q) l=l.filter(p=>p.nm.toLowerCase().includes(q.toLowerCase())||p.tm.toLowerCase().includes(q.toLowerCase()));
const ss = {PRICE:(a,b)=>b.c-a.c, WAR:(a,b)=>b.w-a.w, CHG:(a,b)=>simChg(b,chgFrame).pct-simChg(a,chgFrame).pct, AZ:(a,b)=>a.nm.localeCompare(b.nm)};
l.sort(ss[so]||ss.PRICE); return l;
}, [pl,ft,so,q,chgFrame]);

const lb = useMemo(() => Object.values(ow).map(o => {
const rp=o.r.map(x=>pM[x.pid]).filter(Boolean);
return{...o,w:rp.reduce((s,p)=>s+(p.w||0),0),v:rp.reduce((s,p)=>s+(p.c||0),0)};
}).sort((a,b)=>b.w-a.w),[ow,pM]);

const flash = useCallback((m,e) => { setMsg({m,e}); setTimeout(()=>setMsg(null),2500) },[]);

const buy = (p,s) => {
if(me.tx>=MAX_TX) return flash("NO TX LEFT","E");
if(p.c>rem) return flash("NO FUNDS","E");
if(!s) return flash("SELECT SLOT","E");
setOw(pv=>({...pv,[cur]:{...pv[cur],r:[...pv[cur].r,{pid:p.id,slot:s,paid:p.c}],tx:pv[cur].tx+1}}));
flash(`BUY ${p.nm} > ${dSlot(s)} @ ${f$(p.c)}`);setSel(null);
};
const sell = p => {
if(me.tx>=MAX_TX) return flash("NO TX LEFT","E");
const e=me.r.find(x=>x.pid===p.id);
setOw(pv=>({...pv,[cur]:{...pv[cur],r:pv[cur].r.filter(x=>x.pid!==p.id),tx:pv[cur].tx+1}}));
const pl2=p.c-(e?.paid||0);
flash(`SELL ${p.nm} @ ${f$(p.c)} [${pl2>=0?"+":""}${f$(pl2)}]`);setSel(null);
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

    {/* Palm Device - CSS Recreation */}
    <div style={{
      position:"relative",
      width: "min(339px, 92vw)",
      aspectRatio: "339/494",
      background: "linear-gradient(180deg, #6b6b6b 0%, #585858 8%, #4a4a4a 50%, #3d3d3d 100%)",
      borderRadius: 16,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Top bar with logos */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding: "6px 14px 4px",
        height: "7%",
      }}>
        <span style={{color:"#ccc",fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:800,letterSpacing:1,textShadow:"0 1px 2px rgba(0,0,0,0.5)"}}>
          Palm<span style={{color:"#4a9eff"}}>∎</span>Pilot
        </span>
        <span style={{color:"#999",fontFamily:"monospace",fontSize:8,letterSpacing:1}}>US Robotics</span>
      </div>

      {/* Screen bezel */}
      <div style={{
        flex: 1,
        margin: "0 12px",
        background: "#1a1008",
        borderRadius: 4,
        padding: 4,
        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8)",
      }}>
        {/* LCD Screen */}
        <div className="palm-screen" style={{
          width:"100%", height:"100%",
          background: bgc,
          borderRadius: 2,
          overflow:"hidden",
          display:"flex", flexDirection:"column",
          fontFamily:"'Silkscreen',monospace",
          color: fg,
          position: "relative",
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
                {Object.values(ow).map(o=>
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
                      <tr key={p.id} style={{opacity:no ? 0.25 : 1,background:mine?hi:"transparent"}}>
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
      </div>

      {/* Bottom buttons area */}
      <div style={{
        height: "13%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12%",
        padding: "0 20px",
      }}>
        {[
          {icon:"📅", label:"Date"},
          {icon:"📋", label:"Addr"},
          {icon:"📝", label:"Todo"},
          {icon:"📊", label:"Memo"},
        ].map((btn, i) => (
          <div key={i} style={{
            width: 32, height: 32,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #5a5a5a 0%, #3a3a3a 100%)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
            cursor: "default",
          }}>{btn.icon}</div>
        ))}
      </div>

      {/* Graffiti area */}
      <div style={{
        height: "4%",
        background: "linear-gradient(180deg, #3d3d3d, #333)",
        borderTop: "1px solid #555",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{width:"40%",height:1,background:"#555",borderRadius:1}}/>
      </div>
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
                {Object.values(ow).map(o=>(
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
          {["PRICE","WAR","CHG","AZ"].map(v=>
            <span key={v} onClick={()=>setSo(v)} style={{cursor:"pointer",color:so===v?bg:dim,background:so===v?g:"transparent",padding:"1px 8px"}}>{v}</span>)}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="> search" style={{marginLeft:"auto",background:"transparent",border:`1px solid ${brd_d}`,color:g,fontFamily:"inherit",fontSize:16,padding:"2px 8px",width:180}}/>
        </div>
        <div style={{maxHeight:"calc(100vh - 200px)",overflowY:"auto",overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:600,tableLayout:"fixed"}}>
            <thead><tr>
              <th style={{...th2_d,position:"sticky",left:0,zIndex:3,background:bg,width:120}}>PLAYER</th>
              <th style={{...th2_d,width:40}}>TM</th>
              <th style={{...th2_d,width:65}}>POS</th>
              <th style={{...th2_d,width:70}}>PRICE</th>
              <th style={{...th2_d,cursor:"pointer",userSelect:"none",width:65}} onClick={cycleFrame}>CHG <span style={{color:amb}}>[{chgFrame}]</span></th>
              <th style={{...th2_d,width:45}}>WAR</th>
              <th style={{...th2_d,width:50,textAlign:"center"}}></th>
            </tr></thead>
            <tbody>
              {mk.map(p=>{
                const mine=has(p.id);const ok=!mine&&fits(me.r,p);const no=!mine&&!ok;
                const ch=simChg(p,chgFrame);
                return(
                  <tr key={p.id} style={{opacity:no ? 0.25 : 1,background:mine?"#081208":"transparent"}}>
                    <td style={{...td2_d,color:mine?amb:wh,position:"sticky",left:0,background:mine?"#081208":bg,zIndex:1}}>{p.nm}</td>
                    <td style={{...td2_d,color:dim}}>{p.tm}</td>
                    <td style={{...td2_d,overflow:"hidden",textOverflow:"ellipsis"}} title={[...new Set(p.el.map(dSlot))].join("/")}>{[...new Set(p.el.map(dSlot))].join("/")}</td>
                    <td style={{...td2_d,color:wh}}>{f$(p.c)}</td>
                    <td style={{...td2_d,color:ch.pct>=0?g:neg}}>{ch.pct>=0?"+":""}{ch.pct}%</td>
                    <td style={td2_d}>{p.w.toFixed(1)}</td>
                    <td style={{...td2_d,textAlign:"center"}}>
                      {mine?<span onClick={()=>openSell(p)} style={{cursor:"pointer",background:neg,color:bg,padding:"1px 8px",fontWeight:700,fontSize:14}}>SELL</span>
                      :ok?<span onClick={()=>openBuy(p)} style={{cursor:"pointer",background:g,color:bg,padding:"1px 8px",fontWeight:700,fontSize:14}}>BUY</span>
                      :<span style={{color:"#1a1a1a"}}>---</span>}
                    </td>
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