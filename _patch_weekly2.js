import fs from 'node:fs';
const p = 'game.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes("tab==='주간'")) { console.error('ALREADY'); process.exit(0); }
const anchor = "      } else if(tab==='업적'){";
if (!s.includes(anchor)) { console.error('ANCHOR'); process.exit(1); }
const block = `      } else if(tab==='주간'){
        /* ★ v5.249: 주간 의뢰 — 매주 월요일 리셋(weeklyState가 새 주면 스냅샷·수령 초기화).
           진행 = 현재 stats − 주 시작 스냅샷. 수령은 의뢰별 1회성.
           ⚠ 렌더에서 q.give() 를 절대 부르지 마라 — 지급 부수효과가 있다. 표시는
           WEEKLY_REWARD_TXT 로만. */
        const w=weeklyState();
        body.appendChild(el('div','datehead', '주간 의뢰 · ' + w.key));
        body.appendChild(el('div','small mut','매주 월요일 리셋 · 진행은 실제 행동으로 자동 반영됩니다'));
        WEEKLY_QUESTS.forEach(q=>{
          const now=S.stats[q.stat]||0, base=(w.base&&w.base[q.stat])||0;
          const prog=Math.min(q.goal, Math.max(0, now-base));
          const done=prog>=q.goal, claimed=!!w.claimed[q.id];
          const row=el('div','pack'); row.style.opacity=claimed?'.5':'1';
          row.innerHTML=\`<div class="pic">\${q.icon}</div><div class="info"><div class="t">\${q.txt}</div><div class="d">진행 \${prog}/\${q.goal} · 보상 \${claimed?'수령 완료 ✓':WEEKLY_REWARD_TXT[q.id]}</div></div>\`;
          const btn=el('button','btn sm'+(done&&!claimed?' gold':''), claimed?'완료':'받기');
          if(!done||claimed) btn.disabled=true;
          btn.onclick=()=>{ if(claimed||prog<q.goal) return;
            w.claimed[q.id]=true; const what=q.give();
            toast(\`주간 의뢰 완료 보상 — \${what}\`); sysLog(\`주간 의뢰 완료(\${q.txt}) — \${what}\`);
            save(); render(); refreshHUD(); };
          row.appendChild(btn); body.appendChild(row);
        });
      } else if(tab==='업적'){`;
s = s.replace(anchor, block);
const o2 = `const WEEKLY_QUESTS=[`;
const n2 = `const WEEKLY_REWARD_TXT={ w1:'영웅 기록서 X3', w2:'전설 망치 X10', w3:'골드 2,000만' };
const WEEKLY_QUESTS=[`;
if (!s.includes(o2)) { console.error('O2'); process.exit(1); }
s = s.replace(o2, n2);
fs.writeFileSync(p, s);
console.log('render ok');
