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
const FS_EXEMPT = new Set(['_huntV','_tk','_vm','_monTicketV','_monTicketRefund']);
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
