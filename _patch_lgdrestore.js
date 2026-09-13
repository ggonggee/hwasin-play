import fs from 'node:fs';
const p = 'smoke-test.mjs';
let s = fs.readFileSync(p, 'utf8');
const o = `step('레전더리 플래시 — 함수 정합', ()=>{
  /* ⚠ 스텁 한계: 게임 코드의 중복 체크(root.querySelector('.lgd-flash'))가 스텁
     documentStub.querySelector(클래스 셀렉터 미지원 → 항상 더미 반환) 때문에 첫 호출부터
     차단된다 — 실제 브라우저에서는 정상. 따라서 여기선 함수 존재·무예외만 검증하고
     오버레이 렌더·중복 방지·2.2초 자기 제거는 실물 QA에서 확인한다. */
  if(typeof ev('legendaryFlash')!=='function') throw new Error('legendaryFlash 없음');
  ev('legendaryFlash')('용암 대검');   // 무예외
  const src=fs.readFileSync('game.js','utf8');
  if(!src.includes("root.querySelector('.lgd-flash')")) throw new Error('중복 방지 체크 없음');
  if(!/setTimeout\\(\\(\\)=>ov\\.remove\\(\\),\\s*2200\\)/.test(src)) throw new Error('2.2초 자기 제거 없음');
});`;
const n = `step('레전더리 플래시 — 오버레이 렌더·중복 방지', ()=>{
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
});`;
if (!s.includes(o)) { console.error('O NOT FOUND'); process.exit(1); }
s = s.replace(o, n);
fs.writeFileSync(p, s);
console.log('ok');
