/* 결정의 시대 — 정적 무결성 점검 (모달 참조·상태 필드·DOM id·중복선언).
   런타임 검증은 smoke-test.mjs 가 담당한다. 사용: node html/verify.mjs */
// 통합 무결성 점검 (일회성 도구)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* ★ 스크립트 자기 위치 기준으로 소스를 찾는다.
   종전에는 원본 저장소 절대경로가 하드코딩돼 있어, 다른 폴더로 복사한 뒤 검증을 돌려도
   조용히 '원본'을 검사했다(복사본 분리 작업 중 발견). 저장소를 옮겨도 따라오게 한다. */
const D = path.dirname(fileURLToPath(import.meta.url)) + '/';
const js=fs.readFileSync(D+'game.js','utf8');
const html=fs.readFileSync(D+'index.html','utf8');
const css=fs.readFileSync(D+'style.css','utf8');
const lines=js.split('\n');

/* ★ 게이트화 — 이 스크립트는 오래도록 '출력만 하고 항상 종료코드 0' 이었다.
   그래서 npm run check 에 물려 있어도 정적 무결성 위반을 하나도 막지 못했다(2026-09-10 발견).
   FAIL 에 담긴 항목이 하나라도 있으면 종료코드 1 로 끝낸다.
   판정을 나누는 기준은 '자동 판별의 정확도' 다.
     실패(hard) — A·B·C·D·E·F·J: 규칙 위반이 곧 런타임 고장이고 오탐이 없다.
     경고(soft) — B2·G: 의도된 예외와 정규식 오탐이 섞인다. 실패로 올리면 게이트가 늑대소년이 된다. */
const FAIL = [];
const fail = (m)=>FAIL.push(m);

// ---- 1) MODALS 키 수집: `const MODALS = {` 블록의 최상위 키
const mi=js.indexOf('const MODALS = {');
let depth=0,i=js.indexOf('{',mi),start=i,end=-1;
// 문자열/주석 무시하는 간이 스캐너
function scanBlock(src,from){
  let d=0,k=from,inS=null,inC=null;
  for(;k<src.length;k++){
    const c=src[k],n=src[k+1];
    if(inC){ if(inC==='//'&&c==='\n')inC=null; else if(inC==='/*'&&c==='*'&&n==='/'){inC=null;k++;} continue; }
    if(inS){ if(c==='\\'){k++;continue;} if(c===inS)inS=null; if(inS==='`'&&c==='$'&&n==='{'){/*template expr*/} continue; }
    if(c==='/'&&n==='/'){inC='//';k++;continue;}
    if(c==='/'&&n==='*'){inC='/*';k++;continue;}
    if(c==='"'||c==="'"||c==='`'){inS=c;continue;}
    if(c==='{')d++;
    if(c==='}'){d--; if(d===0)return k;}
  }
  return -1;
}
end=scanBlock(js,start);
const modalsSrc=js.slice(start,end+1);
// 최상위 키 = depth 1에서의 `key:` 또는 `'key':`
const keys=[];
{
  let d=0,inS=null,inC=null;
  for(let k=0;k<modalsSrc.length;k++){
    const c=modalsSrc[k],n=modalsSrc[k+1];
    if(inC){ if(inC==='//'&&c==='\n')inC=null; else if(inC==='/*'&&c==='*'&&n==='/'){inC=null;k++;} continue; }
    if(inS){ if(c==='\\'){k++;continue;} if(c===inS)inS=null; continue; }
    if(c==='/'&&n==='/'){inC='//';k++;continue;}
    if(c==='/'&&n==='*'){inC='/*';k++;continue;}
    if(c==='"'||c==="'"||c==='`'){inS=c;continue;}
    if(c==='{'||c==='('||c==='[')d++;
    else if(c==='}'||c===')'||c===']')d--;
    else if(d===1){
      const m=/^[\s,]*([A-Za-z_$][\w$]*|'[^']+'|"[^"]+")\s*:/.exec(modalsSrc.slice(k));
      if(m && /[\s,{]/.test(modalsSrc[k-1]||'{')){
        keys.push(m[1].replace(/['"]/g,''));
        k+=m[0].length-1;
      }
    }
  }
}
const MODAL_KEYS=[...new Set(keys)];
console.log('MODALS 키 수:',MODAL_KEYS.length);
console.log(MODAL_KEYS.join(', '));

// ---- 2) index.html data-modal
const dm=[...html.matchAll(/data-modal="([^"]+)"/g)].map(m=>m[1]);
const dmU=[...new Set(dm)];
const missingHtml=dmU.filter(x=>!MODAL_KEYS.includes(x));
console.log('\n[A] index.html data-modal 고유:',dmU.length, JSON.stringify(dmU));
console.log('[A] MODALS에 없는 data-modal:', missingHtml.length? JSON.stringify(missingHtml):'없음 ✅');
if(missingHtml.length) fail(`[A] index.html 의 data-modal 이 MODALS 에 없다 → 눌러도 아무 화면도 안 열린다: ${JSON.stringify(missingHtml)}`);

// ---- 3) openModal('Y') 전부
const om=[...js.matchAll(/openModal\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
const omU=[...new Set(om)];
const missingOM=omU.filter(x=>!MODAL_KEYS.includes(x));
console.log('\n[B] openModal 문자열 인자 고유:',omU.length);
console.log('[B] MODALS에 없는 openModal 대상:', missingOM.length? JSON.stringify(missingOM):'없음 ✅');
if(missingOM.length) fail(`[B] openModal 대상이 MODALS 에 없다 → 호출하면 빈 화면: ${JSON.stringify(missingOM)}`);
// 위치 출력
missingOM.forEach(x=>{
  lines.forEach((l,n)=>{ if(l.includes(`openModal('${x}'`)||l.includes(`openModal("${x}"`)) console.log(`   game.js:${n+1}: ${l.trim().slice(0,120)}`); });
});
// 미사용 모달(고아)
const used=new Set([...dmU,...omU]);
const orphan=MODAL_KEYS.filter(k=>!used.has(k));
// 주: forgeItemPopup 은 b2Overlay 로, synth/hammerSynth 는 FORGE_SLOTS.act 로 열린다(정상)
console.log('[B2] 어디서도 열리지 않는 모달:', orphan.length? JSON.stringify(orphan):'없음');

// ---- 4) freshState 필드 vs S.xxx 참조
const fi=js.indexOf('function freshState(){');
const fs2=js.indexOf('{',fi+20);
const fe=scanBlock(js,fs2);
const fsSrc=js.slice(fs2,fe+1);
const fkeys=[];
{
  let d=0,inS=null,inC=null;
  for(let k=0;k<fsSrc.length;k++){
    const c=fsSrc[k],n=fsSrc[k+1];
    if(inC){ if(inC==='//'&&c==='\n')inC=null; else if(inC==='/*'&&c==='*'&&n==='/'){inC=null;k++;} continue; }
    if(inS){ if(c==='\\'){k++;continue;} if(c===inS)inS=null; continue; }
    if(c==='/'&&n==='/'){inC='//';k++;continue;}
    if(c==='/'&&n==='*'){inC='/*';k++;continue;}
    if(c==='"'||c==="'"||c==='`'){inS=c;continue;}
    if(c==='{'||c==='('||c==='[')d++;
    else if(c==='}'||c===')'||c===']')d--;
    else if(d===2){
      const m=/^[\s,]*([A-Za-z_$][\w$]*|'[^']+'|"[^"]+")\s*:/.exec(fsSrc.slice(k));
      if(m && /[\s,{]/.test(fsSrc[k-1]||'{')){ fkeys.push(m[1].replace(/['"]/g,'')); k+=m[0].length-1; }
    }
  }
}
const FS_KEYS=[...new Set(fkeys)];
console.log('\n[C] freshState 최상위 필드 수:',FS_KEYS.length);
const refs=[...js.matchAll(/\bS\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
const refU=[...new Set(refs)];
// 주: _tk/_vm 은 idleTick 의 (S._tk||0) 누산기라 undefined 안전(정상)
/* freshState 에 일부러 넣지 않는 필드. 이유를 남긴다 — 없으면 다음 사람이 '누락' 으로 보고 넣는다.
   _huntV  세이브 마이그레이션 판정 플래그. freshState 에 넣으면 mergeDefaults 가 먼저 채워
           이관이 통째로 스킵된다(HANDOFF 3-3 — 몬스터 확장 때 실제로 당했다).
   _tk/_vm idleTick 의 (S._tk||0) 누산기. undefined 에서 시작해도 안전하다.
   _monTicketV      몬스터 소환권 폐지 이관의 판정 플래그. _huntV 와 같은 이유로 여기 둔다.
   _monTicketRefund 그 이관이 남기는 환불 안내량. 표시하고 0 으로 지운다(없으면 안내 생략). */
const FS_EXEMPT = new Set(['_huntV','_tk','_vm','_monTicketV','_monTicketRefund',
  '_pendingLoginToast']);   // ★ v5.201: 접속 보상 토스트 플러시 큐 — 휘발성(부팅 중 rollDaily→DOMContentLoaded 사이만 존재). 세이브될 필요 없음.
const notInFS=refU.filter(x=>!FS_KEYS.includes(x));
console.log('[C] freshState에 없는 S.필드 참조:', notInFS.length? JSON.stringify(notInFS):'없음 ✅');
notInFS.forEach(x=>{
  const hits=[]; lines.forEach((l,n)=>{ if(new RegExp('\\bS\\.'+x+'\\b').test(l)) hits.push(n+1); });
  console.log(`   S.${x} → 라인 ${hits.slice(0,8).join(',')}${hits.length>8?' ...('+hits.length+'곳)':''}`);
});
{ const unexpected = notInFS.filter(x=>!FS_EXEMPT.has(x));
  if(unexpected.length) fail(`[C] freshState 에 없는 S.필드 참조 (구세이브에서 undefined → NaN 위험): ${JSON.stringify(unexpected)}`
    + `\n       의도한 예외라면 verify.mjs 의 FS_EXEMPT 에 이유와 함께 추가하라.`); }
const unusedFS=FS_KEYS.filter(x=>!refU.includes(x));
console.log('[C2] freshState에만 있고 읽지 않는 필드:', unusedFS.length? JSON.stringify(unusedFS):'없음');

// ---- 5) 중복 최상위 선언
const decl={};
const re=/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;
lines.forEach((l,n)=>{ const m=re.exec(l); if(m){ (decl[m[1]]=decl[m[1]]||[]).push(n+1); } });
const dup=Object.entries(decl).filter(([,v])=>v.length>1);
console.log('\n[D] 최상위(들여쓰기 0) 중복 선언:', dup.length? JSON.stringify(dup):'없음 ✅');
if(dup.length) fail(`[D] 최상위 중복 선언 → 나중 선언이 앞의 것을 덮는다: ${JSON.stringify(dup)}`);


// ---- E) $('#id') / getElementById 가 index.html 에 존재하는가
const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const jsCreatedIds=new Set([...js.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)].map(m=>m[1]));
[...js.matchAll(/id="([^"]+)"/g)].forEach(m=>jsCreatedIds.add(m[1]));   // 템플릿 문자열로 만든 노드
const q=[...js.matchAll(/\$\(\s*'#([\w-]+)'\s*\)/g)].map(m=>m[1])
  .concat([...js.matchAll(/\$\(\s*"#([\w-]+)"\s*\)/g)].map(m=>m[1]))
  .concat([...js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]/g)].map(m=>m[1]));
const qU=[...new Set(q)];
const badIds=qU.filter(x=>!htmlIds.has(x)&&!jsCreatedIds.has(x));
console.log('[E] game.js가 조회하는 DOM id:',qU.length);
console.log('[E] index.html/동적생성 어디에도 없는 id:', badIds.length?JSON.stringify(badIds):'없음 ✅');
if(badIds.length) fail(`[E] game.js 가 조회하는 DOM id 가 어디에도 없다 → null 참조: ${JSON.stringify(badIds)}`);
badIds.forEach(x=>{ lines.forEach((l,n)=>{ if(l.includes(`'#${x}'`)||l.includes(`"#${x}"`)) console.log(`   game.js:${n+1}: ${l.trim().slice(0,110)}`); }); });

// ---- F) index.html 의 id 중 중복
const allIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const dupIds=allIds.filter((x,i)=>allIds.indexOf(x)!==i);
console.log('\n[F] index.html 중복 id:', dupIds.length?JSON.stringify([...new Set(dupIds)]):'없음 ✅');
if(dupIds.length) fail(`[F] index.html 중복 id → getElementById 가 첫 번째만 집는다: ${JSON.stringify([...new Set(dupIds)])}`);

// ---- G) 호출되지만 정의되지 않은 함수 (최상위 선언 + 내장 화이트리스트 대조)
const defined=new Set();
[...js.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)].forEach(m=>defined.add(m[1]));
[...js.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].forEach(m=>defined.add(m[1]));
[...js.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}\s*=/g)].forEach(m=>m[1].split(',').forEach(s=>defined.add(s.trim().split(':').pop().trim())));
[...js.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].forEach(m=>defined.add(m[1]));
// 파라미터·메서드명도 후보에 넣어 오탐 줄임
[...js.matchAll(/\(([^()]*)\)\s*=>/g)].forEach(m=>m[1].split(',').forEach(s=>defined.add(s.trim().replace(/=.*$/,'').trim())));
[...js.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^()]*)\)/g)].forEach(m=>m[1].split(',').forEach(s=>defined.add(s.trim().replace(/=.*$/,'').trim())));
[...js.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)].forEach(m=>defined.add(m[1]));  // 객체 메서드 축약
const builtin=new Set(['Math','JSON','Object','Array','String','Number','Boolean','Date','Map','Set','Promise','console','window','document','localStorage','setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','cancelAnimationFrame','parseInt','parseFloat','isNaN','isFinite','alert','confirm','prompt','fetch','Error','RegExp','Symbol','Intl','encodeURIComponent','decodeURIComponent','navigator','location','performance','AudioContext','webkitAudioContext','Image','CustomEvent','Event','structuredClone','globalThis','undefined','null','true','false','if','for','while','switch','return','typeof','new','catch','function','super','this','delete','in','of','do','else','try','var','let','const','class','await','async','yield','void','instanceof','break','continue','case','default','throw','with','export','import','extends','static','get','set','Infinity','NaN','arguments']);
const called=[...js.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
const undef=[...new Set(called)].filter(x=>!defined.has(x)&&!builtin.has(x));
console.log('\n[G] 정의를 못 찾은 호출 심볼 후보:', undef.length?JSON.stringify(undef):'없음 ✅');

// ---- H) style.css / index.html 클래스 교차 (참고용, 실패로 치지 않음)
console.log('\n[H] index.html 라인수', html.split('\n').length, '/ style.css 라인수', css.split('\n').length, '/ game.js 라인수', lines.length);

// ---- I) FORGE_SLOTS act → MODALS 존재
const acts=[...js.matchAll(/act\s*:\s*'([^']+)'/g)].map(m=>m[1]);
console.log('[I] FORGE_SLOTS act 대상:',JSON.stringify([...new Set(acts)]));

// ---- L) 에셋 경로 확장자 — 코드가 가리키는 파일이 실제로 있는가
/* 왜 있는가
   2026-09-10 에 아이콘을 png→webp 로 옮기면서 game.js 의 eImg() 한 곳만 .png 로 남았다.
   그 함수는 화면 60여 곳이 쓰는 아이콘 출력기라 실제로는 아이콘 대부분이 깨졌을 텐데
   npm run check 는 그대로 통과했다 — 스모크의 파일 존재 검사는 경로를 자기가 따로 조립해서
   game.js 의 실제 문자열과 어긋나 있었기 때문이다. 즉 '코드가 무엇을 가리키는지' 를 아무도 안 봤다.

   여기서는 소스에 박힌 에셋 경로 리터럴을 긁어, 그 폴더에 그 확장자 파일이 실제로 있는지 본다.
   `${...}` 같은 템플릿 구멍이 파일명 쪽에 있어도 폴더와 확장자는 알 수 있으므로 그 수준에서 판정한다
   (폴더 쪽에 구멍이 있으면 판정 불가라 건너뛴다). 파일 하나하나가 아니라 '폴더에 그 확장자가
   하나라도 있는가' 를 보는 이유는, 확장자 전환을 빠뜨린 경우를 잡는 것이 목적이기 때문이다. */
{
  /* 폴더 아래(재귀) 파일 확장자 집합 */
  const extsUnder = (abs)=>{
    const out = new Set();
    const walk = (d)=>{
      for(const e of fs.readdirSync(d, { withFileTypes:true })){
        if(e.isDirectory()) walk(d + '/' + e.name);
        else { const i = e.name.lastIndexOf('.'); if(i>0) out.add(e.name.slice(i+1).toLowerCase()); }
      }
    };
    walk(abs);
    return out;
  };
  const srcAll = js + '\n' + html + '\n' + css;
  const bad = [];
  const seen = new Set();
  const RE = new RegExp('assets' + '\/' + '[A-Za-z0-9_\\-.' + '\/' + '${}()+\'"\\[\\]]*?' + '\.' + '(png|jpg|jpeg|webp|gif|svg)\\b', 'g');
  for(const m of srcAll.matchAll(RE)){
    const full = m[0], ext = m[1];
    const cut = full.lastIndexOf('/');
    if(cut < 0) continue;
    const dir = full.slice(0, cut);
    if(/[${}()+'"\[\]]/.test(dir)) continue;      // 폴더 쪽에 템플릿 구멍이 있으면 판정 불가
    const key = dir + '|' + ext;
    if(seen.has(key)) continue;
    seen.add(key);
    /* 하위 폴더까지 재귀로 본다 — 'assets/heroes/sheets/'+key+'.webp' 처럼 key 안에
       하위 폴더가 들어가는 조립식 경로가 있어서, 바로 아래만 보면 오탐이 난다. */
    let exts = null;
    try{ exts = extsUnder(D + dir); }
    catch(e){ bad.push(dir + '/ 폴더가 없다 (소스가 ' + full + ' 를 가리킨다)'); continue; }
    if(!exts.has(ext)){
      bad.push(dir + '/ 아래에 .' + ext + ' 파일이 하나도 없다 — 소스는 ' + full
        + ' 를 가리키는데 실제 확장자는 ' + JSON.stringify([...exts]));
    }
  }
  console.log('\n' + '[L] 에셋 경로 확장자: 폴더·확장자 조합 ' + seen.size + '종 검사 ' + (bad.length ? '불일치 ❌' : '통과 ✅'));
  bad.forEach(m=>fail('[L] ' + m));
}

// ---- K) CSS 계약 — "없어지면 기능이 조용히 깨지는" 규칙만 못박는다
/* 왜 있는가
   2026-09-07 에 옛 style.css 사본이 배포돼 v5.115~v5.127 의 CSS 수정 6건이 라이브에서 통째로
   되돌아갔는데, 3일 동안 아무 검사도 이걸 잡지 못했다. 스모크는 DOM 스텁 위에서 돌아 CSS 가
   아예 없고, verify 는 CSS 를 줄 수만 셌기 때문이다.

   그렇다고 CSS 전체를 검사할 수는 없다(디자인은 계속 바뀌는 게 정상이다). 그래서 대상을
   **"이 규칙이 없거나 값이 틀리면 기능이 조용히 죽는 곳"** 으로만 좁힌다. 각 항목에 왜 그 값이어야
   하는지를 함께 적는다 — 이유 없는 고정값은 다음 사람이 디자인 변경으로 오해하고 지운다.

   새 항목을 추가하는 기준: 화면이 조금 달라 보이는 정도는 넣지 마라. '눌러도 안 보인다',
   '마크업은 나오는데 스타일이 없다', '가려서 조작이 안 된다' 처럼 기능이 죽는 것만 넣는다. */
{
  const cssNoComment = css.replace(/[/][*][\s\S]*?[*][/]/g, '');
  /* 선택자별 선언 블록을 모은다(같은 선택자가 여러 번 나오면 이어붙인다). */
  const RULES = {};
  for(const m of cssNoComment.matchAll(/([^{}]+)[{]([^{}]*)[}]/g)){
    m[1].split(',').map(x=>x.trim().replace(/[\s]+/g,' ')).forEach(sel=>{
      if(sel) RULES[sel] = (RULES[sel]||'') + ';' + m[2];
    });
  }
  const declOf = (sel)=>RULES[sel] || null;
  const propOf = (sel, prop)=>{
    const d = declOf(sel); if(!d) return null;
    const hits = [...d.matchAll(new RegExp('(?:^|;)[\\s]*'+prop+'[\\s]*:([^;]+)','g'))];
    return hits.length ? hits[hits.length-1][1].trim() : null;   // 마지막 선언이 이긴다
  };
  const hasKeyframes = (name)=>new RegExp('@keyframes[\\s]+'+name+'[\\s]*[{]').test(cssNoComment);

  const CONTRACTS = [
    { sel:'.tut-finger', prop:'z-index', min:21,
      why:'튜토리얼 손가락. 모달(#modal-root z:20) 위에 떠야 모달 안 버튼을 짚는 유도가 보인다. '
        + '2026-09-07 배포 회귀에서 30→13 으로 되돌아가 손가락이 모달 뒤에 숨었던 바로 그 지점이다.' },
    { sel:'.ar-head .ah-ot', why:'투기장 서든데스 배지. game.js 가 이 마크업을 항상 출력하므로, '
        + '규칙이 없으면 스타일 없는 날것으로 뜬다(같은 회귀에서 통째로 사라졌었다).' },
    { sel:'.ar-head .ah-timewrap', why:'서든데스 배지를 남은 시간 아래에 세로로 붙이는 래퍼. 없으면 배지가 시간과 겹친다.' },
    { sel:'#errbar', prop:'z-index', min:61,
      why:'전역 오류 띠. 소환연출(60)·토스트(40)·모달(20) 보다 위여야 한다 — 모달 render 가 터진 '
        + '경우에도 보여야 하므로 무엇에도 가려지면 안 된다.' },
    { sel:'.save-ta', why:'진행도 내보내기/가져오기 텍스트 상자. 규칙이 없으면 높이 0 에 가까워져 붙여넣을 칸이 사라진다.' },
    { sel:'#chat', prop:'height',
      why:'채팅 영역 높이. 값이 비면 채팅이 전장을 밀어내거나 사라진다(대표가 직접 조정하는 값이라 크기는 고정하지 않는다).' },
  ];

  const bad = [];
  CONTRACTS.forEach(c=>{
    if(!declOf(c.sel)){ bad.push(`${c.sel} 규칙이 없다 — ${c.why}`); return; }
    if(!c.prop) return;
    const v = propOf(c.sel, c.prop);
    if(v===null){ bad.push(`${c.sel} 에 ${c.prop} 선언이 없다 — ${c.why}`); return; }
    if(c.min!==undefined){
      const n = parseInt(String(v).replace(/[^0-9-]/g,''), 10);
      if(!(n >= c.min)) bad.push(`${c.sel} 의 ${c.prop} 가 ${v} — ${c.min} 이상이어야 한다. ${c.why}`);
    }
  });

  /* animation 이 가리키는 @keyframes 가 실제로 있는지. 이름만 남고 정의가 사라지면
     브라우저가 조용히 무시해서 '움직이지 않는다' 는 것 외엔 아무 단서가 없다. */
  const animNames = new Set();
  for(const m of cssNoComment.matchAll(/animation(?:-name)?[\s]*:([^;{}]+)/g)){
    m[1].split(',').forEach(part=>{
      part.trim().split(/[\s]+/).forEach(tok=>{
        if(/^[A-Za-z_][-\w]*$/.test(tok) &&
           !/^(none|infinite|alternate|normal|reverse|forwards|backwards|both|running|paused|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|initial|inherit|unset|steps|cubic-bezier)$/.test(tok))
          animNames.add(tok);
      });
    });
  }
  const missingKf = [...animNames].filter(n=>!hasKeyframes(n));
  if(missingKf.length) bad.push(`@keyframes 정의가 없는 animation 이름: ${JSON.stringify(missingKf)} — 브라우저가 조용히 무시한다`);

  console.log(`\n[K] CSS 계약: 규칙 ${CONTRACTS.length}건 · animation 이름 ${animNames.size}종 검사 ` + (bad.length ? '불일치 ❌' : '통과 ✅'));
  bad.forEach(m=>fail(`[K] ${m}`));
}

// ---- J) 버전 일치 (package.json ↔ index.html 캐시버스터·화면 표기)
/* 캐시버스터를 안 올리면 기존 이용자가 바뀐 CSS/JS 를 받지 못한다 — 실제로 겪은 사고라 게이트로 세운다.
   정본은 package.json 하나이고, 맞추는 일은 `node version.mjs` 가 대신한다. */
{
  const { checkSync } = await import('./version.mjs');
  const r = checkSync();
  console.log('\n[J] 버전 일치:', r.ok ? `v${r.v.display} (캐시버스터 ${r.v.bust}) ✅` : '불일치 ❌');
  if(!r.ok) fail(`[J] 버전 불일치 (정본 package.json v${r.v.display}): ${r.bad.join(' / ')}`
    + `\n       고치려면: node version.mjs`);
}

// ---- 판정
console.log('\n=================== 정적 무결성 판정 ===================');
if(FAIL.length){
  console.error(`❌ 실패 ${FAIL.length}건:\n - ` + FAIL.join('\n - '));
  process.exit(1);
}
console.log('✅ 정적 무결성 통과 (하드 항목 A·B·C·D·E·F·J)');
console.log('   ※ [B2] 고아 모달 · [G] 미정의 심볼 후보는 오탐이 섞여 경고로만 둔다.');
