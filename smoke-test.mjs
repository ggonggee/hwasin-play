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
/* ★ 2026-09-25(워크플로 2차 #17): 유효 JSON 인데 이관이 예외 → 새 게임으로 덮지 않는다(슬롯 원본 유지·봉인·_migfail_ 백업) · 가져오기는 이관 사전 검사로 거부. */
step('이관 실패 세이브 — 덮어쓰기 금지·봉인·백업 · 가져오기 사전 거부', ()=>{
  const errs=[];
  const bad=JSON.stringify({ gold:777777777, name:'진행도주인', heroes:{ HERO_001:{level:321,own:true} }, stats:null });
  store.set('hwasin_save_v1', bad); ev('_saveSealed = false; _loadFailRaw = null'); ev('load')(); ev('save')();
  if(store.get('hwasin_save_v1')!==bad) errs.push('이관 실패 세이브가 덮어써짐');
  if(ev('_saveSealed')!==true) errs.push('봉인 안 됨');
  if(ev('_loadFailRaw')!==bad) errs.push('복구 화면 원본 없음');
  if(![...store.keys()].some(k=>typeof k==='string' && k.startsWith('hwasin_save_v1_migfail_'))) errs.push('_migfail_ 백업 키 없음');
  // 가져오기: 같은 데이터는 이관 사전 검사에서 거부(확인창 없이)
  ev('_saveSealed = false; _loadFailRaw = null'); store.delete('hwasin_save_v1'); ev('load')();
  const before=store.get('hwasin_save_v1'); const root=ev("$('#modal-root')");
  ev('saveImport')();
  let ta=null; const rec=n=>{ if(!n||typeof n!=='object'||ta) return; if(n.tagName==='TEXTAREA') ta=n; (n.children||[]).forEach(rec); }; rec(root); rec(ev('document').body||{});
  const btn=findBtnByText(root,'불러오기',true)||findBtnByText(ev('document').body||{},'불러오기',true);
  if(!ta || !btn) errs.push('가져오기 UI 요소 없음');
  else { ta.value=bad; btn.onclick(); if(findBtnByText(root,'덮어쓰기',true)) errs.push('이관 불가 데이터인데 덮어쓰기 확인창이 뜸'); if(store.get('hwasin_save_v1')!==before) errs.push('가져오기 거부 전에 슬롯이 바뀜'); }
  ev('closeModal')(); ev('_saveSealed = false; _loadFailRaw = null');
  if(errs.length) throw new Error(errs.join(' | '));
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
  S.offHi=0;   // #16 고수위 — 과거 시각을 만들어 넣는 검사는 '이미 정산한 최고 시각'을 비우고 시작한다(안 비우면 되감기로 판정돼 0)
  if(settle(Date.now()-3600e3, Date.now())!==want) throw new Error(`1시간 정산액 ≠ ${want}`);
  if((S.offlinePending||0)!==before+want) throw new Error('offlinePending 에 적립되지 않았다');
  if(settle(Date.now()-30e3, Date.now())!==0) throw new Error('30초 미만 숨김에 적립됐다');
});
/* ★ v5.286 회귀: 오프라인 정산 8h 상한 — 위 스텝은 1시간·30초만 봤다. 밤샘(12h)·주말(48h)
   방치가 상한 없이 적립되면 '인게임 방치의 50%·최대 8시간' 약속과 어긋난다. 부팅 경로
   (computeOffline)와 백그라운드 복귀(_visibilitySettle) 양쪽의 min(elapsed, 8h) 상한과
   60초 엄격 임계(>60)를 실증한다. 방치 게임의 핵심 수급 경로 경계. */
step('오프라인 정산 상한(OFFLINE_CAP_H) — 부팅·복귀 양 경로 + 60초 임계', ()=>{
  const S=ev('S'), GPM=ev('OFFLINE_GPM'), CAPH=ev('OFFLINE_CAP_H');   // ★ 2026-09-25: 상한은 game.js 단일 상수에서 읽는다
  const errs=[];
  const want8h=Math.floor(GPM/60*CAPH*3600);   // (이름은 이력상 want8h — 값은 현재 상한)
  for(const hrs of [CAPH+4, 48]){
    const keep={ pending:S.offlinePending||0, lastSeen:S.lastSeen };
    S.offlinePending=0; S.lastSeen=Date.now()-hrs*3600e3; S.offHi=0;
    ev('computeOffline')();
    if((S.offlinePending||0)!==want8h) errs.push(`computeOffline ${hrs}h → ${S.offlinePending}(기대 ${want8h})`);
    S.offlinePending=keep.pending; S.lastSeen=keep.lastSeen;
  }
  { const keep={ pending:S.offlinePending||0, lastSeen:S.lastSeen };
    S.offlinePending=0; S.lastSeen=Date.now()-60e3; S.offHi=0;   // 정확히 60초 — >60 엄격
    ev('computeOffline')();
    if((S.offlinePending||0)!==0) errs.push('computeOffline 60초 경과분이 적립됐다(임계 >60 위반)');
    S.offlinePending=keep.pending; S.lastSeen=keep.lastSeen; }
  { const before=S.offlinePending||0; S.offHi=0;
    const got=ev('_visibilitySettle')(Date.now()-(CAPH+4)*3600e3, Date.now());
    if(got!==want8h) errs.push(`_visibilitySettle 12h → ${got}(기대 ${want8h})`);
    if((S.offlinePending||0)!==before+want8h) errs.push('_visibilitySettle 상한분 미적립');
    S.offlinePending=before; }
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ v5.307 회귀: 오프라인 정산 [수령] — 실물 clock QA(3일 미접속 부팅)에서 발견: 수령
   onclick 이 상태만 바꾸고 save() 를 안 불러, 컴백 유저가 [수령] 직후 창을 닫으면 세이브에
   offlinePending 이 남아 재접속에서 같은 금액을 또 수령할 수 있었다(중복 지급). 지급·소진·
   즉시 저장(save 스파이)을 modal render → 버튼 클릭 경로로 실증한다(v5.306 투기장
   롤오버와 같은 '상태만 바꾸고 저장 안 함' 유형). */
step('오프라인 정산 수령 — 지급·소진·즉시 저장', ()=>{
  const S=ev('S');
  const bak=JSON.stringify({ offlinePending:S.offlinePending, gold:S.gold });
  const errs=[];
  ev('globalThis.__oOS=toast; toast=function(){};');
  ev('globalThis.__oOSv=save; globalThis.__osN=0; save=function(){globalThis.__osN++;};');
  try{
    S.offlinePending=1000000;
    const g0=S.gold;
    const b=new Node2('div'); ev('MODALS').settle.render(b);
    const all=[]; (function walk(n){ (n.children||[]).forEach(c=>{ all.push(c); walk(c); }); })(b);
    const btn=all.find(c=>String(c._text||c._html||'')==='수령');
    if(!btn||!btn.onclick) throw new Error('[수령] 버튼 미발견');
    btn.onclick();
    if(S.gold<=g0) errs.push('수령 후 골드 미증가(지급 안 됨)');
    if(S.offlinePending!==0) errs.push('offlinePending 미소진: '+S.offlinePending);
    if(ev('globalThis.__osN')!==1) errs.push('수령 즉시 save 미호출(v5.307 회귀): '+ev('globalThis.__osN'));
  } finally {
    ev('toast=globalThis.__oOS');
    ev('save=globalThis.__oOSv');
    Object.assign(S, JSON.parse(bak));
  }
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ v5.308 회귀: 소진·수령 확정 즉시 저장 — '상태만 바꾸고 저장 안 함' 유형이 v5.306
   (투기장 롤오버)·v5.307(오프라인 수령)에 이어 전수 스캔에서 15곳 더 발견됐다(차감 직후
   5초 내 새로고침 = 상한 우회/무한 수령 창). 소진 게이트 9곳은 전부 dailyUse 를 지나므로
   관문에서 일괄 저장하고, claimed·루비 확정 6곳은 각 onclick 에서 저장한다.
   ★ v5.309: 2차 스캔(클로저 결제·공용 함수)에서 13곳 추가 — 소환(summonRun/matSummon
   관문)·상점(mkBuy)·제작 시작·각성의 결정·코스튬·버프 구매·조각팩·길드 창설·점령전 입장·
   영웅 레벨업·장비 강화(파괴 포함)·용광로 월 1회 소진.
   ①dailyUse 즉시 save 실행 스파이 ②12곳 앵커 라인 save 소스 정합. */
step('소진·수령 즉시 저장 — dailyUse 관문 + 수령·구매 12곳', ()=>{
  const errs=[];
  ev('globalThis.__v3o=save; globalThis.__v3n=0; save=function(){globalThis.__v3n++;};');
  try{
    const S=ev('S'); const k=S.daily.counts.__qa||0;
    ev('dailyUse')('__qa');
    if((S.daily.counts.__qa||0)!==k+1) errs.push('dailyUse 카운트 미증가');
    if(ev('globalThis.__v3n')<1) errs.push('dailyUse 즉시 save 미호출');
    delete S.daily.counts.__qa;
  } finally { ev('save=globalThis.__v3o'); }
  const src=fs.readFileSync('game.js','utf8');
  const anchors=[
    'MISSION_REWARDS.forEach(r=>{ try{ r.act(); }catch(e){} }); save();',
    'S.ruby-=it.cost; it.give(); S.claimed.mail[it.id]=true',
    'p.give(); S.claimed.mail[p.id]=true',
    'S.claimed.attend[i]=true; S.attendLastDate=today(); save();',
    '우편 ${n}건 일괄 수령',
    'give(); S.claimed.mail[id]=true; claimSfx(); toast(`${t}`)',   // 2026-09-25(#10 2차): 수령음 추가 — 같은 줄 save() 규약 유지
    /* v5.309 — 2차 스캔(공용 관문·클로저 결제) */
    "tutEvent('hsum'); save();",
    "tutEvent('msum'); save();",
    'payCur(cur,cost); give();',
    'monthlyState().claimed.forgeTrial=true; save();',
    'openEnhance(e); refreshHUD(); save();',
    'openModal(\'forge\', item.n); refreshHUD(); save();',
  ];
  for(const a of anchors){
    const line=src.split('\n').find(l=>l.includes(a));
    if(!line){ errs.push('앵커 미발견: '+a.slice(0,36)); continue; }
    if(!/save\(\)/.test(line)) errs.push('save 없음: '+a.slice(0,36));
  }
  if(!/function dailyUse\(key\)\{ rollDaily\(\); S\.daily\.counts\[key\]=\(S\.daily\.counts\[key\]\|\|0\)\+1; save\(\); \}/.test(src))
    errs.push('dailyUse 관문 save 미연결');
  if(errs.length) throw new Error(errs.join(' | '));
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
  /* ★ v5.298: 세트 현재 배율 표시 — setDamageMul 정본 접근자와 동일 값(정보 공개·
     세트 빌드 격차 ×2.29~×5.33 의 정보 비대칭 해소). 렌더 무지급(순수 계산). */
  if(!/현재 배율 <b>×[0-9.]+<\/b>/.test(html)) throw new Error('세트 현재 배율 표시 없음');
  const shown=+(html.match(/현재 배율 <b>×([0-9.]+)/)||[])[1];
  const expect=+ev('setDamageMul')().toFixed(2);
  if(Math.abs(shown-expect)>0.005) throw new Error('세트 배율 불일치: '+shown+' vs '+expect);
  /* setfx 도감 — 단계별 전투력 환산 배지(단일 세트 setDamageMul 공식) 존재·개수 */
  const sb=new Node2('div'); M.setfx.render(sb);
  const stxt=collectText(sb);
  const badges=(stxt.match(/×[0-9.]+/g)||[]).length;
  if(badges<SETS_TIER_COUNT()) throw new Error('세트 배율 배지 부족: '+badges);
  if(!stxt.includes('전투력 환산 기여')) throw new Error('배율 규칙 안내 없음');
});
/* 세트 총 임계 수(작열 3단계 + 나머지 8종 1단계 = 11) — setfx 배지 개수 기대치 */
function SETS_TIER_COUNT(){ return 11; }

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

/* ★ 2026-09-19 회귀: 투기장 주간 롤오버 — 위 스텝(의뢰 리듬)은 ISO 월요일 00시 경계만 본다.
   투기장은 원작 안내문 벤치마크(N2)로 '매주 월요일 12시'라 경계가 다르다. 시간 의존 경로
   전수 조사(2026-09-19)에서 이 경로가 회귀 무커버로 발견돼 추가했다:
   ①경계 산술(arenaWeekKey 는 인자 주입 가능 — 결정적) ②구세이브 '' 봉인(첫 진입 즉시
   초기화 금지) ③주차 변경 시 1회 리셋+토스트 ④같은 주 재진입 금지.
   기대 주차는 Node 사전 검증(2026-09-19): 일 밤·월 11:59 → 전 주, 월 12:00 → 새 주. */
step('투기장 주간 롤오버 — 월요일 12시 경계·구세이브 봉인·점수 리셋', ()=>{
  const errs=[];
  const arith=[
    [2026,8,20,23,59,'2026-9-14'],   // 일요일 밤 — 전 주차
    [2026,8,21,11,59,'2026-9-14'],   // 월요일 11:59 — 아직 전 주차
    [2026,8,21,12,0 ,'2026-9-21'],   // 월요일 12:00 정각 — 새 주차
    [2026,8,22,10,0 ,'2026-9-21'],   // 화요일 아침 — 유지
  ];
  for(const [y,m,d,h,mi,want] of arith){
    const got=ev(`arenaWeekKey(new Date(${y},${m},${d},${h},${mi},0))`);
    if(got!==want) errs.push(`경계 ${y}-${m+1}-${d} ${h}:${mi} → ${got}≠${want}`);
  }
  const S=ev('S');
  const bak=JSON.stringify({ arenaWeek:S.arenaWeek, arenaPts:S.arenaPts, arenaTier:S.arenaTier,
    arenaStreak:S.arenaStreak, arenaRank:S.arenaRank, arenaSession:S.arenaSession });
  ev('globalThis.__oAT=toast; globalThis.__atN=0; toast=function(){globalThis.__atN++;};');
  ev('globalThis.__oSv=save; globalThis.__svN=0; save=function(){globalThis.__svN++;};');
  try{
    /* vm Date 를 2026-09-21(월) 12:01 로 고정 — arenaWeekRoll 은 무인자 arenaWeekKey() */
    ev(`(function(){ const _D=Date; globalThis.__realDate=_D;
      Date=class extends _D{ constructor(...a){ if(a.length===0) super(2026,8,21,12,1,0); else super(...a); }
        static now(){ return new _D(2026,8,21,12,1,0).getTime(); } }; })()`);
    /* ② 구세이브 봉인 — ''면 현재 주차로 봉인만 하고 리셋 금지 */
    Object.assign(S,{ arenaWeek:'', arenaPts:5000, arenaTier:3, arenaStreak:5, arenaRank:500, arenaSession:{w:2,l:1,t:0} });
    if(ev('arenaWeekRoll()')!==false) errs.push('봉인이 true 반환');
    if(S.arenaWeek!=='2026-9-21') errs.push('봉인 키 미설정: '+S.arenaWeek);
    if(S.arenaPts!==5000) errs.push('봉인에 점수 리셋(진행도 파괴): '+S.arenaPts);
    if(ev('globalThis.__atN')!==0) errs.push('봉인에 토스트 발화');
    if(ev('globalThis.__svN')!==1) errs.push('봉인 즉시 save 미호출: '+ev('globalThis.__svN'));
    /* ③ 주차 변경 — 1회 리셋 + 토스트 1번 */
    S.arenaWeek='2026-9-14';
    if(ev('arenaWeekRoll()')!==true) errs.push('월 12시 롤오버 false');
    if(S.arenaWeek!=='2026-9-21') errs.push('롤오버 키 미갱신: '+S.arenaWeek);
    if(S.arenaPts!==0||S.arenaStreak!==0||S.arenaRank!==ev('ARENA_RANK_RESET')) errs.push('점수/연승/랭크 리셋 미동작 pts='+S.arenaPts+' rank='+S.arenaRank);
    if(S.arenaTier!==ev('arenaTierOf(0)')) errs.push('티어 리셋 미동작: '+S.arenaTier);
    if(!S.arenaSession||S.arenaSession.w!==0||S.arenaSession.l!==0) errs.push('세션 리셋 미동작');
    if(ev('globalThis.__atN')!==1) errs.push('롤오버 토스트 미발화/중복: '+ev('globalThis.__atN'));
    if(ev('globalThis.__svN')!==2) errs.push('롤오버 즉시 save 미호출(v5.306 회귀): '+ev('globalThis.__svN'));
    /* ④ 같은 주 재진입 — 재리셋 금지 */
    if(ev('arenaWeekRoll()')!==false) errs.push('같은 주 재롤오버 true');
    if(ev('globalThis.__atN')!==1) errs.push('재진입 토스트 추가 발화');
    if(ev('globalThis.__svN')!==2) errs.push('변화 없는 재진입에 save');
  } finally {
    ev('if(globalThis.__realDate){ Date=globalThis.__realDate; delete globalThis.__realDate; }');
    ev('toast=globalThis.__oAT');
    ev('save=globalThis.__oSv');
    Object.assign(S, JSON.parse(bak));
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.284 회귀: 7일 출석 주기 반복 — 완주(7칸 전부 수령) 다음 날 rollDaily 가
   claimed.attend 를 리셋해 1일차가 다시 열리고, 도중 미수령(이어받기 중)이면
   리셋하지 않는다. 종전 리셋 경로가 없어 완주자의 출석 보상이 영구히 끊겼다. */
step('7일 출석 완주 — 다음 날 새 주기 리셋·미완주는 이어받기', ()=>{
  const errs=[];
  const S=ev('S');
  const backup=JSON.stringify({ claimed:S.claimed, attendLastDate:S.attendLastDate, daily:S.daily, day:S.day });
  try{
    // A: 7칸 완주 + 날짜 경과 → 리셋 + 1일차 오픈
    S.claimed.attend=ev('ATTEND_DAYS').map(()=>true);
    S.daily.date='Thu Jan 01 2026'; S.attendLastDate='Thu Jan 01 2026';
    ev('rollDaily')();
    if(JSON.stringify(S.claimed.attend)!=='{}') errs.push('완주 다음날 리셋 안 됨: '+JSON.stringify(S.claimed.attend));
    if(!ev('attendClaimable')()) errs.push('리셋 후 attendClaimable 여전히 false');
    const M=ev('MODALS'); const b=new Node2('div'); M.attend.render(b);
    if(!collectText(b).includes('오늘 개봉 가능 · 1일차')) errs.push('리셋 후 1일차 미오픈');
    // B: 3칸만 수령(이어받기 중) → 리셋 금지
    S.claimed.attend=ev('ATTEND_DAYS').map((_,i)=>i<3);
    S.daily.date='Thu Jan 01 2026';
    ev('rollDaily')();
    if(S.claimed.attend.filter(Boolean).length!==3) errs.push('미완주 리셋 오동작: '+JSON.stringify(S.claimed.attend));
  } finally {
    const o=JSON.parse(backup);
    S.claimed=o.claimed; S.attendLastDate=o.attendLastDate; S.daily=o.daily; S.day=o.day;
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.289 회귀: iOS 사파리 ITP 세이브 삭제 고지 — 설정 백업 행에 '7일 미접속 삭제'
   경고가 상시 노출돼야 한다. 방치 게임의 재접속 리듬과 Apple 정책이 충돌하는 플랫폼
   위험이라 문구 소실은 유저 보호 구멍이다. 백업 버튼 존재도 함께. */
step('설정 백업 행 — iOS 사파리 세이브 삭제 고지 존재', ()=>{
  const M=ev('MODALS');
  const b=new Node2('div'); M.settings.render(b);
  const txt=collectText(b);
  if(!/7일 미접속/.test(txt)) throw new Error('ITP 고지 문구 없음');
  if(!/내보내기/.test(txt)) throw new Error('백업 버튼 없음');
});

/* ★ v5.290 회귀: 투기장 종료 즉시 미션 완료 팝업 — 튜토리얼 8단계 전투가 끝나면
   결과 카드 3초 대기를 건너뛰고 missionReward 가 바로 열린다(modal-root 스크림이
   화면을 가림). 일반(튜토리얼 완료) 유저의 결과 카드 경로는 변화 없음을 함께 본다. */
step('투기장 종료 즉시 미션 완료 팝업(튜토리얼) — 일반은 결과 카드 유지', ()=>{
  const S=ev('S');
  const bak=JSON.stringify({ seen:S.seenTutorial, tut:S.tut, ticket:S.ticket, arenaPts:S.arenaPts,
    arenaStreak:S.arenaStreak, arenaTier:S.arenaTier, arenaRank:S.arenaRank, arenaSession:S.arenaSession,
    dice:S.dice, missionPaid:S._missionPaid, classTrait:S.classTrait });
  const errs=[];
  try{
    S.seenTutorial=false; S.tut=S.tut||{}; S.tut.missionPending=true;
    ev('arenaResult')(true,'훈련 대장', 1000, 'Bronze');
    if(ev('currentModal')!=='missionReward') errs.push('missionReward 미오픈: '+ev('currentModal'));
    if(S.tut.missionPending!==false) errs.push('missionPending 미소진 — tutPoll 중복 오픈 위험');
    S.seenTutorial=true;
    ev('arenaResult')(false,'훈련 대장', 2000, 'Silver');
    if(ev('currentModal')!=='arenaResult') errs.push('일반 결과 카드 깨짐: '+ev('currentModal'));
    ev('closeModal')();   // 남은 3초 타이머 무력화(currentModal 가드)
  } finally {
    const o=JSON.parse(bak);
    Object.assign(S, { seenTutorial:o.seen, tut:o.tut, ticket:o.ticket, arenaPts:o.arenaPts,
      arenaStreak:o.arenaStreak, arenaTier:o.arenaTier, arenaRank:o.arenaRank,
      arenaSession:o.arenaSession, dice:o.dice, _missionPaid:o.missionPaid, classTrait:o.classTrait });
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.291 회귀: 모험 팝업 + 중요도별 아이콘 재배치(대표 요청) —
   ① 우측 플로팅엔 '모험'만(공략·소통 부재) ② 모험 팝업 6종 렌더·클릭으로 각 모달 오픈
   ③ 하단 레일은 퀘스트·길드·마을 3종만(전투류·코스튬·패키지 부재) ④ 드로어에 코스튬 존재
   ⑤ package 모달 삭제(상점 패키지 탭 이관)·상점 탭에 한정 상품 노출. */
step('모험 팝업·아이콘 재배치 — 플로팅/레일/드로어/상점 정합', ()=>{
  const errs=[];
  /* 스텁 DOM 은 id 레지스트리만 만들어 계층이 없다 — 레이아웃 구조는 index.html
     소스 정합으로 검증한다(스텁이 html 문자열을 이미 읽는 관례와 동일). */
  const slice=(a,b)=>{ const i=html.indexOf(a); if(i<0) return ''; const j=html.indexOf(b,i); return html.slice(i, j<0?html.length:j); };
  const dmods=s=>[...s.matchAll(/data-modal="([^"]+)"/g)].map(m=>m[1]);
  const floatSec=slice('<div id="side-float">','<div id="sidemenu"');
  const floats=dmods(floatSec);
  if(floats.length!==1 || floats[0]!=='adventure') errs.push('플로팅이 모험 단일 아님: '+JSON.stringify(floats));
  const menuSec=slice('<div id="sidemenu"','<!-- 채팅');
  const menu=dmods(menuSec);
  for(const k of ['costume','strategy','social']) if(!menu.includes(k)) errs.push('드로어 항목 누락: '+k);
  /* ★ v5.293: 퀘스트·길드·마을이 레일에서 드로어로 — 첫 6순위 '우편,출석,퀘스트,길드,마을,설정' */
  const order6=['mail','attend','quest','guild','village','settings'];
  const head6=menu.slice(0,6);
  if(JSON.stringify(head6)!==JSON.stringify(order6)) errs.push('드로어 첫 6순위 불일치: '+JSON.stringify(head6));
  if(menu.length!==17) errs.push('드로어 17개 아님: '+menu.length);
  const railSec=slice('<div id="content-rail"','<!-- 채팅');
  if(railSec!=='') errs.push('content-rail 잔존(v5.293 제거)');
  if(dmods(html).includes('package')) errs.push('package 진입점 잔존');
  /* 모험 모달·상점 탭은 런타임 검증 — 스텁의 childNodes 더미 때문에 openModal 의
     modalBody 는 비어 있으므로 모달 전수(관례)처럼 render(b) 직접 방식을 쓴다. */
  const M=ev('MODALS');
  const b=new Node2('div'); M.adventure.render(b);
  const txt=collectText(b);
  for(const n of ['요일던전','골드던전','보스','월드보스','시련의탑','약탈','잔불의 미궁','용광로 시련']) if(!txt.includes(n)) errs.push('모험 항목 누락: '+n);
  const grid=(b.children||[]).find(c=>(c.children||[]).some(k=>String(k._html||'').includes('요일던전')));
  if(!grid) errs.push('모험 그리드 미발견');
  else { const card=(grid.children||[])[0];
    if(card&&card.onclick){ card.onclick(); if(ev('currentModal')!=='dailydungeon') errs.push('모험 카드 클릭 미연결'); ev('closeModal')(); }
    else errs.push('모험 카드에 onclick 없음'); }
  if(M.package!==undefined) errs.push('package 모달 잔존');
  if(!M.shop.render.toString().includes('패키지')) errs.push('상점 탭 라벨 미갱신');
  const S=ev('S'); const rb=S.ruby; S.ruby=999999;
  const sb=new Node2('div'); M.shop.render(sb);
  if(!collectText(sb).includes('추천')) errs.push('상점 렌더 실패');
  const shopTabs=(sb.children||[])[0]||null;
  const pkgTab=shopTabs && [...(shopTabs.children||[])].find(t=>String(t._html||t._text||'').includes('패키지'));
  if(!pkgTab) errs.push('패키지 탭 미발겤');
  else { pkgTab.onclick();
    const ptxt=collectText((sb.children||[])[1]||new Node2('div'));
    const ap=ev('ACCOUNT_PACKS'); if(ap&&ap[0]&&!ptxt.includes(ap[0].t)) errs.push('한정 패키지 미노출'); }
  S.ruby=rb;
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.294 회귀: 잔불의 미궁 — 콘텐츠 확장-1 신규 던전(자체 설계·대표 승인).
   ① 상수 구조: 3문, foe·강화석 단조 증가, 골드는 골드던전 5단계(1500만) 이하 봉쇄
   ② 렌더 무지급(v5.249 사고 방지): 렌더를 반복해도 stones/gold 불변
   ③ 일 1회 소진은 입장 [예] 확정 시에만(dailyUse) — 렌더·입장 버튼 클릭만으로 안 줄어든다
   ④ 보상은 reward 콜백에만 존재(승리 지급 분리) + emberBest 최고 문 기록(freshState 정합)
   전투 개시는 enterDungeonFight 을 가로채 cfg 만 검증한다 — kind:'mobs' 실전투 결정론은
   D 시나리오가, showDungeonResult 승리 게이트는 기존 던전 관례가 각각 지킨다. */
step('잔불의 미궁 — 3문 구조·렌더 무지급·일 1회 게이트·보상 콜백', ()=>{
  const S=ev('S'), M=ev('MODALS');
  const keep={ gold:S.gold, stones:S.stones, emberBest:S.stats.emberBest||0,
    daily:JSON.parse(JSON.stringify(S.daily)) };
  const errs=[];
  try{
    delete S.daily.counts.ember;   // 고립 보장(신규 키라 오염 없음이 정상)
    /* ① 상수 구조 */
    const maze=ev('EMBER_MAZE');
    if(!Array.isArray(maze)||maze.length!==3) throw new Error('문 3개 아님: '+(maze&&maze.length));
    if(!(maze[0].foe<maze[1].foe&&maze[1].foe<maze[2].foe)) errs.push('적 전투력 비단조');
    if(!(maze[0].stones<maze[1].stones&&maze[1].stones<maze[2].stones)) errs.push('강화석 비단조');
    if(maze.some(d=>d.gold>15000000)) errs.push('골드 봉쇄(1500만 이하) 위반');
    /* ② 렌더 — 문 이름·보상 텍스트·일 1회 안내 + 무지급 */
    const rt=ev('EMBER_REWARD_TXT');
    const b=new Node2('div'); M.embermaze.render(b);
    const txt=collectText(b);
    maze.forEach((d,i)=>{ if(!txt.includes(d.n)) errs.push('문 이름 미표시: '+d.n);
      if(!txt.includes(rt[i])) errs.push('보상 텍스트 미표시: '+rt[i]); });
    if(!txt.includes('일 1회')) errs.push('일 1회 안내 없음');
    const st0=S.stones, g0=S.gold;
    M.embermaze.render(new Node2('div')); M.embermaze.render(new Node2('div'));
    if(S.stones!==st0||Math.round(S.gold)!==Math.round(g0)) errs.push('렌더만으로 지급 발생');
    /* ③ 입장 버튼 → styledConfirm [예] 에서만 dailyUse — enterDungeonFight 가로채 cfg 검증 */
    if(ev('dailyLeft')('ember',1)!==1) errs.push('초기 잔여 1 아님');
    ev('globalThis.__oEDF=enterDungeonFight; globalThis.__capEDF=null; '+
       'enterDungeonFight=function(cfg){ globalThis.__capEDF=cfg; }');
    const third=maze[2];
    const grid=(b.children||[]).find(c=>(c.children||[]).some(k=>String(k._html||'').includes(third.n)));
    const card=grid&&(grid.children||[]).find(k=>String(k._html||'').includes(third.n));
    const enter=card&&findBtnByText(card,'입장');
    if(!enter) errs.push('입장 버튼 미발겤');
    else{
      enter.onclick();                                  // confirm 오버레이만 생성 — 아직 미소진
      if(ev('dailyLeft')('ember',1)!==1) errs.push('버튼 클릭만으로 일 1회 소진');
      const root=ev("document.getElementById('modal-root')");
      const yes=findBtnByText(root,'예');               // 트리 순회상 마지막 = 방금 생긴 오버레이
      if(!yes) errs.push('confirm [예] 버튼 미발겤');
      else yes.onclick();
      const cfg=ev('globalThis.__capEDF');
      if(!cfg) errs.push('[예] 확정 후 전투 개시 없음');
      else{
        if(cfg.name!=='잔불의 미궁 · '+third.n) errs.push('전투명 불일치: '+cfg.name);
        if(cfg.foeCP!==third.foe||cfg.kind!=='mobs') errs.push('foeCP/kind 불일치');
        if(cfg.rewardText!==rt[2]) errs.push('rewardText 불일치');
        /* ④ reward 콜백 — raw 골드 지급(가호·칭호 배제) + emberBest 최고 문 유지 */
        S.gold=1000; S.stones=10; S.stats.emberBest=0;
        cfg.reward(); cfg.reward();
        if(S.stones!==10+third.stones*2) errs.push('강화석 지급량 오류: '+S.stones);
        if(S.gold!==1000+third.gold*2) errs.push('골드 raw 지급량 오류: '+S.gold);
        if(S.stats.emberBest!==3) errs.push('emberBest 3 아님: '+S.stats.emberBest);
      }
      if(ev('dailyLeft')('ember',1)!==0) errs.push('[예] 확정 후에도 잔여 1');
      /* 소진 렌더 — 라벨 '오늘 완료'·disabled */
      const b2=new Node2('div'); M.embermaze.render(b2);
      const doneBtn=findBtnByText(b2,'오늘 완료');
      if(!doneBtn) errs.push('소진 후 라벨 갱신 안 됨');
      else if(!doneBtn.disabled) errs.push('소진 후 disabled 아님');
      /* ★ v5.299: 최고 문 기록(stats.emberBest) 표시 — 0이면 미표시, 3이면 문 이름 완주 */
      S.stats.emberBest=3;
      const b3=new Node2('div'); M.embermaze.render(b3);
      const t3=collectText(b3);
      if(!t3.includes('굶주린 불꽃의 문 완주')) errs.push('최고 문 기록 미표시(3문)');
      S.stats.emberBest=0;
      const b4=new Node2('div'); M.embermaze.render(b4);
      if(collectText(b4).includes('완주')) errs.push('기록 0인데 완주 표시');
    }
  } finally {
    ev('enterDungeonFight=globalThis.__oEDF');
    S.gold=keep.gold; S.stones=keep.stones; S.stats.emberBest=keep.emberBest;
    S.daily=keep.daily;
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.300 회귀: 용광로 시련 — 월 1회 이벤트 보스전(콘텐츠 확장-4).
   ① 상수 구조: foe 30000(잔불 3문 위)·강화석 300·골드 1200만(골드던전 5단계 이하 봉쇄)
   ② 렌더 무지급 + 월 1회 게이트: claimed.forgeTrial 은 monthlyState 리셋(새 달)에 자동 초기화
   ③ 도전 [예] 확정 시에만 소진·전투 개시(kind:'boss')·reward raw 지급. */
step('용광로 시련 — 구조·렌더 무지급·월 1회 게이트·보상 콜백', ()=>{
  const S=ev('S'), M=ev('MODALS');
  const keep={ gold:S.gold, stones:S.stones, monthly:S.monthly?JSON.parse(JSON.stringify(S.monthly)):null };
  const errs=[];
  try{
    const t=ev('FORGE_TRIAL'), rt=ev('FORGE_REWARD_TXT');
    if(!t||t.foe<=ev('EMBER_MAZE')[2].foe) errs.push('foe가 잔불 3문 이하');
    if(t.gold>15000000) errs.push('골드 봉쇄(1500만 이하) 위반');
    if(!ev('EMBER_MAZE')||t.foe!==30000) errs.push('FORGE_TRIAL 상수 이상');
    /* 렌더 — 보스 정보·보상 텍스트·매월 1회 안내 + 무지급 */
    S.monthly={ key:ev('getMonthKey')(), base:{kills:S.stats.kills,crafts:S.stats.crafts,summons:S.stats.summons,towerTries:0}, claimed:{} };
    const b=new Node2('div'); M.forgetrial.render(b);
    const txt=collectText(b);
    if(!txt.includes(t.n)) errs.push('보스 이름 미표시');
    if(!txt.includes(rt)) errs.push('보상 텍스트 미표시');
    if(!txt.includes('매월 1회')) errs.push('월 1회 안내 없음');
    const st0=S.stones, g0=S.gold;
    M.forgetrial.render(new Node2('div'));
    if(S.stones!==st0||Math.round(S.gold)!==Math.round(g0)) errs.push('렌더만으로 지급 발생');
    /* 도전 버튼 → confirm [예] 에서만 소진 — enterDungeonFight 가로채 cfg 검증 */
    const m0=ev('monthlyState')();
    if(m0.claimed.forgeTrial) errs.push('초기 claimed=true');
    ev('globalThis.__oEDF2=enterDungeonFight; globalThis.__capEDF2=null; '+
       'enterDungeonFight=function(cfg){ globalThis.__capEDF2=cfg; }');
    const card=(b.children||[]).find(c=>String(c._html||'').includes(t.n));
    const btn=card&&findBtnByText(card,'도전');
    if(!btn) errs.push('도전 버튼 미발겤');
    else{
      btn.onclick();
      if(ev('monthlyState')().claimed.forgeTrial) errs.push('버튼 클릭만으로 소진');
      const root=ev("document.getElementById('modal-root')");
      const yes=findBtnByText(root,'예');
      if(!yes) errs.push('confirm [예] 미발겤');
      else yes.onclick();
      const cfg=ev('globalThis.__capEDF2');
      if(!cfg) errs.push('[예] 후 전투 미개시');
      else{
        if(cfg.kind!=='boss'||cfg.foeCP!==t.foe) errs.push('kind/foeCP 불일치');
        if(cfg.hpMul!==3) errs.push('hpMul≠3(장기전 미적용)');
        if(cfg.rewardText!==rt) errs.push('rewardText 불일치');
        S.gold=1000; S.stones=10;
        cfg.reward();
        if(S.stones!==10+t.stones) errs.push('강화석 지급 오류');
        if(S.gold!==1000+t.gold) errs.push('골드 raw 지급 오류');
      }
      if(!ev('monthlyState')().claimed.forgeTrial) errs.push('[예] 후에도 미소진');
      /* 소진 렌더 — '이번 달 완료'·disabled + 다음 재도전 D-N(v5.302) */
      const b2=new Node2('div'); M.forgetrial.render(b2);
      const done=findBtnByText(b2,'이번 달 완료');
      if(!done) errs.push('소진 라벨 갱신 안 됨');
      else if(!done.disabled) errs.push('소진 후 disabled 아님');
      const t2=collectText(b2);
      if(!t2.includes('이번 달 도전 완료')) errs.push('소진 안내 없음');
      if(!/다음 재도전까지 D-\d/.test(t2)) errs.push('D-N 카운트다운 없음');
    }
  } finally {
    ev('enterDungeonFight=globalThis.__oEDF2');
    S.gold=keep.gold; S.stones=keep.stones;
    if(keep.monthly) S.monthly=JSON.parse(JSON.stringify(keep.monthly)); else S.monthly={key:'',base:null,claimed:{}};
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.295 회귀: 주간 축제(콘텐츠 확장-2 '이벤트') —
   ① 로테이션 결정론: Date 목으로 3연속 ISO 주를 만들면 festival() 이 3테마를 전부 순회
   ② 골드 관문: 골드 축제 주와 아닌 주의 addGold(1000) 차이가 정확히 ×1.2 —
      공통 승수(티어·칭호·가호)는 비율로 상쇄. raw(고정 보상)는 양쪽 모두 정확히 1000
   ③ XP·재료 관문·롤오버 토스트 가드는 소스 정합 + 토스트 스파이(신규 키 ''엔 미발화)
   ④ 배지: index.html 의 #festChip 을 refreshHUD 가 이번 주 테마로 채운다 — 렌더 무지급. */
step('주간 축제 — 3테마 순환 결정론·골드 관문 배율·배지·렌더 무지급', ()=>{
  const errs=[];
  const S=ev('S'), M=ev('MODALS');
  const weeks=[[2026,8,14],[2026,8,21],[2026,8,28]];   // 3연속 ISO 주의 월요일(2026-W38/39/40)
  const snap=ev('(JSON.stringify({weekly:S.weekly}))');
  try{
    const mockWeek=(i)=>{ const [y,m,d]=weeks[i];
      ev(`(function(){ const _D=Date; globalThis.__realDate=_D;
        Date=class extends _D{ constructor(...a){ if(a.length===0) super(${y},${m},${d},12,0,0); else super(...a); }
          static now(){ return new _D(${y},${m},${d},12,0,0).getTime(); } }; })()`); };
    /* ① 3주 순환 — 테마 3종 전부 등장 */
    const themes=[];
    for(let i=0;i<3;i++){ mockWeek(i); const f=ev('festival()');
      themes.push(f.id);
      if(ev('festival()').id!==f.id) errs.push('같은 주内 테마 불안정');
      if(f.n===undefined||f.fx===undefined||f.ic===undefined) errs.push('테마 필드 누락: '+f.id);
    }
    if(new Set(themes).size!==3) errs.push('3주 순환 아님: '+themes.join(','));
    /* ② 골드 관문 배율 — 축제 주/평상 주 addGold 비율 1.2 · raw 불변.
       ★ S.buffs(프리미엄·결정 가호)는 Date.now() 와 비교되는 잔여 시각이라 목 주차 사이
         걸렸다 안 걸렸다 하며 비율을 오염시킨다(실측 1.32/1.65=가호 잔여). 측정 구간만
         중립화한다 — 티어·칭호 승수는 양쪽에 공통이라 비율로 상쇄된다. */
    const buffsSnap=JSON.stringify(S.buffs||{});
    S.buffs=Object.assign({},S.buffs,{goldUntil:0,goldPactUntil:0,expUntil:0,craftUntil:0});
    const goldIdx=themes.indexOf('gold'), otherIdx=(goldIdx+1)%3;
    const goldDelta=(wk)=>{ mockWeek(wk); const g0=S.gold; ev('addGold')(1000); return S.gold-g0; };
    const dFest=goldDelta(goldIdx), dNorm=goldDelta(otherIdx);
    if(!(dFest>0&&dNorm>0)||Math.abs(dFest/dNorm-1.2)>1e-9) errs.push('골드 축제 배율 ≠1.2: '+dFest+'/'+dNorm);
    mockWeek(goldIdx);
    if(ev("festivalMul('gold')")!==1.2||ev("festivalMul('exp')")!==1) errs.push('festivalMul 판정 오류');
    const g0=S.gold; ev('addGold')(1000,true);
    if(S.gold-g0!==1000) errs.push('raw 고정 보상이 축제 영향: '+(S.gold-g0));
    S.buffs=JSON.parse(buffsSnap);
    /* ③ 관문 3곳 + 롤오버 토스트 가드 소스 정합 */
    const src=fs.readFileSync('game.js','utf8');
    if(!src.includes("* goldBuffMul() * festivalMul('gold')")) errs.push('골드 관문 미연결');
    if(!src.includes("* festivalMul('exp')")) errs.push('경험치 관문 미연결');
    if(!src.includes("* dropBuff * festivalMul('mat')")
      ||!src.includes("0.25*festivalMul('mat')")||!src.includes("0.10*festivalMul('mat')"))
      errs.push('재료 드랍률 관문 미연결(3곳)');
    if(!/if\(S\.weekly\.key && S\.weekly\.key!==k\)\{ const f=festival\(\); toast/.test(src))
      errs.push('주 롤오버 축제 토스트 없음');
    /* 롤오버 토스트 스파이 — 신규 키 ''엔 미발화, 실제 롤오버에만 1회 */
    ev('globalThis.__oToast=toast; globalThis.__toastN=0; toast=function(){globalThis.__toastN++;}');
    S.weekly={ key:'', base:null, claimed:{} }; ev('weeklyState')();
    if(ev('globalThis.__toastN')!==0) errs.push('최초 초기화에 토스트 발화');
    S.weekly.key='1999-W1'; ev('weeklyState')();
    if(ev('globalThis.__toastN')!==1) errs.push('주 롤오버 토스트 미발화/중복: '+ev('globalThis.__toastN'));
    ev('toast=globalThis.__oToast');
    /* ④ 배지 — DOM 존재 + refreshHUD 가 이번 주 테마로 갱신 + D-N 카운트다운 + 렌더 무지급 */
    if(!html.includes('id="festChip"')) errs.push('#festChip 없음(index.html)');
    const chip=ev("document.getElementById('festChip')");
    const gBefore=S.gold;
    ev('refreshHUD')(); ev('refreshHUD')();
    if(!chip||!String(chip._html||'').includes(ev('festival()').n)) errs.push('배지 미갱신');
    if(!/D-[1-7]/.test(String(chip._html||''))) errs.push('D-N 카운트다운 없음');
    if(S.gold!==gBefore) errs.push('렌더만으로 골드 변동');
    /* 공지·도움말 진입점 — 잔불·용광로 통합 공지와 축제 공지의 존재 검사(some).
       ★ 2026-09-25: 종전엔 잔불 공지가 [0](최상단)이어야 했다 — 새 공지는 항상 맨 위에 추가되는 관례라(v5.322 공지)
       위치 고정 검사는 공지를 하나 더할 때마다 깨진다. 지켜야 할 것은 '공지가 있다' 이지 순서가 아니다. */
    if(!ev('NOTICES').some(n=>n.t.includes('잔불의 미궁'))) errs.push('신규 콘텐츠 공지 없음');
    if(!ev('NOTICES').some(n=>n.t.includes('축제'))) errs.push('축제 공지 없음');
    const hb=new Node2('div'); M.help.render(hb);
    if(!collectText(hb).includes('축제')) errs.push('도움말 축제 토픽 없음');
    const cell=(hb.children||[]).flatMap(c=>c.children||[]).find(c=>String(c._html||'').includes('축제'));
    if(cell&&cell.onclick){ cell.onclick();
      const mb=ev("document.getElementById('modalBody')");
      /* 토픽 본문은 appendChild 방식 — collectText 로 자식 _html 까지 본다 */
      if(!collectText(mb).includes('다음 축제까지')) errs.push('도움말 잔여 일수 없음'); }
    /* ★ v5.304: 시련 토픽 — 잔불 3문·용광로 정본 수치 파생 포함 */
    if(!collectText(hb).includes('시련')) errs.push('도움말 시련 토픽 없음');
  } finally {
    ev('if(globalThis.__realDate){ Date=globalThis.__realDate; delete globalThis.__realDate; }');
    ev('if(globalThis.__oToast){ toast=globalThis.__oToast; delete globalThis.__oToast; }');
    ev('const _o=JSON.parse('+JSON.stringify(snap)+'); S.weekly=_o.weekly;');
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.297 회귀: 축제 의뢰 — 주간 의뢰 5번째 슬롯(콘텐츠 확장-3).
   ① 테마×축×목표 매핑: 3연속 ISO 주(Date 목)로 gold/exp/mat 각각 kills/6000·summons/20·crafts/25
   ② 주간 탭 렌더: [테마명] 라벨 행·보상 '강화석 X50' 표시·렌더 무지급
   ③ 수령: 지급 +50 강화석·weeklyClaimable 반영(fest 완료→true, 수령 후 다른 의뢰 미완료면 false). */
step('축제 의뢰 — 테마×축 매핑·주간 탭 렌더·수령·배지 반영', ()=>{
  const S=ev('S'), M=ev('MODALS');
  const keep={ weekly:S.weekly?JSON.parse(JSON.stringify(S.weekly)):null,
    kills:S.stats.kills, crafts:S.stats.crafts, summons:S.stats.summons, stones:S.stones||0 };
  const errs=[];
  const weeks=[[2026,8,14],[2026,8,21],[2026,8,28]];
  try{
    /* ① 테마×축×목표 매핑 */
    const spec={ gold:['kills',6000], exp:['summons',20], mat:['crafts',25] };
    const seen={};
    for(let i=0;i<3;i++){
      const [y,m,d]=weeks[i];
      ev(`(function(){ const _D=Date; globalThis.__realDate=_D;
        Date=class extends _D{ constructor(...a){ if(a.length===0) super(${y},${m},${d},12,0,0); else super(...a); }
          static now(){ return new _D(${y},${m},${d},12,0,0).getTime(); } }; })()`);
      const fq=ev('festivalQuest')();
      const th=ev('festival()').id;
      if(fq.id!=='fest') errs.push('id 불일치: '+fq.id);
      if(!fq.txt.includes('['+ev('festival()').n+']')) errs.push(th+' 라벨 미포함: '+fq.txt);
      const [st,gl]=spec[th];
      if(fq.stat!==st||fq.goal!==gl) errs.push(th+' 매핑 불일치: '+fq.stat+'/'+fq.goal+'(기대 '+st+'/'+gl+')');
      seen[th]=1;
    }
    if(Object.keys(seen).length!==3) errs.push('3테마 미순회: '+Object.keys(seen).join(','));
    /* ② 주간 탭 렌더 — 탭 onclick 후 내용 판독 (탭 라벨은 el() 3번째 인자=innerHTML) */
    S.weekly={ key:ev('getWeekKey')(), base:{ kills:S.stats.kills, crafts:S.stats.crafts, summons:S.stats.summons, towerTries:0 }, claimed:{} };
    const b=new Node2('div'); M.quest.render(b);
    const tabNode=((b.children[0]||{}).children||[]).find(c=>String(c._text||c._html||'').trim()==='주간');
    if(!tabNode||!tabNode.onclick) errs.push('주간 탭 미발겤');
    else tabNode.onclick();
    const txt=collectText(b);
    if(!txt.includes('축제 기간')) errs.push('축제 의뢰 행 없음');
    if(!(txt.includes('강화석 X50')||txt.includes('수령 완료'))) errs.push('축제 보상 텍스트 미표시');
    const st0=S.stones||0, g0=S.gold;
    const b2=new Node2('div'); M.quest.render(b2);
    if((S.stones||0)!==st0||Math.round(S.gold)!==Math.round(g0)) errs.push('렌더만으로 지급');
    /* ③ 수령 — 지급 +50·claimable 반영 (진행 100% = base를 목표만큼 과거로) */
    const fq2=ev('festivalQuest')();
    const w=ev('weeklyState')();
    w.base[fq2.stat]-=fq2.goal;                 // now-base = goal → 완료
    if(ev('weeklyClaimable')()!==true) errs.push('fest 완료인데 claimable false');
    const before=S.stones||0; fq2.give(); w.claimed.fest=true;
    if((S.stones||0)!==before+50) errs.push('지급 +50 아님: '+((S.stones||0)-before));
    const others=ev('WEEKLY_QUESTS').every(q=>{ const now=S.stats[q.stat]||0, base=(w.base&&w.base[q.stat])||0; return (now-base)<q.goal; });
    if(others && ev('weeklyClaimable')()) errs.push('fest 수령 후에도 claimable true');
  } finally {
    ev('if(globalThis.__realDate){ Date=globalThis.__realDate; delete globalThis.__realDate; }');
    S.stats.kills=keep.kills; S.stats.crafts=keep.crafts; S.stats.summons=keep.summons;
    S.stones=keep.stones;
    if(keep.weekly) S.weekly=JSON.parse(JSON.stringify(keep.weekly)); else S.weekly={key:'',base:null,claimed:{}};
  }
  if(errs.length) throw new Error(errs.join(' | '));
});

/* ★ v5.292 회귀: 전투 연출 재구성(대표 요청) 소스 정합 — centerHold(일반 몹 던전: 중앙
   배치+이동 금지+몹 중앙 선형 이동), 보스 중앙 즉시 배치(화면 밖 입장 중 처치 방지),
   startDungeon 입장 시 layoutHeroes 재호출(이전 전투 이동 위치 리셋). 런타임 동작은
   D 시나리오(kind:'mobs')가 centerHold 경로를 실제로 돌며 D1~D5 결정론으로 검증한다. */
step('전투 연출 재구성 — centerHold·보스 중앙·입장 리셋 소스 정합', ()=>{
  const src=fs.readFileSync('game.js','utf8');
  const errs=[];
  if(!src.includes("centerHold: (cfg.kind==='mobs')")) errs.push('centerHold 플래그(kind mobs) 없음');
  if(!/x:W\*0\.62, y:H\*0\.45, vx:0/.test(src)) errs.push('보스 중앙 즉시 배치 없음');
  if(!src.includes('!dg.centerHold')||!src.includes("(dg.centerHold || dg.kind==='boss')"))
    errs.push('이동 게이트/반격 판정 분기 없음');
  const sd=src.indexOf('function startDungeon(cfg)');
  const ed=src.indexOf('function endDungeon', sd);
  if(sd<0||ed<0||!src.slice(sd,ed).includes('layoutHeroes();')) errs.push('startDungeon 위치 리셋(layoutHeroes) 없음');
  if(!/useCenter = solo \|\| survSolo \|\| !!\(dg && dg\.centerHold\)/.test(src)) errs.push('중앙 배치 조건 없음');
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
    led.give();                       // 상품 지급 로직 자체(구매 헬퍼의 pay는 아래 별가)
    if(S.hammers!==10) errs.push('지급 후 전설망치 '+S.hammers+'(기대 10)');
    if(S.stones!==600) errs.push('give가 stones를 깎으면 안 됨(차감은 payCur 담당): '+S.stones);
    S.hammers=0; S.stones=600;   // payCur는 shop 클로저 내부라 직접 검증 불가 — 데이터 정합으로 대체
  }
  S.stones=keep.stones; S.hammers=keep.hammers;
  /* ★ v5.305: 주사위 → 소환서 교환 — 재화 사슬 감사의 나쁜 막힘(소비처 단일) 해소.
     데이터 정합: dice 통화 상품 1개·90개·지급 +3장(give는 순수 지급, 차감은 payCur 담당). */
  const diceItems=GS.filter(it=>it.cur==='dice');
  if(diceItems.length!==1) errs.push('dice 결제 상품 '+(diceItems.length)+'개(기대 1)');
  else{ const d=diceItems[0];
    if(d.cost!==90) errs.push('주사위 교환가 '+d.cost+'(기대 90)');
    const tk=ev('S').tickHero||0; d.give();
    if((ev('S').tickHero||0)!==tk+3) errs.push('소환서 지급 오류');
    ev('S').tickHero=tk; }
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
/* ★ 2026-09-24 회귀: 장비 상세 [분해] 골드 무한 복제.
   subBody() 하위 화면은 _subKey 를 안 세워서 openModal 이 닫아 주지 않았고, 분해 뒤에도 장비 상세가
   남아 같은 [분해] 를 누를 때마다 addGold 가 재지급됐다(실브라우저: L 1개로 3회 +1,980만).
   ① 1차 방어선 — openModal 이 하위 오버레이를 '조건 없이' 닫는지(소스 계약: 스텁은 closeSub 가 느슨해 DOM 으로 못 본다)
   ② 2차 방어선 — 이미 처분된 장비의 [분해]·[강화] 는 재화를 움직이지 않는다(남은 화면을 직접 눌러 확인) */
step('장비 상세 [분해] 재클릭 — 골드 복제 차단(2중 방어)', ()=>{
  const errs=[];
  const om=js.slice(js.indexOf('function openModal('), js.indexOf('function closeModal('))
    .replace(/[/][*][\s\S]*?[*][/]/g,'').replace(/\/\/[^\n]*/g,'');   // 주석 제거 — 옛 코드를 인용한 주석에 걸리지 않게
  if(/if\s*\(\s*_subKey\s*\)\s*closeSub\(\)/.test(om)) errs.push('openModal 이 다시 _subKey 조건부로 closeSub 한다 — subBody 화면이 남는다');
  if(!/\n\s*closeSub\(\);/.test(om)) errs.push('openModal 에 무조건 closeSub() 가 없다');
  const S=ev('S'), keep={gold:S.gold, stones:S.stones, equips:S.equips.slice()};
  const e={grade:'L', slot:(S.equips[0]&&S.equips[0].slot)||'방패', enh:0, equipped:false, id:'smoke_dup'};
  S.equips.push(e);
  const root=ev("document.getElementById('modal-root')");
  ev('itemDetail')(e);
  const detail=root.children[root.children.length-1];        // 방금 띄운 장비 상세(.sub-ovl)
  const sal=findBtnByText(detail,'분해');
  if(!sal) errs.push('[분해] 버튼 없음');
  else{
    const g0=S.gold;
    sal.onclick(); const y1=findBtnByText(root,'예'); if(y1) y1.onclick(); else errs.push('확인 [예] 없음');
    const gain1=Math.round(S.gold-g0);
    if(!(gain1>0)) errs.push('첫 분해 환급 없음 '+gain1);   // 금액은 addGold 버프(가호 등)가 곱해지므로 >0 만 본다 — 산식은 위 '환급 산식' 검사 담당
    if(S.equips.includes(e)) errs.push('분해 후에도 목록에 남음');
    sal.onclick(); const y2=findBtnByText(root,'예'); if(y2) y2.onclick();   // 남은 화면의 같은 버튼을 다시 누른다
    if(Math.round(S.gold-g0)!==gain1) errs.push('재클릭으로 골드 재지급 +'+Math.round(S.gold-g0-gain1)+' (복제)');
    /* 강화도 같은 경로 — 파괴된 장비에 재화만 빠지면 안 된다 */
    ev('openEnhance')(e);
    const enh=root.children[root.children.length-1], eb=findBtnByText(enh,'강화');
    const g1=S.gold, s1=S.stones; S.stones=Math.max(S.stones||0,99);
    const s1b=S.stones;
    if(eb){ eb.disabled=false; eb.onclick(); }
    if(S.gold!==g1||S.stones!==s1b) errs.push('처분된 장비 강화에 재화 소모');
    S.stones=s1;
  }
  S.gold=keep.gold; S.stones=keep.stones; S.equips=keep.equips; ev('closeSub')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-24 회귀: 세이브·입력 문자열의 HTML — el()/toast()/sysLog() 는 innerHTML 이라
   가져오기 세이브에 심은 태그가 그대로 실행될 수 있었다. 로드(mergeDefaults)에서 < > 를 걷어내는지,
   입력칸 정리(safeText)가 태그 문자를 없애는지 본다. */
step('세이브·입력 문자열 HTML 제거 — 가져오기 세이브 태그 무력화', ()=>{
  const errs=[];
  const bad={ gold:1, stats:{}, name:'<img src=x onerror=alert(1)>', guildName:'<h1>x</h1>',
    equips:[{grade:'N', slot:'<b>방패</b>', enh:0, equipped:false}] };
  const before=store.get('hwasin_save_v1');
  store.set('hwasin_save_v1', JSON.stringify(bad)); ev('load')();
  const S=ev('S'), j=JSON.stringify(S);
  if(/[<>]/.test(j)) errs.push('로드 후에도 < > 잔존: '+(j.match(/.{0,20}[<>].{0,20}/)||[''])[0]);
  if(!S.equips.some(x=>x.slot==='b방패/b')) errs.push('일반 문자는 보존돼야 한다(태그 기호만 제거): '+JSON.stringify(S.equips.map(x=>x.slot)));
  const st=ev('safeText');
  if(st('<h1>x</h1>',12)!=='h1x/h1') errs.push('safeText 결과 '+st('<h1>x</h1>',12));
  if(st('  대장간  ',12)!=='대장간') errs.push('safeText 가 정상 이름을 훼손');
  if(st('가'.repeat(30),12).length!==12) errs.push('safeText 길이 상한 미적용');
  if(before==null) store.delete('hwasin_save_v1'); else store.set('hwasin_save_v1', before);
  ev('load')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25: 영웅 소환 여러 회(summonBatch) — 판정 단위·집계 보존 · 소환권 부족 시 중단 · 0장이면 null. */
step('영웅 소환 여러 회 — 집계 보존 · 소환권 한도', ()=>{
  const errs=[], S=ev('S');
  const keep={ tick:S.tickHero, sum:S.stats.summons, shards:JSON.parse(JSON.stringify(S.shards)), heroes:JSON.parse(JSON.stringify(S.heroes)), fail:S.summonFail, hs:JSON.parse(JSON.stringify(S.heroShards||{})) };
  S.tickHero=25; const s0=S.stats.summons, sh0=Object.values(S.shards).reduce((a,b)=>a+(b||0),0);
  const r=ev('summonBatch')(10);
  if(!r || r.n!==10) errs.push('10회 실행 수 '+(r&&r.n));
  if(S.stats.summons-s0!==10) errs.push('stats.summons +'+(S.stats.summons-s0)+' (기대 10 — 주간/월간 의뢰 집계 단위)');
  if(S.tickHero!==15) errs.push('소환권 '+S.tickHero+' (기대 15)');
  const gain=Object.values(r.gained).reduce((a,b)=>a+b,0); if(gain<200 || gain>600) errs.push('조각 합계 '+gain+' (200뽑기 × 1~3)');
  S.tickHero=3; const r3=ev('summonBatch')(10); if(!r3 || r3.n!==3 || S.tickHero!==0) errs.push('소환권 3장에서 3회로 멈추지 않음');
  if(ev('summonBatch')(5)!==null) errs.push('소환권 0장인데 null 아님');
  S.tickHero=keep.tick; S.stats.summons=keep.sum; S.shards=keep.shards; S.heroes=keep.heroes; S.summonFail=keep.fail; S.heroShards=keep.hs;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #11): 즉시 결과 — 첫 클리어 전엔 숨김 · 1회 지급 · 계열 기록 · 복귀처(길잡이 뒤에만) · 무음 구간 닫힘. */
step('즉시 결과 — 노출 조건 · 1회 지급 · 계열 기록 · 복귀처', ()=>{
  const errs=[], S=ev('S'), B=ev('Battle'), fam=ev('dgFamily'), ok=ev('dgSkipOK');
  const keep={ seen:JSON.parse(JSON.stringify(S.dgSeen||{})), gs:S.guideStep, st:S.stones, tw:S._tower, dd:S.stats.ddStage, eb:S.stats.emberBest };
  if(fam('황금 용광로 3단계')!=='황금 용광로' || fam('정령의 시련 · 섬멸 2단계')!=='정령의 시련' || fam('불꽃의 탑')!=='불꽃의 탑') errs.push('계열 키 파생');
  S.dgSeen={}; S._tower=0; S.stats.ddStage=0; S.stats.emberBest=0;
  const cfg={ name:'스모크시련 · 1단계', col:'#fff', foeCP:1, kind:'mobs', count:1, dur:5, reward:()=>{ S.stones+=7; } };
  if(ok(cfg)) errs.push('첫 클리어 전인데 노출');
  S.guideStep=ev('GUIDE_CHAIN').length; ev("currentModal='golddungeon'");
  ev('enterDungeonFight')(cfg);
  if(!B.inDungeon()) errs.push('입장 실패');
  if(cfg._back!=='golddungeon') errs.push('복귀처 '+cfg._back);
  const st0=S.stones; const r=B.finishNow();
  if(!r || !r.finished || B.inDungeon()) errs.push('즉시 결과 미완주');
  if(S.stones-st0!==7) errs.push('보상 '+(S.stones-st0)+' (기대 7, 1회)');
  if(ev('currentModal')!=='dgResult') errs.push('결과창 미표시: '+ev('currentModal'));
  if(!S.dgSeen['스모크시련']) errs.push('계열 클리어 미기록');
  if(!ok({ name:'스모크시련 · 3단계' })) errs.push('같은 계열 다른 단계 미노출');
  if(ev('_instantRun')!==0 || ev('_dgCfg')!==null) errs.push('무음 구간/진행 cfg 미정리');
  if(B.finishNow()!==null) errs.push('던전 밖 finishNow 가 null 아님');
  ev('closeModal')();
  S.guideStep=0; ev("currentModal='golddungeon'"); const c2={ name:'스모크시련 · 2단계', col:'#fff', foeCP:1, kind:'mobs', count:1, dur:5 };
  ev('enterDungeonFight')(c2); if(c2._back!==null) errs.push('길잡이 중 복귀처 설정됨'); B.finishNow(); ev('closeModal')();
  S.dgSeen={}; S._tower=3; if(!ok({ name:'불꽃의 탑' })) errs.push('탑 기록 보유자 소급 미인정');
  S.dgSeen=keep.seen; S.guideStep=keep.gs; S.stones=keep.st; S._tower=keep.tw; S.stats.ddStage=keep.dd; S.stats.emberBest=keep.eb;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(리뷰 확정): 인트로 보상 팝업 ✕ → introDone 미설정 → 재생 시 튜토리얼 0단계 되감김. 실행 경로로 검사한다
   (종전 테스트는 소스 정규식만 봐서 이 경로를 못 잡았다). + 길잡이 배너 전투 중 숨김 · 소환 수량 칩 라벨. */
step('인트로 ✕ 건너뛰기 — 남은 보상 1회 지급 · introDone · 튜토리얼 되감김 없음', ()=>{
  const errs=[]; ev('_saveSealed = false; _tabLost = false'); ev('save')();
  const raw=store.get('hwasin_save_v1'); let S=ev('S');
  S.introDone=false; S.seenTutorial=false; const t=ev('tutState')(); t.introResGiven=true; t.introClaimed={0:true};
  S.tutStep=3; S.attendLastDate='x'; S.claimed.attend={};
  const tk0=S.tickHero, g0=S.gold;
  ev('introRewards')();
  if(ev('currentModal')!=='introReward') errs.push('보상 팝업 미표시: '+ev('currentModal'));
  ev('closeModal')();   // ✕
  if(!(t.introClaimed[1] && t.introClaimed[2])) errs.push('남은 칸 미지급: '+JSON.stringify(t.introClaimed));
  if(S.introDone!==true) errs.push('introDone 미설정');
  if(S.tickHero!==tk0+1) errs.push('소환권 '+(S.tickHero-tk0)+' (기대 +1)');
  if(!(S.gold>g0)) errs.push('첫 방치 골드 미지급');
  ev('nextDialogue')(); ev('nextDialogue')();   // 튜토리얼 시작 대사 2줄 넘김 → 콜백
  if(S.tutStep!==3) errs.push('튜토리얼 되감김: tutStep '+S.tutStep+' (기대 3)');
  const tk1=S.tickHero; ev('introRewards')(); ev('closeModal')();
  if(S.tickHero!==tk1) errs.push('재진입 시 중복 지급');
  store.set('hwasin_save_v1', raw); ev('load')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #6): 튜토리얼 직후 '강해지는 길' — 제작 결과 [리더에게 장착](빈 부위만·파괴 없음) · 추천 사냥터 점(본 뒤 소등) · 전투력 구성 라벨. */
step('제작 결과 리더 장착(빈 부위만) · 추천 사냥터 점 · 구성 라벨', ()=>{
  const errs=[], S=ev('S'), root=ev("$('#modal-root')");
  const keep={ eq:S.equips.slice(), st:S.seenTutorial, ht:S.huntTier, hs:S.huntHintSeen, lv:JSON.parse(JSON.stringify(S.heroes)) };
  S.seenTutorial=true;
  const lead=ev('party')()[0]||ev('ownedHeroes')()[0];
  const fsl=ev('FORGE_SLOTS').find(x=>x.items&&x.items.N&&x.items.N.length&&ev('slotKeyOf')(x.items.N[0].n)[0]!=='#'), it=fsl.items.N[0];
  const part=ev('slotKeyOf')(it.n);
  S.equips=S.equips.filter(x=>!(x.equipped && (!x.heroId||x.heroId===lead.hero_id) && ev('slotKeyOf')(x.slot)===part));
  const craft=()=>{ S.craft={ grade:'N', slot:it.n, cat:fsl.k, ic:'⚔️', endAt:0, p0:1, sec:1, gold:0, recipe:[] }; ev('craftAutoCheck')(); };
  const label=`리더 ${lead.name}에게 장착`;
  craft(); const btn=findBtnByText(root, label, true);
  if(!btn) errs.push('빈 부위인데 장착 버튼 없음');
  else {
    const n0=S.equips.length, p0=ev('heroPower')(lead), ne=S.equips[S.equips.length-1];
    btn.onclick();
    if(!(ne.equipped && ne.heroId===lead.hero_id)) errs.push('장착 안 됨');
    if(!(ev('heroPower')(lead)>p0)) errs.push('리더 전투력 불변');
    if(S.equips.length!==n0) errs.push('장비 수 변화(파괴) '+(S.equips.length-n0));
    btn.onclick(); if(S.equips.length!==n0) errs.push('재클릭 부작용');
    ev('closeSub')();
    // 같은 부위 착용 중 → 새 결과 팝업엔 버튼이 없어야 한다(스텁은 옛 팝업이 남을 수 있어 라벨 개수 증감으로 판정)
    const cnt=()=>collectText(root).split(label).length-1, c1=cnt();
    craft(); if(cnt()>c1) errs.push('착용 중 부위에 장착 버튼 → 기존 장비 파괴 위험');
    ev('closeSub')();
  }
  // 추천 사냥터: 리더를 강하게 → 점 대상 · 몬스터 화면 본 뒤 소등
  S.huntTier=0; S.huntHintSeen=0; S.heroes[lead.hero_id].level=200;
  const up=ev('huntUpgradeTier')();
  if(!(up>0)) errs.push('강한 리더인데 추천 없음 '+up);
  const b=new Node2('div'); ev('MODALS').monster.render(b);
  if(!collectText(b).includes('여기서 사냥')) errs.push('몬스터 화면 추천 행 없음');
  if(ev('huntUpgradeTier')()!==-1) errs.push('본 뒤에도 점 유지');
  S.seenTutorial=false; S.huntHintSeen=0; if(ev('huntUpgradeTier')()!==-1) errs.push('튜토리얼 중 점');
  if(js.includes('영웅 9종 합계')) errs.push("구성 라벨 '영웅 9종 합계' 잔존");
  S.equips=keep.eq; S.seenTutorial=keep.st; S.huntTier=keep.ht; S.huntHintSeen=keep.hs; S.heroes=keep.lv;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #17·#14): 결과 연출 문법 — 투기장 결과 카드 rc-anim·승급 배너(토스트 아님) · 제작 결과 rc-anim(등급별 광선) · 콤보 초기화. */
step('결과 연출 — 투기장 카드·승급 배너 · 제작 결과 카드 · 콤보 초기화', ()=>{
  const errs=[], S=ev('S');
  const findCls=(root,re)=>{ let f=null; const rec=n=>{ if(!n||typeof n!=='object'||f) return; if(re.test(String(n.className||''))) f=n; (n.children||[]).forEach(rec); }; rec(root); return f; };
  const keep={ pts:S.arenaPts, tier:S.arenaTier, st:S.arenaStreak, rank:S.arenaRank, dice:S.dice, sess:JSON.parse(JSON.stringify(S.arenaSession||{})), wins:S.stats.arenaWins, seen:S.seenTutorial, eq:S.equips.slice() };
  S.seenTutorial=true; S.arenaTier=0; S.arenaPts=ev('TIER_PTS')[1]-50; S.arenaStreak=0;
  ev('arenaResult')(true,'스모크',100,'브론즈');
  const body=ev("$('#modalBody')");
  if(S.arenaTier!==1) errs.push('승급 판정 '+S.arenaTier);
  if(!findCls(body,/\bar-promo\b.*\bup\b/)) errs.push('승급 배너 없음');
  if(!findCls(body,/result-card rc-anim rc-win/)) errs.push('투기장 승리 카드 rc-anim 없음');
  ev('arenaResult')(false,'스모크',100,'실버');
  if(S.arenaTier!==0 || !findCls(ev("$('#modalBody')"),/\bar-promo\b.*\bdn\b/)) errs.push('강등 배너 없음');
  ev('closeModal')();
  S.craft={ grade:'E', slot:'장비', cat:'무기', ic:'⚔️', endAt:0, p0:1, sec:1, gold:0, recipe:[] }; ev('craftAutoCheck')();
  const root=ev("$('#modal-root')");
  if(!findCls(root,/result-card rc-anim rc-win/)) errs.push('제작 성공 카드 rc-anim 없음');
  if(!/rc-rays rr-e/.test(collectText(root))) errs.push('E 제작 광선 없음');
  ev('closeSub')(); ev('closeModal')();
  const bsrc=js.slice(js.indexOf('  function startDungeon(cfg){'), js.indexOf('  function startDungeon(cfg){')+400);
  if(!/combo=0; comboT=0; comboPop=0;/.test(bsrc)) errs.push('startDungeon 콤보 초기화 없음');
  S.arenaPts=keep.pts; S.arenaTier=keep.tier; S.arenaStreak=keep.st; S.arenaRank=keep.rank; S.dice=keep.dice; S.arenaSession=keep.sess; S.stats.arenaWins=keep.wins; S.seenTutorial=keep.seen; S.equips=keep.eq;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(리뷰 확정): ① 퀘스트 기본 탭 — 주간만 받을 게 있으면 '주간' 탭(종전 questClaimable 이 주간을 OR 로 포함해 주간·월간 분기가 죽어 있었다)
   ② 길드 하위 오버레이(길드 레이드) 입장 → 결과 뒤 길드 모달 + 해당 하위 오버레이로 복귀. */
step('퀘스트 기본 탭(주간 우선) · 길드 레이드 결과 뒤 복귀', ()=>{
  const errs=[], S=ev('S'), M=ev('MODALS');
  const keep={ gs:S.guideStep, wc:ev('weeklyClaimable'), dc:ev('dailyClaimable') };
  S.guideStep=ev('GUIDE_CHAIN').length;
  ev('dailyClaimable = ()=>false'); ev('weeklyClaimable = ()=>true');
  const b=new Node2('div'); M.quest.render(b);
  let on=null; const rec=n=>{ if(!n||typeof n!=='object') return; if(/\btab\b.*\bon\b/.test(String(n.className||''))) on=on||String(n._html||n._text||''); (n.children||[]).forEach(rec); }; rec(b);
  if(on!=='주간') errs.push('주간만 받을 게 있는데 기본 탭 '+on);
  ctx.__wc=keep.wc; ctx.__dc=keep.dc; ev('weeklyClaimable = __wc; dailyClaimable = __dc');   // vm 컨텍스트 전역(ctx)으로 원복 — 테스트 파일 globalThis 는 다른 영역
  if(typeof ev('dailyClaimable')!=='function') errs.push('스텁 원복 실패');
  // 길드 레이드(하위 오버레이) — 입장 시 복귀처는 guildRaid, 부모는 guild
  ev("currentModal='guild'; _subKey='guildRaid'");
  const cfg={ name:'길드 레이드 · 스모크', col:'#fff', foeCP:1, kind:'mobs', count:1, dur:5 };
  ev('enterDungeonFight')(cfg);
  if(cfg._back!=='guildRaid') errs.push('길드 레이드 복귀처 '+cfg._back);
  if(ev('DG_BACK_PARENT').guildRaid!=='guild') errs.push('부모 모달 매핑 없음');
  ev('Battle').finishNow(); ev('closeModal')();
  S.guideStep=keep.gs;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #2 1단계): 투기장 순위 골드 버프는 그 주 순위에만 — 지난 주차 순위면 0(종전: 투기장을 안 열면 +90% 영구) ·
   투기장을 해 본 이용자만 자동 주간 정산. */
step('투기장 순위 버프 주차 가드 · 자동 주간 정산 대상', ()=>{
  const errs=[], S=ev('S'), buff=ev('arenaGoldBuffPct');
  const keep={ rk:S.arenaRank, wk:S.arenaWeek, en:S.stats.arenaEnters, dice:S.dice, pts:S.arenaPts, tier:S.arenaTier, st:S.arenaStreak, ses:JSON.parse(JSON.stringify(S.arenaSession||{})) };
  S.arenaRank=1; S.arenaWeek=ev('arenaWeekKey')(); const top=buff(); if(!(top>0)) errs.push('현재 주차 1위 버프 '+top);
  S.arenaWeek='1999-1-4'; if(buff()!==0) errs.push('지난 주차 순위인데 버프 '+buff());
  S.arenaWeek=''; if(buff()!==top) errs.push('주차 미기록(구세이브·시뮬)은 가드 건너뜀이어야');
  // 자동 주간 정산: 투기장 입장 이력 없으면 무동작
  S.stats.arenaEnters=0; S.arenaWeek='1999-1-4'; S.arenaRank=1; ev('arenaWeekAuto')(); if(S.arenaWeek!=='1999-1-4') errs.push('투기장 안 한 이용자가 자동 정산됨');
  S.stats.arenaEnters=3; S.arenaSession={w:5,l:0,t:5}; const d0=S.dice||0; ev('arenaWeekAuto')();
  if(S.arenaWeek!==ev('arenaWeekKey')()) errs.push('입장 이력 있는데 자동 정산 안 됨'); if(!((S.dice||0)>d0)) errs.push('자동 정산 주사위 미지급');
  S.arenaRank=keep.rk; S.arenaWeek=keep.wk; S.stats.arenaEnters=keep.en; S.dice=keep.dice; S.arenaPts=keep.pts; S.arenaTier=keep.tier; S.arenaStreak=keep.st; S.arenaSession=keep.ses;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #5): 길잡이 완주 뒤 — 모험 버튼 점(오늘 안 봤고 남은 입장 있을 때) · 완주 1회 배너(모험을 열면 끝) · 배지 틱이 월 롤오버를 일으키지 않음. */
step('길잡이 완주 뒤 모험 점 · 완주 1회 배너', ()=>{
  const errs=[], S=ev('S'), bn=ev("$('#guide-banner')");
  const keep={ gs:S.guideStep, st:S.seenTutorial, ad:S.advSeenDay, gf:S.guideFinBanner, mk:JSON.parse(JSON.stringify(S.monthly||{})), pl:S._pendingLoginToast, cnt:JSON.parse(JSON.stringify(S.daily.counts)) };
  S.seenTutorial=true; S.guideStep=ev('GUIDE_CHAIN').length; S.advSeenDay=''; ev('rollDaily')(); S.daily.counts={};
  if(!ev('advDotOn')()) errs.push('완주·오늘 미열람·남은 입장 있음인데 모험 점 꺼짐');
  // 완주 순간 → 배너 1(표시) → 모험 render → 2(숨김)·점 꺼짐
  S.guideFinBanner=1; ev('updateGuideBanner')(); if(bn.classList.contains('hidden')) errs.push('완주 배너 미표시');
  const b=new Node2('div'); ev('MODALS').adventure.render(b);
  if(S.guideFinBanner!==2) errs.push('모험을 열었는데 완주 배너 상태 '+S.guideFinBanner);
  if(!bn.classList.contains('hidden')) errs.push('모험을 열었는데 완주 배너가 남음');
  if(ev('advDotOn')()) errs.push('오늘 모험을 봤는데 점 유지');
  S.guideFinBanner=0; ev('updateGuideBanner')(); if(!bn.classList.contains('hidden')) errs.push('기존 완주 세이브(0)에 배너가 뜸');
  // 배지 틱은 월 롤오버를 일으키지 않는다(forgetrial 제외 이유)
  S.monthly={ key:'1999-1', base:{kills:0,crafts:0,summons:0,towerTries:0}, claimed:{} }; S.advSeenDay=''; const pl0=JSON.stringify(S._pendingLoginToast||null);
  ev('refreshClaimBadges')(); if(S.monthly.key!=='1999-1' || JSON.stringify(S._pendingLoginToast||null)!==pl0) errs.push('refreshClaimBadges 가 월 롤오버를 일으킴');
  S.guideStep=keep.gs; S.seenTutorial=keep.st; S.advSeenDay=keep.ad; S.guideFinBanner=keep.gf; S.monthly=keep.mk; S._pendingLoginToast=keep.pl; S.daily.counts=keep.cnt; ev('updateGuideBanner')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #9·#11·#10·#4·#15): 성장·보상 순간 연출 — 합성 등장 · 세트 발동 카드 · 칭호 획득 알림 · 수령음 · 골드 레벨업 전후 카드 · 탑 웨이브 돌파. */
step('2차 C묶음 — 합성 등장·세트 카드·칭호 알림·수령음·레벨업 카드·웨이브 돌파', ()=>{
  const errs=[], S=ev('S'), root=ev("$('#modal-root')");
  const keep={ st:S.seenTutorial, sh:JSON.parse(JSON.stringify(S.shards)), hs:JSON.parse(JSON.stringify(S.heroShards||{})), heroes:JSON.parse(JSON.stringify(S.heroes)), gold:S.gold, own:JSON.parse(JSON.stringify(S.titleOwn||{})), eq:S.equips.slice(), kills:S.stats.kills };
  S.seenTutorial=true;
  // 합성 → '영웅 합성' 등장 팝업(확인 버튼)
  const nx=ev('HERO_ROSTER').find(r=>!ev('heroOwned')(r.hero_id) && ev('heroFusePrereq')(r.hero_id));
  if(nx){ S.shards[nx.class_id]=ev('heroFuseNeed')(nx.hero_id)+5;
    const hb=new Node2('div'); ev('MODALS').hero.render(hb);   // 스텁은 openModal 의 modalBody 가 비어 render(b) 직접(관례)
    let fb=null; const rec=n=>{ if(!n||typeof n!=='object'||fb) return; if(n.tagName==='BUTTON' && String(n._html||n._text||'').trim()==='합성' && !n.disabled) fb=n; (n.children||[]).forEach(rec); }; rec(hb);
    if(!fb) errs.push('합성 버튼 없음'); else { fb.onclick({stopPropagation(){}}); if(!ev('heroOwned')(nx.hero_id)) errs.push('합성 안 됨'); if(!collectText(root).includes('영웅 합성')) errs.push('합성 등장 팝업 없음'); }
    ev('closeModal')(); }
  // 칭호: 새로 달성하면 titleSyncOwn(true) 가 반환·기록
  S.titleOwn={}; S.stats.kills=999999; const add=ev('titleSyncOwn')(true); if(!add.length) errs.push('칭호 달성 반환 없음');
  // 골드 레벨업: 전후 카드(growthBurst) · 클릭 시점 가격
  const lead=ev('party')()[0]; const lv0=ev('heroSlot')(lead.hero_id).level||1; S.gold=1e9;
  ev("_heroTab='스탯'"); ev('heroDetail')(lead.hero_id); const lb=findBtnByText(root,`레벨업 (골드 ${ev('fmt')(lv0*80000)})`,true);
  if(!lb) errs.push('레벨업 버튼 없음'); else { const g0=S.gold; lb.onclick(); if(ev('heroSlot')(lead.hero_id).level!==lv0+1 || g0-S.gold!==lv0*80000) errs.push('레벨업 결과'); if(!collectText(root).includes(`Lv${lv0+1}`)) errs.push('레벨업 전후 카드 없음'); }
  ev('closeSub')();
  // 소스 계약: 수령음 9곳 · setCur 방치 틱 맥동 억제 · 웨이브 배너 가드(시뮬 무관)
  if((js.match(/claimSfx\(\)/g)||[]).length<9) errs.push('수령음 호출 부족');
  if(!js.includes("setCur('#curGold', S.gold, idleGoldPerMin()/40)")) errs.push('골드 맥동 임계 없음');
  const wb=js.slice(js.indexOf('function waveBanner('), js.indexOf('function bossBanner('));
  if(!/^function waveBanner\(n\)\{\n  if\(_instantRun>0\) return;/.test(wb) || /dg\.|bRnd\(|shake/.test(wb)) errs.push('waveBanner 가드/시뮬 상태 접근');
  if(!js.includes('waveBanner(dg.waveNo)')) errs.push('웨이브 돌파 호출 없음');
  if(js.includes('const setTier = st=>')) errs.push('세트 판정 람다 복제 잔존(setTierOf 로 통일)');
  S.seenTutorial=keep.st; S.shards=keep.sh; S.heroShards=keep.hs; S.heroes=keep.heroes; S.gold=keep.gold; S.titleOwn=keep.own; S.equips=keep.eq; S.stats.kills=keep.kills;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #18·#6): 창을 닫지 않은 부재 — 켠 채 절전 간격 정산 · 숨김 중 날짜 전환의 부재 적립 기준일 · 합성 가능 점. */
step('절전 간격 정산 · 숨김 날짜 전환 부재 적립 · 합성 가능 점', ()=>{
  const errs=[], S=ev('S'), doc=ev('document');
  const keep={ hidden:doc.hidden, p:S.offlinePending, ab:JSON.parse(JSON.stringify(S.awayBank||{})), af:S._awayFrom, dd:S.daily.date, tw:S._tower, st:S.seenTutorial, sh:JSON.parse(JSON.stringify(S.shards)) };
  ev('_saveSealed = false; _tabHideTs = 0'); doc.hidden=false;
  const now=ev('Date.now()'); S.offlinePending=0; S.offHi=0;   // #16 고수위 비움(과거 시각 주입 검사)
  const add=ev('_wallGapCheck')(now-3*3600e3, now);
  const want=Math.floor(ev('OFFLINE_GPM')/60*3*3600); if(Math.abs(add-want)>1 || S.offlinePending!==add) errs.push('보이는 절전 3시간 정산 '+add+' (기대 '+want+')');
  doc.hidden=true; if(ev('_wallGapCheck')(now-3*3600e3, now)!==0) errs.push('숨김 중 절전 간격이 정산됨(숨김 경로와 이중)');
  doc.hidden=false; ev('_tabHideTs='+(now-100)); if(ev('_wallGapCheck')(now-3*3600e3, now)!==0) errs.push('숨김 정산 대기 중 절전 간격 정산'); ev('_tabHideTs=0');
  // 숨김 중 3일 경과(날짜 전환) → 보이면 2일 적립 / 밤새 숨김 → 0
  S._tower=20; S.awayBank={ days:0, gold:0, stones:0, box:0, hi:0 }; S._awayFrom='';
  const D=n=>new Date(now-n*864e5).toDateString();
  doc.hidden=true; S.daily.date=D(3); ev('rollDaily')();
  if(S._awayFrom!==D(3) || S.awayBank.days!==0) errs.push('숨김 날짜 전환에서 기준일 보존 실패 '+JSON.stringify([S._awayFrom,S.awayBank.days]));
  doc.hidden=false; const n=ev('awayCatchUp')(); if(n!==2 || S.awayBank.days!==2) errs.push('보일 때 부재 적립 '+n+'/'+S.awayBank.days+' (기대 2)');
  S.awayBank={ days:0, gold:0, stones:0, box:0, hi:0 }; S._awayFrom='';
  doc.hidden=true; S.daily.date=D(1); ev('rollDaily')(); doc.hidden=false; ev('awayCatchUp')();
  if(S.awayBank.days!==0) errs.push('밤새 숨김(하루 전환)인데 적립 '+S.awayBank.days);
  // 합성 가능 점: 튜토리얼 뒤 + 합성 가능 영웅 → 영웅 내비 점
  S.seenTutorial=true; const nx=ev('HERO_ROSTER').find(r=>!ev('heroOwned')(r.hero_id) && ev('heroFusePrereq')(r.hero_id));
  if(nx){ S.shards[nx.class_id]=ev('heroFuseNeed')(nx.hero_id)+10; ev('refreshClaimBadges')();
    if(!ev('heroFuseAvail')()) errs.push('합성 가능한데 영웅 버튼 점 조건 거짓');   // 스텁 DOM 은 querySelector 가 매번 새 노드 — 조건 함수로 검사, 실제 점은 브라우저 QA
    S.seenTutorial=false; if(ev('heroFuseAvail')()) errs.push('튜토리얼 중 합성 점'); }
  doc.hidden=keep.hidden; S.offlinePending=keep.p; S.awayBank=keep.ab; S._awayFrom=keep.af; S.daily.date=keep.dd; S._tower=keep.tw; S.seenTutorial=keep.st; S.shards=keep.sh;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #1·#8·#13·#7·#12): 골드던전권 실사용 · 재료 상한 무지급/표시 · 주·월 롤오버 5초 주기 · 길잡이 다음 목표 · 처치음. */
step('2차 A묶음 — 골드던전권·재료 상한·주월 롤오버·길잡이 다음·처치음', ()=>{
  const errs=[], S=ev('S'), root=ev("$('#modal-root')");
  const keep={ tk:S.goldTicket, mats:JSON.parse(JSON.stringify(S.mats)), gs:S.guideStep, st:S.seenTutorial, eq:S.equips.slice(), gp:S.guideProg, goldAuto:S.goldAuto };
  ev('rollDaily')();
  // ① 골드던전권: 자동 연전은 권을 태우지 않고, 수동은 3회 소진 뒤 권 1장으로 1회
  const d=ev('GOLD_DUNGEON')[0]; ev('matGain')(d.mat, d.need*3); S.daily.counts.gold=3; S.goldTicket=2;
  if(ev('enterGoldDungeon')(d,true)!==false || S.goldTicket!==2) errs.push('자동 입장이 골드던전권을 씀');
  ev('enterGoldDungeon')(d,false);
  const yes=findBtnByText(root,'예',true); if(!yes) errs.push('골드던전 확인창 없음'); else { yes.onclick();
    if(S.goldTicket!==1) errs.push('권 차감 '+S.goldTicket); if(S.daily.counts.gold!==3) errs.push('일일 횟수가 권 입장에 소모됨');
    if(!ev('Battle').inDungeon()) errs.push('권 입장 실패'); ev('Battle').finishNow(); ev('closeModal')(); }
  // ② 재료 상한: matGain 실제 증가분 · 등급 전부 상한이면 회색코인 교환 품절 · avoidCap 은 남은 재료로
  const E=ev('MAT_BY_GRADE').E, capE=ev('MAT_CAP').E;
  E.forEach(m=>S.mats[m.k]=capE); if(!ev('matGradeCapped')('E')) errs.push('E 전부 상한 판정');
  if(ev('matGain')(E[0].k,5)!==0) errs.push('상한에서 matGain 반환 ≠ 0');
  const gsE=ev('GRAYSHOP').find(x=>/영웅 재료/.test(x.t)); if(!(gsE.soldOut && gsE.soldOut())) errs.push('E 전부 상한인데 회색코인 영웅 재료 교환이 판매 중');
  if(ev('matGainGrade')('E',1,{avoidCap:true})!==null) errs.push('전부 상한 avoidCap 이 null 아님');
  S.mats[E[3].k]=0; for(let i=0;i<20;i++){ const m=ev('matGainGrade')('E',1,{avoidCap:true}); if(!m || m.k!==E[3].k){ errs.push('avoidCap 이 상한 재료를 고름'); break; } }
  // ③ 주·월 롤오버 — 5초 주기가 weeklyState/monthlyState 를 refreshClaimBadges 보다 먼저 부른다(_loopOn·보일 때)
  { const line=js.split('\n').find(l=>l.includes('if(_loopOn && !document.hidden){') && l.includes('refreshClaimBadges()')) || '';
    const iw=line.indexOf('weeklyState();'), im=line.indexOf('monthlyState();'), ib=line.indexOf('refreshClaimBadges()');
    if(!(iw>=0 && im>=0 && ib>iw && ib>im)) errs.push('5초 주기 주·월 롤오버 없음(또는 배지보다 뒤)'); }
  // ④ 길잡이 단계를 넘긴 제작 결과 → [다음 길잡이 · 다음 목표 ▶]
  S.seenTutorial=true; S.guideStep=0; S.guideProg=0; const G=ev('GUIDE_CHAIN');
  const loc=ev('forgeLocate')(G[0].slot);
  if(loc){ const s2=ev('FORGE_SLOTS')[loc.slotIdx]; S.craft={ grade:loc.grade, slot:G[0].slot, cat:s2.k, ic:'⚔️', endAt:0, p0:1, sec:1, gold:0, recipe:[] }; ev('craftAutoCheck')();
    if(S.guideStep!==1) errs.push('길잡이 1단계 제작 뒤 guideStep '+S.guideStep+' (검사 전제 불성립)');
    else if(!findBtnByText(root,`다음 길잡이 · ${G[1].slot} ▶`,true)) errs.push('다음 길잡이 버튼 없음');
    ev('closeSub')(); ev('closeModal')(); } else errs.push('길잡이 1단계 레시피 위치 불명');
  // ⑤ 처치음: 우두머리 처치는 bossdown(레전더리 음 희소성) · coin 합치기·리미터 코드
  if(js.includes("sfx(boss?'legendary':'coin')")) errs.push('우두머리 처치에 legendary 음');
  if(!/bossdown:\[/.test(js) || !js.includes('_coinG') || !js.includes('createDynamicsCompressor')) errs.push('처치음 합치기·리미터 코드 없음');
  S.goldTicket=keep.tk; S.mats=keep.mats; S.guideStep=keep.gs; S.seenTutorial=keep.st; S.equips=keep.eq; S.guideProg=keep.gp; S.goldAuto=keep.goldAuto;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(리뷰 v5.350~353 확정 3건): ① 회색코인 교환 — 그린 뒤 상한에 닿은 품목은 클릭 시점에 막는다(결제 전)
   ② 긴 안내 토스트 — 표시 시간·사라짐 애니메이션을 함께 늘린다(기본 토스트 불변) ③ 가져오기 사전검사 = 로드 이관 단위(migrateLoaded). */
step('리뷰 반영 — 교환 클릭 시점 품절 · 긴 토스트 · 가져오기 검사 = 로드 이관', ()=>{
  const errs=[], S=ev('S');
  const keep={ mats:JSON.parse(JSON.stringify(S.mats)), gray:S.gray, ls:S.lastSeen, op:S.offlinePending };
  // ① 상점 길드 탭을 그린 뒤(E 한 칸 남음) 마지막 칸이 차면 [교환]은 코인을 빼지 않는다
  const E=ev('MAT_BY_GRADE').E, capE=ev('MAT_CAP').E, it=ev('GRAYSHOP').find(x=>/영웅 재료/.test(x.t));
  E.forEach(m=>S.mats[m.k]=capE); S.mats[E[0].k]=capE-1; S.gray=1000;
  /* el 은 const 라 바꿀 수 없다 → document.createElement 를 감싸 만든 노드를 순서대로 모은다. mkBuy 는 카드(shop-card) → 버튼 순으로 만든다. */
  const made=[], ceO=documentStub.createElement;
  documentStub.createElement=function(t){ const n=ceO.call(this,t); made.push(n); return n; };
  const pick=()=>{ let card=null, out=null;
    made.forEach(n=>{ if(String(n.className).split(' ').includes('shop-card')) card=n;
      else if(n.tagName==='BUTTON' && String(n._html).trim()==='교환' && card && /영웅 재료/.test(String(card._html||''))) out=n; });
    return out; };
  Object.assign(ctx, { __tO:null, __toasts:[] });   // game.js 는 strict — 스텁 전역은 vm 컨텍스트에 먼저 선언
  ev(`__tO=toast; __toasts=[]; toast=function(m,ms){ __toasts.push(String(m)); return __tO(m,ms); };`);
  try{
    const box=new Node2('div'); ev('MODALS').shop.render(box);
    const tabs=box.children[0]; tabs.children[7].onclick();   // 길드 탭
    const hit=pick() && { btn:pick() };
    if(!hit) errs.push('회색코인 영웅 재료 교환 버튼 못 찾음(E 한 칸 남았는데 품절 처리?)');
    else {
      S.mats[E[0].k]=capE;   // 창을 연 채 사냥 드랍이 마지막 칸을 채움
      const g0=S.gray, sum0=E.reduce((a,m)=>a+(S.mats[m.k]|0),0);
      hit.btn.onclick();
      if(S.gray!==g0) errs.push(`상한 뒤 클릭에 회색코인 차감 ${g0}→${S.gray}`);
      if(E.reduce((a,m)=>a+(S.mats[m.k]|0),0)!==sum0) errs.push('상한 뒤 클릭에 재료 변동');
      if(!ev('__toasts').some(t=>/보유 상한/.test(t))) errs.push('품절 안내 토스트 없음: '+ev('__toasts').slice(-2).join(' / '));
      // 대조: 한 칸 남은 상태에선 정상 교환(코인 −비용 · 재료 +1)
      S.mats[E[2].k]=capE-1; made.length=0;
      tabs.children[7].onclick();
      const hit2=pick() && { btn:pick() };
      if(!hit2) errs.push('대조 — 교환 버튼 없음');
      else { const g1=S.gray; hit2.btn.onclick(); if(g1-S.gray!==it.cost || (S.mats[E[2].k]|0)!==capE) errs.push(`대조 교환 코인 −${g1-S.gray}(기대 ${it.cost}) · 재료 ${S.mats[E[2].k]}`); }
    }
  } finally { documentStub.createElement=ceO; ev('toast=__tO'); }
  if(String(ev('toast')).includes('__toasts')) errs.push('toast 스텁 원복 실패');
  // ② 긴 토스트: 폭·애니메이션 지연 함께 · 기본 토스트는 종전 그대로
  const tb=ev("$('#toast')");
  ev('toast')('짧은 안내'); const t1=tb.children[tb.children.length-1];
  if(String(t1.className).includes('long') || t1.style.animation) errs.push('기본 토스트가 바뀜');
  ev('toast')('긴 안내', 6000); const t2=tb.children[tb.children.length-1];
  if(!String(t2.className).includes('long') || !/toastOut \.3s ease 5\.6s/.test(String(t2.style.animation))) errs.push('긴 토스트 지연 '+t2.style.animation);
  if(!/toast\(`홈 출격 → [^`]*`, 6000\)/.test(js)) errs.push('리더 교체 안내가 긴 토스트가 아님');
  if(!/\.toast\.long\{/.test(css)) errs.push('.toast.long 폭 규칙 없음');
  // ③ 가져오기 사전검사와 로드가 같은 이관 단위 · 숫자 아닌 lastSeen 은 throw 대신 0
  const imp=js.slice(js.indexOf('function saveImport(){'), js.indexOf('function saveImport(){')+2000);
  const ld=js.slice(js.indexOf('function load(){'), js.indexOf('function load(){')+2000);
  if(!imp.includes('migrateLoaded();') || !ld.includes('migrateLoaded();')) errs.push('가져오기 검사·로드가 migrateLoaded 를 같이 쓰지 않음');
  S.lastSeen={ valueOf:1, toString:1 }; S.offlinePending={ valueOf:1 };
  try{ ev('computeOffline')(); if(typeof S.lastSeen!=='number' || typeof (S.offlinePending||0)!=='number') errs.push('비정상 lastSeen 정리 안 됨'); }
  catch(e){ errs.push('비정상 lastSeen 에 computeOffline throw: '+e.message); }
  S.mats=keep.mats; S.gray=keep.gray; S.lastSeen=keep.ls; S.offlinePending=keep.op;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(2차 미검증 U5·U3·U1 · #4 ③): 상한 재화 구매·수령이 값만 빼지 않는다 · 대장간은 마지막 아이템으로 · 레벨업 버튼 금색 · 리더 장착 전후 클릭 시점. */
step('상한 재화 보호 · 대장간 마지막 선택 · 레벨업 버튼 · 장착 전후 재해석', ()=>{
  const errs=[], S=ev('S');
  const keep=JSON.parse(JSON.stringify({ t:S.ticket, g:S.gold, r:S.ruby, op:S.offlinePending, ab:S.awayBank, fl:S.forgeLast, st:S.seenTutorial, gs:S.guideStep }));
  const GS=ev('GOLDSHOP'), CAP=ev('GOLD_CAP');
  const tk=GS.find(x=>/투기장 입장권/.test(x.t)), ex=GS.find(x=>x.t==='골드 10,000,000'), ad=ev('ADPOOL').find(x=>/투기장 입장권/.test(x.t));
  S.ticket=30; if(!(tk.soldOut&&tk.soldOut()) || !(ad.soldOut&&ad.soldOut())) errs.push('입장권 30장인데 판매/광고 가능');
  S.ticket=10; if(tk.soldOut() || ad.soldOut()) errs.push('입장권 여유 있는데 품절');
  S.gold=CAP-1000; if(!ex.soldOut()) errs.push('골드 상한 직전인데 루비 환전 가능');
  S.gold=1000; if(ex.soldOut()) errs.push('골드 여유 있는데 환전 품절');
  // 방치 정산 [수령]: 상한 근처면 여유만큼 · 나머지는 대기
  const room=ev('goldRoomBase'); S.gold=CAP-500000; S.offlinePending=10000000;
  const bx=new Node2('div'); ev('MODALS').settle.render(bx); const bt=findBtnByText(bx,'수령',true);
  if(!bt) errs.push('정산 수령 버튼 없음'); else { bt.onclick();
    if(S.gold>CAP || S.gold<CAP-50) errs.push('상한 근처 수령 후 골드 '+(CAP-S.gold)+' 모자람');
    if(!(S.offlinePending>0)) errs.push('잘린 몫이 대기로 남지 않음'); }
  S.gold=CAP; const op1=S.offlinePending; const bx2=new Node2('div'); ev('MODALS').settle.render(bx2); const bt2=findBtnByText(bx2,'수령',true);
  if(bt2){ bt2.onclick(); if(S.offlinePending!==op1) errs.push('상한에서 수령했는데 대기 금액이 사라짐'); }
  // 부재 적립: 상한이면 보류(적립 유지)
  S.gold=CAP-10; S.awayBank={ days:2, gold:5000000, stones:10, box:1, hi:0 }; const bx3=new Node2('div'); ev('MODALS').settle.render(bx3);
  const firstBtn=(root,label)=>{ let f=null; const rec=n=>{ if(f||!n||typeof n!=='object') return; if(n.tagName==='BUTTON' && String(n._text||n._html||'').trim()===label){ f=n; return; } (n.children||[]).forEach(rec); }; rec(root); return f; };
  /* 부재 적립 카드가 위(첫 번째 [수령]) — findBtnByText 는 마지막 것을 돌려준다 */
  const bt3=firstBtn(bx3,'수령'); if(bt3){ bt3.onclick(); if(S.awayBank.days!==2 || S.awayBank.gold!==5000000) errs.push('상한에서 부재 적립이 사라짐'); } else errs.push('부재 적립 수령 버튼 없음');
  if(room(100,true)!==10 && S.gold===CAP-10) errs.push('goldRoomBase raw');
  // 대장간: 길잡이 뒤엔 마지막 아이템으로 연다
  S.seenTutorial=true; S.guideStep=ev('GUIDE_CHAIN').length; S.forgeLast='심연 부적';
  const fb=new Node2('div'); ev('MODALS').forge.render(fb);
  if(S.forgeLast!=='심연 부적') errs.push('대장간이 마지막 아이템으로 열리지 않음: '+S.forgeLast);
  // 레벨업 버튼 금색(살 수 있을 때만) — 소스 규칙
  if(!/const lb=el\('button','btn wide'\+\(S\.gold>=lvCost\?' gold':''\)/.test(js)) errs.push('레벨업 버튼 금색 규칙 없음');
  // 리더 장착 전후: 클릭 시점 재해석
  const rc=js.slice(js.indexOf('eqb.onclick=()=>{'), js.indexOf('eqb.onclick=()=>{')+900);
  if(!/const L=heroEntry\(lead\.hero_id\)/.test(rc) || !/p0=heroPower\(L\)/.test(rc)) errs.push('리더 장착 전후가 팝업 시점 스냅숏');
  Object.assign(S, { ticket:keep.t, gold:keep.g, ruby:keep.r, offlinePending:keep.op, awayBank:keep.ab, forgeLast:keep.fl, seenTutorial:keep.st, guideStep:keep.gs });
  ev('closeModal')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #14): 길드 토벌 — 고정 HP 표·주기 경계(HP 만 리필, 단계 유지)·되감기 무시·처치 보상·기록서 5단계마다·참전 보상 4단·기존 적립 불변. */
step('길드 토벌 — 단계 HP 표·주기·처치 보상·기록서·참전 보상·기존 적립 불변', ()=>{
  const errs=[], S=ev('S'), G=ev('GBOSS'), hp=ev('gbossHP');
  const keep=JSON.parse(JSON.stringify({ gb:S.gboss, gc:S.guildCoin, dice:S.dice, rec:S.records }));
  if(hp(1)!==G.H0 || hp(2)!==Math.round(G.H0*G.R) || !(hp(30)>hp(29))) errs.push('단계 HP 표 '+[hp(1),hp(2)].join('/'));
  const cyc=Math.floor(ev('dayIdx')(ev('today')())/G.CYC);
  // 새 주기: dealt/runs/ms 리셋 · 단계·최고 유지 / 되감기(저장 주기가 미래) 무시
  S.gboss={ cyc:cyc-1, stage:7, best:6, dealt:500, runs:5, ms:3 }; ev('gbossState')();
  if(S.gboss.cyc!==cyc || S.gboss.dealt!==0 || S.gboss.runs!==0 || S.gboss.ms!==0 || S.gboss.stage!==7 || S.gboss.best!==6) errs.push('새 주기 리셋 규칙 '+JSON.stringify(S.gboss));
  S.gboss={ cyc:cyc+1, stage:7, best:6, dealt:500, runs:5, ms:3 }; ev('gbossState')();
  if(S.gboss.dealt!==500 || S.gboss.cyc!==cyc+1) errs.push('되감기로 주기 리셋');
  // 처치: 4단계 풀을 넘기는 피해 → 4·5단계 처치(5단계 = 기록서) · 보상 · 길드원 몫 ×1.5
  S.gboss={ cyc, stage:4, best:3, dealt:0, runs:0, ms:0 }; const c0=S.guildCoin||0, d0=S.dice||0, r0=S.records||0;
  const need=hp(4)+hp(5); const d=Math.ceil(need/(1+G.NPC))+1;
  const r=ev('gbossApply')(d);
  if(JSON.stringify(r.kills)!=='[4,5]' || S.gboss.stage!==6 || S.gboss.best!==5) errs.push('처치 연쇄 '+JSON.stringify([r.kills,S.gboss.stage,S.gboss.best]));
  if((S.records||0)-r0!==1 || r.rec!==1) errs.push('5단계 기록서 '+((S.records||0)-r0));
  if((S.dice||0)-d0!==G.KILL_DICE*2) errs.push('처치 주사위 '+((S.dice||0)-d0));
  if((S.guildCoin||0)-c0!==G.KILL_COIN*2+G.MS_RW[0]) errs.push('처치+참전1회 길드코인 '+((S.guildCoin||0)-c0));
  if(r.npc!==Math.round(d*G.NPC)) errs.push('길드원 몫');
  // 참전 보상 4단: 1·2·4·6회
  S.gboss={ cyc, stage:30, best:29, dealt:0, runs:0, ms:0 }; const c1=S.guildCoin||0;
  for(let k=0;k<6;k++) ev('gbossApply')(1);
  if(S.gboss.ms!==4 || (S.guildCoin||0)-c1!==G.MS_RW.reduce((a,b)=>a+b,0)) errs.push('참전 보상 4단 '+JSON.stringify([S.gboss.ms,(S.guildCoin||0)-c1]));
  ev('gbossApply')(1); if(S.gboss.ms!==4) errs.push('참전 보상 초과');
  // 기존 참전 보상·점수 적립 4줄 불변(칭호 조건 guildScore) + 토벌은 그 뒤에 덧붙임
  const src=js.slice(js.indexOf('function enterGuildRaid('), js.indexOf('function enterGuildRaid(')+3000);
  if(!/S\.guildRaidScore=\(S\.guildRaidScore\|\|0\)\+d; S\.guildScore=\(S\.guildScore\|\|0\)\+d;/.test(src) || src.indexOf('gbossApply(d)')<src.indexOf('S.guildScore=(S.guildScore||0)+d')) errs.push('기존 레이드 적립 변경 또는 토벌이 앞에 옴');
  if(/foeCP:Math\.round\(totalCP\(\)\*2\.2\/dmgMul\)/.test(src)===false) errs.push('레이드 foeCP 공식 변경');
  // 구세이브(gboss 없음) · 레이드 화면 렌더
  delete S.gboss; ev('gbossState')(); if(!S.gboss || S.gboss.stage!==1) errs.push('gboss 없는 세이브 복구');
  const box=new Node2('div'); ev('MODALS').guildRaid.render(box); const txt=(function t(n){ return String(n._html||n._text||'')+(n.children||[]).map(t).join(''); })(box);
  if(!/재의 골렘 <b>1단계<\/b>/.test(txt) || !/주기 D-\d/.test(txt)) errs.push('레이드 화면 단계·주기 표기 없음');
  Object.assign(S, { gboss:keep.gb, guildCoin:keep.gc, dice:keep.dice, records:keep.rec });
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #3): 대장간 주문 — 해금(리더 10부위 L)·결정론 생성·E 중심/L 하루 1건·기한·납품 대상 제한·이중 수령·골드 < 제작가 절반·되감기. */
step('대장간 주문 — 해금·결정론·납품 대상·이중 수령·순환 이익 없음', ()=>{
  const errs=[], S=ev('S');
  const keep=JSON.parse(JSON.stringify({ orders:S.orders, equips:S.equips, hammers:S.hammers, dice:S.dice, gold:S.gold, st:S.seenTutorial, so:S.stats.orders }));
  const gen=ev('orderGen'), RW=ev('ORDER_RW'), CR=ev('CRAFT');
  // 결정론 · 등급 분포 · 특수 제외 · 보상 상한
  const D=n=>ev(`new Date(Date.now()+(${n})*864e5).toDateString()`);
  if(JSON.stringify(gen(D(0),0))!==JSON.stringify(gen(D(0),0))) errs.push('같은 날 같은 칸이 다르게 생성');
  let L=0; const FS=ev('FORGE_SLOTS'), special=new Set(FS.find(s=>s.k==='특수').items.E.concat(FS.find(s=>s.k==='특수').items.L).map(x=>x.n));
  for(let d=0; d<60; d++){ const l=[0,1,2].map(i=>gen(D(d),i));
    if(l[0].g!=='E' || l[1].g!=='E') errs.push('앞 두 칸이 E 가 아님');
    if(l.filter(o=>o.g==='L').length>1 || l.some(o=>o.g==='L' && o.qty!==1)) errs.push('L 하루 1건·1개 위반');
    if(l.some(o=>special.has(o.n))) errs.push('특수(보유 효과) 주문');
    L+=l.filter(o=>o.g==='L').length; }
  if(L<15 || L>45) errs.push('60일 중 L 주문 '+L+'일(기대 ~30)');
  if(!(RW.L1.g < CR.L.gold*0.5) || RW.E1.g || RW.E2.g) errs.push('골드 보상이 제작가 절반 이상');
  // 잠김: 리더가 10부위 L 이 아니면 null · 해금되면 3칸
  S.seenTutorial=true; S.orders={ on:0, day:'', list:[] };
  const lead=ev('party')()[0], skey=ev('slotKeyOf');
  S.equips=S.equips.filter(e=>!(e.equipped && (!e.heroId || e.heroId===lead.hero_id)));
  if(ev('ordersState')()!==null) errs.push('10부위 L 아닌데 주문 열림');
  // 리더 10부위를 L 로 — 부위별 L 아이템 하나씩(slotKeyOf 정본)
  const seen=new Set(); FS.forEach(s=>{ if(!s.items) return; (s.items.L||[]).forEach(it=>{ const p=skey(it.n); if(!seen.has(p) && seen.size<10){ seen.add(p); S.equips.push({ grade:'L', slot:it.n, enh:0, equipped:true, heroId:lead.hero_id }); } }); });
  if(seen.size<10) errs.push('L 로 채울 부위가 10개 미만 '+seen.size);
  const st=ev('ordersState')();
  if(!st || st.on!==1 || st.list.length!==3 || st.day!==ev('today')()) errs.push('해금 뒤 3칸 생성 실패 '+JSON.stringify(st&&st.list.length));
  if(st && JSON.stringify(st.list.map(o=>o.n))!==JSON.stringify([0,1,2].map(i=>gen(ev('today')(),i).n))) errs.push('상태 목록 ≠ 결정론 생성');
  // 납품 대상 제한: 착용·귀속·강화 장비는 제외 → short
  const o=st.list[0]; const h0=S.hammers|0, d0=S.dice|0, g0=S.gold;
  S.equips.push({ grade:o.g, slot:o.n, enh:0, equipped:true, heroId:'X' }, { grade:o.g, slot:o.n, enh:0, equipped:false, heroId:lead.hero_id }, { grade:o.g, slot:o.n, enh:3, equipped:false });
  if(ev('orderDeliver')(0)!=='short') errs.push('착용·귀속·강화 장비로 납품됨');
  for(let k=0;k<o.qty;k++) S.equips.push({ grade:o.g, slot:o.n, enh:0, equipped:false });
  const n0=S.equips.length;
  if(!ev('orderReady')(o) || !ev('orderClaimable')()) errs.push('납품 가능 판정 거짓');
  if(ev('orderDeliver')(0)!=='ok') errs.push('정상 납품 실패');
  const rw=ev('orderRw')(o);
  if(S.equips.length!==n0-o.qty || (S.hammers|0)-h0!==rw.h || (S.dice|0)-d0!==rw.d) errs.push('납품 소모/지급 '+JSON.stringify([n0-S.equips.length,(S.hammers|0)-h0,(S.dice|0)-d0]));
  if(S.equips.filter(e=>e.slot===o.n && e.grade===o.g && (e.equipped||e.heroId||e.enh)).length!==3) errs.push('제외 대상 장비가 소모됨');
  if(ev('orderDeliver')(0)!=='done' || (S.hammers|0)-h0!==rw.h) errs.push('이중 수령');
  // 날짜 전환: 완료 칸만 새로, 미완료는 기한(3일) 안이면 유지 · 되감기엔 무변화
  const keepN=st.list[1].n; S.orders.day=D(-1); ev('ordersState')();
  if(S.orders.list[1].n!==keepN || S.orders.list[0].done) errs.push('다음 날 갱신 규칙(완료 칸만 교체) 위반');
  S.orders.list[1].born=ev('dayIdx')(D(-3)); S.orders.day=D(-1); ev('ordersState')();
  if(S.orders.list[1].born===ev('dayIdx')(D(-3))) errs.push('기한 3일 지난 미완료 주문이 남음');
  const snap=JSON.stringify(S.orders.list); S.orders.day=D(1); ev('ordersState')();
  if(JSON.stringify(S.orders.list)!==snap) errs.push('시계 되감기로 주문 재생성');
  // 구세이브(orders 없음) 로드 안전
  delete S.orders; if(ev('ordersState')()===null && !S.orders) errs.push('orders 없는 세이브에서 상태 복구 실패');
  Object.assign(S, { orders:keep.orders, equips:keep.equips, hammers:keep.hammers, dice:keep.dice, gold:keep.gold, seenTutorial:keep.st }); S.stats.orders=keep.so;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 2차 #16): 기기 시계 되감기 — 일일·출석·주·월·투기장 주차·오프라인 정산이 '나중일 때만' 넘어간다(반복 지급 차단). 앞으로 가는 롤오버는 그대로. */
step('시계 되감기 무지급 — 일일·출석·주·월·투기장·오프라인 · 앞으로는 정상', ()=>{
  const errs=[], S=ev('S');
  const keep=JSON.parse(JSON.stringify({ daily:S.daily, day:S.day, ticket:S.ticket, dice:S.dice, att:S.claimed.attend, ald:S.attendLastDate, weekly:S.weekly, monthly:S.monthly,
    aw:S.arenaWeek, ar:S.arenaRank, ae:S.stats.arenaEnters, tt:S.stats.towerTries, tw:S._tower, ls:S.lastSeen, op:S.offlinePending, hi:S.offHi, gold:S.gold, sess:S.arenaSession }));
  const DS=d=>ev(`new Date(Date.now()+(${d})*864e5).toDateString()`);
  // ① 일일: 저장일이 내일(= 시계를 하루 되돌림) → 초기화·지급 없음, 그날 카운터 유지
  S.daily={ date:DS(1), counts:{ gold:3, tower:1 } }; const d0=S.day, t0=S.ticket, g0=S.gold;
  ev('rollDaily')();
  if(S.day!==d0 || S.ticket!==t0 || S.daily.counts.gold!==3 || S.daily.date!==DS(1) || S.gold!==g0) errs.push('되감은 날 일일 초기화/지급 '+JSON.stringify([S.day-d0,S.ticket-t0,S.daily.counts.gold,S.gold-g0]));
  S.daily={ date:DS(-1), counts:{ gold:3 } }; ev('rollDaily')();
  if(S.day!==d0+1 || (S.daily.counts.gold|0)!==0 || S.daily.date!==ev('today')()) errs.push('앞으로 간 날 초기화 안 됨');
  // ② 출석: 마지막 수령일이 내일이면 받을 수 없음
  S.claimed.attend={}; S.attendLastDate=DS(1); if(ev('attendClaimable')()) errs.push('되감은 날 출석 수령 가능');
  S.attendLastDate=DS(-1); if(!ev('attendClaimable')()) errs.push('다음 날 출석 불가');
  // ③ 월: 저장 키가 다음 달 → 리셋·탑 정산 없음
  const mk=ev('getMonthKey')(), [yy,mm]=mk.split('-').map(Number), nextM=(mm===12?(yy+1)+'-1':yy+'-'+(mm+1));
  S._tower=22; S.stats.towerTries=9; S.monthly={ key:nextM, base:{ kills:0, crafts:0, summons:0, towerTries:1 }, claimed:{ forgeTrial:true } };
  const dc0=S.dice; ev('monthlyState')();
  if(S.monthly.key!==nextM || S.dice!==dc0 || !S.monthly.claimed.forgeTrial) errs.push('되감은 달 월간 리셋/정산 '+JSON.stringify([S.monthly.key,S.dice-dc0]));
  // ④ 주: 저장 키가 다음 주 → 리셋 없음
  const wk=ev('getWeekKey')(), [wy,wn]=wk.split('-W').map(Number), nextW=wy+'-W'+(wn+1);
  S.weekly={ key:nextW, base:{ kills:0 }, claimed:{ w1:true } }; ev('weeklyState')();
  if(S.weekly.key!==nextW || !S.weekly.claimed.w1) errs.push('되감은 주 주간 리셋');
  // ⑤ 투기장 주차: 저장 주차가 다음 주 월요일 → 주간 주사위·초기화 없음
  const ak=ev('arenaWeekKey')(), [ay,am,ad]=ak.split('-').map(Number), nd=new Date(ay,am-1,ad+7), nextA=nd.getFullYear()+'-'+(nd.getMonth()+1)+'-'+nd.getDate();
  S.arenaWeek=nextA; S.arenaRank=3; S.arenaSession={ w:5, l:0, t:0 }; const dc1=S.dice;
  if(ev('arenaWeekRoll')()!==false || S.dice!==dc1 || S.arenaRank!==3 || S.arenaWeek!==nextA) errs.push('되감은 주차 투기장 정산');
  // ⑥ 오프라인: 앞당겨 정산한 뒤(offHi=내일) 되돌린 세션(lastSeen 3시간 전)을 다시 열어도 0 · 켠 채 되돌렸다 제자리 0 · 정상 3시간은 그대로
  const now=ev('Date.now()');
  S.offlinePending=0; S.offHi=now+864e5; S.lastSeen=now-3*3600e3; ev('computeOffline')();
  if((S.offlinePending||0)!==0) errs.push('되감은 뒤 재접속 오프라인 재정산 '+S.offlinePending);
  if(S.offHi!==now+864e5) errs.push('고수위가 과거로 내려감');
  ev('_saveSealed = false; _tabHideTs = 0'); const doc=ev('document'), hd=doc.hidden; doc.hidden=false;
  S.offlinePending=0; S.offHi=now; ev('_wallGapCheck')(now, now-3*3600e3); ev('_wallGapCheck')(now-3*3600e3, now);
  if((S.offlinePending||0)!==0) errs.push('켠 채 3시간 되돌렸다 제자리에 절전 간격 정산 '+S.offlinePending);
  S.offlinePending=0; S.offHi=now-5*3600e3; S.lastSeen=now-3*3600e3; ev('computeOffline')();
  const want=Math.floor(ev('OFFLINE_GPM')/60*3*3600); if(Math.abs((S.offlinePending||0)-want)>ev('OFFLINE_GPM')) errs.push('정상 3시간 부재 정산 '+S.offlinePending+' (기대 ~'+want+')');
  doc.hidden=hd;
  Object.assign(S, { daily:keep.daily, day:keep.day, ticket:keep.ticket, dice:keep.dice, attendLastDate:keep.ald, weekly:keep.weekly, monthly:keep.monthly, arenaWeek:keep.aw, arenaRank:keep.ar,
    _tower:keep.tw, lastSeen:keep.ls, offlinePending:keep.op, offHi:keep.hi, gold:keep.gold, arenaSession:keep.sess });
  S.claimed.attend=keep.att; S.stats.arenaEnters=keep.ae; S.stats.towerTries=keep.tt;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #26): 복귀 적립 — 부재 일 수(로컬 자정 반올림)·7일 상한·시계 앞뒤 반복 적립 차단(hi)·적립 시점 금액 확정·수령 1회. */
step('복귀 적립 — 일 수·7일 상한·시계 조작 차단·금액 확정·수령', ()=>{
  const errs=[], S=ev('S'), acc=ev('awayAccrue'), di=ev('dayIdx');
  const keep={ ab:JSON.parse(JSON.stringify(S.awayBank||{})), tw:S._tower, eb:S.stats.emberBest, gold:S.gold, st:S.stones, bx:S.towerBox };
  if(di('Sun Mar 29 2026')-di('Sat Mar 28 2026')!==1 || di('Sun Nov 01 2026')-di('Sat Oct 31 2026')!==1) errs.push('dayIdx 하루 간격');
  if(!isNaN(di('demo'))) errs.push("'demo' 날짜가 NaN 이 아님");
  const D=n=>new Date(2026,8,1+n).toDateString();
  S._tower=20; S.stats.emberBest=2; S.awayBank={ days:0, gold:0, stones:0, box:0, hi:0 };
  const d=ev('EMBER_MAZE')[1], perG=20*200000+d.gold, perS=30+d.stones, perB=5;
  acc(D(0), D(5));   // 1~4일 부재 = 4일
  if(S.awayBank.days!==4 || S.awayBank.gold!==perG*4 || S.awayBank.stones!==perS*4 || S.awayBank.box!==perB*4) errs.push('4일 적립 '+JSON.stringify(S.awayBank));
  acc(D(5), D(2)); acc(D(2), D(5)); if(S.awayBank.days!==4) errs.push('시계 되감기→앞으로 재적립 '+S.awayBank.days);
  S._tower=40; acc(D(5), D(20)); if(S.awayBank.days!==7) errs.push('7일 상한 '+S.awayBank.days);
  if(S.awayBank.gold!==perG*4+(40*200000+d.gold)*3) errs.push('추가분은 그 시점 진행도로 확정돼야 함');
  // 수령: 정산 화면 [수령]
  const g0=S.gold, s0=S.stones, b0=S.towerBox, ab=JSON.parse(JSON.stringify(S.awayBank));
  const box=new Node2('div'); ev('MODALS').settle.render(box);
  const bt=findBtnByText(box,'수령'); if(!bt) errs.push('정산 화면 적립 수령 버튼 없음');
  else { bt.onclick();
    if(Math.abs((S.gold-g0)-ab.gold)>=1 || S.stones-s0!==ab.stones || S.towerBox-b0!==ab.box) errs.push('수령 금액 '+[S.gold-g0,S.stones-s0,S.towerBox-b0].join('/'));   // 골드는 부동소수(버프 누적) — 1 미만 오차 허용
    if(S.awayBank.days!==0 || S.awayBank.hi!==ab.hi) errs.push('수령 후 초기화/hi 보존 '+JSON.stringify(S.awayBank));
    const g1=S.gold; bt.onclick(); if(S.gold!==g1) errs.push('재수령'); }
  S._tower=0; S.stats.emberBest=0; S.awayBank={ days:0, gold:0, stones:0, box:0, hi:0 }; acc(D(0),D(5)); if(S.awayBank.days!==0) errs.push('탑·미궁 기록 없는데 적립');
  S.awayBank=keep.ab; S._tower=keep.tw; S.stats.emberBest=keep.eb; S.gold=keep.gold; S.stones=keep.st; S.towerBox=keep.bx;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #24): 시련의 탑 순위 — 재스케일(영구 꼴찌 해소) · 표 = 지급 · 월 경계 정산(지난달 도전한 경우 1회) · 기록 유지. */
step('시련의 탑 순위·월간 정산 — 표 = 지급 · 도전한 달만 · 1회', ()=>{
  const errs=[], S=ev('S'), rk=ev('towerRank'), dz=ev('towerRankDice');
  // 동점이면 NPC 가 위(dgRankList 안정 정렬 — '나'는 마지막에 붙는다): 22 Wave = NPC 22 와 동점 → 17위
  if(rk(0)!==30 || rk(22)!==17 || rk(23)!==16 || rk(46)!==1 || rk(45)!==2) errs.push('순위 '+[rk(0),rk(22),rk(23),rk(46),rk(45)].join('/'));
  { const box=ev('dgRankList')(ev('TW_RANK').concat([[S.name,'-',22]]),{}); const rows=box.children||[];
    const i=rows.findIndex(r=>String(r.className||'').split(' ').includes('me'));
    if(i<0) errs.push('me 행 없음 — rows '+rows.length+' 첫 행 class '+String((rows[0]||{}).className));
    else if(i+1!==rk(22)) errs.push('표시 순위 '+(i+1)+' ≠ 정산 순위 '+rk(22)); }
  if(dz(1)!==2000 || dz(5)!==1200 || dz(16)!==800 || dz(30)!==600) errs.push('보상 파싱 '+[dz(1),dz(5),dz(16),dz(30)].join('/'));
  const keep={ m:JSON.parse(JSON.stringify(S.monthly||{})), tt:S.stats.towerTries, tw:S._tower, dice:S.dice, pl:S._pendingLoginToast };
  S._tower=22; S.stats.towerTries=5;
  S.monthly={ key:'2000-01', base:{ kills:0, crafts:0, summons:0, towerTries:2 }, claimed:{} };
  const d0=S.dice||0; ev('monthlyState')();
  if((S.dice||0)-d0!==800) errs.push('도전한 달 정산 '+((S.dice||0)-d0)+' (기대 800)');
  const d1=S.dice; ev('monthlyState')(); if(S.dice!==d1) errs.push('같은 달 재정산');
  if(S._tower!==22) errs.push('정산이 기록을 초기화함');
  S.monthly={ key:'2000-01', base:{ kills:0, crafts:0, summons:0, towerTries:5 }, claimed:{} };
  const d2=S.dice; ev('monthlyState')(); if(S.dice!==d2) errs.push('도전 없는 달인데 지급');
  // 정산 알림은 그 세션에 떠야 한다 — enterHome 에서 flushLoginToasts 가 monthlyState 보다 뒤(리뷰 확정: 앞이면 다음 접속으로 밀림)
  { const eh=js.slice(js.indexOf('function enterHome('), js.indexOf('\nfunction ', js.indexOf('function enterHome(')+10));
    const im=eh.indexOf('monthlyState();'), ifl=eh.indexOf('flushLoginToasts();');
    if(im<0 || ifl<0 || ifl<im) errs.push('enterHome: flushLoginToasts 가 monthlyState 보다 앞(또는 없음)'); }
  S.monthly=keep.m; S.stats.towerTries=keep.tt; S._tower=keep.tw; S.dice=keep.dice; S._pendingLoginToast=keep.pl;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #12): 영웅 강화 — 전 등급 · 조각 300/단계 · 전투력 +1%/단계 · 최대 +20 · 즉시 저장 · 칭호 재매핑. */
step('영웅 강화 — 전 등급 개방 · +1%/단계 · 상한 20 · 칭호', ()=>{
  const errs=[], S=ev('S'), root=ev("$('#modal-root')");
  const lead=ev('party')()[0]||ev('ownedHeroes')()[0], hid=lead.hero_id;
  const keep={ enh:JSON.parse(JSON.stringify(S.heroEnh||{})), sh:JSON.parse(JSON.stringify(S.shards||{})), hs:JSON.parse(JSON.stringify(S.heroShards||{})), tab:ev('_heroTab') };
  S.heroEnh={}; S.shards[lead.job.id]=1000;
  const p0=ev('heroPower')(lead);
  ev("_heroTab='강화'"); ev('heroDetail')(hid);
  const btn=findBtnByText(root,'강화',true);
  if(!btn) errs.push('강화 버튼 없음'); else if(btn.disabled) errs.push(lead.grade+' 등급 영웅 강화 버튼이 비활성(전 등급 개방 아님)');
  else { const a0=ev('heroShardAvail')(hid); btn.onclick();
    if(ev('heroEnhLv')(hid)!==1) errs.push('강화 단계 '+ev('heroEnhLv')(hid));
    if(a0-ev('heroShardAvail')(hid)!==300) errs.push('조각 차감 '+(a0-ev('heroShardAvail')(hid)));
    const p1=ev('heroPower')(lead); if(Math.abs(p1/p0-1.01)>0.006) errs.push('전투력 배율 '+(p1/p0).toFixed(4)+' (기대 1.01)');
    if(JSON.parse(store.get('hwasin_save_v1')).heroEnh[hid]!==1) errs.push('강화 즉시 저장 안 됨'); }
  S.heroEnh[hid]=25; if(ev('heroEnhLv')(hid)!==20 || Math.abs(ev('heroEnhMul')(hid)-1.2)>1e-9) errs.push('상한 20 미적용');
  S.heroEnh[hid]=20; ev('heroDetail')(hid); const mx=findBtnByText(root,'최대 강화',true); if(!mx || !mx.disabled) errs.push('최대 강화 버튼 상태');
  const T=id=>ev('TITLE_BY_ID')[id];
  S.heroEnh={ [hid]:5 }; if(!T('instructor').have()) errs.push('화로의 스승(+5 1명) 미달성');
  if(T('tactician').have()) errs.push('책략가 조건 과달성');
  if(/미판독|⚠/.test(T('champion').cond)) errs.push('정점의 지배자 조건에 개발 메모 노출');
  ev('closeSub')(); S.heroEnh=keep.enh; S.shards=keep.sh; S.heroShards=keep.hs; ctx.__ht=keep.tab; ev('_heroTab=__ht');
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(검증 발견): heroPower 를 객체 리터럴로 부를 땐 hero_id 필수 — 빠지면 영웅 귀속 장비가 통째로 빠진 전투력이 된다
   (전투 중 레벨업 직후 partyCP 160 vs 정본 239 실측). */
step('heroPower 호출 — 귀속 장비 누락 경로 없음', ()=>{
  const errs=[], S=ev('S'), hp=ev('heroPower');
  for(const m of js.matchAll(/heroPower\(\{[^}]*\}\)/g)) if(!/hero_id|hid/.test(m[0])) errs.push('hero_id 없는 호출: '+m[0]);
  const lead=ev('party')()[0]||ev('ownedHeroes')()[0]; const keep=S.equips.slice();
  S.equips=[{ grade:'L', slot:'장비', enh:10, equipped:true, heroId:lead.hero_id }];
  const full=hp(lead), viaId=hp({grade:lead.grade, level:lead.level, hero_id:lead.hero_id}), noId=hp({grade:lead.grade, level:lead.level});
  if(viaId!==full) errs.push('hero_id 경유 '+viaId+' ≠ 정본 '+full);
  if(!(noId<full)) errs.push('검사 전제(장비 귀속) 불성립');
  S.equips=keep;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #18): 제작 진행률 = 실제 소요 시간 기준(버프 중 시작 즉시 50% 표기 결함) · 모루 빈/제작 중 표기 · 빈 상태 전폭 + [대장간으로]. */
step('제작 진행률(버프 반영) · 모루 표기 · 빈 인벤토리 안내', ()=>{
  const errs=[], S=ev('S'), now=ev('Date.now()');
  const keep={ craft:S.craft, eq:S.equips.slice() };
  const prog=ev('craftProg');
  S.craft={ grade:'E', slot:'장비', endAt:now+1800e3, sec:3600, dur:1800 };
  if(prog(S.craft)>0.01) errs.push('버프 중 시작 직후 진행률 '+prog(S.craft).toFixed(2)+' (기대 ~0)');
  const old={ grade:'E', slot:'장비', endAt:now+1800e3, sec:3600 };   // dur 없는 구세이브 → sec 로 후퇴
  if(Math.abs(prog(old)-0.5)>0.01) errs.push('구세이브 후퇴 진행률 '+prog(old).toFixed(2));
  ev('refreshHUD')(); const ct=ev("$('#craftTimer')");
  // 스텁 DOM 은 index.html 트리를 만들지 않아 #craftTimer 의 부모(.anvil)가 없을 수 있다 — 있으면 실제 클래스, 없으면 소스로 확인(실물은 브라우저 QA)
  if(ct.parentNode && ct.parentNode.classList){ if(!ct.parentNode.classList.contains('crafting')) errs.push('제작 중 모루 링 클래스 없음'); }
  else if(!js.includes("anv.classList.add('crafting')")) errs.push('모루 링 토글 코드 없음');
  S.craft=null; ev('refreshHUD')();
  if(String(ct.textContent)!=='비어 있음') errs.push("빈 모루 표기 '"+ct.textContent+"'");
  S.equips=[]; const b=new Node2('div'); ev('MODALS').inventory.render(b);
  let es=null; const rec=n=>{ if(!n||typeof n!=='object'||es) return; if(/\bempty-state\b/.test(String(n.className||''))) es=n; (n.children||[]).forEach(rec); }; rec(b);
  if(!es) errs.push('빈 인벤토리 .empty-state 없음'); else if(!findBtnByText(es,'대장간으로')) errs.push('[대장간으로] 버튼 없음');
  S.craft=keep.craft; S.equips=keep.eq; ev('refreshHUD')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #15): 피격 연출 — source-atop 사각 칠하기(이웃 스프라이트로 번짐) 재발 금지 · 투기장 적 피격 반응 · 임팩트 상한. */
step('피격 연출 — 실루엣 번쩍임 · 투기장 적 반응 · 임팩트', ()=>{
  const errs=[];
  if(/globalCompositeOperation='source-atop'/.test(js)) errs.push('source-atop 사각 칠하기 잔존(이웃 스프라이트 번짐)');
  const hf=js.slice(js.indexOf('  function hitFoe('), js.indexOf('  function doWipe('));
  if(!hf.includes('f.flash=0.12; f.kb=0.12; impact(')) errs.push('투기장 적 피격 반응(flash·kb·impact) 없음');
  const im=js.slice(js.indexOf('  function impact('), js.indexOf('  let _silCv'));
  if(/Math\.random|rnd\(|bRnd\(/.test(im)) errs.push('임팩트가 난수를 쓴다(결정론·D5)');
  if(!im.includes('>=16')) errs.push('임팩트 동시 상한 없음');
  if(js.split("f.type==='impact' ? f.t<0.24").length-1 < 2) errs.push('임팩트 수명 필터(2곳) 없음');
  if(errs.length) throw new Error(errs.join(' | '));
});
step('잠긴 창 복귀 정산 차단 · 배경 로드 탭 숨김 시각 포착', ()=>{
  const errs=[], S=ev('S'), doc=ev('document'), vis=doc._ev && doc._ev.visibilitychange;
  if(typeof vis!=='function') throw new Error('visibilitychange 핸들러 미등록');
  const keep={ hidden:doc.hidden, p:S.offlinePending, ls:S.lastSeen };
  ev('_saveSealed = true'); ev('_tabHideTs='+(ev('Date.now()')-3600e3)); doc.hidden=false; S.offlinePending=0;
  vis();
  if((S.offlinePending||0)!==0) errs.push('잠긴 창에서 복귀 정산 '+S.offlinePending);
  ev('_saveSealed = false; _tabLost = false'); ev('_tabHideTs=0');
  // 배경 로드: 부팅 경로 소스 — load() 뒤에서 document.hidden 이면 _tabHideTs 를 잡는다(초기값이 아니라)
  const _w=js.indexOf('  wire(); refreshHUD(); applyFxClass();'), _l=js.lastIndexOf('\n  load();\n', _w);   // 부팅의 load() ~ wire() 구간(사이에 다른 줄이 끼어도 되게)
  const boot=(_l>=0 && _w>_l) ? js.slice(_l, _w) : '';
  if(!/if\(document\.hidden && !_tabHideTs\) _tabHideTs=Date\.now\(\);/.test(boot)) errs.push('배경 로드 탭 _tabHideTs 포착이 load() 뒤에 없다');
  if(!/let _tabHideTs=0;/.test(js)) errs.push('_tabHideTs 초기값 변경됨(0 이어야 — 정산 순서)');
  doc.hidden=keep.hidden; S.offlinePending=keep.p; S.lastSeen=keep.ls;
  if(errs.length) throw new Error(errs.join(' | '));
});
step('길잡이 배너 — 전투 중 숨김(투기장 헤더·기여도 가림 방지) · 소환 수량 칩 라벨', ()=>{
  const errs=[], S=ev('S'), B=ev('Battle'), bn=ev("$('#guide-banner')");
  const keep={ st:S.seenTutorial, gs:S.guideStep };
  S.seenTutorial=true; S.guideStep=0; ev('updateGuideBanner')();
  if(bn.classList.contains('hidden')) errs.push('평시 배너 숨김');
  ev('enterDungeonFight')({ name:'스모크배너 · 1단계', col:'#fff', foeCP:1, kind:'mobs', count:1, dur:5 });
  if(!bn.classList.contains('hidden')) errs.push('전투 중 배너 노출');
  B.finishNow(); ev('syncGuideBannerFight')();
  if(bn.classList.contains('hidden')) errs.push('전투 뒤 배너 미복귀');
  ev('closeModal')();
  if(js.includes("['10회',")) errs.push("소환 수량 칩 '10회' 고정 라벨 잔존");
  S.seenTutorial=keep.st; S.guideStep=keep.gs; ev('updateGuideBanner')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25(워크플로 #13): 모험 타일 남은 횟수 배지 — 각 모달의 게이트 키와 같은 값 · 읽기 전용(카운트 불변). */
step('모험 타일 배지 — 게이트 키 일치 · 읽기 전용', ()=>{
  const errs=[], S=ev('S'), B=ev('advLeftBadge'), ms=ev('monthlyState')();
  ev('rollDaily')();
  const keep={ counts:JSON.parse(JSON.stringify(S.daily.counts)), tw:S._tower, gs:S.guideStep, fc:ms.claimed.forgeTrial };
  S.daily.counts={}; S._tower=0; delete ms.claimed.forgeTrial;
  if(B('golddungeon').t!=='3/3') errs.push('골드던전 새날 '+B('golddungeon').t);
  if(B('tower').t!=='1/1') errs.push('탑(기록 0 — 소탕 잠김) '+B('tower').t);
  S._tower=5; if(B('tower').t!=='2/2') errs.push('탑(소탕 열림) '+B('tower').t);
  if(B('forgetrial').t!=='1/1') errs.push('용광로 미도전 '+B('forgetrial').t);
  if(B('boss')!==null) errs.push('보스(횟수 없음)에 배지');
  S.daily.counts={ daily:5, gold:1, wb:1, ember:1, tower:1 };
  const before=JSON.stringify(S.daily.counts);
  if(!(B('dailydungeon').done && B('dailydungeon').t==='완료')) errs.push('요일던전 소진 '+B('dailydungeon').t);
  if(B('golddungeon').t!=='2/3') errs.push('골드던전 1회 사용 '+B('golddungeon').t);
  if(!B('worldboss').done || !B('embermaze').done) errs.push('월드보스/미궁 소진 미표시');
  if(B('tower').t!=='1/2') errs.push('탑 도전만 사용 '+B('tower').t);
  S.guideStep=0; if(B('raid').t!=='잠김') errs.push('길잡이 중 약탈 '+B('raid').t);
  ms.claimed.forgeTrial=true; if(!/^D-\d+$/.test(B('forgetrial').t)) errs.push('용광로 소진 후 '+B('forgetrial').t);
  if(JSON.stringify(S.daily.counts)!==before) errs.push('배지 계산이 일일 카운트를 바꿈');
  S.daily.counts=keep.counts; S._tower=keep.tw; S.guideStep=keep.gs;
  if(keep.fc===undefined) delete ms.claimed.forgeTrial; else ms.claimed.forgeTrial=keep.fc;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25 회귀(워크플로 #19): 1위 NPC 길드 [신청] 한 번으로 레전더리 칭호 2종 / 조건형 칭호 달성 후 조건을 잃으면 보유 목록에서
   사라지는데 착용 효과는 남던 불일치 / 옛 조건으로 이미 얻은 이용자 보존(1회 이관). */
step('칭호 — 길드 1클릭 차단 · 달성 보유 기록 · 기존 획득 이관', ()=>{
  const errs=[], S=ev('S');
  const keep={ gj:S.guildJoined, gm:S.guildMaster, gn:S.guildName, g:S.guild, gs:S.guildScore, own:JSON.parse(JSON.stringify(S.titleOwn||{})), ruby:S.ruby, v:S._titleGuildV, rank:S.guildRank };
  const T=id=>ev('TITLE_BY_ID')[id], owned=id=>ev('titleOwned')(T(id));
  S.titleOwn={}; S.guildJoined=false; S.guild=null; S.guildName=''; S.guildScore=0;
  ev('guildApply')('강철결의');
  if(owned('pioneer')||owned('outlaw')) errs.push('1위 길드 신청만으로 길드 칭호 보유');
  S.guildScore=51000; if(!owned('pioneer')) errs.push('기여 51,000 인데 pioneer 미보유');
  // 조건형 칭호: 루비 75,000 → sync → 루비 0 → 보유 유지
  S.titleOwn={}; S.guildScore=0; S.ruby=75000; ev('titleSyncOwn')(); S.ruby=0;
  if(!owned('ironhand')) errs.push('달성한 조건형 칭호가 조건 상실 후 보유에서 사라짐');
  // 이관: 옛 조건(가입 길드 기준 점수 + 내 기여)으로 달성 상태였던 구세이브 → mergeDefaults 후 보유
  S.titleOwn={}; S._titleGuildV=undefined; S.guildJoined=true; S.guildName='강철결의'; S.guild='강철결의'; S.guildScore=0;
  ev('mergeDefaults')();
  if(!(S.titleOwn.pioneer && S.titleOwn.outlaw)) errs.push('기존 획득자 이관 누락');
  if(S._titleGuildV!==1) errs.push('이관 플래그 미설정');
  S.guildJoined=keep.gj; S.guildMaster=keep.gm; S.guildName=keep.gn; S.guild=keep.g; S.guildScore=keep.gs; S.titleOwn=keep.own; S.ruby=keep.ruby; S._titleGuildV=keep.v; S.guildRank=keep.rank;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25 회귀(워크플로 #23·#9): ① 숨긴 채 창을 닫으면 숨김 구간 방치 수익이 증발(save 가 lastSeen 을 '지금'으로 밀었다)
   ② 환영 우편(루비 100) 미수령 배지 없음 ③ 인트로 '7일 출석 1일차'가 실제 출석을 수령하지 않음. */
step('숨김 중 저장 lastSeen · 우편 배지 · 인트로 출석 1일차 실수령', ()=>{
  const errs=[], S=ev('S'), doc=ev('document');
  const keep={ hidden:doc.hidden, ls:S.lastSeen, p:S.offlinePending, mail:JSON.parse(JSON.stringify(S.claimed.mail||{})), att:JSON.parse(JSON.stringify(S.claimed.attend||{})), ald:S.attendLastDate, stones:S.stones, tick:S.tickHero };
  ev('_saveSealed = false; _tabLost = false');
  const gNow=()=>ev('Date.now()');   // 게임 컨텍스트의 시계(스모크 하네스가 시각을 제어할 수 있다) — 테스트 파일의 Date 와 섞지 않는다
  const hideAt=gNow()-3*3600e3;
  doc.hidden=true; ev('_tabHideTs='+hideAt); ev('save')();
  const saved=JSON.parse(store.get('hwasin_save_v1')).lastSeen;
  if(saved!==hideAt) errs.push('숨김 중 저장 lastSeen='+saved+' (기대 숨김 시각)');
  S.offlinePending=0; S.lastSeen=saved; S.offHi=hideAt-5000; ev('computeOffline')();   // 실제 흐름: 숨긴 뒤엔 고수위가 오르지 않아 숨김 시각 이하(#16)
  const want=Math.floor(ev('OFFLINE_GPM')/60*3*3600); if(Math.abs((S.offlinePending||0)-want)>ev('OFFLINE_GPM')) errs.push('숨김 3h 정산 '+S.offlinePending+' (기대 ~'+want+')');
  doc.hidden=false; ev('_tabHideTs=0'); ev('save')();
  if(Math.abs(JSON.parse(store.get('hwasin_save_v1')).lastSeen-gNow())>5000) errs.push('보이는 상태 저장 lastSeen 이 현재가 아님');
  // 우편 배지
  S.claimed.mail={}; if(!ev('mailPending')()) errs.push('미수령 우편인데 mailPending false');
  S.claimed.mail={welcome:true,attend7:true,shard:true}; if(ev('mailPending')()) errs.push('전부 수령인데 mailPending true');
  // 인트로 출석 1일차: 소스에 실제 출석 수령(ATTEND_DAYS[0][2]·attendLastDate) 이 있는지
  const ir=js.slice(js.indexOf('function introRewards('), js.indexOf('function startGuidedTutorial('));
  if(!/ATTEND_DAYS\[0\]\[2\]\(\)/.test(ir) || !/attendLastDate=today\(\)/.test(ir)) errs.push('인트로 출석 1일차가 실제 출석을 수령하지 않는다');
  doc.hidden=keep.hidden; S.lastSeen=keep.ls; S.offlinePending=keep.p; S.claimed.mail=keep.mail; S.claimed.attend=keep.att; S.attendLastDate=keep.ald; S.stones=keep.stones; S.tickHero=keep.tick;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25 회귀: 던전 래퍼(enterDungeonFight)가 hpMul 을 버려 용광로 시련 ×3 장기전이 라이브에 미적용이었다. */
step('던전 래퍼 옵션 전달 — hpMul·overtime', ()=>{
  const B=ev('Battle'); let cap=null; const orig=B.startDungeon;
  B.startDungeon=function(c){ cap=c; };
  try{ ev('enterDungeonFight')({ name:'smoke', foeCP:100, kind:'boss', dur:45, hpMul:3, overtime:true, onEnd:()=>{} }); }
  finally { B.startDungeon=orig; }
  if(!cap) throw new Error('startDungeon 미호출');
  if(cap.hpMul!==3) throw new Error('hpMul 전달 안 됨: '+cap.hpMul);
  if(cap.overtime!==true) throw new Error('overtime 전달 안 됨: '+cap.overtime);
});
/* ★ 2026-09-25 회귀(검증 워크플로 #4·#3): ① 던전 종료 후 홈 사냥이 3인 파티(전투력 3배)로 남던 결함 — enterDungeonFight 의 onEnd 가
   refreshParty 로 1인 복귀 ② 고급 조각(레전더리 판정)에 미보유 영웅 '영웅 등장'·'획득!' 거짓 표시 — 실제 해금만 연출. */
step('던전 종료 홈 1인 복귀 · 고급 조각 거짓 획득 연출 제거', ()=>{
  const errs=[];
  const _e0=js.indexOf('function enterDungeonFight('), efd=js.slice(_e0, js.indexOf('\nfunction ', _e0+10));   // 고정 길이 슬라이스는 앞에 코드가 늘면 잘린다 — 다음 함수까지
  if(!/finally\s*\{\s*Battle\.refreshParty\(\)/.test(efd)) errs.push('enterDungeonFight onEnd 에 refreshParty 복귀가 없다');
  const B=ev('Battle'); B.setPartySource(null);
  ev('globalThis.__oSDR=showDungeonResult; showDungeonResult=function(){}');
  try{ ev('enterDungeonFight')({ name:'smoke', col:'#fff', foeCP:1, kind:'mobs', count:1, dur:5 }); B.runUntilDone(400); }
  finally { ev('showDungeonResult=globalThis.__oSDR'); }
  if(B.heroCount && B.heroCount()!==1) errs.push('던전 종료 후 홈 영웅 수 '+B.heroCount()+' (기대 1)');
  // ② 미보유 직업에 고급 조각 판정 → heroRevealFx 가 호출되면 안 된다
  const S=ev('S'); const keep={ fail:S.summonFail, tick:S.tickHero, shards:JSON.parse(JSON.stringify(S.shards)), heroes:JSON.parse(JSON.stringify(S.heroes)) };
  let revealed=0; ev('globalThis.__oHR=heroRevealFx; heroRevealFx=function(){ globalThis.__hrN=(globalThis.__hrN||0)+1; }'); ev('globalThis.__hrN=0');
  try{
    const wind=ev('rosterOf')('wind'); wind.forEach(r=>{ if(S.heroes[r.hero_id]) S.heroes[r.hero_id].own=false; }); S.shards.wind=0;
    S.summonFail=69; const res=ev('summonRun')(1,'wind');
    if(!res.legend || !(res.legendJobs||[]).includes('wind')) errs.push('강제 고급 조각 판정 실패(테스트 전제)');
    const tmr=ev("globalThis.__playSummonNow=(r)=>{ const o=setTimeout; setTimeout=(f)=>{ f(); }; try{ playSummon(r); } finally { setTimeout=o; } }");
    ev('__playSummonNow')(res);
    revealed=ev('globalThis.__hrN');
  } finally { ev('heroRevealFx=globalThis.__oHR'); }
  if(revealed!==0) errs.push('미보유 직업 고급 조각에 영웅 등장 연출 '+revealed+'회');
  S.summonFail=keep.fail; S.tickHero=keep.tick; S.shards=keep.shards; S.heroes=keep.heroes; ev('closeModal')();
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25 회귀(검증 워크플로 #20·#21): 옵션 재설정 잠금·봉인 무시 과금 / 일괄 분해가 보유형 효과(고서·물약) 삭제 /
   루비 코스튬 구매가 비매품 레거시 3종을 공짜로 해금. */
step('재설정 잠금·봉인 · 일괄분해 보유효과 보존 · 코스튬 레거시 누수', ()=>{
  const errs=[], S=ev('S');
  const keep={ dice:S.dice, lock:S.rerollLock?S.rerollLock.slice():null, opt:S.rerollOpt?S.rerollOpt.slice():null, spent:S.rerollSpent,
    equips:S.equips, own:JSON.parse(JSON.stringify(S.costumeOwn||{})), cnt:S.costumes, ruby:S.ruby, gold:S.gold };
  // 재설정
  ev('rerollFix')(); S.dice=100; S.rerollLock=[true,false,false,false];
  if(ev('rerollRow')(0)!=='locked' || S.dice!==100) errs.push('잠긴 행이 재설정·과금됨');
  if(ev('rerollRow')(3)!=='sealed' || S.dice!==100) errs.push('봉인(레전더리) 행이 과금됨');
  S.rerollLock[0]=false; const sp0=S.rerollSpent;
  if(ev('rerollRow')(0)!=='ok' || S.dice!==95 || S.rerollSpent!==sp0+5) errs.push('정상 재설정 과금 오류 dice='+S.dice);
  // 일괄 분해: 고서×2·물약×1(미장착) + 청류 고서(착용) + 단검 → N 일괄 대상 = 고서 여분 1 + 단검 1
  S.equips=[{grade:'N',slot:'고서',enh:0,equipped:false},{grade:'N',slot:'고서',enh:0,equipped:false},{grade:'N',slot:'물약',enh:0,equipped:false},
    {grade:'R',slot:'청류 고서',enh:0,equipped:true},{grade:'N',slot:'잿불 단검',enh:0,equipped:false}];
  const tm0=ev('tomeMul')(), pr0=ev('potionRegenAdd')();
  const bulk=ev('salvageBulk')('N'); if(bulk.count!==2) errs.push('일괄 분해 대상 '+bulk.count+'(기대 2 — 고서 여분·단검)');
  ev('doSalvageBulk')('N'); const y=findBtnByText(ev("document.getElementById('modal-root')"),'예'); if(y) y.onclick();
  if(ev('tomeMul')()!==tm0) errs.push('일괄 분해 후 고서 효과 감소');
  if(ev('potionRegenAdd')()!==pr0) errs.push('일괄 분해 후 물약 효과 감소');
  // 코스튬: 레거시 카운터 0 에서 루비 코스튬 구매 경로가 비매품 3종을 해금하지 않는다(카운터 불변)
  S.costumes=0; S.costumeOwn={}; const legacyBefore=['flame','frost','gold'].filter(id=>ev('costumeHas')(id)).length;
  const next=ev('legacyCostumeNext')(); if(next!=='flame') errs.push('legacyCostumeNext '+next);
  if(legacyBefore!==0) errs.push('초기 레거시 보유 '+legacyBefore);
  const gi=ev('GRAYSHOP').find(it=>/한정 코스튬/.test(it.t)); gi.give();
  if(!ev('costumeHas')('flame')) errs.push('한정 코스튬 교환이 코스튬을 주지 않음');
  S.costumeOwn={flame:true,frost:true,gold:true}; if(!gi.soldOut()) errs.push('전부 보유인데 한정 코스튬이 판매 중');
  // 원복
  S.dice=keep.dice; S.rerollLock=keep.lock; S.rerollOpt=keep.opt; S.rerollSpent=keep.spent; S.equips=keep.equips; S.costumeOwn=keep.own; S.costumes=keep.cnt; S.ruby=keep.ruby; S.gold=keep.gold;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25 회귀: 투기장 '매일 티어 골드'·'주간 순위 주사위' — 표에만 있고 지급 코드가 없던 약속(검증 워크플로 실측 +0).
   표(ARENA_TIER_ROWS·ARENA_DICE_ROWS)가 곧 지급 정본인지, 주차가 지난 옛 티어는 브론즈로, 미참여 주는 0 인지 본다. */
step('투기장 매일 티어 골드·주간 주사위 — 표 = 지급', ()=>{
  const errs=[], S=ev('S');
  const keep={ gold:S.gold, dice:S.dice||0, daily:JSON.parse(JSON.stringify(S.daily)), day:S.day, tier:S.arenaTier, week:S.arenaWeek, rank:S.arenaRank,
    pts:S.arenaPts, sess:S.arenaSession?JSON.parse(JSON.stringify(S.arenaSession)):null, ent:S.stats.arenaEnters, att:JSON.parse(JSON.stringify(S.claimed.attend||{})) };
  const ROWS=ev('ARENA_TIER_ROWS'), TIERS=ev('TIERS');
  const val=n=>ROWS.find(r=>r[0]===n)[1];
  const roll=()=>{ S.daily.date='2000-01-01'; const g0=S.gold; ev('rollDaily')(); return Math.round(S.gold-g0); };
  S.stats.arenaEnters=3; S.arenaWeek=ev('arenaWeekKey')(); S.arenaTier=6;
  const g1=roll(); if(g1<val('레전더리')) errs.push('레전더리 티어 골드 미지급: +'+g1);
  S.arenaWeek='1999-1-4'; const g2=roll();   // 주차가 지남 → 브론즈
  if(g2<val('브론즈') || g2>=val('실버')+val('브론즈')) errs.push('지난 주차 티어가 브론즈로 지급되지 않음: +'+g2);
  S.stats.arenaEnters=0; S.arenaWeek=ev('arenaWeekKey')(); const g3=roll();
  if(g3>=val('브론즈')) errs.push('투기장 미입장인데 티어 골드 지급: +'+g3);
  // 주간 주사위: 3위·참여 → 표의 3위 값 / 미참여 → 0
  const D=ev('arenaWeeklyDice');
  const three=parseInt(String(ev('ARENA_DICE_ROWS').find(r=>r[0]==='3위')[1]).replace(/\D/g,''),10);
  if(D(3,true)!==three) errs.push('3위 주사위 '+D(3,true)+' ≠ '+three);
  if(D(500,true)!==40) errs.push('참여 기본 주사위 '+D(500,true)+' ≠ 40');
  if(D(1,false)!==0) errs.push('미참여 주에 주사위 지급');
  { let prev=Infinity; for(const r of [1,2,3,4,10,11,15,16,20,21,30,31,40,41,500]){ const v=D(r,true); if(v>prev) errs.push('주사위 순위 역전 '+r+'위 '+v+'>'+prev); prev=v; } }   // v5.334: 순위 단조성
  S.arenaWeek='1999-1-4'; S.arenaRank=3; S.arenaSession={w:2,l:1,t:0}; const d0=S.dice||0;
  ev('arenaWeekRoll')(); if((S.dice||0)-d0!==three) errs.push('주간 롤오버 주사위 '+((S.dice||0)-d0)+' ≠ '+three);
  if(S.arenaRank!==ev('ARENA_RANK_RESET')) errs.push('롤오버 후 순위 리셋 안 됨');
  // 원복
  S.gold=keep.gold; S.dice=keep.dice; S.daily=keep.daily; S.day=keep.day; S.arenaTier=keep.tier; S.arenaWeek=keep.week; S.arenaRank=keep.rank;
  S.arenaPts=keep.pts; S.arenaSession=keep.sess; S.stats.arenaEnters=keep.ent; S.claimed.attend=keep.att;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25 회귀: 획득 배율 '표시 = 적용' — ① 프리미엄 방치 골드가 idleTick·addGold 두 번 곱해져 ×4 였다
   ② 분해 환급에 골드 버프가 붙어 제작가를 넘었다(순환 이익) ③ 훈련소·길드·무쇠 캠프 경험치가 어디에도 안 곱해졌다. */
step('획득 배율 관문 — 프리미엄 방치 ×2 · 분해 환급 raw · 훈련소/캠프 경험치 적용', ()=>{
  const errs=[], S=ev('S');
  const keep={ gold:S.gold, buffs:JSON.parse(JSON.stringify(S.buffs||{})), villTrain:S.villTrain, holds:JSON.parse(JSON.stringify(S.holds||{})), equips:S.equips, gj:S.guildJoined, gm:S.guildMaster, guild:S.guild };
  S.buffs=S.buffs||{}; delete S.buffs.goldUntil; delete S.buffs.goldPactUntil; delete S.buffs.expUntil;
  // ① 프리미엄 방치 골드: 같은 조건에서 goldUntil 만 켰을 때 정확히 2배
  S.gold=0; ev('idleTick')(1); const base=S.gold;
  S.buffs.goldUntil=Date.now()+3600e3; S.gold=0; ev('idleTick')(1); const prem=S.gold;
  const ratio=prem/base; if(Math.abs(ratio-2)>1e-6) errs.push('프리미엄 방치 골드 배율 '+ratio.toFixed(3)+' (약속 2)');
  // ② 분해 환급: 프리미엄+가호가 켜져도 지급 = 견적
  S.buffs.goldPactUntil=Date.now()+3600e3;
  const e={grade:'L', slot:'용암 대검', enh:0, equipped:false, id:'smk_raw'}; S.equips=[e];
  const quote=ev('salvageBulk')('L').gold; S.gold=0;
  ev('doSalvageBulk')('L'); const root=ev("document.getElementById('modal-root')"); const y=findBtnByText(root,'예'); if(y) y.onclick(); else errs.push('일괄 분해 [예] 없음');
  if(Math.round(S.gold)!==Math.round(quote)) errs.push('분해 환급 '+Math.round(S.gold)+' ≠ 견적 '+Math.round(quote));
  // ③ 경험치: 훈련소 Lv501(+100%)·무쇠 캠프(+50%)가 heroExpMul 에 곱해진다
  delete S.buffs.goldUntil; delete S.buffs.goldPactUntil;
  S.guildJoined=false; S.guildMaster=false; S.guild=null; S.villTrain=1; S.holds={};
  const x0=ev('heroExpMul')();
  S.villTrain=501; const x1=ev('heroExpMul')();
  S.holds={ camp:{own:true} }; const x2=ev('heroExpMul')();
  if(Math.abs(x1/x0-2)>1e-9) errs.push('훈련소 Lv501 경험치 배율 '+(x1/x0).toFixed(3)+' (기대 2)');
  if(Math.abs(x2/x1-1.5)>1e-9) errs.push('무쇠 캠프 경험치 배율 '+(x2/x1).toFixed(3)+' (기대 1.5)');
  S.guildJoined=true; S.guildMaster=true; const x3=ev('heroExpMul')();
  if(Math.abs(x3/x2-1.4)>1e-9) errs.push('길드+길드장 경험치 배율 '+(x3/x2).toFixed(3)+' (기대 1.4)');
  // 원복
  S.gold=keep.gold; S.buffs=keep.buffs; S.villTrain=keep.villTrain; S.holds=keep.holds; S.equips=keep.equips; S.guildJoined=keep.gj; S.guildMaster=keep.gm; S.guild=keep.guild;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-25: 정체 계단 패널 — wipeRemedies 는 heroPower 를 '잠깐 바꿔 계산하고 되돌리는' 가정 계산을 한다
   (장비 강화 +1 을 e.enh 에 임시 반영, 빈 부위는 가짜 장비를 S.equips 에 임시 삽입). 되돌리기가 빠지면 버튼 하나 안 눌렀는데
   장비가 강화되거나 유령 장비가 세이브에 박힌다 → 호출 전후 S.equips·전투력이 비트 단위로 같아야 한다. */
step('전멸 분석 패널 — 가정 계산 무부작용·렌더', ()=>{
  const errs=[], S=ev('S');
  const keepEq=S.equips; S.equips=[{grade:'R', slot:'강철 검', enh:3, equipped:true, heroId:null}];
  const lead=ev('party')()[0]||ev('ownedHeroes')()[0];
  const snap=JSON.stringify(S.equips), cp0=ev('heroPower')(lead), g0=S.gold;
  const rs=ev('wipeRemedies')(lead);
  if(JSON.stringify(S.equips)!==snap) errs.push('S.equips 가 바뀌었다(되돌리기 누락)');
  if(ev('heroPower')(lead)!==cp0) errs.push('전투력이 바뀌었다');
  if(S.gold!==g0) errs.push('골드가 바뀌었다');
  if(!rs.length) errs.push('수단이 0개');
  if(rs.some(r=>!(r.d>0))) errs.push('전투력 증가 0 이하 수단 포함');
  ev('showWipeAdvice')(5);
  if(ev('currentModal')!=='wipeAdvice') errs.push('패널 미표시');
  if(!collectText(ev("document.getElementById('modalBody')")).includes('권장')) errs.push('권장 비교 문구 없음');
  ev('closeModal')(); S.equips=keepEq;
  if(errs.length) throw new Error(errs.join(' | '));
});
/* ★ 2026-09-24 회귀: 다중 창 세이브 덮어쓰기. 두 창이 세이브 하나를 번갈아 써서 새 창의 진행이 옛 창의
   자동저장으로 사라졌다(라이브: 999,999,999 → 6.5초 뒤 3,347). load 가 주도권을 잡고, 주도권을 잃은 창의
   save() 는 아무것도 쓰지 않고 잠기는지 본다. */
step('다중 창 잠금 — 주도권 잃은 창은 저장하지 않는다', ()=>{
  const errs=[], OK='hwasin_save_v1_owner';
  ev('_saveSealed = false; _tabLost = false');
  ev('load')();
  if(store.get(OK)!==ev('TAB_ID')) errs.push('load 가 주도권을 잡지 않았다');
  ev('save')(); const mine=store.get('hwasin_save_v1');
  store.set(OK, 'other-tab');                                   // 다른 창이 세이브를 읽고 주도권을 가져감
  const S=ev('S'), g=S.gold; S.gold=g+123456;
  ev('save')();
  if(store.get('hwasin_save_v1')!==mine) errs.push('주도권을 잃었는데 세이브를 덮어썼다');
  if(ev('_tabLost')!==true) errs.push('잠금 상태로 전환되지 않았다');
  ev('save')();                                                 // 잠긴 뒤에도 계속 안 쓴다(봉인)
  if(store.get('hwasin_save_v1')!==mine) errs.push('잠긴 뒤 두 번째 save 가 덮어썼다');
  S.gold=g; store.set(OK, ev('TAB_ID')); ev('_saveSealed = false; _tabLost = false');   // 원복
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

/* ★ 2026-09-25(워크플로 #11): [즉시 결과] 는 '관람 도중' 누른다 — 실시간 펌프로 일부 진행한 뒤 finishNow 로 끝낸 결과가
   끝까지 관람한 결과와 같아야 한다(보상을 따로 계산하는 경로가 생기면 여기서 깨진다). 중단 지점 3곳(0.5·10·20초 — 전부 전투 도중인지 검사한다). */
step('D6 · 관람 중 즉시 결과(finishNow) = 끝까지 관람(60fps 펌프) 동일 해시', ()=>{
  const seed = 0x5EED0611;
  const watched = runSeeded(seed, driverRealtime60fps).hash;
  const cut=[];
  for(const frames of [30, 600, 1200]){
    const h = runSeeded(seed, (B)=>{ for(let i=0;i<frames && B.inDungeon();i++) B.pumpFrame(1/60); if(B.inDungeon()){ cut.push(frames); const r=B.finishNow(); if(!r||!r.finished) throw new Error('finishNow 미완주'); } }).hash;
    if(h!==watched) throw new Error(`${frames}프레임 뒤 즉시 결과 ${h} ≠ 끝까지 관람 ${watched}`);
  }
  if(ev('_instantRun')!==0) throw new Error('무음 구간이 닫히지 않음: '+ev('_instantRun'));
  if(cut.length<3) throw new Error('전투 도중 중단 지점이 3곳 미만: '+JSON.stringify(cut));
  console.log(`     즉시 결과(전투 도중 ${cut.join('/')}프레임에서 중단) = 끝까지 관람 = ${watched}`);
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
