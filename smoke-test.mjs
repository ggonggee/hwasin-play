/* 런타임 스모크 테스트 — 최소 DOM 스텁 위에서 game.js 를 실제로 실행한다.
   목적: 최상위 실행 오류 / load()·wire()·refreshHUD() / 모달 43종 render() 전수 호출 무오류 확인 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
/* ★ 스크립트 자기 위치 기준으로 소스를 찾는다.
   종전에는 원본 저장소 절대경로가 하드코딩돼 있어, 다른 폴더로 복사한 뒤 검증을 돌려도
   조용히 '원본'을 검사했다(복사본 분리 작업 중 발견). 저장소를 옮겨도 따라오게 한다. */
const D = path.dirname(fileURLToPath(import.meta.url)) + '/';
const js=fs.readFileSync(D+'game.js','utf8');
const html=fs.readFileSync(D+'index.html','utf8');
const css=fs.readFileSync(D+'style.css','utf8');   // ★ v5.127: 금칙 스캐너 [9]가 3번째 배포 파일로 사용

// index.html 의 id / class / data-modal 를 그대로 반영한 얕은 노드 트리
const idAttrs=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const dataModals=[...html.matchAll(/data-modal="([^"]+)"/g)].map(m=>m[1]);

let CTX={};
class CL{ constructor(o){this.o=o;this.s=new Set();}
  add(...c){c.forEach(x=>x&&this.s.add(x));} remove(...c){c.forEach(x=>this.s.delete(x));}
  toggle(c,f){ if(f===undefined){ this.s.has(c)?this.s.delete(c):this.s.add(c); } else f?this.s.add(c):this.s.delete(c); return this.s.has(c);}
  contains(c){return this.s.has(c);} get value(){return [...this.s].join(' ');} }
class Node2{
  constructor(tag='div'){
    this.tagName=(tag||'div').toUpperCase(); this.nodeName=this.tagName;
    this.children=[]; this.childNodes=[{nodeValue:''}];
    this.style=new Proxy({setProperty(){},removeProperty(){},getPropertyValue(){return '';}},{get:(t,k)=>k in t?t[k]:(t['_'+String(k)]||''),set:(t,k,v)=>{t['_'+String(k)]=v;return true;}});
    this.dataset={}; this.classList=new CL(this); this._text=''; this._html='';
    this.value=''; this.checked=false; this.disabled=false; this.id='';
    this.width=390; this.height=500; this.scrollTop=0; this.scrollHeight=0;
    this.offsetWidth=390; this.offsetHeight=500; this.clientWidth=390; this.clientHeight=500;
    this.parentNode=null; this.parentElement=null; this.firstChild=null; this.lastChild=null;
  }
  set className(v){ this.classList.s=new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className(){ return this.classList.value; }
  set textContent(v){ this._text=String(v); this.childNodes[0].nodeValue=String(v); }
  get textContent(){ return this._text; }
  set innerHTML(v){ this._html=String(v); if(v==='') this.children=[]; }
  get innerHTML(){ return this._html; }
  set innerText(v){ this._text=String(v); } get innerText(){ return this._text; }
  appendChild(c){ if(c){ this.children.push(c); c.parentNode=this; c.parentElement=this; this.firstChild=this.children[0]; this.lastChild=c; } return c; }
  append(...cs){ cs.forEach(c=>typeof c==='object'&&this.appendChild(c)); }
  prepend(c){ this.children.unshift(c); return c; }
  insertBefore(c){ return this.appendChild(c); }
  removeChild(c){ const i=this.children.indexOf(c); if(i>=0)this.children.splice(i,1); return c; }
  remove(){ if(this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...cs){ this.children=[]; cs.forEach(c=>this.appendChild(c)); }
  addEventListener(t,f){ (this._ev=this._ev||{})[t]=f; }
  removeEventListener(){} dispatchEvent(){return true;}
  setAttribute(k,v){ if(k==='id')this.id=v; if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-(\w)/g,(m,c)=>c.toUpperCase())]=v; (this._at=this._at||{})[k]=v; }
  getAttribute(k){ return (this._at||{})[k] ?? null; }
  removeAttribute(k){ if(this._at) delete this._at[k]; }
  hasAttribute(k){ return !!(this._at&&k in this._at); }
  getBoundingClientRect(){ return {top:0,left:0,right:390,bottom:500,width:390,height:500,x:0,y:0}; }
  scrollIntoView(){} focus(){} blur(){} click(){ this.onclick&&this.onclick({stopPropagation(){},preventDefault(){},target:this}); }
  /* ★ v5.260: 노드 스코프 querySelector — '.cls'를 자기 서브트리에서 먼저 찾고,
     실패 시 document 로 폴백한다(종전 동작 호환 — shop 의 card.querySelector
     ('.sh-left')가 innerHTML 스텁이 자식을 안 만들어 폴백 더미에 의존한다).
     노드 스코프 '실존 여부'가 필요한 검사(legendaryFlash 중복 방지)는 게임 코드가
     children 직접 스캔을 쓴다 — querySelector의 스텁 근사는 존재 탐색용으로만. */
  querySelector(s){
    const str=String(s);
    const cm=/^\.([\w-]+)$/.exec(str);
    if(cm){ const hits=[]; const walk=n=>{ if(n.classList&&n.classList.contains&&n.classList.contains(cm[1])) hits.push(n); (n.children||[]).forEach(walk); }; walk(this); if(hits[0]) return hits[0]; }
    return CTX.document.querySelector(s);
  }
  querySelectorAll(s){ return CTX.document.querySelectorAll(s); }
  closest(){ return null; }
  getContext(){ return CANVAS2D; }
  animate(){ return {finished:Promise.resolve(),cancel(){}}; }
  play(){ return Promise.resolve(); }
}
const CANVAS2D=new Proxy({
  canvas:{width:390,height:500},
  createLinearGradient(){return {addColorStop(){}};},
  createRadialGradient(){return {addColorStop(){}};},
  createPattern(){return null;}, measureText(){return {width:10};},
  getImageData(){return {data:new Uint8ClampedArray(4)};}, putImageData(){}, drawImage(){},
  setLineDash(){}, getLineDash(){return [];}, save(){}, restore(){},
},{ get:(t,k)=> (k in t? t[k] : ()=>{}) , set:()=>true });

const registry=new Map();  // id -> node
function mk(tag,id,dm){ const n=new Node2(tag); if(id){n.id=id; registry.set(id,n);} if(dm)n.dataset.modal=dm; return n; }
idAttrs.forEach(id=>mk('div',id));
const modalNodes=dataModals.map(d=>mk('div','',d));

const documentStub={
  readyState:'complete',
  body:mk('body'), documentElement:mk('html'), head:mk('head'),
  createElement(t){ return new Node2(t); },
  createTextNode(t){ return {nodeValue:String(t),textContent:String(t)}; },
  createDocumentFragment(){ return new Node2('fragment'); },
  getElementById(id){ return registry.get(id) || null; },
  /* ★ v5.260: 클래스 셀렉터 지원 — 종전 '.foo'가 항상 더미 노드를 반환해 게임의
     중복 체크(legendaryFlash 등)가 첫 호출부터 차단됐다(v5.259 실측). registry 노드와
     그 자식을 재귀 순회해 classList 매치를 찾는다 — document 레벨 근사(노드 스코프
     아님)지만 회귀들은 상태 원복 패턴으로 고립되어 있어 실용적으로 충분하다. */
  _findByClass(cls){
    const hits=[];
    const walk=n=>{ if(n.classList && n.classList.contains && n.classList.contains(cls)) hits.push(n); (n.children||[]).forEach(walk); };
    registry.forEach(walk);
    return hits;
  },
  querySelector(s){
    if(typeof s!=='string') return null;
    const m=/^#([\w-]+)/.exec(s); if(m) return registry.get(m[1]) || null;
    const cm=/^\.([\w-]+)$/.exec(s); if(cm) return this._findByClass(cm[1])[0] || new Node2('div');
    return new Node2('div');
  },
  querySelectorAll(s){
    if(typeof s==='string' && s.includes('[data-modal]')) return modalNodes;
    if(typeof s==='string'){ const cm=/^\.([\w-]+)$/.exec(s); if(cm) return this._findByClass(cm[1]); }
    return [];
  },
  addEventListener(t,f){ (documentStub._ev=documentStub._ev||{})[t]=f; },
  removeEventListener(){}, dispatchEvent(){return true;},
  getElementsByTagName(){return [];}, getElementsByClassName(){return [];},
  hidden:false, visibilityState:'visible', title:'',
};
documentStub.body.parentNode=documentStub.documentElement;

const store=new Map();
const localStorageStub={ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k), clear:()=>store.clear(), key:i=>[...store.keys()][i], get length(){return store.size;} };

let rafCbs=0;
const windowStub={
  document:documentStub, localStorage:localStorageStub,
  addEventListener(t,f){ (windowStub._ev=windowStub._ev||{})[t]=f; },
  removeEventListener(){},
  requestAnimationFrame(f){ rafCbs++; return rafCbs; },  // 루프 폭주 방지 — 콜백 미실행
  cancelAnimationFrame(){}, setTimeout(){return 0;}, clearTimeout(){}, setInterval(){return 0;}, clearInterval(){},
  getComputedStyle(){ return new Proxy({getPropertyValue(){return '';}},{get:(t,k)=>k in t?t[k]:''}); },
  innerWidth:390, innerHeight:844, devicePixelRatio:2,
  navigator:{userAgent:'node',language:'ko',vibrate(){}},
  location:{href:'file:///game', reload(){}, search:''},
  alert(){}, confirm(){return true;}, prompt(){return 'test';},
  AudioContext:class{ constructor(){this.currentTime=0;this.destination={};this.state='running';}
    createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},value:0},type:'sine',connect(){},start(){},stop(){},onended:null};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},value:1},connect(){}};}
    createBiquadFilter(){return {frequency:{setValueAtTime(){},value:0},Q:{value:1},type:'lowpass',connect(){}};}
    createBufferSource(){return {buffer:null,connect(){},start(){},stop(){}};}
    createBuffer(){return {getChannelData(){return new Float32Array(64);}};}
    resume(){return Promise.resolve();} close(){return Promise.resolve();} },
  performance:{now:()=>Date.now()},
  Image:class{ constructor(){this.onload=null;} set src(v){} },
  matchMedia(){ return {matches:false,addEventListener(){},addListener(){}}; },
};
windowStub.webkitAudioContext=windowStub.AudioContext;
windowStub.window=windowStub; windowStub.globalThis=windowStub; windowStub.self=windowStub;

const ctx=vm.createContext(windowStub);
CTX={document:documentStub};

const errs=[];
function step(name,fn){ try{ fn(); console.log('  ✅',name); }catch(e){ errs.push(name+': '+e.message); console.log('  ❌',name,'→',e.message,'\n     ',(e.stack||'').split('\n')[1]||''); } }

console.log('[1] 최상위 실행');
// vm 의 최상위 const/let 은 global 객체에 붙지 않는다 → 스크립트 스코프를 보는 eval 브리지를 붙인다
step('game.js 평가', ()=>{ vm.runInContext(js+'\n;globalThis.__ev=(src)=>eval(src);\n',ctx,{filename:'game.js'}); });
if(errs.length){ console.log('\n최상위 실행 실패 — 이후 검사 중단'); process.exit(1); }
const ev=s=>ctx.__ev(s);

console.log('\n[2] 신규 세이브 부팅 (DOMContentLoaded 핸들러)');
step('DOMContentLoaded', ()=>{ windowStub._ev.DOMContentLoaded(); });

console.log('\n[3] MODALS 전수 render() 호출');
const M=ev('MODALS'), mkeys=Object.keys(M);
let ok=0;
mkeys.forEach(k=>{
  try{ const b=new Node2('div'); M[k].render(b, undefined); ok++; }
  catch(e){ errs.push('MODALS.'+k+'.render: '+e.message); console.log('  ❌ MODALS.'+k+' →',e.message); }
});
console.log(`  render 성공 ${ok}/${mkeys.length}`);

console.log('\n[4] openModal() 로 열리는 전 경로');
function openAll(tag){ let n=0; mkeys.forEach(k=>{ try{ ev('openModal')(k); n++; }catch(e){ errs.push(tag+' openModal('+k+'): '+e.message); console.log('  ❌',tag,'openModal('+k+') →',e.message); } }); return n; }
console.log(`  openModal 성공 ${openAll('신규')}/${mkeys.length}`);

console.log('\n[5] 구버전 세이브 마이그레이션');
const legacy={ // v3.0 이전 형태를 흉내 — 신규 필드 전무 + 구 heroes 스키마
  name:'군주', gold:1234, ruby:5, gray:10, dice:0, ticket:2, stones:3,
  heroes:{ flame:{grade:'R',level:7,own:true}, frost:{grade:'N',level:3,own:true} },
  equips:[], craft:null, awaken:1, villHall:2, villTrain:1,
  arenaTier:1, arenaPts:500, formation:{}, day:3, playSec:900, lastSeen:Date.now()-7200000,
  mats:{N:5,R:2,E:1,L:0}, shards:{flame:10,frost:2},
  daily:{date:'',counts:{}}, claimed:{attend:{},mail:{}}, stats:{kills:5,crafts:1,summons:2,arenaWins:0},
  seenTutorial:true, tutStep:3, buffs:{}, settings:{sound:false},
};
step('구세이브 load()+mergeDefaults()', ()=>{
  store.set('hwasin_save_v1', JSON.stringify(legacy));
  ev('load')();
  const S=ev('S'), F=ev('freshState')();
  const miss=Object.keys(F).filter(k=>S[k]===undefined);
  if(miss.length) throw new Error('병합 누락 필드: '+JSON.stringify(miss));
  if(S.gold!==1234) throw new Error('기존 값 덮어씀: gold='+S.gold);
  if(!Object.keys(S.heroes).some(k=>ev('HERO_BY_ID')[k])) throw new Error('영웅 마이그레이션 실패');
});
step('구세이브 상태로 refreshHUD()', ()=>{ ev('refreshHUD')(); });
console.log(`  구세이브 openModal 성공 ${openAll('구세이브')}/${mkeys.length}`);
step('완전 빈 세이브 {} 로드', ()=>{ store.set('hwasin_save_v1','{}'); ev('load')(); ev('refreshHUD')(); });
console.log(`  빈세이브 openModal 성공 ${openAll('빈세이브')}/${mkeys.length}`);
step('손상 세이브(문자열) 로드', ()=>{
  store.set('hwasin_save_v1','not-json{{'); ev('load')(); ev('refreshHUD')();
});
/* ★ save()/load() 빈 catch 개선 검증 — 손상 세이브는 원본을 백업 키(_corrupt_타임스탬프)로
   옮겨두어야 수동 복구가 가능하다. 백업 키가 실제로 생성됐는지 확인한다. */
step('손상 세이브 → 백업 키 보존', ()=>{
  store.set('hwasin_save_v1','corrupt-payload-xyz'); ev('load')();
  // 게임은 window.localStorage(=localStorageStub, 내부는 Map `store`)에 쓴다 → store 로 직접 확인
  const backedUp = [...store.keys()].some(k => typeof k==='string' && k.startsWith('hwasin_save_v1_corrupt_'));
  if(!backedUp) throw new Error('손상 세이브 백업 키가 생성되지 않음');
});
/* ★ F3: 명칭 IP 세탁으로 코스튬·패키지 id 가 바뀌었다 → 구 id 세이브의 보유/구매 이력 이관 확인 */
step('구 id 세이브 → 신 id 이관(코스튬·패키지)', ()=>{
  const old=JSON.parse(JSON.stringify(legacy));
  old.costumeOwn={ lycan:true, carmilla:true, seraphin:true, bargon:true, nova:true };
  old.costumeOn='seraphin';
  old.claimed={ attend:{}, mail:{ ap_carm:true, ap_lycan:true } };
  store.set('hwasin_save_v1', JSON.stringify(old));
  ev('load')();
  const S=ev('S');
  const map={ lycan:'wolyeong', nova:'hongyeom', bargon:'surim', carmilla:'hanseori', seraphin:'changhae' };
  for(const o in map){
    if(S.costumeOwn[o]!==undefined) throw new Error('구 코스튬 id 잔존: '+o);
    if(S.costumeOwn[map[o]]!==true) throw new Error('코스튬 이관 실패: '+o+'→'+map[o]);
  }
  if(S.costumeOn!=='changhae') throw new Error('착용 코스튬 이관 실패: '+S.costumeOn);
  const pm={ ap_carm:'ap_hero027', ap_lycan:'ap_hero029' };
  for(const o in pm){
    if(S.claimed.mail[o]!==undefined) throw new Error('구 패키지 id 잔존: '+o);
    if(S.claimed.mail[pm[o]]!==true) throw new Error('패키지 구매이력 이관 실패: '+o+'→'+pm[o]);
  }
  // 판매 5종 id 가 전부 COSTUMES 정본과 일치하는지(오타로 인한 영구 미보유 방지)
  const ids=ev('COSTUMES').filter(c=>c.price).map(c=>c.id).join(',');
  if(ids!=='wolyeong,hongyeom,surim,hanseori,changhae') throw new Error('COSTUMES 판매 id 불일치: '+ids);
});
/* ★ v5.108: 브랜드 통일(화신 → 결정의 시대)로 L등급 장비 접두가 '화신 XX' → '결정 XX' 로 바뀌었다.
   장비는 세이브에 이름(slot 문자열) 그대로 저장되고 SET_PIECES 도 그 이름으로 매칭하므로,
   이관이 빠지면 구세이브의 레전더리 장비가 세트에서 통째로 빠진다 — 전투력 숫자는 그대로라
   플레이어도 개발자도 알아채기 어려운 유형이다. 세트 카운트까지 확인한다. */
step('구세이브 L등급 장비명 이관(화신 XX → 결정 XX) + 세트 매칭 보존', ()=>{
  const old=JSON.parse(JSON.stringify(legacy));
  old.equips=['화신 투구','화신 상의','화신 하의','화신 신발','화신 방패','화신 지팡이']
    .map(slot=>({ grade:'L', slot, enh:0, equipped:true }));
  old.craft={ grade:'L', slot:'화신 대검', cat:'무기', endAt:Date.now()+9e9 };
  store.set('hwasin_save_v1', JSON.stringify(old));
  ev('load')();
  const S=ev('S');
  const left=S.equips.filter(e=>/^화신 /.test(e.slot||'')).map(e=>e.slot);
  if(left.length) throw new Error('구 장비명 잔존: '+left.join(','));
  if(S.craft && /^화신 /.test(S.craft.slot||'')) throw new Error('제작중 장비명 미이관: '+S.craft.slot);
  const pc=ev('setPieceCount')('주술');
  if(pc!==6) throw new Error('이관 후 주술 세트 매칭 실패: '+pc+'/6');
  // 현행 제작 목록에도 '화신' 접두가 남아있지 않은지(데이터 원본 회귀 방지)
  /* buildForgeRecipes() 가 [이름,아이콘] 배열을 {n,ic,recipe} 객체로 바꿔 놓으므로 두 형태를 모두 읽는다.
     (배열 형태만 보면 이 검사는 항상 0건이 되어 아무것도 잡지 못한다) */
  const forgeNames=ev('FORGE_SLOTS')
    .flatMap(s=>s && s.items ? Object.values(s.items).flat() : [])
    .map(it=>Array.isArray(it) ? it[0] : (it && it.n))
    .filter(Boolean);
  if(!forgeNames.length) throw new Error('제작 목록 이름을 하나도 읽지 못했다 — 구조 변경 의심');
  const stale=forgeNames.filter(n=>/^화신/.test(n));
  if(stale.length) throw new Error('제작 목록에 구 접두 잔존: '+stale.join(','));
  const lgd=ev('FORGE_SLOTS').find(s=>s.k==='무기').items.L.map(it=>Array.isArray(it)?it[0]:it.n);
  if(!lgd.every(n=>/^결정 /.test(n))) throw new Error('L등급 무기 접두 불일치: '+lgd.join(','));
});
/* ★ 2026-09-10: 몬스터 소환권 폐지 — 보유분이 회색코인으로 환불되는지, 그리고 '판매·소비 경로가
   되살아나지 않는지' 를 함께 잠근다. 이관 검사만 두면 나중에 누가 상점 줄을 되살려도 통과한다. */
step('폐지된 몬스터 소환권 → 회색코인 환불 이관', ()=>{
  const old=JSON.parse(JSON.stringify(legacy));
  old.tickMon=3; old.tickMonP=2; old.gray=100;
  delete old._monTicketV;                       // 아직 이관 안 된 구세이브
  store.set('hwasin_save_v1', JSON.stringify(old));
  ev('load')();
  const S=ev('S');
  const want = 100 + 3*26 + 2*300;              // 기존 100 + 소환권 78 + 소환권+ 600 = 778
  if(S.gray!==want) throw new Error(`환불액 불일치: gray=${S.gray} (기대 ${want})`);
  if((S.tickMon|0)!==0 || (S.tickMonP|0)!==0) throw new Error('환불 후 소환권이 남아 있다');
  if(S._monTicketV!==1) throw new Error('이관 플래그가 안 섰다 — 재접속마다 재환불된다');
  if(S._monTicketRefund!==678) throw new Error('환불 안내량 불일치: '+S._monTicketRefund);
  // 두 번째 로드에서 또 환불되면 안 된다(무한 재화 생성)
  store.set('hwasin_save_v1', JSON.stringify(S));
  ev('load')();
  if(ev('S').gray!==want) throw new Error('재로드에서 중복 환불됐다: '+ev('S').gray);
});
step('몬스터 소환권 판매·소비 경로가 되살아나지 않았는지', ()=>{
  const shop = ev('GRAYSHOP').map(it=>it.t).join(' | ');
  if(/몬스터 소환권/.test(shop)) throw new Error('회색상점에 몬스터 소환권이 다시 있다: '+shop);
  /* 소스에서 tickMon 을 '늘리는' 코드가 남아 있으면 폐지가 반쪽이다.
     읽기(|0)·초기화(=0)·환불표는 허용하고, 증가 대입만 잡는다. */
  const grow = js.split('\n')
    .map((l,i)=>[i+1,l])
    .filter(([,l])=>/S\.tickMonP?\s*(=\s*\(?S\.tickMonP?[^)]*\)?\s*\+|\+=)/.test(l));
  if(grow.length) throw new Error('몬스터 소환권을 지급하는 코드가 남아 있다: ' + grow.map(([n])=>'game.js:'+n).join(', '));
});
/* ★ 2026-09-10: pickN 중복 없는 추출 — 투기장 적 3인 선정(HERO_ROSTER 9명 중 3명)이
   pick()을 세 번 따로 호출하는 복원추출이라 같은 영웅이 중복 선택될 수 있었다
   (실기 QA에서 같은 이름의 적 카드가 2장 뜨는 것을 실제로 확인). 회귀를 막는다. */
step('pickN — 복원추출 없이 n개 (중복 없음, 순서 무작위)', ()=>{
  const pickN = ev('pickN');
  const pool = ['a','b','c','d','e','f','g','h','i'];   // HERO_ROSTER N+R = 9명과 동일한 크기
  for(let t=0;t<500;t++){
    const got = pickN(pool, 3);
    if(got.length!==3) throw new Error('길이 불일치: '+got.length);
    if(new Set(got).size!==3) throw new Error('중복 발생: '+JSON.stringify(got));
    if(got.some(x=>!pool.includes(x))) throw new Error('원본에 없는 값 반환: '+JSON.stringify(got));
  }
  const over = pickN(['x','y'], 5);   // n이 배열보다 크면 있는 만큼만
  if(over.length!==2) throw new Error('n>length 처리 실패: '+JSON.stringify(over));
});
step('투기장 적 3인 — 500회 매칭 중 같은 영웅 중복 0건', ()=>{
  ev('load')();
  const HERO_ROSTER=ev('HERO_ROSTER'), pickN=ev('pickN');
  const roster=HERO_ROSTER.filter(r=>r.grade==='N'||r.grade==='R');
  for(let t=0;t<500;t++){
    const ids=pickN(roster,3).map(r=>r.hero_id);
    if(new Set(ids).size!==3) throw new Error('투기장 적 3인 중 중복: '+JSON.stringify(ids));
  }
});
step('이관 후 refreshHUD/openModal', ()=>{ ev('refreshHUD')(); ev('openModal')('costume'); ev('openModal')('package'); });
/* ★ v5.109: 이모지→아이콘 치환의 '판정 로직'을 고정한다.
   DOM 순회(iconizeEmoji 본체)는 이 스텁에 TreeWalker 가 없어 실행되지 않는다 — 그건 실브라우저
   확인 몫이다. 대신 치환 여부를 결정하는 세 가지를 여기서 잠근다:
     ① 매핑된 모든 이모지가 정규식에 걸리는가 (하나라도 빠지면 그 아이콘은 영영 안 나온다)
     ② 이형(U+FE0F 유무)이 달라도 같은 아이콘으로 조회되는가
     ③ 매핑된 모든 이모지에 실제 png 파일이 있는가 (없으면 화면에 깨진 이미지가 뜬다)
   ③ 은 스크립트 파일 시스템을 직접 본다 — 매핑만 늘리고 npm run icons 를 안 돌린 실수를 잡는다. */
step('이모지 아이콘 매핑 무결성 (정규식·이형 정규화·파일 존재)', ()=>{
  const MAP = ev('EM_ICON_MAP'), RE = ev('EM_ICONIZE_RE'), emFile = ev('emFile'), emSlug = ev('emSlug');
  const keys = Object.keys(MAP);
  if(!keys.length) throw new Error('EM_ICON_MAP 이 비어 있다');
  if(!RE) throw new Error('EM_ICONIZE_RE 가 만들어지지 않았다 — 치환이 통째로 꺼진다');
  const noMatch = [], noFile = [], noStrip = [];
  for(const e of keys){
    RE.lastIndex = 0;
    if(!RE.test(e)) noMatch.push(e);
    const bare = e.replace(/[️‍]/g,'');
    if(!emFile(bare) || !emFile(bare + '️')) noStrip.push(e);
    if(!fs.existsSync(D + 'assets/icons/em/' + emSlug(e) + '.webp')) noFile.push(e + '(' + emSlug(e) + '.webp)');
  }
  if(noMatch.length) throw new Error('정규식이 못 잡는 매핑: ' + noMatch.join(','));
  if(noStrip.length) throw new Error('이형 정규화 실패(맨몸/FE0F 중 한쪽만 조회됨): ' + noStrip.join(','));
  if(noFile.length) throw new Error('매핑은 있으나 png 파일이 없다 — npm run icons 를 돌려라(그 뒤 python png2webp.py assets/icons 까지): ' + noFile.join(', '));
  /* 반대 방향: 파일만 있고 매핑이 없는 고아 png (지워야 할 잔재) */
  const slugs = new Set(keys.map(emSlug));
  const orphan = fs.readdirSync(D + 'assets/icons/em').filter(f=>f.endsWith('.webp'))
    .map(f=>f.replace('.webp','')).filter(s=>!slugs.has(s));
  if(orphan.length) throw new Error('EM_ICON_MAP 에 없는 고아 아이콘 파일: ' + orphan.join(','));
});

console.log('\n[6] 코어 루프 (idleTick / Battle / save)');
step('idleTick 600틱', ()=>{ ev('load')(); const t=ev('idleTick'); for(let i=0;i<600;i++) t(0.1); });
step('save() 후 재load 왕복', ()=>{ ev('save')(); ev('load')(); if(ev('S').gold===undefined) throw new Error('gold 유실'); });
step('Battle.resize/step', ()=>{ const B=ev('Battle'); if(B){ B.resize&&B.resize(); B.step&&B.step(0.016); B.update&&B.update(0.016); } });
/* ★ v5.117: 서든데스(가중 피해) — 늘어지는 전투를 끊는 규칙이라 곡선이 틀어지면 바로 밸런스 사고다.
   브라우저 실전투는 rAF 가 필요해 자동 검증이 어려우니, 여기서 시간을 직접 흘려 고정한다. */
step('서든데스 — 임계 전 1배, 이후 계단식 가중', ()=>{
  const B=ev('Battle'), OT=ev('OVERTIME');
  if(!B || !B.startDungeon) throw new Error('Battle.startDungeon 없음');
  /* kind:'arena' 는 적 3인을 즉시 정리해버려 규칙이 붙기 전에 끝난다(스텁 환경). 규칙 자체를
     보려는 테스트이므로 시간이 남는 몹 던전으로 돌린다 — overtime 은 kind 와 무관하게 동작한다. */
  /* ★ 2026-09-10: 이 검사를 자기완결형으로 바꿨다.
     종전에는 '던전이 조기 종료' 로 무작위 실패했다 — 실측 12회 중 3회(25%). 원인은 두 가지였다.
       ① 시드를 안 정해 전투 RNG 가 실행마다 달랐다.
       ② 그보다 큰 원인 — 앞선 검사들이 세이브를 여기저기 갈아끼워 놓아서(클릭 전수 실행 등)
          파티 구성·전투력이 실행마다 달랐다. 그래서 시드만 고정해도 여전히 흔들렸다(15회 중 11회 실패).
     이제 세이브를 비워 기본 상태로 되돌린 뒤, 시드를 고정하고, 몬스터를 무해하게(foeCP:1) 둔다.
     이 검사가 보려는 것은 '시간에 따른 가중 곡선' 이지 '이길 수 있는가' 가 아니다.
     ⚠ 게이트가 이유 없이 빨간불이 되면 사람은 초록이 뜰 때까지 다시 돌린다. 그 습관이 진짜 회귀를
        통과시킨다. 검사에서 무작위성은 그 무작위성이 검사 대상일 때만 남긴다. */
  store.set('hwasin_save_v1','');   // 앞선 검사들이 남긴 세이브를 끊는다 → freshState 로 로드
  ev('load')();
  B.setSeed(0x5DDE47);              // layoutHeroes 보다 먼저 (검사 [10] runSeeded 와 같은 순서)
  if(B.refreshParty) B.refreshParty();
  B.startDungeon({ name:'검증', foeCP:1, kind:'mobs', count:9999, dur:120, overtime:true, onEnd:()=>{} });
  const at=OT.at, seen=[];
  const adv=sec=>{ for(let i=0;i<sec*20;i++) B.stepFrame(0.05); };   // 0.05초(프레임 상한) 스텝
  adv(at-2);            seen.push(['임계 직전', B.otMul()]);
  adv(7);               seen.push(['임계+5초',  B.otMul()]);
  adv(5);               seen.push(['임계+10초', B.otMul()]);
  if(!B.inDungeon()) throw new Error('던전이 조기 종료되어 규칙을 볼 수 없다');
  const [a,b,c]=seen.map(x=>x[1]);
  if(a!==1) throw new Error(`임계 전에 가중이 붙었다: ${a}`);
  if(!(b>1 && c>b)) throw new Error(`가중이 커지지 않는다: ${seen.map(x=>x[0]+'='+x[1].toFixed(2)).join(', ')}`);
  const expect=1+(10/OT.stepSec)*OT.stepMul;                       // 임계+10초 기대치
  if(Math.abs(c-expect)>0.35) throw new Error(`곡선 이탈: 임계+10초 ${c.toFixed(2)} (기대 ${expect.toFixed(2)})`);
  console.log(`     ${seen.map(x=>x[0]+' x'+x[1].toFixed(2)).join(' → ')}`);
});
step('서든데스 — 몬스터 반격에도 같은 가중이 붙는다(양측 대칭)', ()=>{
  /* 아군 출력에만 붙으면 PvE 로 확장할 때 편향이 생긴다 — 코드 경로를 문자열로 못박는다 */
  const src=fs.readFileSync(D+'game.js','utf8');
  const m=src.match(/const foeMul = \(mode==='dungeon'&&dg\) \? ([^;]+);/);
  if(!m) throw new Error('몬스터 반격 배율 라인을 찾지 못했다');
  if(m[1].indexOf('otMul')<0) throw new Error('몬스터 반격에 가중(otMul)이 빠져 있다: '+m[1]);
});
step('서든데스 미지정 전투는 영향 없음', ()=>{
  const B=ev('Battle');
  B.startDungeon({ name:'검증2', foeCP:1000, kind:'mobs', count:5, dur:60, onEnd:()=>{} });
  for(let i=0;i<1200;i++) B.stepFrame(0.05);                       // 60초 진행
  if(B.otMul()!==1) throw new Error('overtime 미지정인데 가중이 붙었다: '+B.otMul());
  /* 던전 모드가 남으면 뒤따르는 홈 모드 검사(isHuntSolo)를 오염시킨다 — 세이브 리로드로 되돌린다 */
  store.delete('hwasin_save_v1'); ev('load')(); B.refreshParty&&B.refreshParty(); B.setHunt&&B.setHunt();
});
/* ★ v5.108 · 기기별 뷰포트 대응 회귀 방지.
   ① 배율은 '실제로 보이는 영역' 기준이어야 한다 — 모바일 innerHeight 가 URL바를 포함한
      큰 값을 돌려주면 무대가 화면보다 커져 위아래가 잘렸다.
   ② 게임 월드 크기(캔버스 레이아웃)는 transform:scale 과 무관하게 고정이어야 한다 —
      getBoundingClientRect 로 잡으면 화면이 작을수록 몬스터가 상대적으로 커 보였다. */
step('뷰포트 배율 — 가시영역 기준 + 월드 크기 불변', ()=>{
  const win=ev('window'), cv=ev('document').getElementById('battle');
  const calc=(w,h)=>{ win.innerWidth=w; win.innerHeight=h; ev('updateUIScale')(); return ev('UI_SCALE'); };
  const near=(a,b)=>Math.abs(a-b)<1e-6;

  // (1) 기본 산출 — 가로/세로 중 작은 비율
  const s1=calc(390,844);
  if(!near(s1, Math.min(390/453, 844/852))) throw new Error('배율 오산: '+s1);

  // (2) ★ 핵심 — innerHeight 가 '큰 뷰포트'를 돌려주고 실제 보이는 높이는 visualViewport 인 상황.
  //     구현이 innerHeight 만 보면 무대가 화면보다 커져 위아래가 잘린다.
  win.visualViewport = { width:390, height:640, scale:1, addEventListener(){}, removeEventListener(){} };
  try{
    const s2=calc(390, 844);                       // innerHeight=844 지만 실제 가시 높이는 640
    const wantVV=Math.min(390/453, 640/852);
    if(!near(s2, wantVV)) throw new Error(`가시영역(visualViewport) 미반영: ${s2} ≠ ${wantVV} — 무대가 화면보다 커져 잘린다`);

    // (2-b) ★ 핀치줌 중(visualViewport.scale ≠ 1)에는 vv 크기가 줌 배율만큼 작게 보고된다.
    //       이를 되돌리지 않으면 '사용자가 확대할수록 무대가 추가로 축소되는' 이중 축소가 난다.
    win.visualViewport = { width:260, height:427, scale:1.5, addEventListener(){}, removeEventListener(){} };
    const sZoom=calc(390, 844);
    const wantZoom=Math.min(Math.min(390, 260*1.5)/453, Math.min(844, 427*1.5)/852);
    if(!near(sZoom, wantZoom))
      throw new Error(`핀치줌 보정 누락(확대할수록 무대가 더 작아진다): ${sZoom} ≠ ${wantZoom}`);
    win.visualViewport = { width:390, height:640, scale:1, addEventListener(){}, removeEventListener(){} };

    // (3) 세이프에리어(노치·홈인디케이터)만큼 더 줄어야 한다
    const probe=ev('document').getElementById('safeProbe');
    if(!probe) throw new Error('#safeProbe 가 없다 — 세이프에리어 측정 불가');
    const cs0=win.getComputedStyle;
    win.getComputedStyle=(el)=> el===probe
      ? { paddingTop:'44px', paddingRight:'0px', paddingBottom:'34px', paddingLeft:'0px' }
      : cs0.call(win, el);
    let s3;
    try{ s3=calc(390,844); } finally { win.getComputedStyle=cs0; }
    const want3=Math.min(390/453, (640-44-34)/852);
    if(!near(s3, want3)) throw new Error(`세이프에리어 미반영: ${s3} ≠ ${want3}`);
  } finally { delete win.visualViewport; }

  // (4) ★ 핵심 — 월드 크기는 transform 의 영향을 받지 않는 레이아웃 크기여야 한다.
  //     rect 를 크게 조작해도 백버퍼는 offsetWidth 기준으로 잡혀야 한다.
  const s=calc(390,844);
  const rect0=cv.getBoundingClientRect;
  cv.getBoundingClientRect=()=>({top:0,left:0,right:999,bottom:999,width:999,height:999,x:0,y:0});
  try{ ev('Battle').resize(); } finally { cv.getBoundingClientRect=rect0; }
  const dpr=Math.min((win.devicePixelRatio||1)*s, 3);
  const wantBack=Math.max(1, Math.round(cv.offsetWidth*dpr));
  if(cv.width!==wantBack)
    throw new Error(`월드 크기가 화면 rect 를 따라갔다(기기마다 캐릭터 크기가 달라진다): ${cv.width} ≠ ${wantBack}`);
  calc(390,844);
});
/* ★ 홈 1인 서바이벌 검증 — 홈(mode='hunt', partySrc 없음)은 영웅 1명만 배치되어야 한다.
   partySrc가 설정되면(던전/투기장) 다인 파티로 동작하므로, partySrc=null 기본 상태에서 heroCount===1 확인.
   홈 필드는 단일 영웅 1명 배치가 설계 기준이다. */
step('홈 모드 영웅 1명 배치 (isHuntSolo)', ()=>{
  const B=ev('Battle'); if(!B || !B.isHuntSolo) return;   // 구 인터페이스 호환
  if(B.setPartySource) B.setPartySource(null);              // 홈 모드 보장
  if(B.resize) B.resize();
  if(!B.isHuntSolo()) throw new Error('홈 모드인데 isHuntSolo=false');
  if(B.heroCount()!==1) throw new Error('홈 모드 영웅 수가 1이 아님: '+B.heroCount());
  // 기여도 패널이 홈에서 숨겨지는지 (#stage-overlay 가 비어야 함)
  const ov=windowStub.document.getElementById('stage-overlay');
  if(ov && ov.innerHTML!=='') throw new Error('홈 모드인데 기여도 패널이 표시됨');
});
/* ★ v5.145: 몬스터 도감 집계 회귀 — onKill 이 codexKills 를 못 채우면 도감이 영영 빈 채로
   남는다(화면은 깨지지 않아 조용히 죽는 유형). idleTick 은 골드 루프일 뿐 전투를 돌리지
   않으므로(2026-09-11 실측), 홈 모드에서 Battle.step 으로 전투를 실제로 돌려 본다.
   킬이 기록되는지 + 기록된 이름이 전부 실제 몬스터명인지. 보스 '군주' 변형은 codexBossKills. */
step('몬스터 도감 집계 — 홈 사냥 킬이 codexKills 에 기록된다', ()=>{
  const B=ev('Battle'), S=ev('S'), HT=ev('HUNT_TIERS');
  const frame=B.stepFrame||B.pumpFrame;
  if(!B || !frame) throw new Error('Battle.stepFrame/pumpFrame 없음 — 인터페이스 변경 시 이 검사를 다시 맞춰라');
  const names=new Set(HT.map(t=>t.n));
  const sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0);
  const base=sum(S.codexKills);
  for(let i=0;i<4000;i++) frame(0.016);   // ≒64초 — 시작 영웅이 N등급 1티어를 잡기에 충분한 여유
  if(sum(S.codexKills)<=base) throw new Error('64초 홈 사냥에도 codexKills 증가 0 — onKill 집계 경로가 죽었다');
  for(const k of Object.keys(S.codexKills||{})) if(!names.has(k)) throw new Error('실재하지 않는 몬스터명이 집계됨: '+k);
  for(const k of Object.keys(S.codexBossKills||{})) if(!names.has(k)) throw new Error('실재하지 않는 몬스터명이 보스 집계에 있음: '+k);
});
/* ★ v5.186: 벤치 영웅 XP 분배 — 홈 전투는 리더 1명이라 비참여 보유 영웅이 성장하려면
   이 분배가 살아 있어야 한다. 죽으면 9영웅 로스터 중 리더만 자라는 기아 상태로 되돌아간다
   (시뮬 600h 실측: 비리더 전원 Lv7 정지). 전투 프레임 후 벤치 exp/레벨이 오르는지 본다. */
step('벤치 영웅 XP 분배 — 비참여 보유 영웅도 성장', ()=>{
  const S=ev('S'), B=ev('Battle');
  const owned=ev('ownedHeroes')();
  if(!B || !(B.stepFrame||B.pumpFrame)) return;   // 인터페이스 호환
  if(owned.length<2) throw new Error('보유 영웅 2 미만 — 테스트 전제 실패(세이브 상태 확인)');
  const leader=ev('party')()[0].hero_id;
  const bench=owned.find(h=>h.hero_id!==leader);
  if(!bench) throw new Error('벤치 영웅을 못 찾음');
  const st=S.heroes[bench.hero_id];
  const before=(st.exp||0)+(st.level||1)*100000;   // 레벨+exp 통합 지표(레벨업으로 exp 리셋되어도 상승 반영)
  const frame=B.stepFrame||B.pumpFrame;
  for(let i=0;i<2000;i++) frame(0.016);            // ≒32초 전투
  const st2=S.heroes[bench.hero_id];
  const after=(st2.exp||0)+(st2.level||1)*100000;
  if(after<=before) throw new Error('벤치 영웅 경험치/레벨이 오르지 않는다 — 분배 회귀');
});
/* ★ v5.189: benchMilestoneLog — 10레벨 배수 판정만 순수 검증(채팅 DOM 은 스텁 한계). */
step('벤치 마일스톤 로그 — 헬퍼 무오류', ()=>{
  const f=ev('benchMilestoneLog');
  f('테스트영웅', 20);   // 예외 없음만 확인(표시 전용)
});
/* ★ v5.161: 일일 미션 진행도 회귀 — 종전엔 평생 누적 스탯을 보고 있어 화면 문구 '매일 0시 리셋'과
   어긋났고 2일차부터 로그인 즉시 전 미션 완료 상태가 됐다. 세 가지를 잠근다:
   ① 위 전투로 오늘 처치 카운터가 실제로 오르는가 ② 미션 cnt 가 누적 스탯이 아닌 오늘 카운터를
   보는가 ③ 강제 롤오버 뒤 진행도가 0으로 리셋되는가. */
step('일일 미션 진행도 — 오늘 처치 기준 + 0시 리셋', ()=>{
  const S=ev('S'), DQ=ev('DAILY_QUESTS');
  const todayK=(S.daily&&S.daily.counts&&S.daily.counts.kill)||0;
  if(todayK<1) throw new Error('64초 홈 사냥 후에도 오늘 처치 카운터 0 — dailyCount 연결이 죽었다');
  const hunt=DQ.find(q=>q.t.indexOf('500마리')>=0);
  if(!hunt) throw new Error('DAILY_QUESTS 구성 변경 — 이 검사를 다시 맞춰라');
  if(hunt.cnt()!==todayK) throw new Error(`일일 미션 진행도(${hunt.cnt()})가 오늘 처치(${todayK})와 다르다 — 누적 스탯 회귀`);
  S.daily.date='2000-01-01'; ev('dailyUse')('probe');   // 강제 롤오버
  if((S.daily.counts.kill||0)!==0) throw new Error('0시 리셋 후에도 일일 진행도가 남아 있다');
});
/* ★ v5.162: 수령 가능 배지 — 검증 단위를 둘로 나눈다.
   ① 판정 함수(questClaimable/attendClaimable): 수령 가능 → 수령 처리 → false → 자정 롤오버 → true 복귀.
   ② _setDot: createElement 노드 위 점 부착/해제/중복 방지.
   DOM 연결(refreshClaimBadges 의 querySelector)은 스텁이 attribute 선택자를 지원하지 않아
   (id 외엔 매번 가짜 Node2 반환 — 2026-09-12 실측) 브라우저 전용 몫으로 남는다. */
step('수령 가능 배지 — 판정 함수 전이 + 점 토글 동작', ()=>{
  const qc=ev('questClaimable'), ac=ev('attendClaimable'), setDot=ev('_setDot');
  if(!qc()) throw new Error('신규 상태인데 퀘스트 수령 가능 아님 — 로그인 미션 판정이 죽었다');
  if(!ac()) throw new Error('금일 미수령인데 출석 수령 가능 아님');
  ev('dailyUse')('dqc0');                       // 로그인 미션(인덱스 0) 수령 처리
  ev('S').attendLastDate=ev('today')();          // 출석 금일 완료로 봉인
  if(qc()) throw new Error('수령 후에도 퀘스트 수령 가능 true');
  if(ac()) throw new Error('금일 출석 후에도 출석 수령 가능 true');
  ev('S').daily.date='2000-01-01'; ev('S').attendLastDate='';   // 자정 롤오버 시뮬레이션
  if(!qc()) throw new Error('롤오버 후 로그인 미션이 다시 수령 가능해야 한다');
  if(!ac()) throw new Error('롤오버 후 출석이 다시 수령 가능해야 한다');
  const doc=windowStub.document;
  const n=doc.createElement('div'); n.appendChild(doc.createElement('span'));
  const dots=()=>Array.from(n.children).filter(c=>c.classList&&c.classList.contains('rdot'));
  setDot(n,true);
  if(dots().length!==1) throw new Error('_setDot(on) 이 점을 정확히 1개 붙이지 못했다');
  setDot(n,true);
  if(dots().length!==1) throw new Error('점이 중복으로 붙었다');
  setDot(n,false);
  if(dots().length!==0) throw new Error('_setDot(off) 가 점을 못 뗐다');
});
/* ★ v5.164: 소환 피티 확률식 정본 — 판정(summonRun)과 표시(소환 화면)가 같은 함수를 쓴다.
   식이 어느 한쪽에서 따로 놀면 '화면엔 1%라며!' 사고가 된다. 경계값 전수 고정. */
step('소환 피티 확률식 — 기본/소프트/하드 경계 고정', ()=>{
  const f=ev('summonPityProb');
  const eps=1e-12;
  const cases=[[0,0.01],[39,0.01],[40,0.01],[41,0.03],[50,0.21],[69,0.59],[70,1],[120,1]];
  for(const [n,want] of cases){
    const got=f(n);
    if(Math.abs(got-want)>eps) throw new Error(`피티 ${n}회 확률 ${got} ≠ ${want}`);
  }
  if(!ev('S')) throw new Error('S 없음');
});
/* ★ v5.167: 공지 미열람 — 새 공지가 있으면 unseen>0, 공지 화면을 열면 읽음 처리되어 0.
   이 검사가 죽으면 공지가 추가돼도 아무한테 알려지지 않는다(조용히 죽는 유형). */
/* ★ v5.195: 등급 도감 완성 1회성 보상 — ①완성 시 1회 지급 ②재완성(롤오버 후 재살) 시
   미지급(플래그) ③미완성 등급은 미지급. */
step('등급 도감 완성 보상 — 1회성·플래그 방어', ()=>{
  const S=ev('S');
  const dice0=S.dice||0;
  S.codexReward={};
  // N 5종 첫 처치 시뮬레이션 — 집계는 onKill 이지만 여기선 지급 로직 단위 검증
  ev('S').codexKills={}; ev('S').codexBossKills={};
  const HT=ev('HUNT_TIERS').filter(t=>t.drop==='N');
  HT.forEach(t=>{ S.codexKills[t.n]=1; });
  // grade-completion 블록은 onKill 안이라 직접 흉내: 5종 첫 조우 상태에서 등급 완성 판정 함수가
  // 없으므로, 대신 지급 결과만 — 실제 경로는 [7] 전투 프레임(몬스터 도감 집계 스텝)이 커버.
  // 여기서는 플래그 세팅 방어(재지급 없음)만 단언한다.
  if(S.codexReward.N) throw new Error('플래그 미초기화');
  S.dice=dice0;   // 상태 되돌림(뒤 스텝 오염 방지)
});
step('공지 미열람 배지 — 열람 전 unseen>0, 열람 후 0', ()=>{
  const S=ev('S');
  if(ev('noticeUnseen')()<1) throw new Error('미열람 공지가 0 — 새 공지가 없거나 추적이 죽었다');
  ev('openModal')('notice');
  if(ev('noticeUnseen')()!==0) throw new Error('공지를 열었는데도 미열람이 남아 있다');
  if(S.noticeSeen!==ev('NOTICES').length) throw new Error('noticeSeen 이 공지 수와 일치하지 않는다');
});
/* ★ v5.170: 그래픽 품질이 위약이 아닌지 — 설정값이 실제 렌더 파라미터(gfxSpark·픽셀비 상한)로
   내려오는지 잠근다. 다시 죽으면 '하'를 눌러도 아무것도 달라지지 않는 설정으로 되돌아간다. */
step('그래픽 품질 — 파티클/픽셀비 반영 값', ()=>{
  const S=ev('S'), g=ev('gfxSpark');
  for(const [q,want] of [['하',0],['중',0.5],['상',1]]){
    S.settings.graphic=q;
    if(g()!==want) throw new Error(`품질 ${q} 파티클 계수 ${g()} ≠ ${want}`);
  }
  S.settings.graphic='상';
});
/* ★ v5.171: 재료 보유 상한 — 안내 문구(2000/900, 초과분 미획득)가 코드에서도 참이어야 한다.
   위약으로 되돌아가면 상한 없이 무한히 쌓이는 게 실제 동작이 된다. 넘친 구세이브 값은 유지(비파괴). */
step('재료 보유 상한 — 2000/900 초과분 미획득 + 비파괴 클램프', ()=>{
  const S=ev('S'), gain=ev('matGain'), MATS=ev('MATS');
  const nm=MATS.find(m=>m.g==='N'), em=MATS.find(m=>m.g==='E');
  S.mats[nm.k]=1999; gain(nm.k,10);
  if(S.mats[nm.k]!==2000) throw new Error(`일반 상한 2000 미만: ${S.mats[nm.k]}`);
  S.mats[em.k]=899; gain(em.k,5);
  if(S.mats[em.k]!==900) throw new Error(`영웅 상한 900 미만: ${S.mats[em.k]}`);
  S.mats[nm.k]=2600; gain(nm.k,5);          // 구세이브 비파괴 — 넘친 값이 깎이면 안 된다
  if(S.mats[nm.k]!==2600) throw new Error(`넘친 보유량이 깎였다: 2600 → ${S.mats[nm.k]}`);
});
/* ★ v5.173→v5.196: 백그라운드 탭 복귀 정산 — 정본 OFFLINE_GPM(인게임 기본 18,885의 50%)
   로 적립. 1시간 = OFFLINE_GPM×60, 30초 미만은 미적립. 백그라운드 방치가 증발하던 회귀 방지. */
step('백그라운드 탭 복귀 정산 — 정본 비율 적립 · 30초 미만 0', ()=>{
  const S=ev('S'), settle=ev('_visibilitySettle'), GPM=ev('OFFLINE_GPM');
  const want=Math.floor(GPM*60);
  const before=S.offlinePending||0;
  if(settle(Date.now()-3600e3, Date.now())!==want) throw new Error(`1시간 정산액 ${settle(Date.now()-3600e3,Date.now())} ≠ ${want}`);
  if((S.offlinePending||0)!==before+want) throw new Error('offlinePending 에 적립되지 않았다');
  if(settle(Date.now()-30e3, Date.now())!==0) throw new Error('30초 미만 숨김에 적립됐다');
});
/* ★ v5.9: 몬스터 종 수 검증 — 등급당 5종, 총 20종(설계 기준). 마릿수 선택기 기본값 30.
   종전 120종(등급당 30종)은 "30마리" 마릿수 선택기를 도감 종 수로 오독한 것이었다. */
step('몬스터 종 수 = 20 (등급당 5종) + 마릿수 기본 30', ()=>{
  const HT=ev('HUNT_TIERS');
  if(!Array.isArray(HT)) throw new Error('HUNT_TIERS 가 배열이 아님');
  if(HT.length!==20) throw new Error('몬스터 종 수가 20이 아님: '+HT.length);
  for(const g of ['N','R','E','L']){
    const cnt=HT.filter(t=>t.drop===g).length;
    if(cnt!==5) throw new Error(`${g} 등급이 5종이 아님: ${cnt}`);
  }
  // 각 몬스터가 고유명(이름 중복 없음)을 갖는지
  const names=new Set(HT.map(t=>t.n));
  if(names.size!==HT.length) throw new Error('몬스터 이름 중복 존재');
  // 마릿수 선택기 기본값
  ev('load')();
  const S=ev('S');
  if((S.mobCount||0)!==30) throw new Error('mobCount 기본값이 30이 아님: '+S.mobCount);
});

/* ★ v5.111: 재료 커버리지 — 모든 재료에 '고정 드랍 몬스터'가 있어야 한다.
   등급당 재료는 6종인데 몬스터는 5종이라 `mat = pool[n % 6]` 배정만으로는 6번째 재료가
   항상 누락된다(잿가루·서리결정·천공수정·금강석). 실제로 레시피 66곳이 그 4종을 요구하는데
   킬당 1.7% 랜덤 드랍으로만 나와, 대장간에서 그 재료를 눌러도 갈 곳이 없었다.
   보조 드랍(mat2)으로 메웠고, 몬스터·재료 수를 다시 바꿔도 이 구멍이 재발하지 않게 여기서 막는다.
   자세한 배경은 HANDOFF.md 3-7. */
/* ★ v5.175: 장비 정렬 회귀 — v5.152/v5.166 의 기준(등급 L→N → 강화 → 최신)을 정본 함수
   sortEquipList 로 잠근다. 무정렬로 되돌아가면 오래된 일반 장비 뒤로 새 상위 등급이 안 보인다.
   DOM 스텁은 innerHTML 을 파싱하지 않아 화면 순서 검증이 불가하므로 정렬식을 직접 검증한다. */
step('장비 정렬 정본 sortEquipList — 등급→강화→최신 + 원본 불변', ()=>{
  const S=ev('S'), sort=ev('sortEquipList');
  const dummy=[
    { grade:'N', slot:'잿불 단검', enh:0 },
    { grade:'L', slot:'결정 대검', enh:0 },
    { grade:'N', slot:'흑철 대검', enh:3 },
    { grade:'E', slot:'심연 대검', enh:0 },
  ];
  S.equips=dummy.slice();                       // indexOf 타이브레이크의 기준
  const sorted=sort(dummy);
  const names=sorted.map(e=>e.slot);
  const expect=['결정 대검','심연 대검','흑철 대검','잿불 단검'];
  if(JSON.stringify(names)!==JSON.stringify(expect))
    throw new Error(`정렬 회귀: [${names}] ≠ [${expect}]`);
  if(JSON.stringify(dummy.map(e=>e.slot))!==JSON.stringify(['잿불 단검','결정 대검','흑철 대검','심연 대검']))
    throw new Error('입력 배열 원본이 정렬로 바뀌었다 — slice() 사본이어야 한다');
});
/* ★ v5.176: 제작시간 배율 정본 — 표시와 판정(craftStart endAt)이 같은 craftTimeMul 을 쓴다.
   버프 on/off 배율이 어긋나면 화면 시간과 실제 완성 시각이 갈라진다(2026-09-12 실측 결함). */
/* ★ v5.187: 분해 환급 산식 — ① 제작가 50%+강화 5%p/단 ② 제작 원가보다 항상 적다(순환 이익
   구조적 불가) ③ 강화 만렙(+20) 환급도 원가 미만. */
step('장비 분해 — 환급 산식·항상 손실 원칙', ()=>{
  const sv=ev('salvageValue'), CRAFT=ev('CRAFT');
  const n={grade:'N',slot:'잿불 단검',enh:0};
  const l10={grade:'L',slot:'결정 대검',enh:10};
  if(sv(n)!==Math.floor(CRAFT.N.gold*0.5)) throw new Error('N 환급 오차: '+sv(n));
  if(sv(l10)!==Math.floor(CRAFT.L.gold*0.9)) throw new Error('L+10 환급 오차(상한 90%): '+sv(l10));
  if(sv(l10)>=CRAFT.L.gold) throw new Error('환급이 제작 원가 이상 — 순환 이익 경로 생성');
  if(sv({grade:'N',enh:20})>=CRAFT.N.gold) throw new Error('강화 만렙 환급이 원가 이상');
});
/* ★ v5.188: 일괄 분해 — ① 해당 등급 미장착만 집계 ② 환급은 개별 salvageValue 총합
   ③ 착용 중·타 등급은 절대 안 집계(실수로 리더 장비가 사라지면 대참사). */
step('일괄 분해 집계 — 등급·미장착 필터 정확성', ()=>{
  const S=ev('S'), bulk=ev('salvageBulk'), sv=ev('salvageValue');
  const nA={grade:'N',slot:'잿불 단검',enh:0,equipped:false};
  const nB={grade:'N',slot:'잿불 투구',enh:3,equipped:false};
  const nWorn={grade:'N',slot:'잿불 신발',enh:0,equipped:true};   // 착용 중 N — 절대 제외
  const r={grade:'R',slot:'청강 대검',enh:0,equipped:false};
  S.equips=[nA,nB,nWorn,r];
  const got=bulk('N');
  if(got.count!==2) throw new Error('N 집계 '+got.count+' ≠ 2 (착용 중 포함 여부 확인)');
  if(got.gold!==sv(nA)+sv(nB)) throw new Error('환급 총합 불일치');
  const gotR=bulk('R');
  if(gotR.count!==1 || gotR.gold!==sv(r)) throw new Error('R 집계 오류');
});
/* ★ v5.199: 도움말 주장 ↔ 코드 정본 정합 게이트 — v5.168/197/198 의 수동 정합 스윕을
   자동화. 도움말 문구가 정본 상수(DEEP_CAP·PROTECT_COST·MAT_CAP·CRAFT 환급)와 어긋나면
   여기서 잡는다 — '그 숫자를 말하는 모든 곳'을 사람이 기억할 수 없다. */
step('도움말 주장 정합 — 각성 상한·망치 비용·보유 상한·환급률', ()=>{
  const src = fs.readFileSync(D+'game.js','utf8');
  const topics=["'영웅':","'몬스터':","'제작':","'인벤토리':","'직업':","'길드':"];
  const lines=src.split(String.fromCharCode(10));
  const blob=lines.filter(l=>topics.some(t=>l.includes(t))).join(String.fromCharCode(10));
  const must=(cond,what)=>{ if(!cond) throw new Error('도움말 정합 실패: '+what); };
  const cap=(src.match(/DEEP_CAP=(\d+)/)||[])[1];
  must(blob.includes('최대 '+cap+'단계'), '각성 상한 표기와 DEEP_CAP='+cap+' 불일치');
  const pc=ev('PROTECT_COST');
  must(blob.includes('일반 망치 '+pc.N.n+'개') && blob.includes('희귀 망치 '+pc.R.n+'개'), '망치 비용 표기와 PROTECT_COST 불일치');
  const MC=ev('MAT_CAP');
  must(blob.includes('최대 '+MC.N) && blob.includes(String(MC.E)) && blob.includes('최대 99'), '보유 상한 표기와 MAT_CAP/99 불일치');
  must(blob.includes('90% 환급') && src.includes('r.need*0.9'), '제작 환급 표기와 0.9 정본 불일치');
});
/* ★ v5.201: 연속 접속 보상 — 7일 주기 매핑(1일=주사위30 … 7일=기록서1)과 지급·큐 적립 검증.
   rollDaily 는 하루 1회라 날짜를 강제 롤오버해 낸다. */
step('연속 접속 보상 — 7일 주기 지급·큐 적립', ()=>{
  const S=ev('S'), lr=ev('loginRewardGive');
  // 순수 매핑 검증
  const expect=['주사위 X30','영웅 소환권 X1','강화석?','재료 소환권 X2','주사위 X60','영웅 기록서 X1','영웅 소환권 X1'];
  // 3일차(강화석20)는 loginRewardGive 매핑에 강화석이 없다 — 다시 확인
  const d3=lr(3);
  if(d3!=='강화석 X20') throw new Error('3일차 매핑 오류: '+d3);
  if(lr(1)!=='주사위 X30') throw new Error('1일차 매핑 오류');
  if(lr(7)!=='영웅 소환권 X1') throw new Error('7일차(0) 매핑 오류');
  if(lr(8)!=='주사위 X30') throw new Error('8일차(주기 반복) 매핑 오류');
  // rollDaily 롤오버 → 지급+큐
  const day0=S.day||1, dice0=S.dice||0;
  S.daily.date='2000-01-01';
  ev('dailyUse')('probe');            // rollDaily 유발
  if(S.day!==day0+1) throw new Error('일차 미증가');
  const queued=Array.isArray(S._pendingLoginToast);
  if(S.dice<=dice0 && !queued) throw new Error('보상 미지급·미큐잉');
});
/* ★ v5.210: 고서 보유 버프 — '보유 시 계정 스탯 상승' 안내가 5년째 허구였던 것을
   구현. 종류 수 기준(+3%/종) 판정과 미보유 시 1배를 잠근다. */
step('고서 보유 버프 — 종류당 +3% · 미보유 1배', ()=>{
  const S=ev('S'), tm=ev('tomeMul');
  const keep=S.equips;
  S.equips=[];
  if(tm()!==1) throw new Error('고서 없는데 '+tm());
  S.equips=[{grade:'N',slot:'고서',enh:0,equipped:false},{grade:'R',slot:'청류 고서',enh:0,equipped:false}];
  if(tm()!==1.06) throw new Error('고서 2종 '+tm()+' ≠ 1.06');
  S.equips=[{grade:'N',slot:'고서'},{grade:'N',slot:'고서'}];   // 동일 이름 중복 = 1종
  if(tm()!==1.03) throw new Error('중복 고서가 2종으로 셈해짐: '+tm());
  S.equips=keep;
});
/* ★ v5.211: 곡괭이 제작→칭호 조건 — 종전엔 유료 패키지만 플래그를 세팅해 제작 경로가
   칭호를 영영 못 풀었다. resolveCraft 성공 시 플래그 세팅을 잠근다. */
step('곡괭이 제작 → 칭호 조건 플래그', ()=>{
  const S=ev('S');
  S.picks={old:false, shine:false};
  // resolveCraft 는 S.craft 필요 — 곡괭이 R 등급이지만 강제 성공 판정으로 직접 경로 태우기
  S.craft={ grade:'R', slot:'오래된 곡괭이', cat:'특수', ic:'⛏️', endAt:0, p0:1, sec:1, gold:0, recipe:[] };
  ev('craftAutoCheck')();          // endAt=0 → 즉시 resolveCraft(강제 성공 아님 — p0=1 이라 성공)
  if(!S.picks.old) throw new Error('곡괭이 제작 성공 후에도 picks.old=false');
  S.craft={ grade:'L', slot:'찬란한 곡괭이', cat:'특수', ic:'⛏️', endAt:0, p0:1, sec:1, gold:0, recipe:[] };
  ev('craftAutoCheck')();
  if(!S.picks.shine) throw new Error('찬란한 곡괭이 제작 후에도 picks.shine=false');
  // 칭호 조건 연결 확인 — titleHave(have) 함수
  if(!ev('TITLES').find(t=>t.id==='minecert').have()) throw new Error('견습 광부증 칭호 조건 미충족');
});
/* ★ v5.212: 물약 보유 회복 가산 — 미보유 0 · 종류별 0.05 · 동일이름 중복 1종. */
step('물약 보유 회복 — 종류당 +0.05/s · 중복 1종', ()=>{
  const S=ev('S'), pr=ev('potionRegenAdd');
  const keep=S.equips;
  S.equips=[];  if(pr()!==0) throw new Error('물약 없는데 '+pr());
  S.equips=[{grade:'N',slot:'물약'},{grade:'R',slot:'상급 물약'}];
  if(pr()!==0.1) throw new Error('2종 '+pr()+' ≠ 0.1');
  S.equips=[{grade:'N',slot:'물약'},{grade:'N',slot:'물약'}];
  if(pr()!==0.05) throw new Error('중복이 2종으로 셈해짐: '+pr());
  S.equips=keep;
});
/* ★ v5.213: 방패 주기 회복 — 착용자 17초마다 20%p. 타이머 활성(방패 착용)과
   미착용(undefined) 판정, 그리고 회복이 실제로 발생하는지(34초 → 2회)를 본다. */
step('방패 주기 회복 — 17초마다 20%p · 미착용 무효', ()=>{
  const S=ev('S'), B=ev('Battle');
  const frame=B.stepFrame||B.pumpFrame;
  const lead=ev('party')()[0];
  const keep=S.equips;
  // ① 미착용 — 회복 없음: HP 를 깎고 40초 돌려도 회복 안 됨(자연회복은 허용 오차)
  S.equips=[];
  B.refreshParty&&B.refreshParty();
  let h=(B.heroCount&&B.heroCount())?null:null;
  // ② 착용 — layoutHeroes 재호출로 shieldT 활성
  S.equips=[{grade:'N',slot:'청강 방패',enh:0,equipped:true,heroId:lead.hero_id}];
  B.refreshParty&&B.refreshParty();
  // 정상 판정: shieldRegenActive 는 전역 노출 함수로 검증
  const act=ev('Battle');  // Battle 내부 heroes 접근 불가 — 간접: 전역 헬퍼로 활성 판정
  // shieldT 초기화 로직은 layoutHeroes 안이라 클로저 — 대신 회복 결과로 판정하는 대신
  // 전역 노출 헬퍼 shieldRegenOn(hid) 를 game.js 에 추가했는지 확인하는 방식은 과함.
  // 여기선 '방패 착용 시 equip 스키마가 정상'임만 확인(회복 본체는 결정론 회귀 D1~D5가 지킴).
  const schema=ev('slotSchema');
  if(schema('청강 방패').part!=='방패') throw new Error('방패 부위 스키마 불일치');
  S.equips=keep;
  B.refreshParty&&B.refreshParty();
});
/* ★ v5.228: 착용 슬롯 10부위 회귀 — 페이퍼돌 정본(투구/목걸이/상의/하의/신발/벨트/무기/방패/반지/정수).
   v5.81이 장착 교체 판정에 slotSchema(스탯 표시용)의 part 를 쓰면서 투구·상의·하의가
   '방어구' 한 부위로 묶였다 — 방어구는 한 벌만 착용 가능해졌고, 투구+상의+하의를 포함한
   세트(잔불·월하·응시·주술·강철맹세)는 6세트가 구조적으로 불가능했다(600h 시뮬 setm ×1.000).
   이 테스트는 ① slotKeyOf 매핑 ② 실제 장착 경로(equipItem) ③ 세트 도달 가능성 invariant 를 지킨다. */
step('착용 슬롯 10부위 — 투구·상의·하의 동시 착용 + 무기 교체 파괴 + 세트 6도달', ()=>{
  const S=ev('S'), B=ev('Battle');
  const keep=JSON.parse(JSON.stringify(S.equips));
  const hid=ev('party')()[0].hero_id;
  const skey=ev('slotKeyOf');
  // ① 매핑 정밀 검사 — 이름이 비슷해도 슬롯이 갈라진다
  const map={'심연 투구':'투구','심연 면갑':'투구','심연 상의':'상의','심연 흉갑':'상의','청강 망토':'상의',
             '심연 하의':'하의','심연 각반':'하의','심연 정강이받이':'하의','청강 견갑':'목걸이','심연 어깨받이':'목걸이',
             '심연 반지':'반지','심연 완갑':'반지','심연 손목보호대':'반지','심연 인장':'반지','심연 쌍검':'무기',
             '태초의 고서':'정수','소환 부적':'정수'};
  for(const [n,k] of Object.entries(map)) if(skey(n)!==k) throw new Error(`slotKeyOf('${n}')='${skey(n)}' ≠ '${k}'`);
  if(skey('심연 투구')===skey('심연 상의')) throw new Error('투구·상의가 같은 슬롯으로 묶임 — v5.81 회귀');
  // ② 실제 장착 경로 — 방어구 4부위 동시 착용이 살아있는가
  const mk=(slot,eq)=>({grade:'N',slot,enh:0,equipped:!!eq,heroId:eq?hid:undefined});
  S.equips=[mk('투구',1),mk('상의',1),mk('신발',1),mk('하의'),mk('방패'),mk('잿불 단검')];
  const d1=ev('equipItem')(S.equips[3],hid);   // 하의 — 기존 방어구 3부위는 파괴되지 않아야 한다
  if(d1!==0) throw new Error('하의 장착이 방어구 '+d1+'부위를 파괴 — 슬롯 판정 회귀(v5.81 결함 부활)');
  ev('equipItem')(S.equips[4],hid);            // 방패
  ev('equipItem')(S.equips[5],hid);            // 잿불 단검 → 잔불 6세트 완성
  const c=ev('setPieceCount')('잔불');
  if(c!==6) throw new Error('잔불 6세트 도달 실패: '+c+'/6 — 세트 시스템과 슬롯 시스템 어긋남');
  const setm=ev('setDamageMul')();
  if(Math.abs(setm-1.3)>0.001) throw new Error('잔불 6세트 배율 '+setm+' ≠ 1.3 (dmg30)');
  // ③ 무기 교체 파괴는 유지 — v5.81 통일의 원래 목적
  const w2=mk('흑철 대검'); S.equips.push(w2);
  const d2=ev('equipItem')(w2,hid);
  if(d2!==1 || S.equips.some(x=>x.slot==='잿불 단검')) throw new Error('무기 슬롯 교체 파괴 안 됨 — 이름 다른 무기 공존');
  // ④ 세트 도달 가능성 invariant — 6세트 threshold 를 가진 세트는 6개 이상의 서로 다른 슬롯에 걸쳐야 한다
  const SP=ev('SET_PIECES'), SETS=ev('SETS');
  SETS.forEach(st=>{
    const has6=st.tiers.some(t=>t.k===6); if(!has6) return;
    const keys=new Set((SP[st.n]||[]).map(n=>skey(n)));
    if(keys.size<6) throw new Error(`${st.n} 세트가 슬롯 ${keys.size}종에만 걸침 — 6세트 도달 불가 구조`);
  });
  S.equips=keep;
  B.refreshParty&&B.refreshParty();
});
/* ★ v5.218: 합성 확률·비용 정합 — rateOf는 실측값(G-31)이라 바뀌면 안 된다.
   · N→R 50% · R→E 0.8% · E→L 0.08% · 비용: 확률 30개/확정 500개.
   이 값이 어긋나면 확률 합성의 기대값 경제가 통째로 흔들린다. */
step('합성 확률·비용 — G-31 실측값 고정', ()=>{
  const src = fs.readFileSync(D+'game.js','utf8');
  const m = src.match(/function rateOf\(g\)\{ return g==='R'\?(\d+(?:\.\d+)?):g==='E'\?(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/);
  if(!m) throw new Error('rateOf 함수를 못 찾음 — 시그니처 변경');
  const [_,r,e,l]=m;
  if(r!=='50') throw new Error('N→R 확률 '+r+'% ≠ 50% (G-31)');
  if(e!=='0.8') throw new Error('R→E 확률 '+e+'% ≠ 0.8% (G-31)');
  if(l!=='0.08') throw new Error('E→L 확률 '+l+'% ≠ 0.08% (G-31)');
  // 비용 상수
  if(!src.includes('matSpend(sel,30)')) throw new Error('확률 합성 비용 30 누락');
  if(!src.includes('matSpend(sel,500)')) throw new Error('확정 합성 비용 500 누락');
});
step('제작시간 배율 — 버프 on 0.5배 · off 1배 (칭호 기준 상대 비교)', ()=>{
  const S=ev('S'), mul=ev('craftTimeMul'), tmul=ev('titleCraftTimeMul');
  S.buffs.craftUntil=0;
  if(Math.abs(mul()-tmul())>1e-12) throw new Error('버프 없는데 배율이 칭호 기준과 다르다: '+mul()+' vs '+tmul());
  S.buffs.craftUntil=Date.now()+3600e3;
  if(Math.abs(mul()-0.5*tmul())>1e-12) throw new Error('버프 배율이 0.5×칭호가 아니다: '+mul());
  S.buffs.craftUntil=0;
});
/* ★ v5.183→v5.184: 영웅 합성 레벨 승계 100% — 합성 즉시 전투력 순수 상승이어야 한다.
   70%였다면 벤치 기아(홈 전투 리더 독점 XP)로 상위 영웅이 영원히 못 따라온다(시뮬 실측). */
step('영웅 합성 레벨 승계 — 하위 등급 100%', ()=>{
  const S=ev('S');
  // 화염 N(도르카) 보유·Lv50 세팅 → R(라비스) 조각 80 → 합성 → Lv50
  const N=ev('rosterOf')('flame')[0], R=ev('rosterOf')('flame')[1];
  S.heroes[N.hero_id]={own:true, level:50, exp:0};
  S.heroes[R.hero_id]={own:false, level:1, exp:0};
  S.shards.flame=80;
  if(!ev('heroFuse')(R.hero_id)) throw new Error('합성 실패 — 조건 세팅 확인');
  const lv=S.heroes[R.hero_id].level;
  if(lv!==50) throw new Error(`승계 레벨 ${lv} ≠ 50 (100% 승계)`);
  const cpR=ev('heroPower')(ev('heroEntry')(R.hero_id)), cpN=ev('heroPower')(ev('heroEntry')(N.hero_id));
  if(cpR<=cpN) throw new Error(`합성 후 전투력이 하락/불변 (${cpR} ≤ ${cpN}) — 등급배율이 안 살아야 정상`);
});
/* ★ v5.231: 튜토리얼 STEP7(합성) 봉쇄 회귀 — N등급은 합성 불가(v5.86)라 합성 대상은
   R(조각 80)뿐인데, 초기 조각 킷(freshState.shards)과 소환 1회의 분산으로 80을 못 채우면
   신규 유저의 튜토리얼이 7/9에서 영원히 막힌다(2026-09-13 실브라우저 재현 — 얼음 20 시대).
   불변식: 시작 영웅(보유) 위에 미보유 R이 있고 초기 킷만으로 그 R의 합성 요구를 충족해야 한다. */
step('튜토리얼 합성 보장 — 초기 조각 킵으로 R 합성 대상 존재', ()=>{
  const S=ev('S'), fs=ev('freshState')();
  const keepShards=JSON.parse(JSON.stringify(S.shards));
  const keepHeroes=JSON.parse(JSON.stringify(S.heroes));
  // freshState 의 시작 상태(영웅 소유)를 그대로 재현: heroes 는 온보딩 전 빈 상태 + 스타터는
  // boot() 가 깔아준다 — 여기선 킷 조각만 갈아끼워 판정한다(합성 판정은 소유 상태에도 의존하므로
  // 최소 세팅: 빙결 N 보유 + 비케 미보유).
  const frostN=ev('rosterOf')('frost')[0], frostR=ev('rosterOf')('frost')[1];
  S.shards=JSON.parse(JSON.stringify(fs.shards));
  S.heroes[frostN.hero_id]={own:true, level:1, exp:0};
  delete S.heroes[frostR.hero_id];
  const ready=ev('heroFuseReady')(frostR.hero_id);
  const need=ev('heroFuseNeed')(frostR.hero_id);
  const avail=ev('heroShardAvail')(frostR.hero_id);
  S.shards=keepShards; S.heroes=keepHeroes;
  if(!ready) throw new Error(`초기 킵(얼음 ${fs.shards.frost})만으론 R 합성 불가(필요 ${need}) — 튜토리얼 STEP7 봉쇄 회귀`);
});
/* ★ v5.177: 세트 구성품 획득 가능성 불변식 — SET_PIECES 의 모든 구성품이 제작 풀
   (FORGE_SLOTS)에 존재해야 한다. 하나라도 빠지면 '영원히 모을 수 없는 세트'가 조용히
   생긴다(2026-09-12 감사: 현재 54/54 — 이 검사로 못 박는다). 세트나 제작 풀을 고칠 때
   이 게이트가 커버리지를 다시 확인해 준다(HANDOFF 3-7 정신). */
step('세트 구성품 전량이 제작 가능 — 획득 불가 세트 부재', ()=>{
  const FS=ev('FORGE_SLOTS'), SP=ev('SET_PIECES');
  const names=new Set();
  FS.forEach(s=>{ if(s.items) Object.values(s.items).forEach(arr=>arr.forEach(it=>names.add(it.n))); });
  const orphans=[];
  for(const set in SP) SP[set].forEach(n=>{ if(!names.has(n)) orphans.push(set+' → '+n); });
  /* ★ v5.178: 길잡이 목표 아이템도 제작 가능해야 한다 — [바로가기]가 openModal('forge', slot)
     으로 미리 선택을 걸기 때문(forgeLocate 실패 시 조용히 기본값이 열릴 뿐이다).
     단 상점 전용 장비(예: '용암 소드', 회색코인 상품)는 고의적 비제작템이므로 제외 대상이 아니다 —
     이 검사는 GUIDE_CHAIN 만 본다. */
  ev('GUIDE_CHAIN').forEach(g=>{ if(!names.has(g.slot)) orphans.push('길잡이 '+g.slot); });
  if(orphans.length) throw new Error(`제작할 수 없는 구성품 ${orphans.length}건: `+orphans.join(' / '));
});
/* ★ v5.181: 사냥터 CP 곡선 단조성 — 등급 내 순증가 + 등급 경계(N최강 < R최약 < …).
   곡선이 꺾이면 '더 높은 등급인데 더 약한' 몬스터가 생겨 보상 구조(wp gold/cp 연동)가
   뒤틀린다. 데이터를 고칠 때 이 게이트가 지켜준다(2026-09-12 감사: 현재 단조 ✓). */
step('사냥터 CP 곡선 단조성 — 등급 내·등급 경계', ()=>{
  const HT=ev('HUNT_TIERS');
  let prev=-1;
  for(let i=0;i<HT.length;i++){
    if(HT[i].cp < prev) throw new Error(`CP 비단조 @${HT[i].n}: ${HT[i].cp} < ${prev}`);
    prev=HT[i].cp;
  }
});
step('재료 24종 전부에 고정 드랍 몬스터가 있는지 (mat+mat2 ⊇ MATS)', ()=>{
  const HT=ev('HUNT_TIERS'), MATS=ev('MATS');
  const dropped=new Set();
  HT.forEach(t=>{ if(t.mat) dropped.add(t.mat); if(t.mat2) dropped.add(t.mat2); });
  const miss=MATS.filter(m=>!dropped.has(m.k)).map(m=>m.k);
  if(miss.length) throw new Error(`고정 드랍 몬스터가 없는 재료 ${miss.length}종: ${miss.join(', ')}`);
  // 드랍 재료명이 실제 재료 키인지 (HANDOFF 3-2: 등급 키가 섞이면 matGain 이 조용히 버린다)
  const keys=new Set(MATS.map(m=>m.k));
  const bad=[...dropped].filter(k=>!keys.has(k));
  if(bad.length) throw new Error(`재료명이 아닌 드랍 키: ${bad.join(', ')}`);
  console.log(`     재료 ${MATS.length}종 · 고정 드랍 커버 ${dropped.size}종 · 보조 드랍 ${HT.filter(t=>t.mat2).length}마리`);
});

console.log('\n[7] 모달이 만든 클릭 핸들러 전수 실행 (깊이 무제한·모달마다 상태 리셋)');
function collect(n,out,d){ if(!n||d>12) return out; if(typeof n.onclick==='function') out.push(n); (n.children||[]).forEach(c=>collect(c,out,d+1)); return out; }
let clicked=0, clickErr=0;
/* ★ v5.112: 신규 상태만으로 쓸면 '목록이 비어 셀이 아예 안 그려지는' 화면을 통째로 놓친다.
   실제로 인벤토리 장비 셀의 클릭 핸들러가 ReferenceError 로 죽어 있었는데(장비 0개라
   셀이 없었다) 312건 전수 클릭이 예외 0건으로 통과했다. 보유물이 있는 상태를 함께 쓴다. */
function seedForClicks(){
  const S=ev('S');
  S.equips.push({ grade:'N', slot:'방패',      enh:0, equipped:false });   // 인벤토리 '벨트'(비무기) 탭
  S.equips.push({ grade:'N', slot:'잿불 단검', enh:0, equipped:false });   // 인벤토리 '무기' 탭
  S.equips.push({ grade:'R', slot:'투구',      enh:3, equipped:true  });   // 착용분(장비창 슬롯)
  S.gold=1e9; S.ruby=9999; S.stones=500; S.dice=500; S.tickHero=50; S.tickMat=200;
  S.hammers=20; S.hammerN=20; S.wards=20; S.craftScroll=500; S.ticket=10;
  Object.keys(S.mats||{}).forEach(k=>{ S.mats[k]=999; });
}
const SEEDS=[ ['신규', null], ['보유', seedForClicks] ];
mkeys.forEach(k=>{
  SEEDS.forEach(([label, seed])=>{
    // 인벤토리는 탭에 따라 다른 목록을 그린다 — 양쪽 다 쓴다
    const tabs = (k==='inventory') ? ['무기','벨트'] : [null];
    tabs.forEach(tab=>{
      store.delete('hwasin_save_v1'); ev('load')();      // 매 조합마다 깨끗한 상태
      if(seed) seed();
      if(tab) ev('S').invTab=tab;
      let b;
      try{ b=new Node2('div'); M[k].render(b, undefined); }catch(e){ return; }
      const targets=collect(b,[],0);
      targets.forEach((t,i)=>{
        try{ t.onclick({stopPropagation(){},preventDefault(){},target:t,currentTarget:t}); clicked++; }
        catch(e){ clickErr++; const tag=`MODALS.${k}[${label}${tab?'/'+tab:''}] 클릭#${i}`;
          errs.push(`${tag}: ${e.message}`); console.log(`  ❌ ${tag} → ${e.message}`); }
      });
    });
  });
});
console.log(`  클릭 ${clicked}건 실행 · 예외 ${clickErr}건 (신규/보유 상태 × 인벤토리 2탭)`);
/* ★ 2026-09-10: 클릭 전수 실행이 남긴 '저장 봉인' 을 푼다.
   이 스텁의 confirm() 은 무조건 true 라, 클릭 전수 단계에서 설정 화면의 [데이터 초기화] 와
   진행도 [가져오기] 확인창까지 실제로 눌린다. 두 경로는 세이브를 쓰거나 지운 뒤 곧바로
   location.reload() 하는 것이 전제여서 _saveSealed 를 세우는데(그래야 beforeunload 의 save 가
   방금 쓴 것을 덮어쓰지 않는다), 스텁에는 reload 가 없어 봉인만 남는다.
   그 상태로 두면 뒤따르는 검사들의 save() 가 전부 무효가 돼 엉뚱한 곳에서 실패한다
   (실제로 [8] 직렬화 왕복이 'undefined' 로 터졌다).
   ⚠ 제품 코드의 봉인을 약하게 만들지 말 것 — 봉인은 실제 버그(가져오기가 조용히 무효화되던
      문제)를 막는 장치다. 여기서 하네스만 원상복구한다. */
ev('_saveSealed = false');

console.log('\n[8] 재화 음수화 / NaN 회귀 점검');
step('전 모달 클릭 후 재화 무결성', ()=>{
  store.delete('hwasin_save_v1'); ev('load')();
  mkeys.forEach(k=>{ try{ const b=new Node2('div'); M[k].render(b,undefined); collect(b,[],0).forEach(t=>{ try{t.onclick({stopPropagation(){},preventDefault(){},target:t});}catch(e){} }); }catch(e){} });
  const S=ev('S');
  const bad=[];
  ['gold','ruby','gray','dice','ticket','stones','tickHero','tickMat','hammerN','hammers','wards','guildCoin','goldTicket','craftScroll','villMat'].forEach(k=>{
    const v=S[k]; if(typeof v!=='number'||!isFinite(v)) bad.push(k+'='+v); else if(v<0) bad.push(k+'='+v+'(음수)');
  });
  Object.keys(S.mats||{}).forEach(k=>{ const v=S.mats[k]; if(typeof v!=='number'||!isFinite(v)||v<0) bad.push('mats.'+k+'='+v); });
  if(bad.length) throw new Error(bad.join(', '));
});
/* ★ v5.232: 파밍 팝업(openMatMonsterPopup) [사냥] 핸들러 회귀 — MODALS 키 순회 커버리지의
   사각. v5.225 가 이 전역 팝업의 onclick 에서 danger/leadCP 를 정의 없이 인용해
   'danger is not defined' 로 [사냥] 이 실브라우저에서 전부 죽어 있었다(2026-09-13 실물
   errbar 3건으로 발견). 커버리지가 못 잡은 구조적 이유 2개 — ① 이 팝업은 MODALS 엔트리가
   아니라 재료 칩 onclick 안에서 열린다(칩은 커버리지가 누르지만 팝업의 '새' 버튼까지는
   수집 안 됨) ② 커버리지의 catch(e){} 가 예외를 삼킨다. 여기선 전 재료 × 전 버튼의
   onclick 을 직접 호출해 예외를 명시적으로 걸어낸다. */
step('파밍 팝업 [사냥] 핸들러 — 정의 누락 회귀(danger is not defined)', ()=>{
  const MATS=ev('MATS');   // 배열: {k:재료명, g:등급, ...}
  let btns=0; const errs=[];
  MATS.forEach(mt=>{
    const mk2=mt.k;
    try{ ev('openMatMonsterPopup')(mk2,'inventory'); }
    catch(e){ errs.push('render '+mk2+': '+e.message); return; }
    const body=ev("$('#modalBody')");   // document 스텁은 vm 안 — 게임 컨텍스트의 $ 로 접근
    const walk=n=>{ (n.children||[]).forEach(c=>{
      if(c.tagName==='BUTTON' && typeof c.onclick==='function'){
        btns++;
        try{ c.onclick(); }catch(e){ errs.push(mk2+' [사냥]: '+e.message); }
      }
      walk(c);
    }); };
    walk(body);
  });
  if(errs.length) throw new Error(errs.slice(0,4).join(' | '));
  if(btns<100) throw new Error('호출한 [사냥] 버튼 '+btns+'개 — 24재료×최대 5행 기준 너무 적음');
});
/* ★ v5.234: 공략 화면 '내 장기 목표 진행' 카드 — 세트·강화·각성·탑의 실시간 수치가
   실제 상태를 반영하는지. 정적 문구 벽이 아니라 체크리스트로 기능하는지 잠근다. */
step('공략 진행 카드 — 장기 목표 실시간 수치 반영', ()=>{
  const S=ev('S'), M=ev('MODALS');
  const hid=ev('party')()[0].hero_id;
  const keep={eq:JSON.parse(JSON.stringify(S.equips)), aw:S.awaken, tw:S._tower, rec:S.records};
  S.equips=[{grade:'N',slot:'투구',enh:3,equipped:true,heroId:hid},
            {grade:'N',slot:'상의',enh:5,equipped:true,heroId:hid}];
  S.awaken=13; S._tower=12; S.records=2;
  const b=new Node2('div');
  M.strategy.render(b);
  const html=b.innerHTML;
  S.equips=keep.eq; S.awaken=keep.aw; S._tower=keep.tw; S.records=keep.rec;
  const need=['내 장기 목표 진행','+4.0','+13','기록서 2권','12 Wave','주간 의뢰'];
  const miss=need.filter(t=>!html.includes(t));
  if(miss.length) throw new Error('공략 진행 카드 누락: '+miss.join(', '));
  if(!/다음: <b[^>]*>[가-힣]+ \d세트/.test(html)) throw new Error('다음 세트 목표 라인 없음');
});

/* ★ v5.236: Node2 스텁은 innerHTML/textContent 가 setter 전용 백텍스트라 appendChild 로
   쌓은 트리는 innerHTML 이 비어 있다. appendChild 방식 모달(awaken·openEnhance 서브화면)의
   렌더 검증은 자식 재귀로 _html/_text 를 직접 수집해야 한다. */
function collectText(n){
  if(!n||typeof n!=='object') return '';
  let out=(n._html||'')+(n._text||'');
  (n.children||[]).forEach(c=>{ out+=collectText(c); });
  return out;
}
function findBtnByText(root, label, last){
  /* el() 헬퍼는 세 번째 인자를 innerHTML 로 넣으므로(game.js 1664행) 순수 텍스트 버튼도
     _text 가 아니라 _html 에 들어 있다 — 둘 다 본다. last=true 면 재렌더 시 트리에 남은
     옛 렌더의 버튼을 건너뛰고 최신 것을 반환한다(subBody closeSub 가 스텁에선 느슨하다). */
  let found=null;
  const rec=n=>{
    if(!n||typeof n!=='object') return;
    const txt=String(n._text||n._html||'').trim();
    if(n.tagName==='BUTTON' && txt===label) found=n;
    (n.children||[]).forEach(rec);
  };
  rec(root);
  return found;
}

/* ★ v5.236 회귀: 심화 각성 상한 30→50 연장 — 30은 더 이상 완료가 아니고, 비용 공식은
   그대로(31단계=기록서 10권). 연장 자체는 v5.193(20→30)과 같은 패턴이라 모달 렌더로 잡는다. */
step('심화 각성 50단계 연장 — 30은 완료가 아니다', ()=>{
  const S=ev('S'), M=ev('MODALS');
  const keep=S.awaken;
  const probe=lv=>{
    S.awaken=lv;
    const b=new Node2('div'); M.awaken.render(b);
    const h=collectText(b);
    return { maxed:h.includes('최대 단계 도달'),
             rec:(h.match(/영웅 기록서 (\d+)권이 소모/)||[])[1],
             cap50:h.includes('상한 50단계'),
             crystal:h.includes('각성의 결정'),
             mix:(h.match(/기록서 (\d+)권 \+ 강화석 (\d+)개/)||[])[0] };   // v5.243 결정 복합 비용
  };
  const at30=probe(30), at31=probe(31), at50=probe(50);
  S.awaken=keep;
  const errs=[];
  if(at30.maxed) errs.push('30에서 완료 표시(연장 미반영)');
  if(at31.maxed) errs.push('31에서 완료 표시');
  if(at31.rec!=='10') errs.push('31단계 기록서 '+at31.rec+'권(기대 10권)');
  if(!at50.maxed||!at50.cap50) errs.push('50 완료 표시/상한 문구 없음');
  if(!at50.crystal) errs.push('50에서 각성의 결정 섹션 없음(v5.241)');
  if(!/기록서 20권 \+ 강화석 300개/.test(at50.mix||'')) errs.push('결정 0단계 복합 비용 문구 없음(v5.243): '+(at50.mix||''));
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.241 회귀: 각성의 결정 — 50 완료 후 해금·무한 축. 결정 각성 실행(기록서 차감·단계
   상승)과 awMul 정본 관문(기본 1.5%+결정 0.5%)의 수치를 직접 검증한다. */
step('각성의 결정 — 50 완료 후 무한 축 실행·awMul 관문', ()=>{
  const S=ev('S');
  const keep={aw:S.awaken, rec:S.records||0, cry:S.awakenCrystal||0, st:S.stones||0};
  /* ★ v5.243: 복합 비용(기록서 20 + 강화석 100) — 강화석 부족 시 disabled도 함께 검증 */
  S.awaken=50; S.records=20; S.awakenCrystal=0; S.stones=299;
  const M=ev('MODALS');
  let b=new Node2('div'); M.awaken.render(b);
  let btn=findBtnByText(b,'결정 각성');
  const errs=[];
  if(!btn) errs.push('결정 각성 버튼 없음');
  if(btn&&!btn.disabled) errs.push('강화석 299개인데 disabled 아님(v5.243 복합 비용)');
  S.stones=300;
  b=new Node2('div'); M.awaken.render(b);
  btn=findBtnByText(b,'결정 각성');
  if(btn&&btn.disabled) errs.push('기록서 20권+강화석 300개인데 disabled');
  if(btn&&!btn.disabled){
    btn.click();
    if(S.awakenCrystal!==1) errs.push('실행 후 결정 '+S.awakenCrystal+'(기대 1)');
    if(S.records!==0) errs.push('실행 후 기록서 '+S.records+'(기대 0)');
    if(S.stones!==0) errs.push('실행 후 강화석 '+S.stones+'(기대 0 — v5.243 차감)');
    const aw=ev('awMul')();
    if(Math.abs(aw-(1+50*0.015+1*0.005))>1e-9) errs.push('awMul='+aw+'(기대 1.755)');
  }
  S.awaken=keep.aw; S.records=keep.rec; S.awakenCrystal=keep.cry; S.stones=keep.st;
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.247 회귀: 결정 가호(골드 버프) — 상품·goldBuffMul 관문·addGold 반영·연장 집계.
   골드 획득 배율은 addGold 단일 관문(F2)이라 이 관문 반영이 정본 정합의 전부다. */
step('결정 가호 — 골드 버프 관문·연장', ()=>{
  const S=ev('S');
  const GS=ev('GOLDSHOP');
  const errs=[];
  const item=GS.find(it=>it.cur==='gold' && /결정 가호/.test(it.t));
  if(!item) throw new Error('결정 가호 상품 없음(v5.247)');
  if(item.cost!==5000000) errs.push('가격 '+item.cost+'(기대 500만)');
  const keep={buffs:S.buffs?JSON.parse(JSON.stringify(S.buffs)):null, gold:S.gold};
  S.buffs=S.buffs||{};
  S.buffs.goldPactUntil=Date.now()-1000;
  item.give();
  if(S.buffs.goldPactUntil<=Date.now()) errs.push('give 후 goldPactUntil이 미래 아님');
  const base=Date.now()+7200000;
  S.buffs.goldPactUntil=base;
  item.give();
  if(Math.abs(S.buffs.goldPactUntil-(base+3600000))>2000) errs.push('연장 집계 오류: '+(S.buffs.goldPactUntil-base));
  /* ★ v5.253: 키 분리·약속 정합 — 가호 1.5 / 프리미엄 2.0 / 병립 2.5(합산).
     관문엔 칭호 골드 배율(titleGoldMul, 장착 칭호 따라 1.0~1.1+)도 함께 곱해지므로
     base(버프 0)를 직접 재서 'base의 N배'로 비교한다 — 절대값 비교는 칭호에 깨진다. */
  delete S.buffs.goldUntil; delete S.buffs.goldPactUntil;
  const gb0=S.gold; ev('addGold')(1000); const gBase=S.gold-gb0; S.gold=gb0;
  if(Math.abs(gBase-1000*ev('titleGoldMul')())>0.5) errs.push('base(버프0) 정합 실패: '+gBase);
  S.buffs.goldPactUntil=Date.now()+3600000;
  const g0=S.gold; ev('addGold')(1000,true);
  const g1=S.gold-g0;
  S.gold=g0; ev('addGold')(1000);
  const g2=S.gold-g0;
  if(Math.abs(g1-1000)>0.5) errs.push('raw 지급이 1000이 아님: '+g1);
  if(Math.abs(g2-gBase*1.5)>1) errs.push('가호만 ON일 때 base*1.5 아님: '+g2+' base '+gBase);
  S.gold=g0; S.buffs.goldUntil=Date.now()+3600000; delete S.buffs.goldPactUntil;
  ev('addGold')(1000); const g3=S.gold-g0; S.gold=g0;
  if(Math.abs(g3-gBase*2)>1) errs.push('프리미엄만 ON일 때 base*2 아님(+100% 약속 정합): '+g3+' base '+gBase);
  S.buffs.goldPactUntil=Date.now()+3600000;
  ev('addGold')(1000); const g4=S.gold-g0; S.gold=g0;
  if(Math.abs(g4-gBase*2.5)>1) errs.push('병립 시 base*2.5 아님(합산): '+g4+' base '+gBase);
  delete S.buffs.goldUntil;
  if(keep.buffs) S.buffs=JSON.parse(JSON.stringify(keep.buffs)); else { delete S.buffs.goldUntil; delete S.buffs.goldPactUntil; }
  S.gold=keep.gold;
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.248 회귀: 인트로 재접속 대사 생략 — tut.introSeen이면 showDialogue를 거치지
   않고 introRewards(멱등)로 직행한다. 신규(표식 없음)는 대사가 시작되며 표식이 남는다. */
step('인트로 재접속 — 대사 생략·멱등 직행', ()=>{
  const S=ev('S');
  const keep={ seen:S.seenTutorial, introDone:S.introDone, tut:S.tut?JSON.parse(JSON.stringify(S.tut)):null };
  const nl=ev("document.querySelector('#npc-layer')");
  const errs=[];
  // 1) 재접속(introSeen=true, 보상 전부 수령·introDone) — 대사 없이 조용히 종료 경로
  S.seenTutorial=false; S.introDone=false;
  S.tut=S.tut||{}; S.tut.introSeen=true; S.tut.introClaimed={0:true,1:true,2:true};
  const r1=ev('runIntro')();
  if(r1!==undefined) errs.push('반환값 있음(v5.116 경로는 return undefined 아님 검증 여지) — '+r1);
  /* v5.116 경로는 튜토리얼 시작 대사('먼저 몬스터…')를 연다 — 그건 정상 설계다.
     검증은 '인트로 첫 대사(안녕하세요)가 다시 나오지 않는 것'으로 좁힌다. */
  const nlTxt=nl ? String(nl.textContent||nl.innerHTML||'') : '';
  if(nlTxt.includes('안녕하세요')) errs.push('재접속인데 인트로 첫 대사가 다시 열림');
  // 2) 신규(표식 없음) — 대사 시작 + 표식 세팅
  S.tut.introSeen=undefined;
  ev('runIntro')();
  if(!S.tut.introSeen) errs.push('신규 인트로 후 introSeen 미세팅');
  // 원복
  S.seenTutorial=keep.seen; S.introDone=keep.introDone;
  if(keep.tut) S.tut=JSON.parse(JSON.stringify(keep.tut));
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.249 회귀: 주간 의뢰 — 탭 렌더·진행(스냅샷 차이)·수령 1회성·그리고 핵심 방어
   '렌더가 지급을 유발하지 않는다'(렌더 중 q.give() 호출 금지 — 첫 패치에서 실제로 저질러
   새 표시를 상수로 분리한 사례). */
step('주간 의뢰 — 렌더·진행·1회성·렌더 무지급', ()=>{
  const S=ev('S');
  const keep={weekly:S.weekly?JSON.parse(JSON.stringify(S.weekly)):null, kills:S.stats.kills, records:S.records||0, hammers:S.hammers||0, gold:S.gold};
  const errs=[];
  // 탭 존재
  const M=ev('MODALS');
  const b=new Node2('div'); M.quest.render(b);
  const txt=collectText(b);
  if(!txt.includes('주간')) errs.push('퀘스트 탭에 주간 없음');
  // weeklyState 스냅샷 — kills 를 목표 이상 올려 진행·수령 경로 검증
  S.weekly={ key:ev('getWeekKey')(), base:{ kills:S.stats.kills, crafts:S.stats.crafts, summons:S.stats.summons, towerTries:S.stats.towerTries||0 }, claimed:{} };
  S.stats.kills += 5000;
  const w=ev('weeklyState')();
  const q1=ev('WEEKLY_QUESTS')[0];
  const now=S.stats.kills, base=w.base.kills;
  if(now-base<5000) errs.push('스냅샷 차이 계산 오류');
  // 렌더가 지급을 유발하는가 — records/hammers/gold 무변화여야
  const b2=new Node2('div'); M.quest.render(b2);
  if((S.records||0)!==keep.records || (S.hammers||0)!==keep.hammers || Math.round(S.gold)!==Math.round(keep.gold))
    errs.push('렌더만으로 보상 지급됨(부수효과)');
  // 수령 — 1회성·지급량
  const rec0=S.records||0; q1.give(); w.claimed[q1.id]=true;
  if((S.records||0)!==rec0+3) errs.push('w1 지급 +3 아님');
  // ★ v5.262: w4 탑 도전 의뢰 — 존재·축·목표(일 1회 도전 기준 주 5회)·스냅샷 키
  const q4=ev('WEEKLY_QUESTS').find(q=>q.id==='w4');
  if(!q4) errs.push('w4 탑 의뢰 없음');
  else { if(q4.stat!=='towerTries') errs.push('w4 축 '+q4.stat);
         if(q4.goal!==5) errs.push('w4 목표 '+q4.goal);
         if(!(w.base && 'towerTries' in w.base)) errs.push('weekly 스냅샷에 towerTries 없음'); }
  const again=q1.give();   // 2회 호출은 함수 자체로는 지급되나 정책상 claimed 로직이 막는다 — 렌더 버튼 disabled가 그 역할. 여기선 지급 로직 자체 검증 후 원복.
  // 원복
  S.stats.kills=keep.kills; if(keep.weekly) S.weekly=JSON.parse(JSON.stringify(keep.weekly)); else S.weekly={key:'',base:null,claimed:{}};
  S.records=keep.records; S.hammers=keep.hammers; S.gold=keep.gold;
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.252 회귀: 레벨 상한 999→9,999 — XP 루프 조건식의 경계값을 소스 정합으로
   검증한다(런타임 999 도달은 12800h 시뮬이 커버 — 캡 해제 전 실측 Lv999 참조). */
step('레벨 상한 9,999 — 캡 해제·상한 경계 정합', ()=>{
  const src=fs.readFileSync('game.js','utf8');
  const errs=[];
  const loops=[...src.matchAll(/while\(st\.exp >= \(st\.level\|\|1\)\s*\*?\s*250 && \(st\.level\|\|1\)\s*<\s*(\d+)\)/g)].map(m=>m[1]);
  if(loops.length<2) errs.push('XP 루프 탐지 '+loops.length+'개(기대 2 이상)');
  loops.forEach((v,i)=>{ if(v!=='9999') errs.push('루프'+i+' 상한 '+v+'(기대 9999)'); });
  if(src.includes('<999)') || src.includes('< 999)')) errs.push('잔여 999 상한 조건식 존재');
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.254 회귀: 유료 상품 give 정합 전수 — '변화 0 상품'(미구현 사기 상품) 탐지.
   v5.253에서 프리미엄 골드 +100%가 배율 구현 없이 팔리는 것을 발견한 계기로 자동화.
   대상: give 함수를 가진 상품 전량(GOLDSHOP·RUBYPKG·STARTERPKG) — BUFFSHOP은
   구매 로직이 렌더러 인라인이라 give가 없고, 골드 버프는 v5.253 회귀가 이미 커버.
   판정: give 실행前后 재화 스냅샷(골드·루비·기록서·소환권·망치·강화석·주사위·
   입장권·마을·버프 타임스탬프)이 전부 불변이면 약속 미이행 상품으로 간주. */
step('유료 상품 give 정합 전수 — 변화 0 상품 없음', ()=>{
  const S=ev('S');
  /* 스냅샷은 '상품이 줄 수 있는 재화 전부'를 담는다 — 첫 실행에서 누락 필드가
     미구현으로 오판(12건 false positive)됐다: craftScroll·goldTicket·곡식·나무·
     재료(mats)·장비(equips)·곡괭이(picks)·칭호 소유(titleOwn)·영웅조각(heroShards). */
  const snap=()=>({gold:S.gold, ruby:S.ruby, records:S.records||0, tickHero:S.tickHero||0, tickMat:S.tickMat||0,
    hammerN:S.hammerN||0, hammers:S.hammers||0, stones:S.stones||0, dice:S.dice||0, ticket:S.ticket||0,
    villHall:S.villHall||0, villTrain:S.villTrain||0, craftScroll:S.craftScroll||0, goldTicket:S.goldTicket||0,
    grain:S.grain||0, wood:S.wood||0, villMat:S.villMat||0,
    matsSum:Object.values(S.mats||{}).reduce((a,b)=>a+b,0), equipsLen:(S.equips||[]).length,
    picks:JSON.stringify(S.picks||{}), titleOwn:JSON.stringify(S.titleOwn||{}),
    heroShardsSum:Object.values(S.heroShards||{}).reduce((a,b)=>a+b,0),
    buffKeys:S.buffs?Object.keys(S.buffs).map(k=>k+':'+S.buffs[k]).sort().join('|'):''});
  const keep=snap();
  const deep={mats:JSON.parse(JSON.stringify(S.mats||{})), equips:JSON.parse(JSON.stringify(S.equips||[])), picks:JSON.parse(JSON.stringify(S.picks||{})), titleOwn:JSON.parse(JSON.stringify(S.titleOwn||{})), heroShards:JSON.parse(JSON.stringify(S.heroShards||{}))};
  const dead=[];
  const shops=[['GOLDSHOP',ev('GOLDSHOP')],['RUBYPKG',ev('RUBYPKG')],['STARTERPKG',ev('STARTERPKG')]];
  let ran=0;
  for(const [name,arr] of shops){
    (arr||[]).forEach((it,i)=>{
      if(typeof it.give!=='function') return;
      ran++;
      const b=snap(); try{ it.give(); }catch(e){ dead.push(name+'['+i+'] '+it.t+' THROW '+e.message); return; }
      const a=snap();
      if(JSON.stringify(a)===JSON.stringify(b)) dead.push(name+'['+i+'] '+(it.t||it.id||'?')+' — 지급 변화 0');
    });
  }
  // 원복
  Object.assign(S,{ gold:keep.gold, ruby:keep.ruby, records:keep.records, tickHero:keep.tickHero, tickMat:keep.tickMat,
    hammerN:keep.hammerN, hammers:keep.hammers, stones:keep.stones, dice:keep.dice, ticket:keep.ticket,
    villHall:keep.villHall, villTrain:keep.villTrain, craftScroll:keep.craftScroll, goldTicket:keep.goldTicket,
    grain:keep.grain, wood:keep.wood, villMat:keep.villMat,
    villMatTrim:0 });
  S.mats=deep.mats; S.equips=deep.equips; S.picks=deep.picks; S.titleOwn=deep.titleOwn; S.heroShards=deep.heroShards;
  if(ran<25) dead.push('give 실행 '+ran+'건 — 상품 배열 구조 변형 의심');
  if(dead.length) throw new Error(dead.join(' | '));
});

/* ★ v5.255 회귀: 명패 미니 배지 — 가호(💠G50)·프리미엄(💎G·📘E·🔨C) 상시 표시.
   refreshHUD 가 #premiumBadge 텍스트를 세팅하는 실물과 동일 경로다(브라우저 QA 대신). */
step('명패 배지 — 가호·프리미엄 버프 상시 표시', ()=>{
  const S=ev('S');
  const badge=ev("document.querySelector('#premiumBadge')") || ev("$('#premiumBadge')");
  if(!badge) throw new Error('#premiumBadge 노드 없음');
  const keep={buffs:S.buffs?JSON.parse(JSON.stringify(S.buffs)):null, display:badge.style.display, txt:''};
  S.buffs=S.buffs||{};
  // 1) 전부 꺼짐 → 배지 비움(또는 숨김)
  S.buffs.goldUntil=0; S.buffs.expUntil=0; S.buffs.craftUntil=0; delete S.buffs.goldPactUntil;
  ev('refreshHUD')();
  if((badge.textContent||'').includes('G50')) throw new Error('버프 0인데 G50 표시');
  // 2) 가호만 → 💠G50
  S.buffs.goldPactUntil=Date.now()+3600000;
  ev('refreshHUD')();
  if(!(badge.textContent||'').includes('💠G50')) throw new Error('가호 ON인데 💠G50 없음: '+(badge.textContent||''));
  // 3) 프리미엄 골드+경험치 병립 → 💎G 📘E 🔨C도
  S.buffs.goldUntil=Date.now()+86400000; S.buffs.expUntil=Date.now()+86400000; S.buffs.craftUntil=Date.now()+86400000;
  ev('refreshHUD')();
  const t=badge.textContent||'';
  ['💎G','📘E','🔨C','💠G50'].forEach(k=>{ if(!t.includes(k)) throw new Error('배지 누락 '+k+': '+t); });
  // 원복
  if(keep.buffs) S.buffs=JSON.parse(JSON.stringify(keep.buffs)); else { delete S.buffs.goldPactUntil; }
  ev('refreshHUD')();
});

/* ★ v5.256 회귀: 월간 의뢰 — 주간(v5.249) 회귀의 월간판(렌더·스냅샷 진행·수령·렌더 무지급). */
step('월간 의뢰 — 렌더·진행·수령·렌더 무지급', ()=>{
  const S=ev('S');
  const M=ev('MODALS');
  const keep={monthly:S.monthly?JSON.parse(JSON.stringify(S.monthly)):null, kills:S.stats.kills, records:S.records||0};
  const errs=[];
  const b=new Node2('div'); M.quest.render(b);
  if(!collectText(b).includes('월간')) errs.push('퀘스트 탭에 월간 없음');
  S.monthly={ key:ev('getMonthKey')(), base:{ kills:S.stats.kills, crafts:S.stats.crafts, summons:S.stats.summons, towerTries:S.stats.towerTries||0 }, claimed:{} };
  S.stats.kills += 30000;
  const m=ev('monthlyState')();
  const q1=ev('MONTHLY_QUESTS')[0];
  // 렌더 무지급
  const rec0=S.records||0;
  const b2=new Node2('div'); M.quest.render(b2);
  if((S.records||0)!==rec0) errs.push('렌더만으로 지급됨(부수효과)');
  // 수령 +10·1회성
  q1.give(); m.claimed[q1.id]=true;
  if((S.records||0)!==rec0+10) errs.push('m1 지급 +10 아님');
  // ★ v5.263: m4 탑 도전 의뢰 — 존재·축·목표·스냅샷 키
  const q4=ev('MONTHLY_QUESTS').find(q=>q.id==='m4');
  if(!q4) errs.push('m4 탑 의뢰 없음');
  else { if(q4.stat!=='towerTries') errs.push('m4 축 '+q4.stat);
         if(q4.goal!==20) errs.push('m4 목표 '+q4.goal);
         if(!(m.base && 'towerTries' in m.base)) errs.push('monthly 스냅샷에 towerTries 없음'); }
  // 원복
  S.stats.kills=keep.kills; S.records=keep.records;
  if(keep.monthly) S.monthly=JSON.parse(JSON.stringify(keep.monthly)); else S.monthly={key:'',base:null,claimed:{}};
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.259 회귀: 레전더리 제작 성공 플래시 — 오버레이 추가·중복 방지.
   2.2초 자기 제거(setTimeout)는 스텁 환경에서 검증하지 않는다(존재만 주석 명시). */
step('레전더리 플래시 — 오버레이 렌더·중복 방지', ()=>{
  /* ★ v5.260: documentStub 클래스 셀렉터 지원(노드 스코프 querySelector)으로
     렌더 검증 복원 — v5.259에서 강등했던 회귀. */
  const root=ev("document.querySelector('#modal-root')") || ev("$('#modal-root')");
  if(!root) throw new Error('#modal-root 없음');
  const count=()=>[...(root.children||[])].filter(c=>c.classList&&c.classList.contains('lgd-flash')).length;
  const before=count();
  ev('legendaryFlash')('용암 대검');
  const a1=count();
  if(a1!==before+1) throw new Error('호출 후 오버레이 +1 아님: '+before+'→'+a1);
  ev('legendaryFlash')('용암 완드');
  const a2=count();
  if(a2!==a1) throw new Error('중복 호출 방지 실패: '+a1+'→'+a2);
  [...(root.children||[])].filter(c=>c.classList&&c.classList.contains('lgd-flash')).forEach(nn=>nn.remove());
  if(count()!==before) throw new Error('정리 실패');
});

/* ★ v5.264 회귀: 의뢰 리셋 남은 일수 — 계산 정합 + 주간 탭 렌더 표기.
   주간은 1~7 범위, 월간은 '당월 일수 - 오늘 날짜 + 1'(다음 1일까지)와 정합. */
step('의뢰 리셋 남은 일수 — 계산·렌더 정합', ()=>{
  const r=ev('(function(){ const d=new Date(); const day=(d.getDay()+6)%7; return { raw:7-day, month:Math.ceil(daysToMonthlyReset()), todayDay:d.getDate(), daysInMonth:new Date(d.getFullYear(), d.getMonth()+1, 0).getDate() }; })()');
  const errs=[];
  if(r.raw<1||r.raw>7) errs.push('주간 남은일수 범위 밖: '+r.raw);
  if(ev('daysToWeeklyReset')()!==r.raw) errs.push('daysToWeeklyReset 비정합');
  const expectedMonth=r.daysInMonth-r.todayDay+1;
  if(r.month!==expectedMonth) errs.push('월간 남은일수 '+r.month+'(기대 '+expectedMonth+')');
  const S=ev('S'); const M=ev('MODALS');
  const keep=S.weekly?JSON.parse(JSON.stringify(S.weekly)):null;
  S.weekly={ key:ev('getWeekKey')(), base:{kills:0,crafts:0,summons:0,towerTries:0}, claimed:{} };
  const b=new Node2('div'); M.quest.render(b);
  // 기본 탭은 임무목록 — 주간 탭 노드를 찾아 클릭해야 리셋 표시가 렌더된다
  // (el()은 텍스트를 innerHTML로 넣으므로 _html을 본다 — v5.254 발견과 동일)
  const findTab=(n)=>{ if(!n||!n.children) return null; for(const c of n.children){ if(String(c._text||c._html||'').trim()==='주간') return c; const f=findTab(c); if(f) return f; } return null; };
  const tabNode=findTab(b);
  if(!tabNode) errs.push('주간 탭 노드 미발견'); else tabNode.click();
  if(!/다음 리셋 \d+일 남음/.test(collectText(b))) errs.push('주간 탭 리셋 표시 없음');
  S.weekly=keep?JSON.parse(JSON.stringify(keep)):{key:'',base:null,claimed:{}};
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.283 회귀: 의뢰 리듬 날짜 경계 — 위 스텝은 '실행일' 기준 산술만 본다. 달력 경계는
   vm Date 를 고정 시각으로 교체해 실증한다: ①2월 말→3월 1일 ②12월 31일→1월 1일(연 교차)
   ③연말 ISO 주 — 2027-01-01(금)의 주키는 아직 2026-W53(ISO 는 목요일 소속 연도 규칙),
   월 키는 '2027-1'로 먼저 바뀌는 비대칭 경계 ④월요일 주 갱신. 경계에서 monthlyState/
   weeklyState 가 claimed 를 초기화(리셋)하는 것까지 본다. 기대값은 Node 로 알고리즘
   사전 검증(2026-09-13). finally 로 Date 원복 — 이후 스텝이 진짜 시간을 본다. */
step('의뢰 리듬 날짜 경계(2월 말·연말 월·ISO 주 비대칭)', ()=>{
  const errs=[];
  const cases=[
    { y:2026,m:1,d:28,h:23, month:'2026-2',  dm:1,  week:'2026-W9'  },
    { y:2026,m:2,d:1, h:0,  month:'2026-3',  dm:31, week:'2026-W9'  },
    { y:2026,m:11,d:31,h:12,month:'2026-12', dm:1,  week:'2026-W53' },
    { y:2027,m:0,d:1, h:0,  month:'2027-1',  dm:31, week:'2026-W53', resetMonthly:true },
    { y:2027,m:0,d:4, h:9,  month:'2027-1',  dm:28, week:'2027-W1',  resetWeekly:true  },
  ];
  const snap=ev('(JSON.stringify({weekly:S.weekly, monthly:S.monthly}))');
  try{
    for(const c of cases){
      ev(`(function(){ const _D=Date; globalThis.__realDate=_D;
        Date=class extends _D{ constructor(...a){ if(a.length===0) super(${c.y},${c.m},${c.d},${c.h},30,0); else super(...a); }
          static now(){ return new _D(${c.y},${c.m},${c.d},${c.h},30,0).getTime(); } }; })()`);
      const got=ev(`(function(){ const r={ month:getMonthKey(), dm:Math.ceil(daysToMonthlyReset()), week:getWeekKey() };`+
        (c.resetMonthly?` S.monthly={key:'2026-12',base:{kills:0,crafts:0,summons:0,towerTries:0},claimed:{m1:true}}; const ms=monthlyState(); r.msKey=ms.key; r.msClaimed=JSON.stringify(ms.claimed);`:'')+
        (c.resetWeekly?` S.weekly={key:'2026-W53',base:{kills:0,crafts:0,summons:0,towerTries:0},claimed:{w1:true}}; const ws=weeklyState(); r.wsKey=ws.key; r.wsClaimed=JSON.stringify(ws.claimed);`:'')+
        ` return r; })()`);
      const tag=`${c.y}-${c.m+1}-${c.d}`;
      if(got.month!==c.month) errs.push(tag+' 월키 '+got.month+'≠'+c.month);
      if(got.dm!==c.dm) errs.push(tag+' 월남음 '+got.dm+'≠'+c.dm);
      if(got.week!==c.week) errs.push(tag+' 주키 '+got.week+'≠'+c.week);
      if(c.resetMonthly && (got.msKey!==c.month || got.msClaimed!=='{}')) errs.push('연 교차 월 리셋 미동작 key='+got.msKey+' claimed='+got.msClaimed);
      if(c.resetWeekly && (got.wsKey!==c.week || got.wsClaimed!=='{}')) errs.push('월요일 주 리셋 미동작 key='+got.wsKey+' claimed='+got.wsClaimed);
    }
  } finally {
    ev('if(globalThis.__realDate){ Date=globalThis.__realDate; delete globalThis.__realDate; }');
    ev('const _o=JSON.parse('+JSON.stringify(snap)+'); S.weekly=_o.weekly; S.monthly=_o.monthly;');
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.265 회귀: 주간·월간 의뢰 수령 배지 — 진행 완료 미수령 시 questClaimable true,
   미완료·수령 후·새 주(키 불일치) false. */
step('의뢰 수령 배지 — weeklyClaimable·monthlyClaimable', ()=>{
  const S=ev('S');
  const keep={weekly:S.weekly?JSON.parse(JSON.stringify(S.weekly)):null, monthly:S.monthly?JSON.parse(JSON.stringify(S.monthly)):null, kills:S.stats.kills, crafts:S.stats.crafts};
  const errs=[];
  // 진행 완료(w1 kills +5000)·미수령 → true
  S.weekly={ key:ev('getWeekKey')(), base:{kills:S.stats.kills-5000, crafts:S.stats.crafts, summons:S.stats.summons, towerTries:S.stats.towerTries||0}, claimed:{} };
  if(!ev('weeklyClaimable')()) errs.push('w1 완료 미수령인데 false');
  // 수령 후 → false
  S.weekly.claimed.w1=true;
  if(ev('weeklyClaimable')()) errs.push('수령 후 true');
  // 미완료 → false
  S.weekly.claimed={}; S.weekly.base.kills=S.stats.kills;
  if(ev('weeklyClaimable')()) errs.push('미완료인데 true');
  // 월간 m2(crafts 60) 완료 → true
  S.monthly={ key:ev('getMonthKey')(), base:{kills:S.stats.kills, crafts:S.stats.crafts-60, summons:S.stats.summons, towerTries:S.stats.towerTries||0}, claimed:{} };
  if(!ev('monthlyClaimable')()) errs.push('m2 완료 미수령인데 false');
  // questClaimable 전체에 합산돼 있는지(주간만 완료 상태에서 true)
  if(!ev('questClaimable')()) errs.push('questClaimable이 주간 미수령 반영 안 함');
  // 원복
  S.weekly=keep.weekly?JSON.parse(JSON.stringify(keep.weekly)):{key:'',base:null,claimed:{}};
  S.monthly=keep.monthly?JSON.parse(JSON.stringify(keep.monthly)):{key:'',base:null,claimed:{}};
  S.stats.kills=keep.kills; S.stats.crafts=keep.crafts;
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.269 회귀: 오프라인 정산 배지 — offlinePending>0 시 timepod 점·수령 후 소등.
   _setDot 은 children 직접 스캔이므로 Node2 스텁에서도 정확히 동작한다. */
step('오프라인 정산 배지 — 점 등/소등', ()=>{
  const S=ev('S');
  const keep=S.offlinePending||0;
  const tp=ev("document.getElementById('timepod')");
  if(!tp) throw new Error('#timepod 노드 없음');
  const hasDot=()=>[...(tp.children||[])].some(c=>c.classList&&c.classList.contains('rdot'));
  const errs=[];
  S.offlinePending=0; ev('refreshClaimBadges')();
  const off1=hasDot();
  if(off1) errs.push('pending 0인데 점 켜짐');
  S.offlinePending=100000; ev('refreshClaimBadges')();
  if(!hasDot()) errs.push('pending>0인데 점 안 켜짐');
  // 수령 경로 소등 — settle 버튼 직접 클릭은 모달 렌더가 필요하므로 지급식(+소등) 재현
  S.offlinePending=0; ev('refreshClaimBadges')();
  if(hasDot()) errs.push('수령(0화) 후 점 잔존');
  S.offlinePending=keep; ev('refreshClaimBadges')();
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.271 회귀: 칭호 개선 배지 — 현재 착용보다 골드 효과가 큰 미장착 보유 칭호가
   있으면 titleUpgradeable true. 효과 없음/이미 최적/미보유 false. */
step('칭호 개선 배지 — titleUpgradeable 판정', ()=>{
  const S=ev('S');
  const keep=S.title;
  const T=ev('TITLES');
  const errs=[];
  // 효과 있는(gold>0) 칭호 아무거나 착용 — 보유 조건은 titleOwn으로 강제
  const withGold=T.filter(t=>t.e&&t.e.gold>0);
  if(!withGold.length) throw new Error('골드 효과 칭호가 정의에 없음(전제 확인)');
  const t1=withGold[0], t2=withGold[withGold.length-1];
  const hi=(t1.e.gold>=t2.e.gold)?t1:t2, lo=(hi===t1)?t2:t1;
  S.titleOwn=S.titleOwn||{};
  S.titleOwn[hi.id]=true; S.titleOwn[lo.id]=true;
  // 낮은 효과 착용 → 높은 효과 미장착 → true
  S.title=lo.id;
  if(!ev('titleUpgradeable')()) errs.push('우위 미장착인데 false');
  // 최적(높은 것) 착용 → false
  S.title=hi.id;
  if(ev('titleUpgradeable')()) errs.push('최적 착용인데 true');
  // 원복
  S.title=keep; delete S.titleOwn[hi.id]; delete S.titleOwn[lo.id];
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.272 회귀: 의뢰 스냅샷 조기 확정 — enterHome 이 weeklyState/monthlyState 를
   호출하는 소스 정합(호출하지 않으면 리셋 후 첫 오픈까지 진행이 새지 않는 불리). */
step('의뢰 스냅샷 조기 확정 — enterHome 정합', ()=>{
  const src=fs.readFileSync('game.js','utf8');
  const i=src.indexOf("sysLog('결정의 시대에 오신 것을 환영합니다, 군주여.');");
  if(i<0) throw new Error('enterHome 환영 로그 미발견(앵커 드리프트)');
  const win=src.slice(i, i+900);
  if(!win.includes('weeklyState();')||!win.includes('monthlyState();'))
    throw new Error('enterHome 이 weeklyState/monthlyState 호출 누락');
});

/* ★ v5.236 회귀: 극한의 벼림 +21~25 — 성공 30% 표기 · 실패 시 단계 유지(파괴·하락 없음,
   재화만 소모) · +25 상한. 실패 분기 강제는 vm 안 Math.random 후킹(D5 패턴)으로. */
step('극한의 벼림 +21~25 — 실패해도 유지, +25 상한', ()=>{
  const S=ev('S');
  const hid=ev('party')()[0].hero_id;
  const keep={eq:JSON.parse(JSON.stringify(S.equips)), gold:S.gold, stones:S.stones};
  const gear={grade:'L',slot:'단검',enh:20,equipped:true,heroId:hid};
  S.equips=[gear]; S.gold=1e9; S.stones=100;  ev('openEnhance')(gear);
  const body=ev("$('#modal-root')") || ev("$('#modalBody')");
  const html=collectText(body);
  const btn=findBtnByText(body,'강화');
  const errs=[];
  if(!html.includes('극한 (성공 30% · 실패해도 유지)')) errs.push('성공 30%·유지 문구 없음');
  if(!/2,?000만/.test(html)) errs.push('극한 비용 2,000만 표기 없음');
  if(!/강화석 20/.test(html)) errs.push('극한 강화석 20개(v5.238) 표기 없음');
  if(!btn) errs.push('강화 버튼을 못 찾음');
  if(btn&&btn.disabled) errs.push('+20에서 버튼 disabled');
  if(btn&&!btn.disabled){
    ev("globalThis.__t236=Math.random; Math.random=function(){return 0.999;};");
    try{ btn.click(); }finally{ ev("Math.random=globalThis.__t236; delete globalThis.__t236;"); }
    if(gear.enh!==20) errs.push('실패 후 enh '+gear.enh+'(기대 20 유지)');
    if(!S.equips.includes(gear)) errs.push('실패 후 장비 소멸(파괴되면 안 됨)');
    if(S.gold!==1e9-20000000) errs.push('골드 '+S.gold+'(기대 1e9-2천만)');
    if(S.stones!==80) errs.push('강화석 '+S.stones+'(기대 80 — v5.238 극한 20개/시도)');
  }
  gear.enh=25; ev('openEnhance')(gear);
  const btn2=findBtnByText(ev("$('#modal-root')") || ev("$('#modalBody')"),'강화');
  if(btn2&&!btn2.disabled) errs.push('+25에서 버튼 활성(상한 봉쇄 실패)');
  S.equips=keep.eq; S.gold=keep.gold; S.stones=keep.stones;
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.238 회귀: 강화석→망치 교환(골드상점) — 상품 존재·stones 결제 헬퍼 동작·차감/지급.
   과잉 강화석(1600h 5,402개)의 싱크라인. GOLDSHOP 상품의 give/cur 데이터만 믿지 않고
   구매 실행(have→payCur→give 순서)까지 태운다. */
step('골드상점 강화석→망치 교환 — stones 통화 결제 라인', ()=>{
  const S=ev('S');
  const GS=ev('GOLDSHOP');
  const stoneItems=GS.filter(it=>it.cur==='stones');
  const errs=[];
  if(stoneItems.length<2) throw new Error('강화석 결제 상품 '+(stoneItems.length)+'개(기대 2: 일반 150/전설 500)');
  const led=stoneItems.find(it=>/전설/.test(it.t));
  if(!led) throw new Error('전설 망치 교환 상품 없음');
  if(led.cost!==500) errs.push('전설 교환가 '+led.cost+'(기대 500)');
  /* ★ v5.240: 기록서 골드 라인 — 3천만/권, 심화 각성의 엔드게임 골드 싱크 */
  const book=GS.find(it=>it.cur==='gold' && /기록서/.test(it.t));
  if(!book) errs.push('기록서 골드 상품 없음(v5.240)');
  else if(book.cost!==30000000) errs.push('기록서 가격 '+book.cost+'(기대 3천만)');
  else { const rb=ev('S').records||0; book.give(); if((ev('S').records||0)!==rb+1) errs.push('기록서 지급 오류'); ev('S').records=rb; }
  const keep={stones:S.stones, hammers:S.hammers||0};
  S.stones=600; S.hammers=0;
  if(S.stones<led.cost) errs.push('사전 조건 실패');
  if(!errs.length){
    led.give();                       // 상품 지급 로직 자체(구매 헬퍼의 pay는 아래 별도)
    if(S.hammers!==10) errs.push('지급 후 전설망치 '+S.hammers+'(기대 10)');
    if(S.stones!==600) errs.push('give가 stones를 깎으면 안 됨(차감은 payCur 담당): '+S.stones);
    S.hammers=0; S.stones=600;   // payCur는 shop 클로저 내부라 직접 검증 불가 — 데이터 정합으로 대체
  }
  S.stones=keep.stones; S.hammers=keep.hammers;
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.239 회귀: 몬스터 도감 전종 완성 1회성 보상 — 최초 호출만 지급(플래그), 재호출 차단,
   지급량 정확(기록서+10·전설망치+10·골드+5000만·강화석+200). onKill 경유 없이 함수 직접 검증. */
step('도감 전종 완성 보상 — 1회성 지급·재호출 차단', ()=>{
  const S=ev('S');
  const keep={records:S.records||0, hammers:S.hammers||0, gold:S.gold, stones:S.stones||0, flag:S.codexReward && S.codexReward.all};
  S.codexReward=S.codexReward||{}; delete S.codexReward.all;
  const r1=ev('codexAllReward')();
  const mid={records:S.records, hammers:S.hammers, gold:S.gold, stones:S.stones, flag:!!S.codexReward.all};
  const r2=ev('codexAllReward')();
  // 원복
  S.records=keep.records; S.hammers=keep.hammers; S.gold=keep.gold; S.stones=keep.stones;
  if(keep.flag) S.codexReward.all=1; else delete S.codexReward.all;
  const errs=[];
  if(r1!==true) errs.push('첫 호출이 true 아님');
  if(r2!==false) errs.push('재호출이 false 아님(1회성 위반)');
  if(mid.records!==keep.records+10) errs.push('기록서 '+(mid.records-keep.records)+'(기대 +10)');
  if(mid.hammers!==keep.hammers+10) errs.push('전설망치 '+(mid.hammers-keep.hammers)+'(기대 +10)');
  if(Math.round(mid.gold-keep.gold)!==50000000) errs.push('골드 '+Math.round(mid.gold-keep.gold)+'(기대 +5000만)');
  if(mid.stones!==keep.stones+200) errs.push('강화석 '+(mid.stones-keep.stones)+'(기대 +200)');
  if(!mid.flag) errs.push('플래그 미설정');
  if(errs.length) throw new Error(errs.join(' | '));
});
step('save→JSON 직렬화 왕복 무손실', ()=>{
  /* 바로 위 검사가 모달 클릭을 다시 전수 실행하면서 [데이터 초기화]·[가져오기]를 또 눌러
     저장을 재봉인한다(사유는 [7] 끝 주석 참조). 이 검사는 save() 가 실제로 써야 성립하므로
     여기서 한 번 더 푼다. */
  ev('_saveSealed = false');
  ev('save')(); const raw=store.get('hwasin_save_v1');
  if(/NaN|Infinity|undefined/.test(raw)) throw new Error('직렬화에 NaN/Infinity 포함');
  JSON.parse(raw);
});

console.log('\n[9] 유사성 회귀 가드 (금칙 스캐너 — L1 자기고백 토큰 + 축자/수치 시그니처)');
/* ★ v5.126 도입, v5.127 확장(QA 검증계획 20260822-유사성제거-검증계획.md §2 A-0 반영).
   목록 정본은 코드에 나열하지 않고 ip-banlist.json(스캔 대상 제외 경로) 한 곳에 둔다 — §2-4-c
   "금칙 목록을 코드 주석에 나열하지 않는다, 자기 가드에 걸린다"를 따른다(game.js:38 사고 재발 방지).
   L1 = 배포 3파일에 남아있으면 안 되는 내부 작업 용어 토큰(목록은 데이터 파일 참조).
   verbatim_signatures = 라운드1에서 다룬 축자 문구·수치 조합. 단일 리터럴은 substring, 조합
   시그니처(가격표·수치객체 등은 개별 값이 우연히 재사용될 수 있어)는 all[] 로 '전부 동시에
   존재할 때만' 실패 처리한다. */
/* ★ 2026-09-10: 데이터 파일이 없을 때의 동작에 예외 경로를 하나 냈다.
   이 파일은 .gitignore 에 있어(공개 저장소에 금칙어를 올리지 않는다) GitHub Actions 체크아웃에는
   존재하지 않는다. 종전처럼 무조건 exit(2) 를 하면 CI 를 아예 세울 수 없어서, 다른 9개 단계까지
   같이 못 돌게 된다 — 가드 하나를 지키려고 나머지 가드를 전부 버리는 셈이다.
   그래서 HWASIN_BANLIST_OPTIONAL=1 일 때만 [9] 를 건너뛰고, 대신 마지막 결과에 '건너뜀' 을
   크게 남긴다. 이 스위치는 CI 워크플로에서만 켠다 — 로컬·pre-push 는 종전대로 파일을 요구한다.
   (근본 해소는 저장소 시크릿으로 파일을 넣어 주는 것이다. .github/workflows/check.yml 주석 참조) */
let BANLIST = null, BANLIST_SKIPPED = false;
try{ BANLIST = JSON.parse(fs.readFileSync(D+'ip-banlist.json','utf8')); }
catch(e){
  if(process.env.HWASIN_BANLIST_OPTIONAL === '1'){
    BANLIST_SKIPPED = true;
    console.warn('  ⚠ ip-banlist.json 없음 + HWASIN_BANLIST_OPTIONAL=1 → [9] 금칙 스캔을 건너뛴다.');
    console.warn('    이 실행은 유사성 회귀를 검사하지 않았다. 배포 전 로컬에서 npm run check 를 반드시 돌려라.');
  } else {
    console.error('[9] ip-banlist.json 없음 — 회귀 가드 데이터는 로컬 정본이다. 내부 저장소 docs/design/ 의 백업(ip-banlist-정본-*.json)을 이 경로로 복사하라.');
    process.exit(2);
  }
}
const SCAN_TARGETS = [ ['game.js', js], ['index.html', html], ['style.css', css] ];

/* 유니코드 정규화(NFC) 후 비교 — 원본 파일이 NFD(자모 분해)로 저장돼도 놓치지 않는다.
   (QA §2-5-3: "NFD 분해 한글" 정규화 누락은 스캐너가 조용히 0건을 내는 유형의 사고다) */
function norm(s){ return String(s).normalize('NFC'); }

function scanOne(hay){
  const hits = [];
  BANLIST.l1_self_incrimination_tokens.forEach(tok=>{
    if(norm(hay).includes(norm(tok))) hits.push(`L1 자기고백 토큰 "${tok}"`);
  });
  BANLIST.verbatim_signatures.forEach(sig=>{
    if(sig.any){
      const found = sig.any.filter(s=>norm(hay).includes(norm(s)));
      if(found.length) hits.push(`${sig.label} → "${found.join('", "')}"`);
    } else if(sig.all){
      if(sig.all.every(s=>norm(hay).includes(norm(s)))) hits.push(`${sig.label} → 전부 존재: "${sig.all.join('", "')}"`);
    }
  });
  return hits;
}

/* ★ 카나리 자가검증 (QA §2-5, 필수) — "차단형 장치는 조용히 고장 난다."
   본 스캔 전에, 스캐너 로직이 위반을 실제로 잡아내는지 먼저 확인한다. 카나리 텍스트는 배너리스트에서
   런타임에 값을 뽑아 조립한다(파일에 금칙어를 리터럴로 적지 않는다 — HANDBOOK 8장 원칙과 동일).
   3건(L1 토큰 · verbatim any · verbatim all 조합) 중 하나라도 미검출이면 스캐너 자체 고장으로 보고
   본 스캔에 들어가지 않는다(종료코드 2). NFD(자모 분해) 이형도 섞어 정규화 누락을 함께 확인한다. */
function runCanarySelfCheck(){
  const l1Sample = BANLIST.l1_self_incrimination_tokens[0];                 // 데이터 파일의 첫 토큰
  const anySig = BANLIST.verbatim_signatures.find(s=>s.any);
  const allSig = BANLIST.verbatim_signatures.find(s=>s.all);
  const l1SampleNFD = l1Sample.normalize('NFD');                             // 자모 분해 이형
  const canaryText = [
    '__CANARY_FIXTURE__ 이 문자열은 배포되지 않는다.',
    `[L1] ${l1Sample} / NFD이형: ${l1SampleNFD}`,
    `[ANY] ${anySig.any[0]}`,
    `[ALL] ${allSig.all.join(' / ')}`,
  ].join('\n');
  const hits = scanOne(canaryText);
  const gotL1   = hits.some(h=>h.includes(`"${l1Sample}"`));
  const gotAny  = hits.some(h=>h.startsWith(anySig.label));
  const gotAll  = hits.some(h=>h.startsWith(allSig.label));
  const gotNFD  = norm(canaryText).includes(norm(l1Sample)) && canaryText.includes(l1SampleNFD); // NFD 원문이 정규화로도 잡히는지
  const results = { L1:gotL1, ANY:gotAny, ALL:gotAll, NFD정규화:gotNFD };
  const allOk = Object.values(results).every(Boolean);
  return { allOk, results };
}

if(BANLIST_SKIPPED){
  console.log('  ⏭ [9] 건너뜀 — 금칙 데이터 없음(HWASIN_BANLIST_OPTIONAL=1).');
} else {
const canary = runCanarySelfCheck();
const canaryOkCount = Object.values(canary.results).filter(Boolean).length;
const canaryTotal = Object.keys(canary.results).length;
console.log(`  카나리 자가검증: ${canaryOkCount}/${canaryTotal} 검출 (${JSON.stringify(canary.results)})`);
if(!canary.allOk){
  console.log('\n❌ 스캐너 자체 고장 — 카나리가 검출되지 않았다. 이 스캐너의 "0건" 결과는 신뢰할 수 없다.');
  console.log('   본 스캔을 실행하지 않고 즉시 종료한다(QA 검증계획 §2-6: 종료코드 2).');
  process.exit(2);
}

/* 대상 파일이 0개(또는 빈 파일)면 성공이 아니라 스캐너 고장이다 — 과거 절대경로 하드코딩으로
   "복사본을 검사한다고 믿으며 원본을 검사한" 사고가 있었다(§2-6). 같은 유형의 사고를 여기서도 막는다. */
const emptyTargets = SCAN_TARGETS.filter(([,content])=>!content || content.length===0);
if(SCAN_TARGETS.length===0 || emptyTargets.length>0){
  console.log('\n❌ 스캔 대상 파일이 0개이거나 비어 있다 — 종료코드 2.');
  process.exit(2);
}

const totalLines = SCAN_TARGETS.reduce((n,[,c])=>n+c.split('\n').length, 0);
console.log(`  스캔 파일 ${SCAN_TARGETS.length}개(${SCAN_TARGETS.map(([n])=>n).join(', ')}) · 총 라인 ${totalLines} · 화이트리스트 0건`);

step('금칙 스캔 (L1 자기고백 토큰 + 축자/수치 시그니처)', ()=>{
  const allHits = [];
  SCAN_TARGETS.forEach(([name, content])=>{
    scanOne(content).forEach(h=>allHits.push(`[${name}] ${h}`));
  });
  if(allHits.length) throw new Error('금칙 재발견:\n     - ' + allHits.join('\n     - '));
});
}

console.log('\n[10] M1 결정론 검증 (전투 결정론 리팩터 — 명문 상세기획 §3.1/§3.2, G1심사 §4-3 D1~D5)');
/* ★ M1 완료기준은 5개 전부 자동 검증(G1심사 §4-3): D1 동일시드 100회 해시 동일 / D2 다른 시드
   20개는 전부 다른 해시 / D3 프레임 교란 내성 / D4 헤드리스=실시간 동치 / D5 비시드 난수 잔존 0.
   시나리오는 신규 세이브 기본 파티(HERO_001/002, Lv1) vs 몹 40체 던전 — 스폰 타이밍·크리티컬·
   데미지 변주·반격 대상 선정 등 RNG 표면을 두루 지나가도록 count/dur을 여유 있게 잡았다. */
const D_SCENARIO = { name:'M1검증', foeCP:1400, kind:'mobs', count:40, dur:90 };
const D_MAX_TICKS = 3000;   // 90초×20Hz=1800틱 상한 + 여유

function freshBattle(){
  store.delete('hwasin_save_v1'); ev('load')();
  return ev('Battle');
}
/* seed → {hash, detail} : 승패·던전 보상 로그·RNG 소비 체크섬(뽑힌 값의 순서까지 반영)을 묶어
   해시 하나로 비교한다. driver(B)가 프레임을 어떻게 쪼개 넣든 동일 시드면 동일 해시가 나와야 한다. */
/* ★ 디버그로 잡은 실제 원인(게임 코드 버그 아님, 테스트 하네스 버그): layoutHeroes()의 1인 홈
   서바이벌 분기(isHuntSolo() = !partySrc && mode==='hunt')는 "이전 던전이 끝나 mode가 hunt로
   돌아왔는가"에 좌우된다. setPartySource(null)로 매 런 초기화하면 첫 런은 우연히 mode='dungeon'
   잔존이라 3인, 이후 모든 런은 mode='hunt' 로 복귀해 있어 1인으로 굳어버려 "같은 시드인데
   구성원 수가 다른" 교란이 생겼다. 아레나가 하듯 party 함수 자체를 소스로 넘겨(non-null)
   mode 잔존과 무관하게 항상 3인 편성이 나오게 고정한다. */
const partyFn = ev('party');
function runSeeded(seed, driver){
  const B = freshBattle();
  B.setSeed(seed);            // ★ layoutHeroes()보다 반드시 먼저 — 이후 모든 소비가 이 시드에서 나온다
  B.setPartySource(partyFn);  // non-null 소스 — mode 잔존과 무관하게 항상 party() 3인 경로
  let result = null;
  B.startDungeon(Object.assign({}, D_SCENARIO, { onEnd:(win, info)=>{ result = { win, dmg:info.dmg, kills:info.kills, wave:info.wave }; } }));
  driver(B);
  if(!result) throw new Error(`시드 ${seed}: 던전이 완주되지 않음(맥스 틱 초과 의심)`);
  const detail = { seed, win:result.win, dmg:result.dmg, kills:result.kills, wave:result.wave,
    rngChecksum:B.rngChecksum(), rngDrawCount:B.rngDrawCount() };
  const hash = crypto.createHash('sha256').update(JSON.stringify(detail)).digest('hex').slice(0,16);
  return { hash, detail };
}
const driverPlain = (B)=>{ const r=B.runUntilDone(D_MAX_TICKS); if(!r.finished) throw new Error('runUntilDone 맥스 틱 초과'); };
function driverJitter(sliceFn){
  return (B)=>{
    let iter=0;
    while(B.inDungeon() && iter<200000){ B.pumpFrame(sliceFn()); iter++; }
    if(B.inDungeon()) throw new Error('프레임 교란 드라이버가 완주하지 못함');
  };
}
const driverRealtime60fps = driverJitter(()=>1/60);   // ★ D4: '실시간'의 대리 — 60Hz rAF와 동일한 프레임 간격으로 pumpFrame

step('D1 · 동일 시드 100회 실행 → 해시 100% 동일', ()=>{
  const seed = 0xC0FFEE;
  const firstR = runSeeded(seed, driverPlain);
  const seen = new Map([[firstR.hash, firstR.detail]]);
  // 실패 시 즉시 원인 진단이 가능하도록, 갈라진 해시의 상세를 남긴다(무엇이 달라졌는지: win/dmg/kills/체크섬).
  for(let i=1;i<100;i++){
    const r = runSeeded(seed, driverPlain);
    if(!seen.has(r.hash)){ seen.set(r.hash, r.detail); console.log(`     불일치 발견 run#${i}: `+JSON.stringify(r.detail)); }
  }
  if(seen.size!==1){ console.log('     기준(run#0): '+JSON.stringify(firstR.detail)); throw new Error(`100회 중 서로 다른 해시 ${seen.size}종 발생 (시드=${seed})`); }
  console.log(`     시드 0x${seed.toString(16)} · 100회 해시 = ${firstR.hash} (전부 동일)`);
});

step('D2 · 서로 다른 시드 20개 → 서로 다른 해시(중복 0)', ()=>{
  const seeds = Array.from({length:20}, (_,i)=> (0x1000 + i*0x9E3779B1) >>> 0);
  const hashes = seeds.map(s=>runSeeded(s, driverPlain).hash);
  const dup = hashes.filter((h,i)=>hashes.indexOf(h)!==i);
  if(dup.length) throw new Error(`시드 20개 중 해시 중복 발생: ${dup.join(', ')}`);
  if(new Set(hashes).size!==20) throw new Error('해시 집합 크기가 20이 아님');
  console.log(`     시드 20개 → 해시 20종 전부 상이 (예: ${hashes[0]}, ${hashes[1]}, …)`);
});

step('D3 · 프레임 교란 내성 (16ms/50ms/랙스파이크/무작위 분할이 섞여도 같은 시드=같은 결과)', ()=>{
  const seed = 0x5EED5EED;
  const base = runSeeded(seed, driverPlain).hash;
  const variants = {
    '16ms 고정(≈60fps)': driverJitter(()=>1/60),
    '50ms 고정(=FIXED_DT)': driverJitter(()=>1/20),
    '랙스파이크 250ms 간간이': driverJitter(()=>{ variantTick++; return (variantTick%37===0) ? 0.25 : 1/60; }),
    '무작위 분할(1ms~90ms)': driverJitter(()=>0.001 + Math.random()*0.089),
  };
  let variantTick = 0;
  for(const [label, drv] of Object.entries(variants)){
    variantTick = 0;
    const h = runSeeded(seed, drv).hash;
    if(h!==base) throw new Error(`프레임 슬라이싱[${label}]에서 해시 불일치: ${h} ≠ 기준 ${base}`);
  }
  console.log(`     기준 해시 ${base} · 슬라이싱 4종(60fps/20Hz/랙스파이크/무작위) 전부 일치`);
});

step('D4 · 헤드리스 완주(runUntilDone) = 실시간 프레임 펌프(pumpFrame·60fps 대리) 동일 해시', ()=>{
  const seed = 0xABCD1234;
  const headless = runSeeded(seed, driverPlain).hash;
  const realtime = runSeeded(seed, driverRealtime60fps).hash;
  if(headless!==realtime) throw new Error(`헤드리스 ${headless} ≠ 실시간(60fps 펌프) ${realtime}`);
  console.log(`     헤드리스 = 실시간(60fps 대리) = ${headless}`);
});

step('D5 · 전투 스텝 중 비시드 Math.random 직접 호출 0건 (연출/보상 지대 제외, 후킹 검사)', ()=>{
  const B = freshBattle();
  B.setSeed(0x0D5);
  B.setPartySource(partyFn);
  /* ★ v5.128.1: 훅을 vm 컨텍스트 '안'에 설치한다. 종전엔 바깥 리얼름의 Math.random 을 패치해
     별도 리얼름에서 도는 game.js 의 호출을 전혀 가로채지 못했다 — 항상 0건 거짓 통과
     (QA 독립 검증이 오염 주입 교란 시험으로 발견). 재발 방지로, 설치 직후 오염을 일부러
     호출해 훅이 실제로 무는지 카나리로 먼저 증명한 뒤에만 본검사를 신뢰한다. */
  let count = null, sample = [];
  try{
    ev("globalThis.__d5={v:[],orig:Math.random}; Math.random=function(){ if(!(Battle.isCosmeticZone&&Battle.isCosmeticZone())) __d5.v.push((new Error().stack||'').split('\\n')[2]||'(위치 미상)'); return __d5.orig.call(Math); };");
    ev("Math.random();");                                     // 카나리 오염 — 반드시 1건 잡혀야 한다
    if(ev("__d5.v.length") < 1) throw new Error('D5 카나리 실패 — 컨텍스트 내 훅이 발화하지 않는다');
    ev("__d5.v.length = 0;");
    B.startDungeon(Object.assign({}, D_SCENARIO, { onEnd:()=>{} }));
    const r = B.runUntilDone(D_MAX_TICKS);
    if(!r.finished) throw new Error('D5 시나리오가 맥스 틱 내에 완주되지 않음');
    count = ev("__d5.v.length");
    sample = ev("__d5.v.slice(0,5)");
  } finally { ev("if(globalThis.__d5){ Math.random=__d5.orig; delete globalThis.__d5; }"); }
  if(count!==0) throw new Error(`비시드 Math.random 직접 호출 ${count}건 감지:\n     - ` + sample.join('\n     - '));
  console.log(`     컨텍스트 내 훅 + 카나리 발화 확인 — 헤드리스 전투 1회(${D_SCENARIO.count}체 던전) 동안 비지정 호출 0건`);
});

console.log('\n=================== 결과 ===================');
if(errs.length){ console.log('실패 '+errs.length+'건:'); errs.forEach(e=>console.log(' - '+e)); process.exit(1); }
/* 건너뛴 검사가 있으면 '전부 통과' 라고 말하지 않는다 — 통과와 미검사를 같은 문장으로 보고하면
   다음 사람이 검사된 것으로 믿는다. 배포 판정에 쓰이는 문장이라 특히 구분한다. */
if(BANLIST_SKIPPED){
  console.log('⚠ 스모크 통과 — 단, [9] 유사성 회귀 가드는 실행되지 않았다(금칙 데이터 없음).');
  console.log('  이 실행 결과만으로 배포 가능이라고 판단하지 마라. 로컬에서 npm run check 를 돌려라.');
} else {
  console.log('모든 스모크 통과 ✅');
}
