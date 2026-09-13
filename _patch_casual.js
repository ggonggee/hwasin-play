import fs from 'node:fs';
const p = 'balance-sim.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('CASUAL')) { console.error('ALREADY'); process.exit(0); }
// 1) ARGV casual 플래그 + 상수
const o1 = `const MAX_HOURS = Number(process.argv[2]||240);`;
const n1 = `const MAX_HOURS = Number(process.argv[2]||240);
/* ★ v5.274: 캐주얼 시나리오 — 세 번째 인자 'casual'. 하루(48창) 중 첫 16창(8시간)만
   접속, 나머지 32창(16시간)은 오프라인 — offlinePending(분당 OFFLINE_GPM, 8h 상한은
   16h>8h라 항상 8h분)을 다음 접속 창에서 정산 수령(settle=addGold). 실유저의
   '하루 8시간 접속' 근사로, 무한 축이 캐주얼에게도 작동하는지 검증한다. */
const CASUAL = process.argv[3]==='casual';
const ACTIVE_WINDOWS_PER_DAY = 16;   // 8h 접속`;
if (!s.includes(o1)) { console.error('O1'); process.exit(1); }
s = s.replace(o1, n1);
// 2) 메인 루프 — 비활성 창 처리. battleWindow 호출부 앞에서 가드
const o2 = `  // ② 전투 창
  const goldBefore=ev('S').gold, killsBefore=ev('S').stats.kills;
  battleWindow(WINDOW);`;
const n2 = `  // ② 전투 창 — 캐주얼: 하루 16창만 접속. 비접속 창은 오프라인 적립 후 스킵.
  if(CASUAL && (windows % 48) >= ACTIVE_WINDOWS_PER_DAY){
    const S=ev('S');
    S.offlinePending=(S.offlinePending||0)+Math.floor(ev('OFFLINE_GPM')/60*WINDOW);   // 16h 연속이어도 8h 상한은 computeOffline에서 — 여기선 창당 적립(세션 재현)
    simSec+=WINDOW; windows++;
    if((windows % 48)===0){ /* 하루 경계 — 다음날 첫 창에서 정산·일일 콘텐츠 */ }
    continue;
  }
  const goldBefore=ev('S').gold, killsBefore=ev('S').stats.kills;
  battleWindow(WINDOW);`;
if (!s.includes(o2)) { console.error('O2'); process.exit(1); }
s = s.replace(o2, n2);
// 3) 접속 재개 창(하루 첫 창)에서 offlinePending 정산 — dailyStep 직전에
const o3 = `  // ③ 일일 콘텐츠·소환서 구매 → 합성·소환 (의도 루프)
  dailyStep();`;
const n3 = `  // ③ 일일 콘텐츠·소환서 구매 → 합성·소환 (의도 루프)
  /* 캐주얼: 접속 재개(하루 첫 활성 창)에서 오프라인 정산 수령 — settle 의 addGold 경로.
     8h 상한 적용(16h치 적립돼도 8h분만 — 정본 computeOffline 규칙). */
  if(CASUAL && (windows % 48)===1 && (windows>1)){
    const S=ev('S');
    const cap=Math.floor(ev('OFFLINE_GPM')/60*8*3600);
    const give=Math.min(S.offlinePending||0, cap);
    if(give>0){ ev('addGold')(give); S.offlinePending=0; }
  }
  dailyStep();`;
if (!s.includes(o3)) { console.error('O3'); process.exit(1); }
s = s.replace(o3, n3);
// 4) 헤더 로그에 모드 표시
const o4 = "log(`\\n[밸런스 시뮬] 시드 42 · 최대 ${MAX_HOURS}시뮬시간 · 창 ${WINDOW/60}분\\n`);";
const n4 = "log(`\\n[밸런스 시뮬] 시드 42 · 최대 ${MAX_HOURS}시뮬시간 · 창 ${WINDOW/60}분${CASUAL?' · 캐주얼(일 8h 접속+오프라인 정산)':''}\\n`);";
if (!s.includes(o4)) { console.error('O4'); process.exit(1); }
s = s.replace(o4, n4);
fs.writeFileSync(p, s);
console.log('ok');
