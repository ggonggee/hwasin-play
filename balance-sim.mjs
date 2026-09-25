/* 밸런스 장기 진행 시뮬레이터 — 실제 game.js 를 vm 위에서 구동해 진행 곡선을 측정한다.
   목적: "장시간 플레이하고 싶은 게임인가"를 감이 아니라 수치로 판정한다.

   설계 원칙 (★ 2026-09-12 v5.182):
   · 시뮬은 game.js 의 정본 함수만 쓴다 — heroPower(세트·각성 포함)·craftStart·onKill.
     공식을 다시 적는 순간 시뮬과 게임이 어긋난다(과거 밸런스 재시뮬 사고의 교훈, HANDOFF 6장).
   · 가상 플레이어 정책(합리적 플레이):
     ① 전투력이 권장치를 충족하는 가장 높은 사냥터에서 사냥
     ② 재료·골드가 되는 가장 좋은 등급·가장 비싼(좋은) 부위를 제작·장착
     ③ 강화 — v1 에서는 '안 한다'였으나 v5.229 부터 위험(+11~20)·극한(+21~25, v5.236)
        강화와 강화석 교환(v5.238)까지 시뮬 내 직접 측정한다(아래 riskEnhance·riskTally).
        이 줄이 종전 "미반영"으로 읽혀 미션이 해소됐는데도 남아있는 것처럼 오독시켰다(루프98 정정).
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
/* ★ v5.274: 캐주얼 시나리오 — 세 번째 인자 'casual'. 하루(48창) 중 첫 16창(8시간)만
   접속, 나머지 32창(16시간)은 오프라인(offlinePending 적립, 접속 재개 창에서 8h 상한
   정산). 실유저 '하루 8시간 접속' 근사 — 무한 축이 캐주얼에게도 작동하는지 검증. */
const CASUAL = process.argv.slice(3).some(a=>a==='casual');
/* ★ v5.282: 시드 파라미터화 — 'seed=N' 인자(위치 무관, casual 과 병용 가능).
   기본 42(기존 재현성·공식 곡선 수치 불변). 곡선 결론이 단일 시드 궤적에만 근거하는
   약점을 메우기 위한 시드 분산 측정(로버스트니스)용 — 3곳(vm Math.random·srand·
   Battle.setSeed)이 같은 N을 쓴다. seed=0 금지(xorshift가 0에 갇힘). */
const SEED = (()=>{ for(const a of process.argv.slice(3)){ const m=/^seed=(\d+)$/.exec(a||''); if(m){ const n=Number(m[1])>>>0; if(!n) throw new Error('seed=0 은 xorshift 붕괴 — 1 이상'); return n; } } return 42; })();
const ACTIVE_WINDOWS_PER_DAY = 16;
/* ★ 2026-09-25: 오프라인 상한 — 기본은 game.js 의 OFFLINE_CAP_H(단일 출처). 'offcap=N' 인자로 가정 실험(게임 코드 무수정). */
/* ★ 2026-09-25(워크플로 #25): 탑 도달 모델 실전투 보정 계수. 종전 공식은 리더 전투력과 1:1 로 맞서는 가정인데, 실제 탑 전투는
   몹 체력이 사냥터 등급에서 나오고 반격·자연회복·방패가 따로 돌아 **모든 측정점에서 실전투가 +4~+8 Wave 높았다**(검증 실측, 점마다 시드 3개).
   K 는 영웅 유형·전투력에 따라 1.7(근접)~2.9(원거리 고전투력)로 흔들린다 — 로스터 중앙값 2.2 를 쓴다(±1~2 Wave 오차 잔존).
   영향: 기록서·강화석 유입이 약 20% 과소 추정돼 있었다(기록서 경제 조정 전에 측정 기준부터 맞춘다). towercal=1 이면 종전 모델 재현. */
const TOWER_CAL = (()=>{ for(const a of process.argv.slice(3)){ const m=/^towercal=([\d.]+)$/.exec(a||''); if(m) return Number(m[1]); } return 2.2; })();
/* ★ 2026-09-25(워크플로 2차 #2 2단계): 투기장 순위 골드 버프 측정 — arena=N(주당 판 수, 기본 0 = 종전 기준선 그대로), arenawin=P(승률 상수, 기본 0.95 —
   arenawin=real 실측 92.5~93.8%(casual 150/600h·full 200h, 80~160판)에 가깝다. 상수 모드는 빠르고, real 은 정확하다).
   ⚠ v5.373 재판정: 위 92.5~93.8% 는 0×0 전장(K1 교정 전) 값이다. 교정 전장 실전투는 91.4%(256/280) → 기본값 0.95 → 0.92.
   상수 모드는 초반 팀이 약한 첫 주를 반영하지 못해 첫 주 효과를 과대평가한다 — 첫 주를 볼 때는 real 을 써라.
   이 버프(최대 +90%, 사냥·골드던전·탑·방치 골드에 곱)가 시뮬에 없어 곡선이 실제보다 낮게 그려질 수 있었다. 실제 전투를 돌리지 않는 근사(승률 상수). */
const ARENA_N = (()=>{ for(const a of process.argv.slice(3)){ const m=/^arena=(\d+)$/.exec(a||''); if(m) return Number(m[1]); } return 0; })();
const ARENA_WIN = (()=>{ for(const a of process.argv.slice(3)){ if(a==='arenawin=real') return -1; const m=/^arenawin=([\d.]+)$/.exec(a||''); if(m) return Number(m[1]); } return 0.92; })();
/* arenawin=real — 승률 상수 대신 **실제 투기장 전투**(arenaFight → 헤드리스 펌프 → arenaResult 정본)를 N판 돌린다.
   연승 보정(적 CP +8%/연승)·편성 4인·데미지 50% 감소가 전부 실물 그대로 들어간다. 느리다(판당 최대 60초 전투). */
const arenaTally={ weeks:0, rankSum:0, buffSum:0, fights:0, wins:0 };
/* ★ 2026-09-25(워크플로 2차 #3): orders=1 — 대장간 주문 정책 켜기(기본 꺼짐 = 기준선 불변). 정책은 dailyStep 끝. */
const ORDERS_ON = process.argv.slice(3).some(a=>a==='orders=1');
const ORDER_RES = (()=>{ for(const a of process.argv.slice(3)){ const m=/^orderres=(\d+)$/.exec(a||''); if(m) return Number(m[1])*1e6; } return 30e6; })();   // 주문 제작 골드 예약선(백만) — 기본 3천만(결정 가호·망치 1묶음 몫은 남긴다)
const orderTally={ unlockH:null, days:0, delivered:0, crafts:0, goldSpent:0, hammers:0, dice:0, gold:0 };
/* ★ 2026-09-25(워크플로 2차 #14): guild=1 — 길드 토벌(재의 골렘 단계제) 모델(기본 꺼짐 = 기준선 불변). 하루 2회 참전, 1회 피해 = GUILD_CAL×총전투력.
   GUILD_CAL 기본 0.17 = 실전투 스윕 중앙값(판당 0.14~0.29 흔들림 · 약탈 활성화 끔 기준 — 켜면 약 0.23~0.31). 풀·보상은 게임 정본 gbossApply 그대로.
   ⚠ v5.373 재판정: 0.17 은 0×0 전장(K1 교정 전) 값. 교정 전장에서 enterGuildRaid 실제 15초 전투로 잰 판당 피해/총CP 중앙값은 0.230~0.247(p10 0.163·p90 0.32~0.36) → 기본 0.23.
   (단계 표가 지수형이라 피해 ×1.4 여도 곡선은 약 +2단계 — 100일 48단계·기록서 +9 로 결론 동일.) */
const GUILD_ON = process.argv.slice(3).some(a=>a==='guild=1');
const GUILD_CAL = (()=>{ for(const a of process.argv.slice(3)){ const m=/^guildcal=([\d.]+)$/.exec(a||''); if(m) return Number(m[1]); } return 0.23; })();
const guildTally={ curve:[], kills:0, rec:0, coin:0, dice:0, cycKills:{} };
const OFFCAP_ARG = (()=>{ for(const a of process.argv.slice(3)){ const m=/^offcap=(\d+)$/.exec(a||''); if(m) return Number(m[1]); } return null; })();

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
/* ★ 4차 K1: 전장 크기 — 게임은 홈 진입·UI 배율 경로에서 Battle.resize() 를 부르는데 시뮬 vm 에선 안 불려 전장이 0×0 이었다(몹이 한 점에 겹침).
   안전 사냥터에선 영향이 작지만 권장보다 높은 사냥터는 결과가 완전히 달랐다(검증: 30분 전멸 65회 vs 브라우저 0회). 스텁 캔버스 453×548 로 잡는다. */
ev('Battle.resize()');
/* ★ v5.242: vm 전역 Math.random도 시드 고정 — Battle.setSeed는 전투 RNG(_battleRng)만
   고정하고, 게임이 직접 굴리는 Math.random(onKill 보상 드랍·제작 성공 p0·합성)은 진짜
   난수였다. 전투는 setSeed(42), 전역은 아래 xorshift(시드 42) — 서로 다른 스트림이지만
   둘 다 결정적이면 전체 시뮬도 결정적이다. 스모크(D1~D5)와는 별도 컨텍스트라 무관. */
ev(`globalThis.__g=${SEED}>>>0; Math.random=function(){ let r=globalThis.__g; r^=(r<<13)>>>0; r^=(r>>>17); r^=(r<<5)>>>0; r>>>=0; globalThis.__g=r; return r/4294967296; };`);

/* ---- 시뮬 유틸 ---- */
const log=(...a)=>console.log(...a);
/* ★ v5.242: 시뮬 로직용 시드 PRNG — 전투는 Battle.setSeed(42)로 결정적인데 시뮬 정책
   코드(위험강화·안전강화·합성 확률)가 vm 밖 진짜 Math.random을 굴려 실행마다 궤적이
   갈라졌다(재현성 실측: 400h CP 303,193 vs 296,486). xorshift32로 시뮬도 시드 고정.
   전투 스트림(setSeed)과는 별개 시퀀스 — 두 스트림 모두 결정적이면 전체도 결정적이다. */
let _s=SEED>>>0;
function srand(){ _s^=(_s<<13)>>>0; _s^=(_s>>>17); _s^=(_s<<5)>>>0; _s>>>=0; return _s/4294967296; }
/* ★ 2026-09-25(4차 발견 K1 — 측정 도구 결함): 종전엔 pump(1799.9) 를 한 번만 불렀는데 게임 pumpFrame 은 폭주 방지 가드(1만 스텝 = 500초)가 있어
   **창마다 500초만 전투하고 약 1,300초가 버려졌다**(v5.182 시뮬 도입 때부터). 창당 킬 ~700 은 실제 30분(~2,500, 브라우저 실측)의 28% 였고,
   그 위에서 잰 곡선·정체 판단의 시간축이 약 3.6배 늘어나 있었다. → 400초 조각으로 나눠 펌프한다(게임 가드는 그대로 둔다).
   ⚠ 창 길이·가드를 바꾸면 아래 잔여 검사가 즉시 실패한다 — 다시 잘리지 않게. */
function battleWindow(simSec){
  // 실전투 창: 고정 스텝(1/20s)으로 simSec 초 만큼 진행. 수입은 곧장 S 에 반영된다.
  const B=ev('Battle'), pump=B.pumpFrame;
  const steps=Math.round(simSec*20), total=steps/20*0.9999, n=Math.max(1, Math.ceil(total/400));
  for(let i=0;i<n;i++) pump(total/n);   // pumpFrame(총dt) — 내부에서 FIXED_DT 로 분할(호출당 가드 500초 미만으로)
  const r0=B.rngDrawCount(); pump(0);
  if(B.rngDrawCount()!==r0) throw new Error('battleWindow: 창 끝에 처리 못 한 전투 시간이 남았다 — 창이 잘림(pumpFrame 가드 확인)');
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
  const SP=ev('SET_PIECES'), S=ev('S'), leader=leaderId(), SETS=ev('SETS');
  /* ★ v5.298 정합(v5.300 루프 반영): 세트 배율 정보가 게임에 공개됐다(세트효과 도감
     단계별 ×N — 공략 카드 현재 배율 포함). 합리적 플레이어는 이제 '진행 중인 세트끼리
     비교할 때 배율이 높은 쪽을 우선 완성'한다. 정책: 착용 수(진행도)가 지배하고,
     진행 중인 세트(1조각 이상)에만 최고 단계 배율 기여(×N−1)를 가산한다.
     0조각 세트에 배율을 주지 않는 이유: 새 세트를 처음부터 만드는 비용은 재료가 지배
     — 실제 플레이어는 4조각 모은 세트를 버리고 최고 배율 세트를 0부터 만들지 않는다.
     배율 산식은 setDamageMul 단일 세트 계산과 동일(공격% × 방어[유효 체력] 환산). */
  let best=0;
  Object.entries(SP).forEach(([set,parts])=>{
    if(parts.indexOf(itemName)<0) return;
    const worn=S.equips.filter(e=>e.equipped&&(!e.heroId||e.heroId===leader)&&parts.indexOf(e.slot)>=0).length;
    let score=worn;
    if(worn>0){
      const st=SETS.find(s=>s.n===set);
      const t=st.tiers[st.tiers.length-1];
      const mul=(1+(t.dmg||0)/100) * (1/(1-Math.min(0.7,(t.def||0)/100)));
      score=worn+(mul-1);
    }
    best=Math.max(best,score);
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
  /* ★ 2026-09-25(#2 2단계): 투기장 — 주가 바뀌면 순위 초기화(ARENA_RANK_RESET) 후 N판. 순위 갱신식은 arenaResult 정본 그대로
     (승: round(순위×0.94)−ri(1,5)−연승 / 패: round(순위×1.03)+ri(1,4)). S.arenaWeek 를 현재 주차로 둬 게임의 주차 가드(arenaGoldBuffPct)를 그대로 탄다. */
  if(ARENA_N>0){
    const wk=ev('arenaWeekKey')();
    if(dailyStep._arenaWk!==wk && ARENA_WIN<0){ dailyStep._arenaWk=wk;
      ev('S.arenaWeek=arenaWeekKey(); S.arenaRank=ARENA_RANK_RESET; S.arenaStreak=0; S.stats.arenaEnters=(S.stats.arenaEnters|0)+1');
      const B=ev('Battle'), f0=arenaTally.fights, w00=arenaTally.wins;
      for(let i=0;i<ARENA_N;i++){
        const w0=ev('S.stats.arenaWins')|0; ev('arenaFight')();
        for(let g=0; g<40 && B.inDungeon(); g++) B.pumpFrame(5);   // 60초 + 서든데스 여유
        if(B.inDungeon()) break;
        arenaTally.fights++; if((ev('S.stats.arenaWins')|0)>w0) arenaTally.wins++;
      }
      ev("closeModal()");
      const rk=ev('S.arenaRank')|0;
      (arenaTally.log=arenaTally.log||[]).push(`${day}일 ${arenaTally.wins-w00}/${arenaTally.fights-f0}승 ${rk}위`);
      arenaTally.weeks++; arenaTally.rankSum+=rk; arenaTally.buffSum+=ev('arenaGoldBuffPct')(); acts+=('투기장'+rk+'위 ');
    }
    if(dailyStep._arenaWk!==wk){ dailyStep._arenaWk=wk;
      const rk=ev(`(()=>{ S.arenaWeek=arenaWeekKey(); S.arenaRank=ARENA_RANK_RESET; S.arenaStreak=0;
        for(let i=0;i<${ARENA_N};i++){ if(Math.random()<${ARENA_WIN}){ S.arenaStreak++; S.arenaRank=Math.max(1, Math.round(S.arenaRank*0.94)-ri(1,5)-S.arenaStreak); }
          else { S.arenaStreak=0; S.arenaRank=Math.min(999999, Math.round(S.arenaRank*1.03)+ri(1,4)); } }
        return S.arenaRank; })()`);
      arenaTally.weeks++; arenaTally.rankSum+=rk; arenaTally.buffSum+=ev('arenaGoldBuffPct')(); acts+=('투기장'+rk+'위 ');
    }
  }
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
  /* ★ v5.294: 잔불의 미궁 — 일 1회 위험 선택 던전(콘텐츠 확장-1). 클리어 판정은
     골드·요일던전과 같은 파티(kind:'mobs') 관례 foe ≤ CP×1.5, 그 안에서 최고 문.
     지급은 게임 reward 콜백과 동일하게 강화석 + raw 골드(addGold(g,true) — 가호·
     칭호 배제). dailyStep 자체가 일 1회라 별도 카운터 불필요(탑 관례와 동일). */
  {
    const em=ev('EMBER_MAZE');
    for(let i=em.length-1;i>=0;i--){
      if(em[i].foe<=cp*1.5){
        S.stones=(S.stones||0)+em[i].stones;
        ev('addGold')(em[i].gold, true);
        S.stats.emberBest=Math.max(S.stats.emberBest||0, i+1);
        acts+=('잔불미궁'+(i+1)+'문 ');
        break;
      }
    }
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
    const reach=Math.max(1, 1+Math.floor(Math.log(Math.max(1,ld*TOWER_CAL)/base)/Math.log(1.18)));   // ★ #25 실전투 보정(TOWER_CAL)
    if(ld>=600 && dailyStep._towerCh!==day){
      dailyStep._towerCh=day;
      S.stats.towerTries=(S.stats.towerTries||0)+1;   // ★ v5.262: 주간 의뢰 w4 축(게임 reward와 동일 시점)
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
     소환서가 아니라 탑 상자로 가므로 12단계까지만.
     ★ v5.305: 주사위 잔여 → 소환서 교환(GOLD_SHOP dice 라인 90개=3장) — 리롤 예산
     200개(L등급 전 부위 리롤 수회분)을 남기고 초과분을 교환. 리롤 자체는 시뮬 정책
     범위 밖이지만 예산 보존으로 '리롤할 플레이어'의 행동도 보존된다. */
  /* ★ 2026-09-25(워크플로 #12): 영웅 강화(전 등급 · 조각 300/단계 · 전투력 +1%/단계 · 최대 +20)가 조각의 세 번째 소비처가 됐다 —
     리더 강화가 +20 미만이면 소환서를 계속 산다(게임의 실제 이용자 선택과 곡선을 맞춘다). 강화 지출은 heroEnhStep. */
  while(S.gold>=16000000 && (ev('ownedHeroes')().length<9 || (S.awaken||0)<12)){ S.gold-=15000000; S.tickHero+=10; }
  /* 강화 목적 구매는 '여유 골드'에서만 창당 1팩 — 종전(잔액 16M 까지 전부)은 망치·결정 가호·기록서 구매를 밀어냈다(시뮬 실측).
     예약 120M = 결정 가호 문턱(61M)·망치 1묶음(40M)·소환서 1팩 위. */
  { const _lead=ev('party')()[0];
    if(_lead && ev('ownedHeroes')().length>=9 && (S.awaken||0)>=12 && ev('heroEnhLv')(_lead.hero_id)<ev('HERO_ENH_MAX') && S.gold>=135000000){ S.gold-=15000000; S.tickHero+=10; acts+='강화용 소환서 '; } }
  {
    const d0=S.dice||0;
    let ex=d0-200;
    if(ex>=90){ const n=Math.floor(ex/90); S.dice=d0-n*90; S.tickHero+=n*3; acts+=('주사위교환x'+n+' '); }
  }

  /* ★ v5.249: 주간 의뢰 수령 정책 — weeklyState()가 새 주(ISO 키)면 스냅샷·수령을
     리셋한다(FakeDate라 시뮬 시간 기준 동작). 진행 충족 의뢰를 일 1회 체크해 수령.
     ★ v5.297: 축제 의뢰(festivalQuest) 포함 — 테마별 축(kills/summons/crafts) 진행이
     스냅샷 base에 전부 있어 같은 루프로 처리된다. */
  {
    const w=ev('weeklyState')();
    ev('WEEKLY_QUESTS').concat([ev('festivalQuest')()]).forEach(q=>{
      if(w.claimed[q.id]) return;
      const st=ev('S').stats||{}, now=st[q.stat]||0, base=(w.base&&w.base[q.stat])||0;
      if(now-base>=q.goal){ w.claimed[q.id]=true; q.give(); acts+=q.id==='fest'?'축제의뢴 ':'주간의뢴 '; }
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
    /* ★ v5.300: 용광로 시련 — 월 1회 이벤트 보스전. 클리어 판정은 잔불·골드던전과 같은
       파티 관례 foe ≤ CP×1.5. 지급은 게임 reward 콜백과 동일(강화석+raw 골드).
       monthlyState 의 claimed 맵이 새 달에 자동 리셋 — 별도 카운터 불필요. */
    if(!m.claimed.forgeTrial){
      const ft=ev('FORGE_TRIAL');
      if(ft.foe<=cp*1.5){
        m.claimed.forgeTrial=true;
        S.stones=(S.stones||0)+ft.stones;
        ev('addGold')(ft.gold, true);
        acts+='용광로시련 ';
      }
    }
  }
  /* ★ 2026-09-25(워크플로 2차 #3): 대장간 주문 정책(orders=1 일 때만 — 기본 꺼짐 = 기준선 불변). 게임 정본(ordersState·orderCands·orderDeliver)을 그대로 탄다.
     정책: 해금 뒤 매일, 미완료 주문마다 재고가 모자라면 craftNow 로 제작 — 재료 충분·골드 예약선(orderres=백만, 기본 30) 위일 때만,
     칸당 시도 상한 = 기대 시도 수×2. 채워지면 납품. 시뮬 제작은 즉시 판정이라 모루 시간(E 1h·L 2h)은 반영하지 않는다(상한 추정). */
  if(ORDERS_ON){
    /* 시뮬은 튜토리얼을 돌지 않아 seenTutorial=false 로 남는다 — 해금 판정 순간만 켜고 되돌린다(다른 경로에 영향 없게). 해금(on=1) 뒤엔 이 플래그를 안 본다. */
    const _st0=S.seenTutorial; S.seenTutorial=true; let st; try{ st=ev('ordersState')(); } finally { S.seenTutorial=_st0; }
    if(st){ if(orderTally.unlockH===null) orderTally.unlockH=+(simSec/3600).toFixed(1); orderTally.days++;
      const FS=ev('FORGE_SLOTS');
      st.list.forEach((o,i)=>{ if(!o || o.done) return;
        const s2=FS.find(s=>s.k===o.cat), it=s2 && (s2.items[o.g]||[]).find(x=>x.n===o.n); if(!it) return;
        const cost=ev('craftParams')(o.g,o.cat,o.n).gold, maxTry=Math.ceil(o.qty/(o.g==='L'?0.4:0.8))*2;
        for(let t=0; t<maxTry && ev('orderCands')(o).length<o.qty; t++){
          if(S.craft || !ev('recipeOk')(it.recipe) || S.gold<cost+ORDER_RES) break;
          const g0=S.gold; if(!craftNow(o.g,o.cat,it)) break; orderTally.crafts++; orderTally.goldSpent+=g0-S.gold; }
        if(ev('orderReady')(o)){ const h0=S.hammers|0, d0=S.dice|0, gg=S.gold;
          if(ev('orderDeliver')(i)==='ok'){ orderTally.delivered++; orderTally.hammers+=(S.hammers|0)-h0; orderTally.dice+=(S.dice|0)-d0; orderTally.gold+=S.gold-gg; acts+='주문납품 '; } }
      });
    }
  }
  if(GUILD_ON){
    for(let k=0;k<2;k++){ const gc0=S.guildCoin||0, dc0=S.dice||0;
      const r=ev('gbossApply')(Math.round(GUILD_CAL*myCP()));
      guildTally.kills+=r.kills.length; guildTally.rec+=r.rec; guildTally.coin+=(S.guildCoin||0)-gc0; guildTally.dice+=(S.dice||0)-dc0;
      const cy=S.gboss.cyc; guildTally.cycKills[cy]=(guildTally.cycKills[cy]||0)+r.kills.length; if(r.kills.length) acts+=('토벌'+r.kills.length+' '); }
    guildTally.curve.push([day, S.gboss.stage, myCP()]);
  }
  return acts.trim();   // ★ v5.245: 일일 콘텐츠 수행 요약(액션 집계용)
}
/* ── +11~20 위험 강화의 엔드게임 기대값 — 몬테카를로(2026-09-12) → 시뮬 내 측정(v5.229) ──
   구 몬테카를로(부위당 479M)는 '실패마다 망치 소모'로 계산해 실제 규칙보다 비쌌다 —
   openEnhance 는 실패 중 파괴 분기(50%)에서만 망치를 소모한다.
   시뮬 실측(600h · 상시 보호 정책 · L장비 한정): 위험 강화 개시 약 166h(L 10부위 +10 직후) ·
   부위당 기대 시도 약 26회 · 망치 약 41개 → 약 3.2억 골드(10부위 ≈ 32억 ≈ 한 달 그라인드).
   ⚠ v5.373 재판정: 위 3.2억은 +20 미도달 부위까지 평균에 넣은 표본 편향. 교정 시뮬·해석해·몬테카를로 20만 회로
   +10→+20 부위당 평균 4.76억(시도 약 36.6회 · 전설 망치 81.5개 포함) · 10부위 약 47억. (교차: +25 완주 부위당 시도 50.4회 = 해석해 52.0)
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
/* ★ 2026-09-25(워크플로 #12): 영웅 강화 정책 — 로스터 완성·기본 각성 12 이후 남는 조각을 리더 → 파티 2·3번 순으로 +20 까지.
   정본 heroShardSpend(전용 조각 → 직업 공용 순 차감)·heroEnhLv 를 그대로 쓴다. 다음 R 재합성 대비 여유는 각성과 같은 200. */
const enhTally={ups:0};
/* ★ 2026-09-25(워크플로 2차 #4 ②): goldlv=P — 리더 골드 레벨업 정책(기본 0 = 꺼짐, 기준선 불변). 비용 lv×80,000(game.js heroDetail 레벨업 정본)이
   보유 골드의 P% 이하인 동안 레벨을 산다(창당 최대 200). 게임엔 이미 있는 수단인데 시뮬엔 모델이 없었다 — 노출(버튼 금색·점)을 키우기 전에
   곡선이 어떻게 바뀌는지부터 잰다(검증 권고 순서). 제작·장착 뒤에 돈다(제작이 코어 루프 — 남는 골드 정책). */
const GOLDLV_P = (()=>{ for(const a of process.argv.slice(3)){ const m=/^goldlv=([\d.]+)$/.exec(a||''); if(m) return Number(m[1]); } return 0; })();
const goldLvTally={ n:0, gold:0 };
function goldLvStep(){
  if(!(GOLDLV_P>0)) return 0;
  const S=ev('S'), id=leaderId(), st=S.heroes && S.heroes[id]; if(!st) return 0;
  let n=0; while(n<200){ const lv=st.level||1, c=lv*80000; if(c > S.gold*GOLDLV_P/100) break; S.gold-=c; st.level=lv+1; n++; goldLvTally.gold+=c; }
  if(n){ goldLvTally.n+=n; ev('Battle').refreshParty(); }
  return n;
}
function heroEnhStep(){
  const S=ev('S'); if(S.guideStep<ev('GUIDE_CHAIN').length) return 0;
  if(ev('ownedHeroes')().length<9 || (S.awaken||0)<12) return 0;
  const MAX=ev('HERO_ENH_MAX'); let ups=0;
  for(const h of ev('party')().slice(0,3)){
    let guard=0;
    while(ev('heroEnhLv')(h.hero_id)<MAX && ev('heroShardAvail')(h.hero_id)>=ev('heroEnhCost')(ev('heroEnhLv')(h.hero_id))+200 && guard++<40){
      if(!ev('heroShardSpend')(h.hero_id,ev('heroEnhCost')(ev('heroEnhLv')(h.hero_id)))) break;
      S.heroEnh=S.heroEnh||{}; S.heroEnh[h.hero_id]=ev('heroEnhLv')(h.hero_id)+1; ups++;
    }
  }
  enhTally.ups+=ups; return ups;
}
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
  /* ★ v5.297 도구 정확도 수정: 저확률 합성은 '원재료 포화(상한 90%)일 때만' — 재화 재활용.
     종전 정책은 R→E(0.8%)·E→L(0.08%)을 무조건 돌려 E 재료(대장장이의 눈물 등)가 30개를
     채우는 족족 태웠다. 600h 실측: 눈물 보유 0(E탐침 '부족=[눈물 0/20]' 상시) — 요일던전
     matGainGrade 균등 실체화(6000회 직접 검증: 6종 각 ~1000회)로 눈물도 수급되는데도 0이라는
     것은 수급이 아니라 소비(합성 소각)가 원인이었다는 증거.
     합리적 플레이어 판정: 재료 30개 → 성공 1개 기대값이 R→E 0.008개, E→L 0.0008개.
     평시(재료 부족 상태)엔 게임 UI가 확률을 보여주므로 이 손해를 회피한다. 단 원재료가
     보유 상한(2000/900)의 90%를 넘으면 초과분은 어차피 버려지는 재화 — 그때만 소각이
     이득(기회비용 0). 첫 수정본(N→R만 남김)의 실측에서 R 재료 전종 2000 포화 '댐'이
     생겨 상급재료 액션이 381→228창, 최장 공백 10.0→23.5h로 행동 다양성이 붕괴했다 —
     포화 재활용 분기를 함께 둬야 근사가 성립한다. 게임의 합성 확률(G-31 실측)은 불변. */
  const rateOf=g=>g==='R'?50:g==='E'?0.8:0.08;
  const MAT_CAP=ev('MAT_CAP');
  let did=0;
  for(const g of ['N','R','E']){
    const to=GORDER[GORDER.indexOf(g)+1];
    for(let i=0;i<6;i++){
      const m=MAT_BY_GRADE[g][i], src=m.k, dst=MAT_BY_GRADE[to][i].k;
      const cap=MAT_CAP[m.g]||Infinity, held=S.mats[src]||0;
      if(g!=='N' && held < cap*0.9) continue;         // 상위 합성은 포화 재활용일 때만
      let batches=Math.floor(held/30);
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
ev('Battle').setSeed(SEED);
const S0=ev('S');
S0.settings.sound=false;
let simSec=0;
const WINDOW=1800;                 // 30분(시뮬) 전투 창 — 수입률 측정·실제 킬
const events=[];                   // {t(시), cp, what}
const craftTally={};
const killLog=[];               // ★ v5.185 진단: 등급별 제작 시도 집계

events.push({t:0, cp:myCP(), what:'시작 — '+ev('party')()[0].name});

log(`\n[밸런스 시뮬] 시드 ${SEED}${CASUAL?' · 캐주얼':''} · 최대 ${MAX_HOURS}시뮬시간 · 창 ${WINDOW/60}분 · 탑 보정 ×${TOWER_CAL}\n`);
let lastCP=myCP(), lastEventT=0, windows=0;
let lastSetm=1;                    // ★ v5.228 세트 계측 — 창 사이 배율 변화 감지용
const gradeReached={};
/* ★ v5.244 재미 지표 — '재미'의 시뮬 근사: 액션 이벤트(제작·합성·강화·세트·각성 등
   플레이어가 무언가를 한 창)의 밀도와 최장 공백. CP 상승만 있는 창(방치 레벨링)은
   액션에서 제외한다 — 방치 수익과 능동 플레이를 구분해야 '썰렁한 구간'이 보인다.
   세트 변화도 액션으로 센다(장착 의사결정의 결과). 각성·결정은 did 에 텍스트가 붙는다. */
const funTimes=[]; let funGapNow=0, funGapMax=0, funGapAt=0;
/* ★ v5.287: 행동 종류 분포 — 재미 지표가 밀도·공백만 보던 사각: 액션이 한두 종류에
   몰리면(행동 단조) 총 밀도가 좋아도 지루하다. did 토큰을 체감 행동 종류로 분류해
   창 수를 센다. 한 창에서 여러 행동은 여러 번 센다(체감 그대로).
   ★ v5.304: '시련' 분리(8종) — 잔불(v5.294)·용광로(v5.300)·축제 의뢰(v5.297)가
   전부 '일일콘텐츠'에 묶여 콘텐츠 확장 시리즈의 재미 기여가 보이지 않았다. */
const funKinds={ '제작':0, '강화':0, '합성':0, '상급재료':0, '세트':0, '일일콘텐츠':0, '시련':0, '각성·결정':0 };
while(simSec < MAX_HOURS*3600 && windows<51200){   // ★ v5.257: 창 상한 51200(=25600h 측정 가능)
  // ① 사냥터 선택(합리적 플레이)
  const idx=pickHuntIdx();
  ev('S').huntTier=idx; ev('Battle').setHunt();
  const tier=ev('HUNT_TIERS')[idx];

  // 시뮬 시계를 현재 창 시각으로 — 게임의 모든 Date.now()/new Date()가 이 값을 본다(v5.242)
  SIM_NOW=simSec*1000;

  // ② 전투 창 — 캐주얼: 하루 16창만 접속. 비접속 창은 오프라인 적립 후 스킵.
  if(CASUAL && (windows % 48) >= ACTIVE_WINDOWS_PER_DAY){
    const Ss=ev('S');
    Ss.offlinePending=(Ss.offlinePending||0)+Math.floor(ev('OFFLINE_GPM')/60*WINDOW);
    simSec+=WINDOW; windows++;
    continue;
  }
  // ② 전투 창
  const goldBefore=ev('S').gold, killsBefore=ev('S').stats.kills;
  battleWindow(WINDOW);
  const killsNow=ev('S').stats.kills-killsBefore;    // ★ 진단: 창당 킬 수(전멸 루프 탐지)
  if(windows>200) killLog.push(`${(simSec/3600).toFixed(0)}h:${killsNow}`);
  simSec+=WINDOW; windows++;

  // ③ 일일 콘텐츠·소환서 구매 → 합성·소환 (의도 루프)
  /* 캐주얼: 접속 재개(하루 첫 활성 창)에서 오프라인 정산 수령 — settle 의 addGold 경로.
     8h 상한 적용(16h치 적립돼도 8h분만 — 정본 computeOffline 규칙). */
  if(CASUAL && (windows % 48)===1 && (windows>1)){
    const Sc=ev('S');
    const cap=Math.floor(ev('OFFLINE_GPM')/60*(OFFCAP_ARG!==null?OFFCAP_ARG:ev('OFFLINE_CAP_H'))*3600);   // offcap=0 도 유효한 실험값(|| 는 0 을 버린다)
    const give=Math.min(Sc.offlinePending||0, cap);
    if(give>0){ ev('addGold')(give); Sc.offlinePending=0; }
  }
  const dailyActs=dailyStep();   // ★ v5.245: 일일 루프(탑·던전)도 액션 이벤트로
  const buffActs=buffStep();         // ★ v5.247: 결정 가호(골드 버프) 구매
  const awakenUps=awakenStep();
  const enhUps=heroEnhStep();   // ★ #12 영웅 강화
  const fusedName=summonStep();
  const synthGot=synthStep();

  // ④ 제작·장착 (가능한 만큼)
  let did=((dailyActs||'')?dailyActs+' ':'') + ((buffActs||'')?buffActs+' ':'');   // ★ v5.245 일일 콘텐츠 + v5.247 결정 가호
  /* ★ v5.288: 각성·심화·결정 스텝이 did 에 안 붙어 있었다 — 위 주석("각성·결정은 did 에
     텍스트가 붙는다")과 코드가 어긋난 종전 결함. 각성 축의 창이 재미 밀도·종류 분포 모두에서
     누락돼 밀도가 과소 측정됐다(600h 기준 실측으로 아래 커밋 참조). */
  if(awakenUps>0) did+=`각성+${awakenUps} `;
  if(enhUps>0) did+=`영웅강화+${enhUps} `;
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
  { const gl=goldLvStep(); if(gl>0) did+=` 골드레벨+${gl}`; }   // #4 ② goldlv=P 일 때만
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
  if(did.trim()){ funTimes.push(+(simSec/3600).toFixed(2)); funGapNow=0;
    if(/제작/.test(did)) funKinds['제작']++;
    if(/강화|파괴/.test(did)) funKinds['강화']++;
    if(/영웅 합성/.test(did)) funKinds['합성']++;
    if(/상급재료/.test(did)) funKinds['상급재료']++;
    if(/세트/.test(did)) funKinds['세트']++;
    if(/탑|소탕|기록서|골드던전|요일던전/.test(did)) funKinds['일일콘텐츠']++;
    if(/잔불미궁|용광로시련|축제의뢴/.test(did)) funKinds['시련']++;   /* ★ v5.304 분리 */
    if(/각성|결정가호|✦/.test(did)) funKinds['각성·결정']++; }
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
  /* ★ v5.277: 구간 밀도에도 세그먼트 분모 병기 — 총평(v5.276)만 고치니 구간별
     판정(600~3200h 등)이 여전히 24h 분모 오탐을 냈다. 캐주얼은 구간 접속시간
     (h×16/48) 기준 '/접속일'을 괄호 안에 추가. */
  const per=()=> bins.map(([a,b])=>{ const n=funTimes.filter(t=>t>=a&&t<b).length;
      const h=Math.max(0,Math.min(b,totalH)-a);
      if(h<=0) return null;
      const day=(n/h*24).toFixed(1);
      const seg=CASUAL ? '='+(n/(h*(ACTIVE_WINDOWS_PER_DAY/48))*8).toFixed(1)+'/접속일' : '';
      return a+'~'+(b===Infinity?'+':b)+'h '+n+'회('+(n/h).toFixed(2)+'/h='+day+'/일'+seg+')';
    }).filter(Boolean).join(' · ');
/* ★ v5.276: 세그먼트별 분모 명시 — 캐주얼은 비접속 16h가 시계에 포함돼 /h·/일이
   구조적으로 낮다(4.1/일 오탐 사례). 캐주얼 모드에선 '/접속일'(접속 시간 8h 기준)을
   병기해 감시 규칙(5/일) 판정을 세그먼트에 맞게 적용한다. */
{
  const perDay=(funTimes.length/Math.max(1,totalH))*24;
  const activeH=totalH*(ACTIVE_WINDOWS_PER_DAY/48);   // 총 접속 시간(h)
  const perActiveDay=CASUAL ? (funTimes.length/Math.max(1,activeH)*8) : null;   // 8h 접속일 환산
  const segNote = CASUAL
    ? ' · 캐주얼: '+perActiveDay.toFixed(1)+'/접속일(접속 8h 기준 — 감시 규칙은 이 값으로 판정)'
    : '';
  log('[재미 지표] 액션 이벤트 '+funTimes.length+'회 · 평균 '+(funTimes.length/Math.max(1,totalH)).toFixed(2)+'회/h(='+perDay.toFixed(1)+'/일)'+segNote+' · 최장 공백 '+(funGapMax/3600).toFixed(1)+'h(@'+funGapAt+'h) — /h는 24h 연속 가정, 체감은 세그먼트별 분모 기준');
}
  log('[재미 지표] 구간 밀도 — '+per());
  /* ★ v5.287: 종류 분포 리포트 — 상위 종류의 점유율이 지배적(예: 90%+)이면 행동
     단조 신호(밀도 지표만으로는 보이지 않던 재미 결함). 종류 수 자체도 함께. */
  const kinds=Object.entries(funKinds).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
  const ksum=kinds.reduce((a,[,n])=>a+n,0)||1;
  log('[재미 지표] 행동 종류 분포 — '+kinds.map(([k,n])=>`${k} ${n}창(${Math.round(n/ksum*100)}%)`).join(' · ')+` · ${kinds.length}/8종`);
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
  /* ★ v5.285: 세이브 용량 진단 — 시뮬은 localStorage 스텁이라 무제한이지만 실물은 5MB
     상한이다. 시뮬 정책에 '분해'가 없어 equips 는 실물보다 크게(비관) 자란다 — 이 값이
     안정적이면 실물 장기 이용자의 세이브 실패(_saveFailFlag) 위험도 안정이라는 뜻.
     무한 증가 상태 배열(로그는 DOM 전용, 재료는 고정 키)이 없음을 전제로 추이 감시. */
  log(`[진단] 세이브 직렬화 ${(JSON.stringify(S).length/1024).toFixed(1)}KB (실물 상한 5MB · equips ${S.equips.length}점 · 비관측: 분해 정책 없음)`);
  /* ★ v5.229: 위험 강화 축 집계 — 시도/성공/하락/보호/파괴와 망치 구매 골드.
     부위당 기대 비용은 hammerGold/파괴 재제작까지 합쳐 실측된다(종전 몬테카를로 479M 갱신). */
  log(`[진단] 위험강화: 시도 ${riskTally.tries} · 성공 ${riskTally.success} · 하락 ${riskTally.drop} · 보호 ${riskTally.saved} · 파괴 ${riskTally.destroyed} · +25도달 ${riskTally.max20}부위 · 망치구매 골드 ${(riskTally.hammerGold/1e6).toFixed(0)}M + 강화석 ${riskTally.hammerStone}개`);
  log(`[진단] 보유 영웅별 CP:`, ev('ownedHeroes')().map(h=>`${h.name.slice(0,5)}(${h.grade})=${ev('heroPower')(h)}`).join(' · '));
  if(arenaTally.log) log('[진단] 투기장 주별(실전투): '+arenaTally.log.join(' · '));
  if(GOLDLV_P>0) log(`[진단] 골드 레벨업(#4 ②, P=${GOLDLV_P}%): ${goldLvTally.n}회 · 골드 ${(goldLvTally.gold/1e6).toFixed(0)}M · 리더 Lv ${(ev('S').heroes[leaderId()]||{}).level||1}`);
  if(GUILD_ON){ const cv=guildTally.curve, pick=d=>{ const x=cv.filter(c=>c[0]<=d).pop(); return x?`${d}일 ${x[1]}단계(CP ${Math.round(x[2]/1000)}k)`:''; };
    const ck=Object.values(guildTally.cycKills), z=ck.filter(n=>n===0).length, one=ck.filter(n=>n===1).length, many=ck.filter(n=>n>1).length;
    log(`[진단] 길드 토벌(#14, cal ${GUILD_CAL}): ${[3,7,14,30,60,100].map(pick).filter(Boolean).join(' · ')} · 처치 ${guildTally.kills} · 주기 ${ck.length}개(0처치 ${z}·1처치 ${one}·2+처치 ${many}) · 기록서 +${guildTally.rec} · 길드코인 +${guildTally.coin} · 주사위 +${guildTally.dice}`); }
  if(ORDERS_ON) log(`[진단] 대장간 주문(#3): 해금 ${orderTally.unlockH===null?'없음':orderTally.unlockH+'h'} · ${orderTally.days}일 · 납품 ${orderTally.delivered}건 · 주문 제작 ${orderTally.crafts}회(골드 ${(orderTally.goldSpent/1e6).toFixed(0)}M) · 전설 망치 +${orderTally.hammers} · 주사위 +${orderTally.dice} · 골드 +${(orderTally.gold/1e6).toFixed(0)}M`);
  if(ARENA_N>0) log(`[진단] 투기장(#2 측정): 주당 ${ARENA_N}판·승률 ${ARENA_WIN<0?`실전투 ${arenaTally.wins}/${arenaTally.fights}=${arenaTally.fights?(arenaTally.wins/arenaTally.fights*100).toFixed(1):0}%`:ARENA_WIN} · ${arenaTally.weeks}주 평균 순위 ${arenaTally.weeks?Math.round(arenaTally.rankSum/arenaTally.weeks):0}위 · 평균 버프 +${arenaTally.weeks?Math.round(arenaTally.buffSum/arenaTally.weeks):0}%`);
  log(`[진단] 영웅 강화(#12): 총 ${enhTally.ups}단계 ·`, ev('ownedHeroes')().map(h=>`${h.name.slice(0,5)}+${ev('heroEnhLv')(h.hero_id)}`).join(' · '));
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
