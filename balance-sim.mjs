/* 밸런스 장기 진행 시뮬레이터 — 실제 game.js 를 vm 위에서 구동해 진행 곡선을 측정한다.
   목적: "장시간 플레이하고 싶은 게임인가"를 감이 아니라 수치로 판정한다.

   설계 원칙 (★ 2026-09-12 v5.182):
   · 시뮬은 game.js 의 정본 함수만 쓴다 — heroPower(세트·각성 포함)·craftStart·onKill.
     공식을 다시 적는 순간 시뮬과 게임이 어긋난다(과거 밸런스 재시뮬 사고의 교훈, HANDOFF 6장).
   · 가상 플레이어 정책(합리적 플레이):
     ① 전투력이 권장치를 충족하는 가장 높은 사냥터에서 사냥
     ② 재료·골드가 되는 가장 좋은 등급·가장 비싼(좋은) 부위를 제작·장착
     ③ 강화는 하지 않는다(v1) — 강화 실패 RNG가 곡선에 노이즈를 낸다. 제작 파밍 축만 본다.
   · 시간 압축: 전투는 실제 스텝(Battle.pumpFrame, 고정 1/20s)으로 짧은 창을 돌려
     실수입률을 측정하고, 창 사이 '다음 제작 완료 시점'까지는 해석적으로 건너뛴다.
   · 시드 고정 — 실행마다 같은 곡선이 나와야 비교가 된다(M1 결정론 정신).

   실행: npm run sim  (또는 node balance-sim.mjs [최대시뮬시간_시간])
   결과: 등급 도달 시각·CP 곡선·업그레이드 공백(벽) 리포트. 게이트 아님 — 분석 도구.
*/
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const D = path.dirname(fileURLToPath(import.meta.url)) + '/';
const js = fs.readFileSync(D+'game.js','utf8');
const MAX_HOURS = Number(process.argv[2]||240);

/* ---- 최소 DOM 스텁 (smoke-test 의 것에서 전투 구동에 필요한 만큼만) ---- */
class CL{ constructor(){this.s=new Set();}
  add(...c){c.forEach(x=>x&&this.s.add(x));} remove(...c){c.forEach(x=>this.s.delete(x));}
  toggle(c,f){ if(f===undefined){ this.s.has(c)?this.s.delete(c):this.s.add(c); } else f?this.s.add(c):this.s.delete(c); return this.s.has(c);}
  contains(c){return this.s.has(c);} get value(){return [...this.s].join(' ');} }
class Node2{
  constructor(tag='div'){
    this.children=[]; this.childNodes=[{nodeValue:''}];
    this.style=new Proxy({setProperty(){},getPropertyValue(){return '';}},{get:(t,k)=>k in t?t[k]:'',set:(t,k,v)=>{t[k]=v;return true;}});
    this.dataset={}; this.classList=new CL(); this._text=''; this._html='';
    this.value=''; this.checked=false; this.disabled=false; this.id='';
    this.offsetWidth=453; this.offsetHeight=548;
  }
  set className(v){this.classList.s=new Set(String(v).split(/\s+/).filter(Boolean));}
  get className(){return this.classList.value;}
  set textContent(v){this._text=String(v);} get textContent(){return this._text;}
  set innerHTML(v){this._html=String(v); if(v==='')this.children=[];} get innerHTML(){return this._html;}
  appendChild(c){if(c){this.children.push(c);c.parentNode=this;this.firstChild=this.children[0];this.lastChild=c;} return c;}
  append(...cs){cs.forEach(c=>typeof c==='object'&&this.appendChild(c));}
  replaceChildren(...cs){this.children=[];this.firstChild=this.lastChild=null;cs.forEach(c=>this.appendChild(c));}
  removeChild(c){const i=this.children.indexOf(c); if(i>=0)this.children.splice(i,1); this.firstChild=this.children[0]||null; this.lastChild=this.children[this.children.length-1]||null; return c;}
  remove(){if(this.parentNode)this.parentNode.removeChild(this);}
  addEventListener(t,f){(this._ev=this._ev||{})[t]=f;} removeEventListener(){} dispatchEvent(){return true;}
  setAttribute(k,v){if(k==='id')this.id=v;(this._at=this._at||{})[k]=v;} getAttribute(k){return (this._at||{})[k]??null;}
  hasAttribute(k){return !!(this._at&&k in this._at);} removeAttribute(k){if(this._at)delete this._at[k];}
  getBoundingClientRect(){return {top:0,left:0,width:453,height:548};}
  querySelector(s){return documentStub.querySelector(s);} querySelectorAll(s){return documentStub.querySelectorAll(s);}
  getContext(){return new Proxy({},{get:()=>()=>{}});}
}
const store=new Map();
const localStorageStub={ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k), clear:()=>store.clear() };
const documentStub={
  readyState:'complete',
  createElement:t=>new Node2(t), createTextNode:t=>({nodeValue:String(t)}),
  getElementById:id=>registry.get(id)||null,
  /* $() 가 querySelector('#id') 로 쓰인다 — #id 만 레지스트리로 해석, 그 외는 더미(smoke 방식) */
  querySelector(s){ const m=/^#([\w-]+)/.exec(String(s)); if(m) return registry.get(m[1])||new Node2('div'); return new Node2('div'); },
  querySelectorAll(){ return []; },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true;},
};
const registry=new Map();
for(const m of fs.readFileSync(D+'index.html','utf8').matchAll(/\bid="([^"]+)"/g)) registry.set(m[1], new Node2('div'));
const windowStub={
  document:documentStub, localStorage:localStorageStub,
  addEventListener(t,f){(documentStub._ev=documentStub._ev||{})[t]=f;}, removeEventListener(){},
  requestAnimationFrame(){return 0;}, cancelAnimationFrame(){},
  setTimeout(){return 0;}, clearTimeout(){}, setInterval(){return 0;}, clearInterval(){},
  performance:{now:()=>Date.now()},
  Image:class{ set src(v){} },
  navigator:{userAgent:'sim'},
  matchMedia(){return {matches:false,addEventListener(){}};},
  console,
  Date, Math, JSON,
};
windowStub.window=windowStub; windowStub.globalThis=windowStub; windowStub.self=windowStub;
const ctx=vm.createContext(windowStub);
vm.runInContext(js+'\n;globalThis.__ev=(src)=>eval(src);\n', ctx, {filename:'game.js'});
const ev=s=>ctx.__ev(s);
documentStub._ev.DOMContentLoaded();          // 부트 (빈 저장소 → 신규 세이브)

/* ---- 시뮬 유틸 ---- */
const log=(...a)=>console.log(...a);
function battleWindow(simSec){
  // 실전투 창: 고정 스텝(1/20s)으로 simSec 초 만큼 진행. 수입은 곧장 S 에 반영된다.
  const pump=ev('Battle').pumpFrame;
  const steps=Math.round(simSec*20);
  pump(steps/20*0.9999);   // pumpFrame(총dt) — 내부에서 FIXED_DT 로 분할
}
function myCP(){ return ev('totalCP')(); }
function bestTierIdx(){
  const HT=ev('HUNT_TIERS'), cp=myCP();
  let idx=0;
  HT.forEach((t,i)=>{ if(cp>=t.cp) idx=i; });
  return idx;
}
function leaderId(){
  // party()[0] — 편성 없으면 전투력 최상. 홈 전투는 이 영웅 1명이 나간다.
  return ev('party')()[0].hero_id;
}
/* 장착 — itemDetail 의 onYes 와 같은 규칙: 같은 영웅 같은 부위 기존 장비 파괴 */
function equip(item, heroId){
  const slotSchema=ev('slotSchema');
  const part=slotSchema(item.slot).part;
  const S=ev('S');
  S.equips=S.equips.filter(x=>{
    if(x===item) return true;
    if(x.equipped && (!x.heroId||x.heroId===heroId) && slotSchema(x.slot).part===part) return false;
    return true;
  });
  item.equipped=true; item.heroId=heroId;
  ev('Battle').refreshParty();
}
/* 제작 후 즉시 판정 — craftStart 로 실제 경로(재료·골드 차감)를 타고, 타이머를 0으로 */
function craftNow(grade, catKey, item){
  ev('craftStart')(grade, catKey, item);
  const S=ev('S');
  if(!S.craft) return false;
  S.craft.endAt=0;
  ev('craftAutoCheck')();
  return true;
}
/* 제작 가능한 최선 후보 v2 — 안 입은 부위 우선, 같은 부위면 높은 등급.
   (v1은 등급만 보고 첫 후보를 만들어 같은 부위를 계 갈아끼우는 낭비를 했다) */
function bestCraftable(){
  const FS=ev('FORGE_SLOTS'), GORDER=['N','R','E','L'];
  const S=ev('S'), schema=ev('slotSchema'), leader=leaderId();
  const worn=new Set(S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===leader)).map(e=>schema(e.slot).part));
  const pool=[];
  FS.forEach(s=>{ if(!s.items) return; ['L','E','R','N'].forEach(g=>{
    (s.items[g]||[]).forEach(it=>{
      const cp=ev('craftParams')(g,s.k,it.n);
      if(!ev('recipeOk')(it.recipe) || S.gold<cp.gold) return;
      if(S.equips.filter(x=>x.slot===it.n).length>=99) return;      // v5.171 상한
      pool.push({grade:g, cat:s.k, item:it, part:schema(it.n).part});
    });
  });});
  const fresh=pool.filter(p=>!worn.has(p.part));
  const list=fresh.length?fresh:pool;
  return list[0]||null;
}
/* 재료 합성 — synth 모달의 실제 규칙(30개→rateOf 확률 / 500개→확정, nextOf 동일 인덱스 상위).
   시뮬은 확률합성을 batch 로 돌린다(모달의 '합 성 XN' 과 동일한 기대값). */
function synthStep(){
  const GORDER=['N','R','E','L'], S=ev('S');
  const MAT_BY_GRADE=ev('MAT_BY_GRADE'), MAT_BY_KEY=ev('MAT_BY_KEY');
  const rateOf=g=>g==='R'?50:g==='E'?0.8:0.08;
  let did=0;
  for(const g of ['N','R','E']){                       // L→ 없음
    const to=GORDER[GORDER.indexOf(g)+1];
    const avail=i=>S.mats[MAT_BY_GRADE[g][i].k]||0;
    for(let i=0;i<6;i++){
      const src=MAT_BY_GRADE[g][i].k, dst=MAT_BY_GRADE[to][i].k;
      let batches=Math.floor((S.mats[src]||0)/30);
      if(batches<=0) continue;
      batches=Math.min(batches, 200);
      let ok=0;
      for(let b=0;b<batches;b++){ if(Math.random()*100<rateOf(to)) ok++; }
      if(ok>0){
        ev('matSpend')(src, batches*30);
        ev('matGain')(dst, ok);
        S.stats.synths=(S.stats.synths||0)+batches;     // 일일미션 집계와 같은 축
        did+=ok;
      }
    }
  }
  return did;
}
/* 소환·영웅 합성 — 티켓 있으면 20장 소환, R영웅 조각 모이면 합성 */
function summonStep(){
  const S=ev('S');
  let fused=null;
  while(S.tickHero>=1){ ev('summonRun')(20); S.tickHero--; }
  // 미보유 영웅 중 선행 조건 충족 + 조각 충분 → 합성 (heroFuse 가 실제 경로)
  const ROSTER=ev('HERO_ROSTER');
  for(const r of ROSTER){
    const e=ev('heroEntry')(r.hero_id);
    if(e.own) continue;
    if(!ev('heroFusePrereq')(r.hero_id)) continue;
    const need=ev('heroFuseNeed')(r.hero_id), have=ev('heroShardAvail')(r.hero_id);
    if(have>=need && ev('heroFuse')(r.hero_id)){ fused=r.name; break; }
  }
  if(fused) ev('Battle').refreshParty();
  return fused;
}

/* ---- 시뮬 본체 ---- */
ev('Battle').setSeed(42);
const S0=ev('S');
S0.settings.sound=false;
let simSec=0;
const WINDOW=1800;                 // 30분(시뮬) 전투 창 — 수입률 측정·실제 킬
const events=[];                   // {t(시), cp, what}

events.push({t:0, cp:myCP(), what:'시작 — '+ev('party')()[0].name});

log(`\n[밸런스 시뮬] 시드 42 · 최대 ${MAX_HOURS}시뮬시간 · 창 ${WINDOW/60}분\n`);
let lastCP=myCP(), lastEventT=0, windows=0;
const gradeReached={};
while(simSec < MAX_HOURS*3600 && windows<400){
  // ① 사냥터 선택(합리적 플레이)
  const idx=bestTierIdx();
  ev('S').huntTier=idx; ev('Battle').setHunt();
  const tier=ev('HUNT_TIERS')[idx];

  // ② 전투 창
  const goldBefore=ev('S').gold;
  battleWindow(WINDOW);
  simSec+=WINDOW; windows++;

  // ③ 합성·소환 (의도 루프: 재료 합성 → 상위 재료, 소환 → 조각 → R영웅 합성)
  const fusedName=summonStep();
  const synthGot=synthStep();

  // ④ 제작·장착 (가능한 만큼)
  let did='';
  if(fusedName) did+=`영웅 합성[${fusedName}] `;
  if(synthGot>0) did+=`상급재료+${synthGot} `;
  let c=bestCraftable();
  let crafts=0;
  while(c && crafts<5){                       // 창당 최대 5제작 (과도 폭주 방지)
    craftNow(c.grade, c.cat, c.item);
    const made=ev('S').equips[ev('S').equips.length-1];
    if(made && made.grade===c.grade){ equip(made, leaderId()); crafts++; }   // 리더는 합성으로 바뀔 수 있다
    c=bestCraftable();
  }
  if(crafts>0) did+=`${crafts}제작·장착 @${tier.n}`;

  // ⑤ 기록 — CP 변화 or 이벤트
  const cp=myCP();
  if(crafts>0 || fusedName || synthGot>0 || cp!==lastCP){
    events.push({t:+(simSec/3600).toFixed(2), cp, what:did.trim()||'CP 상승'});
    lastCP=cp;
  }
  // 등급 도달 기록
  const HT=ev('HUNT_TIERS');
  HT.forEach((t,i)=>{
    if(cp>=t.cp && gradeReached[t.drop]===undefined) gradeReached[t.drop]=(simSec/3600).toFixed(1);
  });

  // ⑤ 진행 멈춤 감지 — 5창(2.5시뮬시간) 동안 CP 변화 없으면 조기 종료(벽으로 판정)
  if(cp===lastCP && !crafts) lastEventT+=WINDOW; else lastEventT=0;
  if(lastEventT>=WINDOW*5){
    events.push({t:+(simSec/3600).toFixed(2), cp, what:'⛔ 정체 — 2.5시간 무성장'});
    break;
  }
}

/* ---- 리포트 ---- */
log('\n[곡선] 시각(시뮬시간) | 전투력 | 이벤트');
events.forEach(e=>log(`  ${String(e.t).padStart(7)}h | ${String(e.cp).padStart(7)} | ${e.what}`));
log('\n[등급 도달] ', Object.entries(gradeReached).map(([g,h])=>`${g}:${h}h`).join(' · ')||'—');
const GORDER=['N','R','E','L'];
let walls=[];
for(let i=1;i<events.length;i++){
  const gap=events[i].t-events[i-1].t;
  if(gap>=1) walls.push(`${gap.toFixed(1)}h 공백 @${events[i-1].cp}→${events[i].cp}`);
}
log('[업그레이드 공백(벽 후보)]', walls.length?walls.join(' · '):'1시간 미만 공백만 존재');
log(`\n총 시뮬: ${(simSec/3600).toFixed(1)}h · 창 ${windows}회 · 최종 CP ${myCP()} · 재료(상위 5):`,
  Object.entries(ev('S').mats).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}:${v}`).join(' '));
/* 진단: 리더·장착·보유영웅 — CP 정체의 원인을 구분한다(리더 등급? 레벨? 장비 기여?) */
{
  const S=ev('S'), ld=ev('party')()[0];
  log(`[진단] 리더 ${ld.name}(grade ${ld.grade} · Lv${ld.level}) · 보유 영웅 ${ev('ownedHeroes')().length}/9 · 조각`,
    Object.entries(S.shards).map(([k,v])=>`${k}:${Math.floor(v)}`).join(' '));
  const worn=S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===ld.hero_id));
  log(`[진단] 리더 장착 ${worn.length}부위 ·`, worn.map(e=>`${e.grade}${e.slot}${e.enh?'+'+e.enh:''}`).join(', ')||'없음');
  log(`[진단] 보유 영웅별 CP:`, ev('ownedHeroes')().map(h=>`${h.name.slice(0,5)}(${h.grade})=${ev('heroPower')(h)}`).join(' · '));
}
log('결론은 곡선을 보고 판단 — 공백이 길면 해당 구간의 재료/골드 곡선을 조정한다.');
