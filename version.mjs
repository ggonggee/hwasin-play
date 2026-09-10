/* 결정의 시대 — 버전 단일 출처(SSOT) 도구.
   왜 필요한가: 버전 문자열이 package.json 1곳 + index.html 3곳(css 캐시버스터·js 캐시버스터·타이틀 표기)에
   흩어져 있어 손으로 맞춰야 했다. 캐시버스터를 빼먹어 기존 이용자가 옛 CSS/JS 를 계속 받은 사고가
   실제로 있었다(README 4항). 사람이 기억해야 하는 단계는 언젠가 반드시 빠진다 — 단계 자체를 없앤다.

   정본은 package.json 의 version 하나다. 나머지는 여기서 파생한다.
     package.json "5.129.0"  →  캐시버스터 "5129" · 화면 표기 "Ver 5.129"

   사용:
     node version.mjs            현재 버전으로 index.html 을 맞춘다(동기화)
     node version.mjs 5.130      package.json 을 올리고 index.html 까지 맞춘다
     node version.mjs --check    어긋나 있으면 종료코드 1 (verify.mjs 가 호출한다)
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const D = path.dirname(fileURLToPath(import.meta.url)) + '/';

/* package.json 의 version 을 "5.129" 형태(major.minor)로 정규화한다.
   patch 자리는 이 프로젝트에서 쓰지 않으므로 캐시버스터에 넣지 않는다. */
export function readVersion(){
  const pkg = JSON.parse(fs.readFileSync(D+'package.json','utf8'));
  const m = /^(\d+)\.(\d+)/.exec(pkg.version || '');
  if(!m) throw new Error(`package.json version 형식이 "major.minor..." 가 아니다: ${pkg.version}`);
  return { major:+m[1], minor:+m[2], display:`${m[1]}.${m[2]}`, bust:`${m[1]}${m[2]}`, raw:pkg.version };
}

/* index.html 에서 실제로 쓰이는 3곳을 읽는다. 없으면 null → 불일치로 처리된다. */
export function readHtmlVersions(html){
  const css  = /href="style\.css\?v=(\d+)"/.exec(html);
  const js   = /src="game\.js\?v=(\d+)"/.exec(html);
  const disp = /Ver\s+(\d+\.\d+)/.exec(html);
  return { css: css&&css[1], js: js&&js[1], display: disp&&disp[1] };
}

export function checkSync(){
  const v = readVersion();
  const html = fs.readFileSync(D+'index.html','utf8');
  const h = readHtmlVersions(html);
  const bad = [];
  if(h.css !== v.bust)        bad.push(`style.css?v=${h.css} ≠ ${v.bust}`);
  if(h.js !== v.bust)         bad.push(`game.js?v=${h.js} ≠ ${v.bust}`);
  if(h.display !== v.display) bad.push(`화면 표기 "Ver ${h.display}" ≠ "Ver ${v.display}"`);
  return { ok: bad.length===0, bad, v };
}

function writeSync(){
  const v = readVersion();
  let html = fs.readFileSync(D+'index.html','utf8');
  html = html.replace(/href="style\.css\?v=\d+"/, `href="style.css?v=${v.bust}"`)
             .replace(/src="game\.js\?v=\d+"/,    `src="game.js?v=${v.bust}"`)
             .replace(/Ver\s+\d+\.\d+/,           `Ver ${v.display}`);
  fs.writeFileSync(D+'index.html', html);
  return v;
}

function bump(next){
  if(!/^\d+\.\d+$/.test(next)) throw new Error(`버전은 "5.130" 형태로 준다 (받은 값: ${next})`);
  const p = D+'package.json';
  const pkg = JSON.parse(fs.readFileSync(p,'utf8'));
  pkg.version = next + '.0';
  fs.writeFileSync(p, JSON.stringify(pkg,null,2) + '\n');
  return writeSync();
}

/* 직접 실행됐을 때만 동작한다 (verify.mjs 는 import 로 checkSync 만 쓴다).
   경로 비교 대신 파일명으로 판정한다 — Windows 경로 구분자 때문에 URL 비교가 어긋난다. */
if (process.argv[1] && process.argv[1].endsWith('version.mjs')) {
  const arg = process.argv[2];
  if(arg === '--check'){
    const r = checkSync();
    if(r.ok){ console.log(`✅ 버전 일치 — v${r.v.display} (캐시버스터 ${r.v.bust})`); }
    else{ console.error(`❌ 버전 불일치 (정본 package.json v${r.v.display}):\n   - ` + r.bad.join('\n   - ')
                      + `\n   고치려면: node version.mjs`); process.exit(1); }
  } else if(arg){
    const v = bump(arg);
    console.log(`✅ v${v.display} 로 올렸다 — package.json · index.html(캐시버스터 ${v.bust} · 화면 표기)`);
  } else {
    const v = writeSync();
    console.log(`✅ index.html 을 package.json v${v.display} 에 맞췄다 (캐시버스터 ${v.bust})`);
  }
}
