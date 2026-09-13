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
/* ★ v5.242: 시뮬 시계 — vm에 진짜 Date를 주입하면 게임의 Date.now()/new Date()가
   실행 시각을 보고 재현성이 깨졌다(같은 시드 400h 두 번 실행 CP 279,351 vs 294,327).
   Date 인터페이스를 상속해 now()/생성자만 시뮬 시간(SIM_NOW, 창마다 simSec×1000)을
   보게 한다 — getDay() 등 파생 메서드는 생성 시각 기준으로 자동 정합. */
let SIM_NOW=0;
const FakeDate=class extends Date{
  constructor(...a){ if(a.length) super(...a); else super(SIM_NOW); }
  static now(){ return SIM_NOW; }
};
const windowStub={
  document:documentStub, localStorage:localStorageStub,
  addEventListener(t,f){(documentStub._ev=documentStub._ev||{})[t]=f;}, removeEventListener(){},
  requestAnimationFrame(){return 0;}, cancelAnimationFrame(){},
  setTimeout(){return 0;}, clearTimeout(){}, setInterval(){return 0;}, clearInterval(){},
  performance:{now:()=>SIM_NOW},
  Image:class{ set src(v){} },
  navigator:{userAgent:'sim'},
  matchMedia(){return {matches:false,addEventListener(){}};},
  console,
  Date:FakeDate,
  /* ★ v5.242: Math는 진짜 객체 대신 복사본(프로토타입 공유) — 아래 부트 후 Math.random을
     시드 PRNG로 교체할 때 Node 전역 Math가 오염되지 않게 shadowing한다. */
  Math:Object.create(Math), JSON,
};
windowStub.window=windowStub; windowStub.globalThis=windowStub; windowStub.self=windowStub;
const ctx=vm.createContext(windowStub);
vm.runInContext(js+'\n;globalThis.__ev=(src)=>eval(src);\n', ctx, {filename:'game.js'});
const ev=s=>ctx.__ev(s);
documentStub._ev.DOMContentLoaded();          // 부트 (빈 저장소 → 신규 세이브)
/* ★ v5.242: vm 전역 Math.random도 시드 고정 — Battle.setSeed는 전투 RNG(_battleRng)만
   고정하고, 게임이 직접 굴리는 Math.random(onKill 보상 드랍·제작 성공 p0·합성)은 진짜
   난수였다. 전투는 setSeed(42), 전역은 아래 xorshift(시드 42) — 서로 다른 스트림이지만
   둘 다 결정적이면 전체 시뮬도 결정적이다. 스모크(D1~D5)와는 별도 컨텍스트라 무관. */
ev("globalThis.__g=42>>>0; Math.random=function(){ let r=globalThis.__g; r^=(r<<13)>>>0; r^=(r>>>17); r^=(r<<5)>>>0; r>>>=0; globalThis.__g=r; return r/4294967296; };");

/* ---- 시뮬 유틸 ---- */
const log=(...a)=>console.log(...a);
/* ★ v5.242: 시뮬 로직용 시드 PRNG — 전투는 Battle.setSeed(42)로 결정적인데 시뮬 정책
   코드(위험강화·안전강화·합성 확률)가 vm 밖 진짜 Math.random을 굴려 실행마다 궤적이
   갈라졌다(재현성 실측: 400h CP 303,193 vs 296,486). xorshift32로 시뮬도 시드 고정.
   전투 스트림(setSeed)과는 별개 시퀀스 — 두 스트림 모두 결정적이면 전체도 결정적이다. */
let _s=42>>>0;
function srand(){ _s^=(_s<<13)>>>0; _s^=(_s>>>17); _s^=(_s<<5)>>>0; _s>>>=0; return _s/4294967296; }
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
  const FS=ev('FORGE_SLOTS'), S=ev('S'), skey=ev('slotKeyOf'), leader=leaderId();
  const order={L:3,E:2,R:1,N:0};
  const wornGrade={};
  /* ★ v5.228: 부위 판정을 slotKeyOf(페이퍼돌 10슬롯 정본)로 — 종전 slotSchema().part 는
     투구·상의·하의를 '방어구' 하나로 묶어 후보 산출 자체가 틀어져 있었다. */
  S.equips.forEach(e=>{ if(e.equipped&&(!e.heroId||e.heroId===leader)){
    const pt=skey(e.slot); wornGrade[pt]=Math.max(wornGrade[pt]||-1, order[e.grade]); }});
  const out=[];
  FS.forEach(s2=>{ if(!s2.items) return;
    for(const g of ['L','E','R','N']){
      (s2.items[g]||[]).forEach(it=>{
        if(it.n.indexOf('물약')>=0) return;
        if(S.equips.filter(x=>x.slot===it.n).length>=99) return;
        const pt=skey(it.n);
        if((wornGrade[pt]??-1)>=order[g]) return;               // 이미 같거야 높은 등급 착용
        out.push({grade:g, cat:s2.k, item:it, part:pt,
                  cost:ev('craftParams')(g,s2.k,it.n).gold,
                  recOK:ev('recipeOk')(it.recipe)});
      });
    }});
  return out;
}
/* 저축형 구매: 재료가 되는 후보 중 '살 수 있는 최고 등급'을 산다. 없으면 null(저축). */
/* ★ v5.228 세트 지향 tie-break: 같은 부위·같은 등급 후보가 여러 세트에 걸쳐 있으면
   (예: L 투구 = 결정 투구[주술] vs 성좌 투구[강철맹세]) 리더가 이미 입은 그 세트 조각 수가
   많은 쪽을 고른다. 실제 플레이어도 '어차피 바꿀 부위면 세트 맞춰서' 고른다.
   그리디(가격순)는 600h 내내 세트가 3조각에 머물러 setm ×1.000 — 실측으로 확인했다.
   세트 완성 = 6set ×1.3~1.86 는 곡선 전체를 바꾸는 큰 축이므로 정책에 반영해야 실제와 같다. */
function setAffinity(itemName){
  const SP=ev('SET_PIECES'), S=ev('S'), leader=leaderId();
  let best=0;
  Object.entries(SP).forEach(([set,parts])=>{
    if(parts.indexOf(itemName)<0) return;
    const worn=S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===leader)&&parts.indexOf(e.slot)>=0).length;
    best=Math.max(best,worn);
  });
  return best;
}
function bestCraftable(){
  const S=ev('S'), order={L:3,E:2,R:1,N:0};
  const can=upgradeCandidates().filter(u=>u.recOK&&S.gold>=u.cost)
    .sort((a,b)=> order[b.grade]-order[a.grade] || setAffinity(b.item.n)-setAffinity(a.item.n) || a.cost-b.cost);
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
  const ups=upgradeCandidates().sort((a,b)=> order[b.grade]-order[a.grade] || setAffinity(b.item.n)-setAffinity(a.item.n) || a.cost-b.cost);
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
  /* ★ v5.228: 게임 본체(itemDetail onYes)와 동일하게 slotKeyOf 부위 기준 교체. */
  const skey=ev('slotKeyOf');
  const part=skey(item.slot);
  const S=ev('S');
  S.equips=S.equips.filter(x=>{
    if(x===item) return true;
    if(x.equipped && (!x.heroId||x.heroId===heroId) && skey(x.slot)===part) return false;
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
  const cp=myCP(); let acts='';   // ★ v5.245: 일일 콘텐츠 수행을 액션 이벤트로 반환
  // 골드던전 — 오늘 3회, foeCP ≤ 내 CP 인 최고 단계
  let left=3;
  for(let i=ev('GOLD_DUNGEON').length-1;i>=0&&left>0;i--){
    const d=ev('GOLD_DUNGEON')[i];
    if(d.foe<=cp*1.5 && ev('matAvail')(d.mat)>=d.need){
      const n=Math.min(left, Math.floor(ev('matAvail')(d.mat)/d.need));
      ev('matSpend')(d.mat, d.need*n); ev('addGold')(d.gold*n); left-=n; acts+=('골드던전x'+n+' ');
    }
  }
  // 요일던전 — 오늘 5회, 3단계(영웅 재료) 가능하면 최대한
  /* ★ v5.242: 요일 인덱스를 실제 실행 요일(new Date)에서 시뮬 시간 기반으로 교체 —
     종전엔 월요일에 돌면 월요일 던전만 400h 내내 돌고 화요일엔 다른 던전이 돌아
     같은 시드(42)도 실행 요일마다 전체 궤적이 갈라졌다(실측: 400h CP 281,355 vs
     288,211). 재현성은 전후 비교의 신뢰 기반이라 시뮬 시간 24h마다 요일이 순환하도록
     고정한다 — 게임 규칙(매일 다른 재료)도 더 충실하게 재현된다. */
  const DD_RQ=ev('DD_RQ'); const ti=Math.floor(simSec/86400)%7;
  let dl=5;
  for(const st of [3,2,1]){
    const rg=['N','R','E'][st-1], qty=Math.max(1,Math.round(DD_RQ[ti]/3*st));
    const foe=[800,2200,5200][st-1];
    if(foe<=cp*1.5&&dl>0){ const n=Math.min(dl,5); for(let k=0;k<n;k++) ev('matGainGrade')(rg,qty); dl=0; acts+='요일던전 '; }
  }
  /* 시련의 탑 (v5.230 정본 공식 통합) — 도전(일 1회)·소탕(일 1회)·상자→기록서 교환.
     · 도전: 시작 baseCP = 600+최고기록×450, 웨이브당 ×1.18 지수 상승(Battle 2814),
       몹 HP = foeCP×0.08. 도달 = 1+floor(ln(리더전투력/base)/ln1.18) — 1:1 전투력
       클리어 기준(시뮬 관례: 골드던전 cp×1.5, 탑은 리더 단독[soloSurvival]라 1.0).
       보상: 골드 도달×40만 · 강화석 도달×3 · 상자 max(1,floor(도달/2)).
     · 소탕: 최고기록 기준 50% — 상자 max(1,floor(최고/4)).
     · 교환: 상자 8개 = 기록서 1권(towerExchange 정본). 심화 각성(awakenStep)로 이어진다.
     ★ 일일 횟수는 dailyStep 로컬 카운터로 센다 — 게임의 dailyUse/rollDaily 는 '실제 날짜'
       변경 시 리셋되는데 시뮬은 몇 초 만에 여러 시뮬-일을 지나므로 dailyUse 를 쓰면
     시뮬 전체에서 1회만 실행된다(골드던전이 로컬 left=3 을 쓰는 것과 같은 이유).
     입장권(40초 자동 충전·상한 30)은 일 1회 소비에 사실상 무제한이라 생략. */
  {
    const ld=ev('heroPower')(ev('party')()[0]);
    const best=S._tower||0, base=600+best*450;
    const reach=Math.max(1, 1+Math.floor(Math.log(Math.max(1,ld)/base)/Math.log(1.18)));
    if(ld>=600 && dailyStep._towerCh!==day){
      dailyStep._towerCh=day;
      ev('addGold')(reach*400000); S.stones=(S.stones||0)+reach*3;
      S.towerBox=(S.towerBox||0)+Math.max(1,Math.floor(reach/2));
      S._tower=Math.max(best, reach); acts+=('탑'+reach+'F ');
    }
    if(best>=1 && dailyStep._towerSw!==day){
      dailyStep._towerSw=day;
      ev('addGold')(Math.floor(best*400000*0.5));
      S.stones=(S.stones||0)+Math.floor(best*3*0.5);
      S.towerBox=(S.towerBox||0)+Math.max(1,Math.floor(best/4)); acts+='소탕 ';
    }
    const ex=Math.floor((S.towerBox||0)/8);
    if(ex>0){ S.towerBox-=ex*8; S.records=(S.records||0)+ex; acts+=('기록서x'+ex+' '); }
  }
  // 소환서 구매 — 골드 여유(16M+)면 10장 팩 (E제작 800k 예산은 항상 확보)
  /* ★ v5.230: 로스터 완성(9/9) 후에도 '각성<12'면 계속 산다 — 조각의 소비처는 합성뿐이
     아니라 기본 각성(단계당 250×1.08^n개)이고, 12단계까지 총 약 4,700개가 필요하다.
     9/9에서 끊으면 각성이 조각 기아에 걸린다(실측: 600h 각성 +0). 심화(기록서)는
     소환서가 아니라 탑 상자로 가므로 12단계까지만. */
  while(S.gold>=16000000 && (ev('ownedHeroes')().length<9 || (S.awaken||0)<12)){ S.gold-=15000000; S.tickHero+=10; }

  /* ★ v5.249: 주간 의뢰 수령 정책 — weeklyState()가 새 주(ISO 키)면 스냅샷·수령을
     리셋한다(FakeDate라 시뮬 시간 기준 동작). 진행 충족 의뢰를 일 1회 체크해 수령. */
  {
    const w=ev('weeklyState')();
    ev('WEEKLY_QUESTS').forEach(q=>{
      if(w.claimed[q.id]) return;
      const st=ev('S').stats||{}, now=st[q.stat]||0, base=(w.base&&w.base[q.stat])||0;
      if(now-base>=q.goal){ w.claimed[q.id]=true; q.give(); acts+='주간의뢴 '; }
    });
  }
  /* ★ v5.256: 월간 의뢰 수령 — 주간(v5.249)과 동일 패턴. */
  {
    const m=ev('monthlyState')();
    ev('MONTHLY_QUESTS').forEach(q=>{
      if(m.claimed[q.id]) return;
      const st=ev('S').stats||{}, now=st[q.stat]||0, base=(m.base&&m.base[q.stat])||0;
      if(now-base>=q.goal){ m.claimed[q.id]=true; q.give(); acts+='월간의뢴 '; }
    });
  }
  return acts.trim();   // ★ v5.245: 일일 콘텐츠 수행 요약(액션 집계용)
}
/* ── +11~20 위험 강화의 엔드게임 기대값 — 몬테카를로(2026-09-12) → 시뮬 내 측정(v5.229) ──
   구 몬테카를로(부위당 479M)는 '실패마다 망치 소모'로 계산해 실제 규칙보다 비쌌다 —
   openEnhance 는 실패 중 파괴 분기(50%)에서만 망치를 소모한다.
   시뮬 실측(600h · 상시 보호 정책 · L장비 한정): 위험 강화 개시 약 166h(L 10부위 +10 직후) ·
   부위당 기대 시도 약 26회 · 망치 약 41개 → 약 3.2억 골드(10부위 ≈ 32억 ≈ 한 달 그라인드).
   파괴는 상시 보호 정책 기준 0건. CP 기여: 부위 배율 2.2(+10) → 3.4(+20). */
/* ── +11~20 위험 강화 — 시뮬 내 직접 측정 (v5.229, 남은 과제 '강화 축 시뮬 반영') ──
   종전(2026-09-12)엔 몬테카를로 2만 회 별도 산출(부위당 479M)로 시뮬 밖 처리였다.
   v5.228로 세트가 풀리고 부위 9→10개·소득 곡선이 바뀌어 그 수치가 낡았다 — 이제
   정책을 시뮬 안에 넣고 실곡선 위에서 측정한다.
   정책(합리적 플레이어): 리더 착용 전 부위가 +10 이상일 때, 가장 낮은 부위부터
   +11+ 도전. 파괴 보호 망치는 상점 정본가(전설 40M/10개·일반 15M/10개)로 10개씩
   구매해 상시 보호 — 보호 없는 도전은 게임 UI(v5.222 기대 손실 표시)도 비추천한다.
   규칙은 openEnhance 그대로: 성공률 +11~14 63% · +15~19 44%, 실패 시 (현 단계 ≥ +11이면)
   50% 파괴[망치 prot.n개 소모로 방지 가능] / 나머지 50% 단계 -1(와드 없음 정책).
   파괴되면 다음 창의 upgradeCandidates가 같은 부위를 재제작(안전 강화 → 재도전) —
   실제 플레이어가 겪는 나선을 그대로 재현한다. */
const riskTally={tries:0,success:0,drop:0,saved:0,destroyed:0,hammerGold:0,hammerStone:0,max20:0};
function riskEnhanceStep(){
  const S=ev('S'), leader=leaderId(), PC=ev('PROTECT_COST');
  const worn=S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===leader));
  if(!worn.length) return {ups:0,ev:''};
  const minEnh=Math.min(...worn.map(e=>e.enh||0));
  if(minEnh<10) return {ups:0,ev:''};                 // 안전 구간이 남았으면 위험 도전 안 한다
  /* 제작 업그레이드가 남아 있으면 장비부터 — 강화는 그 다음(합리적 플레이어 순서). */
  if(upgradeCandidates().some(u=>u.recOK)) return {ups:0,ev:''};
  const tgt=worn.slice().sort((a,b)=>(a.enh||0)-(b.enh||0))[0];
  /* ★ v5.236: +21~25 극한 구간(성공 30% · 골드 2천만 · 상한 +25) 동기화 —
     openEnhance와 같은 공식. +20 소진 이후 골드 싱크가 사라지던 800h+ 공백 대응. */
  if((tgt.enh||0)>=25) return {ups:0,ev:''};
  /* ★ L등급 장비에만 도전 — 하위 등급(N/E) +11+은 L 전환 시 같은 부위가 파괴되는
     매몰비용이다(실측: 72h에 E장비 +11~13 → L 교체로 전부 소멸). 합리적 플레이어는
     최상위 등급에만 위험 투자를 한다. */
  if(tgt.grade!=='L') return {ups:0,ev:''};
  let ups=0, evDesc='';
  let guard=0;
  while((tgt.enh||0)<25 && guard++<40 && S.equips.includes(tgt)){
    const enh=tgt.enh, grade=tgt.grade;
    const p = enh<5?0.95:enh<10?0.82:enh<15?0.63:enh<20?0.44:0.30;
    const cost=[50000,300000,1500000,6000000,20000000][Math.min(4,Math.floor(enh/5))];
    const stoneCost=enh>=20 ? 20 : 1+Math.floor(enh/5);   // v5.238: 극한 강화석 20개(과잉 싱크)
    const prot=PC[grade]||PC.N;
    const have = prot.cur==='hammerN'?(S.hammerN||0):(S.hammers||0);
    const risky = enh>=11 && enh<20;                  // 파괴 가능 구간 (openEnhance 실측). +21~25 극한은 실패해도 유지(v5.236)
    if(risky && have<prot.n){
      const price = prot.cur==='hammerN'?15000000:40000000;   // 상점 X10 묶음 정본가
      const stonePrice = prot.cur==='hammerN'?150:500;        // v5.238 강화석 교환가
      /* ★ v5.238: 골드가 부족하면 강화석 교환으로 구매(정책) — 강화석은 200+α 여유를
         남긴다(극한 시도 20/회 예약). 과잉 강화석의 싱크이자 골드 병목 완화. */
      if(S.gold >= 16000000+price+cost){
        S.gold-=price; riskTally.hammerGold+=price;
        if(prot.cur==='hammerN') S.hammerN=(S.hammerN||0)+10; else S.hammers=(S.hammers||0)+10;
      } else if((S.stones||0) >= stonePrice+200){
        S.stones-=stonePrice; riskTally.hammerStone+=stonePrice;
        if(prot.cur==='hammerN') S.hammerN=(S.hammerN||0)+10; else S.hammers=(S.hammers||0)+10;
      } else break;                                          // 골드·강화석 둘 다 부족
    } else if(S.gold < 16000000+cost) break;
    if((S.stones||0)<stoneCost) break;
    S.gold-=cost; S.stones-=stoneCost; riskTally.tries++;
    if(srand()<p){ tgt.enh++; ups++; riskTally.success++;
      if(tgt.enh===25) riskTally.max20++;
    }
    else if(risky && srand()<0.5){
      const have2 = prot.cur==='hammerN'?(S.hammerN||0):(S.hammers||0);
      if(have2>=prot.n){
        if(prot.cur==='hammerN') S.hammerN-=prot.n; else S.hammers-=prot.n;
        riskTally.saved++;                            // 보호 소모 — 단계 유지
      } else { S.equips=S.equips.filter(x=>x!==tgt); riskTally.destroyed++; evDesc='파괴'; break; }
    }
    else if(risky){ tgt.enh=Math.max(0,tgt.enh-1); riskTally.drop++; }
    /* 극한(+21~25) 실패 — 단계 유지(재화만 소모) */
  }
  return {ups,ev:evDesc};
}
/* 안전 강화 — 리더 착용 전 부위(v5.228부터 10부위)를 +10까지(p≥0.82 구간, 파괴 위험 0,
   실패 시 -1은 재시도 비용). 골드는 소환서 저축분(16M) 위의 여유만 써서 스크롤 케이던스를
   해치지 않게 한다. 성공률·비용은 게임의 실제 표(openEnhance)와 동일한 값 — 강화의 CP 반영은
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
      if(srand() < (it.enh<5?0.95:0.82)){ it.enh++; ups++; }
      else it.enh=Math.max(0,it.enh-1);
    }
  }
  return ups;
}
/* ★ v5.247: 결정 가호 정책 — 여유 골드(소환서 16M+망치 40M+기록서 첫권 30M+버프 5M
   = 91M 위)가 있고 버프가 꺼져 있으면 1시간 골드 +50% 버프 구매. 효과는 addGold 관문에
   자동 반영된다(전투·일일 수입 전부). 액션 밀드+골드 싱크 측정이 목적. */
const buffTally={n:0,gold:0};
function buffStep(){
  const S=ev('S');
  const now=simSec*1000;
  if(S.buffs && S.buffs.goldPactUntil>now) return '';
  if(S.gold < 61000000) return '';   // v5.247 조건 완화: 소환서 16M+망치 40M 예산 위(기록서는 버프 이득으로 충당)
  S.gold-=5000000; buffTally.n++; buffTally.gold+=5000000;
  S.buffs=S.buffs||{}; S.buffs.goldPactUntil=now+3600000;
  return '결정가호';
}
/* 각성 정책 — 조각(직업 공용)이 여유일 때(전 영웅 보유 후 남는 조각) 기본 12단계까지.
   ★ v5.230: 심화 각성(13~30) 통합 — 기록서는 탑 상자 교환(dailyStep)으로 수급하고
   비용은 정본 공식 1+floor((lv-12)/2) (13~14:1권 · 15~16:2권 … 30단계까지 총 90권).
   heroPower의 aw=1+lv×0.015가 곡선에 자동 반영된다.
   ★ v5.240: 기록서 골드 구매(3천만/권) 정책 추가 — awakenTally.gold에 지출 누적. */
const awakenTally={gold:0};
function awakenStep(){
  const S=ev('S');  if(S.guideStep<ev('GUIDE_CHAIN').length) return 0;
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
  while(S.awaken>=12 && S.awaken<50 && steps<40){   // 심화 — 기록서 축 (v5.236 상한 50)
    const cost=1+Math.floor((S.awaken-12)/2);
    if((S.records||0)<cost){
      /* ★ v5.240: 기록서 골드 구매 라인(상점 정본가 3천만/권) — 극한 완주 후 골드가
         쌓이기만 하는 싱크 고갈 대응. 망치 1묶음(4천만)·소환서 예산(16M)은 항상 확보. */
      const price=30000000;
      if(S.gold >= 16000000 + 40000000 + cost*price){
        S.gold-=cost*price; awakenTally.gold+=cost*price;
        S.records=(S.records||0)+cost;
      } else break;
    }
    S.records-=cost; S.awaken++; steps++;
  }
  /* ★ v5.241: 각성의 결정 — 50 완료 후 무한 축. ★ v5.243: 복합 비용(기록서 20+5×단계권
     + 강화석 100+15×단계개) — 강화석 유입(탑 소탕 실측 공식)이 소모의 2배 이상이라
     무한 축이 흡수하도록 했다. 골드 라인(3천만/권)은 기록서에만 적용. */
  if(S.awaken>=50){
    let csteps=0;
    while(csteps<20){
      const cCost=20+5*(S.awakenCrystal||0), cStones=300+40*(S.awakenCrystal||0);
      if((S.records||0)>=cCost && (S.stones||0)>=cStones){
        S.records-=cCost; S.stones-=cStones; S.awakenCrystal=(S.awakenCrystal||0)+1; csteps++; continue;
      }
      if((S.records||0)<cCost){
        /* ★ v5.251: 기록서 분할 구매(권 단위) — 종전 '비용 전액' 조건(✦24=40.5억)이
           골드를 캡(50억) 근처까지 쌓이게 하고도 결정을 멈추게 했다(12800h 실측 40.8억
           적체). 망치 1묶음(40M)+소환서(16M) 예산 위 여유에서 1권씩(3천만) 산다 —
           실사용자의 분할 구매와 같고, 창이 지나면 이어서 산다. */
        const price=30000000;
        let need=cCost-(S.records||0);
        while(need>0 && S.gold >= 16000000 + 40000000 + price){
          S.gold-=price; awakenTally.gold+=price; S.records=(S.records||0)+1; need--;
        }
        if(need>0) break;
      } else break;   // 강화석 부족 — 싱크가 유입을 따라잡은 지점
    }
    steps+=csteps;
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
      for(let b=0;b<batches;b++){ if(srand()*100<rateOf(to)) ok++; }
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
let lastSetm=1;                    // ★ v5.228 세트 계측 — 창 사이 배율 변화 감지용
const gradeReached={};
/* ★ v5.244 재미 지표 — '재미'의 시뮬 근사: 액션 이벤트(제작·합성·강화·세트·각성 등
   플레이어가 무언가를 한 창)의 밀도와 최장 공백. CP 상승만 있는 창(방치 레벨링)은
   액션에서 제외한다 — 방치 수익과 능동 플레이를 구분해야 '썰렁한 구간'이 보인다.
   세트 변화도 액션으로 센다(장착 의사결정의 결과). 각성·결정은 did 에 텍스트가 붙는다. */
const funTimes=[]; let funGapNow=0, funGapMax=0, funGapAt=0;
while(simSec < MAX_HOURS*3600 && windows<51200){   // ★ v5.257: 창 상한 51200(=25600h 측정 가능)
  // ① 사냥터 선택(합리적 플레이)
  const idx=pickHuntIdx();
  ev('S').huntTier=idx; ev('Battle').setHunt();
  const tier=ev('HUNT_TIERS')[idx];

  // 시뮬 시계를 현재 창 시각으로 — 게임의 모든 Date.now()/new Date()가 이 값을 본다(v5.242)
  SIM_NOW=simSec*1000;

  // ② 전투 창
  const goldBefore=ev('S').gold, killsBefore=ev('S').stats.kills;
  battleWindow(WINDOW);
  const killsNow=ev('S').stats.kills-killsBefore;    // ★ 진단: 창당 킬 수(전멸 루프 탐지)
  if(windows>200) killLog.push(`${(simSec/3600).toFixed(0)}h:${killsNow}`);
  simSec+=WINDOW; windows++;

  // ③ 일일 콘텐츠·소환서 구매 → 합성·소환 (의도 루프)
  const dailyActs=dailyStep();   // ★ v5.245: 일일 루프(탑·던전)도 액션 이벤트로
  const buffActs=buffStep();         // ★ v5.247: 결정 가호(골드 버프) 구매
  const awakenUps=awakenStep();
  const fusedName=summonStep();
  const synthGot=synthStep();

  // ④ 제작·장착 (가능한 만큼)
  let did=((dailyActs||'')?dailyActs+' ':'') + ((buffActs||'')?buffActs+' ':'');   // ★ v5.245 일일 콘텐츠 + v5.247 결정 가호
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
  /* ★ v5.229: 위험 강화(+11~20) — 안전 강화가 끝난 뒤에만 도전한다(정책 상세는 함수 주석). */
  const rk=riskEnhanceStep();
  if(rk.ups>0) did+=` 위험강화+${rk.ups}`;
  if(rk.ev==='파괴') did+=' ⚠파괴';

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

  /* ★ 세트 효과 계측 (v5.228): heroPower 의 setm(=setDamageMul)이 정본 공식에 이미 들어
     있지만 시뮬이 그리디 제작(부위별 최고 등급)이라 세트가 '자연 형성'되는지 실측한 적이
     없었다. 배율이 변할 때마다 이벤트로 남긴다 — 세트 통합 곡선의 근거 데이터. */
  {
    const setm=ev('setDamageMul')();
    if(Math.abs(setm-lastSetm)>1e-9){
      const act=ev('activeSets')().filter(x=>x.c>=3).map(x=>`${x.n} ${x.c}`).join(', ')||'없음';
      events.push({t:+(simSec/3600).toFixed(2), cp, what:`세트 ×${setm.toFixed(3)} (${act})`});
      lastSetm=setm;
      did+=' 세트';   // v5.244: 세트 변화도 액션 이벤트로 집계
    }
  }
  /* ★ v5.244 재미 집계 — did 가 비어 있으면 '액션 없는 창'. 최장 공백은 어느 시점에서
     생기는지(funGapAt)까지 남긴다 — 썰렁한 구간의 정체를 다음 개선의 표적으로 삼는다. */
  if(did.trim()){ funTimes.push(+(simSec/3600).toFixed(2)); funGapNow=0; }
  else { funGapNow+=WINDOW; if(funGapNow>funGapMax){ funGapMax=funGapNow; funGapAt=+(simSec/3600).toFixed(1); } }

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

/* ★ v5.244 재미 지표 리포트 — 액션 이벤트(제작·합성·강화·세트·각성 창)의 밀도와 최장
   공백. 구간 밀도가 급감하는 구간이 '썰렁한 구간' — 다음 재미 개선의 데이터 표적. */
{
  const totalH=simSec/3600;
  const bins=[[0,50],[50,200],[200,600],[600,3200],[3200,12800],[12800,Infinity]];   // ★ v5.261: 25600h 측정용
  const per=()=> bins.map(([a,b])=>{ const n=funTimes.filter(t=>t>=a&&t<b).length;
      const h=Math.max(0,Math.min(b,totalH)-a); return h>0? a+'~'+(b===Infinity?'+':b)+'h '+n+'회('+(n/h).toFixed(2)+'/h='+(n/h*24).toFixed(1)+'/일)':null; }).filter(Boolean).join(' · ');
log('[재미 지표] 액션 이벤트 '+funTimes.length+'회 · 평균 '+(funTimes.length/Math.max(1,totalH)).toFixed(2)+'회/h(='+((funTimes.length/Math.max(1,totalH))*24).toFixed(1)+'/일) · 최장 공백 '+(funGapMax/3600).toFixed(1)+'h(@'+funGapAt+'h) — /h는 24h 연속 가정, 체감은 /일(접속 세션당 몰아하기) 기준으로 볼 것');
  log('[재미 지표] 구간 밀도 — '+per());
}const GORDER=['N','R','E','L'];
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
  log(`[진단] 각성 +${S.awaken}${(S.awakenCrystal||0)>0?` · 결정 ✦${S.awakenCrystal}`:''}${awakenTally.gold>0?` (골드 구매 ${(awakenTally.gold/1e6).toFixed(0)}M)`:''} · 리더 ${ld.name}(grade ${ld.grade} · Lv${ld.level}) · 보유 영웅 ${ev('ownedHeroes')().length}/9 · 조각`,
    Object.entries(S.shards).map(([k,v])=>`${k}:${Math.floor(v)}`).join(' '));
  /* ★ v5.230: 심화 각성 축 상태 — 탑 기록·상자·기록서. */
  log(`[진단] 탑 최고 ${S._tower||0}Wave · 상자 ${S.towerBox||0}개 · 기록서 ${S.records||0}권 (심화 각성 재화)`);
  const worn=S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===ld.hero_id));
  log(`[진단] 리더 장착 ${worn.length}부위 ·`, worn.map(e=>`${e.grade}${e.slot}${e.enh?'+'+e.enh:''}`).join(', ')||'없음');
  /* ★ v5.228: 세트 최종 상태 — 그리디 제작 정책에서 세트가 실제로 완성됐는지.
     부위별 최고 등급만 입는 정책은 등급 전환기에 세트를 깨뜨린다(혼합 착용). */
  log(`[진단] 세트 배율 ×${ev('setDamageMul')().toFixed(3)} · 활성(3+)`,
    ev('activeSets')().filter(x=>x.c>=3).map(x=>`${x.n} ${x.c}세트`).join(', ')||'없음');
  log(`[진단] 강화석 보유: ${Math.floor(S.stones||0)} · 리더 평균 강화: ${(worn.reduce((a,e)=>a+(e.enh||0),0)/(worn.length||1)).toFixed(1)}`);
  /* ★ v5.229: 위험 강화 축 집계 — 시도/성공/하락/보호/파괴와 망치 구매 골드.
     부위당 기대 비용은 hammerGold/파괴 재제작까지 합쳐 실측된다(종전 몬테카를로 479M 갱신). */
  log(`[진단] 위험강화: 시도 ${riskTally.tries} · 성공 ${riskTally.success} · 하락 ${riskTally.drop} · 보호 ${riskTally.saved} · 파괴 ${riskTally.destroyed} · +25도달 ${riskTally.max20}부위 · 망치구매 골드 ${(riskTally.hammerGold/1e6).toFixed(0)}M + 강화석 ${riskTally.hammerStone}개`);
  log(`[진단] 보유 영웅별 CP:`, ev('ownedHeroes')().map(h=>`${h.name.slice(0,5)}(${h.grade})=${ev('heroPower')(h)}`).join(' · '));
  log('[진단] 결정 가호: '+buffTally.n+'회('+(buffTally.gold/1e6).toFixed(0)+'M) · 골드 보유 '+Math.floor(S.gold));
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
