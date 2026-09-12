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
  querySelector(s){ return CTX.document.querySelector(s); }
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
  querySelector(s){
    if(typeof s!=='string') return null;
    const m=/^#([\w-]+)/.exec(s); if(m) return registry.get(m[1]) || null;
    return new Node2('div');
  },
  querySelectorAll(s){
    if(typeof s==='string' && s.includes('[data-modal]')) return modalNodes;
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
/* ★ v5.173: 백그라운드 탭 복귀 정산 — 숨김 구간이 오프라인과 같은 배율로 적립되는지.
   1시간 = 60,000G(분당 1,000), 30초 미만은 미적립. 백그라운드 방치가 증발하던 회귀 방지. */
step('백그라운드 탭 복귀 정산 — 1시간 숨김 60,000G · 30초 미만 0', ()=>{
  const S=ev('S'), settle=ev('_visibilitySettle');
  const before=S.offlinePending||0;
  if(settle(Date.now()-3600e3, Date.now())!==60000) throw new Error('1시간 정산액이 60,000G가 아니다');
  if((S.offlinePending||0)!==before+60000) throw new Error('offlinePending 에 적립되지 않았다');
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
