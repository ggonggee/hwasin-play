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
/* 사냥 대상 선택 v2 — '필요한 재료를 떨구는 안전한 몬스터'를 찾는다(이 게임의 코어 루프).
   종전엔 항상 최상위 안전 티어만 잡아 그 몬스터의 고정 재료만 얻어, 다른 부위 제작이
   재료 부족으로 영영 막혔다(200h에도 N장비 잔존의 원인 — 진단 실측).
   정책: 다음 제작 목표(bestCraftable 의 실패 원인)에 필요한 재료를 고정 드랍(mat/mat2)하는
   가장 높은 등급의 안전한 몬스터. 목표가 없으면 최상위 안전 티어. */
function pickHuntIdx(){
  const HT=ev('HUNT_TIERS');
  const cp=ev('heroPower')(ev('party')()[0]);   // 홈 전투는 리더 1명 — 총전투력 판정은 전멸 트랩(실측)
  const safe=i=>cp>=HT[i].cp;
  // 다음 목표: 아직 못 만드는 것 중 최고 등급 — 부족한 재료 산출
  const want=nextWantedMaterials();
  if(want && want.length){
    for(let i=HT.length-1;i>=0;i--){
      if(!safe(i)) continue;
      const t=HT[i];
      if(want.includes(t.mat)||(t.mat2&&want.includes(t.mat2))) return i;
    }
  }
  let idx=0; HT.forEach((t,i)=>{ if(safe(i)) idx=i; });
  return idx;
}
/* 부위×등급 후보 전부 수집(골드 무관) — v3.1 정책의 데이터원.
   v3의 실수: 부위마다 '최고 등급' 하나만 남겼더니 그 등급이 재료 불충분이면
   하위 등급 업그레이드도 사지 않는 마비 상태가 됐다(시작 직후 제작 0건 실측). */
function leaderId(){
  // party()[0] — 편성 없으면 전투력 최상. 홈 전투는 이 영웅 1명이 나간다.
  return ev('party')()[0].hero_id;
}
function upgradeCandidates(){
  const FS=ev('FORGE_SLOTS'), S=ev('S'), schema=ev('slotSchema'), leader=leaderId();
  const order={L:3,E:2,R:1,N:0};
  const wornGrade={};
  S.equips.forEach(e=>{ if(e.equipped&&(!e.heroId||e.heroId===leader)){
    const pt=schema(e.slot).part; wornGrade[pt]=Math.max(wornGrade[pt]||-1, order[e.grade]); }});
  const out=[];
  FS.forEach(s2=>{ if(!s2.items) return;
    for(const g of ['L','E','R','N']){
      (s2.items[g]||[]).forEach(it=>{
        if(it.n.indexOf('물약')>=0) return;
        if(S.equips.filter(x=>x.slot===it.n).length>=99) return;
        const pt=schema(it.n).part;
        if((wornGrade[pt]??-1)>=order[g]) return;               // 이미 같거야 높은 등급 착용
        out.push({grade:g, cat:s2.k, item:it, part:pt,
                  cost:ev('craftParams')(g,s2.k,it.n).gold,
                  recOK:ev('recipeOk')(it.recipe)});
      });
    }});
  return out;
}
/* 저축형 구매: 재료가 되는 후보 중 '살 수 있는 최고 등급'을 산다. 없으면 null(저축). */
function bestCraftable(){
  const S=ev('S'), order={L:3,E:2,R:1,N:0};
  const can=upgradeCandidates().filter(u=>u.recOK&&S.gold>=u.cost)
    .sort((a,b)=> order[b.grade]-order[a.grade] || a.cost-b.cost);
  return can[0]||null;
}
/* 파밍 방향 v3.2: 목표는 등급 높은 순, 단 '지금 안전하게 잡을 수 있는 등급'의 재료만.
   종전엔 항상 최상위(L) 목표의 재료를 쫓게 했다 — L몬스터가 안전하지 않으면 그 재료는
   지금 얻을 수 없는데도 계속 쫓아 실질 파밍이 멈췄다(3.5h 정체 실측). */
function nextWantedMaterials(){
  const order={L:3,E:2,R:1,N:0};
  const HT=ev('HUNT_TIERS'), cp=myCP(), MAT_BY_KEY=ev('MAT_BY_KEY');
  // 가이드 체인 목표의 부족 재료가 최우선 — 체인 보상(소환권 24장)은 로스터의 뿌리.
  {
    const S=ev('S');
    if(S.guideStep<ev('GUIDE_CHAIN').length){
      const g=ev('GUIDE_CHAIN')[S.guideStep], loc=ev('forgeLocate')(g.slot);
      if(loc){ const s2=ev('FORGE_SLOTS')[loc.slotIdx], it=(s2.items&&s2.items[loc.grade]||[])[loc.itemIdx];
        if(it){ const lack=(it.recipe||[]).filter(r=>(S.mats[r.k]||0)<r.need);
          if(lack.length) return lack.map(l=>l.k); } }
    }
  }
  let maxSafe=-1;
  HT.forEach(t=>{ if(cp>=t.cp) maxSafe=Math.max(maxSafe, order[t.drop]); });
  const ups=upgradeCandidates().sort((a,b)=> order[b.grade]-order[a.grade] || a.cost-b.cost);
  for(const u of ups){
    const lack=(u.item.recipe||[]).filter(r=>(ev('S').mats[r.k]||0)<r.need);
    if(!lack.length) continue;
    const ok=lack.every(r=>order[(MAT_BY_KEY[r.k]||{}).g]!==undefined && order[MAT_BY_KEY[r.k].g]<=maxSafe);
    if(ok) return lack.map(l=>l.k);
  }
  return null;
}
/* 재료 합성 — synth 모달의 실제 규칙(30개→rateOf 확률 / 500개→확정, nextOf 동일 인덱스 상위).
   시뮬은 확률합성을 batch 로 돌린다(모달의 '합 성 XN' 과 동일한 기대값). */
/* 제작 후 즉시 판정 — craftStart 로 실제 경로(재료·골드 차감)를 타고, 타이머를 0으로 */
function craftNow(grade, catKey, item){
  ev('craftStart')(grade, catKey, item);
  const S=ev('S');
  if(!S.craft) return false;
  S.craft.endAt=0;
  ev('craftAutoCheck')();
  return true;
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
/* 일일 콘텐츠 (골드던전 3회 · 요일던전 5회) — 테이블 정본(GOLD_DUNGEON/DD_*)에서
   실제 지급과 같은 값을 준다. enterDungeonFight 가 UI 클로저라 직접 호출 대신
   동일 지급을 재현한다(측정 도구로서 합리적 근사 — 수치는 정본 테이블).
   소환서 골드 구매(상점 15,000,000/10장, 실측 라인 724)도 여기서 — 소환이
   골드화로 이어지는 게 의도된 F2P 루프다. */
function dailyStep(){
  const S=ev('S');
  const day=Math.floor(simSec/86400);
  if(day===dailyStep._day) return; dailyStep._day=day;
  const cp=myCP();
  // 골드던전 — 오늘 3회, foeCP ≤ 내 CP 인 최고 단계
  let left=3;
  for(let i=ev('GOLD_DUNGEON').length-1;i>=0&&left>0;i--){
    const d=ev('GOLD_DUNGEON')[i];
    if(d.foe<=cp*1.5 && ev('matAvail')(d.mat)>=d.need){
      const n=Math.min(left, Math.floor(ev('matAvail')(d.mat)/d.need));
      ev('matSpend')(d.mat, d.need*n); ev('addGold')(d.gold*n); left-=n;
    }
  }
  // 요일던전 — 오늘 5회, 3단계(영웅 재료) 가능하면 최대한
  const DD_RQ=ev('DD_RQ'); const ti=(new Date().getDay()+6)%7;
  let dl=5;
  for(const st of [3,2,1]){
    const rg=['N','R','E'][st-1], qty=Math.max(1,Math.round(DD_RQ[ti]/3*st));
    const foe=[800,2200,5200][st-1];
    if(foe<=cp*1.5&&dl>0){ const n=Math.min(dl,5); for(let k=0;k<n;k++) ev('matGainGrade')(rg,qty); dl=0; }
  }
  // 시련의 탑 소탕(일 1회) 근사 — 도달층 w는 'foe(600+w×450) ≤ 리더전투력×1.5' 안전 기준.
  // 실제 탑은 3인 파티로 도전하지만 시뮬은 탑 전투를 돌리지 않으므로 보수적으로 리더 기준.
  {
    const ld=ev('heroPower')(ev('party')()[0]);
    const w=Math.max(0, Math.floor((ld*1.5-600)/450));
    if(w>=1 && ev('dailyLeft')('towerSweep',1)>0){
      ev('dailyUse')('towerSweep');
      ev('addGold')(Math.floor(w*400000*0.5));
      S.stones=(S.stones||0)+Math.floor(w*3*0.5);
    }
  }
  // 소환서 구매 — 골드 여유(16M+)면 10장 팩 (E제작 800k 예산은 항상 확보)
  while(S.gold>=16000000){ S.gold-=15000000; S.tickHero+=10; }
}
/* ── +11~20 위험 강화의 엔드게임 기대값 (2026-09-12 측정, 몬테카를로 2만 회) ──
   규칙(실측): 실패 시 50% 파괴(전설망치 10개=골드 4M로 방지, enh 유지) · 나머지 50% enh-1.
   성공률 +11~14: 63% · +15~19: 44%. 골드 1.5M/6M · 강화석 3~4.
   결과: 부위당 기대 시도 38회 · 골드 154M + 망치 81개(325M) = 479M · 강화석 133개.
        9부위 = 약 43.1억 골드 + 강화석 1,199개 — 엔드게임 소득(던전+전투 ≈ 1억/일)으로
        한 달+ 그라인드. CP 보상: enh 배율 2.2→3.4(부위당) ≈ 리더 ×1.35.
   판정: +11~20은 망치 골드 구매(실측 상점가)로 충분히 실현 가능한 장기 엔드게임
   싱크다 — 밸런스 변경 불필요. 시뮬 정책은 안전(+10)까지만 모델링하고, 위
   구간은 이 기대값으로 별도 산출한다(강제 파괴 리스크가 정책 복잡도를 높여
   본 시뮬의 비교 목적에는 불필요). */
/* 안전 강화 — 리더 장착 9부위를 +10까지(p≥0.82 구간, 파괴 위험 0, 실패 시 -1은 재시도 비용).
   골드는 소환서 저축분(16M) 위의 여유만 써서 스크롤 케이던스를 해치지 않게 한다.
   성공률·비용은 게임의 실제 표(openEnhance)와 동일한 값 — 강화의 CP 반영은
   정본 heroPower(1+enh×0.12)가 자동으로 한다. */
function enhanceStep(){
  const S=ev('S'), leader=leaderId();
  const items=S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===leader)&&e.enh<10)
    .sort((a,b)=>a.enh-b.enh);
  let ups=0;
  for(const it of items){
    let guard=0;
    while(it.enh<10 && guard++<60){
      const cost=[50000,300000,1500000,6000000][Math.min(3,Math.floor(it.enh/5))];
      const stoneCost=1+Math.floor(it.enh/5);
      if(S.gold < 16000000+cost || (S.stones||0)<stoneCost) return ups;
      S.gold-=cost; S.stones-=stoneCost;
      if(Math.random() < (it.enh<5?0.95:0.82)){ it.enh++; ups++; }
      else it.enh=Math.max(0,it.enh-1);
    }
  }
  return ups;
}
/* 각성 정책 — 조각(직업 공용)이 여유일 때(전 영웅 보유 후 남는 조각) 기본 12단계까지.
   심화(기록서)는 회색코인 경제라 시뮬 범위 밖 — 12단계(+18%)까지만 모델링. */
function awakenStep(){
  const S=ev('S');
  if(S.guideStep<ev('GUIDE_CHAIN').length) return 0;
  const owned=ev('ownedHeroes')().length;
  if(owned<9) return 0;                        // 로스터 우선 — 조각은 합성이 먼저
  let steps=0;
  while(S.awaken<12 && steps<20){
    const cost=Math.round(250*Math.pow(1.08, S.awaken));
    const tot=Object.values(S.shards||{}).reduce((a,b)=>a+b,0);
    if(tot<cost+200) break;                    // 다음 R 재합성 대비 200 여유
    Object.keys(S.shards).forEach(k=>S.shards[k]=Math.max(0,(S.shards[k]||0)-cost/5));
    S.awaken++; steps++;
  }
  return steps;
}
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
    if(!ev('heroFusePrereq')(r.hero_id)){ (globalThis.__fuseLog=globalThis.__fuseLog||[]).push('prereq:'+r.name); continue; }
    const need=ev('heroFuseNeed')(r.hero_id), have=ev('heroShardAvail')(r.hero_id);
    if(have>=need){ if(ev('heroFuse')(r.hero_id)){ fused=r.name; break; }
      (globalThis.__fuseLog=globalThis.__fuseLog||[]).push(`fuse실패 ${r.name} ${have}/${need}`); }
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
const craftTally={};
const killLog=[];               // ★ v5.185 진단: 등급별 제작 시도 집계

events.push({t:0, cp:myCP(), what:'시작 — '+ev('party')()[0].name});

log(`\n[밸런스 시뮬] 시드 42 · 최대 ${MAX_HOURS}시뮬시간 · 창 ${WINDOW/60}분\n`);
let lastCP=myCP(), lastEventT=0, windows=0;
const gradeReached={};
while(simSec < MAX_HOURS*3600 && windows<1600){
  // ① 사냥터 선택(합리적 플레이)
  const idx=pickHuntIdx();
  ev('S').huntTier=idx; ev('Battle').setHunt();
  const tier=ev('HUNT_TIERS')[idx];

  // ② 전투 창
  const goldBefore=ev('S').gold, killsBefore=ev('S').stats.kills;
  battleWindow(WINDOW);
  const killsNow=ev('S').stats.kills-killsBefore;    // ★ 진단: 창당 킬 수(전멸 루프 탐지)
  if(windows>200) killLog.push(`${(simSec/3600).toFixed(0)}h:${killsNow}`);
  simSec+=WINDOW; windows++;

  // ③ 일일 콘텐츠·소환서 구매 → 합성·소환 (의도 루프)
  dailyStep();
  const awakenUps=awakenStep();
  const fusedName=summonStep();
  const synthGot=synthStep();

  // ④ 제작·장착 (가능한 만큼)
  let did='';
  if(fusedName) did+=`영웅 합성[${fusedName}] `;
  if(synthGot>0) did+=`상급재료+${synthGot} `;
  let c=bestCraftable();
  /* 가이드 체인 우선 — 9단계 제작 체인의 보상(소환권 24장 포함)은 실제 온보딩 레일.
     등급 우선 정책만으론 체인을 건너뛰어 보상을 놓치고 영웅 로스터가 마비된다(실측). */
  const S=ev('S');
  if(S.guideStep<ev('GUIDE_CHAIN').length){
    const g=ev('GUIDE_CHAIN')[S.guideStep];
    const loc=ev('forgeLocate')(g.slot);
    if(loc){ const s2=ev('FORGE_SLOTS')[loc.slotIdx], it=(s2.items&&s2.items[loc.grade]||[])[loc.itemIdx];
      if(it){ craftTally['가이드']=(craftTally['가이드']||0)+1; craftNow(loc.grade, s2.k, it);
        const made=ev('S').equips[ev('S').equips.length-1];
        if(made && made.slot===g.slot) equip(made, leaderId());
        c=bestCraftable();
      } }
  }
  let crafts=0;
  while(c && crafts<5){                       // 창당 최대 5제작 (과도 폭주 방지)
    craftTally[c.grade]=(craftTally[c.grade]||0)+1;
    craftNow(c.grade, c.cat, c.item);
    const made=ev('S').equips[ev('S').equips.length-1];
    if(made && made.grade===c.grade){ equip(made, leaderId()); crafts++; }   // 리더는 합성으로 바뀔 수 있다
    c=bestCraftable();
  }
  if(crafts>0) did+=`${crafts}제작·장착 @${tier.n}`;
  const ups=enhanceStep();
  if(ups>0) did+=` 강화+${ups}`;

  // ⑤ 기록 — CP 변화 or 이벤트
  const cp=myCP();
  const cpStart=lastCP;          // ★ 판정기용: 창 시작 시점 CP(아래 push 가 lastCP 를 갱신하기 전)
  if(crafts>0 || fusedName || synthGot>0 || cp!==lastCP){
    events.push({t:+(simSec/3600).toFixed(2), cp, what:did.trim()||'CP 상승'});
    lastCP=cp;
  }
  /* 등급 도달 기록 — ★ 실제 사냥 개시 게이트(리더 전투력, v5.185)와 같은 기준으로 잰다.
     종전 총전투력 기준은 벤치 성장(v5.186)만으로 등급을 '도달'로 세어 실제 사냥보다
     이르게 기록했다(E 6.5h 표기가 그 예다 — 리더가 4200을 못 넘으면 E사냥은 못 시작). */
  const HT=ev('HUNT_TIERS');
  const leadNow=ev('heroPower')(ev('party')()[0]);
  HT.forEach((t,i)=>{
    if(leadNow>=t.cp && gradeReached[t.drop]===undefined) gradeReached[t.drop]=(simSec/3600).toFixed(1);
  });

  /* ★ 정체 판정기 수정 — 종전엔 위 push 가 lastCP 를 갱신한 뒤 비교해 cp===lastCP 가
     거의 항상 참이었고, 성장 중에도 타이머가 매창 쌓여 48h 무성장 오판으로 강제 종료했다.
     (이 버그가 세션 내내 실곡선을 가렸다 — 131~139h 구간 CP 상승 중 종료된 실측으로 발견.)
     창 시작 시점 CP(cpStart)와 비교해 진짜 무성장만 센다. */
  if(cp===cpStart && !crafts && !fusedName) lastEventT+=WINDOW; else lastEventT=0;
  if(lastEventT>=WINDOW*96){
    events.push({t:+(simSec/3600).toFixed(2), cp, what:'⛔ 정체 — 48시간 무성장'});
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
  log(`[진단] 각성 +${S.awaken} · 리더 ${ld.name}(grade ${ld.grade} · Lv${ld.level}) · 보유 영웅 ${ev('ownedHeroes')().length}/9 · 조각`,
    Object.entries(S.shards).map(([k,v])=>`${k}:${Math.floor(v)}`).join(' '));
  const worn=S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===ld.hero_id));
  log(`[진단] 리더 장착 ${worn.length}부위 ·`, worn.map(e=>`${e.grade}${e.slot}${e.enh?'+'+e.enh:''}`).join(', ')||'없음');
  log(`[진단] 강화석 보유: ${Math.floor(S.stones||0)} · 리더 평균 강화: ${(worn.reduce((a,e)=>a+(e.enh||0),0)/(worn.length||1)).toFixed(1)}`);
  log(`[진단] 보유 영웅별 CP:`, ev('ownedHeroes')().map(h=>`${h.name.slice(0,5)}(${h.grade})=${ev('heroPower')(h)}`).join(' · '));
  log('[진단] 골드 보유:', Math.floor(S.gold));
  // E 아이템 첫 후보 왜 안 되는지 — recipeOk/gold 각각 출력
  const FS2=ev('FORGE_SLOTS');
  FS2.forEach(s2=>{ if(!s2.items||!s2.items.E) return;
    const it=s2.items.E[0]; const cp2=ev('craftParams')('E',s2.k,it.n);
    const lack=(it.recipe||[]).filter(r=>(S.mats[r.k]||0)<r.need).map(r=>`${r.k} ${S.mats[r.k]||0}/${r.need}`);
    log(`[E탐침] ${it.n}: recipeOk=${ev('recipeOk')(it.recipe)} goldOK=${S.gold>=cp2.gold} 부족=[${lack.join(', ')}]`);
  });
  const hist={}; S.equips.forEach(e=>hist[e.grade]=(hist[e.grade]||0)+1);
  log(`[진단] 제작 시도(등급):`, Object.entries(craftTally).map(([g,n])=>`${g}:${n}`).join(' ')||'0');
  log(`[진단] S.equips 등급 히스토그램:`, Object.entries(hist).map(([g,n])=>`${g}:${n}`).join(' ')||'빈');
}
{
  const S=ev('S');
  const gs=S.guideStep, CH=ev('GUIDE_CHAIN');
  let extra='';
  if(gs<CH.length){ const g=CH[gs], loc=ev('forgeLocate')(g.slot);
    if(loc){ const s2=ev('FORGE_SLOTS')[loc.slotIdx], it=(s2.items&&s2.items[loc.grade]||[])[loc.itemIdx];
      const lack=it?(it.recipe||[]).filter(r=>(S.mats[r.k]||0)<r.need).map(r=>r.k+' '+(S.mats[r.k]||0)+'/'+r.need):['아이템없음'];
      extra=` | 목표 ${g.slot}(${g.cat}) recipeOk=${it?ev('recipeOk')(it.recipe):'-'} 부족=[${lack.join(', ')}] gold=${Math.floor(S.gold)}`;
    } else extra=' | 목표 '+g.slot+' forgeLocate 실패';
  }
  log('[진단] guideStep', gs+'/'+CH.length, '| prog', S.guideProg, extra);
}
log('[킬률] 창(30분)당 킬 — 최근:', killLog.slice(-10).join(' '));
if(globalThis.__fuseLog){ const c={}; globalThis.__fuseLog.forEach(x=>c[x]=(c[x]||0)+1); log('[fuse로그]', JSON.stringify(c)); }
log('결론은 곡선을 보고 판단 — 공백이 길면 해당 구간의 재료/골드 곡선을 조정한다.');
