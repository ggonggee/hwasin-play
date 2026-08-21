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

// ---- 3) openModal('Y') 전부
const om=[...js.matchAll(/openModal\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
const omU=[...new Set(om)];
const missingOM=omU.filter(x=>!MODAL_KEYS.includes(x));
console.log('\n[B] openModal 문자열 인자 고유:',omU.length);
console.log('[B] MODALS에 없는 openModal 대상:', missingOM.length? JSON.stringify(missingOM):'없음 ✅');
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
const notInFS=refU.filter(x=>!FS_KEYS.includes(x));
console.log('[C] freshState에 없는 S.필드 참조:', notInFS.length? JSON.stringify(notInFS):'없음 ✅');
notInFS.forEach(x=>{
  const hits=[]; lines.forEach((l,n)=>{ if(new RegExp('\\bS\\.'+x+'\\b').test(l)) hits.push(n+1); });
  console.log(`   S.${x} → 라인 ${hits.slice(0,8).join(',')}${hits.length>8?' ...('+hits.length+'곳)':''}`);
});
const unusedFS=FS_KEYS.filter(x=>!refU.includes(x));
console.log('[C2] freshState에만 있고 읽지 않는 필드:', unusedFS.length? JSON.stringify(unusedFS):'없음');

// ---- 5) 중복 최상위 선언
const decl={};
const re=/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;
lines.forEach((l,n)=>{ const m=re.exec(l); if(m){ (decl[m[1]]=decl[m[1]]||[]).push(n+1); } });
const dup=Object.entries(decl).filter(([,v])=>v.length>1);
console.log('\n[D] 최상위(들여쓰기 0) 중복 선언:', dup.length? JSON.stringify(dup):'없음 ✅');


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
badIds.forEach(x=>{ lines.forEach((l,n)=>{ if(l.includes(`'#${x}'`)||l.includes(`"#${x}"`)) console.log(`   game.js:${n+1}: ${l.trim().slice(0,110)}`); }); });

// ---- F) index.html 의 id 중 중복
const allIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const dupIds=allIds.filter((x,i)=>allIds.indexOf(x)!==i);
console.log('\n[F] index.html 중복 id:', dupIds.length?JSON.stringify([...new Set(dupIds)]):'없음 ✅');

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
