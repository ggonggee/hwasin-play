/* =========================================================================
   화신 (火神) — 2D HTML 게임 엔진
   레퍼런스(벤치마크 방치 RPG) UI 구조·흐름 참고 / 콘텐츠·명칭·아트는 화신 오리지널.
   확정 수치(2라운드 시뮬): 각성 +1.5%/12단계·조각 250×1.08^(n-1),
   등급배율 N1.0/R1.6/E2.8/L4.5, 제작확률 R85/E55/L40, 입장권 상한 30,
   마을 cost=100×lv^1.3·마을회관 골드버프 +0.2%p/Lv 등.
   ========================================================================= */
'use strict';

/* ----------------------------- 데이터 ----------------------------- */
const JOBS = [
  { id:'flame',  name:'화염검사',   el:'불',     emoji:'🔥', role:'근접 딜러', pos:'전방', stat:'STR', color:'#ff6a3d', ranged:false },
  { id:'frost',  name:'빙결술사',   el:'얼음',   emoji:'❄️', role:'마법 딜러', pos:'후방', stat:'INT', color:'#4db6e8', ranged:true  },
  { id:'earth',  name:'대지수호성', el:'대지',   emoji:'🪨', role:'탱커',      pos:'전방', stat:'VIT', color:'#8bd45a', ranged:false },
  { id:'shadow', name:'야습자',     el:'그림자', emoji:'🌑', role:'암살',      pos:'측면', stat:'AGI', color:'#a86bd0', ranged:false },
  { id:'wind',   name:'질풍궁수',   el:'바람',   emoji:'🏹', role:'지속 딜러', pos:'후방', stat:'AGI', color:'#8ee6c0', ranged:true  },
];
const GRADES = {
  N:{ key:'N', name:'일반',      color:'#9aa0a6', mult:1.0 },
  R:{ key:'R', name:'희귀',      color:'#3b82f6', mult:1.6 },
  E:{ key:'E', name:'영웅',      color:'#a855f7', mult:2.8 },
  L:{ key:'L', name:'레전더리',  color:'#f5a623', mult:4.5 },
};
const GORDER = ['N','R','E','L'];
/* ★ B4/G-50: 영웅 로스터 30종 — hero_id 단위 정본 테이블.
   채번: N블록 HERO_001~005 / R블록 HERO_006~015 / E블록 HERO_016~025 / L블록 HERO_026~030.
   블록 내부는 직업 순(화염검사→빙결술사→대지수호성→야습자→질풍궁수)으로 순환한다.
   S.heroes 는 hero_id 를 키로 { level, own } 만 보관하고 등급·직업·이름은 이 표가 정본이다.
   구세이브(직업키 {grade,level,own})는 migrateHeroes() 가 hero_id 구조로 변환한다.
   조각(S.shards)은 지금까지처럼 '직업' 단위로 유지된다 — 같은 직업의 상위 등급 영웅을
   합성으로 해금할 때 소모한다(heroFuse). */
/* ★ F3 · IP 세탁 예방 — 이 표의 인명은 전부 화신 오리지널 조어여야 한다.
   원작 영웅명 음차는 물론, 타사 게임 캐릭터의 국문 공식표기와 겹치는 조어도 금지다
   (교체 이력: 베인·리나·녹스·모르간·클라리스 → 타사 캐릭터 국문표기 충돌로 폐기). */
const HERO_NAMES = {
  flame : ['재검 도르카','불꽃검 라비스'],
  frost : ['서리술사 리엔','한파술사 비케'],
  earth : ['돌방패 고른','암반수호 브라크'],
  shadow: ['그늘칼 실라','야습자 베이른'],
  wind  : ['풋내기 궁수 피오'],
};
const HERO_ROSTER = (()=>{
  const order = ['flame','frost','earth','shadow','wind'];
  /* ★ v5.57: 영웅 9종 — N은 5직업 전부, R은 wind 제외 4직업만. = 9명. */
  const out = [];
  // N 등급: 5직업 각 1명
  order.forEach(cid=>{
    out.push({ hero_id:'HERO_'+String(out.length+1).padStart(3,'0'), class_id:cid, grade:'N', name:HERO_NAMES[cid][0] });
  });
  // R 등급: wind 제외 4직업 각 1명
  ['flame','frost','earth','shadow'].forEach(cid=>{
    out.push({ hero_id:'HERO_'+String(out.length+1).padStart(3,'0'), class_id:cid, grade:'R', name:HERO_NAMES[cid][1] });
  });
  return out;
})();
const HERO_BY_ID = {}; HERO_ROSTER.forEach(h=>HERO_BY_ID[h.hero_id]=h);
const HERO_SHARD_NEED = { N:20, R:60, E:150, L:400 };   // 등급별 합성 요구 조각
/* ★ B7/F1 · G-102 결정: 상점 '영웅' 탭 = 개별 영웅 조각 판매 (직업 5종 판매 → 폐기).
   [판매 종수 = 14종] 원작 재판독 exactCount=14 (추천 탭 요약·영웅 탭 상세 두 곳에서 동일 14종·동일 순서 재현).
   [선정 기준 = hero_id 채번 오름차순 상위 14종 (HERO_001~HERO_014)]
     근거: 재판독 orderRule 이 "가나다순도 등급순도 아닌 내부 고정 ID 순서"로 판정됐다.
     우리 로스터는 30종이므로 같은 규칙(고정 채번 오름차순)을 그대로 적용해 앞 14종을 취한다.
     결과적으로 N블록 5종 전원(HERO_001~005) + R블록 앞 9종(HERO_006~014)이 판매 대상이며,
     E/L 조각은 상점 직판매에서 제외된다(합성·소환·던전으로만 수급 → 상위 등급 과금 단축 방지).
   [가격 2단가] 그린 리본 X50 = 루비 300 (6.0루비/개) · 레드 리본 X600 = 루비 3,400 (≈5.67루비/개, 약 5.5% 대량할인). */
/* ★ v5.56: 영웅 9종이므로 상점 판매도 9종 전체. */
const SHOP_HERO_COUNT = 9;
const SHOP_HEROES = HERO_ROSTER.slice(0, SHOP_HERO_COUNT);
const SHARD_TIERS = [
  { qty:50,  cost:300,  cls:'t50'  },   // 그린 리본
  { qty:600, cost:3400, cls:'t600' },   // 레드 리본
];
// 온보딩 클래스 특성 → 확정 지급되는 N등급 영웅(HERO_001~005)
const CLASS_STARTER = { mage:'HERO_002', warrior:'HERO_001' };
// 제작 파라미터 (시뮬 baseline; 데모용 제작시간은 단축)
const CRAFT = {
  N:{ p0:1.00, gold:5000,     mat:5,  sec:30   },
  R:{ p0:1.00, gold:50000,    mat:15, sec:30   },
  E:{ p0:0.80, gold:800000,   mat:40, sec:3600 },
  L:{ p0:0.40, gold:12000000, mat:70, sec:7200 },
};
/* ★ B2: 제작 재료 24종 (등급 4 × 6종) — S.mats 딕셔너리의 정본 스키마.
   키 = 한글 재료명(그대로 S.mats[키]). g = 등급(N/R/E/L). ic = 아이콘.

   ★ v4.3: 등급 공용풀(S.mats.N/R/E/L) 폐지.
     구버전은 개별 재료가 모자라면 같은 등급 공용풀에서 대신 차감했는데, 이 구조가
     플레이어를 속였다 — 공용풀 60을 N재료 6칸이 **각자 자기 것처럼 중복 표시**해
     화면 합계가 432로 보이지만 실제 총량은 132였고, 흑염석 30개를 쓰면 손도 대지
     않은 녹옥정 표시가 72→54로 같이 줄어들었다.
     이제 재료는 "보이는 개수 = 그 재료의 실제 개수" 하나뿐이다.
     구세이브의 공용풀 잔량은 로드 시 같은 등급 재료들에 나눠 넣고 키를 제거한다. */
const MATS = [
  { k:'흑염석',        ic:'🪨', g:'N', icon:'ore' },       { k:'녹옥정',   ic:'🟩', g:'N', icon:'gem_green' },  { k:'봉인석',   ic:'🔒', g:'N', icon:'key' },
  { k:'청연석',        ic:'🔷', g:'N', icon:'gem_blue' }, { k:'무쇠조각', ic:'⚙️', g:'N', icon:'anvil' },      { k:'잿가루',   ic:'🌫️', g:'N', icon:'wood' },
  { k:'차원석',        ic:'🌀', g:'R', icon:'gem_diamond' }, { k:'마력핵', ic:'🔵', g:'R', icon:'energy' },    { k:'성수',     ic:'💧', g:'R', icon:'potion' },
  { k:'용접기',        ic:'🔧', g:'R', icon:'hammer' },   { k:'은사슬',   ic:'⛓️', g:'R', icon:'ring' },       { k:'서리결정', ic:'❄️', g:'R', icon:'snowflake' },
  { k:'최상급 마법서', ic:'📘', g:'E', icon:'book' },     { k:'대장장이의 눈물', ic:'💠', g:'E', icon:'water' }, { k:'심연광석', ic:'🟣', g:'E', icon:'gem_purple' },
  { k:'불멸의 뿌리',   ic:'🌿', g:'E', icon:'leaf' },     { k:'영혼석',   ic:'👻', g:'E', icon:'soul' },       { k:'천공수정', ic:'💎', g:'E', icon:'crystal' },
  { k:'화신의 심장',   ic:'❤️‍🔥', g:'L', icon:'heart' },   { k:'용의 비늘', ic:'🐉', g:'L', icon:'feather' },   { k:'태초의 불씨', ic:'🔥', g:'L', icon:'fire' },
  { k:'성좌파편',      ic:'✨', g:'L', icon:'star' },     { k:'무명의 각인', ic:'🔱', g:'L', icon:'rune' },     { k:'금강석',    ic:'🧿', g:'L', icon:'gem_red' },
];
const MAT_BY_KEY = {}; MATS.forEach(m=>MAT_BY_KEY[m.k]=m);
const MAT_BY_GRADE = { N:[], R:[], E:[], L:[] }; MATS.forEach(m=>MAT_BY_GRADE[m.g].push(m));
/* ★ v5.16: 재료/직업 아이콘을 UniqueIcon(컬러) 으로 교체.
   v5.15까지 PictoIcon(순백 실루엣)을 CSS mask로 염색해 썼으나,
   마스크 염색은 원본 컬러가 아니라 단색이라 이질감이 있었다.
   UniqueIcon은 컬러 일러스트 원본이라 <img>로 그대로 쓰면 끝.
   캔버스(face)는 PNG를 못 그리므로 기존 이모지(m.ic / j.emoji) 유지. */
function matIcon(k, size){
  const m = MAT_BY_KEY[k];
  if(!m) return '❔';
  if(!m.icon) return m.ic;
  const s = size||1.15;
  return `<img src="assets/icons/${m.icon}.png" style="width:${s}em;height:${s}em;vertical-align:middle;object-fit:contain" alt="${k}">`;
}
function jobIcon(id, size){
  const j = JOBS.find(x=>x.id===id);
  if(!j) return '❔';
  const s = size||1;
  return `<img src="assets/icons/job_${id}.png" style="width:${s}em;height:${s}em;vertical-align:middle;object-fit:contain" alt="${j.name}">`;
}
/* ★ v5.19: 이모지→에셋 변환 헬퍼.
   game.js 곳곳의 ic/emoji 필드(제작 카테고리·상점 아이템·소환권 등)는
   DOM innerHTML 에 직접 들어간다. matIcon처럼 별도 icon 필드가 없는 곳이 많아,
   렌더링 시점에 이모지를 <img>로 바꿔주는 범용 헬퍼.
   매핑이 없으면 원본 이모지 반환 (캔버스 face는 어차피 안 거친다).
   파일명은 이모지 코드포인트(16진). */
const EM_ICON_MAP = {
  '⚔️':'Gear_Weapons_Sword_02','🛡️':'Gear_Shield_01','💍':'Gear_Ring_01_Gold',
  '📖':'Item_Book_01_Red','🔥':'Misc_Fire_01_Red','🔨':'Gear_Weapons_Hammer_01',
  '🗡️':'FA_WP_Main_Sword_001_Silver','🪓':'Gear_Weapons_Axe_01','🪄':'FA_WP_Main_Staff_001_Wood',
  '🏹':'Gear_Bow_01','🔱':'Gear_Weapons_Spear_01','⛏️':'Gear_Weapons_Pickaxe_01',
  '📜':'Item_Scroll_01_Red','📕':'Item_Book_04_Purple','🔮':'Item_Artifact_01_Gold',
  '🧪':'Consumable_Potion_01_Red','🧭':'Item_Compass_01_Gold','🎴':'Item_Card_01_Blue',
  '🪨':'Material_Ore_02_01','🎟️':'UI_Shop_Ticket_01_Gold','👘':'Item_Scarf_01_Red',
  '🗝️':'Economy_Key_01_Gold','🎫':'UI_Shop_Ticket_03','🪙':'Economy_Coin_02_Gold',
  '🎲':'Item_Dice_01_Gold','🎁':'UI_Rewards_Gift_01_Green','🧰':'Item_Bag_02_Brown',
  '👹':'Consumable_Explosives_Bomb_01_Red','🎖️':'UI_Rewards_Medal_01_Gold',
  '🏅':'UI_Rewards_Medal_01_Silver',
  // ★ v5.20: 상점 탭 + 기타 보충
  '💊':'Consumable_Potion_02_Green',  // 버프 (녹색 포션)
  '🎭':'Item_Card_01_Color',          // 영웅 (컬러 카드)
  '📢':'UI_Common_Notice_01_Blue',    // 추천/공지 (확성기)
  '💎':'Economy_Gem_02_Yellow',       // 루비/젬 (노랑 보석)
  '💰':'Economy_Goldbar_01',          // 골드 (금괴)
  '🌾':'Material_Wood_01',            // 농장 (나무)
  '⛺':'UI_Common_Home_01_Green',     // 야영지 (집)
  // ★ v5.21: 전수 조사 — DOM 표시용 18종 추가
  '💠':'Economy_Water_01_Blue',       // 대장장이의 눈물 (물방울)
  '📦':'Item_Chest_01_Wood',          // 패키지 (상자)
  '🪵':'Material_Wood_01',            // 나무 묶음
  '📈':'Economy_Energy_01_Yellow',    // 경험치 버프 (에너지)
  '🚫':'UI_Common_AD_Remove_01_Yellow',// 광고 제거
  '🏛️':'UI_Common_Home_01_Red',      // 마을회관 (집)
  '⚒️':'Gear_Weapons_Hammer_02',     // 강화 패키지 (망치)
  '📃':'UI_Common_Speed_01_Yellow',  // 즉시 완성권 (스피드)
  '🩸':'Consumable_Healing_Bandage_01',// 몬스터 소환권+ (붕대)
  '🏋️':'Stat_Power_01',              // 훈련소 (파워)
  '🎯':'UI_ETC_Target_01',           // 드랍률 버프 (과녁)
  '🗓️':'UI_Common_Calendar_01_Blue', // 7일 출석 (달력)
  '💬':'UI_Social_Chat_01',          // 채팅
  '🏆':'UI_Rewards_Trophy_01_Gold',  // 트로피/라운지
  '🎉':'UI_Rewards_Gift_01_Yellow',  // 이벤트 (선물)
  '🛠️':'Gear_Weapons_Saw_01',        // 점검 (톱)
  '🔒':'UI_Common_Lock_01_Silver',   // 잠금 (자물쇠)
  '❄️':'Misc_Snowflake_01',          // 빙결 (눈송이) — DOM 표시용
};
function emSlug(e){ return e.replace(/[\uFE0F\u200D]/g,'').codePointAt(0).toString(16); }
function eImg(e, size){
  if(!e) return '';
  const file = EM_ICON_MAP[e];
  if(!file) return e;  // 매핑 없으면 원본 이모지
  const s = size||1.3;
  return `<img src="assets/icons/em/${emSlug(e)}.png" style="width:${s}em;height:${s}em;vertical-align:middle;object-fit:contain" alt="${e}">`;
}
// 보유 수량 = 그 재료 하나. 공용풀 합산 없음(위 주석 참조).
function matAvail(k){ return MAT_BY_KEY[k] ? (S.mats[k]||0) : 0; }
function matSpend(k,n){ if(!MAT_BY_KEY[k]) return; S.mats[k]=Math.max(0,(S.mats[k]||0)-n); }
function matGain(k,n){ if(!MAT_BY_KEY[k]) return; S.mats[k]=(S.mats[k]||0)+n; }
// 등급별 합계 — 요약 표시 전용(정산·절전 그리드). 소모는 언제나 개별 재료 단위다.
function matGradeTotal(g){ return (MAT_BY_GRADE[g]||[]).reduce((a,m)=>a+(S.mats[m.k]||0),0); }
// 등급만 정해진 획득처(드랍·상점·보상)는 그 등급 재료 중 하나로 실체화한다.
function matGainGrade(g,n){ const pool=MAT_BY_GRADE[g]||[]; if(!pool.length||n<=0) return null;
  const m=pool[(Math.random()*pool.length)|0]; matGain(m.k,n); return m; }
/* 구세이브 이관 — 공용풀 잔량을 같은 등급 재료들에 균등 분배하고 키를 제거한다.
   진행도가 사라지지 않도록 나머지는 첫 재료에 몰아준다. */
function migrateMatPools(){
  if(!S || !S.mats) return;
  ['N','R','E','L'].forEach(g=>{
    const left=S.mats[g]; if(typeof left!=='number' || left<=0){ delete S.mats[g]; return; }
    const pool=MAT_BY_GRADE[g]||[]; if(!pool.length){ delete S.mats[g]; return; }
    const each=Math.floor(left/pool.length), rest=left-each*pool.length;
    pool.forEach((m,i)=>{ S.mats[m.k]=(S.mats[m.k]||0)+each+(i===0?rest:0); });
    delete S.mats[g];
  });
}

/* 제작 부위 카테고리 — 원작 구조: 4개 아이템 카테고리 + 액션 숏컷 2개(용광로/망치) = 6칸.
   items 는 등급별 배열({N,R,E,L}) — 등급 전환 시 아이템 개수가 바뀐다.
   개수 기준: 무기 5/7/5/5 · 방어구 5/10/10/20 · 장신구 3/3/5/13 · 특수 4/6/1/2 */
const _PFX = (pre, arr)=>arr.map(([n,ic])=>[pre+' '+n, ic]);
const _WEAPON5 = [['단검','🗡️'],['대검','⚔️'],['도끼','🪓'],['지팡이','🪄'],['장궁','🏹']];
const _ARMOR10 = [['투구','⛑️'],['상의','🥼'],['하의','👖'],['신발','🥾'],['방패','🛡️'],
                  ['견갑','🎽'],['각반','🦵'],['완갑','🧤'],['망토','🧣'],['벨트','🎗️']];
const _ACC3 = [['반지','💍'],['목걸이','📿'],['귀걸이','🧿']];
const _ACC5 = _ACC3.concat([['팔찌','⌚'],['인장','🔖']]);
/* ★ v4.7: 원작 대장간 등급별 아이템 수 실측 재대조 결과 R·E·L 다수가 부족했다.
   실측(등급 탭 하이라이트로 귀속 확인): 무기 N5/R7/E8/L5 · 방어구 N5/R12/E15/L25+
   · 장신구 N3/R3/E7/L13 · 특수 N4/R6/E1/L2.
   종전 주석의 "방어구 5/10/10/20 · 무기 …E5 · 장신구 …E5" 는 오답이었다. 여분 부위를 보강한다. */
const _ARMOR_X = [['면갑','😷'],['흉갑','🦺'],['정강이받이','🦿'],['손목보호대','🧵'],['어깨받이','🎽']];
const _WEAPON_X = [['쌍검','🗡'],['전곤','🔨'],['사슬낫','⛓']];
const _ACC_X = [['귀고리','🪬'],['부적','🧿']];
const FORGE_SLOTS = [
  { k:'무기', ic:'⚔️', items:{
      N:[['잿불 단검','🗡️'],['흑철 대검','⚔️'],['전투도끼','🪓'],['비전 지팡이','🪄'],['강궁','🏹']],
      R:_PFX('청강',_WEAPON5).concat([['서리 창','🔱'],['은빛 낫','🪒']]),
      E:_PFX('심연',_WEAPON5).concat(_PFX('심연',_WEAPON_X)),   // 실측 8
      L:_PFX('화신',_WEAPON5) } },
  { k:'방어구', ic:'🛡️', items:{
      N:_ARMOR10.slice(0,5),
      R:_PFX('청강',_ARMOR10).concat(_PFX('청강',_ARMOR_X.slice(0,2))),      // 실측 12
      E:_PFX('심연',_ARMOR10).concat(_PFX('심연',_ARMOR_X)),                  // 실측 15
      L:_PFX('화신',_ARMOR10).concat(_PFX('성좌',_ARMOR10), _PFX('성좌',_ARMOR_X)) } },  // 실측 25+
  { k:'장신구', ic:'💍', items:{
      N:_ACC3,
      R:_PFX('청옥',_ACC3),
      E:_PFX('심연',_ACC5).concat(_PFX('심연',_ACC_X)),   // 실측 7
      L:_PFX('화신',_ACC5).concat(_PFX('성좌',_ACC5)).concat([['용린 반지','💍'],['용린 목걸이','📿'],['용린 인장','🔖']]) } },
  { k:'특수', ic:'📖', items:{
      N:[['고서','📖'],['정수','🔮'],['물약','🧪'],['곡괭이','⛏️']],
      R:[['청류 고서','📖'],['청류 정수','🔮'],['상급 물약','🧪'],['오래된 곡괭이','⛏️'],['마력 나침반','🧭'],['소환 부적','🎴']],
      E:[['심연 고서','📖']],
      L:[['태초의 고서','📕'],['찬란한 곡괭이','⛏️']] } },
  { k:'용광로', ic:'🔥', act:'synth' },      // 액션 숏컷 (아이템 그리드 아님)
  { k:'망치',   ic:'🔨', act:'hammerSynth' },
];
// 아이템별 요구 재료 2~5종 가변 — 등급 총량(CRAFT[g].mat)을 분배해 결정적으로 생성
function buildForgeRecipes(){
  FORGE_SLOTS.forEach((s,si)=>{
    if(!s.items) return;
    GORDER.forEach(g=>{
      const pool=MAT_BY_GRADE[g], total=CRAFT[g].mat;
      s.items[g]=s.items[g].map((it,i)=>{
        const cnt=2+((si+i)%4); const recipe=[]; let left=total;
        for(let c=0;c<cnt;c++){
          const m=pool[(si*2+i+c)%pool.length];
          const need = (c===cnt-1) ? Math.max(1,left) : Math.max(1,Math.round(total/cnt));
          left-=need; recipe.push({ k:m.k, need });
        }
        return { n:it[0], ic:it[1], recipe };
      });
    });
  });
}
buildForgeRecipes();
// 제작 아이템 플레이버 (결과 팝업·아이템 팝업에서 노출)
function itemFlavor(name){
  const n=name||'';
  if(n.indexOf('방패')>=0) return '17초마다 최대 체력의 20% 회복';
  if(n.indexOf('투구')>=0||n.indexOf('상의')>=0||n.indexOf('하의')>=0) return '체력·방어력·마법 저항력 상승';
  if(n.indexOf('신발')>=0||n.indexOf('목걸이')>=0) return '공격 속도·이동 속도 상승';
  if(n.indexOf('반지')>=0||n.indexOf('귀걸이')>=0||n.indexOf('팔찌')>=0||n.indexOf('인장')>=0) return '치명타 확률·치명타 공격력 상승';
  if(n.indexOf('고서')>=0) return '보유 시 계정 전체 스탯이 상승합니다';
  if(n.indexOf('정수')>=0) return '보스가 드랍하는 고유 재료로 제작됩니다';
  if(n.indexOf('물약')>=0) return '전투 중 자동으로 소모되어 체력을 회복합니다';
  if(n.indexOf('곡괭이')>=0) return '채굴 칭호 획득 조건 아이템';
  return '마법 공격력·치명타 확률·치명타 공격력·공격 속도 상승';
}
/* 세트효과 9종 — 화신 오리지널 명칭 (레퍼런스 명칭 미사용). 임계값·효과 문구는 원작 도감 구조 그대로.
   ★ A2 정정 — 종전 B3/G-49 의 `half`(2/4 소효과 = 4/4 의 40%) 2단계 설계는 원작 오독이었다. 폐기한다.
     원작 세트효과 도감 실측(직접 판독):
       docs/reference/기능별/11_설정_도움말_버프/캡처_2026_07_22_06_35_51_171.png (1~3번 카드)
                                              /캡처_2026_07_22_06_36_02_668.png (3~4번, 다단계 카드)
                                              /캡처_2026_07_22_06_36_08_668.png (5~7번 카드)
                                              /캡처_2026_07_22_06_36_13_284.png (7~9번 카드)
     결론: · 9종 중 8종은 **6세트 단일 임계값**만 존재한다. 2/4 같은 하위 단계는 아예 없다.
           · '작열'(원작 최상위 세트) 1종만 **3 → 6 → 8세트 3단계 누적**이다.
           · 8세트 효과 "초당 몬스터 소환 마릿수 증가"가 칭호 '불씨의 벗' 획득 조건과 이어진다(TITLES 의 id:'lava' 참조).
     구조: tiers = [{ k:필요 세트 수, fx:[효과 줄...] }] — 카드는 이 배열을 위에서 아래로 그대로 출력한다.
   ※ 카드 순서도 원작 도감 스크롤 순서(잔불→월하→질풍→작열→응시→광란→그늘칼→주술→강철맹세)에 맞췄다. */
const SETS = [
  { n:'잔불',   tiers:[ { k:6, dmg:30, fx:['입히는 피해량 30% 증가'] } ] },
  { n:'월하',   tiers:[ { k:6, def:30, fx:['받는 물리 피해량 30% 감소'] } ] },
  { n:'질풍',   tiers:[ { k:6, def:30, fx:['받는 마법 피해량 30% 감소'] } ] },
  /* 유일한 3단계 누적 세트 (원작 도감에서도 이 카드만 임계값이 3개다) */
  { n:'작열',   multi:true, tiers:[
      { k:3, def:30, dmg:30, fx:['입히는 피해량 30% 증가','받는 물리 피해량 30% 감소','받는 마법 피해량 30% 감소'] },
      { k:6, dmg:60, fx:['입히는 피해량 60% 증가','모든 스킬 쿨타임 15% 감소','(3세트의 효과 포함, 피해량만 30% ⇒ 60%)'] },
      { k:8, dmg:60, fx:['모든 스킬 쿨타임 35% 감소','초당 몬스터 소환 마릿수 증가'] } ] },
  { n:'응시',   tiers:[ { k:6, def:30, dmg:30, fx:['체력 50% 이상 적 일반 공격 시 70% 데미지 증가','보스 일반 공격 시 50% 추가 피해',
                                   '받는 마법 피해량 30% 감소','받는 물리 피해량 30% 감소','입히는 피해량 30% 증가'] } ] },
  { n:'광란',   tiers:[ { k:6, def:30, dmg:30, fx:['일반 공격 4회마다 다음 데미지 무효화','모든 스킬 쿨타임 20% 감소',
                                   '받는 물리 피해·마법 피해 30% 감소','입히는 피해량 30% 증가'] } ] },
  { n:'그늘칼', tiers:[ { k:6, dmg:60, fx:['크리티컬 확률이 100%를 넘는 경우, 일반·스킬 공격 시 넘는 초과분(%)만큼 추가 타격',
                                   '즉사 실패 시 50% 추가 타격','모든 스킬 쿨타임 20% 감소','입히는 피해량 60% 증가'] } ] },
  { n:'주술',   tiers:[ { k:6, dmg:60, fx:['전설 스킬 사용 시 모든 스킬 중 한 개가 무작위로 추가 발동',
                                   '모든 스킬 쿨타임 20% 감소','입히는 피해량 60% 증가'] } ] },
  { n:'강철맹세', tiers:[ { k:6, def:40, dmg:30, fx:['받는 치명타 데미지 40% 감소','받는 물리 피해·마법 피해 40% 감소',
                                   '모든 스킬 쿨타임 20% 감소','입히는 피해량 30% 증가'] } ] },
];
function setByName(n){ return SETS.find(s=>s.n===n)||null; }
/* ★ v5.6: 세트효과를 전투에 실제로 반영한다.
   종전에는 SETS 에 '입히는 피해량 60% 증가' 같은 수치가 다 적혀 있는데도 setPieceCount 의 유일한
   호출처가 칭호 조건 판정 하나뿐이라, 전설 장비를 8부위 모아도 전투력이 1도 변하지 않았다
   — 후반 성장 동기가 통째로 허상이었다.
   달성한 임계 중 가장 높은 단계의 dmg 만 취하고(누적 아님), 여러 세트는 합산한다.
   '받는 피해 감소'·쿨타임 계열은 전투력 한 숫자로 환산할 근거가 없어 이번 범위에서 제외한다. */
function setDamageMul(){
  let dmg=0, def=0;
  SETS.forEach(st=>{
    const cnt=setPieceCount(st.n); if(!cnt) return;
    let bd=0, bf=0;
    st.tiers.forEach(t=>{ if(cnt<t.k) return;
      if(typeof t.dmg==='number') bd=Math.max(bd,t.dmg);
      if(typeof t.def==='number') bf=Math.max(bf,t.def); });
    dmg+=bd; def+=bf;
  });
  /* 방어 계열(받는 피해 감소)도 전투력에 기여시킨다 — 안 그러면 월하·질풍 같은 방어 세트를
     6부위 다 모아도 전투력이 1도 안 올라 "모을 이유가 없는 세트"가 된다.
     받는 피해 r% 감소 = 유효 체력 1/(1-r) 배. 과중첩을 막기 위해 감소율은 70%에서 자른다. */
  const dr = Math.min(0.7, def/100);
  return (1 + dmg/100) * (1/(1-dr));
}
// 지금 활성화된 세트 요약 — 도감·전투력 툴팁용
function activeSets(){ return SETS.map(st=>({ n:st.n, c:setPieceCount(st.n) })).filter(x=>x.c>0); }
/* 도감 등 좁은 카드용 1줄 요약 — 최상위 임계 단계의 첫 줄만 노출 */
function setFxSummary(s){ const t=s.tiers[s.tiers.length-1]; return `${t.k}세트: ${t.fx[0]}`; }
/* ★ v5.7: 세트별 구성 아이템 확정.
   원작 도감은 카드마다 아이콘 6칸(작열만 더 많음)을 보여주는데, 아이콘을 눌러도 이름이 뜨지 않아
   (대표 확인) 원작의 실제 구성품을 알아낼 방법이 없다 → **화신 자체 결정**으로 확정한다.

   설계 원칙
     · 세트 1벌 = 서로 다른 부위 6종 (원작 카드 아이콘 6칸과 일치). 작열만 8종(3/6/8 3단계).
     · 등급대로 나눠 배치해 성장에 따라 순차 해금되게 한다 — 일반1 · 희귀2 · 영웅3 · 레전더리3.
     · 세트끼리 아이템이 겹치지 않는다(한 아이템은 한 세트에만 속한다).
     · 세트에 속하지 않는 제작 아이템도 남겨 둔다(모든 아이템이 세트일 필요는 없다).
   ⚠ 원작 대조가 아니라 자체 설계다. 나중에 원작 구성품이 확인되면 이 표만 갈아끼우면 된다. */
const SET_PIECES = {
  // 일반 — 첫 세트. 방어구 5부위 + 시작 무기
  '잔불':   ['투구','상의','하의','신발','방패','잿불 단검'],
  // 희귀 — 정면(중장) / 기동(경장) 2벌
  '월하':   ['청강 투구','청강 상의','청강 하의','청강 신발','청강 방패','청강 대검'],
  '질풍':   ['청강 견갑','청강 각반','청강 완갑','청강 망토','청강 벨트','청강 장궁'],
  // 영웅 — 원거리 / 근접 / 암살 3벌 (심연 방어구 15부위를 5+5+5 로 나눈다)
  '응시':   ['심연 투구','심연 상의','심연 하의','심연 신발','심연 방패','심연 장궁'],
  '광란':   ['심연 견갑','심연 각반','심연 완갑','심연 망토','심연 벨트','심연 대검'],
  '그늘칼': ['심연 면갑','심연 흉갑','심연 정강이받이','심연 손목보호대','심연 어깨받이','심연 쌍검'],
  // 레전더리 — 마법(화신) / 수호(성좌) / 최상위 8종(작열)
  '주술':   ['화신 투구','화신 상의','화신 하의','화신 신발','화신 방패','화신 지팡이'],
  '강철맹세':['성좌 투구','성좌 상의','성좌 하의','성좌 신발','성좌 방패','성좌 견갑'],
  '작열':   ['화신 견갑','화신 각반','화신 완갑','화신 망토','화신 벨트',
             '화신 단검','화신 대검','화신 도끼'],
};
function setPieceCount(name){
  const list = SET_PIECES[name];
  if(!list || !S || !Array.isArray(S.equips)) return 0;
  const seen = {};
  /* ★ v5.7: '보유'가 아니라 **착용** 기준이다. 보유로 세면 9세트가 전부 동시에 켜져
     배율이 무한정 곱해진다 — 세트는 원래 입어야 발동한다. */
  S.equips.forEach(e=>{ if(!e || !e.equipped) return;
    const nm=e.slot||''; if(list.indexOf(nm)>=0) seen[nm]=1; });
  return Object.keys(seen).length;   // 서로 다른 부위 개수 = 'N세트'
}

/* ★ B3/G-38: 부위별 옵션 스키마 — 장비 상세는 부위마다 노출 스탯 종류·개수가 다르다.
   부위 판정은 정확일치가 아니라 부분문자열(itemFlavor 와 동일 방식). */
const STAT_DEF = {
  hp:   { n:'체력',          base:500, per:80,   dec:0 },
  def:  { n:'방어력',        base:200, per:40,   dec:0 },
  mdef: { n:'마법 저항력',   base:160, per:32,   dec:0 },
  atk:  { n:'공격력',        base:300, per:50,   dec:0 },
  matk: { n:'마법 공격력',   base:300, per:50,   dec:0 },
  crit: { n:'치명타 확률',   base:2.5, per:0.40, dec:1, unit:'%' },
  cdmg: { n:'치명타 공격력', base:8.0, per:1.20, dec:1, unit:'%' },
  aspd: { n:'공격 속도',     base:1.5, per:0.25, dec:2, unit:'%' },
  mspd: { n:'이동 속도',     base:1.2, per:0.20, dec:2, unit:'%' },
};
const SLOT_STAT_SCHEMA = [
  // 방패 — 3스탯 + 특수문구 (가장 먼저 판정)
  { part:'방패',   match:['방패'],                                             stats:['hp','def','mdef'], special:'17초마다 최대 체력의 20% 회복' },
  { part:'방어구', match:['투구','상의','하의'],                                stats:['hp','def','mdef'] },
  { part:'무기',   match:['단검','대검','도끼','지팡이','장궁','강궁','검','창','낫','완드','소드'], stats:['matk','crit','cdmg','aspd'] },
  { part:'보조',   match:['목걸이','신발'],                                     stats:['aspd','mspd'] },
  { part:'반지',   match:['반지'],                                              stats:['crit','cdmg'] },
  { part:'장신구', match:['귀걸이','팔찌','인장'],                              stats:['crit','cdmg'] },
  { part:'벨트',   match:['벨트'],                                              stats:['hp','def'] },
  { part:'방어구', match:['견갑','각반','완갑','망토'],                          stats:['hp','def','mdef'] },
  { part:'특수',   match:['고서','정수','물약','곡괭이','나침반','부적'],        stats:['hp','atk'] },
];
const SLOT_STAT_FALLBACK = { part:'공용', stats:['hp','atk','def'] };
/* ★ v5.63→v5.82: 장비 슬롯명 → 판타지 아이콘 매핑 (6000FantasyIcons 에셋).
   종전 캐주얼 이모지 → 판타지 일러스트 PNG로 전면 교체.
   슬롯명(부분문자열 매칭) → assets/icons/equip/<키>.png 경로 반환. */
const EQUIP_ICONS = [
  /* 무기 */
  ['단검','dagger'],['대검','sword'],['도끼','axe'],['지팡이','staff'],['장궁','bow'],['강궁','bow'],
  ['쌍검','sword'],['전곤','hammer_w'],['사슬낫','scythe'],['창','spear'],['낫','scythe'],['완드','wand'],['소드','sword'],['검','dagger'],
  /* 방어구 */
  ['방패','shield'],['투구','helm'],['상의','chest'],['하의','pants'],['신발','boots'],
  ['견갑','shoulder'],['각반','pants'],['완갑','gloves'],['망토','cape'],['벨트','belt'],
  ['면갑','helm'],['흉갑','chest'],['정강이받이','boots'],['손목보호대','bracer'],['어깨받이','shoulder'],
  /* 장신구 */
  ['반지','ring'],['목걸이','necklace'],['귀걸이','necklace'],['팔찌','bracelet'],['인장','ring'],['귀고리','bracelet'],['부적','necklace'],
  /* 특수 */
  ['고서','book'],['정수','essence'],['물약','potion'],['곡괭이','anvil'],['나침반','essence'],['소환 부적','book'],
];
function equipIcon(slotName){
  const n=slotName||'';
  for(const [k,ic] of EQUIP_ICONS){ if(n.indexOf(k)>=0) return ic; }
  return 'sword';
}
/* ★ v5.82: equipIcon이 PNG 파일명을 반환하므로, <img>로 렌더링하는 헬퍼. */
function equipImg(slotName, size){
  const ic = equipIcon(slotName);
  const s = size||1.3;
  return `<img src="assets/icons/equip/${ic}.png" style="width:${s}em;height:${s}em;vertical-align:middle;object-fit:contain" alt="${slotName||''}">`;
}
function slotSchema(name){
  const n=name||'';
  for(const s of SLOT_STAT_SCHEMA){ if(s.match.some(m=>n.indexOf(m)>=0)) return s; }
  return SLOT_STAT_FALLBACK;
}
function statLine(key, enh, gmult){
  const d=STAT_DEF[key]; if(!d) return null;
  const v=(d.base + (enh||0)*d.per) * gmult;
  const txt = d.dec ? v.toFixed(d.dec) : fmt(Math.round(v));
  return { n:d.n, v:'+'+txt+(d.unit||'') };
}

/* ★ B3/G-48: 코스튬 데이터 단일 소스 (도감 전량 = 9종 / 상점 판매 = price 보유 5종).
   id 는 세이브(S.costumeOn·S.costumeOwn)와 B7 상점이 참조한다 —
   변경 시 반드시 migrateNames() 의 COSTUME_ID_MIGRATE 에 구→신 매핑을 추가할 것.
   flame/frost/gold 는 구버전 계정버프 3종의 호환 id 이다.
   ★ F3 · IP 세탁 — 구 id(lycan·nova·bargon·carmilla·seraphin)는 타사 게임 캐릭터 표기와
   충돌하는 음차였다 → 화신 오리지널 표기(월영·홍염·수림·한서리·창해)로 전면 교체. */
const COSTUMES = [
  /* 판매 5종 = ★ B7/F1: 원작 재판독이 지목한 '영웅 전용 코스튬 확정구매' 위치(코스튬 탭, 5장·각 3,400루비).
     hero = 전용 대상 영웅(HERO_ROSTER 정본 hero_id). 명칭·id 는 전부 화신 오리지널. */
  { id:'wolyeong',  name:'월영 사냥 예복',   heroId:'shadow', hero:'HERO_009', icon:'💀', kind:'atk',  fx:'물리 공격력 +10%',          price:3400, owned:false },
  { id:'hongyeom',  name:'홍염 축제 예복',   heroId:'flame',  hero:'HERO_006', icon:'🦊', kind:'atk',  fx:'물리 공격력 +10%',          price:3400, owned:false },
  { id:'surim',     name:'수림 수호 예복',   heroId:'earth',  hero:'HERO_008', icon:'🌿', kind:'hp',   fx:'체력 +10%',                 price:3400, owned:false },
  { id:'hanseori',  name:'한여름 서리 예복', heroId:'frost',  hero:'HERO_007', icon:'🏖️', kind:'gold', fx:'보유만으로 골드 획득 +20%', price:3400, passive:true, owned:false },
  { id:'changhae',  name:'창해 물결 예복',   heroId:'wind',   hero:'HERO_005', icon:'🌊', kind:'gold', fx:'보유만으로 골드 획득 +20%', price:3400, passive:true, owned:false },
  { id:'flame',     name:'작열 예복',        heroId:'flame',  icon:'🔥', kind:'atk',  fx:'물리 공격력 +10%',          owned:false },
  { id:'frost',     name:'서리 예복',        heroId:'frost',  icon:'❄️', kind:'hp',   fx:'최대 체력 +10%',            owned:false },
  { id:'gold',      name:'황금 예복',        heroId:'earth',  icon:'🌑', kind:'gold', fx:'골드 획득 +20%',            owned:false },
  { id:'stormveil', name:'질풍 장막',        heroId:'wind',   icon:'🌪️', kind:'atk',  fx:'공격 속도 +10%',            owned:false },
  /* ★ v4.7: 코스튬 도감 실측 최소 11종(04_장비_인벤토리 스크롤 전량, 2열 그리드 5.5행).
     종전 9종이라 2종 부족했다. 아래 2종은 도감 전용(비매품) — 판매 5종 구성은 그대로 둔다. */
  { id:'seolha',    name:'설하 순찰 예복',   heroId:'frost',  hero:'HERO_007', icon:'🌨️', kind:'hp',   fx:'체력 +10%',                 owned:false },
  { id:'noeun',     name:'노을 사냥 예복',   heroId:'wind',   hero:'HERO_005', icon:'🌇', kind:'gold', fx:'보유만으로 골드 획득 +20%', passive:true, owned:false },
];
const COSTUME_LEGACY_IDX = { flame:0, frost:1, gold:2 }; // 구세이브 S.costumes(개수) 호환
function costumeById(id){ return COSTUMES.find(c=>c.id===id)||null; }
function costumeHas(id){
  if(S && S.costumeOwn && S.costumeOwn[id]) return true;
  const li=COSTUME_LEGACY_IDX[id];
  return li!==undefined && ((S&&S.costumes)||0)>li;
}
// 착용 코스튬의 전투 스탯 배율 (공/체 +10%)
// ★ 소유 재검증 필수: 착용 id가 표에 존재하기만 해도 버프가 나가면, 구세이브 이관 경로로
//   "사지 않은 코스튬"의 효과가 새어나간다(v3.8 D1 오지급 버그와 같은 계열).
function costumeStatMul(){ const id=S&&S.costumeOn, c=costumeById(id);
  return (c && costumeHas(id) && (c.kind==='atk'||c.kind==='hp')) ? 1.1 : 1; }
// 골드 획득 배율 — 착용형(+20%) · 보유만으로 발동하는 passive(+20%, 중복 1회)
function costumeGoldMul(){
  let m=1; const wid=S&&S.costumeOn, w=costumeById(wid);
  if(w && costumeHas(wid) && w.kind==='gold') m*=1.2;
  if(COSTUMES.some(c=>c.passive && c.id!==(S&&S.costumeOn) && costumeHas(c.id))) m*=1.2;
  return m;
}
// ★ B3/G-41: 강화 파괴 보호 비용 — 등급별 망치 종류·개수 분기
const PROTECT_COST = {
  N:{ cur:'hammerN', n:5,  label:'일반 망치' },
  R:{ cur:'hammerN', n:10, label:'일반 망치' },
  E:{ cur:'hammers', n:5,  label:'전설 망치' },
  L:{ cur:'hammers', n:10, label:'전설 망치' },
};
/* ★ B6/G-86 (v4.2 A3-3): §5-3 해소 — 투기장 티어는 '승급 가능한 7단계'로 확정한다.
   확정 근거 ① 점수 기반 실시간 승급·강등이 존재하며 승패마다 정확히 ±100점이 움직인다
              (540점 실버 → 1패 후 440점 브론즈 강등을 관찰).
   확정 근거 ② 로그인 시 뜨는 랭크 보상 팝업의 '매일 티어 골드' 7단(브론즈~레전더리)이
              보상표(ARENA_TIER_ROWS)와 동일 구성으로 교차 확인됨 → 레전더리는 서버 1위 배지가 아니라
              도달 가능한 최상위 티어다.
   따라서 종전 6단계 배열을 레전더리 포함 7단계로 확장한다. */
const TIERS = ['브론즈','실버','골드','플래티넘','다이아몬드','마스터','레전더리'];
/* 티어별 진입 점수(하한). 승급·강등은 이 표와 현재 점수만으로 판정한다(실시간 승강).
   ⚠비전미확인 — 촬영대기: 각 티어의 정확한 임계 점수는 원작에서 판독되지 않았다.
   관측된 유일한 경계(440점=브론즈 / 540점=실버)를 만족하는 500점 균등 배분을 잠정값으로 둔다.
   ★ N2 — 20260728 추가스샷 9장 재수색: ⓘ 안내 박스가 3줄(주간 리셋 / 데미지 50% 감소 / 입장권 5개)
     뿐이며 티어 임계 점수표는 투기장 화면 어디에도 노출되지 않는다는 것만 재확인했다.
     따라서 이 배열은 이번 배치에서도 교체하지 못한다(원작 티어표 스샷 확보 시 이 배열만 교체). */
const TIER_PTS = [0, 500, 1000, 1500, 2000, 2500, 3000];
function arenaTierOf(pts){ let t=0; for(let i=0;i<TIER_PTS.length;i++){ if(pts>=TIER_PTS[i]) t=i; } return t; }
/* ★ B6/G-84·G-85·G-86: 투기장 보상표 3종 (행수 9 / 13 / 7)
   ★ N2: 원작 3탭을 전량 재판독 — 보상(9행)·매일 보상(7행)은 값·순서까지 완전 일치했고,
     버프 탭만 마지막 '31~40위 5%' 행이 빠져 있어 12행 → 13행으로 보정했다.
     원작 1~3위 라벨 자리에는 서버 1~3위 유저의 고유 칭호가 박혀 있으나(타사 IP) 우리는 '1위/2위/3위'로 둔다. */
const ARENA_DICE_ROWS = [
  ['1위','X500'],['2위','X350'],['3위','X250'],['4~10위','X150'],['11~15위','X100'],
  ['16~20위','X50'],['21~30위','X25'],['31~40위','X10'],['참여한 모든 유저','X50'],
];
const ARENA_GBUFF_ROWS = [
  ['1위',100],['2위',80],['3위',70],['4위',60],['5위',50],['6위',45],
  ['7위',40],['8위',35],['9위',30],['10~14위',25],['15~20위',15],['21~30위',10],
  ['31~40위',5],   // ★ N2: 실측 13행 — 종전 12행에서 누락돼 있던 마지막 행
];
const ARENA_TIER_ROWS = [
  ['레전더리',30000000],['마스터',15000000],['다이아몬드',10000000],['플래티넘',5000000],
  ['골드',2000000],['실버',1000000],['브론즈',500000],
];
/* ★ N2: 주간 리셋(월요일 12시) 직후의 내 순위 — 신규 계정과 같은 자리로 되돌린다(freshState 와 동일 값). */
const ARENA_RANK_RESET = 1088;
/* ★ N2: 원작 ⓘ '투기장에선 모든 데미지가 50% 감소 됩니다.' — 투기장 전투에만 걸리는 양방향 데미지 배율.
   승패 판정(±100점)은 그대로 두고, 실제 전투의 피해량(아군 타격·몬스터 반격)에만 곱한다. */
const ARENA_DMG_MUL = 0.5;
/* ★ N2: 원작 ⓘ '매일 입장권 5개가 자동충전 됩니다.' — 날짜 롤오버 시 1회 지급되는 배치 충전량. */
const ARENA_DAILY_TICKET = 5;
/* 직업별 스킬 (등급 N/R/E/L 순으로 해금)
   ★ B4/G-55: [이름, 설명, 쿨타임(초)] 3필드 — 쿨타임은 슬롯 순서대로 1.5 / 9 / 20 / 35 고정.
   등급 뱃지는 해금 여부와 무관하게 상시 노출한다(heroDetail 스킬 탭). */
const SKILL_CD = [1.5, 9, 20, 35];
const SKILLS = {
  flame:[['화염 참격','전방 부채꼴 지속 피해',1.5],['작열 강타','단일 대상 대미지+화상',9],['불의 낙인','치명타 시 폭발',20],['겁화 폭발','광역 화염 폭발(궁극)',35]],
  frost:[['서리 화살','원거리 둔화 피해',1.5],['빙결 폭발','광역 둔화+피해',9],['절대영도','대상 빙결(행동불가)',20],['한파 소환','전체 빙결 폭풍(궁극)',35]],
  earth:[['대지 방벽','아군 보호막+도발',1.5],['바위 강타','전열 광역 피해',9],['대지 분노','받은 피해 반사',20],['산악 붕괴','전체 기절+피해(궁극)',35]],
  shadow:[['그림자 강타','단일 치명 특화',1.5],['암습','후열 침투 폭딜',9],['절명 일격','저체력 대상 즉사 확률',20],['그림자 처형','연속 암살(궁극)',35]],
  wind:[['연쇄 사격','다단 히트',1.5],['질풍 난사','공속 증가 난사',9],['폭풍 화살','관통 피해',20],['천공 관통','전열 관통 폭격(궁극)',35]],
};
/* ★ B7/G-94(§4-5): 회색코인 6품목 상점은 폐지되고 '재료상점'은 루비 결제 MATSHOP 으로,
   회색코인 품목군은 길드코인 GUILDSHOP 으로 흡수되었다. 데이터 자체는 참고용으로 보존한다.
   (회색코인 S.gray 의 신규 소비처 배선은 B8 길드/약탈 정산과 함께 재검토 — notesForNext 참조)
   ★ A3-1: 회색코인 획득 경로는 원작 규칙대로 3곳으로 한정한다 —
     ① 길드 레이드(enterGuildRaid 보상) ② 약탈(raid 모달 보상) ③ 길드 기여 = 점령전(conquest 보상).
     전투 드랍(onKill)·월드보스 보상 경로는 제거했다. 근거: UI재현카탈로그 '길드 상점' 절
     "코인은 길드 레이드/약탈/기여로만 충전(상점 구매 불가)".
     예외로 7일 출석(ATTEND_DAYS 6일차 '회색코인 X20')만 남긴다 — 원작 출석표 캡처에서 확인된 지급이고,
     같은 절이 '길드 참여(레이드/약탈/출석)'를 회색코인 활동군으로 함께 묶고 있다. */
const GRAYSHOP = [
  { t:'강화석 10개',        ic:'🪨', cost:5,    give:()=>{ S.stones+=10; } },
  { t:'희귀 재료 1개',      ic:'🟦', cost:20,   give:()=>{ matGainGrade('R',1); } },
  { t:'영웅 재료 1개',      ic:'🟪', cost:35,   give:()=>{ matGainGrade('E',1); } },
  { t:'레전더리 재료 1개',  ic:'🟨', cost:90,   give:()=>{ matGainGrade('L',1); } },
  { t:'영웅 소환권(고급) 1장', ic:'🎟️', cost:300,  give:()=>{ S.tickHero+=1; } },
  { t:'한정 코스튬(스탯효과)', ic:'👘', cost:1500, give:()=>{ S.costumes+=1; } },
  /* ★ v5.6: 하락 방지권은 초기 10개만 주고 재보급 경로가 0 이었다 —
     다 쓰면 '강화 실패 시 단계 하락'을 막을 방법이 영구히 사라졌다. 여기서 보급한다. */
  { t:'하락 방지권 3개',    ic:'🔮', cost:60,   give:()=>{ S.wards=(S.wards||0)+3; } },
  /* ★ v5.8: 획득처가 0 이던 재화들의 무과금 보급선.
     고급 소환권 3종·몬스터 소환권은 소환 화면에 상시 노출되는데 평생 0 이었고,
     영웅 기록서는 유료 패키지로만 들어와 결제 유저조차 쓸 데가 없었다. */
  { t:'몬스터 소환권 3장',   ic:'👹', cost:80,   give:()=>{ S.tickMon=(S.tickMon||0)+3; } },
  { t:'영웅 소환권+ 1장',    ic:'📜', cost:400,  give:()=>{ S.tickHeroP=(S.tickHeroP||0)+1; } },
  { t:'재료 소환권+ 1장',    ic:'🧰', cost:220,  give:()=>{ S.tickMatP=(S.tickMatP||0)+1; } },
  { t:'몬스터 소환권+ 1장',  ic:'🩸', cost:300,  give:()=>{ S.tickMonP=(S.tickMonP||0)+1; } },
  { t:'영웅 기록서 1권',     ic:'📕', cost:900,  give:()=>{ S.records=(S.records||0)+1; } },
];

/* ★ B7/G-99: 루비 충전 4단계 (기존 5단계 중 1500/24,000원 삭제) */
const RUBYPACKS = [
  { ruby:300,  won:'5,500원' },  { ruby:650,  won:'11,000원' },
  { ruby:2800, won:'44,000원' }, { ruby:7500, won:'119,000원' },
];
/* '매월 루비 2배' 프로모 4행 — 동일 가격, 지급량 2배 상당 */
const RUBYPROMO = [
  { ruby:600,  won:'5,500원' },  { ruby:1300, won:'11,000원' },
  { ruby:5600, won:'44,000원' }, { ruby:15000, won:'119,000원' },
];
const RUBY_NOTICE = '청약 철회는 구매일로부터 7일 이내 가능합니다 [일부 사용 및 환수가 안되는 시점시 불가]';

/* ★ B7/G-93: 골드상점 7항목 = 골드 결제 5 + 루비 환전 2 */
const GOLDSHOP = [
  { t:'영웅 소환서 X10',   ic:'📜', cur:'gold', cost:15000000, give:()=>{ S.tickHero+=10; } },
  { t:'재료 열쇠 X10',     ic:'🗝️', cur:'gold', cost:15000000, give:()=>{ S.tickMat+=10; } },
  { t:'망치 X10',          ic:'🔨', cur:'gold', cost:15000000, give:()=>{ S.hammerN=(S.hammerN||0)+10; } },
  { t:'전설 망치 X10',     ic:'🔨', cur:'gold', cost:40000000, give:()=>{ S.hammers=(S.hammers||0)+10; } },
  { t:'투기장 입장권 X1',  ic:'🎫', cur:'gold', cost:5000000,  give:()=>{ S.ticket=Math.min(30,S.ticket+1); } },
  { t:'골드 10,000,000',   ic:'🪙', cur:'ruby', cost:300,  give:()=>{ addGold(10000000); } },
  { t:'골드 200,000,000 + 전설 망치 20', ic:'🪙', cur:'ruby', cost:2800, give:()=>{ addGold(200000000); S.hammers=(S.hammers||0)+20; } },
];
const GOLD_CAP_NOTICE = '골드 최대 보유량은 3,000,000,000입니다 [보유량을 넘어갈 시 최대 보유량으로 제한됩니다]';

/* ★ B7/G-94: 재료상점 — 9종 × (1개 / 5개) = 18항목, 루비 결제 */
const MATSHOP = [
  { k:'흑염석',        p1:600, p5:2800 },
  { k:'녹옥정',        p1:900, p5:4500 },
  { k:'봉인석',        p1:900, p5:4500 },
  { k:'청연석',        p1:900, p5:4500 },
  { k:'차원석',        p1:900, p5:4500 },
  { k:'마력핵',        p1:900, p5:4500 },
  { k:'성수',          p1:900, p5:4500 },
  { k:'최상급 마법서', p1:700, p5:3400 },
  { k:'용접기',        p1:600, p5:2800 },
];

/* ★ B7/G-95: 길드상점 11항목 (길드코인 S.guildCoin) */
const GUILDSHOP = [
  { t:'주사위 X300',            ic:'🎲', cost:5000, give:()=>{ S.dice+=300; } },
  { t:'대장장이의 눈물 X20',    ic:'💠', cost:3500, give:()=>{ matGain('대장장이의 눈물',20); } },
  { t:'흑염석 X1',              ic:'🪨', cost:400,  give:()=>{ matGain('흑염석',1); } },
  { t:'흑염석 X5',              ic:'🪨', cost:2000, give:()=>{ matGain('흑염석',5); } },
  { t:'영웅 소환서 X20',        ic:'📜', cost:200,  give:()=>{ S.tickHero+=20; } },
  { t:'재료 열쇠 X40',          ic:'🗝️', cost:200,  give:()=>{ S.tickMat+=40; } },
  { t:'망치 X20',               ic:'🔨', cost:200,  give:()=>{ S.hammerN=(S.hammerN||0)+20; } },
  { t:'전설 망치 X20',          ic:'🔨', cost:600,  give:()=>{ S.hammers=(S.hammers||0)+20; } },
  { t:'주사위 X10',             ic:'🎲', cost:200,  give:()=>{ S.dice+=10; } },
  { t:'곡식 X20',               ic:'🌾', cost:200,  give:()=>{ S.grain=(S.grain||0)+20; } },
  { t:'나무 묶음 X20',          ic:'🪵', cost:200,  give:()=>{ S.wood=(S.wood||0)+20; } },
];

/* ★ B7/G-96: 추천(광고) 탭 — 2슬롯 로테이션 풀 6종 */
const ADPOOL = [
  { t:'영웅 소환서 X3',      ic:'📜', give:()=>{ S.tickHero+=3; } },
  { t:'골드던전 입장권 X1',  ic:'🎟️', give:()=>{ S.goldTicket=(S.goldTicket||0)+1; } },
  { t:'투기장 입장권 X1',    ic:'🎫', give:()=>{ S.ticket=Math.min(30,S.ticket+1); } },
  { t:'재료 열쇠 X3',        ic:'🗝️', give:()=>{ S.tickMat+=3; } },
  { t:'망치 X3',             ic:'🔨', give:()=>{ S.hammerN=(S.hammerN||0)+3; } },
  { t:'골드 X500,000',       ic:'🪙', give:()=>{ addGold(500000); } },
];

/* ★ B7/G-100: 버프 상점 6항목 (루비) */
const BUFFSHOP = [
  { t:'골드 수급 +100% (30일)', ic:'💰', cost:600,  kind:'sub',  key:'goldUntil' },
  { t:'경험치 +100% (30일)',    ic:'📈', cost:600,  kind:'sub',  key:'expUntil' },
  { t:'제작 시간 -50% (30일)',  ic:'⏱️', cost:1000, kind:'sub',  key:'craftUntil' },
  { t:'광고 제거 (영구)',       ic:'🚫', cost:600,  kind:'perm', key:'adFree' },
  { t:'마을회관 500LV (영구)',  ic:'🏛️', cost:7500, kind:'lv',   key:'villHall' },
  { t:'훈련소 500LV (영구)',    ic:'🏋️', cost:7500, kind:'lv',   key:'villTrain' },
];

/* ★ B7/G-97: 기타(패키지) 탭 루비 21항목 — 대형3 / 소량8 / 대량10 */
const RUBYPKG = [
  // 대형 3
  { grp:'대형', t:'소환 패키지',      ic:'🎁', cost:3200,  d:'재료 열쇠 X800 + 영웅 소환서 X800', give:()=>{ S.tickMat+=800; S.tickHero+=800; } },
  { grp:'대형', t:'강화 패키지',      ic:'⚒️', cost:3800,  d:'망치 X100 + 전설 망치 X100',        give:()=>{ S.hammerN=(S.hammerN||0)+100; S.hammers=(S.hammers||0)+100; } },
  { grp:'대형', t:'강화 패키지 II',   ic:'⚒️', cost:35000, d:'망치 X1000 + 전설 망치 X1000',      give:()=>{ S.hammerN=(S.hammerN||0)+1000; S.hammers=(S.hammers||0)+1000; } },
  // 소량 8
  { grp:'소량', t:'재료 열쇠 X80',        ic:'🗝️', cost:300,  d:'재료 소환권 80장',    give:()=>{ S.tickMat+=80; } },
  { grp:'소량', t:'영웅 소환서 X80',      ic:'📜', cost:300,  d:'영웅 소환권 80장',    give:()=>{ S.tickHero+=80; } },
  { grp:'소량', t:'망치 X20',             ic:'🔨', cost:300,  d:'일반 망치 20개',      give:()=>{ S.hammerN=(S.hammerN||0)+20; } },
  { grp:'소량', t:'전설 망치 X20',        ic:'🔨', cost:900,  d:'전설 망치 20개',      give:()=>{ S.hammers=(S.hammers||0)+20; } },
  { grp:'소량', t:'즉시 완성권 X20',      ic:'📃', cost:300,  d:'제작 즉시완성 20회분', give:()=>{ S.craftScroll+=20; } },
  { grp:'소량', t:'골드던전 입장권 X10',  ic:'🎟️', cost:300,  d:'골드던전 10회',       give:()=>{ S.goldTicket=(S.goldTicket||0)+10; } },
  { grp:'소량', t:'주사위 X10',           ic:'🎲', cost:300,  d:'주사위 10개',         give:()=>{ S.dice+=10; } },
  { grp:'소량', t:'대장장이의 눈물 X40',  ic:'💠', cost:2800, d:'영웅 등급 재료 40개', give:()=>{ matGain('대장장이의 눈물',40); } },
  // 대량 10
  { grp:'대량', t:'재료 열쇠 X800',       ic:'🗝️', cost:2800,  d:'재료 소환권 800장',   give:()=>{ S.tickMat+=800; } },
  { grp:'대량', t:'영웅 소환서 X800',     ic:'📜', cost:2800,  d:'영웅 소환권 800장',   give:()=>{ S.tickHero+=800; } },
  { grp:'대량', t:'망치 X200',            ic:'🔨', cost:2800,  d:'일반 망치 200개',     give:()=>{ S.hammerN=(S.hammerN||0)+200; } },
  { grp:'대량', t:'전설 망치 X200',       ic:'🔨', cost:7000,  d:'전설 망치 200개',     give:()=>{ S.hammers=(S.hammers||0)+200; } },
  { grp:'대량', t:'즉시 완성권 X200',     ic:'📃', cost:2800,  d:'제작 즉시완성 200회분', give:()=>{ S.craftScroll+=200; } },
  { grp:'대량', t:'골드던전 입장권 X30',  ic:'🎟️', cost:900,   d:'골드던전 30회',       give:()=>{ S.goldTicket=(S.goldTicket||0)+30; } },
  { grp:'대량', t:'곡식 X8000',           ic:'🌾', cost:7500,  d:'마을 성장 자원',      give:()=>{ S.grain=(S.grain||0)+8000; } },
  { grp:'대량', t:'나무 묶음 X8000',      ic:'🪵', cost:7500,  d:'마을 성장 자원',      give:()=>{ S.wood=(S.wood||0)+8000; } },
  { grp:'대량', t:'주사위 X100',          ic:'🎲', cost:2800,  d:'주사위 100개',        give:()=>{ S.dice+=100; } },
  { grp:'대량', t:'주사위 X1000',         ic:'🎲', cost:25000, d:'주사위 1000개',       give:()=>{ S.dice+=1000; } },
];

/* ★ B7/G-98: 스타터 패키지 6카드 (루비) — 채굴 2 / 장비 2 / 고급 2 */
const STARTERPKG = [
  { id:'sp_cert',  grp:'채굴', t:'자격증 패키지', ic:'⛏️', cost:14000, d:'오래된 곡괭이 X1 + 주사위 X100 + 칭호 [견습 광부증]',
    give:()=>{ S.picks.old=true; S.dice+=100; S.titleOwn['minecert']=true; } },
  { id:'sp_labor', grp:'채굴', t:'노동자 패키지', ic:'⛏️', cost:30000, d:'찬란한 곡괭이 X1 + 칭호 [숙련 광부]',
    give:()=>{ S.picks.shine=true; S.titleOwn['laborer']=true; } },
  { id:'sp_eqa',   grp:'장비', t:'중급 장비 패키지 A', ic:'🛡️', cost:2800, d:'희귀 무기 + 방패 + 투구',
    give:()=>{ S.equips.push({grade:'R',slot:'흑철 대검',enh:0,equipped:false},{grade:'R',slot:'방패',enh:0,equipped:false},{grade:'R',slot:'투구',enh:0,equipped:false}); } },
  { id:'sp_eqb',   grp:'장비', t:'중급 장비 패키지 B', ic:'🪄', cost:2800, d:'희귀 지팡이 세트 (지팡이 + 상의 + 하의)',
    give:()=>{ S.equips.push({grade:'R',slot:'비전 지팡이',enh:0,equipped:false},{grade:'R',slot:'상의',enh:0,equipped:false},{grade:'R',slot:'하의',enh:0,equipped:false}); } },
  { id:'sp_wand',  grp:'고급', t:'용암 완드', ic:'🔥', cost:14000, d:'레전더리 지팡이 1종',
    give:()=>{ S.equips.push({grade:'L',slot:'용암 완드',enh:0,equipped:false}); } },
  { id:'sp_sword', grp:'고급', t:'용암 소드', ic:'🗡️', cost:14000, d:'레전더리 대검 1종',
    give:()=>{ S.equips.push({grade:'L',slot:'용암 소드',enh:0,equipped:false}); } },
];

/* ★ B7/G-104: 패키지 모달 5카드 — 전 카드 '계정당 1회 구매 가능' */
const ACCOUNT_PACKS = [
  { id:'ap_gift',   t:'한정 선물',      ic:'🎁', cost:0,    items:[['📜','영웅 소환서 X200'],['📕','기록서 X1'],['🔨','전설 망치 X10'],['🎲','주사위 X100']],
    give:()=>{ S.tickHero+=200; S.records=(S.records||0)+1; S.hammers=(S.hammers||0)+10; S.dice+=100; } },
  /* ★ B7/F1: 개별 영웅 확정구매 카드 2장 — 원작 재판독이 지목한 실제 위치(상점 탭바 밖의 '한정 패키지' 팝업)이며
     삽입 위치도 재판독대로 '한정 선물' 바로 다음 · '한정 패키지 I' 앞. 각 3,400루비 · 계정당 1회 ·
     구성(조각 X600 + 주사위 X300 + 전설 망치 X40) 동일. 대상 영웅은 HERO_ROSTER 정본 명칭을 쓰고,
     조각은 S.heroShards(영웅 전용)로 지급한다. */
  { id:'ap_hero027', t:HERO_BY_ID.HERO_007.name+' 패키지', ic:'❄️', cost:3400,
    items:[['❄️',HERO_BY_ID.HERO_007.name+' 조각 X600'],['🎲','주사위 X300'],['🔨','전설 망치 X40']],
    give:()=>{ heroShardAdd('HERO_007',600); S.dice+=300; S.hammers=(S.hammers||0)+40; } },
  { id:'ap_hero029', t:HERO_BY_ID.HERO_009.name+' 패키지', ic:'🌑', cost:3400,
    items:[['🌑',HERO_BY_ID.HERO_009.name+' 조각 X600'],['🎲','주사위 X300'],['🔨','전설 망치 X40']],
    give:()=>{ heroShardAdd('HERO_009',600); S.dice+=300; S.hammers=(S.hammers||0)+40; } },
  { id:'ap_ltd1',   t:'한정 패키지 I',   ic:'📦', cost:3400, items:[['📘','최상급 마법서 X5'],['🎲','주사위 X500'],['📕','기록서 X3'],['💠','대장장이의 눈물 X20']],
    give:()=>{ matGain('최상급 마법서',5); S.dice+=500; S.records=(S.records||0)+3; matGain('대장장이의 눈물',20); } },
  { id:'ap_ltd2',   t:'한정 패키지 II',  ic:'📦', cost:7500, items:[['📘','최상급 마법서 X15'],['📕','기록서 X12'],['💠','대장장이의 눈물 X40'],['🎲','주사위 X500']],
    give:()=>{ matGain('최상급 마법서',15); S.records=(S.records||0)+12; matGain('대장장이의 눈물',40); S.dice+=500; } },
];
/* ★ v5.56: 도감 몬스터 — HUNT_TIERS 정의 후에 초기화됨 (아래 initMonsters). */
let MONSTERS = [];
// ★ 코어 파밍 루프 — 사냥 대상(홈 필드 스폰)을 플레이어가 직접 선택한다.
//   몬스터별 드랍 재료가 고정되어 있고, 다음 등급 장비의 재료는 더 강한 다음 몬스터가 떨군다.
//   준비 없이 강한 몬스터를 선택하면 부대가 맞아 죽는다(전멸 → 자동 후퇴).
/* ★ B4/G-61: 등급 탭 4개(일반 0-1 / 희귀 2-3 / 영웅 4-5 / 레전더리 6-7)로 필터한다.
   각 행에 `레벨 : N` 과 직업 라벨을 노출하기 위해 level·job 필드를 추가했다. */
/* ★ v4.7: 원작 몬스터 도감은 **등급 탭 4개 × 각 30마리 = 120종**이다.
   근거: 05_영웅_소환_성장/몬스터 단계별 소환목록 5장 — 일반·희귀·영웅·레전더리 헤더가 전부 `30마리`.
   종전 구현은 등급당 2마리(총 8종)뿐이었다. 이전 감사가 "등급 탭 4개"라는 구조만 기록하고
   화면에 적힌 숫자를 세지 않아 놓친 건이다.

   원작 구조에서 읽어낸 것:
     · 레벨 = 등급 단계 (일반1 · 희귀2 · 영웅3 · 레전더리4) — 같은 탭 안에서는 레벨이 전부 같다
     · 같은 등급 5종은 난이도 사다리가 아니라 **드랍 재료가 서로 다른 변종**이다
     · 드랍 아이콘 칸 수가 등급마다 늘어난다 (일반3 · 희귀3 · 영웅4 · 레전더리6)
   즉 플레이어는 "지금 필요한 재료를 주는 몬스터"를 골라 사냥한다.
   전투력 사다리는 등급 안에서 완만하게만 오르게 두어 기존 성장 곡선을 유지한다.
   ★ v5.9 정정 — 원작 실측(전량판독·UI카탈로그): 등급당 ~5종(고유명), "30마리"는 마릿수 선택기.
     종전 pre×base 조합의 등급당 30종(총 120종)은 "30마리"를 도감 종 수로 오독한 것이었다.
     등급당 5종(총 20종) 고유명으로 축소. 명칭은 화신 세계관 오리지널 조어(타사 IP 미사용).
     각 몬스터는 5직업에 1:1 대응하고 고정 드랍 재료 1종을 갖는다. */
/* ★ v5.25: 몬스터 스프라이트 — 2D Pixel-RPGMonstersIcon 에셋 매핑.
   각 몬스터 이름의 분위기(해골/짐승/동굴/얼음/악마 등)와
   에셋 카테고리·색상을 교차 매칭. img 필드 = assets/monsters/<파일명>. */
const MON_WORDS = {
  N:{ c:'#8a9a6a', lv:1, slots:3, cp0:0,    cp1:900,    job:['earth','shadow','flame','wind','frost'],
      list:['잿빛해골','잿가루임프','불씨박쥐','재들개','녹슨거미'],
      imgs:['undead_102','devil_703','cave_603','field_504','jungle_203'] },
  R:{ c:'#5aa8d8', lv:2, slots:3, cp0:1200, cp1:3600,   job:['frost','earth','shadow','flame','wind'],
      list:['서리기사','돌골렘','그림자암살자','화염늑대','질풍매'],
      imgs:['ice_806','cave_611','devil_711','field_503','forest_401'] },
  E:{ c:'#d8622e', lv:3, slots:4, cp0:4200, cp1:9000,   job:['flame','shadow','wind','frost','earth'],
      list:['용암거인','심연마수','폭풍날개','빙결흡혈귀','석화사제'],
      imgs:['cave_612','devil_704','sea_309','ice_811','undead_112'] },
  L:{ c:'#a05ad0', lv:4, slots:6, cp0:11000,cp1:24000,  job:['flame','earth','frost','shadow','wind'],
      list:['겁화의화룡','태고의암석거인','영원의빙결정령','무명의그림자','천공의수호자'],
      imgs:['devil_712','forest_412','ice_812','devil_709','sea_312'] },
};
const HUNT_TIERS = (()=>{
  const out=[], SUB={N:null,R:'N',E:'R',L:'E'};
  GORDER.forEach(g=>{
    const w=MON_WORDS[g], pool=MAT_BY_GRADE[g], sub=SUB[g], subPool=sub?MAT_BY_GRADE[sub]:[];
    const SHAPES=['skull','wisp','beast','golem','beast'];   // 등급 내 5종의 외형
    w.list.forEach((nm,bi)=>{
      const n=out.filter(t=>t.drop===g).length;               // 등급 내 인덱스
      const f=w.list.length<=1 ? 0 : n/(w.list.length-1);     // 0..1 등급 내 진행도
      const cp=Math.round(w.cp0+(w.cp1-w.cp0)*f);
      const mat=pool[n%pool.length].k;                        // 고정 드랍 재료 (5종 → 6종 풀 순환)
      const drops=[mat];
      while(drops.length<w.slots){                           // 드랍 아이콘 칸 채우기
        const k=(drops.length<=2||!subPool.length)
          ? pool[(n+drops.length)%pool.length].k
          : subPool[(n+drops.length)%subPool.length].k;
        drops.push(k);
      }
      out.push({ n:nm, c:w.c, shape:SHAPES[bi%SHAPES.length],
        img:(w.imgs&&w.imgs[bi])||null,   // ★ v5.25: 몬스터 스프라이트
        cp, hp:Math.round(80+cp*0.22), gold:Math.round(260+cp*1.05),
        drop:g, sub, level:w.lv, job:w.job[bi%w.job.length], mat, drops });
    });
  });
  return out;
})();
// 구세이브 이관 — 종전 8단계 인덱스를 새 20종(등급당 5종) 위치로 옮긴다(등급·상대 진행도 보존)
// ★ v5.9: 120종→20종 축소. 등급당 5종이므로 경계는 0/5/10/15, 중간은 2/7/12/17.
const HUNT_MIGRATE_V47 = [0, 2, 5, 7, 10, 12, 15, 17];
MONSTERS = HUNT_TIERS.map(t=>t.n);  /* v5.56: HUNT_TIERS 정의 후 도감 초기화 */
/* ★ v4.7: 마을회관·훈련소 레벨당 버프. 원작 실측 Lv3=0.6% / Lv5=1.0% → 레벨당 +0.2%p.
   종전 상수 0.05%p 는 4배 낮았다(파일 상단 주석의 '+0.05%p/Lv' 도 오답). */
const VILL_BUFF_PP = 0.2;
/* ★ B5/G-69: 보스 소환 7종 (등급 배분 R×2 / E×3 / L×2).
   원작 구조 — 카드마다 2행×3열(6칸) 요구 재료 그리드가 있고, 일일 횟수 제한 대신
   재료를 실제로 차감한다(§4-7 판정). mats 는 6칸 고정 배열이며 null 은 공란이다. */
const BOSS_TYPES = [
  { id:'bone',   n:'백골군주',    ic:'💀', img:'undead_110', g:'R', c:'#8fa3b8', foe:1400,
    mats:[['흑염석',20],['봉인석',12],['무쇠조각',10],null,null,null],
    drop:()=>{ matGainGrade('R',ri(2,4)); matGain('차원석',ri(1,2)); } },
  { id:'beast',  n:'광란야수',    ic:'🐺', img:'jungle_210', g:'R', c:'#c07a4a', foe:1900,
    mats:[['잿가루',20],['녹옥정',12],['은사슬',6],['청연석',8],null,null],
    drop:()=>{ matGainGrade('R',ri(2,4)); matGain('마력핵',ri(1,2)); } },
  { id:'stone',  n:'석귀',        ic:'🗿', img:'cave_609', g:'E', c:'#9a8f7a', foe:4600,
    mats:[['무쇠조각',30],['용접기',10],['성수',8],['차원석',8],['심연광석',2],null],
    drop:()=>{ matGainGrade('E',ri(1,3)); matGain('심연광석',ri(1,2)); } },
  { id:'fallen', n:'몰락기사',    ic:'⚔️', img:'undead_111', g:'E', c:'#b0483c', foe:5800,
    mats:[['봉인석',30],['은사슬',12],['서리결정',10],['마력핵',8],['영혼석',2],null],
    drop:()=>{ matGainGrade('E',ri(1,3)); matGain('영혼석',ri(1,2)); } },
  { id:'reaper', n:'그림자 사신', ic:'🌑', img:'devil_708', g:'E', c:'#8a5ad0', foe:7200,
    mats:[['잿가루',30],['차원석',14],['성수',10],['영혼석',4],['천공수정',2],['불멸의 뿌리',2]],
    drop:()=>{ matGainGrade('E',ri(2,4)); matGain('천공수정',ri(1,2)); } },
  { id:'night',  n:'몽마',        ic:'🦇', img:'cave_607', g:'L', c:'#c05ad0', foe:12000,
    mats:[['최상급 마법서',6],['영혼석',10],['심연광석',10],['천공수정',6],['성좌파편',2],null],
    drop:()=>{ matGainGrade('L',1); matGain('성좌파편',1); } },
  { id:'titan',  n:'수호거상',    ic:'🛡️', img:'field_512', g:'L', c:'#e8a13a', foe:16000,
    mats:[['대장장이의 눈물',6],['불멸의 뿌리',10],['천공수정',10],['금강석',3],['용의 비늘',2],['무명의 각인',2]],
    drop:()=>{ matGainGrade('L',1); matGain('용의 비늘',1); } },
];
/* ★ B5/G-64·G-63: 요일던전 — 요일당 모드 1종만 열린다(반대 모드는 잠금).
   월(0)/수(2)/금(4)=섬멸 · 화(1)/목(3)/토(5)/일(6)=생존. rq = 요일별 보상 미리보기 수량. */
const DD_DAYS  = ['월','화','수','목','금','토','일'];
const DD_ELM   = ['불','얼음','대지','그림자','바람','랜덤','랜덤'];
const DD_EIC   = ['🔥','❄️','🪨','🌑','🏹','✨','✨'];
const DD_MODE  = ['섬멸','생존','섬멸','생존','섬멸','생존','생존'];
const DD_RQ    = [40,40,30,40,15,15,4];
/* ★ B5/G-67·G-68 (v4.1 A1-1): 골드던전 5단계 — 원작 실측 확정.
   지급 50만 / 150만 / 500만 / 1000만 / 1500만, 요구 재료 1/1/3/4/5개 소비.
   근거: docs/reference/기능별/06_스테이지_던전/캡처_2026_07_22_06_40_08_482.png
        (4단계·5단계 카드 동시 노출 — 5단계 "15,000,000 골드" + 재료 5, 4단계 재료 4)
   ※ 종전 5단계 20,000,000 / 재료 6은 §5-5 잠정 추정값이었다 → 폐기. */
const GOLD_DUNGEON = [
  { lv:1, gold:500000,    foe:350,  mat:'무쇠조각', need:1 },
  { lv:2, gold:1500000,   foe:1000, mat:'무쇠조각', need:1 },
  { lv:3, gold:5000000,   foe:2300, mat:'용접기',   need:3 },
  { lv:4, gold:10000000,  foe:4800, mat:'심연광석', need:4 },
  { lv:5, gold:15000000,  foe:9000, mat:'금강석',   need:5 },
];
/* ★ B5/G-70: 월드보스 서버 랭킹 — 원작은 스크롤되는 대형 랭킹표(길드태그 컬럼 포함).
   29명 고정 데이터 + 내 기록 1행 = 30행. */
const WB_RANK = [
  ['불철','화신단',1288400],['무쇠손','철혈',940200],['청염','화신단',862300],['잿불','잿더미',781500],
  ['대장장이K','철혈',742100],['로엔','새벽단',701800],['서리검','서리맹',668400],['재의노래','잿더미',640900],
  ['강철심','철혈',612500],['불꽃술사','화신단',588200],['흑야','그림자',561700],['백랑','새벽단',540300],
  ['적묘','잿더미',519800],['현무','서리맹',498600],['월광','그림자',477200],['풍백','새벽단',455900],
  ['운해','화신단',434100],['묵검','철혈',412700],['설야','서리맹',391300],['홍련','잿더미',369800],
  ['천추','그림자',348400],['벽라','새벽단',327000],['금강','철혈',305600],['자하','화신단',284200],
  ['소야','서리맹',262800],['백호','그림자',241400],['남풍','새벽단',220000],['철벽','철혈',198600],
  ['여명','잿더미',177200],
  ['무쇠뿔','서리맹',412800],['잔불','잿더미',398400],['설한','서리맹',381900],['쇳물','철혈',366200],
  ['검은재','그림자',352700],['불씨','화신단',339100],['달그림자','그림자',326500],['모루손','철혈',313800],
  ['새벽별','새벽단',301200],['하늬','서리맹',289600],
];
/* ★ B5/G-73: 시련의 탑 랭킹 — 정렬 기준이 누적 데미지가 아니라 '도달 웨이브'다. */
const TW_RANK = [
  ['불철','화신단',312],['무쇠손','철혈',298],['청염','화신단',285],['잿불','잿더미',271],
  ['대장장이K','철혈',264],['로엔','새벽단',252],['서리검','서리맹',241],['재의노래','잿더미',233],
  ['강철심','철혈',225],['불꽃술사','화신단',216],['흑야','그림자',208],['백랑','새벽단',199],
  ['적묘','잿더미',191],['현무','서리맹',183],['월광','그림자',176],['풍백','새벽단',168],
  ['운해','화신단',160],['묵검','철혈',153],['설야','서리맹',146],['홍련','잿더미',138],
  ['천추','그림자',131],['벽라','새벽단',124],['금강','철혈',117],['자하','화신단',110],
  ['소야','서리맹',102],['백호','그림자',95],['남풍','새벽단',88],['철벽','철혈',80],
  ['여명','잿더미',73],
];
/* ★ v4.8: 월드보스 랭킹 보상 9행 (매월 1일 초기화).
   근거: 06_스테이지_던전/월드보스/캡처_2026_07_30_13_52_05_233.png — 대표가 [i] 를 눌러 촬영해 주셨다.
   ※ 이전 결론 정정: 20260728 재수색 때 "월드보스에는 순위별 차등 보상표가 없다"고 확정했는데
     틀렸다. 그때는 [i] 를 누른 캡처가 한 장도 없어 '없다'고 단정한 것이었다.
     우리가 지급하던 '전투 보상 X2' 는 이 표의 맨 아래 '참가 보상' 한 줄에 불과했다. */
const WB_REWARD = [
  ['1위','X 30'],['2위','X 25'],['3위','X 20'],['4~6위','X 15'],['7~10위','X 10'],
  ['11~20위','X 8'],['21~30위','X 6'],['31~40위','X 4'],['참가 보상','X 2'],
];
/* ★ B5/G-78: 시련의 탑 랭킹 보상 9행 (매월 15일 초기화) */
const TOWER_REWARD = [
  ['1위','X2000'],['2위','X1600'],['3위','X1400'],['4~6위','X1200'],['7~10위','X1000'],
  ['11~20위','X800'],['21~30위','X600'],['31~40위','X400'],['참가보상','X50'],
];
/* ★ B9/G-117 · F2 재판독 반영: 칭호 29종 (N5 / R9 / E6 / L8 / GM1) — 착용 시 버프.
   grade 는 장비 등급(GRADES)과 별개 팔레트(TITLE_GRADES)를 쓴다.
   have() = 획득 판정. 상점·패키지 지급분은 S.titleOwn[id] 로도 소유된다(B7 연계).
   ※ id 는 세이브(S.title·S.titleOwn)와 상점 패키지가 참조하므로 절대 바꾸지 말 것.
     이름·효과·조건만 원작 재판독 구조에 맞춰 교체했다(배열 순서 = 원작 목록 순서 1~29).

   [F2 교정 요지 — 원작 효과 축은 5종뿐이다]
     ① 몬스터 골드 획득량 +X%   ② 몬스터 경험치 획득량 +X%
     ③ 제작 시간 -X%            ④ 제작 확률 +X%p            ⑤ 채굴 권한(수치 없는 해금)
     기존 구현의 '드랍률/공격속도/이동속도/모든 스탯' 류는 원작에 없는 창작이라 전부 제거했다.
   [계단 규칙] 제작 계열 칭호는 두 축의 계단형 구조다 —
     실패 스트릭 5(R,-5%) → 7(E,-10%) → 10(E,-10%) → 15(L,-20%)
     성공 스트릭 5(R,+2%p) → 10(E,+5%p) → 15(L,+7%p)   (성공 축은 '영웅등급 이상' 제작만 집계)
   [e] = 게임 로직에 물리는 효과 데이터. titleEff()/titleGoldMul() 등 헬퍼만 이 필드를 읽는다.
     gold=골드 배수 가산 · exp=경험치 배수 가산 · ctime=제작시간 가산(음수=단축)
     crate=제작확률 가산(%p) · mine=채굴 권한 · minedmg=채굴 피해 · spawn=몬스터 소환 수 증가 */
const TITLE_GRADES = {
  N: { n:'일반',      c:'#9aa0a6' },
  R: { n:'희귀',      c:'#3b82f6' },
  E: { n:'영웅',      c:'#e08a2b' },
  L: { n:'레전더리',  c:'#c0392b' },
  GM:{ n:'GM',        c:'#e8c040' },
};
// ★ N3: 원작 칭호 목록의 실제 노출 순서 — GM 1종이 영웅(E)과 레전더리(L) 사이에 끼어 있다(칭호창 13장 실측)
const TITLE_GORDER = ['N','R','E','GM','L'];
/* ★ F2: 월드챗 문구 칭호 4종 — 원작은 '특정 문구를 월드챗에 전송'하면 즉시 지급된다.
   문구는 화신 오리지널(원작 문구 음차 금지). 전송 판정은 chatTitleCheck() 가 한다. */
const CHAT_TITLE_WORDS = [
  { id:'lover',    key:'love',  words:['모두 사랑합니다','사랑합니다'] },
  { id:'kind',     key:'hello', words:['안녕하세요','안녕'] },
  { id:'wanderer', key:'cheer', words:['축하합니다','축하해'] },
  { id:'cat',      key:'meow',  words:['야옹'] },
];
// 특정 등급 영웅의 보유 수 (칭호 조건 '(등급) 영웅 N명 이상 보유')
function heroGradeOwnCount(g){
  try{ return HERO_ROSTER.filter(r=>r.grade===g && heroOwned(r.hero_id)).length; }catch(e){ return 0; }
}
function titleStat(k){ const v=S&&S.stats?S.stats[k]:0; return (typeof v==='number'&&isFinite(v))?v:0; }
const TITLES = [
  /* ---- N (5) — 원작 1~5 ---- */
  { id:'newbie',     g:'N',  n:'신참 대장장이', fx:'몬스터 골드 획득량 +10%', e:{gold:0.10},
    cond:'게임 최초 접속 시 자동 획득',                     have:()=>true },
  /* ⚠비전미확인 — 촬영대기 (N3 재판독에서도 미해결).
     칭호창 13장 전수 판독 결과 원작 조건 원문이 여전히 '초급자가 얻을 수 있는 호칭'이라는 순환 서술이라
     구체 트리거(레벨/횟수/진행도)를 특정할 근거가 없다. 효과(몬스터 골드 +10%)만 실측으로 확정됐다.
     조건은 기존 구현(몬스터 100마리)을 그대로 유지한다 — 근거가 생기기 전까지 바꾸지 않는다. */
  { id:'rookie',     g:'N',  n:'풀무질 초심자', fx:'몬스터 골드 획득량 +10%', e:{gold:0.10},
    cond:'⚠ 초반 진행 시 자동 획득 (데모: 몬스터 100마리 사냥)', have:()=>titleStat('kills')>=100 },
  /* 원작 확정 조건 = '일반 등급 영웅 **10명** 보유'(N3 칭호창 실측).
     화신 로스터의 N등급은 직업당 1명 = 총 5명이 상한이라 10명이 원천적으로 불가능 → 상한(전원 5명)으로 치환한다. */
  { id:'collector',  g:'N',  n:'재료 수집꾼',   fx:'몬스터 경험치 획득량 +10%', e:{exp:0.10},
    cond:'일반 등급 영웅 5명 전원 보유',                    have:()=>heroGradeOwnCount('N')>=5 },
  { id:'lover',      g:'N',  n:'다정한 대장장이', fx:'몬스터 골드 획득량 +10%', e:{gold:0.10},
    cond:'월드챗에 “모두 사랑합니다” 전송',                 have:()=>!!(S.stats&&S.stats.chat&&S.stats.chat.love) },
  { id:'kind',       g:'N',  n:'인사쟁이',     fx:'몬스터 골드 획득량 +10%', e:{gold:0.10},
    cond:'월드챗에 “안녕하세요” 전송',                      have:()=>!!(S.stats&&S.stats.chat&&S.stats.chat.hello) },
  /* ---- R (9) — 원작 6~14 ---- */
  { id:'clumsy',     g:'R',  n:'설익은 손',    fx:'제작 시간 -5%',        e:{ctime:-0.05},
    cond:'제작 5연속 실패',                                 have:()=>titleStat('craftFailBest')>=5 },
  // ★ N3: 원작 조건문에 '(해골 장비 제외)' 부기가 붙어 있다(숙련·행운·신의 손 3종 공통) → 문구·집계 양쪽 반영. isSkullGear() 참조
  { id:'skilled',    g:'R',  n:'숙달된 손',    fx:'제작 확률 +2%p',       e:{crate:0.02},
    cond:'영웅 등급 이상 장비 제작 5연속 성공 (해골 장비 제외)',  have:()=>titleStat('craftWinBest')>=5 },
  // 원작은 특정 최상위 보스 던전(원작 고유명사)을 지목 → 화신의 레전더리 보스 소환(몽마·수호거상) 클리어로 치환
  { id:'inter',      g:'R',  n:'중견 대장장이', fx:'몬스터 골드 획득량 +15%', e:{gold:0.15},
    cond:'레전더리 보스(몽마·수호거상) 처치',               have:()=>titleStat('bossTop')>=1 },
  { id:'instructor', g:'R',  n:'화로의 스승',  fx:'몬스터 경험치 획득량 +15%', e:{exp:0.15},
    cond:'레전더리 등급 영웅 1명 이상 보유',                have:()=>heroGradeOwnCount('L')>=1 },
  /* ⚠추정 — 원작 원문은 "필요 골드가 충족될 때까지 제작 버튼을 연속으로 누르면 획득"으로 **임계 횟수가 아예 없다**(N3 실측).
     UI 자체에 수치가 없어 판독으로 확정할 수 없으므로 데모는 5회를 잠정 임계로 둔다. */
  { id:'beggar',     g:'R',  n:'빈털터리',     fx:'몬스터 골드 획득량 +15%', e:{gold:0.15},
    cond:'골드가 모자란 상태로 제작 연속 시도 (데모 ⚠추정: 5회)', have:()=>titleStat('poorBest')>=5 },
  { id:'wanderer',   g:'R',  n:'마을 사람',    fx:'몬스터 골드 획득량 +15%', e:{gold:0.15},
    cond:'월드챗에 “축하합니다” 전송',                      have:()=>!!(S.stats&&S.stats.chat&&S.stats.chat.cheer) },
  /* ★ N1: 원작 조건 '주사위 누적 1,000개 소모'를 그대로 복원.
     종전에는 데모에 주사위 소모처가 0곳이라 '보유량 1,000'으로 대체 매핑돼 있었으나,
     장비 옵션 재설정(optionReroll)이 소비처로 신설되면서 누적 소모(S.rerollSpent)가 생겼다.
     이 1,000 이라는 값은 재설정 화면 상단 게이지의 '1000개 / 레전더리' 눈금과도 같은 축이다. */
  { id:'gambler',    g:'R',  n:'노름꾼',       fx:'몬스터 경험치 획득량 +15%', e:{exp:0.15},
    cond:'주사위 1,000개 누적 소모',                        have:()=>(S.rerollSpent||0)>=1000 },
  { id:'cat',        g:'R',  n:'고양이 집사',  fx:'몬스터 경험치 획득량 +10%', e:{exp:0.10},
    cond:'월드챗에 “야옹” 전송',                            have:()=>!!(S.stats&&S.stats.chat&&S.stats.chat.meow) },
  // 채굴 시스템은 데모에 없다 → e.mine 은 권한 플래그로만 보관(수치 효과 없음)
  { id:'minecert',   g:'R',  n:'견습 광부증',  fx:'채굴 권한 획득',       e:{mine:true},
    cond:'‘오래된 곡괭이’ 획득',                            have:()=>!!(S.picks&&S.picks.old) },
  /* ---- E (6) — 원작 15~20 ---- */
  { id:'loser',      g:'E',  n:'좌절한 손',    fx:'제작 시간 -10%',       e:{ctime:-0.10},
    cond:'제작 10연속 실패',                                have:()=>titleStat('craftFailBest')>=10 },
  { id:'lucky',      g:'E',  n:'행운의 인장',  fx:'제작 확률 +5%p',       e:{crate:0.05},
    cond:'영웅 등급 이상 장비 제작 10연속 성공 (해골 장비 제외)', have:()=>titleStat('craftWinBest')>=10 },
  { id:'smith',      g:'E',  n:'노련한 사냥꾼', fx:'몬스터 골드 획득량 +20%', e:{gold:0.20},
    cond:'요일던전 2단계 클리어',                           have:()=>titleStat('ddStage')>=2 },
  /* 원작 확정 조건 = '레전더리 등급 영웅 **6명 이상** 보유'(N3 칭호창 실측).
     화신 로스터의 L등급은 직업당 1명 = 총 5명이 상한이라 6명이 원천적으로 불가능 → 상한(전원 5명)으로 치환한다. */
  { id:'tactician',  g:'E',  n:'책략가',       fx:'몬스터 경험치 획득량 +20%', e:{exp:0.20},
    cond:'레전더리 등급 영웅 5명 전원 보유',                have:()=>heroGradeOwnCount('L')>=5 },
  { id:'dirthand',   g:'E',  n:'무딘 손',      fx:'제작 시간 -10%',       e:{ctime:-0.10},
    cond:'제작 7연속 실패',                                 have:()=>titleStat('craftFailBest')>=7 },
  { id:'vip',        g:'E',  n:'귀빈',         fx:'제작 확률 +5%p',       e:{crate:0.05},
    cond:'루비 상자 구매',                                  have:()=>titleStat('rubyBox')>=1 },
  /* ---- GM (1) — 원작 21 ----
     ★ N3: 원작 칭호 목록에서 이 카드는 **영웅(E)과 레전더리(L) 사이**에 끼어 있다(스크롤 13장 실측).
     등급 색상만으로는 경계가 애매했으나 등급별 개수(N5+R9+E6+GM1+L8=29) 검산으로 GM 칸임이 확정됐다.
     종전에는 목록 맨 끝(29번)에 두었는데 이는 원작 순서와 어긋나므로 여기로 옮겼다(TITLE_GORDER 도 함께 정정). */
  { id:'gmhelper',   g:'GM', n:'결정의 안내자', fx:'몬스터 골드 획득량 +20%', e:{gold:0.20},
    cond:'운영자(GM) 지급 전용 — 일반 플레이로는 획득 불가', have:()=>false },
  /* ---- L (8) — 원작 22~29 ---- */
  { id:'badhand',    g:'L',  n:'재앙을 부르는 손', fx:'제작 시간 -20%',   e:{ctime:-0.20},
    cond:'제작 15연속 실패',                                have:()=>titleStat('craftFailBest')>=15 },
  { id:'godhand',    g:'L',  n:'축복받은 손',  fx:'제작 확률 +7%p',       e:{crate:0.07},
    cond:'영웅 등급 이상 장비 제작 15연속 성공 (해골 장비 제외)', have:()=>titleStat('craftWinBest')>=15 },
  /* ⚠비전미확인 — 촬영대기 (N3 재판독에서도 미해결).
     칭호창 13장 중 이 카드가 걸린 프레임에서 조건 텍스트가 화면 하단으로 잘렸고, 다음 프레임은 이미 다음 카드로 넘어가
     조건 구간이 통째로 빠졌다. 효과(몬스터 경험치 +30%)만 확정. 조건은 기존 추정을 그대로 유지한다.
     필요 컷: '절대자' 등급 칭호 카드의 조건 줄이 온전히 보이는 스크롤 위치 1장. */
  { id:'champion',   g:'L',  n:'정점의 지배자', fx:'몬스터 경험치 획득량 +30%', e:{exp:0.30},
    cond:'⚠ 영웅 +20강화 2명 이상 달성 (추정 — 원작 조건 미판독)',
    have:()=>{ try{ return Object.keys(S.heroEnh||{}).filter(k=>(S.heroEnh[k]|0)>=20).length>=2; }catch(e){ return false; } } },
  { id:'ironhand',   g:'L',  n:'황금 대장장이', fx:'몬스터 골드 획득량 +30%', e:{gold:0.30},
    cond:'루비 75,000개 보유',                              have:()=>S.ruby>=75000 },
  { id:'laborer',    g:'L',  n:'숙련 광부',    fx:'채굴 권한 + 몬스터 골드 획득량 +15% + 채굴 피해 +100%', e:{mine:true, gold:0.15, minedmg:1.0},
    cond:'‘찬란한 곡괭이’ 획득',                            have:()=>!!(S.picks&&S.picks.shine) },
  /* ★ A2 정정 — 종전 '코스튬 8종 보유' 매핑은 오답이었다(원작 조건을 세트가 아닌 컬렉션으로 잘못 읽음).
     원작 원문 실측: docs/reference/기능별/10_퀘스트_업적_보상/캡처_2026_07_22_06_37_15_316.png
       · 효과 = "보유 시 몬스터 소환수 증가 효과 자동 적용"  · 조건 = "(세트명) 8세트 달성 시 획득"
     해당 세트는 3/6/8 3단계를 가진 유일한 세트 = 화신의 '작열'(SETS 주석 참조)이며,
     그 8세트 효과 "초당 몬스터 소환 마릿수 증가"와 이 칭호 효과가 정확히 같은 문구다.
     · own:true → 이 칭호만은 '착용'이 아니라 **보유만으로** 효과가 자동 적용된다(원문 명시). titleFlag() 참조.
     · 소환 마릿수 증가폭(%)은 원작 UI에도 수치가 없다 — 원작도 수치 미표기, 화신 자체 결정 필요.
       현행 +2마리(titleSpawnBonus)를 그대로 둔다. */
  { id:'lava',       g:'L',  n:'불씨의 벗',    fx:'보유 시 몬스터 소환 수 증가 효과 자동 적용', e:{spawn:true}, own:true,
    cond:'‘작열’ 세트 8세트 달성',
    have:()=>{ try{ return setPieceCount('작열')>=8; }catch(e){ return false; } } },
  { id:'pioneer',    g:'L',  n:'지혜의 대장장이', fx:'몬스터 골드 획득량 +20%', e:{gold:0.20},
    cond:'길드 랭킹 1위 — 최강 길드의 증명',
    have:()=>{ try{ return guildJoined() && guildTotalScore()>=GUILD_RANK[0][1]; }catch(e){ return false; } } },
  // 원작 27·28 은 조건·수치가 완전히 동일한 별개 칭호다(중복 지급). 구조를 그대로 재현한다.
  { id:'outlaw',     g:'L',  n:'그림자 상인',  fx:'몬스터 골드 획득량 +20%', e:{gold:0.20},
    cond:'길드 랭킹 1위 — 최강 길드의 증명',
    have:()=>{ try{ return guildJoined() && guildTotalScore()>=GUILD_RANK[0][1]; }catch(e){ return false; } } },
];
const TITLE_BY_ID = {}; TITLES.forEach(t=>TITLE_BY_ID[t.id]=t);
function titleGradeColor(g){ return (TITLE_GRADES[g]||TITLE_GRADES.N).c; }
// 소유 판정 — 조건 달성 또는 상점/패키지 지급(S.titleOwn)
function titleOwned(t){
  if(S && S.titleOwn && S.titleOwn[t.id]) return true;
  try{ return !!(t.have && t.have()); }catch(e){ return false; }
}
/* ★ F2: 착용 칭호 효과 — TITLES[].e 가 유일한 정본이고, 게임 로직은 아래 헬퍼만 읽는다.
   (칭호는 1개만 착용 가능하므로 합산 없이 착용분만 적용한다) */
function titleEff(k){
  const t = TITLE_BY_ID[(S&&S.title)||''];
  const v = t && t.e ? t.e[k] : 0;
  return (typeof v==='number' && isFinite(v)) ? v : 0;
}
/* ★ A2: `own:true` 칭호(현재 '불씨의 벗' 1종)는 착용하지 않아도 **보유만으로** 플래그 효과가 켜진다.
   원작 원문이 "보유 시 … 효과 자동 적용"이라 다른 칭호의 착용 방식과 명시적으로 구분된다.
   수치형 효과(titleEff)는 종전대로 착용분만 적용 — 원작에서 보유 적용이 확인된 것은 이 소환수 플래그뿐이다. */
function titleOwnFlag(k){
  return TITLES.some(t=> t.own && t.e && t.e[k] && titleOwned(t));
}
function titleFlag(k){ const t=TITLE_BY_ID[(S&&S.title)||'']; return !!(t && t.e && t.e[k]) || titleOwnFlag(k); }
function titleGoldMul(){ return 1 + titleEff('gold'); }            // 몬스터 골드 획득량
function titleExpMul(){ return 1 + titleEff('exp'); }              // 몬스터 경험치 획득량
function titleCraftRateAdd(){ return titleEff('crate'); }          // 제작 확률 가산(%p)
function titleCraftTimeMul(){ return Math.max(0.05, 1 + titleEff('ctime')); } // 제작 시간 배율
// '불씨의 벗' — 동시 등장 몬스터 +2 (보유만으로 적용). 증가폭은 원작도 수치 미표기 → 화신 자체 결정 필요.
function titleSpawnBonus(){ return titleFlag('spawn') ? 2 : 0; }
/* ★ F2: 월드챗 문구 전송 판정 — 최초 1회만 지급하고 토스트로 알린다. */
function chatTitleCheck(text){
  const t=String(text||''); if(!S) return;
  S.stats = S.stats||{}; S.stats.chat = S.stats.chat||{};
  CHAT_TITLE_WORDS.forEach(w=>{
    if(S.stats.chat[w.key]) return;
    if(!w.words.some(x=>t.indexOf(x)>=0)) return;
    S.stats.chat[w.key]=1;
    const ti=TITLE_BY_ID[w.id];
    if(ti){ toast(`칭호 [${ti.n}] 획득`); sysLog(`칭호 <b style="color:${titleGradeColor(ti.g)}">${ti.n}</b> 획득`); }
  });
}
/* ★ B9/G-120: 일일 미션 6행 (원작 순서). 보상은 전부 주사위 X n.
   noBtn=true 인 '보스 3번 도전'은 수령 버튼 없이 진행 텍스트만 노출한다. */
const DAILY_QUESTS = [
  { t:'로그인 하기',           cnt:()=>1,                          goal:1,    rw:20 },
  { t:'몬스터 500마리 사냥',   cnt:()=>S.stats.kills,              goal:500,  rw:15 },
  { t:'몬스터 3000마리 사냥',  cnt:()=>S.stats.kills,              goal:3000, rw:35 },
  { t:'몬스터 5000마리 사냥',  cnt:()=>S.stats.kills,              goal:5000, rw:10 },
  { t:'보스 3번 도전',         cnt:()=>S.stats.bossChallenges||0,  goal:3,    rw:3,  noBtn:true },
  { t:'재료 합성 2회',         cnt:()=>S.stats.synths||0,          goal:2,    rw:15 },
];
/* ★ B9/G-125: 7일 출석 보상 — 원작 수량 비율 40 : 40 : 150 : 10 : 50 : 20 : 250
   (7일차가 1일차의 6.25배인 잭팟 곡선) */
const ATTEND_DAYS = [
  ['강화석 X40',      '🪨', ()=>S.stones+=40],
  ['희귀 재료 X40',   '🟦', ()=>matGainGrade('R',40)],
  ['영웅 조각 X150',  '🔥', ()=>S.shards.flame+=150],
  ['영웅소환권 X10',  '🎟️', ()=>S.tickHero+=10],
  ['재료소환권 X50',  '🎫', ()=>S.tickMat+=50],
  ['회색코인 X20',    '🪙', ()=>S.gray+=20],
  ['주사위 X250',     '🎲', ()=>S.dice+=250],
];
/* ★ B9/G-134: 공지 — 제목 밴드 + 양피지 서술형 본문 (목록 → 상세 2단) */
const NOTICES = [
  { cat:'[점검]', ic:'🛠️', t:'주간 랭킹 정산 정기 점검 안내', d:'2026-07-27',
    body:'군주님들께 알립니다.<br><br>매일 오전 <b>10:00 ~ 12:00</b> 사이 서버 랭킹 정산 점검이 진행됩니다. 점검 시간 동안에는 월드보스·길드 레이드·점령전 입장이 제한되며, 진행 중이던 전투는 자동으로 종료되고 보상은 그대로 지급됩니다.<br><br>길드 랭킹은 <b>매주 월요일 오전 11시</b>에 초기화됩니다. 초기화 직전에 획득한 기여도는 정산에 반영되지 않을 수 있으니 여유를 두고 참여해 주시기 바랍니다.<br><br>점검으로 불편을 드려 죄송합니다.' },
  { cat:'[이벤트]', ic:'🎉', t:'매월 루비 2배 프로모션', d:'2026-07-20',
    body:'화로에 불을 지필 시간입니다.<br><br>기간 중 루비 상품을 구매하시면 동일한 가격으로 <b>2배의 루비</b>를 지급받습니다. 계정당 각 상품 1회씩 적용되며, 프로모션 상품은 상점 루비 탭에서 초록 테두리로 표시됩니다.<br><br>청약 철회는 구매일로부터 7일 이내 가능합니다. [일부 사용 및 환수가 안되는 시점시 불가]' },
  { cat:'[업데이트]', ic:'📜', t:'결정의 시대 데모 v0.1.0', d:'2026-07-15',
    body:'대장간의 불이 처음으로 타올랐습니다.<br><br>제작·수집 방치형 RPG <b>결정의 시대</b>의 첫 데모가 공개되었습니다. 길잡이 9단계 제작 체인, 요일던전, 투기장, 길드 점령전이 포함되어 있습니다.<br><br>데모 기간 동안의 모든 진행 상황은 정식 서비스로 이관되지 않습니다. 부담 없이 즐겨 주세요.' },
];
// ★ B9/G-121: 일일 탭 날짜 헤더 라벨
function todayLabel(){ try{ const d=new Date(); return `${d.getFullYear()}년 ${String(d.getMonth()+1).padStart(2,'0')}월 ${String(d.getDate()).padStart(2,'0')}일`; }catch(e){ return '오늘'; } }
// 길잡이 단계별 필요 횟수 (9단계 순수 제작 체인 — 각 단계 1회 제작)
const GUIDE_NEED = [1,1,1,1,1,1,1,1,1];
const HERO_TITLES = ['불의 견습','달군 쇠','벼려진 자','불의 장인','결정의 대장장이'];

/* ----------------------------- 상태 ----------------------------- */
const SAVE_KEY = 'hwasin_save_v1';
let S = null;
/* ★ S.mats 정본 스키마 — 24종 개별 재료(키=한글 재료명) + 등급풀 4키(N/R/E/L).
   등급풀은 기존 획득처(사냥 드랍·재료 소환·상점·던전)가 그대로 쓰고,
   개별 재료는 제작 환급·합성·재료상점에서 쌓인다. */
/* 신규 계정 시작 재료 — 공용풀 폐지 후 총량은 구버전과 동일하게 유지했다.
   (구: 개별 12 + 공용 60 = N 132 → 신: 22×6 = 132) */
function freshMats(){
  const m = {};
  const seed = { N:22, R:10, E:3, L:0 };
  MATS.forEach(x=>{ m[x.k]=seed[x.g]; });
  m['금강석']=1;   // 구버전 L 공용풀 1개분
  return m;
}
function freshState(){
  return {
    name:'군주', titleIdx:0, server:'화로 1서버',
    gold:8_000_000, ruby:0, gray:120, dice:0, ticket:10,
    stones:40, tickHero:3, tickMat:3, costumes:0, craftScroll:120, villMat:40,
    // ★ B4/G-56: 소환권 6종 체계 — 일반/고급 × (영웅·재료·몬스터). 고급권은 우선 소모된다.
    tickHeroP:0, tickMatP:0, tickMon:0, tickMonP:0,
    hammerN:20, hammers:2,   // hammerN=일반 망치(드랍/일일퀘/상점) · hammers=전설 망치(일반 15 → 1 제작)
    wards:10,                // ★ B3/G-39: 하락 방지권 — 강화 실패 시 +단계 하락을 막는다
    invTab:'무기',           // ★ B3/G-43: 인벤토리 장비 탭 (무기 / 벨트)
    settings:{ sound:true, graphic:'상' },  // ★ B9/G-133 그래픽 품질(상/중/하)
    title:'newbie',          // ★ B9/G-119: N등급 기본 칭호를 착용한 채로 시작(해제 불가)
    attendLastDate:'',       // ★ B9/G-123: 출석 마지막 수령 날짜(1일 1회 검증)
    classTrait:'', costumeOn:'', raidOn:false, guildCoin:120,
    costumeOwn:{}, holds:{},
    // ★ B8 길드·약탈 신규 상태 (G-105·G-106·G-108·G-109·G-112·G-115)
    guildJoined:false,       // G-105: 길드는 '미가입'이 기본. 창설/가입 신청 승인으로만 true 가 된다
    guildName:'',            // 창설·가입한 길드명 (월드보스/탑 랭킹의 길드태그와 공유)
    guildMaster:false,       // 길드장 여부 → buff 모달의 '길드장 버프'(골드·경험치 35%)
    guildRank:'member',      // 내 직급 master | officer | member (G-112 공지 편집 권한)
    guildNotice:'',          // G-112 길드 공지 본문 (빈 값이면 기본 문구를 보여준다)
    guildScore:0,            // G-106 길드 누적 점수(레이드·점령전 기여 합) — 석판에 표시
    guildRaidScore:0,        // G-108 길드 레이드 내 누적 점수
    guildRaidAuto:false,     // G-108 길드 레이드 '자동 입장' 토글
    raidVictim:false,        // G-115 약탈 활성화 시 '피약탈 대상' 플래그 (자기 페널티 없음)
    // ★ B7: 상점·패키지 신규 재화 (G-93/96/97/98/104)
    goldTicket:3,            // 골드던전 입장권
    grain:0, wood:0,         // 곡식 / 나무 묶음 (마을 성장 자원)
    records:0,               // 영웅 기록서
    picks:{ old:false, shine:false },  // 오래된 곡괭이 / 찬란한 곡괭이
    titleOwn:{},             // 상점·패키지로 지급된 칭호 소유 플래그 (B9 TITLES 와 id 로 연결)
    mats:freshMats(),                        // ★ 재료 24종 딕셔너리 + 등급풀 4키 (스키마: MATS)
    shards:{ flame:60, frost:20, earth:0, shadow:0, wind:0 }, // 영웅 조각 (직업 공용)
    heroShards:{}, // ★ B7/F1: hero_id -> 영웅 전용 조각 (상점 영웅 탭·영웅 패키지 구매분). 구세이브는 deepFill 이 {} 로 채움

    heroes:{},    // ★ B4/G-50: hero_id -> {level, own} (등급·직업·이름은 HERO_ROSTER 가 정본)
    heroEnh:{},   // ★ B4/G-54: hero_id -> 영웅별 강화 단계 (레전더리 이상, 조각 300/회)
    equips:[], // 완성 장비 {grade,slot,enh}
    // ★ N1/§5-4: 장비 옵션 재설정(주사위 리롤) — 4행(일반·희귀·영웅·레전더리)
    //   ⚠비전미확인 — 촬영대기: 이 패널의 적용 범위(개별 아이템 / 영웅 / 계정)를 특정할 근거가 없다.
    //   5장 내내 하단 인벤토리 슬롯·행 내용이 불변이라 대상 전환 관측이 0회다 → 계정 단위 1벌로 둔다.
    rerollLock:[false,false,false,false],  // 행별 잠금 여부 (잠금/열림 라벨)
    rerollOpt:[null,null,null,null],       // 행별 현재 옵션 {s:스탯명, g:등급키} · null = 빈 칸
    rerollSpent:0,                         // 누적 소모 주사위 ("X 소모" 바 / 500·1000 눈금)
    craft:null, // {grade, endAt} 진행중 제작
    awaken:0,   // 각성 단계 (계정 전체)
    villHall:1, villTrain:1, // 마을회관/훈련소 레벨
    arenaTier:0, arenaPts:420, arenaStreak:0, arenaRank:1088,
    // ★ N2: 투기장 주간 리셋(월요일 12시) 주차 키. ''(구세이브 포함)이면 첫 진입에서 현재 주차로 봉인만 하고
    //   초기화하지 않는다 → 기존 진행도가 접속하자마자 날아가는 사고를 막는다.
    arenaWeek:'',
    // ★ B6/G-91: 투기장 세션 승패 카운터 (마지막 전투로부터 10분 지나면 새 세션으로 리셋)
    arenaSession:{ w:0, l:0, t:0 },
    formation:{}, // slotIdx -> heroId (투기장 내부 편성 · 레거시 호환 미러)
    // ★ B4/G-52: 진영 편성 3종 — '1'/'2' 는 3슬롯(전방·측면·후방), 'pvp' 는 4슬롯.
    //   [저장/사용] 을 눌러야 draft 가 커밋된다. party() 는 formActive 진영을 읽는다.
    formations:{ '1':{}, '2':{}, pvp:{} },
    formActive:'1',
    day:1, playSec:0, lastSeen:0, offlinePending:0,
    summonFail:0, arenaAuto:false,
    // ★ B5 던전 신규 상태 (G-67 자동입장 / G-73·G-75 탑 기록·상자 / G-70·G-72 월드보스 기록)
    goldAuto:false,   // 골드던전 '자동 입장' 토글
    _tower:0,         // 시련의 탑 최고 도달 웨이브
    towerBox:0,       // 웨이브 도달 상자 — [교환] 으로 재료 환전
    _wbdmg:0,         // 월드보스 누적 데미지(서버 랭킹 반영)
    wbScore:0,        // ★ v4.1 A1-2: 월드보스 누적 점수(정수 'N점') — 보상과 무관한 별도 적립
    ddDay:null,       // 요일던전에서 선택 중인 요일(null=오늘)
    buffs:{ goldUntil:0, expUntil:0, craftUntil:0, adFree:false }, // 상점 버프(구독 만료ts·영구 플래그) ★ B7/G-100 craftUntil 신규
    daily:{ date:'', counts:{} }, // 일일 횟수 제한
    claimed:{ attend:{}, mail:{} }, // 1회성 보상 수령
    /* ★ B9/G-120 bossChallenges·raids · ★ F2 칭호 조건 카운터 신규
       craftFail/craftWin 은 '현재 연속(스트릭)', ...Best 는 '최고 스트릭'이다.
       칭호는 한 번 달성하면 유지돼야 하므로 have() 는 Best 만 본다. */
    stats:{ kills:0, crafts:0, summons:0, arenaWins:0, synths:0, bossChallenges:0, raids:0,
            craftFail:0, craftFailBest:0,   // 제작 연속 실패
            craftWin:0,  craftWinBest:0,    // 영웅등급 이상 장비 제작 연속 성공
            poorClick:0, poorBest:0,        // 골드 부족 상태에서의 제작 연속 시도
            ddStage:0,                      // 요일던전 최고 클리어 단계
            bossTop:0,                      // 레전더리 보스 처치 횟수
            rubyBox:0,                      // 루비 상자(충전 상품) 구매 횟수
            chat:{} },                      // 월드챗 문구 칭호 전송 플래그
    seenTutorial:false, tutStep:0, guideStep:0, guideProg:0, huntTier:0, mobCount:30,   // mobCount: 홈 필드 동시 스폰 상한 (마릿수 선택기, 원작 기본 30). ★ _huntV 는 freshState 에 두지 않는다 — mergeDefaults 가 먼저 채우면 이관이 통째로 스킵된다
    // ★ B1 신규 — G-01 튜토리얼 진행 관측 / G-04 보상 1회 지급 / G-11 길드 미가입 / G-13 자동전투 표시
    tut:{ base:{}, matBase:null, matN:0, formSig:'', formN:0 },
    _missionPaid:false,
    guild:null,
    autoBattle:true,   // ★ v5.28: 신규 사용자 혼란 방지 — 기본 On (전투는 어차피 항상 돌지만 토글 표시 일치)
  };
}
/* ★ 손상 세이브 백업+알림 — 기존엔 빈 catch 로 JSON.parse 실패를 삼키고 신규 세이브로 넘어갔다.
   손상 원인이 일시적이든 직렬화 결함이든, 사용자는 진행도 손실을 전혀 인지하지 못했다.
   파싱 실패 시 원본 문자열을 백업 키(hwasin_save_corrupt_타임스탬프)로 옮겨두고 부팅 뒤 알린다.
   백업은 localStorage 에 남아 수동 복구가 가능하고, 신규 진행 흐름은 종전과 동일하다. */
function load(){
  try{ const raw = localStorage.getItem(SAVE_KEY); if(raw){ S = JSON.parse(raw); mergeDefaults(); computeOffline(); return; } }catch(e){
    try{ const raw2 = localStorage.getItem(SAVE_KEY);
      if(raw2) localStorage.setItem(SAVE_KEY+'_corrupt_'+Date.now(), raw2);
      setTimeout(()=>toast('⚠ 세이브가 손상되어 새로 시작합니다. 백업을 보관했습니다.'), 500);
    }catch(_){}
  }
  S = freshState();
  S.lastSeen = Date.now();
  // ★ B4/G-50: 시작 보유 = 희귀 화염검사(HERO_006) + 일반 빙결술사(HERO_002) — 구버전 지급과 동등
  S.heroes.HERO_006 = { level:1, own:true };
  S.heroes.HERO_002 = { level:1, own:true };
}
/* ★ B4/G-50: 구세이브 마이그레이션 — S.heroes 의 직업키({grade,level,own})를 hero_id 키로 변환한다.
   구조상 '직업 X를 g등급까지 승급'은 '해당 직업의 g등급 이하 영웅을 전부 보유'와 동등하므로
   그대로 펼쳐 넣는다(진행도 손실 없음). 이미 신형이면 아무 것도 하지 않는다. */
function migrateHeroes(){
  if(!S.heroes || typeof S.heroes!=='object' || Array.isArray(S.heroes)) S.heroes={};
  Object.keys(S.heroes).forEach(k=>{
    if(HERO_BY_ID[k]) return;                      // 이미 신형 키
    const old=S.heroes[k]; delete S.heroes[k];
    if(!old || typeof old!=='object') return;
    if(!JOBS.some(j=>j.id===k) || !old.own) return;
    const g = (old.grade && GRADES[old.grade]) ? old.grade : 'N';
    const upto = GORDER.indexOf(g);
    HERO_ROSTER.forEach(r=>{
      if(r.class_id!==k || GORDER.indexOf(r.grade)>upto) return;
      S.heroes[r.hero_id] = { level:(r.grade===g ? (old.level||1) : 1), own:true };
    });
  });
  // 무결성 — 알 수 없는 키 제거 + 필드 보정
  Object.keys(S.heroes).forEach(k=>{
    if(!HERO_BY_ID[k]){ delete S.heroes[k]; return; }
    const h=S.heroes[k]; if(!h || typeof h!=='object'){ delete S.heroes[k]; return; }
    if(typeof h.level!=='number' || !(h.level>0)) h.level=1;
    h.own=!!h.own; delete h.grade;
  });
  if(!S.heroEnh || typeof S.heroEnh!=='object') S.heroEnh={};
  // ★ B7/F1: 영웅 전용 조각 — 구세이브엔 없음(=빈 객체), 손상값·미지 키는 정리한다
  if(!S.heroShards || typeof S.heroShards!=='object' || Array.isArray(S.heroShards)) S.heroShards={};
  Object.keys(S.heroShards).forEach(k=>{
    if(!HERO_BY_ID[k] || typeof S.heroShards[k]!=='number' || !(S.heroShards[k]>0)) delete S.heroShards[k]; });
  if(!S.formations || typeof S.formations!=='object') S.formations={ '1':{}, '2':{}, pvp:{} };
  ['1','2','pvp'].forEach(k=>{ if(!S.formations[k] || typeof S.formations[k]!=='object') S.formations[k]={}; });
  if(S.formActive!=='1' && S.formActive!=='2' && S.formActive!=='pvp') S.formActive='1';
  // 전멸 방지 — 보유 영웅이 하나도 없으면 시작 영웅을 복구한다
  if(!HERO_ROSTER.some(r=>S.heroes[r.hero_id] && S.heroes[r.hero_id].own)){
    S.heroes.HERO_006={ level:1, own:true }; S.heroes.HERO_002={ level:1, own:true };
  }
  /* ★ v5.68→v5.81: 장비 equipped/heroId 필드 정규화 — 구세이브/오염값 방지.
     equipped가 boolean이 아니면 false로 강제. 제작만으로 전투력이 오르는 자동 착용 버그 근원 차단.
     ★ v5.81: heroId가 존재하지 않는(삭제된) 영웅을 가리키면 착용 해제 —
     heroPower에서 매칭 실패로 착용 효과가 조용히 사라지는 버그 방지. */
  if(Array.isArray(S.equips)){
    const validHeroIds = new Set(HERO_ROSTER.map(h=>h.hero_id));
    S.equips = S.equips.filter(e=>e && typeof e==='object');
    S.equips.forEach(e=>{ if(typeof e.equipped!=='boolean') e.equipped=false;
                          if(typeof e.enh!=='number') e.enh=0;
                          /* heroId가 유효하지 않은 영웅이면 귀속 해제 */
                          if(e.heroId && !validHeroIds.has(e.heroId)) e.heroId=null; });
  } else { S.equips=[]; }
}
/* ★ F3: 명칭 IP 세탁으로 바뀐 id 를 구세이브에서 신 id 로 옮긴다(진행도 손실 0).
   - 코스튬: S.costumeOwn(보유 맵) 키 · S.costumeOn(착용) 값
   - 패키지: S.claimed.mail(계정당 1회 구매 플래그) 키
   구 id 는 어느 테이블에도 없으므로 남겨두면 보유/구매 이력이 통째로 증발한다. */
const COSTUME_ID_MIGRATE = { lycan:'wolyeong', nova:'hongyeom', bargon:'surim', carmilla:'hanseori', seraphin:'changhae' };
const PACK_ID_MIGRATE    = { ap_carm:'ap_hero027', ap_lycan:'ap_hero029' };
function migrateNames(){
  if(S.costumeOwn && typeof S.costumeOwn==='object'){
    for(const oldId in COSTUME_ID_MIGRATE){
      if(!Object.prototype.hasOwnProperty.call(S.costumeOwn, oldId)) continue;
      if(S.costumeOwn[oldId]) S.costumeOwn[COSTUME_ID_MIGRATE[oldId]]=true;
      delete S.costumeOwn[oldId];
    }
  }
  if(S.costumeOn && COSTUME_ID_MIGRATE[S.costumeOn]) S.costumeOn = COSTUME_ID_MIGRATE[S.costumeOn];
  if(S.costumeOn && !costumeById(S.costumeOn)) S.costumeOn='';   // 미지 id 착용 방지
  if(S.costumeOn && !costumeHas(S.costumeOn)) S.costumeOn='';    // 미보유 id 착용 방지(구세이브 오지급 차단)
  if(S.claimed && S.claimed.mail && typeof S.claimed.mail==='object'){
    for(const oldId in PACK_ID_MIGRATE){
      if(!Object.prototype.hasOwnProperty.call(S.claimed.mail, oldId)) continue;
      if(S.claimed.mail[oldId]) S.claimed.mail[PACK_ID_MIGRATE[oldId]]=true;
      delete S.claimed.mail[oldId];
    }
  }
}
// 오프라인 방치 수익 (분당 1,000G, 최대 8시간)
function computeOffline(){
  const now=Date.now();
  if(S.lastSeen){ const elapsed=(now-S.lastSeen)/1000, cap=8*3600; if(elapsed>60){ S.offlinePending=(S.offlinePending||0)+Math.floor(1000/60*Math.min(elapsed,cap)); } }
  S.lastSeen=now;
}
// 깊은 병합: 중첩 객체 신규 하위키까지 기본값 채움 (세이브 마이그레이션 NaN 방지)
function deepFill(t,d){ for(const k in d){ if(t[k]===undefined) t[k]=d[k]; else if(d[k]&&typeof d[k]==='object'&&!Array.isArray(d[k])&&typeof t[k]==='object') deepFill(t[k],d[k]); } }
function mergeDefaults(){ deepFill(S, freshState());
  // ★ B9/G-119: 구세이브는 title:'' 로 저장되어 deepFill 대상이 아니다 → 기본 칭호 강제 착용
  if(!S.title || !TITLE_BY_ID[S.title]) S.title='newbie';
  migrateHeroes();   // ★ B4/G-50: 직업키 → hero_id 로스터 구조 변환
  migrateNames();    // ★ F3: IP 세탁으로 바뀐 코스튬·패키지 id 이관
  migrateMatPools(); // ★ v4.3: 폐지된 등급 공용풀 잔량을 같은 등급 재료로 분배
  // ★ v4.7: 몬스터 8종 → 120종 확장. 구세이브의 0~7 인덱스를 같은 등급·상대위치로 옮긴다.
  if(typeof S.huntTier==='number' && S.huntTier<HUNT_MIGRATE_V47.length && S._huntV!==47){
    S.huntTier = HUNT_MIGRATE_V47[S.huntTier]; }
  S._huntV = 47;
  S.huntTier = clamp(S.huntTier||0, 0, HUNT_TIERS.length-1);
}
/* ★ 저장 실패 사용자 알림 — 기존엔 빈 catch 로 저장 실패를 완전히 삼켰다. 방치형 게임에서
   저장 실패(QuotaExceeded·시크릿 모드·스토리지 비활성)를 모른 채 플레이하면 진행도가 통째로 날아간다.
   save() 는 5초 간격 자동저장 + beforeunload 에서도 호출되므로, 영구 실패 상태에선 매번 토스트가
   떠서 폭주한다. _saveFailFlag 로 최초 1회만 알린다 (정상 복구되면 플래그 리셋). */
let _saveFailFlag = false;
function save(){ try{ S.lastSeen=Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); _saveFailFlag=false; }
  catch(e){ if(!_saveFailFlag){ _saveFailFlag=true; try{ toast('⚠ 저장에 실패했습니다. 시크릿 모드이거나 저장 공간이 가득 찼을 수 있습니다.'); }catch(_){} } } }

/* 일일 카운터 (실제 날짜 롤오버 리셋) */
function today(){ try{ return new Date().toDateString(); }catch(e){ return 'demo'; } }
/* ★ F2: 날짜 롤오버를 한 곳으로 모으고, 실제로 날짜가 바뀐 경우에만 접속 일차(S.day)를 올린다.
   (칭호 조건이 '접속 일수'에서 원작 구조로 교체되면서 S.day 를 갱신하는 주체가 사라졌었다) */
function rollDaily(){
  const t=today(); if(S.daily.date===t) return;
  const first = !S.daily.date;
  if(!first) S.day=(S.day||1)+1;   // 최초 1회(빈 문자열)는 신규 접속이라 일차를 올리지 않는다
  S.daily.date=t; S.daily.counts={};
  /* ★ N2: 원작 ⓘ '매일 입장권 5개가 자동충전 됩니다.' — 날짜가 실제로 바뀐 경우에만 배치 지급한다.
     (데모의 40초당 +1 실시간 리젠은 시연 편의를 위한 가속 장치로 그대로 둔다 — 상한 30 공유) */
  if(!first) S.ticket=Math.min(30,(S.ticket|0)+ARENA_DAILY_TICKET);
}
function dailyLeft(key, max){ rollDaily(); return max-(S.daily.counts[key]||0); }
function dailyUse(key){ rollDaily(); S.daily.counts[key]=(S.daily.counts[key]||0)+1; }

/* ----------------------------- 유틸 ----------------------------- */
const $ = s => document.querySelector(s);
const el = (t,c,h)=>{ const e=document.createElement(t); if(c)e.className=c; if(h!==undefined)e.innerHTML=h; return e; };
function fmt(n){ n=Math.floor(n);
  if(n>=100_000_000) return (n/100_000_000).toFixed(2).replace(/\.00$/,'')+'억';
  if(n>=10_000)      return (n/10_000).toFixed(1).replace(/\.0$/,'')+'만';
  return n.toLocaleString('ko-KR');
}
/* ★ B1/G-12: 상단 재화바는 축약하지 않고 전체 자릿수를 그대로 노출한다.
   (fmt 는 토스트·sysLog 등 폭이 좁은 곳 전용) */
function fmtFull(n){ return Math.floor(n||0).toLocaleString('ko-KR'); }
function rnd(a,b){ return a + Math.random()*(b-a); }
function ri(a,b){ return Math.floor(rnd(a,b+1)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function toast(msg){ const box=$('#toast'); const t=el('div','toast',msg); box.appendChild(t); setTimeout(()=>t.remove(), 1900); }

/* ---- SFX (Web Audio 합성음, 외부 파일 없음) ---- */
let _actx=null;
function initAudio(){ if(_actx) return; try{ _actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
function sfx(type){
  if(!_actx || !(S&&S.settings&&S.settings.sound)) return;
  try{
    const t=_actx.currentTime, o=_actx.createOscillator(), g=_actx.createGain(); o.connect(g); g.connect(_actx.destination);
    const P={ hit:[220,0.06,'square',0.05], crit:[440,0.09,'square',0.08], craft:[520,0.16,'triangle',0.12], fail:[150,0.2,'sawtooth',0.1],
      summon:[330,0.26,'sine',0.09], legendary:[660,0.45,'triangle',0.14], coin:[880,0.05,'square',0.04], tap:[300,0.03,'square',0.035],
      awaken:[520,0.3,'sine',0.12], win:[440,0.2,'triangle',0.11] };
    const p=P[type]||P.tap; o.type=p[2]; o.frequency.setValueAtTime(p[0],t);
    if(type==='craft'||type==='legendary'||type==='awaken'||type==='win') o.frequency.exponentialRampToValueAtTime(p[0]*2,t+p[1]);
    if(type==='fail') o.frequency.exponentialRampToValueAtTime(p[0]*0.5,t+p[1]);
    g.gain.setValueAtTime(p[3],t); g.gain.exponentialRampToValueAtTime(0.0001,t+p[1]);
    o.start(t); o.stop(t+p[1]+0.03);
  }catch(e){}
}

/* ----------------------------- 파워/전투력 ----------------------------- */
/* ---------- ★ B4/G-50: 영웅 로스터 접근자 ---------- */
function heroSlot(hid){ if(!S.heroes) S.heroes={}; if(!S.heroes[hid]) S.heroes[hid]={ level:1, own:false }; return S.heroes[hid]; }
function heroOwned(hid){ const h=S.heroes&&S.heroes[hid]; return !!(h&&h.own); }
// 로스터 정본 + 세이브 상태를 합친 뷰. 구코드 호환을 위해 job(JOBS 엔트리)을 함께 싣는다.
function heroEntry(hid){
  const r=HERO_BY_ID[hid]; if(!r) return null;
  const st=(S.heroes&&S.heroes[hid])||{ level:1, own:false };
  return { hero_id:r.hero_id, class_id:r.class_id, grade:r.grade, name:r.name,
           level:st.level||1, own:!!st.own, enh:(S.heroEnh&&S.heroEnh[hid])||0,
           job:JOBS.find(j=>j.id===r.class_id)||JOBS[0] };
}
function rosterOf(classId){ return HERO_ROSTER.filter(r=>r.class_id===classId); }   // 등급 오름차순
// 직업 단위 질의(구코드 호환) — 그 직업에서 보유 중인 최고 등급 영웅
function classBest(classId){ const l=rosterOf(classId).filter(r=>heroOwned(r.hero_id)); return l.length? heroEntry(l[l.length-1].hero_id) : null; }
// hero_id 또는 직업 id 어느 쪽으로도 영웅을 해석한다(구세이브 편성값 호환)
function heroResolve(any){ return HERO_BY_ID[any] ? heroEntry(any) : classBest(any); }
function heroFuseNeed(hid){ const r=HERO_BY_ID[hid]; return r ? (HERO_SHARD_NEED[r.grade]||20) : 0; }
/* ★ B7/F1: 조각 저장소 2층 구조 — 영웅 단위 확장.
   ① S.shards[class_id] : 직업 공용 조각(소환·사냥·우편·광고 등 기존 획득처 전부, 스키마 불변)
   ② S.heroShards[hero_id] : 상점에서 '그 영웅을 콕 집어' 산 전용 조각 (신규)
   가용량 = 전용 + 직업 공용, 소모는 전용부터. 구세이브에는 ②가 없으므로
   deepFill(freshState)이 {} 로 채우고 가용량 = 직업 공용 = 기존과 완전히 동일 → 진행도 손실 0.
   합성(heroFuse)·영웅 강화·각성은 전부 이 헬퍼를 경유한다. */
function heroShardOwn(hid){ return (S && S.heroShards && S.heroShards[hid]) || 0; }
function heroShardAvail(hid){ const r=HERO_BY_ID[hid]; if(!r) return 0;
  return heroShardOwn(hid) + ((S.shards && S.shards[r.class_id])||0); }
function heroShardAdd(hid,n){ if(!S.heroShards || typeof S.heroShards!=='object') S.heroShards={};
  S.heroShards[hid]=(S.heroShards[hid]||0)+n; }
function heroShardSpend(hid,n){ const r=HERO_BY_ID[hid]; if(!r) return false;
  if(heroShardAvail(hid) < n) return false;                       // 차감 전 보유량 재확인 (재화 안전장치)
  if(!S.heroShards || typeof S.heroShards!=='object') S.heroShards={};
  const d=Math.min(S.heroShards[hid]||0, n); S.heroShards[hid]=(S.heroShards[hid]||0)-d;
  const rem=n-d; if(rem>0) S.shards[r.class_id]=Math.max(0,(S.shards[r.class_id]||0)-rem);
  return true; }
// 계정 전체 조각 합계 (각성·소환 카운터용) — 직업 공용 + 영웅 전용
function shardTotal(){
  const a=Object.values(S.shards||{}).reduce((x,c)=>x+(c||0),0);
  const b=Object.values(S.heroShards||{}).reduce((x,c)=>x+(c||0),0);
  return a+b; }
// 합성 선행조건: 같은 직업의 더 낮은 등급 영웅을 1명 이상 보유(N등급은 조건 없음)
function heroFusePrereq(hid){ const r=HERO_BY_ID[hid]; if(!r) return false;
  const gi=GORDER.indexOf(r.grade); if(gi<=0) return true;
  return rosterOf(r.class_id).some(x=>GORDER.indexOf(x.grade)<gi && heroOwned(x.hero_id)); }
function heroFuseReady(hid){ const r=HERO_BY_ID[hid]; if(!r||heroOwned(hid)) return false;
  return heroFusePrereq(hid) && heroShardAvail(hid) >= heroFuseNeed(hid); }
function heroFuse(hid){ const r=HERO_BY_ID[hid]; if(!r||!heroFuseReady(hid)) return false;
  if(!heroShardSpend(hid, heroFuseNeed(hid))) return false;
  const st=heroSlot(hid); st.own=true; st.level=st.level||1;
  Battle.refreshParty(); return true; }
// 온보딩 클래스 특성 확정 시 해당 직업의 N등급 영웅(HERO_001~005)을 확정 지급
function grantClassStarter(traitId){
  const hid=CLASS_STARTER[traitId]; if(!hid||heroOwned(hid)) return false;
  const st=heroSlot(hid); st.own=true; st.level=st.level||1;
  if(typeof Battle!=='undefined' && Battle.refreshParty) Battle.refreshParty();
  return true;
}
function ownedHeroes(){ return HERO_ROSTER.filter(r=>heroOwned(r.hero_id)).map(r=>heroEntry(r.hero_id)); }
// 코스튬 소유 판정(id 기반, 구세이브는 개수 기반 호환)
function costumeOwned(id,i){ return costumeHas(id) || ((S&&S.costumes)||0)>i; }
/* ★ F2: 칭호 전투력 보정 폐지 — 원작 칭호 29종의 효과 축은 골드/경험치/제작시간/제작확률/채굴뿐이며
   '공격력·체력·모든 스탯' 류는 구현자 창작이었다. heroPower 에서 칭호 전투력 배율을 제거했다. */
/* ★ v5.65: heroPower — 장비는 '착용 중'(equipped=true)인 것만 합산.
   종전엔 모든 보유 장비가 합산되어 제작만 하면 모든 영웅이 강해지는 문제.
   영웅별 장비 귀속은 S.equips에 heroId 필드로 구현 — 착용 시 해당 영웅에게 귀속. */
function heroPower(h){
  const g = GRADES[h.grade].mult;
  /* 착용 중이고 이 영웅에게 귀속된 장비만 합산 */
  const heroId = h.hero_id || h.hid;
  const eq = S.equips.filter(e=>e.equipped && (!e.heroId || e.heroId===heroId))
    .reduce((a,e)=>a+(1+e.enh*0.12)*GRADES[e.grade].mult,0);
  const aw = 1 + S.awaken*0.015;
  const costume = costumeStatMul();
  const setm = setDamageMul();
  return Math.round((100 + h.level*30) * g * aw * (1 + eq*0.05) * (S&&S.classTrait?1.02:1) * costume * setm);
}
function totalCP(){ const hs=ownedHeroes(); if(!hs.length) return 0; return hs.reduce((a,h)=>a+heroPower(h),0); }
/* ★ B4/G-52: 타 콘텐츠는 3인 유지(투기장 4인은 B6 의 arenaParty 소관).
   편성 우선순위 = S.formations[활성 진영] → 레거시 S.formation → 전투력 순.
   편성값은 hero_id 가 정본이지만 구세이브의 직업 id 도 heroResolve 로 해석한다. */
function party(){
  const owned=ownedHeroes();
  const byId=id=>{ const h=heroResolve(id); return (h && h.own) ? owned.find(o=>o.hero_id===h.hero_id) : null; };
  const fs=(S.formations && S.formations[S.formActive||'1']) || null;
  let formed=[];
  if(fs) formed=Object.keys(fs).sort().map(k=>byId(fs[k])).filter(Boolean);
  if(!formed.length) formed=Object.values(S.formation||{}).map(byId).filter(Boolean);
  const uniq=[]; formed.forEach(h=>{ if(uniq.indexOf(h)<0) uniq.push(h); });
  const rest=owned.filter(h=>uniq.indexOf(h)<0).sort((a,b)=>heroPower(b)-heroPower(a));
  return uniq.concat(rest).slice(0,3);
}
/* ★ B6/G-81: 투기장 전용 4인 편성.
   party() 는 타 콘텐츠용 3인을 그대로 유지하고, 투기장만 PVP 진영(4슬롯)을 읽어 4인을 반환한다.
   전투 중에는 Battle.setPartySource(arenaParty) 로 교체되므로 기여도 패널도 자동으로 4인이 된다. */
function arenaParty(){
  const owned=ownedHeroes();
  const byId=id=>{ const h=heroResolve(id); return (h && h.own) ? owned.find(o=>o.hero_id===h.hero_id) : null; };
  const fs=(S.formations && S.formations.pvp) || null;
  let formed=[];
  if(fs) formed=Object.keys(fs).sort().map(k=>byId(fs[k])).filter(Boolean);
  if(!formed.length) formed=Object.values(S.formation||{}).map(byId).filter(Boolean);
  const uniq=[]; formed.forEach(h=>{ if(uniq.indexOf(h)<0) uniq.push(h); });
  const rest=owned.filter(h=>uniq.indexOf(h)<0).sort((a,b)=>heroPower(b)-heroPower(a));
  return uniq.concat(rest).slice(0,4);
}

/* ============================================================
   캔버스 2D 자동전투 엔진 (+ 파티 기여도% 오버레이)
   ============================================================ */
/* ★ v5.70: 영웅 초상화 — 전역 (영웅 모달에서도 사용). */
const HERO_PORTRAIT = {
  'HERO_001':'char_001','HERO_006':'char_006','HERO_002':'char_002','HERO_007':'char_007',
  'HERO_003':'char_003','HERO_008':'char_008','HERO_004':'char_004','HERO_009':'char_009','HERO_005':'char_005',
};
function heroPortrait(heroId, size){
  const p = HERO_PORTRAIT[heroId];
  if(!p) return '';
  const s = size||2;
  return '<img src="assets/heroes/portraits/'+p+'.png" style="width:'+s+'em;height:'+s+'em;object-fit:contain;image-rendering:pixelated" alt="">';
}

const Battle = (()=>{
  let cv, ctx, W=0, H=0, dpr=1;
  let heroes=[], mobs=[], fx=[], drops=[], wave=1, spawnT=0, last=0, running=false, shake=0, lastBossWave=0;
  /* ★ v5.25: 몬스터 스프라이트 캐시 — assets/monsters/<name>.png 를 미리 로드.
     캔버스에 drawImage 로 그린다. 32x32 픽셀아트를 128x128 로 확대한 것이다. */
  const MON_IMG_CACHE = {};
  function monImg(name){
    if(!name) return null;
    if(MON_IMG_CACHE[name]===undefined){
      const im = new Image();
      im.src = 'assets/monsters/'+name+'.png';
      im.onload = ()=>{ MON_IMG_CACHE[name]=im; };
      im.onerror = ()=>{ MON_IMG_CACHE[name]=null; };
      MON_IMG_CACHE[name] = im;  // 로드 중에도 참조 가능 (불완전 시 drawImage 스킵)
    }
    return MON_IMG_CACHE[name];
  }
  /* ★ v5.25.2: 몬스터별 스케일 — 에셋의 실제 픽셀 커버리지(박스max)를 측정해
     그림자(m.r*2.4)에 꽉 차도록 개별 배율을 적용. 박스max 96px=1.0 기준.
     작은 몬스터(48px)는 2.0배, 큰 몬스터(128px)는 0.8배로 정규화.
     v5.25.3: 전체 ×1.2 추가 가산. */
  const MON_SCALE = {
    'cave_603':2.16,'cave_607':2.03,'cave_609':1.5,'cave_611':1.38,'cave_612':1.15,
    'devil_703':2.03,'devil_704':1.73,'devil_708':1.73,'devil_709':1.64,'devil_711':1.24,'devil_712':1.38,
    'field_503':2.3,'field_504':2.03,'field_512':1.28,
    'forest_401':2.88,'forest_412':1.38,
    'ice_806':1.73,'ice_811':1.38,'ice_812':1.32,
    'jungle_203':2.66,'jungle_210':1.57,
    'sea_309':1.44,'sea_312':1.44,
    'undead_102':2.16,'undead_110':1.38,'undead_111':1.24,'undead_112':1.2,
  };
  /* ★ v5.25.3: 몬스터 발 위치(footY) */
  const MON_FOOTY = {
    'cave_612':0.93,'devil_709':0.93,'field_503':0.90,
  };
  /* ★ v5.49: 9영웅 전체 스프라이트 — hero_id별 개별 에셋 폴더.
     assets/heroes/sheets/<hero_key>/<anim>.png (스프라이트시트 통째로) */
  const HERO_SPRITE_DIR = {
    'HERO_001':'flame_n','HERO_006':'flame_r',
    'HERO_002':'frost_n','HERO_007':'frost_r',
    'HERO_003':'earth_n','HERO_008':'earth_r',
    'HERO_004':'shadow_n','HERO_009':'shadow_r',
    'HERO_005':'wind_n',
  };
  const JOB_FX_DIR = { flame:'flame', frost:'frost', earth:'earth', shadow:'shadow', wind:'wind' };
  /* ★ v5.79→v5.80: 발 피봇 — 유니티 CircleCollider2D offset 기준.
     Example scene 1.unity에서 전 9개 캐릭터가 동일하게 offset=(0, -0.22), radius=0.14.
     spritePixelsToUnits=100 이므로 -0.22 유니티 = -22px (128px 셀 기준).
     셀 중앙(64,64)에서 아래로 22px = (64, 86)이 발 중심축.

     이 값은 '이미지 중앙에서 셀 높이의 0.172배 아래'로, 표시 크기에 비례해서 적용한다.
     fx(발 x중심)는 셀 중앙(64) 사용 — 콜라이더 offset x=0과 일치.

     ★ 과거 v5.79에서는 픽셀 분석(footY 99~109)으로 직업별 값을 썼으나,
     유니티 공식 콜라이더 값이 정본이므로 이것으로 통일. */
  function heroPivot(hid){
    /* 128px 셀 기준: 중앙 x=64, 발 y=64+22=86.
       표시 크기(sz)가 달라도 drawHeroSheet에서 scale로 보정하므로 셀 기준값 반환. */
    return {fx:64, fy:86};
  }
  const MELEE_HEROS = ['HERO_003','HERO_008','HERO_004'];
  const RANGED_SKILL_ANIMS = ['Attack2','Attack3','Special2','CastSpell'];
  const MELEE_SKILL_ANIMS = ['Melee2','MeleeSpin','Special2','CastSpell'];
  /* ★ v5.76: 스프라이트시트 시스템 — 1920×1024 시트를 통째로 로드.
     8행(8방향) × 15열(15프레임) = 120프레임.
     개별 PNG 수천 개 대신 시트 ~84장만 로드. */
  const SHEET_W = 1920, SHEET_H = 1024, CELL = 128, COLS = 15;
  const HERO_SHEETS = {};  /* key: dir/anim → Image 객체 */
  let _sheetsLoaded = false;
  function preloadHeroSheets(){
    if(_sheetsLoaded) return;
    _sheetsLoaded = true;
    const ranged = ['Idle','Run','Attack1','Attack2','Attack3','CastSpell','Special1','Special2','Die'];
    const melee  = ['Idle','Run','Melee','Melee2','MeleeSpin','CastSpell','Special1','Special2','Die','ShieldBlockMid'];
    for(const hid in HERO_SPRITE_DIR){
      const dir = HERO_SPRITE_DIR[hid];
      const isMelee = hid==='HERO_003'||hid==='HERO_008'||hid==='HERO_004';
      const anims = isMelee ? melee : ranged;
      for(const anim of anims){
        const key = dir+'/'+anim;
        const im = new Image();
        im.src = 'assets/heroes/sheets/'+key+'.png';
        im.onerror=()=>{};
        HERO_SHEETS[key] = im;
      }
    }
  }
  /* 8방향 → row 매핑 (Unity 애니메이션 클립 역추적으로 확정).
     Unity 매핑: E→row7, NE→row0, N→row1, NW→row2, W→row3, SW→row4, S→row5, SE→row6
     캔버스 좌표계: y 증가 = 아래(남), x 증가 = 오른쪽(동)
     atan2(dy, dx): dx>0=동, dy>0=남(아래) */
  function angleToRow(angle){
    const deg = (angle * 180 / Math.PI + 360) % 360;
    const dir8 = Math.round(deg / 45) % 8;
    /* dir8 순서: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
       각각의 Unity row: E=7, SE=6, S=5, SW=4, W=3, NW=2, N=1, NE=0 */
    return [7,6,5,4,3,2,1,0][dir8];
  }
  function heroAnimName(h){
    if(h.dead) return 'Die';
    if(h.skillAnim) return h.skillAnim;
    if(mobs.length > 0){
      return MELEE_HEROS.indexOf(h.hid)>=0 ? 'Melee' : 'Attack1';
    }
    return 'Idle';
  }
  /* ★ v5.49: 5직업 전체 스킬 발사체 매핑. */
  const SKILL_FX_MAP = {
    flame:  ['FireSpell_0', 'FireArrow_1', 'FireAoE_2', 'FireAoE_3'],
    frost:  ['IceSpell_0', 'IceArrow_1', 'IceAoE_2', 'IceAoE_3'],
    earth:  ['SwordAoE_0', 'SwordAoE_1', 'SwordAoE_2', 'SwordAoE_3'],
    shadow: ['DeathSpell_0','DeathSpell_1','DeathAoE_2','DeathAoE_3'],
    wind:   ['Arrow_0', 'FireArrow_1', 'Arrow_2', 'ArcSpell_3'],
  };
  const SKILL_FX_CACHE = {};
  function skillFxSprite(jobId, skillIdx, frame){
    const names = SKILL_FX_MAP[jobId];
    if(!names) return null;
    const name = names[Math.min(skillIdx, names.length-1)];
    const dir = JOB_FX_DIR[jobId] || jobId;
    const key = dir+'/effects/'+name+'_'+String(frame||0).padStart(2,'0');
    if(SKILL_FX_CACHE[key]===undefined){
      const im = new Image();
      im.src = 'assets/heroes/'+key+'.png';
      SKILL_FX_CACHE[key] = im;
    }
    return SKILL_FX_CACHE[key];
  }
  function preloadSkillFx(){
    for(const jobId in SKILL_FX_MAP){
      const dir = JOB_FX_DIR[jobId] || jobId;
      for(const name of SKILL_FX_MAP[jobId]){
        for(let f=0; f<15; f++){
          const key = dir+'/effects/'+name+'_'+String(f).padStart(2,'0');
          const im = new Image();
          im.src = 'assets/heroes/'+key+'.png';
          SKILL_FX_CACHE[key] = im;
        }
      }
    }
  }
  /* ★ v4.9: 종전 0.62 는 '상시 노출되던 content-rail 을 피하려고' 좁혀둔 값이었다.
     아이콘열이 원작대로 ☰ 토글로 바뀌어 전장을 가리지 않으므로, 원작처럼 채팅 패널 직전까지 쓴다. */
  const BAND_TOP=0.20, BAND_BOT=0.70;

  function resize(){
    cv = $('#battle'); if(!cv) return;
    const r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio||1, 2);
    W = r.width; H = r.height;
    cv.width = Math.max(1,W*dpr); cv.height = Math.max(1,H*dpr);
    ctx = cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    layoutHeroes();
  }
  let partyCP=1, wiped=0, mode='hunt', dg=null; // mode: 'hunt'(홈 파밍) | 'dungeon'(던전 입장 전투)
  /* ★ B6/G-81: 편성 소스 훅 — null 이면 기존과 100% 동일하게 party()(3인)를 쓴다.
     투기장 입장 시에만 arenaParty(4인)로 교체되고, 결과창에서 다시 null 로 되돌린다. */
  let partySrc = null;
  /* ★ 홈 1인 중앙 서바이벌 — 원작(불칸) 실측:
     - 원작플로우-전량판독 라인 33/39/45/73-75 (5회 관찰 전부 일치)
     - UI재현카탈로그 라인 444 "파티 대표 영웅 1명이 십수 마리 해골 무리에 둘러싸여 자동 교전"
     홈(mode='hunt', partySrc 없음)은 대표 영웅 1명을 필드 중앙에 배치.
     던전/투기장/레이드(mode='dungeon' 또는 partySrc 설정)는 종전대로 좌측 3~4인 파티.
     isHuntSolo = partySrc가 없고 mode가 hunt일 때만 true. */
  const HERO_CENTER_X = 0.50, HERO_CENTER_Y = 0.50;  // 홈 영웅 중앙 위치 (필드 중앙)
  function isHuntSolo(){ return !partySrc && mode==='hunt'; }
  function layoutHeroes(){
    const p = (partySrc || party)();
    const solo = isHuntSolo();
    const src = solo ? [p[0]] : p;               // 홈은 대표 영웅 1명만 (party()[0])
    heroes = src.map((h,i)=>{
      const cx = solo ? W*HERO_CENTER_X : (W*0.17 + (i%2)*26);
      const cy = solo ? H*HERO_CENTER_Y : (H*(BAND_TOP+0.06) + i*(H*0.14));
      return {
        hid:h.hero_id, job:h.job, cp:heroPower(h), dmgDone:0, lvl:h.level, grade:h.grade, name:h.name||h.job.name,
        x:cx, y:cy, baseX:cx, baseY:cy,
        atkT: rnd(0,0.6), face:h.job.emoji, color:h.job.color, ranged:h.job.ranged, lungeT:0,
        hp:1, dead:false, respT:0,
        skillCD:[0,0,0,0],
        animFrame:0, animT:0, skillAnim:null, skillAnimT:0,  /* ★ v5.36: 스프라이트 애니메이션 */
        _lockTarget:null, _lockUntil:0, _row:5,  /* ★ v5.78: 방향 락온 */
      };
    });
    partyCP = Math.max(1, heroes.reduce((a,h)=>a+h.cp,0));
    renderContribPanel();
  }
  function tierDef(){ return HUNT_TIERS[clamp((S&&S.huntTier)||0,0,HUNT_TIERS.length-1)]; }
  // ---- 던전 모드: 입장 → 필드에서 몬스터/보스와 실전 → 성공/실패 → 퇴장 ----
  function startDungeon(cfg){
    mode='dungeon'; wiped=0; mobs=[]; spawnT=0;
    heroes.forEach(h=>{ h.dead=false; h.hp=1; h.respT=0; h.dmgDone=0; });
    dg={ name:cfg.name, col:cfg.col||'#e8843c', foeCP:Math.max(1,cfg.foeCP||1000), kind:cfg.kind||'mobs',
         total:cfg.count||10, spawned:0, killed:0, timeLeft:cfg.dur||30, onEnd:cfg.onEnd, done:false, bossSpawned:false,
         /* ★ N2: 던전별 데미지 배율(양방향). 투기장만 0.5 를 넘겨 원작 '모든 데미지 50% 감소'를 재현한다.
            지정하지 않은 콘텐츠는 1 이라 기존 전투 루프에 영향이 없다. */
         dmgMul:(cfg.dmgMul>0 ? cfg.dmgMul : 1) };
    // ★ B5/G-77: kind:'wave' — 웨이브 서바이벌 전용 상태.
    //   몹 '그룹'을 전부 처치하면 waveNo 가 오르고 제한시간(기본 60초)이 리셋된다.
    //   기존 kind:'mobs' 처럼 처치 수를 웨이브로 환산하지 않는다.
    if(dg.kind==='wave'){ dg.waveDur=cfg.waveDur||60; dg.waveNo=1; dg.waveTimeLeft=dg.waveDur;
      dg.groupLeft=4; dg.baseCP=dg.foeCP; }
  }
  function endDungeon(win){
    if(!dg || dg.done) return; dg.done=true;
    const cb=dg.onEnd, dmg=heroes.reduce((a,h)=>a+h.dmgDone,0), kills=dg.killed, wv=dg.waveNo||0;
    mode='hunt'; dg=null; mobs=[]; spawnT=0.4;
    heroes.forEach(h=>{ h.dead=false; h.hp=1; h.respT=0; });
    if(cb) cb(win, {dmg, kills, wave:wv});
  }
  function spawnDgMob(){
    const hp=Math.max(60, dg.foeCP*0.08);
    mobs.push({ name:dg.name, col:dg.col, shape:'skull', x:W+30, y:rnd(H*(BAND_TOP+0.02),H*BAND_BOT), vx:-rnd(16,26), hpMax:hp, hp:hp, r:ri(13,18), flash:0, atkT:rnd(0.8,1.4) });
  }
  function spawnDgBoss(){
    const hp=Math.max(300, dg.foeCP*0.5);
    mobs.push({ name:dg.name, col:dg.col, boss:true, shape:'boss', x:W+40, y:H*0.42, vx:-10, hpMax:hp, hp:hp, r:36, flash:0, atkT:rnd(0.8,1.4) });
  }
  function spawnMob(boss){
    const t=tierDef();
    /* ★ 홈 1인 서바이벌: 몹이 사방에서 스폰되어 중앙 영웅을 향해 직진 (원작: 10~20마리가 영웅을 원형으로 둘러쌈).
       던전은 이 함수를 안 쓰고 spawnDgMob/spawnDgBoss 를 쓰므로 종전대로 우→좌 (건드리지 않음).
       몹 객체에 vy(수직 속도)를 추가하고, 정지는 좌측 정지선(W*0.25)이 아니라 영웅 중앙 기준 반경으로 판정한다. */
    if(boss){
      // 홈 보스: 중앙 영웅 앞쪽에서 등장 (원작: 보스는 5웨이브마다 1체)
      const cx=W*HERO_CENTER_X, cy=H*HERO_CENTER_Y;
      const ang=rnd(0,6.28), dist=Math.max(W,H)*0.55;
      const sx=clamp(cx+Math.cos(ang)*dist, 0, W), sy=clamp(cy+Math.sin(ang)*dist*0.6, H*0.3, H*0.92);
      const dx=cx-sx, dy=cy-sy, dl=Math.max(1,Math.hypot(dx,dy)), sp=8;
      mobs.push({ name:t.n+' 군주', col:t.c, boss:true, shape:'boss', img:t.img, x:sx, y:sy, vx:dx/dl*sp, vy:dy/dl*sp*0.6,
        hpMax:t.hp*6, hp:t.hp*6, r:34, flash:0, atkT:rnd(1,2), homing:true, spd:sp });
      return;
    }
    const cx=W*HERO_CENTER_X, cy=H*HERO_CENTER_Y;
    const ang=rnd(0,6.28), dist=Math.max(W,H)*rnd(0.55,0.7);
    const sx=clamp(cx+Math.cos(ang)*dist, 0, W), sy=clamp(cy+Math.sin(ang)*dist*0.6, H*0.3, H*0.92);
    const dx=cx-sx, dy=cy-sy, dl=Math.max(1,Math.hypot(dx,dy)), sp=rnd(10,20);
    mobs.push({ name:t.n, col:t.c, shape:t.shape, img:t.img, x:sx, y:sy,
      vx:dx/dl*sp, vy:dy/dl*sp*0.6, hpMax:t.hp, hp:t.hp, r:ri(12,17), flash:0, atkT:rnd(0.8,1.6), homing:true, spd:sp });
  }
  function dmgText(x,y,val,crit,color){ fx.push({ type:'dmg', x, y, val, t:0, crit, color: color||(crit?'#ffd36a':'#ffffff') }); }
  function spark(x,y,color){ for(let i=0;i<7;i++){ const a=rnd(0,6.28),s=rnd(30,80); fx.push({type:'spark',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,color}); } }
  function drop(x,y,kind){ // 우상단 재화 아이콘으로 흡수(lerp)
    const tx = kind==='gold'? W*0.62 : W*0.5, ty = -H*0.02;
    drops.push({ x, y, sx:x, sy:y, tx, ty, t:0, kind });
  }

  function update(dt){
    const solo = isHuntSolo();
    /* ★ v5.53: 홈 모드에서 영웅이 죽었을 때 전투 완전 정지.
       - 몬스터 이동/스폰/반격 전부 멈춤
       - Die 애니메이션 + 카운트다운만 진행
       - 부활 시 몬스터 리스폰 + 전투 재개 */
    const allDead = heroes.length > 0 && heroes.every(h=>h.dead);
    if(solo && allDead){
      heroes.forEach(h=>{
        if(!h.dead) return;
        h.respT -= dt;
        if(h.dieAnimT == null) h.dieAnimT = 0;
        h.dieAnimT += dt;
        if(h.dieAnimT < 1.0) h.animFrame = Math.min(14, Math.floor(h.dieAnimT * 15));
        else h.animFrame = 14;
        if(h.respT <= 0){
          h.dead = false; h.hp = 1; h.dieAnimT = null; h.animFrame = 0;
          /* 부활 시 몬스터 리스폰 — 기존 몹 제거하고 새로 스폰 */
          mobs = []; spawnT = 0.3; wave = Math.max(1, wave);
        }
      });
      /* 몬스터도 멈춤 — 이동/반격 없음, fx만 갱신 */
      fx.forEach(f=>{
        if(f.type==='bolt') f.t += dt*4;
        else if(f.type==='spark'){ f.t+=dt*3; f.x+=f.vx*dt; f.y+=f.vy*dt; f.vy+=120*dt; }
        else if(f.type==='lvup') f.t += dt*2;
        else if(f.type==='skill') f.t += dt*2.5;
        else if(f.type==='skillfx'){ f.t += dt*2; f.frame = Math.floor(f.t * 15) % 15; }
        else f.t += dt;
      });
      fx = fx.filter(f=> f.type==='bolt' ? f.t<1.05 : (f.type==='aoe' ? f.t<0.4 : (f.type==='lvup' ? f.t<1.2 : (f.type==='skill' ? f.t<1.0 : (f.type==='skillfx' ? f.t<1.0 : f.t<1)))));
      drops.forEach(d=>{ d.t+=dt*1.1; const e=clamp(d.t,0,1); d.x=d.sx+(d.tx-d.sx)*Math.pow(e,1.6); d.y=d.sy+(d.ty-d.sy)*Math.pow(e,1.6); });
      drops = drops.filter(d=> d.t<1);
      if(shake>0) shake-=dt;
      return;  /* 전투 로직 전부 스킵 */
    }

    /* 홈 1인 중앙의 영웅 위치 */
    const hcx = (heroes[0] && !heroes[0].dead) ? heroes[0].x : W*HERO_CENTER_X;
    const hcy = (heroes[0] && !heroes[0].dead) ? heroes[0].y : H*HERO_CENTER_Y;
    heroes.forEach(h=>{
      if(h.dead){
        /* ★ v5.51: 사망 연출 — Die 애니메이션을 끝프레임에서 정지.
           respT가 3초→0초로 줄어드는 동안 마지막 프레임 고정.
           부활 시 전투 재개. */
        h.respT -= dt;
        /* Die 애니메이션: 처음 1초만 재생, 이후 마지막 프레임 고정 */
        if(h.dieAnimT == null) h.dieAnimT = 0;
        h.dieAnimT += dt;
        if(h.dieAnimT < 1.0){
          h.animFrame = Math.min(14, Math.floor(h.dieAnimT * 15));
        } else {
          h.animFrame = 14;  /* 마지막 프레임 고정 */
        }
        if(h.respT <= 0){
          h.dead = false; h.hp = 1; h.dieAnimT = null; h.animFrame = 0;
        }
        return;  /* 죽은 동안은 공격/이동 안 함 */
      }
      h.hp = Math.min(1, h.hp + 0.05*dt); // 자연 회복
      h.atkT -= dt;
      /* 스킬 쿨타임 감소 + 스킬 애니메이션 타이머 */
      if(h.skillCD) for(let si=0;si<4;si++) h.skillCD[si]=Math.max(0,(h.skillCD[si]||0)-dt);
      if(h.skillAnimT!=null){ h.skillAnimT += dt; if(h.skillAnimT>1.0){ h.skillAnim=null; h.skillAnimT=0; } }  /* ★ v5.46: 1초 재생 (15프레임 전부) */
      /* 일반 애니메이션 프레임 진행 */
      h.animT = (h.animT||0) + dt;
      if(h.animT > 0.08){ h.animT = 0; h.animFrame = ((h.animFrame||0)+1) % 15; }  /* ~12fps */
      if(h.atkT<=0 && mobs.length){
        h.atkT = rnd(0.7,1.1);
        const crit = Math.random()<0.22;
        const dgMul = (mode==='dungeon'&&dg) ? (dg.dmgMul||1) : 1;
        const dmg = Math.max(1, Math.round(Math.max(10, partyCP*0.08)*(crit?1.8:1)*rnd(0.85,1.15)*dgMul));
        h.dmgDone += dmg;
        /* ★ v5.36: 스킬 4종 — 단일/광역 혼합 + 스킬별 스프라이트 애니메이션.
           1차 (1.5쿨): 광역 (부채꼴 범위), Attack1 애니메이션
           2차 (9쿨):  단일 (가장 강한 몹 집중), Attack2 애니메이션
           3차 (20쿨): 광역 (대형 폭발), CastSpell 애니메이션
           궁극 (35쿨): 광역 (화면 전체), Special1 애니메이션 */
        const jobSkills = SKILLS[h.job.id] || SKILLS[Object.keys(SKILLS)[0]];
        let useSkill = -1;
        for(let si=3;si>=0;si--){
          if((h.skillCD[si]||0)<=0){ useSkill=si; break; }
        }
        let skillMul = 1, aoeR = 95, isUltimate = false, isSingle = false;
        /* ★ v5.50: 스킬→애니메이션 — 근접(Melee)과 원거리/마법(Ranged) 분리.
           근접: Melee2/MeleeSpin/Special2/CastSpell (Knight/Paladin/DeathKnight)
           원거리: Attack2/Attack3/Special2/CastSpell (Wizard/Mage/Archer 등) */
        const SKILL_ANIMS = MELEE_HEROS.indexOf(h.hid)>=0 ? MELEE_SKILL_ANIMS : RANGED_SKILL_ANIMS;
        if(useSkill>=0){
          const sk = jobSkills[useSkill];
          h.skillCD[useSkill] = sk[2];
          /* 스킬별 위력/범위/타입 + 애니메이션 */
          if(useSkill===0){ skillMul=1.5; aoeR=95; }                        // 1차: 광역
          else if(useSkill===1){ skillMul=4; aoeR=0; isSingle=true; }       // 2차: 단일 (강한 1체)
          else if(useSkill===2){ skillMul=5; aoeR=170; }                    // 3차: 대형 광역
          else { skillMul=8; aoeR=250; isUltimate=true; }                   // 궁극: 전체 광역
          /* 스프라이트 애니메이션 설정 */
          h.skillAnim = SKILL_ANIMS[useSkill];
          h.skillAnimT = 0;
          /* 이펙트 — 스킬 광역 원 + 발사체 스프라이트 */
          fx.push({ type:'skill', x:h.x, y:h.y, t:0, color:h.color, idx:useSkill,
            name:sk[0], r:aoeR||50, ult:isUltimate });
          /* ★ v5.44: 발사체 이펙트 — 영웅 정면(아래)에서 발사되어 확장. */
          fx.push({ type:'skillfx', x:h.x, y:h.y+10, t:0, color:h.color, idx:useSkill,
            jobId:h.job.id, frame:0, ox:h.x, oy:h.y+10 });
          if(isUltimate){
            shake = Math.max(shake, 0.4);
            sfx('legendary');
          }
        }
        const finalDmg = Math.round(dmg * skillMul);
        if(solo){
          if(isSingle){
            /* 단일 스킬 — 가장 강한(HP 높은) 몹 1체에 집중 타격 */
            const tgt = mobs.reduce((a,b)=> b.hp>a.hp?b:a, mobs[0]);
            hitMob(tgt, finalDmg, true, h.color);  /* 단일 스킬은 항상 크리 */
            dmgText(tgt.x, tgt.y-tgt.r-8, finalDmg, true, '#ff6a3a');
            spark(tgt.x, tgt.y, '#ff8a3a');
          } else {
            let hits=0;
            mobs.forEach(m=>{ if(Math.hypot(m.x-h.x, m.y-h.y) < aoeR){ hitMob(m, finalDmg, crit, h.color); hits++; } });
            if(hits===0 && mobs.length){
              const tgt = mobs.reduce((a,b)=> Math.hypot(b.x-h.x,b.y-h.y)<Math.hypot(a.x-h.x,a.y-h.y)?b:a, mobs[0]);
              hitMob(tgt, finalDmg, crit, h.color);
            }
            fx.push({ type:'aoe', x:h.x, y:h.y, r:aoeR, t:0, color:h.color });
          }
        } else {
          /* 파티 콘텐츠(던전/투기장) — 종전대로 단일 타겟 (가장 가까운/왼쪽 몹) */
          const target = mobs.reduce((a,b)=> (b.x<a.x?b:a), mobs[0]);
          if(h.ranged) fx.push({ type:'bolt', x:h.x+14, y:h.y, tx:target.x, ty:target.y, t:0, color:h.color, dmg:finalDmg, crit, target });
          else { h.lungeT = 0.18; hitMob(target, finalDmg, crit, h.color); }
        }
      }
      if(h.lungeT>0) h.lungeT -= dt;
    });
    // 몬스터 반격 — 홈은 영웅 중앙 인접 시, 던전은 전열 도달(W*0.26) 시. 상대가 부대보다 강할수록 아프다.
    {
      const cpRef = (mode==='dungeon'&&dg)? dg.foeCP : tierDef().cp;
      const foeMul = (mode==='dungeon'&&dg) ? (dg.dmgMul||1) : 1;   // ★ N2: '모든 데미지'라 반격도 함께 감소
      const alive=heroes.filter(h=>!h.dead);
      if(alive.length) mobs.forEach(m=>{
        /* ★ 홈: 영웅 중앙 기준 근접(거리<70) 시 반격 — stand-off(60) 밖 약간에서 때림. 던전: 전열 도달(W*0.26). */
        const inRange = solo ? (Math.hypot(m.x-hcx, m.y-hcy) < 70) : (m.x<=W*0.26+2);
        if(inRange){ m.atkT-=dt;
          if(m.atkT<=0){ m.atkT=rnd(1.1,1.7); const h=pick(alive);
            const r=(cpRef+300)/(partyCP+300);
            const hitF=clamp(0.035*Math.pow(r,1.7)*(m.boss?2.2:1), 0.004, 0.6)*foeMul;
            h.hp-=hitF; spark(h.x+8,h.y,'#e2504a'); dmgText(h.x+10,h.y-14,'-'+Math.max(1,Math.round(hitF*100)),false,'#ff7a6a');
            if(h.hp<=0){ h.hp=0; h.dead=true; h.respT=3; sfx('fail'); }  /* ★ v5.32: 부활 8→3초 */
          } }
      });
      if(heroes.length && heroes.every(h=>h.dead) && wiped<=0){ if(mode==='dungeon') endDungeon(false); else doWipe(); }
      if(wiped>0) wiped-=dt;
    }
    fx.forEach(f=>{
      if(f.type==='bolt'){ f.t += dt*4; if(f.t>=1 && !f.done){ f.done=true; if(mobs.includes(f.target)) hitMob(f.target, f.dmg, f.crit, f.color); } }
      else if(f.type==='spark'){ f.t+=dt*3; f.x+=f.vx*dt; f.y+=f.vy*dt; f.vy+=120*dt; }
      else if(f.type==='lvup'){ f.t += dt*2; }
      else if(f.type==='skill'){ f.t += dt*2.5; }
      else if(f.type==='skillfx'){ f.t += dt*2; f.frame = Math.floor(f.t * 15) % 15; }  /* ★ v5.43: 발사체 애니메이션 */
      else f.t += dt;
    });
    fx = fx.filter(f=> f.type==='bolt' ? f.t<1.05 : (f.type==='aoe' ? f.t<0.4 : (f.type==='lvup' ? f.t<1.2 : (f.type==='skill' ? f.t<1.0 : (f.type==='skillfx' ? f.t<1.0 : f.t<1)))));
    mobs.forEach(m=>{
      /* ★ 홈 서바이벌: 몹이 영웅을 '에워싸며' 멈추는 flocking-style 이동.
         ① Arrival 감속 — 목표 거리(STANDOFF)에 가까워질수록 속도를 선형 줄여 급정거 방지.
         ② Separation — 다른 몹와 너무 가까우면 서로 밀어내 원형으로 퍼져 둘러싸기 유도.
         던전은 이 블록 전체를 안 타고 종전대로 x만 이동(좌측 정지선 W*0.25). */
      if(solo){
        /* ★ v5.42: STANDOFF/분리 로직 간소화 — 몬스터가 서로 겹칠 수 있게.
           종전엔 MON_SCALE 반영으로 분리 거리가 너무 커서(68px+) 몬스터가
           서로를 밀어내며 영웅에게 다가가지 못했음.
           분리는 최소한(겹치면 살짝만 밀어냄)으로 하고, 영웅 접근을 우선. */
        const mscale = (m.img && MON_SCALE[m.img]) || 1;
        const dispR = (m.r||14) * 1.2 * mscale;
        const STANDOFF = dispR + (m.boss ? 40 : 25);
        const dx = hcx - m.x, dy = hcy - m.y;
        const dl = Math.max(1, Math.hypot(dx, dy));
        const baseSp = m.spd || 14;
        // ① arrival: 목표 거리 바깥에서만 전진.
        if(dl > STANDOFF){
          const slow = clamp((dl - STANDOFF) / 50, 0, 1);
          const sp = baseSp * slow;
          m.x += (dx/dl) * sp * dt;
          m.y += (dy/dl) * sp * dt;
        }
        // ② separation: 최소한만 — 완전히 겹쳤을 때만 살짝 밀어냄 (push 0.1)
        for(const o of mobs){
          if(o===m) continue;
          const ox = m.x - o.x, oy = m.y - o.y;
          const ol = Math.hypot(ox, oy);
          const minD = 12;  // 거의 겹쳤을 때만 (상수 12px)
          if(ol > 0 && ol < minD){
            const push = (minD - ol) * 0.1;   // 매우 약하게 (0.1 = 10%)
            m.x += (ox/ol) * push;
            m.y += (oy/ol) * push;
          }
        }
        // 화면 밖으로 나가지 않게 클램프 (홈 필드 내 머무름)
        m.x = clamp(m.x, 6, W-6); m.y = clamp(m.y, H*0.28, H*0.95);
      } else {
        m.x += m.vx*dt; if(m.x < W*0.25) m.x = W*0.25;
      }
      if(m.flash>0) m.flash-=dt;
    });
    spawnT -= dt;
    if(mode==='dungeon' && dg){
      dg.timeLeft-=dt;
      // 승리 판정을 타임아웃보다 먼저 — 마지막 처치와 시간초과가 같은 프레임에 겹쳐도 승리 우선
      if(dg.kind==='mobs'){
        if(dg.killed>=dg.total){ endDungeon(true); return; }
        if(dg.timeLeft<=0){ endDungeon(false); return; }
        if(spawnT<=0 && dg.spawned<dg.total && mobs.length<5){ spawnDgMob(); dg.spawned++; spawnT=rnd(0.4,0.9); }
      } else if(dg.kind==='wave'){
        // ★ B5/G-77: 웨이브 단위 제한시간. 그룹을 다 잡으면 웨이브가 오르고 60초가 다시 채워진다.
        dg.waveTimeLeft-=dt;
        if(dg.waveTimeLeft<=0){ endDungeon(false); return; }
        if(dg.groupLeft>0){
          if(spawnT<=0 && mobs.length<5){ spawnDgMob(); dg.groupLeft--; dg.spawned++; spawnT=rnd(0.35,0.8); }
        } else if(mobs.length===0){
          dg.waveNo++; dg.waveTimeLeft=dg.waveDur;
          dg.groupLeft=3+Math.min(9,dg.waveNo);
          dg.foeCP=Math.round(dg.baseCP*Math.pow(1.18, dg.waveNo-1));  // 웨이브마다 +18% — 세션이 무한정 길어지지 않게
        }
      } else {
        if(!dg.bossSpawned){ spawnDgBoss(); dg.bossSpawned=true; }
        else if(!mobs.some(m=>m.boss) && dg.killed>0){ endDungeon(true); return; }
        if(dg.timeLeft<=0){ endDungeon(false); return; }
      }
    } else {
      if(wave%5===0 && wave!==lastBossWave && !mobs.some(m=>m.boss)){ spawnMob(true); lastBossWave=wave; }
      // ★ v5.9: 마릿수 선택기(S.mobCount, 원작 기본 30)가 홈 필드 동시 스폰 상한을 결정한다.
      //   웨이브 진행도·칭호 보너스는 하한선(점점 더 몰려오게) 역할만 하고, mobCount가 최종 상한이다.
      //   ★ F2/A2: 칭호 '불씨의 벗' — 작열 8세트 달성 시 보유 적용(TITLES 주석 참조).
      const floor = 6 + Math.min(6, Math.floor(wave/3)) + titleSpawnBonus();
      const cap = Math.max(floor, (S.mobCount||30));
      if(spawnT<=0 && mobs.length<cap){ spawnMob(); spawnT = rnd(0.4,1.0); }
    }
    if(shake>0) shake-=dt;
    drops.forEach(d=>{ d.t+=dt*1.1; const e=clamp(d.t,0,1); const ease=e<0.5? e : e; d.x=d.sx+(d.tx-d.sx)*Math.pow(e,1.6); d.y=d.sy+(d.ty-d.sy)*Math.pow(e,1.6); });
    drops = drops.filter(d=> d.t<1);
  }
  function hitMob(m, dmg, crit, color){
    if(!mobs.includes(m)) return;
    m.hp -= dmg; dmgText(m.x, m.y-m.r-4, dmg, crit, color); m.flash = 0.12;
    if(crit){ shake=0.14; spark(m.x,m.y,color); }
    if(m.hp<=0){ const mx=m.x,my=m.y,boss=m.boss; mobs = mobs.filter(x=>x!==m); spark(mx,my,boss?'#ffd36a':'#ff8a3c');
      if(boss){ shake=0.3; for(let i=0;i<12;i++) spark(mx+rnd(-22,22),my+rnd(-22,22),'#ffd36a'); } onKill(m,mx,my,boss); }
  }
  function doWipe(){
    wiped=2.6; mobs=[]; sfx('fail');
    const old=(S.huntTier||0);
    // ★ 원작 규칙: 전멸하면 "이전 단계"가 아니라 최하급 몬스터 맵으로 후퇴한다.
    //   방치하다 죽으면 저레벨 몹을 비효율로 사냥하게 되고, 유저가 직접 다시 세팅해야 한다.
    if(old>0){ S.huntTier=0;
      toast(`부대 전멸! 최하급 사냥터(${HUNT_TIERS[0].n})로 후퇴 — 몬스터를 다시 선택하세요`);
      sysLog(`부대 전멸 · <span style="color:#e2504a">${HUNT_TIERS[old].n}</span> 실패 → <b>${HUNT_TIERS[0].n}(최하급)</b>으로 후퇴. 재세팅 필요`);
    } else toast('부대 전멸! 잠시 후 부활합니다');
    setTimeout(()=>{ if(mode==='dungeon') return; heroes.forEach(h=>{ h.dead=false; h.hp=1; h.respT=0; }); wave=1; }, 2400);
  }
  function onKill(m,mx,my,boss){
    if(mode==='dungeon'&&dg){ dg.killed++; S.stats.kills++; sfx(boss?'legendary':'coin'); addGold(ri(200,600)); return; } // 던전 보상은 결과창에서 일괄
    const t=tierDef();
    S.stats.kills++; sfx(boss?'legendary':'coin');
    /* ★ v5.30: 홈 AoE 다중 킬 골드 밸런스 — 마리당 골드가 불칸(분당 18,885G)의
       55배였던 원인 수정. AoE로 N마리를 동시에 잡으면 각 몹 골드를 1/N 분배.
       30마리 동시 킬 시 각 몹 = t.gold/30 → Lv10 기준 분당 약 34,000G (불칸의 1.8배).
       던전·보스는 그대로 (단일 타겟이라 과급 없음).
       ★ v5.40: mobs.length 대신 S.mobCount(설정 마릿수) 사용 —
       onKill 시점엔 이미 죽은 몹이 빠져 있어 1/N 분배가 비일관적이었음. */
    const aoeGoldDiv = isHuntSolo() ? Math.max(1, (S.mobCount||30)) : 1;
    addGold(Math.max(1, Math.round(((boss?8:1)*t.gold + ri(0,Math.round(t.gold*0.4))) / aoeGoldDiv))); drop(mx, my, 'gold');
    // ★ 몬스터별 고정 드랍 — 이 몬스터가 떨구는 재료 등급은 정해져 있다
    const dropBuff = holdOwn('nest') ? 1.15 : 1; // 점령전: 잿불 군락 드랍률 +15% (★ B8/G-109 holds 스키마 객체화)
    // ★ F2: 원작 칭호 효과 축에 '드랍률'은 없다 → 칭호(badhand) 분기를 제거하고 기본 확률로 되돌렸다.
    const p = (boss?1:0.35) * dropBuff;
    /* ★ v4.3: 등급 공용풀 폐지 → 사냥터마다 '여기서만 나오는 대표 재료'(t.mat)를 떨군다.
       다음 티어로 올라갈 이유가 골드 배율뿐이 아니라 "그 재료가 여기서만 나온다"가 되도록. */
    if(Math.random()<p){ matGain(t.mat, boss?ri(2,4):1); drop(mx-8,my,'mat'); }
    if(t.sub && Math.random()<0.25){ matGainGrade(t.sub, 1); }   // 하위 등급은 아무 재료나 소량
    /* ★ v5.29: 같은 등급 랜덤 추가 드랍 (10%) — 몬스터가 5종이라 고정 드랍이 5개 재료만
       커버한다. 6번째 재료(잿가루/서리결정/천공수정/금강석)는 전투로 얻을 수 없었는데,
       같은 등급 풀에서 랜덤 드랍을 추가해 제작 교착을 방지한다.
       불칸 원작도 전투 드랍 + 재료 소환(랜덤) + 합성으로 전 재료를 커버한다. */
    if(Math.random()<0.10){ matGainGrade(t.drop, 1); }
    /* ★ A3-1: 회색코인(S.gray)은 전투 드랍으로 충전되지 않는다.
       근거 — UI재현카탈로그 '길드 상점 — 회색코인(길드코인) 전용 교환소' 절:
       "코인은 길드 레이드/약탈/기여로만 충전(상점 구매 불가)".
       종전의 일반몹 3% 드랍·보스 드랍 2경로를 제거했다. 획득처는 길드 레이드 / 약탈 / 길드 기여(점령전) 뿐. */
    if(boss){ toast(`${m.name} 처치! ${GRADES[t.drop].name} 재료 대량 획득`); matGainGrade(t.drop, ri(1,3)); }  // 보스는 등급 내 랜덤 추가 드랍
    if(S.stats.kills % 12 === 0) wave++;
    /* ★ v5.26: 영웅 자동 레벨업 — 킬 시 참여 영웅에게 경험치 축적.
       ★ v5.30: 골드 ÷30 페널티와 동일하게 AoE 다중 킬 EXP 과급 해결.
         ×750 — Lv1→2(2분), Lv5(20분), Lv10(1시간), Lv20(2.5시간).
       보스는 5배 경험치. 칭호·상점 경험치 버프 배수 적용.
       S.heroes[hid].exp 에 누적 (정수), 초과분은 다음 레벨로 이월. */
    /* ★ v5.29.1: 경험치 버프(expUntil) + 칭호 경험치 효과 모두 반영.
       종전엔 titleExpMul()만 써서 상점 '경험치+100%' 버프가 안 먹었음. */
    const expMul = titleExpMul() * ((S.buffs && S.buffs.expUntil > Date.now()) ? 2 : 1);
    const baseExp = boss ? 5 : 1;
    try { heroes.forEach(h=>{
      if(!h.hid) return;
      const st = S.heroes[h.hid]; if(!st) return;
      /* ★ v5.39: dead 여부와 상관없이 EXP 획득 — 죽어있어도 팀원이 잡으면 경험치를 받음.
         종전엔 h.dead일 때 return으로 스킵해서, 자주 죽으면 레벨업이 안 됐음. */
      st.exp = (st.exp||0) + Math.max(1, Math.round(baseExp * expMul));
      /* ★ v5.39: need를 while 안에서 매번 재계산 — 종전엔 루프 바깥에서 한 번만 계산해서
         다단계 레벨업이 안 됐음. */
      while(st.exp >= (st.level||1) * 250 && (st.level||1) < 999){
        st.exp -= (st.level||1) * 250;
        st.level = (st.level||1) + 1;
        h.lvl = st.level;
        h.cp = heroPower({grade:h.grade, level:st.level});
        h.hp = 1; h.dead = false; h.respT = 0;
        const newLv = st.level;
        fx.push({ type:'lvup', x:h.x, y:h.y, t:0, color:'#ffd36a' });
        if(newLv % 5 === 0 || newLv <= 3){
          toast('\u2605 ' + (h.name || '영웅') + ' Lv.' + newLv + '! 전투력 ' + fmt(h.cp));
          sfx('win');
        }
      }
    }); } catch(ee) { if(typeof console!=='undefined') console.error('EXP error:', ee.message, 'heroes:', heroes.length, 'first hid:', heroes[0]&&heroes[0].hid); }
    partyCP = Math.max(1, heroes.reduce((a,h)=>a+h.cp,0));
  }

  /* --------- 렌더 --------- */
  function draw(){
    if(!ctx) return;
    ctx.clearRect(0,0,W,H);
    const sx=shake>0?(Math.random()-0.5)*shake*36:0, sy=shake>0?(Math.random()-0.5)*shake*36:0;
    ctx.save(); ctx.translate(sx,sy);
    // ★ v5.23: 캔버스 배경 채우기 제거 — #stage-wrap 의 CSS 배경(bg_battle.png)이 보이게.
    //   어둡게 하려면 CSS 에서 배경 위에 overlay 를 주면 된다.
    // ★ v5.33: drawFloor() 제거 — 전투 배경(bg_battle.png)만 표시.
    const fx0 = ctx.createRadialGradient(W*0.08,H*0.14,4, W*0.08,H*0.14,90);
    fx0.addColorStop(0,'rgba(255,130,50,.5)'); fx0.addColorStop(1,'rgba(255,130,50,0)');
    ctx.fillStyle=fx0; ctx.beginPath(); ctx.arc(W*0.08,H*0.14,90,0,7); ctx.fill();
    drops.forEach(d=>{ ctx.globalAlpha=clamp(1-d.t*0.6,0,1); ctx.font='16px serif'; ctx.textAlign='center'; ctx.fillText(d.kind==='gold'?'🪙':'📦', d.x, d.y); ctx.globalAlpha=1; });
    mobs.forEach(drawMob);
    heroes.forEach(drawHero);
    fx.forEach(f=>{
      if(f.type==='bolt'){ const x=f.x+(f.tx-f.x)*Math.min(f.t,1), y=f.y+(f.ty-f.y)*Math.min(f.t,1);
        ctx.fillStyle=f.color; ctx.globalAlpha=.9; ctx.beginPath(); ctx.arc(x,y,4,0,7); ctx.fill();
        ctx.globalAlpha=.35; ctx.beginPath(); ctx.arc(x,y,8,0,7); ctx.fill(); ctx.globalAlpha=1;
      } else if(f.type==='spark'){ ctx.globalAlpha=clamp(1-f.t,0,1); ctx.fillStyle=f.color; ctx.beginPath(); ctx.arc(f.x,f.y,2.2,0,7); ctx.fill(); ctx.globalAlpha=1;
      } else if(f.type==='dmg'){ ctx.globalAlpha=clamp(1-f.t,0,1); ctx.fillStyle=f.color; ctx.font=`${f.crit?'bold 18':'14'}px 'Malgun Gothic',sans-serif`; ctx.textAlign='center'; ctx.fillText(f.val, f.x, f.y - f.t*26); ctx.globalAlpha=1; }
      /* ★ 홈 1인 광역(AoE) 이펙트 — 원작 "광역 화염 이펙트로 다수 동시 타격" 재현.
         확장되는 원형 화염 + 페이드아웃. f.t: 0→1 진행. */
      else if(f.type==='aoe'){ const e=f.t/0.4; ctx.globalAlpha=clamp(1-e,0,1)*0.55;
        const grad=ctx.createRadialGradient(f.x,f.y,2,f.x,f.y,f.r*(0.6+e*0.5));
        grad.addColorStop(0,f.color); grad.addColorStop(1,f.color+'00');
        ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(0.6+e*0.5),0,7); ctx.fill(); ctx.globalAlpha=1; }
      /* ★ v5.31: 레벨업 파티클 — 확장하는 금빛 링 + 상승하는 별. */
      else if(f.type==='lvup'){ const e=f.t/1.2;
        ctx.globalAlpha=clamp(1-e,0,1);
        const r=8+e*30;
        ctx.strokeStyle=f.color; ctx.lineWidth=2+e*2; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,7); ctx.stroke();
        ctx.fillStyle=f.color; ctx.font=`${10+e*4}px serif`; ctx.textAlign='center';
        ctx.fillText('★', f.x+rnd(-6,6), f.y-e*40+rnd(-6,6));
        ctx.globalAlpha=1; }
      /* ★ v5.35: 스킬 4종 완전 차별화 연출 — 단계마다 다른 시각 효과. */
      else if(f.type==='skill'){
        const e = f.t / 1.0;
        const idx = f.idx || 0;
        const R = f.r || 95;
        ctx.textAlign = 'center';
        if(idx === 3){
          /* 궁극기 (35쿨) — 화면 전체 번쩍임 + 대형 3중 폭발 + 스킬명 */
          ctx.globalAlpha = clamp(1-e, 0, 1);
          if(e < 0.15){ ctx.fillStyle = 'rgba(255,255,255,'+(0.5*(1-e/0.15))+')'; ctx.fillRect(0,0,W,H); }
          const r1 = R*(0.3+e*0.8);
          for(const [r,lw,a] of [[r1,4,0.6],[R*(0.2+e*0.6),3,0.5],[R*(0.1+e*0.4),2,0.4]]){
            ctx.globalAlpha = clamp(1-e,0,1)*a; ctx.strokeStyle = f.color; ctx.lineWidth = lw;
            ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke();
          }
          ctx.globalAlpha = clamp(1-e,0,1)*0.8;
          const grad = ctx.createRadialGradient(f.x,f.y,2,f.x,f.y,R*0.5);
          grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.3,f.color); grad.addColorStop(1,f.color+'00');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(f.x,f.y,R*0.5*(0.5+e*0.5),0,7); ctx.fill();
          if(e < 0.6){ ctx.globalAlpha = clamp(1-e/0.6,0,1);
            ctx.fillStyle = '#ffd36a'; ctx.font = "bold 18px 'Malgun Gothic'";
            ctx.fillText('\u2605 '+f.name+' \u2605', f.x, f.y - R*0.6); }
          ctx.globalAlpha = 1;
        } else if(idx === 2){
          /* 3차 (20쿨) — 대형 광역 + 회전 광선 3줄 */
          ctx.globalAlpha = clamp(1-e,0,1)*0.7;
          const r = R*(0.4+e*0.6);
          const grad = ctx.createRadialGradient(f.x,f.y,5,f.x,f.y,r);
          grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.3,f.color); grad.addColorStop(1,f.color+'00');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,7); ctx.fill();
          ctx.strokeStyle = f.color; ctx.lineWidth = 3;
          for(let k=0;k<3;k++){
            const ang = e*3.14 + k*2.09;
            ctx.beginPath(); ctx.moveTo(f.x,f.y);
            ctx.lineTo(f.x+Math.cos(ang)*r, f.y+Math.sin(ang)*r); ctx.stroke();
          }
          if(e < 0.4){ ctx.fillStyle='#fff'; ctx.font="bold 13px 'Malgun Gothic'";
            ctx.fillText(f.name, f.x, f.y - r - 10); }
          ctx.globalAlpha = 1;
        } else if(idx === 1){
          /* 2차 (9쿨) — 중형 광역 + 확장 링 */
          ctx.globalAlpha = clamp(1-e,0,1)*0.6;
          const r = R*(0.5+e*0.5);
          const grad = ctx.createRadialGradient(f.x,f.y,3,f.x,f.y,r);
          grad.addColorStop(0,f.color); grad.addColorStop(0.6,f.color+'60'); grad.addColorStop(1,f.color+'00');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,7); ctx.fill();
          ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(f.x,f.y,r*0.85,0,7); ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          /* 1차 (1.5쿨) — 소형 플래시 (자주 나오니 짧고 가볍게) */
          ctx.globalAlpha = clamp(1-e,0,1)*0.35;
          const r = R*(0.6+e*0.3);
          const grad = ctx.createRadialGradient(f.x,f.y,2,f.x,f.y,r);
          grad.addColorStop(0,f.color+'aa'); grad.addColorStop(1,f.color+'00');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,7); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      /* ★ v5.43: 스킬 발사체 이펙트 스프라이트 렌더링. */
      else if(f.type==='skillfx'){
        const spr = skillFxSprite(f.jobId, f.idx, f.frame||0);
        if(spr && spr.complete && spr.naturalWidth>0){
          const e = f.t / 1.0;
          ctx.globalAlpha = clamp(1-e, 0, 1) * 0.9;
          const sizes = [20, 24, 48, 80];
          const sz = sizes[Math.min(f.idx||0, 3)];
          const drawSz = sz * (1 + e * 0.5);
          /* ★ v5.44: 발사체가 정면(아래)으로 퍼져나감 — 시작점에서 점진적 확장. */
          const fx_x = (f.ox||f.x) + (Math.random()-0.5) * e * 8;
          const fx_y = (f.oy||f.y) + e * 15;  /* 아래로 약간 이동하며 확산 */
          ctx.drawImage(spr, fx_x - drawSz/2, fx_y - drawSz/2, drawSz, drawSz);
          ctx.globalAlpha = 1;
        }
      }
    });
    if(mode==='dungeon'&&dg){
      // 던전 분위기 + 상단 정보(이름·진행·남은 시간)
      ctx.fillStyle='rgba(120,30,20,.14)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#f6ecd4'; ctx.font="bold 14px 'Malgun Gothic'"; ctx.textAlign='center';
      ctx.fillText('⚔ '+dg.name, W/2, 18);
      if(dg.kind==='wave'){
        // ★ B5/G-77: 대형 적색 Wave 표기 + 웨이브 카운트다운
        ctx.fillStyle='#e2504a'; ctx.font="bold 24px 'Malgun Gothic'"; ctx.textAlign='center';
        ctx.fillText('Wave '+dg.waveNo, W/2, H*0.30);
        ctx.fillStyle='#f0a24a'; ctx.font="bold 15px 'Malgun Gothic'";
        ctx.fillText(Math.max(0,dg.waveTimeLeft).toFixed(0)+'s', W/2, H*0.30+20);
        ctx.fillStyle='#c9bb9c'; ctx.font="10px 'Malgun Gothic'";
        ctx.fillText(`잔여 ${dg.groupLeft+mobs.length}체 · 클리어 시 ${dg.waveDur}초 리셋`, W/2, 34);
      } else {
        ctx.fillStyle='#f0a24a'; ctx.font="11px 'Malgun Gothic'";
        ctx.fillText((dg.kind==='mobs'? `처치 ${dg.killed}/${dg.total} · `:'')+`남은 ${Math.max(0,dg.timeLeft).toFixed(0)}s`, W/2, 34);
      }
      // 보스 HP = 상단 전폭 붉은 바 (원작: 보스 머리 위가 아니라 화면 상단 고정)
      const bossM=mobs.find(m=>m.boss);
      if(bossM){ ctx.fillStyle='#2a0d0b'; ctx.fillRect(8,42,W-16,10);
        ctx.fillStyle='#d84a3f'; ctx.fillRect(8,42,(W-16)*clamp(bossM.hp/bossM.hpMax,0,1),10);
        ctx.strokeStyle='#5a1f18'; ctx.strokeRect(8,42,W-16,10); }
    } else {
      // WAVE + 사냥 대상 라벨 (좌상단)
      const td=tierDef();
      ctx.fillStyle='rgba(240,228,201,.9)'; ctx.font="bold 12px 'Malgun Gothic'"; ctx.textAlign='left';
      ctx.fillText('WAVE '+wave, 10, 16);
      ctx.fillStyle=td.c; ctx.font="10px 'Malgun Gothic'"; ctx.textAlign='right';
      ctx.fillText('사냥: '+td.n+' ('+GRADES[td.drop].name+' 재료)', W-8, 16);
    }
    // 전멸 오버레이
    if(wiped>0){
      ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#e2504a'; ctx.font="bold 26px 'Malgun Gothic'"; ctx.textAlign='center';
      ctx.fillText('부 대 전 멸', W/2, H*0.4);
      ctx.fillStyle='#e8ddc9'; ctx.font="12px 'Malgun Gothic'";
      ctx.fillText('최하급 사냥터로 후퇴합니다…', W/2, H*0.4+24);
    }
    ctx.restore();
  }
  function drawFloor(){
    ctx.strokeStyle='rgba(70,58,40,.35)'; ctx.lineWidth=1;
    for(let i=0;i<=8;i++){ const y=H*0.5 + (i/8)*H*0.5; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    for(let i=-6;i<=12;i++){ const x0=W*0.5 + (i/12)*W*0.5; ctx.beginPath(); ctx.moveTo(W*0.5+(i/12)*W*0.12, H*0.5); ctx.lineTo(x0*1.1, H); ctx.stroke(); }
  }
  /* ★ v5.76→v5.79: 스프라이트시트 기반 drawHero — 8방향 지원 + 발 피봇 정렬.
     시트에서 (col×128, row×128) 영역을 잘라 캔버스에 그림.
     ★ v5.79: dx/dy는 더 이상 '셀 좌상단'이 아니라 '발 피봇 위치(영웅 좌표)'.
     내부에서 피봇 오프셋을 빼서 셀 좌상단을 계산한다.
     발(footX, footY)이 영웅의 (dx, dy)에 정렬되므로, 방향 전환 시 발이 고정되고
     몸통만 회전하는 자연스러운 모션이 됨. */
  function drawHeroSheet(h, animName, frame, row, dx, dy, sz, alpha){
    const dir = HERO_SPRITE_DIR[h.hid];
    if(!dir) return false;
    const sheet = HERO_SHEETS[dir+'/'+animName];
    if(!sheet || !sheet.complete || sheet.naturalWidth<=0) return false;
    const sx = (frame % COLS) * CELL;
    const sy = row * CELL;
    /* 피봇 보정 — 셀 내 발 위치를 영웅 좌표(dx,dy)에 정렬 */
    const p = heroPivot(h.hid);
    const scale = sz / CELL;  /* 128→sz 스케일 */
    const ox = dx - p.fx * scale;
    const oy = dy - p.fy * scale;
    ctx.globalAlpha = alpha||1;
    ctx.drawImage(sheet, sx, sy, CELL, CELL, ox, oy, sz, sz);
    ctx.globalAlpha = 1;
    return true;
  }

  function drawHero(h){
    const lx = h.lungeT>0 ? 10 : 0;
    const sz = 144;

    /* ★ v5.78: 타겟 락온 — 방향 요동 방지.
       문제: 30마리가 둘러싸면 매 프레임 최근접 몹이 바뀌어 방향이 요동침.
       해결: 한 번 타겟을 잠그면 0.4초간 유지. 타겟이 죽거나 AoE 범위를 벗어나면 즉시 재선택.
       공격 애니메이션(skillAnim) 중에는 방향 고정 — 모션이 끊기지 않게. */
    let row = 5;  /* 기본 남쪽(정면) */
    const AOE_R = 95;
    if(mobs.length > 0){
      const now = performance.now();
      /* 기존 락온 타겟이 유효한지 확인 */
      let tgt = h._lockTarget || null;
      if(tgt){
        /* 죽었거나 사라졌거나 너무 멀어지면 해제 */
        if(!mobs.includes(tgt)){
          tgt = null;
        } else {
          const td = Math.hypot(tgt.x-h.x, tgt.y-h.y);
          if(td > AOE_R * 1.3) tgt = null;  /* 30% 여유 → 벗어나면 재선택 */
        }
      }
      /* 락온 만료 or 타겟 없음 → 새 타겟 선택 */
      if(!tgt || (h._lockUntil && now > h._lockUntil)){
        let nearest = null, minD = Infinity;
        for(const m of mobs){
          const d = (m.x-h.x)*(m.x-h.x) + (m.y-h.y)*(m.y-h.y);
          if(d <= AOE_R*AOE_R && d < minD){ minD = d; nearest = m; }
        }
        /* AoE 안에 없으면 전체에서 최근접 */
        if(!nearest){
          for(const m of mobs){
            const d = (m.x-h.x)*(m.x-h.x) + (m.y-h.y)*(m.y-h.y);
            if(d < minD){ minD = d; nearest = m; }
          }
        }
        tgt = nearest;
        h._lockTarget = tgt;
        h._lockUntil = now + 400;  /* 0.4초 락온 유지 */
      }
      if(tgt){
        const ang = Math.atan2(tgt.y - h.y, tgt.x - h.x);
        row = angleToRow(ang);
      }
    } else {
      h._lockTarget = null;  /* 몹 없으면 락온 해제 */
    }
    h._row = row;

    if(h.dead){
      const respPct = clamp(h.respT / 3, 0, 1);
      const dieFrame = Math.min(14, Math.floor((h.animFrame||0)));
      const diePhase = h.dieAnimT || 0;
      const alpha = diePhase < 1.0 ? 1.0 : (respPct > 0.5 ? 0.7 : 0.5);
      ctx.fillStyle='rgba(80,20,20,.4)'; ctx.beginPath(); ctx.ellipse(h.x, h.y+18, 20, 7, 0,0,7); ctx.fill();
      /* ★ v5.79: 발 피봇 — Die 시트도 같은 피봇 사용. 발을 그림자(h.y+18)에 정렬. */
      const drew = drawHeroSheet(h, 'Die', dieFrame, row, h.x, h.y+18, sz, alpha);
      if(!drew){
        roundRectPath(h.x-14, h.y-8, 28, 30, 8); ctx.globalAlpha=alpha; ctx.fillStyle='#3a2020'; ctx.fill(); ctx.globalAlpha=1;
        ctx.font='24px serif'; ctx.textAlign='center'; ctx.fillText('\uD83D\uDC80', h.x, h.y);
      }
      ctx.fillStyle='#ff6a4a'; ctx.font="bold 12px 'Malgun Gothic'"; ctx.textAlign='center';
      ctx.fillText(Math.ceil(h.respT)+'초 후 부활', h.x, h.y-42);
      reviveMark(h.respT);
      return;
    }

    /* 그림자 */
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(h.x+lx, h.y+20, 16, 5, 0,0,7); ctx.fill();

    const animName = heroAnimName(h);
    /* 스킬 발동 중 글로우 */
    if(h.skillAnim){
      const glow = ctx.createRadialGradient(h.x+lx,h.y,2,h.x+lx,h.y,40);
      glow.addColorStop(0,h.color+'aa'); glow.addColorStop(1,h.color+'00');
      ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(h.x+lx,h.y,40,0,7); ctx.fill();
    }

    /* ★ v5.79: 발 피봇 정렬 — 발을 그림자 중심(h.x+lx, h.y+20)에 고정.
       lx(lungeT 오프셋)도 발에 적용해서 돌진 시 발이 미끄러지듯 이동. */
    const drew = drawHeroSheet(h, animName, h.animFrame||0, row, h.x+lx, h.y+20, sz, 1);
    if(!drew){
      /* 폴백 — 시트 로드 전/실패 시 */
      const a = ctx.createRadialGradient(h.x+lx,h.y,2,h.x+lx,h.y,26);
      a.addColorStop(0, h.color+'99'); a.addColorStop(1, h.color+'00');
      ctx.fillStyle=a; ctx.beginPath(); ctx.arc(h.x+lx,h.y,26,0,7); ctx.fill();
      roundRectPath(h.x-12+lx, h.y-6, 24, 26, 8); ctx.fillStyle=h.color; ctx.fill(); ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.stroke();
      ctx.font='20px serif'; ctx.textAlign='center'; ctx.fillText(h.face, h.x+lx, h.y-6);
    }
    /* ★ 홈 1인: 원작형 머리 위 정보 (이름표 + HP/MP 2단 바). 던전 파티는 종전대로 직업명+HP 1단.
       원작 실측(전량판독 라인 33/73): "영웅 머리 위에 이름 + 원형 레벨 뱃지 + 적색 HP바/청색 MP바 2단". */
    if(isHuntSolo()){
      const nm = h.name || h.job.name;
      /* ★ v5.54: 불칸형 레이아웃 — 이름 + 원형 레벨 뱃지(이름 좌측) + HP/MP 바.
         이름이 머리 위 중앙, 레벨 뱃지는 이름 왼쪽에 원형으로.
         ★ v5.79: 발 피봇 적용으로 캐릭터가 위로 커졌으므로 이름표/HP바도 위로 이동. */
      const nmY = h.y - 58;
      ctx.font="bold 10px 'Malgun Gothic'";
      const nmW = ctx.measureText(nm).width;
      /* 원형 레벨 뱃지 — 이름 왼쪽 */
      const lvX = h.x + lx - nmW/2 - 12, lvY = nmY - 3;
      ctx.fillStyle='rgba(20,15,10,.92)'; ctx.beginPath(); ctx.arc(lvX, lvY, 9, 0, 7); ctx.fill();
      ctx.strokeStyle=h.color; ctx.lineWidth=2; ctx.stroke(); ctx.lineWidth=1;
      ctx.fillStyle='#f0d59a'; ctx.font="bold 9px 'Malgun Gothic'"; ctx.textAlign='center';
      ctx.fillText(h.lvl||1, lvX, lvY+3);
      /* 이름표 */
      ctx.font="bold 10px 'Malgun Gothic'"; ctx.fillStyle=(GRADES[h.grade]&&GRADES[h.grade].color)||'#e8ddc9';
      ctx.textAlign='center'; ctx.fillText(nm, h.x+lx, nmY);
      // HP(적색) + MP(청색) 2단 바 — ★ v5.79: 이름표 아래, 머리 위
      const hw=34, hx=h.x+lx-hw/2, hy1=h.y-52, hy2=h.y-48;
      ctx.fillStyle='#3a0d0d'; ctx.fillRect(hx,hy1,hw,3);
      ctx.fillStyle= h.hp>0.5 ? '#e2504a' : (h.hp>0.25?'#e8a04a':'#a03030');
      ctx.fillRect(hx,hy1,hw*clamp(h.hp,0,1),3);
      ctx.fillStyle='#0c1a3a'; ctx.fillRect(hx,hy2,hw,2);
      ctx.fillStyle='#4db6e8'; ctx.fillRect(hx,hy2,hw,2);
    } else {
      ctx.font="9px 'Malgun Gothic'"; ctx.fillStyle=(GRADES[h.grade]&&GRADES[h.grade].color)||'#e8ddc9'; ctx.fillText(h.job.name, h.x+lx, h.y-48);
      const hw=30, hx=h.x+lx-hw/2, hy=h.y-45;
      ctx.fillStyle='#0c1a2a'; ctx.fillRect(hx,hy,hw,3);
      ctx.fillStyle= h.hp>0.5 ? '#4db6e8' : (h.hp>0.25?'#e8b552':'#e2504a');
      ctx.fillRect(hx,hy,hw*clamp(h.hp,0,1),3);
      /* 던전 파티도 레벨 표시 */
      const lvX2 = h.x - 14 + lx, lvY2 = h.y - 56;
      ctx.fillStyle='rgba(20,15,10,.92)'; ctx.beginPath(); ctx.arc(lvX2, lvY2, 7, 0, 7); ctx.fill();
      ctx.strokeStyle=h.color; ctx.lineWidth=1.5; ctx.stroke(); ctx.lineWidth=1;
      ctx.fillStyle='#f0d59a'; ctx.font="bold 8px 'Malgun Gothic'"; ctx.textAlign='center';
      ctx.fillText(h.lvl||1, lvX2, lvY2+3);
    }
  }
  function drawMob(m){
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(m.x, m.y+m.r+3, m.r, m.boss?7:4, 0,0,7); ctx.fill();
    /* ★ v5.25: 스프라이트가 있으면 drawImage, 없으면 종전 도형.
       ★ v5.25.2: MON_SCALE 로 몬스터별 크기 정규화 — 그림자에 꽉 채움.
       ★ v5.25.3: footY 오프셋 — 발이 그림자(m.y+m.r) 위에 오도록 이미지를 위로 이동. */
    const spr = m.img ? monImg(m.img) : null;
    const mscale = (m.img && MON_SCALE[m.img]) || 1;
    const sz = m.r*2.4*mscale;
    const footY = (m.img && MON_FOOTY[m.img]) || 0.96;  // 이미지 높이에서 발의 상대 위치
    if(spr && spr.complete && spr.naturalWidth>0){
      /* 발(footY*sz 위치)이 그림자 표면(m.y+m.r)에 오도록:
         이미지 상단 = m.y + m.r - footY*sz  (이미지를 위로 올림) */
      const dy = m.y + m.r - footY*sz;
      ctx.save();
      if(m.flash>0){ ctx.globalAlpha=0.85; }
      ctx.drawImage(spr, m.x-sz/2, dy, sz, sz);
      if(m.flash>0){ ctx.globalCompositeOperation='source-atop'; ctx.fillStyle='rgba(255,80,80,.5)'; ctx.fillRect(m.x-sz/2,dy,sz,sz); }
      ctx.restore();
    } else {
      ctx.fillStyle = m.flash>0 ? '#fff' : (m.col||'#8a8f96');
      if(m.shape==='golem' || m.boss){ roundRectPath(m.x-m.r, m.y-m.r, m.r*2, m.r*2, m.r*0.35); ctx.fill(); }
      else if(m.shape==='beast'){ ctx.beginPath(); ctx.moveTo(m.x-m.r,m.y+m.r*0.6); ctx.lineTo(m.x-m.r*0.4,m.y-m.r); ctx.lineTo(m.x+m.r*0.4,m.y-m.r); ctx.lineTo(m.x+m.r,m.y+m.r*0.6); ctx.closePath(); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill(); }
      ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.stroke();
      ctx.fillStyle= m.boss?'#ffd36a':'#c8302a'; const es=m.boss?3:1.6;
      ctx.beginPath(); ctx.arc(m.x-m.r*0.35,m.y-m.r*0.15,es,0,7); ctx.arc(m.x+m.r*0.35,m.y-m.r*0.15,es,0,7); ctx.fill();
    }
    const w=m.r*2.2, hpx=m.x-w/2, hpy=m.y-m.r-8, hh=m.boss?5:3;
    ctx.fillStyle='#2a0d0b'; ctx.fillRect(hpx,hpy,w,hh); ctx.fillStyle='#d84a3f'; ctx.fillRect(hpx,hpy,w*clamp(m.hp/m.hpMax,0,1),hh);
    if(m.boss){ ctx.fillStyle='#ffd36a'; ctx.font="bold 11px 'Malgun Gothic'"; ctx.textAlign='center'; ctx.fillText('👑 '+m.name, m.x, m.y-m.r-14); }
  }
  function roundRectPath(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

  // 파티 3인 기여도% 오버레이 (DOM #stage-overlay)
  // ★ 홈(1인 서바이벌)에서는 기여도 패널을 숨긴다 — 원작 실측: 홈에는 기여도·웨이브·제한시간 표시 없음.
  let contribT=0;
  function renderContribPanel(){
    const ov=$('#stage-overlay'); if(!ov) return;
    if(isHuntSolo()){ ov.innerHTML=''; return; }   // 홈 1인 = 기여도 패널 없음
    const tot = heroes.reduce((a,h)=>a+h.dmgDone,0)||1;
    ov.innerHTML='<div class="contrib">'+heroes.map(h=>{
      const p=Math.round(h.dmgDone/tot*100);
      return `<div class="crow"><span class="ce">${h.face}</span><span class="cn">${h.job.name}</span>
        <span class="cbar"><i style="width:${p}%;background:${h.color}"></i></span><span class="cp">${p}%</span></div>`;
    }).join('')+'</div>';
  }

  function loop(ts){
    if(!running) return;
    const dt = Math.min(0.05, (ts-last)/1000 || 0); last=ts;
    /* ★ v5.32.1: update/draw 에러로 게임이 멈추는 것을 방지.
       에러가 나면 콘솔에 기록하고 다음 프레임 계속 진행. */
    try{ update(dt); }catch(e){ if(typeof console!=='undefined') console.error('update:',e); }
    try{ draw(); }catch(e){ if(typeof console!=='undefined') console.error('draw:',e); }
    contribT-=dt; if(contribT<=0){ contribT=0.4; try{renderContribPanel();}catch(e){} }
    requestAnimationFrame(loop);
  }
  function start(){ if(running) return; running=true; preloadHeroSheets(); preloadSkillFx(); last=performance.now(); resize(); requestAnimationFrame(loop); }
  function refreshParty(){ layoutHeroes(); }
  function contributions(){ const tot=heroes.reduce((a,h)=>a+h.dmgDone,0)||1; return heroes.map(h=>({job:h.job,pct:Math.round(h.dmgDone/tot*100)})); }
  window.addEventListener('resize', ()=>{ resize(); });
  function setHunt(){ if(mode==='dungeon') return; mobs=[]; wave=1; lastBossWave=0; wiped=0; layoutHeroes(); }
  return { start, resize, refreshParty, contributions, wave:()=>wave, setHunt, partyCP:()=>partyCP, startDungeon, inDungeon:()=>mode==='dungeon',
           setPartySource:(fn)=>{ partySrc = (typeof fn==='function') ? fn : null; layoutHeroes(); },
           /* ★ v5.32: 스킬 쿨타임 UI 업데이트용 노출. */
           skillCDs:()=>(heroes[0]&&heroes[0].skillCD)||[0,0,0,0],
           /* ★ 홈 1인 서바이벌 검증용 노출 (스모크 테스트에서 사용). 내부 상태 변경 아님. */
           isHuntSolo:()=>isHuntSolo(), heroCount:()=>heroes.length };  // ★ B6/G-81
})();

/* ============================================================
   방치 수급 + HUD + 채팅 + 시계
   ============================================================ */
/* ★ B6/G-92: 투기장 '순위 골드버프'(ARENA_GBUFF_ROWS 13행)를 실제 골드 획득에 반영한다.
   표시만 되고 적용되지 않던 문제를 addGold 훅으로 해결. raw=true 로 부르면 버프를 건너뛴다.
   ★ N2: 표가 13행(31~40위 5%)으로 늘었으므로 적용 함수도 40위까지 확장한다 — 표와 실제 적용이
     어긋나지 않도록 ARENA_GBUFF_ROWS 를 직접 파싱해 단일 정본으로 삼는다. */
const ARENA_GBUFF_BANDS = ARENA_GBUFF_ROWS.map(([label,pct])=>{
  const m = /(\d+)\s*(?:~\s*(\d+))?/.exec(label) || [];
  const lo = +m[1] || 1, hi = m[2] ? +m[2] : lo;
  return { lo, hi, pct };
});
function arenaGoldBuffPct(){
  const r = (S && S.arenaRank) | 0;
  if(r < 1) return 0;
  for(const b of ARENA_GBUFF_BANDS){ if(r>=b.lo && r<=b.hi) return b.pct; }
  return 0;
}
function addGold(n, raw){
  // ★ F2: 칭호의 '몬스터 골드 획득량 +X%' 는 골드 획득 단일 관문인 여기서 한 번만 곱한다.
  if(!raw) n = n * (1 + arenaGoldBuffPct()/100) * titleGoldMul();
  S.gold = Math.min(3_000_000_000, S.gold + n);
}
// ★ B7/G-100: '제작 시간 -50%' 구독 버프 배율 (상점 버프탭에서 구매, 30일)
//   ★ F2: 칭호의 '제작 시간 -X%' 도 같은 관문에서 곱한다(제작 시작 시점의 endAt 산출에 사용).
function craftTimeMul(){ return ((S && S.buffs && S.buffs.craftUntil > Date.now()) ? 0.5 : 1) * titleCraftTimeMul(); }
/* ★ B9/G-127: 개인랭크 버프 — 투기장 티어에 비례하는 골드 획득 보너스(%).
   ★ A3-3: TIERS 7단(브론즈~레전더리) 확장에 맞춰 7항으로 정합. 브론즈가 1단계(=5%)이며,
   티어를 못 가진 구간은 존재하지 않는다(투기장 시작 시점이 곧 브론즈).
   ⚠비전미확인 — 촬영대기: 단계별 % 값은 원작 미판독으로 종전 5%p 등차를 유지한다. */
function personalRankBuffPct(){ const t=clamp((S&&S.arenaTier)|0, 0, TIERS.length-1); return [5,10,15,20,25,30,35][t] || 5; }
function idleTick(dt){
  let buff = 1 + (S.villHall-1)*0.0005; // +0.05%p/Lv (확정)
  if(S.buffs && S.buffs.goldUntil>Date.now()) buff *= 2; // 골드 부스트 상품 +100%
  // ★ F2: 칭호 골드 버프는 addGold() 에서 일괄 적용한다(여기서 곱하면 이중 적용).
  buff *= costumeGoldMul();  // 코스튬 골드 버프(착용형 +20% · 보유형 passive +20%)
  if(holdOwn('mine')) buff *= 1.8; // 점령전: 용암 광산 골드 +80% (★ B8/G-109 holds 스키마 객체화)
  addGold(18885/60 * dt * buff);
  S.playSec += dt;
  S._tk = (S._tk||0) + dt; if(S._tk>=40){ S._tk=0; S.ticket=Math.min(30,S.ticket+1); }
  S._vm = (S._vm||0) + dt; if(S._vm>=30){ S._vm=0; S.villMat=Math.min(9999,S.villMat+1); } // 마을재료 방치 드랍
}
let hudT=0;
/* ★ v4.6: 재화가 늘어난 순간을 눈에 띄게 — 숫자가 툭 바뀌기만 하던 것을 짧게 튀어오르게 한다.
   값이 실제로 커졌을 때만 발화한다(감소·무변화는 조용히). */
function setCur(sel, val){
  const e=$(sel); if(!e) return;
  const next=fmtFull(val), prev=e.textContent;
  if(prev===next) return;
  e.textContent=next;
  const up = (Number(String(next).replace(/[^\d.-]/g,'')) > Number(String(prev).replace(/[^\d.-]/g,'')));
  if(!up) return;
  e.classList.remove('cur-bump'); void e.offsetWidth; e.classList.add('cur-bump');
}
function refreshHUD(){
  setCur('#curGold', S.gold);   // ★ B1/G-12 전체 자릿수
  setCur('#curRuby', S.ruby);
  $('#pName').textContent = S.name;
  S.titleIdx = clamp(Math.floor(S.awaken/3), 0, HERO_TITLES.length-1);
  $('#pTitle').textContent = HERO_TITLES[S.titleIdx]||'불의 견습';
  /* ★ v5.81: 착용 중인 칭호(TITLES 시스템)를 명패에 표시 — 체감 개선 */
  const _badge = $('#pTitleBadge');
  if(_badge){ const _t = TITLES.find(t=>t.id===S.title); _badge.textContent = _t ? _t.n : ''; }
  const ct=$('#craftTimer');
  if(S.craft){ const left=Math.max(0,Math.ceil((S.craft.endAt-Date.now())/1000)); ct.textContent = left>0? mmss(left) : '완성!'; }
  else ct.textContent='00:00';
  tutPoll();   // ★ B1/G-01: 튜토리얼 실제 완료 이벤트 폴링
}
function mmss(s){ const m=Math.floor(s/60), ss=s%60; return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0'); }
function tickClock(){ const base = 6*3600 + Math.floor(S.playSec)*60; const hh=Math.floor(base/3600)%24, mm=Math.floor(base/60)%60; $('#clock').textContent = String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'); updateSkillCD(); }
/* ★ v5.32: 스킬 쿨타임 UI — 홈 4개 스킬 아이콘에 쿨타임 오버레이.
   Battle.skillCDs()로 영웅의 4스킬 쿨타임을 받아 .sk 에 표시. */
function updateSkillCD(){
  try{
    const sks = document.querySelectorAll('#chat .skills .sk');
    if(!sks.length) return;
    if(!Battle || !Battle.skillCDs) return;
    const cds = Battle.skillCDs() || [0,0,0,0];
    const names = ['flame','frost','earth','wind'];
    sks.forEach((sk, i)=>{
      const cd = cds[i] || 0;
      const cdEl = sk.querySelector('.sk-cd');
      if(cd > 0.1){
        if(!cdEl){
          const ov = document.createElement('div');
          ov.className = 'sk-cd';
          ov.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#ffd36a;border-radius:5px;pointer-events:none';
          sk.style.position='relative';
          sk.appendChild(ov);
        }
        if(cdEl || sk.querySelector('.sk-cd')){
          sk.querySelector('.sk-cd').textContent = cd>=10?Math.ceil(cd):cd.toFixed(1);
        }
      } else if(cdEl){
        cdEl.remove();
      }
    });
  }catch(e){ /* updateSkillCD 에러는 게임을 멈추지 않는다 */ }
}

/* 채팅
   ★ B1/G-10: 모든 발화 앞에 [등급라벨][N위] 공통 접두가 붙는다.
     라벨 4종(인사쟁이 / 견습 광부증 / 노련한 사냥꾼 / 화신의 안내자 — ★ F2 칭호 재판독 명칭)은 닉네임별로 고정 매핑된다.
   ★ B1/G-09: 유저 잡담 외에 전역 획득 브로드캐스트 · 서버 접속 알림을 포함해 10종 이상. */
const CHAT_NAMES = ['불철','무쇠손','잿불','대장장이K','로엔','서리검','재의노래','강철심','청염','불꽃술사'];
const CHAT_TIERS = [
  { n:'인사쟁이',       c:'#8ee6c0' },
  { n:'견습 광부증',     c:'#7fb2e8' },
  { n:'노련한 사냥꾼',   c:'#f0cd82' },
  { n:'결정의 안내자',   c:'#e8c040' },
];
// 닉네임 → 라벨 고정 매핑 (같은 유저는 항상 같은 라벨)
const CHAT_TIER_OF = {};
CHAT_NAMES.forEach((n,i)=>{ CHAT_TIER_OF[n]=CHAT_TIERS[i%CHAT_TIERS.length]; });
const CHAT_RANK_OF = {};
CHAT_NAMES.forEach((n,i)=>{ CHAT_RANK_OF[n]=(i*7)%60+2; });
function chatWho(nm){
  const t=CHAT_TIER_OF[nm]||CHAT_TIERS[0], rk=CHAT_RANK_OF[nm]||ri(2,60);
  return `<span class="tier" style="color:${t.c}">${t.n}</span><span class="rank">[${rk}위]</span> <span class="who">${nm}</span>`;
}
// 전역 획득 브로드캐스트 — {닉}님이 {등급색 아이템}({경로})을(를) 획득하셨습니다.
const BCAST_ITEMS = [
  ['L','화신 대검'],['L','태초의 고서'],['E','심연 지팡이'],['E','최상급 마법서'],
  ['R','청강 방패'],['R','청옥 목걸이'],['E','심연 반지'],['L','성좌 투구'],
];
const BCAST_WAY = ['제작','합성','획득'];
function bcastLine(){
  const [g,it]=pick(BCAST_ITEMS), G=GRADES[g];
  return `<span class="bcast">${pick(CHAT_NAMES)}님이 <span style="color:${G.color};font-weight:700">${it}</span>(${pick(BCAST_WAY)})을(를) 획득하셨습니다.</span>`;
}
const CHAT_LINES = [
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 방금 <span class="lgd">레전더리</span> 무기 뽑았다!`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: <span class="epi">영웅</span> 재료 합성 성공 ㅋㅋ`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 시련의 탑 몇 층까지 감?`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 길드원 모집합니다 (기여도 상위)`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: <span class="rar">희귀</span> 방어구 세트 완성!`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 각성 <span class="lgd">${ri(3,9)}단계</span> 찍음 스탯 개오름`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 투기장 ${pick(TIERS)} 승급!`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 오늘 골드던전 5단계 뚫음`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 요일던전 생존 3단계 클리어 파티 구합니다`; },
  ()=>{ const n=pick(CHAT_NAMES); return `${chatWho(n)}: 월드보스 입장 시간 10시부터죠?`; },
  bcastLine, bcastLine,
  ()=>`<span class="notice-in">${(S&&S.server)||'화로 1서버'} 유저 입장하셨습니다.</span>`,
];
let chatFilter='전체';
function pushChat(html, ch){
  ch = ch||'전체';
  const log=$('#chatLog'); const c=el('div','cm',html); c.dataset.ch=ch;
  if(chatFilter!=='전체' && ch!==chatFilter && ch!=='시스템') c.style.display='none';
  log.appendChild(c);
  while(log.children.length>40) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function applyChatFilter(){ document.querySelectorAll('#chatLog .cm').forEach(c=>{ const ch=c.dataset.ch||'전체'; c.style.display=(chatFilter==='전체'||ch===chatFilter||ch==='시스템')?'':'none'; }); const log=$('#chatLog'); log.scrollTop=log.scrollHeight; }
let chatT=0;
function chatTick(dt){ chatT-=dt; if(chatT<=0){ chatT=rnd(1.6,3.2); pushChat(pick(CHAT_LINES)(), Math.random()<0.4?'서버':'전체'); } }
function sysLog(msg){ pushChat(`<span class="who" style="color:#8ee6c0">[시스템]</span> ${msg}`, '시스템'); }
/* ★ B1/G-11: 길드는 기본 미가입(S.guild=null). 길드 탭을 열면 '길드가 없습니다.' 리본을 띄운다.
   B8 이 S.guildJoined 를 세우면 자동으로 리본이 사라진다. */
function guildJoined(){ return !!(S && (S.guildJoined || S.guild)); }
function guildTabNotice(){
  const log=$('#chatLog'); if(!log) return;
  log.querySelectorAll('.chat-ribbon').forEach(n=>n.remove());
  if(chatFilter==='길드' && !guildJoined()){
    log.appendChild(el('div','chat-ribbon','길드가 없습니다.'));
    log.scrollTop=log.scrollHeight; toast('길드가 없습니다.');
  }
}

/* ============================================================
   [B8] 길드·약탈 데이터 & 헬퍼 (G-105 ~ G-116)
   ============================================================ */
/* G-107: 랭킹 상위 3위만 '구역 배지'(3색 구분), 4~6위는 숫자 등수만 표기한다. */
const GUILD_ZONES = [
  { n:'화염구역', c:'#e2743c' },
  { n:'무쇠구역', c:'#e8c94a' },
  { n:'폐허구역', c:'#4ab3d8' },
];
/* G-107: 길드 랭킹 6행 (+ 내 길드 요약행 = 7요소) */
const GUILD_RANK = [
  ['강철결의',     51000],
  ['불의 형제단',  48200],
  ['잿빛동맹',     39800],
  ['용광로기사단', 33400],
  ['새벽의 인장',  28600],
  ['백야회',       21200],
];
/* G-110: 직급 3단 — 길드장(적) / 임원(주황) / 길드원(흰) */
const GUILD_GRADES = {
  master : { n:'길드장', c:'#c0392b' },
  officer: { n:'임원',   c:'#e08a2b' },
  member : { n:'길드원', c:'#eaddc4' },
};
/* G-110: 멤버 행 5필드 — [닉네임, 직급, 기여점수, 온라인(0=온라인/N=N분 전), 최근 참여일, 참여 횟수] */
const GUILD_MEMBERS = [
  ['불철',       'master',  184200,  0, '07-27', 42],
  ['무쇠손',     'officer', 151800,  0, '07-27', 38],
  ['잿불',       'officer', 132400, 12, '07-26', 35],
  ['대장장이K',  'member',  118600,  0, '07-27', 31],
  ['로엔',       'member',   96400, 47, '07-26', 27],
  ['서리검',     'member',   88100,  3, '07-27', 24],
  ['재의노래',   'member',   74900,  0, '07-27', 22],
  ['강철심',     'member',   61300, 128,'07-25', 18],
  ['청염',       'member',   52800,  0, '07-27', 15],
  ['불꽃술사',   'member',   41500, 26, '07-26', 11],
  ['잔불지기',   'member',   27200, 310,'07-24',  6],
];
/* G-109: 점령 거점 — base 는 점령 점수의 실측 스케일(500~2,000) 초기값 */
const CONQUEST = [
  { id:'mine', n:'용암 광산', ic:'💰', buff:'골드 +80%',   owner:'강철결의',    base:1840 },
  { id:'nest', n:'잿불 군락', ic:'🎯', buff:'드랍률 +15%', owner:'불의 형제단', base:1260 },
  { id:'camp', n:'무쇠 캠프', ic:'📈', buff:'경험치 +50%', owner:'잿빛동맹',    base:720  },
];
const CONQUEST_COST = 7000000;   // 거점 도전 비용 (골드 700만)

/* ★ G-109: 점령 상태를 {own, score, mine} 로 영속화한다.
     · score = 거점 총 점령 점수(렌더마다 ri() 로 재계산하던 값을 세이브에 고정)
     · mine  = 우리 길드가 이 거점에 쌓은 점수(숫자 필드 — 기존엔 boolean 텍스트뿐이었다)
   구세이브의 `S.holds[id] === true`(boolean) 도 그대로 읽어 own:true 로 승격한다.
   ⚠ 객체는 항상 truthy 이므로 '점령 여부' 판정은 반드시 holdOwn() 을 쓸 것. */
function holdRec(id){
  if(!S.holds || typeof S.holds!=='object') S.holds={};
  const base = (CONQUEST.find(c=>c.id===id)||{}).base || 1000;
  let h = S.holds[id];
  if(!h || typeof h!=='object'){ h = S.holds[id] = { own:(h===true), score:base, mine:0 }; }
  if(typeof h.score!=='number' || !isFinite(h.score)) h.score = base;
  if(typeof h.mine !=='number' || !isFinite(h.mine))  h.mine  = 0;
  h.own = !!h.own;
  return h;
}
/* 읽기 전용 점령 판정 — idleTick(매 프레임)·드랍률·버프 집계가 쓰므로 절대 mutate 하지 않는다. */
function holdOwn(id){
  const h = S && S.holds ? S.holds[id] : null;
  return h===true || !!(h && typeof h==='object' && h.own);
}
function conquestMyScore(){ return CONQUEST.reduce((a,c)=>a+holdRec(c.id).mine, 0); }
/* G-106: 누적 점수 석판 — 랭킹표의 기준 점수 + 내가 쌓은 기여 */
function guildBaseScore(){ const r=GUILD_RANK.find(g=>g[0]===S.guildName); return r ? r[1] : 0; }
function guildTotalScore(){ return guildJoined() ? guildBaseScore() + (S.guildScore||0) : 0; }
function guildMyGrade(){ return GUILD_GRADES[S.guildRank] ? S.guildRank : (S.guildMaster?'master':'member'); }
function guildCanEditNotice(){ const g=guildMyGrade(); return guildJoined() && (g==='master'||g==='officer'); }
const GUILD_NOTICE_DEFAULT = '길드 레이드는 매일 10:00~12:00에 진행합니다. 주 3회 이상 참여를 부탁드립니다.';

/* G-106: 헤더(정원 N/30 배지 + 타이틀 + [길드 공지]) + 누적점수 전폭 석판.
   길드 메인 / 랭킹 / 길드 레이드 / 점령전 어디로 전환해도 동일하게 유지된다. */
function guildHeadBlock(host){
  const joined = guildJoined();
  const cnt = joined ? GUILD_MEMBERS.length + 1 : 0;
  const hr = el('div','gu-head');
  hr.appendChild(el('div','gu-cap',`${cnt}/30`));
  hr.appendChild(el('div','gu-name', joined ? (S.guildName||'무명 길드') : '길드 미가입'));
  const nb = el('button','gu-nbtn','길드 공지');
  nb.onclick = ()=>guildNoticePopup();
  hr.appendChild(nb);
  host.appendChild(hr);
  host.appendChild(el('div','gu-slab',`<span class="gs-l">누적 점수</span><b class="gs-v">${fmtFull(guildTotalScore())}</b>`));
}
/* G-112: 길드 공지 서브모달 — 길드장·임원은 편집, 길드원은 읽기 전용 */
function guildNoticePopup(){
  const root=$('#modal-root'); if(!root) return;
  root.querySelectorAll('.b5-ovl').forEach(n=>n.remove());
  const ov=el('div','b5-ovl'), pop=el('div','b5-pop');
  pop.appendChild(el('div','b5-head','길드 공지'));
  const txt = S.guildNotice || GUILD_NOTICE_DEFAULT;
  if(guildCanEditNotice()){
    pop.appendChild(el('div','b5-sub',`${GUILD_GRADES[guildMyGrade()].n} 권한 · 공지를 수정할 수 있습니다.`));
    const ta=el('textarea'); ta.className='gu-nta'; ta.value=txt; pop.appendChild(ta);
    const row=el('div','btnrow'); row.style.marginTop='8px';
    const cl=el('button','btn','닫기'); cl.onclick=()=>ov.remove();
    const sv=el('button','btn gold','저장');
    sv.onclick=()=>{ S.guildNotice=(ta.value||'').trim(); toast('길드 공지를 저장했습니다.'); ov.remove(); };
    row.append(cl,sv); pop.appendChild(row);
  } else {
    pop.appendChild(el('div','gu-nbody',txt));
    pop.appendChild(el('div','b5-sub', guildJoined()?'길드원은 공지를 열람만 할 수 있습니다.':'길드에 가입하면 공지가 갱신됩니다.'));
    const cl=el('button','btn wide','닫기'); cl.style.marginTop='8px'; cl.onclick=()=>ov.remove(); pop.appendChild(cl);
  }
  ov.appendChild(pop); ov.onclick=ev=>{ if(ev.target===ov) ov.remove(); };
  root.appendChild(ov);
}
/* G-107: 랭킹 행 [신청] — '가입 신청 완료' 토스트 후 승인 처리(데모) */
function guildApply(name){
  if(guildJoined()){ toast('이미 길드에 가입되어 있습니다.'); return; }
  toast('가입 신청 완료');
  S.guildJoined=true; S.guildMaster=false; S.guildRank='member'; S.guildName=name; S.guild=name;
  sysLog(`<b>${name}</b> 가입 신청이 승인되었습니다.`);
  refreshHUD(); guildTabNotice(); openModal('guild');
}
/* G-105: 길드 창설 — 루비 600→100 / 골드 300,000,000→100,000,000 할인가.
   재화 체크를 통과한 뒤 styledConfirm 의 [예] 안에서만 차감한다(전투 중 진입 시 증발 방지). */
function guildCreate(name, cur, cost){
  name=(name||'').trim();
  if(guildJoined()){ toast('이미 길드에 가입되어 있습니다.'); return; }
  if(!name){ toast('길드명을 입력하세요.'); return; }
  const have = cur==='ruby' ? S.ruby : S.gold;
  if(have<cost){ toast(`${cur==='ruby'?'루비':'골드'} 부족 (${fmtFull(cost)})`); return; }
  styledConfirm(`'${name}' 길드를 창설하시겠습니까?`, ()=>{
    const now = cur==='ruby' ? S.ruby : S.gold;
    if(now<cost){ toast('재화가 부족합니다.'); return; }
    if(cur==='ruby') S.ruby-=cost; else S.gold-=cost;      // ← 차감은 [예] 이후에만
    S.guildJoined=true; S.guildMaster=true; S.guildRank='master'; S.guildName=name; S.guild=name;
    toast(`${name} 창설 완료 · 길드장 버프 적용`);
    sysLog(`<b>${name}</b> 길드를 창설했습니다 · 길드장 버프 — 골드, 경험치 획득량 35% 증가`);
    refreshHUD(); guildTabNotice(); openModal('guild');
  }, { title:'길드 창설', sub:'*길드장 버프* 골드, 경험치 획득량 35% 증가',
       warn:(cur==='ruby'?'루비':'골드')+' '+fmtFull(cost)+' 소모', yes:'창설' });
}
/* G-108: 길드 레이드 입장 — auto=true 는 '자동 입장' 연전(확인창 생략). 재입장 성공 시 true. */
function enterGuildRaid(auto){
  if(busyFight()) return false;
  if(!guildJoined()){ if(!auto) toast('길드에 가입해야 참전할 수 있습니다.'); return false; }
  if(dailyLeft('raidBoss',2)<=0){ if(!auto) toast('오늘 참전 소진'); return false; }
  const go=()=>{
    if(!guildJoined()){ toast('길드에 가입해야 참전할 수 있습니다.'); return; }
    if(dailyLeft('raidBoss',2)<=0){ toast('오늘 참전 소진'); return; }
    dailyUse('raidBoss');                                   // ← 차감은 [예] 이후에만
    const dmgMul = S.raidOn ? 1.5 : 1;                      // ★ G-115: 약탈 활성화 = 길드레이드 피해 +50%
    enterDungeonFight({ name:'길드 레이드 · 재의 골렘', col:'#a08a6a',
      foeCP:Math.round(totalCP()*2.2/dmgMul), kind:'boss', dur:15, race:true,
      rewardText:'누적 데미지 = 길드 점수 · 회색코인 · 길드 코인 획득',
      reward:(st)=>{ const d=(st&&st.dmg)||0;
        S.guildRaidScore=(S.guildRaidScore||0)+d; S.guildScore=(S.guildScore||0)+d;
        S.gray+=ri(10,30); S.guildCoin=(S.guildCoin||0)+ri(20,50);
        sysLog(`길드 레이드 결과 — <b>${fmt(d)}점</b> · 길드 코인 획득`); },
      autoNext:()=>S.guildRaidAuto ? enterGuildRaid(true) : false });
  };
  if(auto) go();
  else styledConfirm('입장 하시겠습니까?', go,
    // ★ v4.8: 원작 길드 레이드 확인창은 [예]좌 / [아니요]우 다(08_10_00_330 실측).
    //   월드보스·시련의 탑과 같은 규칙인데 여기만 yesFirst 가 빠져 좌우가 뒤집혀 있었다.
    { title:'길드 레이드 · 재의 골렘', sub:`오늘 ${dailyLeft('raidBoss',2)}/2회 · 누적 데미지가 길드 점수가 됩니다`, yes:'예', no:'아니요', yesFirst:true });
  return true;
}
/* ★ B1/G-13: 자동전투 토글 표시 (전투는 데모 특성상 항상 자동 진행) */
function syncAutoBat(){
  const ab=$('#autoBat'); if(!ab) return;
  const on=!!(S && S.autoBattle);
  ab.classList.toggle('on', on);
  const v=$('#autoBatV'); if(v) v.textContent = on?'On':'Off';
}
/* ★ B1/G-13: 캔버스 텍스트 '부활 Ns' 대신 DOM 안내 패널.
   Battle.drawHero 가 사망 영웅마다 reviveMark(respT) 를 호출하고, HUD 틱이 표시를 갱신한다. */
let _revMark=0, _revEnd=0;
function reviveMark(sec){
  const now=Date.now();
  if(now-_revMark>250) _revEnd=0;      // 새로운 사망 구간 시작
  _revMark=now; _revEnd=Math.max(_revEnd, now+(sec||0)*1000);
}
function reviveHUDTick(){
  const box=$('#revive-box'); if(!box) return;
  const now=Date.now(), on=(now-_revMark)<900 && _revEnd>now;
  if(!on){ box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const c=$('#rvCount'); if(c) c.textContent=String(Math.max(1,Math.ceil((_revEnd-now)/1000)));
}

/* ============================================================
   온보딩 (경량 STEP 트래커)
   ============================================================ */
/* ★ B1/G-01: 9단계 튜토리얼 — 모달을 여는 것만으로는 절대 통과되지 않는다.
   각 단계는 `cnt()` 로 관측되는 실제 결과값(처치 수 / 제작된 방패 / 장착 / 강화 /
   소환 / 합성 / 편성 저장 / 클래스 선택)이 단계 진입 시점의 기준값보다 goal 만큼
   늘어나야 통과한다. 진행 카운터(n/M)는 트래커에 그대로 렌더된다.
   base:true = 단계 진입 시점 값을 기준선으로 잡고 증분만 센다. */
const TUT = [
  { k:'hunt',    goal:20, modal:'monster',   txt:'몬스터를 사냥해 20마리를 처치하세요',        base:true, cnt:()=>(S.stats.kills||0) },
  { k:'shield',  goal:1,  modal:'forge',     txt:'대장간에서 방패를 제작하세요',              base:true, cnt:()=>S.equips.filter(e=>(e.slot||'').indexOf('방패')>=0).length },
  { k:'wear',    goal:1,  modal:'inventory', txt:'제작한 장비를 장착하세요',                  base:true, cnt:()=>S.equips.filter(e=>e.equipped).length },
  { k:'enh',     goal:1,  modal:'inventory', txt:'장비를 1회 강화하세요',                     base:true, cnt:()=>S.equips.reduce((a,e)=>a+(e.enh||0),0) },
  { k:'hsum',    goal:1,  modal:'summon',    txt:'영웅을 소환해 조각을 모으세요',             base:true, cnt:()=>(S.stats.summons||0) },
  { k:'msum',    goal:1,  modal:'summon',    txt:'재료를 소환하세요',                         base:true, cnt:()=>((S.tut&&S.tut.matN)||0) },
  { k:'synth',   goal:1,  modal:'forge',     txt:'용광로에서 재료를 합성하세요',              base:true, cnt:()=>(S.stats.synths||0) },
  { k:'form',    goal:1,  modal:'hero',      txt:'영웅 진영을 편성하고 저장하세요',           base:true, cnt:()=>((S.tut&&S.tut.formN)||0) },
  { k:'mission', goal:1,  modal:'',          txt:'미션 완료 보상을 수령하고 클래스를 선택하세요', base:false, cnt:()=>(S.classTrait?1:0) },
];
function tutState(){
  if(!S.tut || typeof S.tut!=='object') S.tut={ base:{}, matBase:null, matN:0, formSig:'', formN:0 };
  if(!S.tut.base) S.tut.base={};
  return S.tut;
}
/* 폴링 감시 — 다른 배치 소유 함수를 건드리지 않고 상태 변화만으로 진행을 판정한다.
   (재료 소환 = 재료권 감소 / 편성 저장 = S.formation·S.formations 시그니처 변화) */
function tutWatch(){
  const t=tutState();
  if(t.matBase===null || t.matBase===undefined) t.matBase=S.tickMat||0;
  const tm=S.tickMat||0;
  if(tm>t.matBase) t.matBase=tm;                                   // 상점·보상으로 늘어난 건 소환이 아님
  else if(tm<t.matBase){ t.matN=(t.matN||0)+(t.matBase-tm); t.matBase=tm; }
  const sig=JSON.stringify([S.formation||{}, S.formations||null]);
  if(!t.formSig) t.formSig=sig;
  else if(sig!==t.formSig){ t.formSig=sig; t.formN=(t.formN||0)+1; }
}
// 외부(다른 배치)에서 단계를 직접 완료시키고 싶을 때 쓰는 공개 훅
function tutEvent(key){
  if(!S || S.seenTutorial) return;
  const st=TUT[S.tutStep]; if(!st || st.k!==key) return;
  tutState().base[st.k] = st.cnt() - st.goal;   // 즉시 충족 처리
  tutPoll();
}
let _tutProg=0;
function tutPoll(){
  if(!S || S.seenTutorial) return;
  const home=$('#home'); if(!home || home.classList.contains('hidden')) return;  // 타이틀·로그인 화면에서는 동작하지 않는다
  tutWatch();
  const st=TUT[S.tutStep]; if(!st) return;
  const t=tutState();
  if(t.base[st.k]===undefined) t.base[st.k] = st.base ? st.cnt() : 0;
  const prog=clamp(st.cnt()-t.base[st.k], 0, st.goal);
  if(prog!==_tutProg){ _tutProg=prog; renderTutorial(); }
  if(prog>=st.goal) tutAdvance();
}
function tutAdvance(){
  const idx=S.tutStep, st=TUT[idx]; if(!st) return;
  S.tutStep++; _tutProg=0; clearFinger(); sfx('win');
  // 다음 단계 기준선을 즉시 확정 — 폴링 간격(0.5초) 사이에 일어난 행동을 놓치지 않는다
  const nx=TUT[S.tutStep]; if(nx) tutState().base[nx.k] = nx.base ? nx.cnt() : 0;
  toast(`튜토리얼 ${idx+1}/${TUT.length} 완료`);
  if(S.tutStep>=TUT.length){ S.seenTutorial=true; renderTutorial(); updateGuideBanner(); sysLog('튜토리얼 9단계를 모두 완료했습니다.'); return; }
  renderTutorial();
  // 8단계까지 끝나면 미션 완료 보상 → 클래스 선택 순서로 이어진다
  if(TUT[S.tutStep].k==='mission') setTimeout(()=>openModal('missionReward'), 500);
}
// --- 가이드 NPC 대사 ---
let _dlgQueue=[], _dlgDone=null;
function showDialogue(lines, onDone){ _dlgQueue=lines.slice(); _dlgDone=onDone||null; $('#npc-layer').classList.remove('hidden'); nextDialogue(); }
function nextDialogue(){ if(!_dlgQueue.length){ $('#npc-layer').classList.add('hidden'); const d=_dlgDone; _dlgDone=null; if(d) d(); return; } $('#npcText').textContent=_dlgQueue.shift(); }
// --- 손가락 포인터 (강제 유도) ---
function clearFinger(){ document.querySelectorAll('.tut-highlight').forEach(e=>e.classList.remove('tut-highlight')); const f=$('#tutFinger'); if(f) f.remove(); }
function pointFinger(modalKey){ clearFinger(); const t=document.querySelector(`[data-modal="${modalKey}"]`); if(!t) return; t.classList.add('tut-highlight');
  const f=el('div','tut-finger','👆'); f.id='tutFinger'; const r=t.getBoundingClientRect(), dr=$('#device').getBoundingClientRect();
  f.style.left=(r.left-dr.left+r.width/2-12)+'px'; f.style.top=(r.top-dr.top-26)+'px'; $('#device').appendChild(f); }
/* ★ B1/G-02: 건너뛰기(.ob-skip) 마크업·핸들러 완전 삭제 — 원작에는 스킵이 없다. */
function renderTutorial(){
  const box=$('#onboard'); if(!box) return;
  if(S.seenTutorial || S.tutStep>=TUT.length){ box.classList.add('hidden'); clearFinger(); return; }
  const t=TUT[S.tutStep]; box.classList.remove('hidden');
  const prog=clamp(_tutProg,0,t.goal), pct=Math.round(prog/t.goal*100);
  box.innerHTML=`<div class="ob-step">STEP ${S.tutStep+1}/${TUT.length}</div><div class="ob-txt">${t.txt}</div>`+
    `<div class="ob-prog"><span class="ob-bar"><i style="width:${pct}%"></i></span><span class="ob-n">${prog}/${t.goal}</span></div>`;
  if(t.modal) pointFinger(t.modal); else clearFinger();
}
// 모달 오픈은 더 이상 단계를 통과시키지 않는다 — 손가락 유도만 갱신한다(G-01).
function tutorialProgress(modalKey){
  if(!S || S.seenTutorial) return;
  const t=TUT[S.tutStep];
  if(t && t.modal===modalKey) clearFinger();
}
/* ★ B1/G-04: 미션 완료 보상 5칸 (모달 MODALS.missionReward 에서 렌더) */
const MISSION_REWARDS = [
  { ic:'🔥', n:'영웅 조각',   q:300, act:()=>{ S.shards.flame=(S.shards.flame||0)+300; } },
  { ic:'❄️', n:'영웅 조각',   q:15,  act:()=>{ S.shards.frost=(S.shards.frost||0)+15; } },
  { ic:'📦', n:'재료소환권', q:140, act:()=>{ S.tickMat+=140; } },
  { ic:'🎟️', n:'영웅소환권', q:10,  act:()=>{ S.tickHero+=10; } },
  { ic:'🪨', n:'강화석',     q:50,  act:()=>{ S.stones+=50; } },
];
/* ★ B1/G-05: 2열 카드 + 3줄 불릿 → [선택] → 전신 일러 비교 화면 → [확정] */
const CLASS_TRAITS = [
  { id:'mage',    ic:'🔮', art:'🧙', nm:'마법형', bullets:['회피 스킬 보유','광역 마법 특화','빠른 사냥 속도'], sum:'회피 +10% · 광역 마법으로 몰이 사냥에 강합니다.' },
  { id:'warrior', ic:'⚔️', art:'🛡️', nm:'전투형', bullets:['회복 스킬 보유','광역 공격 보유','안정적 사냥 유지'], sum:'회복 +10% · 전멸 위험이 낮아 방치에 강합니다.' },
];
function chooseClassTrait(){
  setModalTitle('클래스 특성 선택'); const b=$('#modalBody'); b.innerHTML='';
  b.appendChild(el('div','hint','미션 완료 보상 · 1회 선택하며 계정 전체에 적용됩니다.'));
  const g=el('div','cls-grid');
  CLASS_TRAITS.forEach(c=>{
    const card=el('div','cls-card');
    card.innerHTML=`<div class="cc-ic">${eImg(c.ic,2)}</div><div class="cc-n">${c.nm}</div>`+
      `<div class="cc-b">${c.bullets.map(x=>'· '+x).join('<br>')}</div>`;
    const btn=el('button','btn sm gold','선택'); btn.style.marginTop='8px';
    btn.onclick=()=>openModal('classCompare', c.id);
    card.appendChild(btn); g.appendChild(card);
  });
  b.appendChild(g);
  $('#modal-root').classList.add('on'); currentModal='classTrait';
}
// --- 인트로 시퀀스 (대사 → 보상 팝업 스택 → 유도 튜토리얼) ---
function runIntro(){ showDialogue(['안녕하세요, 군주님. 저는 결정의 시대의 대장장이 리안입니다.','결정의 가호로 방치만 해도 골드와 재료가 쌓입니다.','먼저 초반 보상을 받아 성장을 시작하죠!'], introRewards); }
/* ★ B1/G-08: 3개 팝업이 서로 다른 화면이다.
   ① 랭크 보상 카드 ② 7일 출석 전체 그리드(1일차 체크) ③ 오프라인 정산 3필드 */
function introRewards(){
  const rewards=[ {t:'투기장 무쇠 랭크 보상',ic:'🏅',d:'골드 500,000',act:()=>addGold(500000)},
    {t:'7일 출석 · 1일차',ic:'🗓️',d:'소환권 1',act:()=>S.tickHero++},
    {t:'첫 방치 보상',ic:'⏳',d:'희귀 재료 20',act:()=>{ matGainGrade('R',20); }} ];
  /* ★ v5.28: 튜토리얼 완료에 필요한 자원 사전 지급.
     9단계 튜토리얼(제작→장착→강화→소환→합성→편성)을 막힘없이 진행하려면:
     - 흑염석: N등급 방패 제작 (3개)
     - 강화석: 장비 강화 1회 (1개)
     - 재료소환권: 재료 소환 (1개)
     이 자원들이 없으면 튜토리얼이 중간에 막혀 신규 이탈. */
  matGain('흑염석', 20); S.stones = (S.stones||0) + 10; S.tickMat = (S.tickMat||0) + 10;
  _introActive=true; let i=0;
  (function showNext(){
    if(i>=rewards.length){ _introActive=false; startGuidedTutorial(); return; }
    const idx=i, r=rewards[i++]; setModalTitle('보상 획득'); const b=$('#modalBody'); b.innerHTML='';
    if(idx===1){
      // ② 7일 출석 전체 그리드 — 1일차만 체크된 상태로 노출
      b.appendChild(el('div','center',`<div class="ei" style="font-size:34px">${eImg("🗓️",2)}</div><div class="big">7일 출석 보상</div>`));
      const g=el('div','grid c7'); g.style.marginTop='8px';
      ATTEND_DAYS.forEach(([t,ic],di)=>{ const c=el('div','cell gframe');
        if(di===0) c.style.borderColor='var(--frame-lit)'; else c.style.opacity='.55';
        c.innerHTML=`<div class="gtag">${di+1}일</div><div class="ei">${eImg(ic,2)}</div><div class="cn">${t}${di===0?' ✓':''}</div>`;
        g.appendChild(c); });
      b.appendChild(g);
      b.appendChild(el('div','center small mut','1일차 보상을 수령합니다 · 내일 2일차가 열립니다'));
    } else if(idx===2){
      // ③ 오프라인 정산 3필드
      b.appendChild(el('div','center',`<div class="ei" style="font-size:34px">⏳</div><div class="big">첫 방치 보상</div>`));
      [['오프라인 시간','720분'],['분당 획득 골드','1,000골드'],['합계','720,000골드']].forEach(([k,v])=>
        b.appendChild(el('div','stat-line',`<span>${k}</span><span class="v" style="color:#f0cd82">${v}</span>`)));
      b.appendChild(el('div','center small mut',`추가 지급 · ${r.d}`));
    } else {
      b.appendChild(el('div','result-card',`<div class="rc-icon">${eImg(r.ic,2)}</div><div class="rc-title win" style="font-size:18px">${r.t}</div><div class="small mut">${r.d}</div>`));
    }
    const btn=el('button','btn gold wide','받기'); btn.style.marginTop='10px';
    btn.onclick=()=>{ r.act(); if(idx===2) addGold(720000); refreshHUD(); showNext(); };
    b.appendChild(btn); $('#modal-root').classList.add('on'); currentModal='introReward';
  })();
}
function startGuidedTutorial(){
  closeModal();
  /* ★ v5.28.1: 튜토리얼 시작 시 자동전투 명시적 ON — 토글 표시 일치.
     전투는 항상 돌지만 Off로 표시되면 "왜 안 싸우지?" 혼란 유발. */
  S.autoBattle = true; syncAutoBat();
  showDialogue(['먼저 몬스터를 사냥해 실력을 증명하세요. 하단 [몬스터]에서 사냥터를 고를 수 있습니다.','미션은 화면을 여는 것이 아니라 실제로 완료해야 진행됩니다.'], ()=>{ S.tutStep=0; _tutProg=0; tutState().base={}; renderTutorial(); });
}
// --- 길잡이 배너 (제작 체인) ---
/* ★ 길잡이 9단계 — 전부 '제작' 이벤트로만 진행되는 순수 제작 체인.
   name=배너 표기명 / cat·slot=완료 판정용 실제 제작 카테고리·아이템명 /
   goalIcon=목표 아이템 아이콘 / rewardIcon·rewardQty=단계 보상 */
const GUIDE_CHAIN=[
  { name:'잿불 지팡이', cat:'무기',   slot:'비전 지팡이', goalIcon:'🪄', rewardIcon:'🎟️', rewardQty:20,       rw:()=>{ S.tickHero+=20; } },
  { name:'흑철 방패',   cat:'방어구', slot:'방패',        goalIcon:'🛡️', rewardIcon:'📦', rewardQty:100,      rw:()=>{ S.tickMat+=100; } },
  { name:'흑철 투구',   cat:'방어구', slot:'투구',        goalIcon:'⛑️', rewardIcon:'🪨', rewardQty:350,      rw:()=>{ S.stones+=350; } },
  { name:'흑철 상의',   cat:'방어구', slot:'상의',        goalIcon:'🥼', rewardIcon:'🪨', rewardQty:350,      rw:()=>{ S.stones+=350; } },
  { name:'흑철 하의',   cat:'방어구', slot:'하의',        goalIcon:'👖', rewardIcon:'🪨', rewardQty:1000,     rw:()=>{ S.stones+=1000; } },
  { name:'흑철 신발',   cat:'방어구', slot:'신발',        goalIcon:'🥾', rewardIcon:'📜', rewardQty:1000,     rw:()=>{ S.craftScroll+=1000; } },
  { name:'금빛 반지',   cat:'장신구', slot:'반지',        goalIcon:'💍', rewardIcon:'🪙', rewardQty:25000000, rw:()=>{ addGold(25000000); } },
  { name:'금빛 목걸이', cat:'장신구', slot:'목걸이',      goalIcon:'📿', rewardIcon:'🔨', rewardQty:20,       rw:()=>{ S.hammers+=20; } },
  { name:'결정의 고서', cat:'특수',   slot:'고서',        goalIcon:'📖', rewardIcon:'🎲', rewardQty:200,      rw:()=>{ S.dice+=200; } },
];
// 길잡이 구간 제작 수치 오버라이드 (등급 테이블 대신 적용)
const GUIDE_RECIPE = { step:{ p0:1.0, gold:1500000, sec:30 }, final:{ p0:1.0, gold:5000000, sec:3600 } };
function guideTarget(){ return (S && S.guideStep<GUIDE_CHAIN.length) ? GUIDE_CHAIN[S.guideStep] : null; }
function guideOverride(cat, itemName){
  const g=guideTarget(); if(!g) return null;
  if(g.cat!==cat || g.slot!==itemName) return null;
  return (S.guideStep===GUIDE_CHAIN.length-1) ? GUIDE_RECIPE.final : GUIDE_RECIPE.step;
}
function updateGuideBanner(){
  const bn=$('#guide-banner'); if(!bn) return;
  if(!S.seenTutorial || S.guideStep>=GUIDE_CHAIN.length){ bn.classList.add('hidden'); return; }
  const g=GUIDE_CHAIN[S.guideStep], need=GUIDE_NEED[S.guideStep]||1, prog=S.guideProg||0;
  bn.classList.remove('hidden');
  const ic=$('#gbGoal'); if(ic) ic.textContent=g.goalIcon;
  $('#gbTxt').textContent=`길잡이 ${S.guideStep+1}/${GUIDE_CHAIN.length} · ${g.name} 제작${need>1?` (${prog}/${need})`:''}`;
  const ri=$('#gbRwIc'); if(ri) ri.textContent=g.rewardIcon;
  const rq=$('#gbRwQty'); if(rq) rq.textContent='X'+fmt(g.rewardQty);
}
// ★ 길잡이 실제 추적 — 9단계 전부 '제작 성공'만으로 진행된다 (합성·각성·투기장 조건 없음)
function guideCheck(ev, data){
  if(!S || S.guideStep>=GUIDE_CHAIN.length) return;
  if(ev!=='craft') return;
  data=data||{}; const s=S.guideStep, g=GUIDE_CHAIN[s];
  if(!(data.cat===g.cat && data.slot===g.slot)) return;
  S.guideProg=(S.guideProg||0)+1;
  const need=GUIDE_NEED[s]||1;
  if(S.guideProg<need){ updateGuideBanner(); toast(`길잡이 진행 ${S.guideProg}/${need}`); return; }
  S.guideProg=0; S.guideStep++; sfx('win');
  try{ if(g.rw) g.rw(); }catch(e){}
  toast(`길잡이 ${s+1}단계 완료! ${g.rewardIcon} X${fmt(g.rewardQty)}`);
  if(S.guideStep>=GUIDE_CHAIN.length){ sysLog('길잡이 퀘스트 9단계 완료시 약탈 해금'); toast('길잡이 퀘스트 9단계 완료 · 약탈 해금'); }
  updateGuideBanner(); refreshHUD();
}

/* ============================================================
   모달 시스템
   ============================================================ */
let currentModal=null;
function setModalTitle(t){ const node=$('#modalTitle').childNodes[0]; node.nodeValue=t+' '; }
/* ★ v4.6: 화면 갱신을 '같은 모달 다시 열기'로 하는 곳이 44군데다(버튼 하나에 화면 전체 재작성).
   그대로 두면 ①스크롤이 맨 위로 튀고 ②DOM 을 통째로 버려 깜빡이며 ③요소가 매번 새로 생겨
   전환 애니메이션을 붙일 수가 없다. 호출부 44곳을 고치는 대신 여기 한 곳에서 처리한다.
     - 오프스크린에서 렌더한 뒤 한 번에 교체 → 리플로우 1회(깜빡임 감소)
     - 같은 모달을 다시 여는 경우 스크롤 위치를 복원하고 튜토리얼 훅을 재발화하지 않는다 */
function openModal(key, arg){   // ★ B3/G-45: arg 전달 (예: openModal('equip', heroId))
  const def = MODALS[key];
  if(!def){ toast('준비 중'); return; }
  /* ★ v5.1: 같은 키의 하위 오버레이가 떠 있으면 부모를 갈아엎지 말고 오버레이 안에서 갱신한다.
     (하위 화면들이 자기 자신을 openModal 로 다시 열어 새로고침하는 패턴을 그대로 살리기 위함) */
  if(_subKey===key){
    const bd=$('#modal-root .sub-body');
    if(bd){ const st=bd.scrollTop; bd.innerHTML=''; def.render(bd, arg===undefined?_subArg:arg); bd.scrollTop=st; return; }
  }
  if(_subKey) closeSub();   // 다른 화면으로 이동하면 하위 오버레이는 닫는다
  const body = $('#modalBody');
  const same = (currentModal === key);
  const keep = same ? body.scrollTop : 0;
  currentModal=key;
  setModalTitle(def.title);
  const holder = document.createElement('div');
  def.render(holder, arg);
  body.replaceChildren(...holder.childNodes);
  // 같은 모달이면 보던 위치를 지키고, 다른 모달로 옮기면 반드시 맨 위에서 시작한다.
  // (replaceChildren 은 scrollTop 을 건드리지 않아 명시적으로 0 을 넣어야 한다)
  body.scrollTop = same ? Math.min(keep, Math.max(0, body.scrollHeight - body.clientHeight)) : 0;
  $('#modal-root').classList.add('on');
  if(!same) tutorialProgress(key);
}
let _introActive=false;
function closeModal(){ closeSub(); $('#modal-root').classList.remove('on'); currentModal=null; if(_introActive){ _introActive=false; startGuidedTutorial(); } }
function gradeBadge(g){ const G=GRADES[g]; return `<span style="color:${G.color};font-weight:700">${G.name}</span>`; }

/* ---------- [B2] 제작·합성 공용 헬퍼 ---------- */
// 모달 위에 겹쳐 뜨는 오버레이 팝업 (모달 본문은 유지된다)
/* ★ v5.1: 하위 화면을 '부모 모달 위 오버레이'로 띄운다.
   원작은 재료합성·망치제작·제작결과·아이템상세·장비강화·주사위·영웅상세를 전부 부모 화면 위에
   얹어서 보여준다 — 팝업 가장자리로 대장간 탭이나 장비 슬롯이 계속 비친다.
   우리는 이 7곳을 openModal 로 모달 본문을 통째로 교체해서, 하위 화면을 열면 부모가 사라지고
   닫으면 부모로 못 돌아가는 문제가 있었다(망치제작은 뒤로가기 버튼조차 없었다).
   MODALS 정의는 그대로 두고 '어떻게 여는가'만 바꾼다. */
let _subKey=null;
function closeSub(){ const r=$('#modal-root'); if(r) r.querySelectorAll('.sub-ovl').forEach(n=>n.remove()); _subKey=null; }
function openSub(key, arg){
  const def=MODALS[key]; if(!def){ toast('준비 중'); return null; }
  const root=$('#modal-root'); if(!root) return null;
  closeSub();
  _subKey=key; _subArg=arg;
  const ov=el('div','sub-ovl'), pop=el('div','sub-pop');
  const head=el('div','sub-head', def.title);
  const x=el('div','sub-x','✕'); x.onclick=()=>closeSub(); head.appendChild(x);
  const bd=el('div','sub-body');
  pop.append(head, bd); ov.appendChild(pop);
  ov.onclick=e=>{ if(e.target===ov) closeSub(); };
  root.appendChild(ov);
  def.render(bd, arg);
  return ov;
}
let _subArg=null;
/* ★ v5.1: MODALS 가 아니라 함수로 만들어진 하위 화면(제작결과·아이템상세·장비강화·영웅상세)용.
   기존 `setModalTitle(t); const b=$('#modalBody'); b.innerHTML='';` 자리를 그대로 대체한다.
   부모 모달 본문은 건드리지 않으므로 대장간 그리드·착용창 슬롯이 뒤에 계속 남는다. */
function subBody(title){
  const root=$('#modal-root'); if(!root) return $('#modalBody');
  closeSub();
  const ov=el('div','sub-ovl'), pop=el('div','sub-pop');
  const head=el('div','sub-head', title);
  const x=el('div','sub-x','✕'); x.onclick=()=>closeSub(); head.appendChild(x);
  const bd=el('div','sub-body');
  pop.append(head, bd); ov.appendChild(pop);
  ov.onclick=e=>{ if(e.target===ov) closeSub(); };
  root.appendChild(ov);
  return bd;
}
function b2Overlay(title, build){
  const root=$('#modal-root'); if(!root) return null;
  root.querySelectorAll('.b2-ovl').forEach(n=>n.remove());
  const ov=el('div','b2-ovl'), pop=el('div','b2-pop');
  pop.appendChild(el('div','b2-head',title));
  const bd=el('div'); pop.appendChild(bd);
  const close=()=>ov.remove();
  build(bd, close);
  ov.appendChild(pop); ov.onclick=e=>{ if(e.target===ov) close(); };
  root.appendChild(ov); return ov;
}
function b2Confirm(title, html, onYes){
  b2Overlay(title,(bd,close)=>{
    bd.appendChild(el('div','center',html));
    const row=el('div','btnrow'); row.style.marginTop='10px';
    const no=el('button','btn','아니요'); no.onclick=close;
    const yes=el('button','btn gold','예'); yes.onclick=()=>{ close(); onYes(); };
    row.append(no,yes); bd.appendChild(row);
  });
}
// 길잡이 구간이면 등급 테이블 대신 GUIDE_RECIPE 를 적용
function craftParams(grade, cat, itemName){
  const base=CRAFT[grade], ov=guideOverride(cat,itemName);
  // ★ F2: 칭호의 '제작 확률 +X%p' 는 여기서 한 번만 가산한다 → 대장간 표기값과 실제 판정이 항상 일치한다.
  const p0 = clamp((ov?ov.p0:base.p0) + titleCraftRateAdd(), 0, 1);
  return { p0, gold:(ov?ov.gold:base.gold), sec:(ov?ov.sec:base.sec), guide:!!ov };
}
function recipeOk(recipe){ return (recipe||[]).every(r=>matAvail(r.k)>=r.need); }
// 제작 취소 — 재료·골드 100% 환급
function cancelCraft(){
  if(!S.craft) return; const c=S.craft;
  (c.recipe||[]).forEach(r=>matGain(r.k,r.need));
  S.gold += (c.gold||0);
  S.craft=null; toast('제작 취소 · 100% 환급'); openModal('forge'); refreshHUD();
}
let _forgeCtx=null, _forgeCraftFn=null;

/* ---------- [N1] 장비 옵션 재설정 (주사위 리롤) — 갭스펙 §5-4 해소 ----------
   근거: docs/reference/기능별/04_장비_인벤토리/주사위 버튼을 누른화면/
         그 주사위 버튼을 누른 직후 화면1~5.png (5장 전량 판독)
   판독 확정치
     · 등급 4행 고정 순서(일반→희귀→영웅→레전더리) · 소모 주사위 5 / 10 / 20 / 50
       (적색 안내문 "*일반 : 5개, 희귀 10개, 영웅 20개, 레전더리 50개 소요*" 5장 모두 동일)
     · 보유 주사위 42→37→27→7 이 각각 일반(5)·희귀(10)·영웅(20) 행의 ↻ 실행과 정확히 일치
     · 상단 "X 소모" = 0→5→15→35 로 개별 소모의 누적 합 (잠금 토글은 가산하지 않는다)
     · 그 아래 게이지에 "500개 / 영웅", "1000개 / 레전더리" 눈금이 박혀 있고 35 소모 시점에
       좌측 끝에 얇은 청색 게이지가 차 있다 → 누적 소모 1000 스케일의 진행바(마일스톤 2개)
     · 자물쇠는 다이스 소모 없이 잠금⇄열림 토글, 잠금 전환 시 토스트 "잠금되었습니다."
     · 레전더리 행 ↻ 는 5장 전부 사선(X) 비활성 — 보유 주사위(7~42)가 요구치 50 미만인 구간과 일치 */
const REROLL_ROWS = [ { g:'N', cost:5 }, { g:'R', cost:10 }, { g:'E', cost:20 }, { g:'L', cost:50 } ];
/* ⚠비전미확인 — 촬영대기: 옵션 스탯 풀 전체 목록. 5장에서 실제로 읽힌 스탯은 아래 2종뿐이고
   (일반행 "크리티컬 공격력(일반)", 희귀행 "크리티컬(일반)", 영웅행 "크리티컬 공격력(일반)")
   그 밖에 어떤 스탯이 나오는지는 캡처가 없다. 지어내지 않고 관측된 2종만 추첨한다. */
const REROLL_STATS = ['크리티컬 공격력','크리티컬'];
/* ⚠비전미확인 — 촬영대기: 결과 등급 추첨 확률표. 관측 3회(화면2·3·4)가 행 등급과 무관하게
   전부 '(일반)'으로 귀결됐고 상위 등급 결과 캡처가 0장이라, 확률표를 지어내지 않고 '일반' 고정으로 둔다. */
const REROLL_RESULT_GRADE = 'N';
/* 누적 소모 게이지 눈금 — 도달 시 무엇을 주는지는 캡처 없음(⚠비전미확인). 표시·진행만 구현한다. */
const REROLL_MILES = [ { at:500, g:'E' }, { at:1000, g:'L' } ];
const REROLL_BAR_MAX = 1000;
/* 구세이브·손상 세이브 방어 — 배열 길이가 REROLL_ROWS 와 어긋나면 기본값으로 재초기화 */
function rerollFix(){
  if(!Array.isArray(S.rerollLock) || S.rerollLock.length!==REROLL_ROWS.length) S.rerollLock=REROLL_ROWS.map(()=>false);
  if(!Array.isArray(S.rerollOpt)  || S.rerollOpt.length !==REROLL_ROWS.length) S.rerollOpt =REROLL_ROWS.map(()=>null);
  if(typeof S.rerollSpent!=='number' || !isFinite(S.rerollSpent) || S.rerollSpent<0) S.rerollSpent=0;
}

const MODALS = {

  /* ---------- [B1] 온보딩 ---------- */
  /* ★ G-04: 튜토리얼 8단계 완료 시 토스트 대신 5칸 보상 그리드 모달 */
  missionReward:{ title:'미션 완료', render(b){
    b.appendChild(el('div','center',`<div class="ei" style="font-size:38px">${eImg("🏅",2)}</div><div class="big">미션 완료 보상</div>`));
    const g=el('div','mr-grid');
    MISSION_REWARDS.forEach(r=>{ const c=el('div','mr-cell');
      c.innerHTML=`<div class="mi">${eImg(r.ic,2)}</div><div class="mn">${r.n}</div><div class="mq">×${fmt(r.q)}</div>`; g.appendChild(c); });
    b.appendChild(g);
    b.appendChild(el('div','center small mut','튜토리얼 8단계를 완료했습니다. 마지막으로 클래스를 선택하세요.'));
    const btn=el('button','btn gold wide','확인'); btn.style.marginTop='10px';
    btn.onclick=()=>{ if(!S._missionPaid){ S._missionPaid=true; MISSION_REWARDS.forEach(r=>{ try{ r.act(); }catch(e){} }); }
      sysLog('미션 완료 보상을 수령했습니다.'); refreshHUD();
      if(S.classTrait){ closeModal(); tutPoll(); } else chooseClassTrait(); };
    b.appendChild(btn);
  }},
  /* ★ G-05: 전신 일러 비교 화면 → [확정] 에서만 확정된다 */
  classCompare:{ title:'클래스 비교', render(b, id){
    const sel=CLASS_TRAITS.find(c=>c.id===id)||CLASS_TRAITS[0];
    b.appendChild(el('div','hint','선택한 클래스를 확인하세요. [확정] 후에는 변경할 수 없습니다.'));
    const row=el('div','cls-compare');
    const mk=c=>{ const d=el('div','cls-full'+(c.id===sel.id?' sel':''));
      d.innerHTML=`<div class="cf-art">${c.art}</div><div class="cf-n">${c.nm}</div><div class="cf-d">${c.bullets.join('<br>')}</div>`;
      d.onclick=()=>openModal('classCompare', c.id); return d; };
    row.append(mk(CLASS_TRAITS[0]), el('div','cls-vs','VS'), mk(CLASS_TRAITS[1]));
    b.appendChild(row);
    b.appendChild(el('div','center small mut',`선택 · <b style="color:#f0cd82">${sel.nm}</b> — ${sel.sum}`));
    const btnrow=el('div','btnrow'); btnrow.style.marginTop='10px';
    const back=el('button','btn','◀ 다시 선택'); back.onclick=()=>chooseClassTrait();
    const ok=el('button','btn gold','확정'); ok.onclick=()=>{ S.classTrait=sel.id; toast(`${sel.nm} 확정`);
      // ★ B4/G-50 (B1 소유 코드에 1줄 추가): 클래스 확정 시 HERO_001~005 중 해당 직업 N등급 확정 지급
      if(grantClassStarter(sel.id)){ const st=heroEntry(CLASS_STARTER[sel.id]); if(st) sysLog(`${gradeBadge(st.grade)} ${st.name} 지급`); }
      sysLog(`클래스 특성 <b style="color:#f0cd82">${sel.nm}</b> 확정`); closeModal(); refreshHUD(); tutPoll(); };
    btnrow.append(back,ok); b.appendChild(btnrow);
  }},

  /* ---------- 제작 / 대장간 ---------- */
  forge:{ title:'대장간', render(b){
    let cur='N', slotIdx=0, itemIdx=0;
    const tabs=el('div','tabrow');
    GORDER.forEach(g=>{ const t=el('div','tab'+(g===cur?' on':''), GRADES[g].name); if(g!==cur) t.style.color=GRADES[g].color;
      t.onclick=()=>{ cur=g; itemIdx=0; render2(); [...tabs.children].forEach((c,i)=>c.classList.toggle('on',GORDER[i]===g)); };
      tabs.appendChild(t); });
    b.appendChild(tabs);
    const body=el('div'); b.appendChild(body);
    function itemsOf(){ const s=FORGE_SLOTS[slotIdx]; return (s&&s.items&&s.items[cur])||[]; }
    function startCraft(item){
      if(S.craft){ toast('이미 제작중입니다.'); return; }                       // G-25
      const slot=FORGE_SLOTS[slotIdx], cp=craftParams(cur,slot.k,item.n);
      if(!recipeOk(item.recipe)){ toast('재료가 부족합니다.'); return; }         // G-26
      // ★ F2: 칭호 '빈털터리' — 원작 조건은 '골드가 모자란 상태에서 제작 버튼을 연속 클릭'이다.
      if(S.gold<cp.gold){
        S.stats.poorClick=(S.stats.poorClick||0)+1;
        S.stats.poorBest=Math.max(S.stats.poorBest||0, S.stats.poorClick);
        toast('골드가 부족합니다.'); return;
      }
      S.stats.poorClick=0;                                                      // 제작이 실제로 시작되면 스트릭 초기화
      item.recipe.forEach(r=>matSpend(r.k,r.need)); S.gold-=cp.gold;
      S.craft={ grade:cur, slot:item.n, cat:slot.k, ic:item.ic, endAt:Date.now()+cp.sec*1000*craftTimeMul(), // ★ B7/G-100 제작시간 버프
                p0:cp.p0, sec:cp.sec, gold:cp.gold, recipe:item.recipe.map(r=>({k:r.k,need:r.need})) };
      sfx('tap'); toast(`${GRADES[cur].name} ${item.n} 제작 시작`); openModal('forge'); refreshHUD();
    }
    // G-24: 아이템 클릭 → 중앙 오버레이 팝업(딤 + 확대 아이콘 + 이름 + 플레이버 + 전용 [제작])
    function openForgeItemPopup(item){
      const slot=FORGE_SLOTS[slotIdx];
      _forgeCtx={ grade:cur, cat:slot.k, item, cp:craftParams(cur,slot.k,item.n) };
      _forgeCraftFn=()=>startCraft(item);
      b2Overlay(MODALS.forgeItemPopup.title,(bd,close)=>MODALS.forgeItemPopup.render(bd,close));
    }
    /* ★ v5.61: 재료 칩 — 클릭 시 팝업으로 해당 등급의 모든 몬스터 표시. */
    function matToGrade(matKey){
      const m = MAT_BY_KEY[matKey];
      return m ? m.g : null;
    }
    function matChips(recipe){
      const matn=el('div','mat-need');
      (recipe||[]).forEach(r=>{ const have=matAvail(r.k), lack=have<r.need;
        const chip=el('div','mat-chip'+(lack?' lack':'')); chip.title=r.k;
        chip.style.cursor='pointer';
        chip.innerHTML=`<div class="mi">${matIcon(r.k)}</div><div class="have${lack?' lack':''}">${fmt(have)}/${r.need}</div>`;
        /* 재료 칩 클릭 → 팝업으로 몬스터 목록 */
        chip.onclick=()=>openMatMonsterPopup(r.k);
        matn.appendChild(chip); });
      return matn;
    }
    /* 재료를 떨구는 몬스터 목록 팝업 — 같은 등급의 모든 몬스터 표시. */
    function openMatMonsterPopup(matKey){
      const grade = matToGrade(matKey);
      if(!grade){ toast('재료 소환/합성으로 획득 가능합니다.'); return; }
      const mons = HUNT_TIERS.map((t,i)=>({t,i})).filter(x=>x.t.drop===grade);
      setModalTitle(`${matKey} 파밍 — ${GRADES[grade].name} 몬스터`);
      const b=$('#modalBody'); b.innerHTML='';
      b.appendChild(el('div','hint',`이 재료를 떨구는 ${GRADES[grade].name} 등급 몬스터들입니다. 사냥할 몬스터를 선택하세요.`));
      mons.forEach(({t,i})=>{
        const isHunting = (S.huntTier||0)===i;
        const row=el('div','pack');
        row.innerHTML=`<div class="pic" style="border-color:${t.c}">
          <img src="assets/monsters/${t.img}.png" style="width:40px;height:40px;object-fit:contain">
        </div>
        <div class="info">
          <div class="t" style="color:${t.c}">${t.n} ${isHunting?'<span class="small" style="color:var(--ok)">사냥중</span>':''}</div>
          <div class="d">드랍: ${matIcon(t.mat)} ${t.mat} · 권장 전투력 ${fmt(t.cp)}${totalCP()<t.cp?' ⚠':''}</div>
        </div>`;
        const btn=el('button','btn sm'+(isHunting?'':' gold'), isHunting?'사냥중':'사냥');
        if(isHunting) btn.disabled=true;
        btn.onclick=()=>{
          S.huntTier=i; Battle.setHunt(); sfx('tap');
          toast(`${t.n} 사냥 시작`);
          sysLog(`몬스터 사냥 → <span style="color:${t.c}">${t.n}</span>`);
          closeModal(); openModal('forge');
        };
        row.appendChild(btn); b.appendChild(row);
      });
      const closeBtn=el('button','btn wide','닫기');
      closeBtn.style.marginTop='10px';
      closeBtn.onclick=()=>{ closeModal(); openModal('forge'); };
      b.appendChild(closeBtn);
      $('#modal-root').classList.add('on'); currentModal='matMonster';
    }
    function render2(){
      body.innerHTML='';
      const slot=FORGE_SLOTS[slotIdx], G=GRADES[cur], list=itemsOf();
      if(itemIdx>=list.length) itemIdx=0;
      const item=list[itemIdx], cp=item?craftParams(cur,slot.k,item.n):null;
      const grid=el('div','forge-grid');
      const items=el('div','forge-items');
      list.forEach((it,i)=>{ const cell=el('div','fitem grade-'+cur+(i===itemIdx?' sel':'')); cell.style.setProperty('--gc',G.color);
        cell.innerHTML=eImg(it.ic,1.8); cell.title=it.n;
        cell.onclick=()=>{ itemIdx=i; render2(); }; items.appendChild(cell); });
      grid.appendChild(items);
      const side=el('div','forge-side');
      if(item){
        const prev=el('div','forge-preview grade-'+cur); prev.style.setProperty('--gc',G.color);
        prev.innerHTML=`${eImg(item.ic,2.5)}<div class="tag-common">공용</div>`; side.appendChild(prev);
        const nm=el('div','center small',item.n); nm.style.color=G.color; side.appendChild(nm);
        side.appendChild(matChips(item.recipe));                                  // G-20: 재료 chip 2~5개 가변
        const info=el('div','small mut'); info.style.lineHeight='1.55';
        /* ★ 2차 UI 대조: 원작 우측 패널 포맷은 "제작시간 : / 필요 골드 : / 제작 확률 :" 콜론 라벨.
           종전 "제작확률 100% / 골드 / 시간" 순서·라벨이 원작과 달랐다. 원작 순서(시간→골드→확률)와 라벨을 그대로 맞춘다.
           근거: 전량판독 #91 "제작시간 :30초 / 필요 골드 :1,500,000 / 제작 확률 100%". */
        info.innerHTML=`제작시간 : <b>${mmss(cp.sec)}</b><br>필요 골드 : <b style="color:${G.color}">${fmt(cp.gold)}</b><br>제작 확률 : <b style="color:${G.color}">${Math.round(cp.p0*100)}%</b>`
          + (cp.guide?'<br><b style="color:var(--g-legend)">길잡이 단계</b>':'');
        side.appendChild(info);
        /* ★ v5.58: 제작 버튼 클릭 시 제작 팝업(확률/비용 표시) → 확인 후 startCraft. */
        const btn=el('button','btn gold sm','제작'); btn.onclick=()=>openForgeItemPopup(item); side.appendChild(btn);
      }
      grid.appendChild(side); body.appendChild(grid);
      // G-17: 6칸 부위행 — 5·6번째(용광로·망치)는 액션 숏컷
      const sr=el('div','slot-row');
      FORGE_SLOTS.forEach((s,i)=>{ const st=el('div','slot-tab'+((!s.act&&i===slotIdx)?' on':'')); st.innerHTML=eImg(s.ic,1.6); st.title=s.k;
        st.onclick=()=>{ if(s.act){ sfx('tap'); openSub(s.act); return; } slotIdx=i; itemIdx=0; render2(); };   // ★ v5.1 대장간 위 오버레이
        sr.appendChild(st); });
      body.appendChild(sr);
      if(item) body.appendChild(el('div','warn',`⚠ ${G.name} ${item.n} — 실패 시 재료 90% 환급`));
      /* ★ v5.59: 재료 칩 클릭으로 몬스터 목록 펼침 (위 matChips에서 처리).
         종전의 자동 역파밍 목록은 제거 — 칩 클릭 시만 펼쳐짐. */
      if(S.craft) renderProgress();
    }
    function renderProgress(){
      const c=S.craft, sec=c.sec||CRAFT[c.grade].sec;
      const left=Math.max(0,Math.ceil((c.endAt-Date.now())/1000)), done=left<=0;
      body.appendChild(el('div','hr'));
      body.appendChild(el('div','center',`<div class="ei" style="font-size:44px">${eImg(c.ic,3)}</div><div class="big" style="color:${GRADES[c.grade].color}">${GRADES[c.grade].name} ${c.slot||'장비'} 제작 중</div>`));
      const pb=el('div','pbar'); pb.appendChild(el('i')); pb.firstChild.id='forgeBar';
      pb.firstChild.style.width=(clamp(1-left/sec,0,1)*100)+'%'; body.appendChild(pb);
      const lt=el('div','center mut small',done?'제작 완료 · 확정하세요':`남은 시간 ${mmss(left)}`); lt.id='forgeLeft'; body.appendChild(lt);
      const row=el('div','btnrow'); row.style.marginTop='12px';
      // G-27: 즉시 완성 확인 팝업
      /* ★ 2차 UI 대조: 원작 버튼 라벨은 "즉시 완성"(띄어쓰기 있음). 확인 팝업 문구는 "제작을 즉시 완료 하시겠습니까?".
         종전 "즉시완성"(붙여쓰기)은 원작과 달랐다. 근거: 전량판독 #91 "[즉시 완성][확정 제작][제작 취소]". */
      const inst=el('button','btn gold','즉시 완성');
      inst.onclick=()=>{ b2Confirm('즉시 완성',
        `<div class="big">제작을 즉시 완료 하시겠습니까?</div>
         <div class="b2-warnline">*제작 실패 확률은 똑같이 존재합니다*</div>
         <div style="margin-top:6px"><span style="font-size:26px">📜</span> <b style="color:var(--g-legend)">30</b> <span class="small mut">(보유 ${fmt(S.craftScroll)})</span></div>`,
        ()=>{ if(!S.craft) return; if(S.craftScroll<30){ toast('제작서가 부족합니다.'); return; }
              S.craftScroll-=30; S.craft.endAt=Date.now(); resolveCraft(); }); };
      // G-29: 확정 제작 = 성공 100% 보장 + 시간 스킵 (대기 중에도 클릭 가능)
      const fin=el('button','btn gold','확정 제작'); fin.id='forgeFin'; fin.onclick=()=>resolveCraft(true);
      const cancel=el('button','btn red','제작 취소'); cancel.onclick=()=>cancelCraft();   // G-28: 100% 환급
      row.append(inst,fin,cancel); body.appendChild(row);
      body.appendChild(el('div','hint','즉시 완성 = 시간만 스킵(실패 확률 유지) · 확정 제작 = 성공 보장 + 시간 스킵 · 제작 취소 = 재료·골드 100% 환급'));
    }
    render2();
  }},

  // G-24: 대장간 아이템 상세 오버레이 팝업
  forgeItemPopup:{ title:'아이템 제작', render(b, close){
    const c=_forgeCtx;
    if(!c){ b.appendChild(el('div','hint','대장간에서 아이템을 선택하세요.')); return; }
    const G=GRADES[c.grade];
    /* ★ v5.60: 아이템 아이콘을 에셋으로 통일 (이모지 폴백). */
    b.appendChild(el('div','b2-big',eImg(c.item.ic,3)));
    const nm=el('div','b2-name',`${G.name} ${c.item.n}`); nm.style.color=G.color; b.appendChild(nm);
    b.appendChild(el('div','b2-flavor',itemFlavor(c.item.n)));
    const matn=el('div','mat-need');
    c.item.recipe.forEach(r=>{ const have=matAvail(r.k), lack=have<r.need;
      const chip=el('div','mat-chip'+(lack?' lack':'')); chip.title=r.k;
      chip.innerHTML=`<div class="mi">${matIcon(r.k)}</div><div class="have${lack?' lack':''}">${fmt(have)}/${r.need}</div>`;
      matn.appendChild(chip); });
    b.appendChild(matn);
    /* ★ v5.60: 제작 정보를 명확히 3줄로 표시. */
    b.appendChild(el('div','stat-line',`<span>제작시간</span><span class="v" style="color:#f0cd82">${mmss(c.cp.sec)}</span>`));
    b.appendChild(el('div','stat-line',`<span>필요 골드</span><span class="v" style="color:${G.color}">${fmt(c.cp.gold)}</span>`));
    b.appendChild(el('div','stat-line',`<span>제작 확률</span><span class="v" style="color:${c.cp.p0>=1?'var(--ok)':'var(--warn)'}">${Math.round(c.cp.p0*100)}%</span>`));
    b.appendChild(el('div','warn','⚠ 실패 시 재료 90% 환급'));
    const row=el('div','btnrow'); row.style.marginTop='9px';
    const no=el('button','btn','취소'); no.onclick=()=>{ if(close) close(); };
    const yes=el('button','btn gold','제작 시작'); yes.onclick=()=>{ if(close) close(); if(_forgeCraftFn) _forgeCraftFn(); };
    row.append(no,yes); b.appendChild(row);
  }},

  /* ---------- 재료 합성 (용광로) ---------- */
  synth:{ title:'재료 합성', render(b){
    const MULTS=[1,5,10,'최대'];
    let sel=(MATS[0]||{}).k, mi=0;
    const body=el('div'); b.appendChild(body);
    function nextOf(k){ const m=MAT_BY_KEY[k]; if(!m) return null; const gi=GORDER.indexOf(m.g);
      if(gi<0||gi>=GORDER.length-1) return null;
      return MAT_BY_GRADE[GORDER[gi+1]][MAT_BY_GRADE[m.g].indexOf(m)]; }
    function rateOf(g){ return g==='R'?50:g==='E'?0.8:0.08; }   // G-31
    function times(cost){ const av=matAvail(sel); const m=MULTS[mi];
      return (m==='최대') ? Math.max(0,Math.floor(av/cost)) : m; }
    function rd(){
      body.innerHTML='';
      body.appendChild(el('div','hint','30개 이상의 동일 아이템을 합성 할 수 있습니다'));
      // G-32: 5열 × 3행(24종) 보유 재료 그리드
      const g=el('div','synth-grid');
      MATS.forEach(m=>{ const c=el('div','synth-cell'+(m.k===sel?' on':'')); c.title=m.k;
        c.innerHTML=`<div class="si">${eImg(m.ic,1.5)}</div><div class="sc">${fmt(matAvail(m.k))}</div>`;
        c.onclick=()=>{ sel=m.k; sfx('tap'); rd(); }; g.appendChild(c); });
      body.appendChild(g);
      const m=MAT_BY_KEY[sel], tg=nextOf(sel), p=tg?rateOf(tg.g):0;
      const flow=el('div','synth-flow');
      flow.innerHTML=`<div class="sf">${eImg(m.ic,1.5)}</div><div class="ar">➜</div><div class="sf">${tg?tg.ic:'🚫'}</div>`;
      body.appendChild(flow);
      body.appendChild(el('div','center small',
        `${m.k} <span class="mut">(${GRADES[m.g].name})</span> → ` +
        (tg?`<b style="color:${GRADES[tg.g].color}">${tg.k}</b> <span class="mut">(${GRADES[tg.g].name})</span>`:'<span class="mut">최상위 등급 · 합성 불가</span>')));
      body.appendChild(el('div','center small mut',
        `확률 합성 ${p}% · 재료 30개 소모 / 확정 합성 재료 500개 소모 · 보유 ${fmt(matAvail(sel))}`));
      // G-34: 배수 셀렉터 (1 / 5 / 10 / 최대)
      const ms=el('div','mult-sel');
      const dn=el('div','ma','▼'), mv=el('div','mv', MULTS[mi]==='최대'?'최대':MULTS[mi]+'X'), up=el('div','ma','▲');
      dn.onclick=()=>{ mi=(mi+MULTS.length-1)%MULTS.length; rd(); };
      up.onclick=()=>{ mi=(mi+1)%MULTS.length; rd(); };
      ms.append(el('div','small mut','배수'),dn,mv,up); body.appendChild(ms);
      const wrap=el('div','btnrow'); wrap.style.marginTop='6px';
      // G-33: 확정 합성 확인 팝업
      const b2=el('button','btn sm gold','확정 합성');
      b2.onclick=()=>{ if(!tg){ toast('더 이상 합성할 수 없습니다.'); return; }
        const n=times(500);
        if(n<1||matAvail(sel)<500*n){ toast('재료가 부족합니다.'); return; }
        b2Confirm('확정 합성',
          `<div class="big">확정 합성 하시겠습니까?</div>
           <div class="b2-warnline">*합성시 재료 500개가 소모됩니다*</div>
           <div class="small mut" style="margin-top:4px">${eImg(m.ic,1.5)} ${m.k} X${fmt(500*n)} → ${eImg(tg.ic,1.5)} ${tg.k} X${n}</div>`,
          ()=>{ if(matAvail(sel)<500*n){ toast('재료가 부족합니다.'); return; }
                for(let i=0;i<n;i++){ matSpend(sel,500); matGain(tg.k,1); }
                S.stats.synths=(S.stats.synths||0)+n; sfx('craft');
                toast(`${tg.k} 확정 합성 X${n}`); sysLog(`${gradeBadge(tg.g)} ${tg.k} 확정 합성 X${n}`); rd(); refreshHUD(); }); };
      const b1=el('button','btn sm','합 성');
      b1.onclick=()=>{ if(!tg){ toast('더 이상 합성할 수 없습니다.'); return; }
        const n=times(30);
        if(n<1||matAvail(sel)<30*n){ toast('재료가 부족합니다.'); return; }
        let ok=0; for(let i=0;i<n;i++){ matSpend(sel,30); if(Math.random()*100<p){ matGain(tg.k,1); ok++; } }
        S.stats.synths=(S.stats.synths||0)+n;
        if(ok){ sfx('craft'); toast(`합성 성공 ${ok}/${n}`); sysLog(`${gradeBadge(tg.g)} ${tg.k} 합성 성공 X${ok}`); }
        else toast(`합성 실패… (${n}회)`);
        rd(); refreshHUD(); };
      wrap.append(b2,b1); body.appendChild(wrap);   // G-35: 확정 합성(좌) / 합 성(우)
    }
    rd();
  }},

  /* ---------- 망치 제작 (G-36) ---------- */
  hammerSynth:{ title:'망치 제작', render(b){
    b.appendChild(el('div','hint','*15개의 망치를 사용해 전설 망치 1개 제작*'));
    const flow=el('div','synth-flow');
    flow.innerHTML=`<div style="text-align:center"><div class="sf">${eImg("🔨",2)}</div><div class="small mut">일반 망치</div><div class="small">${fmt(S.hammerN||0)}</div></div>
      <div class="ar">➜</div>
      <div style="text-align:center"><div class="sf">🔨</div><div class="small" style="color:var(--g-legend)">전설 망치</div><div class="small">${fmt(S.hammers||0)}</div></div>`;
    b.appendChild(flow);
    const btn=el('button','btn gold wide','합 성'); if((S.hammerN||0)<15) btn.disabled=true;
    btn.onclick=()=>{ if((S.hammerN||0)<15){ toast('일반 망치가 부족합니다.'); return; }
      S.hammerN-=15; S.hammers=(S.hammers||0)+1; sfx('craft'); toast('전설 망치 +1');
      sysLog('<span class="lgd">전설 망치</span> 제작 성공'); openModal('hammerSynth'); refreshHUD(); };
    b.appendChild(btn);
    b.appendChild(el('div','hint','전설 망치는 영웅·레전더리 장비의 강화 파괴 방지에 사용됩니다.'));
  }},

  /* ---------- 영웅 ---------- */
  /* ★ B4/G-50·G-51: 30종 로스터를 2열 카드로 전부 렌더(미보유 회색).
     카드 구성 = [합성](우상단, 요건 미달 시 disabled) + 조각 n/need + 직업명 + 원형 [장비] + [소환]/[소환중] */
  hero:{ title:'영웅', render(b){
    b.appendChild(el('div','hint',`영웅 로스터 <b>${HERO_ROSTER.length}종</b> — 조각을 모아 [합성]으로 해금하고, [배치]로 진영에 편성합니다.`));
    const grid=el('div','grid c2 hero-grid'); grid.style.marginTop='10px';
    const activeKey=S.formActive||'1';
    const form=(S.formations&&S.formations[activeKey])||{};
    const slotCap=(activeKey==='pvp')?4:3;
    const inForm=hid=>Object.keys(form).some(k=>form[k]===hid);
    HERO_ROSTER.forEach(r=>{
      const e=heroEntry(r.hero_id); const G=GRADES[r.grade];
      const need=heroFuseNeed(r.hero_id), sh=heroShardAvail(r.hero_id);   // ★ B7/F1: 전용 + 직업 공용
      const card=el('div','herocard gframe grade-'+r.grade); card.style.setProperty('--gc',G.color);
      card.innerHTML=`<div class="hc-grade" style="color:${G.color}">${G.name}</div>
        <div class="hc-art" style="${e.own?'':'filter:grayscale(1);opacity:.35'}">${heroPortrait(r.hero_id,3)}</div>
        <div class="hc-name">${r.name}</div>
        <div class="hc-job">${e.job.name}${e.own?` · Lv${e.level}`:''}</div>
        <div class="hc-shard ${e.own?'':(sh>=need?'ok':'lack')}">🔥 ${e.own?'보유':`${fmt(sh)}/${fmt(need)}`}</div>`;
      // [합성] — 우상단
      const fu=el('button','btn xs hc-fuse','합성');
      if(e.own || !heroFuseReady(r.hero_id)) fu.disabled=true;
      fu.onclick=ev=>{ ev.stopPropagation();
        if(e.own){ toast('이미 보유한 영웅입니다.'); return; }
        if(!heroFusePrereq(r.hero_id)){ toast(`${e.job.name} 하위 등급 영웅을 먼저 보유해야 합니다.`); return; }
        if(sh<need){ toast(`조각이 부족합니다. (${fmt(sh)}/${fmt(need)})`); return; }
        if(heroFuse(r.hero_id)){ sfx('craft'); toast(`${r.name} 합성 성공!`);
          sysLog(`${gradeBadge(r.grade)} ${r.name} 합성 성공`); guideCheck('fuse'); openModal('hero'); refreshHUD(); } };
      card.appendChild(fu);
      // 하단 액션 — 원형 [장비] + [소환]/[소환중]
      const act=el('div','hc-act');
      const eq=el('div','hc-eq','🛡️'); eq.title='장비';
      eq.onclick=ev=>{ ev.stopPropagation(); if(!e.own){ toast('미보유 영웅입니다.'); return; } openModal('equip', r.hero_id); };
      const on=inForm(r.hero_id);
      /* ★ v5.67: 미보유 영웅은 '미보유' 회색 비활성화. 보유는 배치/배치됨. */
      const isHome = activeKey==='1' || activeKey==='2';
      const homeSlotCap = isHome ? 1 : slotCap;
      let sbLabel, sbClass;
      if(!e.own){ sbLabel='미보유'; sbClass='btn xs'; }
      else if(on){ sbLabel='배치됨'; sbClass='btn xs gold'; }
      else{ sbLabel='배치'; sbClass='btn xs'; }
      const sb=el('button', sbClass, sbLabel);
      if(!e.own) sb.disabled=true;
      sb.onclick=ev=>{ ev.stopPropagation();
        if(!e.own) return;
        if(on){ Object.keys(form).forEach(k=>{ if(form[k]===r.hero_id) delete form[k]; });
          S.formation=Object.assign({},form); toast(`${r.name} 배치 해제`); }
        else {
          /* 홈에서 이미 배치된 영웅이 있으면 자동 해제 후 교체 */
          if(isHome){
            Object.keys(form).forEach(k=>{ if(form[k]) delete form[k]; });
          }
          let slot=-1; for(let i=0;i<homeSlotCap;i++){ if(!form[i]){ slot=i; break; } }
          if(slot<0){ toast(`진영이 가득 찼습니다.`); return; }
          form[slot]=r.hero_id; S.formation=Object.assign({},form);
          toast(isHome ? `${r.name} 배치 — 홈 필드에 출전` : `${r.name} 배치 · ${['전방','측면','후방','예비'][slot]}`);
        }
        S.formations[activeKey]=form; Battle.refreshParty(); tutEvent('form'); openModal('hero'); refreshHUD(); };
      act.append(eq,sb); card.appendChild(act);
      card.onclick=()=> e.own ? heroDetail(r.hero_id) : toast(`${r.name} 미보유 · 조각 ${fmt(sh)}/${fmt(need)}`);
      grid.appendChild(card);
    });
    b.appendChild(grid);
    const aw=el('div'); aw.style.marginTop='12px'; aw.innerHTML=`<div class="hr"></div>`;
    const row=el('div','btnrow');
    const eb=el('button','btn wide','🛡️ 장비 착용창'); eb.onclick=()=>openModal('equip');
    const ab=el('button','btn wide gold','⚡ 각성'); ab.onclick=()=>openModal('awaken');
    row.append(eb,ab); aw.appendChild(row); b.appendChild(aw);
    // ★ G-52: 최하단 [진영 선택] → formation 모달
    const fb=el('button','btn wide gold','⚔️ 진영 선택'); fb.style.marginTop='8px';
    fb.onclick=()=>openModal('formation'); b.appendChild(fb);
  }},

  /* ★ B4/G-52: 진영 편성 모달 — 상단 탭 3개(1번 진영 / 2번 진영 / PVP),
     포지션 슬롯(전방·측면·후방, PVP 는 +예비 4칸) + 우측 보유 영웅 리스트.
     draft 에만 반영하고 [저장 / 사용] 을 눌러야 S.formations 에 커밋된다. */
  formation:{ title:'진영 편성', render(b){
    const TABS=[['1','1번 진영'],['2','2번 진영'],['pvp','PVP']];
    let tab = MODALS.formation._tab || S.formActive || '1';
    MODALS.formation._tab = tab;
    let draft = Object.assign({}, (S.formations&&S.formations[tab])||{});
    let dirty = false;
    const POS=['전방','측면','후방','예비'];
    const wrap=el('div');
    const tabrow=el('div','tabrow');
    TABS.forEach(([k,label])=>{ const t=el('div','tab'+(k===tab?' on':''),label);
      t.onclick=()=>{ if(k===tab) return;
        if(dirty){ toast('저장하지 않은 편성이 있습니다. [저장 / 사용]을 눌러 주세요.'); return; }
        MODALS.formation._tab=k; openModal('formation'); };
      tabrow.appendChild(t); });
    b.appendChild(tabrow);
    b.appendChild(el('div','hint',`${tab==='pvp'?'PVP 진영 (4칸)':'일반 콘텐츠 진영 (3칸)'} — 슬롯을 눌러 비우고, 우측 목록에서 영웅을 눌러 배치합니다.`));
    const cap = tab==='pvp' ? 4 : 3;
    const grid=el('div','form-grid');
    const listBox=el('div','form-list');
    const paint=()=>{
      grid.innerHTML='';
      for(let i=0;i<cap;i++){
        const hid=draft[i]; const e=hid?heroResolve(hid):null;
        const s=el('div','fslot'+(e?'':' empty'));
        s.innerHTML = e ? `<div class="ei">${jobIcon(e.job.id)}</div><div class="fn">${e.name}</div><div class="fpos">${POS[i]}</div>`
                        : `<div class="ei" style="opacity:.3">＋</div><div class="fpos">${POS[i]}</div>`;
        s.onclick=()=>{ if(!draft[i]) { toast(`${POS[i]} 슬롯이 비어 있습니다. 우측 목록에서 선택하세요.`); return; }
          delete draft[i]; dirty=true; paint(); };
        grid.appendChild(s);
      }
      listBox.innerHTML='';
      const owned=ownedHeroes();
      if(!owned.length) listBox.appendChild(el('div','hint','보유 영웅이 없습니다.'));
      owned.forEach(h=>{
        const used=Object.keys(draft).some(k=>draft[k]===h.hero_id);
        const r=el('div','form-hero'+(used?' used':'')); r.style.setProperty('--gc',GRADES[h.grade].color);
        r.innerHTML=`<span class="fh-ic">${jobIcon(h.job.id)}</span><span class="fh-n">${h.name}</span>
          <span class="fh-g" style="color:${GRADES[h.grade].color}">${GRADES[h.grade].name}</span>`;
        r.onclick=()=>{
          if(used){ Object.keys(draft).forEach(k=>{ if(draft[k]===h.hero_id) delete draft[k]; }); dirty=true; paint(); return; }
          let slot=-1; for(let i=0;i<cap;i++){ if(!draft[i]){ slot=i; break; } }
          if(slot<0){ toast('빈 슬롯이 없습니다. 슬롯을 눌러 비우세요.'); return; }
          draft[slot]=h.hero_id; dirty=true; paint();
        };
        listBox.appendChild(r);
      });
    };
    const cols=el('div','form-cols'); cols.append(grid, listBox); wrap.appendChild(cols); b.appendChild(wrap);
    paint();
    const row=el('div','btnrow'); row.style.marginTop='10px';
    const use=el('button','btn gold wide','저장 / 사용');
    use.onclick=()=>{
      S.formations[tab]=Object.assign({},draft);
      if(tab!=='pvp'){ S.formActive=tab; S.formation=Object.assign({},draft); }   // 레거시 미러(투기장·구코드 호환)
      dirty=false; Battle.refreshParty(); sfx('tap');
      toast(`${TABS.find(t=>t[0]===tab)[1]} 저장 완료`); tutEvent('form'); refreshHUD(); openModal('formation');
    };
    const back=el('button','btn wide','◀ 영웅');
    back.onclick=()=>{ if(dirty) toast('저장하지 않은 편성은 반영되지 않습니다.'); openModal('hero'); };
    row.append(back,use); b.appendChild(row);
    b.appendChild(el('div','small mut center',`활성 진영: ${TABS.find(t=>t[0]===(S.formActive||'1'))[1]} · 일반 콘텐츠는 3인이 출전합니다.`));
  }},

  /* ★ v5.8: 각성 12단계에서 성장이 끊기고 조각 수요도 함께 사라지던 공백을 잇는다.
     · 1~12단계 = 조각 소모(현행 유지, 밸런스기획서 342행 확정 커브 250×1.08^n)
     · 13~20단계 = **심화 각성**, 영웅 기록서 소모. 기록서는 그동안 유료 패키지로만 들어오고
       소비처가 0 이던 고아 재화였다 — 두 문제를 한 축으로 묶는다.
     기록서 무과금 획득: 회색코인 상점 / 시련의 탑 웨이브 상자 교환(v5.8 에서 함께 신설). */
  awaken:{ title:'각성', render(b){
    const lv=S.awaken, BASE_CAP=12, DEEP_CAP=20;
    const deep = lv>=BASE_CAP;                       // 심화 구간 진입 여부
    const shardCost = Math.round(250*Math.pow(1.08, lv));
    const recCost   = 1 + Math.floor((lv-BASE_CAP)/2);   // 13~14:1권 · 15~16:2권 …
    const pct=(lv*1.5).toFixed(1);
    b.appendChild(el('div','awaken-orb', deep?'🌟':'🪨'));
    b.appendChild(el('div','awaken-lv','+'+lv));
    ['최종 최대 체력 증가','최종 공격력·마법 공격력 증가','최종 방어력·마법 저항력 증가']
      .forEach(t=>{ const x=el('div','stat-line'); x.innerHTML=`<span>${t}</span><span class="v">${pct}%</span>`; b.appendChild(x); });

    const totalShards = shardTotal();                // 직업 공용 + 영웅 전용 조각
    const recs = S.records||0;
    const maxed = lv>=DEEP_CAP;
    const cost  = deep ? recCost : shardCost;
    const have  = deep ? recs : totalShards;

    if(maxed){
      b.appendChild(el('div','center mut small',`최대 단계 도달 (+${lv}) · 시즌1 상한 ${DEEP_CAP}단계`));
    } else if(deep){
      b.appendChild(el('div','warn',`*심화 각성 — 영웅 기록서 ${recCost}권이 소모됩니다* (보유 ${recs}권)`));
      b.appendChild(el('div','center mut small',`단계당 +1.5% · 13~${DEEP_CAP}단계는 기록서로 진행합니다`));
      if(recs<recCost) b.appendChild(el('div','center small mut','기록서는 회색코인 상점 · 시련의 탑 상자 교환에서 얻습니다'));
    } else {
      b.appendChild(el('div','warn',`*각성당 조각 ${shardCost}개가 소모됩니다* (보유 조각 ${totalShards})`));
      b.appendChild(el('div','center mut small',`단계당 +1.5% · ${BASE_CAP}단계부터는 심화 각성(기록서)으로 이어집니다`));
    }

    const btn=el('button','btn gold wide', maxed?'최대 단계':(deep?'심화 각성':'각성'));
    btn.style.marginTop='8px';
    if(maxed || have<cost) btn.disabled=true;
    btn.onclick=()=>{
      if(maxed) return;
      if(have<cost){ toast(deep?'영웅 기록서가 부족합니다.':'조각이 부족합니다.'); return; }
      if(deep){ S.records=(S.records||0)-recCost; }
      else {
        // 소모 순서: 직업 공용 조각 → 남으면 영웅 전용 조각
        let rem=shardCost;
        for(const k of Object.keys(S.shards)){ if(rem<=0) break; const t=Math.min(S.shards[k]||0,rem); S.shards[k]-=t; rem-=t; }
        for(const k of Object.keys(S.heroShards||{})){ if(rem<=0) break; const t=Math.min(S.heroShards[k]||0,rem); S.heroShards[k]-=t; rem-=t; }
      }
      S.awaken++; sfx('awaken'); Battle.refreshParty();
      toast(`${deep?'심화 각성':'각성'} +${S.awaken}! 계정 전체 스탯 +1.5%`);
      sysLog(`${deep?'<span class="lgd">심화 각성</span>':'각성'} <span class="lgd">+${S.awaken}단계</span> 달성`);
      guideCheck('awaken'); openModal('awaken'); refreshHUD();
    };
    b.appendChild(btn);
  }},

  /* ---------- 장비 착용창 (좌우 대칭 페이퍼돌) ----------
     ★ B3/G-37: 10칸 — 좌5(투구·목걸이·상의·하의·신발) + 우4(무기·방패·반지·정수) + 중앙하단 벨트 1.
        '고서'는 장비 슬롯에서 제거되어 인벤토리 특수 아이템으로만 존재한다.
     ★ B3/G-45: 영웅 전환 UI(◀ 이름 ▶) — openModal('equip', heroId)
     ★ B3/G-47: 기능 버튼 5개 (2×2 + 정중앙 원형 1) */
  equip:{ title:'장비', render(b, heroId){
    const roster = ownedHeroes();
    if(!roster.length){ b.appendChild(el('div','hint','보유 영웅이 없습니다. 소환(🎟️)에서 영웅을 확보하세요.')); return; }
    // ★ B4/G-50: heroId 는 hero_id 가 정본(구코드의 직업 id 도 heroResolve 로 해석)
    const want = heroId ? heroResolve(heroId) : null;
    let idx = want ? roster.findIndex(h=>h.hero_id===want.hero_id) : -1;
    if(idx<0){ const p0=party()[0]; idx = p0 ? Math.max(0, roster.findIndex(h=>h.hero_id===p0.hero_id)) : 0; }
    const cur = roster[idx] || roster[0];
    const heroJob = cur.job, heroGrade = cur.grade;
    const go=d=>{ const n=(idx+d+roster.length)%roster.length; openModal('equip', roster[n].hero_id); };
    // 영웅 전환 헤더
    const hsw=el('div','eq-heroswitch');
    const pv=el('div','hsw','◀'); pv.onclick=()=>go(-1);
    const nx=el('div','hsw','▶'); nx.onclick=()=>go(1);
    const hnm=el('div','hsname'); hnm.innerHTML=`<b style="color:${GRADES[heroGrade].color}">${GRADES[heroGrade].name} ${cur.name}</b><span class="mut">${idx+1} / ${roster.length} · 눌러서 다음 영웅</span>`;
    hnm.onclick=()=>go(1);
    hsw.append(pv,hnm,nx); b.appendChild(hsw);

    /* ★ v5.69: findEq — equipped:true이고 이 영웅에게 귀속된 장비만 표시.
       종전엔 equipped/heroId 체크 없이 첫 매칭 장비를 표시 → 모든 장비가 착용된 것처럼 보임. */
    const findEq=names=>S.equips.find(e=>e.equipped && (!e.heroId || e.heroId===cur.hero_id) && names.some(n=>e.slot.indexOf(n)>=0));
    const mkSlot=(label,names)=>{ const eq=findEq(names); const s=el('div','eq-slot'+(eq?' grade-'+eq.grade:' empty'));
      if(eq){ s.style.setProperty('--gc',GRADES[eq.grade].color); s.innerHTML=`${equipImg(eq.slot,2)}<div class="sl">+${eq.enh}</div>`; s.onclick=()=>itemDetail(eq, cur.hero_id); }
      else { s.innerHTML=label; s.onclick=()=>toast(`${label} 부위가 비어 있습니다`); }
      return s; };
    const doll=el('div','paperdoll'); const colL=el('div','eq-col'); const colR=el('div','eq-col');
    [['투구',['투구']],['목걸이',['목걸이']],['상의',['상의']],['하의',['하의']],['신발',['신발']]].forEach(([l,n])=>colL.appendChild(mkSlot(l,n)));
    [['무기',['단검','대검','도끼','지팡이','장궁','강궁','검','창','낫','완드','소드']],['방패',['방패']],['반지',['반지']],['정수',['정수']]].forEach(([l,n])=>colR.appendChild(mkSlot(l,n)));
    const center=el('div','eq-center');
    const hero=el('div','eq-hero'); hero.innerHTML=jobIcon(heroJob.id); center.appendChild(hero);
    const nm=el('div','small'); nm.style.color=GRADES[heroGrade].color; nm.style.fontWeight='700'; nm.textContent=`${GRADES[heroGrade].name} ${cur.name}`; center.appendChild(nm);
    // 10번째 슬롯 — 벨트(중앙 하단)
    const beltWrap=el('div','eq-beltrow'); beltWrap.appendChild(mkSlot('벨트',['벨트'])); center.appendChild(beltWrap);
    const fn=el('div','eq-fn5');
    [['강화','⚒️',()=>{ if(!S.equips.length){toast('장비 없음 · 대장간에서 제작');return;} openEnhance(S.equips[0]); }],
     ['스탯','📊',()=>toast(`전투력 ${fmt(totalCP())}`)],
     ['각성','⚡',()=>openModal('awaken')],
     ['스킬','✨',()=>toast('스킬은 등급업(합성) 시 해금')]].forEach(([t,ic,cb])=>{ const rb=el('div','round-btn'); rb.innerHTML=`<span class="gi">${eImg(ic,1.5)}</span><span>${t}</span>`; rb.onclick=cb; fn.appendChild(rb); });
    // ★ N1/§5-4 해소: 정중앙 원형 버튼(🎲) = 장비 옵션 재설정(주사위 리롤) 진입점
    const mid=el('div','round-btn mid'); mid.innerHTML='<span class="gi">'+eImg('🎲',1.6)+'</span>';
    mid.onclick=()=>{ sfx('tap'); openSub('optionReroll', cur.hero_id); }; fn.appendChild(mid);   // ★ v5.1 착용창 위 오버레이
    center.appendChild(fn); doll.append(colL,center,colR); b.appendChild(doll);
    b.appendChild(el('div','warn','⚠ 장착 시 기존 아이템 파괴 · 강화 실패 시 파괴(파괴방지: 망치 / 하락방지: 하락 방지권)'));
    b.appendChild(el('div','small mut',`보유 장비 ${S.equips.length}종 (탭하여 강화)`));
    const tray=el('div','grid c5'); tray.style.marginTop='6px';
    if(!S.equips.length) tray.appendChild(el('div','hint','아직 장비가 없습니다. 대장간(⚒️)에서 제작하세요.'));
    S.equips.slice(0,15).forEach(e=>{ const c=el('div','cell gframe grade-'+e.grade); c.style.setProperty('--gc',GRADES[e.grade].color);
      c.innerHTML=`<div class="ei" style="font-size:22px">${equipImg(e.slot,2)}</div><div class="cn">${e.slot}</div>${e.enh?`<div class="lvl">+${e.enh}</div>`:''}`; c.onclick=()=>itemDetail(e, cur.hero_id); tray.appendChild(c); });
    b.appendChild(tray);
  }},

  /* ---------- [N1] 장비 옵션 재설정 (주사위 리롤) · 갭스펙 §5-4 해소 ----------
     상수·근거는 REROLL_ROWS 위 주석 블록 참조. 화면 구성(상→하):
       ① "X 소모" 누적 카운터  ② 500/1000 눈금이 박힌 진행 게이지
       ③ 🎲 보유 주사위        ④ 적색 소모 안내문(고정)
       ⑤ 등급 4행 [자물쇠][등급명+옵션칸][↻]
     ⚠ 재화 가드: 이 화면은 전투를 시작하지 않으므로 던전 입장부(busyFight)와 달리
       강화(openEnhance)·각성(MODALS.awaken)과 같은 "차감 직전 재검증" 패턴을 따른다. */
  optionReroll:{ title:'옵션 재설정', render(b, heroId){
    rerollFix();
    const back=()=>openModal('equip', heroId);
    // ① 누적 소모 카운터
    b.appendChild(el('div','rr-spent',`${fmtFull(S.rerollSpent)} 소모`));
    // ② 눈금 게이지 (누적 소모 / 1000)
    const track=el('div','rr-track');
    track.appendChild(el('i','rr-fill')).style.width=clamp(S.rerollSpent/REROLL_BAR_MAX,0,1)*100+'%';
    REROLL_MILES.forEach(m=>{
      const t=el('div','rr-ms'+(S.rerollSpent>=m.at?' on':''),`${m.at}개 / ${GRADES[m.g].name}`);   // 원작 표기는 자릿수 구분 없음
      t.style.color=(m.g==='L'?'var(--bad)':'var(--ember)');
      track.appendChild(t);
    });
    b.appendChild(track);
    // ③ 보유 주사위
    b.appendChild(el('div','rr-have',`<span class="ri">${eImg("🎲",2)}</span><b>${fmtFull(S.dice)}</b>`));
    // ④ 소모 안내문 (원작 적색 고정 문구와 동일 구성)
    b.appendChild(el('div','warn','*'+REROLL_ROWS.map((r,i)=>`${GRADES[r.g].name}${i?' ':' : '}${r.cost}개`).join(', ')+' 소요*'));
    // ⑤ 등급 4행
    const list=el('div','rr-list');
    REROLL_ROWS.forEach((r,i)=>{
      const G=GRADES[r.g], locked=!!S.rerollLock[i], opt=S.rerollOpt[i];
      const row=el('div','rr-row');
      // 자물쇠 — 주사위 소모 없는 토글
      const lk=el('div','rr-lock'+(locked?' lk':''));
      lk.innerHTML=`<span class="li">${locked?eImg("🔒",2):'🔓'}</span><span class="ll">${locked?'잠금':'열림'}</span>`;
      lk.onclick=()=>{
        S.rerollLock[i]=!S.rerollLock[i]; sfx('tap');
        if(S.rerollLock[i]) toast('잠금되었습니다.');   // 해제 토스트는 원작 캡처 없음 → 라벨 전환만
        openModal('optionReroll', heroId);
      };
      row.appendChild(lk);
      // 옵션 프레임 = [등급명][결과 텍스트]
      const fr=el('div','rr-frame');
      fr.appendChild(el('div','rr-g',G.name)).style.color=G.color;
      const val=el('div','rr-opt');
      if(opt) val.textContent=`${opt.s}(${GRADES[opt.g].name})`;
      else if(r.g==='L') val.innerHTML='<span class="rr-art">⚔</span>';   // 레전더리 빈 칸 = 교차검 장식(원작 동일)
      fr.appendChild(val); row.appendChild(fr);
      // ↻ 재설정
      // ⚠비전미확인 — 촬영대기: 사선(비활성) 아이콘의 조건이 무엇인지 아직 모른다.
      //   "주사위 부족"이라는 우리 가설은 원작 스샷이 직접 반증한다 —
      //   보유 7개(화면4)에서 희귀(10 필요)·영웅(20 필요) 행이 둘 다 정상 ↻로 렌더되고,
      //   레전더리 행만 5장 전부에서 사선이다. 즉 부족과 무관한 별도 잠금 조건이 있다.
      //   확정 전까지 N/R/E는 항상 활성으로 두고(부족은 클릭 시 토스트로만 안내),
      //   L만 원작 관측 그대로 사선을 유지한다. 필요 컷: 주사위 50개 이상 보유 상태의 이 화면.
      const go=el('div','rr-go'+(r.g==='L'?' off':''),'↻');
      go.onclick=()=>{
        if(S.dice<r.cost){ toast(`주사위가 부족합니다. (${r.cost}개 필요)`); return; }   // ← 차감 전 재검증
        S.dice-=r.cost; S.rerollSpent=(S.rerollSpent||0)+r.cost;
        S.rerollOpt[i]={ s:pick(REROLL_STATS), g:REROLL_RESULT_GRADE };
        sfx('craft'); openModal('optionReroll', heroId); refreshHUD();
      };
      row.appendChild(go); list.appendChild(row);
    });
    b.appendChild(list);
    const bk=el('button','btn sm','◀ 장비'); bk.style.marginTop='8px'; bk.onclick=back; b.appendChild(bk);
  }},

  /* ---------- 소환 ---------- */
  /* ★ B4/G-56: 소환재 카운터 10항목 2줄(소환권 6종 + 루비·조각·회색코인·주사위)
     ★ B4/G-57: 세로 리스트 → grid c2 석판 타일(제목+부제+아트+비용+[소환])
     ★ B4/G-58: [소환] 즉시 실행 금지 — 수량 확인 오버레이 경유 */
  summon:{ title:'소환', render(b){
    const shardTot=shardTotal();
    const res=el('div','summon-res wrap2');
    [['🎟️','영웅권',S.tickHero],['📜','영웅권+',S.tickHeroP||0],
     ['📦','재료권',S.tickMat],['🧰','재료권+',S.tickMatP||0],
     ['👹','몬스터권',S.tickMon||0],['🩸','몬스터권+',S.tickMonP||0],
     ['💎','루비',S.ruby],['🔥','조각',shardTot],['🪙','회색',S.gray],['🎲','주사위',S.dice]]
      .forEach(([ic,nm,v])=>{ const r=el('div','sres'); r.innerHTML=`<span class="si">${eImg(ic,1.5)}</span><span>${nm}</span><b>${fmt(v)}</b>`; res.appendChild(r); });
    b.appendChild(res);
    const grid=el('div','grid c2 summon-grid'); grid.style.marginTop='8px';
    // 석판 타일 — 확인 오버레이(G-58) 경유 후에만 실제 소환
    const mkTile=(ic,title,sub,costTxt,qty,can,run,gr)=>{
      const t=el('div','sum-tile gframe grade-'+gr); t.style.setProperty('--gc',GRADES[gr].color);
      t.innerHTML=`<div class="st-t" style="color:${GRADES[gr].color}">${title}</div>
        <div class="st-s">${sub}</div><div class="st-art">${eImg(ic,2)}</div><div class="st-c">${costTxt}</div>`;
      const btn=el('button','btn xs'+(can?' gold':''),'소환');
      btn.onclick=()=>{
        if(!can){ toast('재화가 부족합니다.'); return; }
        b2Overlay('소환 확인',(bd,close)=>{
          bd.appendChild(el('div','b2-big',ic));
          bd.appendChild(el('div','b2-name',title));
          bd.appendChild(el('div','center',`<div class="sum-qty">X ${fmt(qty)}</div>`));
          bd.appendChild(el('div','b2-flavor',`소모: ${costTxt}`));
          const row=el('div','btnrow');
          const no=el('button','btn','아니요'); no.onclick=close;
          const yes=el('button','btn gold','소환'); yes.onclick=()=>{ close();
            const r=run(); if(!r){ toast('재화가 부족합니다.'); openModal('summon'); return; }
            refreshHUD(); playSummon(r); };
          row.append(no,yes); bd.appendChild(row);
        });
      };
      t.appendChild(btn); grid.appendChild(t);
    };
    // 영웅 3티어
    mkTile('📜','영웅 소환','일반 · 조각 X20','소환권 1', 20, S.tickHero>=1, ()=>{ if(S.tickHero<1)return null; S.tickHero--; return summonRun(20); },'R');
    mkTile('📜','영웅 소환','고급 · 조각 X50', (S.tickHeroP>0?'고급 소환권 1':'루비 300'), 50, (S.tickHeroP>0||S.ruby>=300),
      ()=>{ if(S.tickHeroP>0){ S.tickHeroP--; } else if(S.ruby>=300){ S.ruby-=300; } else return null; return summonRun(50); },'E');
    mkTile('📜','영웅 소환','최상급 · 조각 X100','루비 800', 100, S.ruby>=800, ()=>{ if(S.ruby<800)return null; S.ruby-=800; return summonRun(100); },'L');
    // 재료 2티어
    mkTile('📦','재료 소환','일반 · 재료 X20','재료권 1', 20, S.tickMat>=1, ()=>{ if(S.tickMat<1)return null; S.tickMat--; return matSummon(20); },'N');
    mkTile('📦','재료 소환','고급 · 재료 X80', (S.tickMatP>0?'고급 재료권 1':'재료권 3'), 80, (S.tickMatP>0||S.tickMat>=3),
      ()=>{ if(S.tickMatP>0){ S.tickMatP--; } else if(S.tickMat>=3){ S.tickMat-=3; } else return null; return matSummon(80); },'R');
    // 직업 지정 5종
    JOBS.forEach(j=>{ mkTile(jobIcon(j.id), `${j.name} 지정`, '조각 X100', '루비 200', 100, S.ruby>=200,
      ()=>{ if(S.ruby<200)return null; S.ruby-=200; return summonRun(100, j.id); },'E'); });
    b.appendChild(grid);
    b.appendChild(el('div','hint',`<div class="hr"></div>결과는 <b>영웅 조각</b>으로 지급 → [영웅]에서 조각으로 합성 해금. 소프트 피티 40회 · 하드 피티 70회.`));
  }},

  /* ---------- 투기장 (★ B6: G-81~G-92) ----------
     원작 구조: 화면 하나 안에서 4탭(랭킹 / 순위 주사위 / 순위 골드버프 / 티어 골드)만 갈아끼운다.
     ★ G-83: 별도 'arenaReward' 모달과 즉시지급형 [매일 보상] 버튼을 폐지했다.
       탭을 어떤 것으로 바꿔도 우측 정보패널과 하단 [입장]·[자동입장]은 화면에 그대로 남는다
       (기존에는 보상표로 넘어가는 순간 정보패널·편성·입장 버튼이 통째로 사라졌다). */
  arena:{ title:'투기장', render(b){
    /* ★ N2: 원작 탭 라벨은 짧은 2~4자('보상'/'버프'/'매일 보상')다. 키(dice/gbuff/tier)는 그대로 두고
       라벨만 원문에 맞춘다 — 매핑은 보상=주사위표, 버프=골드버프표, 매일 보상=티어 골드표. */
    const TB=[['rank','랭킹'],['dice','보상'],['gbuff','버프'],['tier','매일 보상']];
    rollDaily();       // ★ N2: 매일 입장권 5개 자동충전(날짜 롤오버 시 1회)
    arenaWeekRoll();   // ★ N2: 매주 월요일 12시 랭킹 초기화 판정(화면 진입 시점에 1회)
    let tab = MODALS.arena._tab || 'rank';
    if(!TB.some(t=>t[0]===tab)) tab='rank';
    MODALS.arena._tab = tab;
    let infoOn = false;   // ⓘ 안내 박스(원작은 좌측 패널 안에서 리스트와 교체되는 인패널 박스)
    MODALS.arena._peek = null;   // 돋보기 활성화는 화면을 다시 열면 풀린다

    const tabs=el('div','tabrow');
    TB.forEach(([k,l])=>{ const t=el('div','tab'+(k===tab?' on':''),l);
      t.onclick=()=>{ if(k===tab) return; tab=k; MODALS.arena._tab=k; infoOn=false;   // 탭을 옮기면 ⓘ 안내는 닫는다
        [...tabs.children].forEach((c,i)=>c.classList.toggle('on', TB[i][0]===tab));
        paintBox(); };                       // ★ G-83: rankBox 만 다시 그린다
      tabs.appendChild(t); });
    b.appendChild(tabs);

    const wrap=el('div'); wrap.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px';
    const rankBox=el('div'); const info=el('div');
    wrap.append(rankBox, info); b.appendChild(wrap);

    /* ---- 좌측: 탭 본문 (랭킹 / 보상표 3종) ---- */
    function rewardRows(){
      if(tab==='dice')  return ARENA_DICE_ROWS.map(([r,v])=>[r, `${eImg("🎲",2)} ${v}`, false]);            // ★ G-84 (9행)
      if(tab==='gbuff') return ARENA_GBUFF_ROWS.map(([r,v])=>[r, `골드 +${v}%`, false]);        // ★ G-85 (13행)
      return ARENA_TIER_ROWS.map(([n,g])=>[n, `${eImg("🪙",2)} ${fmtFull(g)}골드`, n===TIERS[S.arenaTier]]); // ★ G-86 (7행)
    }
    /* ★ N2: 표 제목 — 원작은 버프/매일 보상 표 상단에만 `-제목-` 한 줄이 붙는다(보상 표에는 없음). */
    function rewardTitle(){
      if(tab==='gbuff') return '-골드 버프 증가량-';
      if(tab==='tier')  return '-매일 티어 골드 보상-';
      return '';
    }
    function paintBox(){
      rankBox.innerHTML='';
      /* ★ N2: 헤더('랭킹' 라벨 + ⓘ)는 원작에서 탭과 무관하게 항상 좌측 패널 상단에 남는다. */
      const head=el('div','ar-rankhead');
      head.appendChild(el('span','small mut','랭킹'));
      const ib=el('div','ar-info'+(infoOn?' on':''),'ⓘ');                                     // ★ G-90
      ib.onclick=()=>{ infoOn=!infoOn; sfx('tap'); paintBox(); };
      head.appendChild(ib); rankBox.appendChild(head);
      if(infoOn){
        /* ★ N2: 원작 ⓘ 안내 박스는 다이얼로그가 아니라 리스트 자리를 덮는 인패널 박스이며,
           내용은 아래 3줄이 전부다(원문 그대로 · 순서 고정). 종전의 '매칭 ±1단차' 문구는 근거가 없어 폐기. */
        const box=el('div','ar-infobox');
        ['*랭킹은 매주 월요일 12시에 초기화 됩니다.',
         '*투기장에선 모든 데미지가 50% 감소 됩니다.',
         '*매일 입장권 5개가 자동충전 됩니다.'].forEach(t=>box.appendChild(el('div','ar-infoline',t)));
        rankBox.appendChild(box);
        return;
      }
      if(tab==='rank'){
        arenaRankRows().forEach(r=>{
          const row=el('div','lrow'+(r.me?' me':'')+(arenaPeekIs(r)?' peek':''));
          const cls = r.rk<=3 ? ' rank-'+r.rk : '';                                            // ★ G-88
          /* ★ N2/G-93: 돋보기(유저 정보) — 1차 탭이면 순위 숫자 칸이 🔍 로 바뀌고(활성), 그 상태에서
             한 번 더 누르면 '유저 정보' 팝업이 열린다. 다른 행을 누르면 이전 행의 활성은 풀린다. */
          const on = arenaPeekIs(r);
          row.innerHTML=`<div class="rk${cls}">${on?'🔍':(r.rk>99?'★':r.rk)}</div><div class="nm2">${r.nm}</div><div class="sc">${fmt(r.sc)}</div>`;
          row.onclick=()=>{
            if(on){ arenaUserInfo(r); return; }
            MODALS.arena._peek = r.uid; sfx('tap'); paintBox();
          };
          rankBox.appendChild(row);
        });
        rankBox.appendChild(el('div','center small mut',`내 순위 ${fmtFull(S.arenaRank)}위`));
      } else {
        const ttl=rewardTitle();
        if(ttl) rankBox.appendChild(el('div','ar-rwtitle',ttl));
        rewardRows().forEach(([r,v,me],i)=>{
          const row=el('div','lrow'+(me?' me':''));
          const cls = i<3 ? ' rank-'+(i+1) : '';                                               // ★ G-88 (상위 3행 색배지)
          row.innerHTML=`<div class="nm2${cls}">${r}</div><div class="sc">${v}</div>`;
          rankBox.appendChild(row);
        });
        /* ★ N2: 종전 각주('시즌 종료 시 1회 지급')는 원작 표제 '매일 티어 골드 보상'과 정면으로 어긋나
           폐기하고, ⓘ 3줄에서 확인된 사실만 남긴다. */
        rankBox.appendChild(el('div','center small mut',
          tab==='tier' ? '티어 골드는 매일 티어에 따라 지급됩니다.' : '랭킹은 매주 월요일 12시에 초기화됩니다.'));
      }
    }

    /* ---- 우측: 정보패널 (★ G-89 순위 → 티어 → 점수 → 입장권 → 연승) · 탭과 무관하게 항상 유지 ---- */
    function paintInfo(){
      info.innerHTML='';
      const top=el('div','ar-myrank');
      top.innerHTML=`<div class="small mut">내 순위</div><div class="big">${fmtFull(S.arenaRank)}</div>`;
      info.appendChild(top);
      const badge=el('div','center'); badge.style.margin='5px 0';
      // ★ A3-3: TIERS 7단 확장 → 뱃지 색 매핑도 7항 (레전더리 포함)
      badge.innerHTML=`<span class="tierbadge grade-${['N','R','E','L','L','L','L'][S.arenaTier]||'N'}">${TIERS[S.arenaTier]||TIERS[0]}</span>`;
      info.appendChild(badge);
      const kv=el('div','ar-kv');
      kv.innerHTML=`<div><span>점수</span><b>${fmtFull(S.arenaPts)}</b></div>
        <div><span>입장권</span><b>${S.ticket}</b></div>
        <div><span>연승</span><b>${S.arenaStreak}</b></div>
        <div><span>순위 골드버프</span><b>+${arenaGoldBuffPct()}%</b></div>`;
      info.appendChild(kv);
      // ★ G-81: 실제 출전하는 4인(PVP 진영)을 읽기 전용 요약으로 보여준다. 편성은 formation 모달에서만.
      info.appendChild(el('div','center small mut','PVP 편성 (4인)'));
      const labels=['전방','측면','후방','예비'];
      const openForm=()=>{ if(MODALS.formation) MODALS.formation._tab='pvp'; openModal('formation'); };
      const form=el('div','formation'); const p=arenaParty();
      for(let i=0;i<4;i++){ const he=p[i]||null;
        const s=el('div','fslot');
        s.innerHTML = he ? `<div class="ei">${jobIcon(he.job.id)}</div><div class="fn">${he.name}</div><div class="fpos">${labels[i]}</div>`
                         : `<div class="ei" style="opacity:.3">＋</div><div class="fpos">${labels[i]}</div>`;
        s.onclick=openForm; form.appendChild(s); }
      info.appendChild(form);
      const fb=el('button','btn sm wide','진영 편성'); fb.onclick=openForm; info.appendChild(fb);
      info.appendChild(el('div','center warn','- 입장 제한 시간 -<br>10:00 ~ 12:00'));
    }
    paintBox(); paintInfo();

    /* ---- 하단: [입장] / [자동입장] — 탭과 무관하게 항상 유지 ---- */
    const row=el('div','btnrow'); row.style.marginTop='10px';
    const enter=el('button','btn gold wide','입장 (입장권 1)');
    enter.onclick=()=>{
      if(busyFight()) return;
      if(S.ticket<1){ toast('입장권이 부족합니다.'); return; }
      /* ★ G-82: 입장 확인 오버레이 — 재화·전투중 체크를 통과한 뒤 차감 직전에만 부른다(B5 styledConfirm 재사용) */
      styledConfirm('투기장에 입장 하시겠습니까?', ()=>{
        if(S.ticket<1){ toast('입장권이 부족합니다.'); return; }
        S.ticket--; refreshHUD(); arenaFight();
      }, { title:'투기장 입장', sub:`${eImg("📜",2)} 보유 수량: ${S.ticket}`, warn:'*입장권 1개가 차감됩니다*', yes:'입장' });
    };
    row.appendChild(enter); b.appendChild(row);
    const autoRow=el('div','btnrow'); autoRow.style.marginTop='6px';
    const autoBtn=el('button','btn sm'+(S.arenaAuto?' gold':'')+' wide',`⟳ 자동입장 ${S.arenaAuto?'ON':'OFF'}`);
    autoBtn.onclick=()=>{ if(busyFight())return; S.arenaAuto=!S.arenaAuto;
      // 자동입장 연전은 확인 오버레이를 건너뛴다(G-82 예외)
      if(S.arenaAuto && S.ticket>0){ S.ticket--; refreshHUD(); arenaFight(); }
      else openModal('arena'); };
    autoRow.appendChild(autoBtn); b.appendChild(autoRow);
    // ★ N2: 원작 ⓘ 확인 사실(데미지 50% 감소 · 매일 입장권 5개 자동충전)을 하단 힌트에도 반영
    b.appendChild(el('div','hint','매칭은 ±1단차 이내(2단차 이상 배제). 투기장 전투는 양쪽 모든 데미지가 50% 감소한다. 매일 입장권 5개 자동충전 · 자동입장 ON 시 결과 후 자동으로 다음 매칭.'));
  }},

  /* ---------- 상점 (★ B7: G-93~G-101, G-103) ----------
     원작 구조: 하단 고정 9카테고리 · 4열 아이콘 탭(4+4+1 3행)
     탭별 항목 수 — 골드7 / 추천6(로테2+골드4) / 버프6 / 기타27(스타터6+루비21)
                    / 재료18(9종×2단가) / 루비8(4단계+프로모4) / 길드11 / 코스튬5 / 영웅5(§5-1 미결) */
  shop:{ title:'상점', render(b){
    let tab='ad';
    const TABS=[['ad','추천','📢'],['buff','버프','💊'],['hero','영웅','🎭'],['pkg','기타','🎁'],
                ['gold','골드','🪙'],['gray','재료','🧪'],['ruby','루비','💎'],['guild','길드','🛡️'],['costume','코스튬','👘']];
    // G-103: 텍스트 pill → 4열 그리드 + 아이콘 상단/라벨 하단 2단 정사각
    const tabs=el('div','tabrow icons');
    TABS.forEach(([k,l,ic])=>{ const t=el('div','tab icontab'+(k===tab?' on':''),`<div class="ti">${eImg(ic,1.8)}</div><div class="tl">${l}</div>`);
      t.onclick=()=>{ tab=k; render(); [...tabs.children].forEach((c,i)=>c.classList.toggle('on',TABS[i][0]===k)); }; tabs.appendChild(t); });
    b.appendChild(tabs);
    const body=el('div'); b.appendChild(body);

    /* --- 결제 공용 헬퍼 (차감 전 보유량 재확인 = 재화 안전장치) --- */
    const CURN={ gold:'골드', ruby:'루비', guild:'길드 코인', gray:'회색코인' };
    const have=cur=> cur==='gold'? S.gold : cur==='ruby'? S.ruby : cur==='gray'? (S.gray||0) : (S.guildCoin||0);
    const payCur=(cur,n)=>{ if(cur==='gold') S.gold-=n; else if(cur==='ruby') S.ruby-=n;
      else if(cur==='gray') S.gray=Math.max(0,(S.gray||0)-n); else S.guildCoin=(S.guildCoin||0)-n; };
    const priceTxt=(cur,n)=> `${CURN[cur]} ${cur==='gold'?fmt(n):n.toLocaleString('ko-KR')}`;
    /* ★ v5.0: 자체 렌더러 탭(광고·버프·루비·코스튬·스타터)도 같은 카드 골격을 쓰도록 하는 공용 빌더.
       mkBuy 와 달리 결제 로직이 제각각이라 카드 껍데기만 만들어 주고 버튼은 호출부가 붙인다. */
    function shopCard(ic, title, desc, ribbon){
      const card=el('div','shop-card');
      card.innerHTML=`<div class="sh-ribbon">${ribbon||title}</div>
        <div class="sh-body">
          <div class="sh-left"><div class="sh-ic">${eImg(ic,2)}</div></div>
          <div class="sh-right"><div class="sh-t">${title}</div><div class="sh-d">${desc||''}</div></div>
        </div>`;
      card.mount = btn => { card.querySelector('.sh-left').appendChild(btn); body.appendChild(card); return card; };
      return card;
    }
    /* ★ v5.0: 원작 상점의 지배적 위젯은 '리본 헤더 + 좌(아이콘 위·구매버튼 아래) / 우(품명·수량·가격)'
       2단 프레임 카드다. 우리는 그 카드를 영웅 탭(.shard-card)에만 쓰고 나머지 탭을 전부
       한 줄짜리 .pack 리스트로 뭉개놔서, 상점을 열었을 때의 첫인상이 '매대'가 아니라 '목록'이었다.
       mkBuy 한 곳만 바꾸면 이 함수를 쓰는 탭(추천·기타·골드·재료·길드)이 한 번에 카드형이 된다.
       원작이 리본과 우측에 품명을 중복 표기하는 것도 그대로 따른다(영웅 카드 실측 구조와 동일). */
    function mkBuy(ic,t,d,cur,cost,give,label){
      const card=el('div','shop-card');
      card.innerHTML=`<div class="sh-ribbon">${t}</div>
        <div class="sh-body">
          <div class="sh-left"><div class="sh-ic">${eImg(ic,2)}</div></div>
          <div class="sh-right"><div class="sh-t">${t}</div><div class="sh-d">${d}</div></div>
        </div>`;
      const ok=have(cur)>=cost;
      const btn=el('button','btn sm'+(ok?' gold':''), label||'구매'); if(!ok) btn.disabled=true;
      btn.onclick=()=>{ if(have(cur)<cost){ toast(`${CURN[cur]}가 부족합니다.`); return; }
        payCur(cur,cost); give(); sfx('tap'); toast(`${t} 획득`); render(); refreshHUD(); };
      card.querySelector('.sh-left').appendChild(btn);
      body.appendChild(card); return card;
    }
    const curLine=cur=>{ const v=have(cur); body.appendChild(el('div','center small',
      `보유 ${CURN[cur]} <b style="color:${cur==='gold'?'var(--gold)':cur==='ruby'?'#e05aa0':'#c9cdd4'}">${cur==='gold'?fmt(v):v.toLocaleString('ko-KR')}</b>`)); };
    const grpLabel=t=>{ const d=el('div','small mut',t); d.style.cssText='margin:10px 0 4px;letter-spacing:.04em'; body.appendChild(d); };

    function render(){ body.innerHTML=''; const now=Date.now();
      /* ── ① 추천 (G-96): 광고 카드 2슬롯 로테이션 + 골드 즉시구매 4행 = 6항목 ── */
      if(tab==='ad'){
        if(S.buffs.adFree) body.appendChild(el('div','center hint','광고 제거 상품 보유 중 — 광고 없이 즉시 수령.'));
        const left=dailyLeft('ad',15);
        body.appendChild(el('div','center small',`광고 제단 — 무료 수급 · 오늘 ${left}/15`));
        const di=new Date().getDate(); // 일자 기준 2슬롯 로테이션 (풀 6종)
        [ADPOOL[(di*2)%ADPOOL.length], ADPOOL[(di*2+1)%ADPOOL.length]].forEach(it=>{
          const card=shopCard(it.ic, it.t, S.buffs.adFree?'즉시 수령(광고 제거)':'광고 시청 후 무료');
          const btn=el('button','btn sm'+(left>0?' gold':''),S.buffs.adFree?'받기':'광고 보고 받기'); if(left<=0) btn.disabled=true;
          btn.onclick=()=>{ if(dailyLeft('ad',15)<=0){ toast('오늘 소진'); return; } dailyUse('ad'); it.give(); toast(`${it.t} 획득`); render(); refreshHUD(); };
          card.mount(btn); });
        grpLabel('골드 즉시 구매');
        curLine('gold');
        GOLDSHOP.slice(0,4).forEach(it=> mkBuy(it.ic,it.t,priceTxt(it.cur,it.cost),it.cur,it.cost,it.give));

      /* ── ② 버프 (G-100): 6항목 ── */
      } else if(tab==='buff'){
        body.appendChild(el('div','hint','구독형 버프 · 영구재 (루비, 데모)'));
        curLine('ruby');
        BUFFSHOP.forEach(it=>{
          let badge='', owned=false;
          if(it.kind==='sub'){ const u=S.buffs[it.key]||0; if(u>now) badge=`남은 ${Math.ceil((u-now)/86400000)}일`; }
          else if(it.kind==='perm'){ owned=!!S.buffs[it.key]; if(owned) badge='보유'; }
          else { owned=(S[it.key]||0)>=500; badge = owned?'보유':`현재 ${S[it.key]||1}LV`; }
          const card=shopCard(it.ic, `${it.t} ${badge?`<span class="small" style="color:var(--ok)">${badge}</span>`:''}`, priceTxt('ruby',it.cost), it.t);
          const ok=(S.ruby>=it.cost)&&!owned;
          const btn=el('button','btn sm'+(ok?' gold':''), owned?'보유':'구매'); if(!ok) btn.disabled=true;
          btn.onclick=()=>{ if(owned) return; if(S.ruby<it.cost){ toast('루비가 부족합니다.'); return; }
            S.ruby-=it.cost;
            if(it.kind==='sub') S.buffs[it.key]=Math.max(now,S.buffs[it.key]||0)+30*86400000;
            else if(it.kind==='perm') S.buffs[it.key]=true;
            else S[it.key]=500;
            sfx('tap'); toast(`${it.t} 적용`); render(); refreshHUD(); };
          card.mount(btn); });

      /* ── ③ 영웅 (G-102 결정): 개별 영웅 조각 확정 구매 ──
         SHOP_HEROES 14종 × 2단가(X50 그린 300 / X600 레드 3,400) = 28카드, 2열 그리드.
         카드 구성(원작 재판독 cardLayout 그대로): ① 컬러 리본 헤더 '[영웅명] 조각 X n'
         ② 좌측 정사각 초상 아이콘(보유 전용 조각 배지) ③ 우측 '[영웅명] 조각 X n' 재기재
         ④ 가격 행(💎 + 숫자) ⑤ 카드 폭 전체 [구매] 버튼 1개(즉시결제, 수량선택 UI 없음).
         나열 순서 = hero_id 채번 오름차순(고정 ID 순서), 같은 영웅의 X50/X600 이 좌우로 나란히. */
      } else if(tab==='hero'){
        body.appendChild(el('div','hint','영웅 조각 확정 구매 — 원하는 영웅을 콕 집어 육성 (루비, 데모)'));
        curLine('ruby');
        const grid=el('div','shard-grid');
        SHOP_HEROES.forEach(r=>{
          const job=JOBS.find(j=>j.id===r.class_id)||JOBS[0];
          SHARD_TIERS.forEach(t=>{
            const label=`${r.name} 조각 X ${t.qty}`;
            const card=el('div','shard-card '+t.cls);
            card.innerHTML=`<div class="sc-ribbon">${label}</div>
              <div class="sc-body">
                <div class="sc-por" style="--gc:${GRADES[r.grade].color}">${jobIcon(job.id)}<span class="sc-own">${fmt(heroShardOwn(r.hero_id))}</span></div>
                <div class="sc-info"><div class="sc-t">${label}</div>
                  <div class="sc-price"><span class="ic">💎</span>${t.cost.toLocaleString('ko-KR')}</div></div>
              </div>`;
            const ok=S.ruby>=t.cost;
            const btn=el('button','btn sm sc-buy'+(ok?' gold':''),'구매'); if(!ok) btn.disabled=true;
            btn.onclick=()=>{
              if(S.ruby<t.cost){ toast('루비가 부족합니다.'); return; }   // 차감 전 재확인 (재화 안전장치)
              S.ruby-=t.cost;
              heroShardAdd(r.hero_id, t.qty);
              /* ★ B4/G-50 연계 — 기존 해금 동선 유지:
                 대량(X600) 구매이거나 이 영웅 기준 가용 조각이 N 합성치를 넘으면
                 해당 직업의 N등급 기본 영웅(HERO_001~005)을 즉시 해금한다(구버전과 동등, 조각 소모 없음).
                 상위 등급(R~L)은 종전대로 [합성]으로만 해금한다. */
              const base=rosterOf(r.class_id)[0];
              if(base && !heroOwned(base.hero_id) && (t.qty>=600 || heroShardAvail(r.hero_id)>=HERO_SHARD_NEED.N)){
                const st=heroSlot(base.hero_id); st.own=true; st.level=st.level||1; }
              sfx('tap'); toast(`${label} 획득`); Battle.refreshParty(); render(); refreshHUD(); };
            card.appendChild(btn); grid.appendChild(card);
          });
        });
        body.appendChild(grid);
        body.appendChild(el('div','small mut center','전용 조각은 해당 영웅의 합성·강화에 우선 사용됩니다. (직업 공용 조각과 합산 가용)'));

      /* ── ④ 기타 (G-98 스타터 6 + G-97 루비 21 = 27항목) ── */
      } else if(tab==='pkg'){
        body.appendChild(el('div','hint','스타터 패키지 · 루비 상품 (데모)'));
        curLine('ruby');
        let sg='';
        STARTERPKG.forEach(it=>{ if(it.grp!==sg){ sg=it.grp; grpLabel(`[${sg}] 스타터 패키지`); }
          const bought=!!S.claimed.mail[it.id];
          const card=shopCard(it.ic, `${it.t} ${bought?'<span class="small" style="color:var(--ok)">구매완료</span>':''}`, `${it.d} · ${priceTxt('ruby',it.cost)} · 계정당 1회`, it.t);
          const ok=!bought&&S.ruby>=it.cost;
          const btn=el('button','btn sm'+(ok?' gold':''), bought?'완료':'구매'); if(!ok) btn.disabled=true;
          btn.onclick=()=>{ if(S.claimed.mail[it.id]) return; if(S.ruby<it.cost){ toast('루비가 부족합니다.'); return; }
            S.ruby-=it.cost; it.give(); S.claimed.mail[it.id]=true; sfx('craft'); toast(`${it.t} 구매`); render(); refreshHUD(); };
          card.mount(btn); });
        let rg='';
        RUBYPKG.forEach(it=>{ if(it.grp!==rg){ rg=it.grp; grpLabel(`${rg} 패키지`); }
          mkBuy(it.ic,it.t,`${it.d} · ${priceTxt('ruby',it.cost)}`,'ruby',it.cost,it.give); });

      /* ── ⑤ 골드상점 (G-93): 골드 5 + 루비 환전 2 = 7항목 ── */
      } else if(tab==='gold'){
        body.appendChild(el('div','hint','골드로 소모품 구매 · 루비로 골드 환전'));
        curLine('gold');
        GOLDSHOP.forEach(it=> mkBuy(it.ic,it.t,priceTxt(it.cur,it.cost),it.cur,it.cost,it.give,it.cur==='ruby'?'환전':'구매'));
        const nt=el('div','small mut',GOLD_CAP_NOTICE); nt.style.cssText='margin-top:10px;text-align:center;line-height:1.6'; body.appendChild(nt);

      /* ── ⑥ 재료상점 (G-94/§4-5): 9종 × (1개/5개) = 18항목, 루비 결제 ── */
      } else if(tab==='gray'){
        body.appendChild(el('div','hint','제작 재료 직접 구매 (루비)'));
        curLine('ruby');
        MATSHOP.forEach(m=>{ const ic=matIcon(m.k);
          mkBuy(ic,`${m.k} X1`,`${priceTxt('ruby',m.p1)} · 보유 ${fmt(S.mats[m.k]||0)}`,'ruby',m.p1,()=>matGain(m.k,1));
          mkBuy(ic,`${m.k} X5`,`${priceTxt('ruby',m.p5)} · 보유 ${fmt(S.mats[m.k]||0)}`,'ruby',m.p5,()=>matGain(m.k,5)); });

      /* ── ⑦ 루비 (G-99): 4단계 + 프로모 4행 ── */
      } else if(tab==='ruby'){
        body.appendChild(el('div','hint','현금 결제 — 데모(실결제 없음).'));
        // ★ F2: 루비 상자(충전 상품) 구매는 칭호 '귀빈'의 획득 트리거다(원작의 과금 트리거 위치 그대로).
        const buyRuby=n=>{ S.ruby+=n; S.stats.rubyBox=(S.stats.rubyBox||0)+1; sfx('tap'); toast(`루비 +${n} (데모)`); render(); refreshHUD(); };
        RUBYPACKS.forEach(p=>{ const t=`루비 ${p.ruby.toLocaleString('ko-KR')}개`;
          const card=shopCard('💎', t, p.won);
          const btn=el('button','btn sm gold','구매'); btn.onclick=()=>buyRuby(p.ruby); card.mount(btn); });
        grpLabel('매월 루비 2배');
        RUBYPROMO.forEach(p=>{ const t=`루비 ${p.ruby.toLocaleString('ko-KR')}개`;
          const card=shopCard('💎', t, `매월 루비 2배 프로모 · ${p.won}`); card.classList.add('promo');
          const btn=el('button','btn sm gold','구매'); btn.onclick=()=>buyRuby(p.ruby); card.mount(btn); });
        const nt=el('div','small mut',RUBY_NOTICE); nt.style.cssText='margin-top:10px;text-align:center;line-height:1.6'; body.appendChild(nt);

      /* ── ⑧ 길드상점 (G-95): 11항목 (길드 코인) ── */
      } else if(tab==='guild'){
        body.appendChild(el('div','hint','길드 레이드·점령전 참여로 길드 코인을 획득합니다.'));
        curLine('guild');
        GUILDSHOP.forEach(it=> mkBuy(it.ic,it.t,priceTxt('guild',it.cost),'guild',it.cost,it.give,'교환'));
        /* ★ v5.6: 회색코인 소비처 복구. GRAYSHOP 은 상수만 정의돼 있고 어디서도 호출되지 않아
           획득처 4곳 / 소비처 0곳 인 고아 재화였다(재료상점이 §4-5 판정으로 루비 결제가 되면서 끊겼다).
           길드 레이드·약탈·기여로 버는 재화이므로 길드 탭 하단에 교환소로 되붙인다. */
        grpLabel('회색코인 교환');
        curLine('gray');
        GRAYSHOP.forEach(it=> mkBuy(it.ic,it.t,priceTxt('gray',it.cost),'gray',it.cost,it.give,'교환'));

      /* ── ⑨ 코스튬 (G-101): COSTUMES 판매 5종, 루비 3,400 균일 ── */
      } else if(tab==='costume'){
        body.appendChild(el('div','hint','코스튬은 치장 + 실효 버프. 구매 후 코스튬 메뉴에서 착용.'));
        curLine('ruby');
        COSTUMES.filter(c=>c.price).forEach(c=>{
          const owned=costumeHas(c.id);
          const hn=(c.hero&&HERO_BY_ID[c.hero])?HERO_BY_ID[c.hero].name:'';   // ★ B7/F1: 전용 영웅 표기
          const card=shopCard(c.icon, `${c.name}${owned?' <span class="small" style="color:var(--ok)">보유</span>':''}`, `${hn?`${hn} 전용 · `:''}${c.fx} · ${priceTxt('ruby',c.price)}`, c.name);
          const ok=!owned&&S.ruby>=c.price;
          const btn=el('button','btn sm'+(ok?' gold':''), owned?'보유':'구매'); if(!ok) btn.disabled=true;
          btn.onclick=()=>{ if(costumeHas(c.id)) return; if(S.ruby<c.price){ toast('루비가 부족합니다.'); return; }
            S.ruby-=c.price; S.costumeOwn=S.costumeOwn||{}; S.costumeOwn[c.id]=true; S.costumes=(S.costumes||0)+1;
            sfx('craft'); toast(`${c.name} 획득 — 코스튬 메뉴에서 착용`); render(); refreshHUD(); };
          card.mount(btn); });
      }
    }
    render();
  }},

  /* ---------- 인벤토리 ----------
     ★ B3/G-42: 재료 4행×6열 = 24칸 (MATS 등급순 그대로 순회)
     ★ B3/G-43: 재료 그리드 아래 탭바 2개 [무기][벨트] — 탭별 미장착 장비 필터
     ★ B3/G-44: 보유 상한 문구 교체 ('자동 매각' 규칙 삭제) */
  inventory:{ title:'인벤토리', render(b){
    b.appendChild(el('div','center small mut','제작 재료 24종 · 완성 장비 · 소환권 · 재화'));
    // 재료 24칸 (4행×6열)
    const mg=el('div','mat-grid24'); mg.style.marginTop='8px';
    MATS.forEach(m=>{ const c=el('div','cell gframe grade-'+m.g); c.style.setProperty('--gc',GRADES[m.g].color);
      c.innerHTML=`<div class="ei">${eImg(m.ic,1.5)}</div><div class="cn">${m.k}</div><div class="mq">${fmt(S.mats[m.k]||0)}</div>`;
      c.onclick=()=>toast(`${m.k} · 보유 ${fmt(S.mats[m.k]||0)} (등급풀 포함 가용 ${fmt(matAvail(m.k))})`);
      mg.appendChild(c); });
    b.appendChild(mg);
    /* 기타 재화.
       ★ v4.7.1: '재료풀 N/R/E/L' 4칸을 제거했다. 두 가지 이유가 겹친다 —
         ① v4.3 에서 등급 공용풀을 폐지해 S.mats['N'] 같은 등급 키가 더는 없다.
            그런데 이 렌더만 남아 화면에 "재료풀 undefined" 가 4칸 찍히고 있었다(내가 만든 회귀).
         ② 애초에 원작 인벤토리에는 이 4칸이 존재하지 않는다(04_장비_인벤토리 실측).
       제거가 버그 해소와 원작 일치를 동시에 만족한다. */
    const g=el('div','grid c4'); g.style.marginTop='8px';
    [['🪨','강화석',S.stones],['🔨','일반망치',S.hammerN||0],['🔨','전설망치',S.hammers||0],['🔮','하락방지',S.wards||0],
     ['🎟️','영웅권',S.tickHero],['📦','재료권',S.tickMat],['👘','코스튬',S.costumes],['🎲','주사위',S.dice],
     ['📜','제작서',S.craftScroll],['🏘️','마을재료',S.villMat],['🎫','입장권',S.ticket],['📖','고서',S.equips.filter(e=>e.slot.indexOf('고서')>=0).length]]
      .forEach(([ic,nm,v])=>{ const c=el('div','cell gframe'); c.innerHTML=`<div class="ei">${eImg(ic,2)}</div><div class="cn">${nm} ${fmt(v)}</div>`; g.appendChild(c); });
    b.appendChild(g);
    b.appendChild(el('div','hint',`<div class="hr"></div>재료: 일반·희귀 최대 2000개, 영웅·레전더리 최대 900개(초과분 미획득) · 무기: 종류당 최대 99개`));
    // 장비 탭 [무기][벨트]
    const TABS=[['무기','무기'],['벨트','벨트']];
    const isWeapon=n=>slotSchema(n).part==='무기';
    const tb=el('div','inv-tabs'); const list=el('div','grid c4'); list.style.marginTop='6px';
    function drawList(){
      list.innerHTML='';
      const arr=S.equips.filter(e=>!e.equipped).filter(e=> S.invTab==='무기' ? isWeapon(e.slot) : !isWeapon(e.slot));
      if(!arr.length){ list.appendChild(el('div','hint',`${S.invTab} 탭에 미장착 장비가 없습니다.`)); return; }
      arr.slice(0,16).forEach(e=>{ const c=el('div','cell gframe grade-'+e.grade); c.style.position='relative'; c.style.setProperty('--gc',GRADES[e.grade].color);
        c.innerHTML=`<div class="gtag">${GRADES[e.grade].name}</div><div class="ei">${equipImg(e.slot,2)}</div><div class="cn">${e.slot}</div>${e.enh?`<div class="lvl">+${e.enh}</div>`:''}`;
        c.onclick=()=>itemDetail(e, cur && cur.hero_id); list.appendChild(c); });
    }
    TABS.forEach(([k,label])=>{ const t=el('div','inv-tab'+(S.invTab===k?' on':''),label);
      t.onclick=()=>{ S.invTab=k; tb.querySelectorAll('.inv-tab').forEach(x=>x.classList.remove('on')); t.classList.add('on'); drawList(); }; tb.appendChild(t); });
    b.appendChild(tb); b.appendChild(list); drawList();
  }},

  /* ---------- 마을 ---------- */
  /* ★ v5.3: 원작 마을은 세로 리스트가 아니라 **좌우 2열 카드**다 —
     건물 일러스트 / 레벨 / 버프% / 전용 소모 재료 아이콘+수량 / 버튼.
     버튼 라벨도 좌우가 다르다(마을회관=기부, 훈련소=확장). 하단에 두 재료가 별도로 표시된다.
     종전 구현은 .pack 세로 3행에 두 건물 모두 '레벨업' 라벨, 소모 재료도 단일 공용이었다. */
  village:{ title:'마을', render(b){
    const B=[
      { nm:'마을회관', ic:'🏛️', fx:'골드 수급', key:'villHall',  matK:'곡식',     matS:'grain', btn:'기부' },
      { nm:'훈련소',   ic:'⛺', fx:'경험치',    key:'villTrain', matK:'나무 묶음', matS:'wood',  btn:'확장' },
    ];
    const g=el('div','vil-grid');
    B.forEach(d=>{
      const lv=S[d.key], cost=Math.round(100*Math.pow(lv,1.3));
      const have=(S[d.matS]||0) + (S.villMat||0);   // 전용 재료 + 공용 마을재료로 낸다
      const card=el('div','vil-card');
      card.innerHTML=`<div class="vc-ic">${eImg(d.ic,2)}</div>
        <div class="vc-nm">${d.nm}</div>
        <div class="vc-lv">Lv ${lv}<span class="mut"> / 500</span></div>
        <div class="vc-fx">${d.fx} +${((lv-1)*VILL_BUFF_PP).toFixed(2)}%p<br><span class="mut">다음 +${VILL_BUFF_PP}%p</span></div>
        <div class="vc-mat">${matIcon(d.matK)||'📦'} <b class="${have>=cost?'':'lack'}">${fmt(have)}</b><span class="mut"> / ${fmt(cost)}</span></div>`;
      const btn=el('button','btn sm'+(have>=cost&&lv<500?' gold':''), lv>=500?'MAX':d.btn);
      if(have<cost||lv>=500) btn.disabled=true;
      btn.onclick=()=>{
        if(have<cost){ toast(`${d.matK}이(가) 부족합니다.`); return; }
        let rest=cost; const own=S[d.matS]||0; const use=Math.min(own,rest);
        S[d.matS]=own-use; rest-=use; if(rest>0) S.villMat=Math.max(0,(S.villMat||0)-rest);
        S[d.key]++; sfx('craft'); toast(`${d.nm} Lv${S[d.key]}`); openModal('village'); refreshHUD();
      };
      card.appendChild(btn); g.appendChild(card);
    });
    b.appendChild(g);
    // 하단: 두 재료를 각각 표시(원작도 서로 다른 두 수치가 따로 나온다)
    const mats=el('div','vil-mats');
    mats.innerHTML=B.map(d=>`<div class="vm"><span>${matIcon(d.matK)||eImg("📦",2)} ${d.matK}</span><b>${fmt(S[d.matS]||0)}</b></div>`).join('')
      + `<div class="vm"><span>🏘️ 마을재료(공용)</span><b>${fmt(S.villMat||0)}</b></div>`;
    b.appendChild(mats);
    // 강화석 → 마을재료 환전 (10:1, 일 10개 상한)
    const left=dailyLeft('villConvert',10);
    const conv=el('div','pack'); conv.style.marginTop='9px';
    conv.innerHTML=`<div class="pic">🔁</div><div class="info"><div class="t">강화석 → 마을재료 환전</div><div class="d">강화석 10 → 마을재료 1 · 오늘 남은 ${left}/10 · 강화석 ${S.stones}</div></div>`;
    const cb=el('button','btn sm'+(S.stones>=10&&left>0?' gold':''),'환전'); if(S.stones<10||left<=0) cb.disabled=true;
    cb.onclick=()=>{ if(S.stones<10||dailyLeft('villConvert',10)<=0){toast('환전 불가');return;} S.stones-=10; S.villMat+=1; dailyUse('villConvert'); toast('마을재료 +1'); openModal('village'); refreshHUD(); };
    conv.appendChild(cb); b.appendChild(conv);
  }},

  /* ---------- 던전들 ---------- */
  /* ★ B5/G-63·G-64·G-65·G-66: 요일던전
       G-63 7칸 요일 타일에 보상 미리보기 수량(월40/화40/수30/목40/금15/토15/일4)
       G-64 요일당 열리는 모드는 1종뿐 — 반대 모드는 잠금(반투명 + 자물쇠), 단계선택도 열린 모드에만
       G-65 요일 타일 클릭 시 그 요일로 전환
       G-66 입장은 styledConfirm 경유 (재화·횟수 체크를 통과한 뒤 차감 직전) */
  dailydungeon:{ title:'요일던전', render(b){
    let today0=0; try{ today0=(new Date().getDay()+6)%7; }catch(e){}
    if(S.ddDay===null || S.ddDay===undefined) S.ddDay=today0;
    const ti=clamp(S.ddDay|0,0,6), openMode=DD_MODE[ti];
    b.appendChild(el('div','center small mut',`정령의 시련 — 요일별 원소 · 기본 1회 + 입장권 4회 (오늘 남은 ${dailyLeft('daily',5)}/5)`));
    const wr=el('div','summon-res dd-days');
    DD_DAYS.forEach((d,i)=>{ const c=el('div','sres dd-day'+(i===ti?' on':'')+(i===today0?' today':''));
      c.innerHTML=`<span class="si">${DD_EIC[i]}</span><span>${d}</span><span class="dd-rq">X${DD_RQ[i]}</span>`;
      c.onclick=()=>{ S.ddDay=i; sfx('tap'); openModal('dailydungeon'); };
      wr.appendChild(c); });
    b.appendChild(wr);
    b.appendChild(el('div','center',`<div class="ei" style="font-size:40px">🌀</div><div class="big">${DD_ELM[ti]} 원소 · 정령의 시련</div>
      <div class="small mut">${DD_DAYS[ti]}요일 · <b style="color:var(--frame-lit)">${openMode}</b> 모드만 열립니다 · 최대 보상 X${DD_RQ[ti]}</div>`));
    [['섬멸','⚔️','모든 몬스터 처치'],['생존','🛡️','밀려오는 몬스터를 버텨내라']].forEach(([mn,mic,md])=>{
      const locked=(mn!==openMode), mi=(mn==='생존')?1:0;
      b.appendChild(el('div','small mut',`— ${mn} ${locked?eImg("🔒",2):''} —`));
      if(locked){
        const days=DD_MODE.map((m,i)=>m===mn?DD_DAYS[i]:null).filter(Boolean).join('·');
        const lk=el('div','pack dd-lock'); lk.innerHTML=`<div class="pic">${eImg("🔒",2)}</div><div class="info"><div class="t">${mn} 모드 잠김</div><div class="d">${days}요일에만 열립니다</div></div>`;
        b.appendChild(lk); return;
      }
      [1,2,3].forEach(st=>{
        const qty=Math.max(1,Math.round(DD_RQ[ti]/3*st));
        const rg=['N','R','E'][st-1];
        const row=el('div','pack'); row.innerHTML=`<div class="pic">${mic}</div><div class="info"><div class="t">${mn} ${st}단계</div><div class="d">${md} · ${DD_ELM[ti]} 원소 재료(${GRADES[rg].name}) X${qty}</div></div>`;
        const btn=el('button','btn sm'+(S.ticket>=1?' gold':''),'입장');
        btn.onclick=()=>{ if(busyFight())return;
          if(dailyLeft('daily',5)<=0){toast('오늘 입장 소진');return;}
          if(S.ticket<1){toast('입장권 부족');return;}
          styledConfirm('입장 하시겠습니까?', ()=>{
            if(dailyLeft('daily',5)<=0){toast('오늘 입장 소진');return;}
            if(S.ticket<1){toast('입장권 부족');return;}
            S.ticket--; dailyUse('daily');                     // ← 차감은 [예] 이후에만
            const foe=[800,2200,5200][st-1];
            enterDungeonFight({ name:`정령의 시련 · ${mn} ${st}단계`, col:'#7fd0c0', foeCP:mi?Math.round(foe*0.85):foe,
              kind:'mobs', count:mi?14:(6+st*4), dur:mi?22:25,
              rewardText:`${DD_ELM[ti]} 원소 재료(${GRADES[rg].name}) X${qty}`,
              reward:()=>{ matGainGrade(rg, qty);   // ★ v4.5.1: 등급풀 폐지 후 실제 재료로 지급(구: S.mats[rg] → NaN)
                S.stats.ddStage=Math.max(S.stats.ddStage||0, st);   // ★ F2 칭호 '노련한 사냥꾼'(요일던전 2단계 클리어)
                sysLog(`정령의 시련 ${mn} ${st}단계 클리어 · ${GRADES[rg].name} 재료 +${qty}`); } });
          }, { title:`${mn} ${st}단계`, sub:`${DD_ELM[ti]} 원소 · 입장권 1개 차감` });
        };
        row.appendChild(btn); b.appendChild(row);
      });
    });
    b.appendChild(el('div','center small mut',`보유 입장권 ${S.ticket} / 상한 30`));
  }},

  /* ★ B5/G-67·G-68·G-66: 골드던전
       G-67 가로 스크롤 캐러셀(2~3장 노출) + 단계별 요구 재료 1/1/3/4/5개 소비 + 좌하단 '자동 입장' 원형 토글
       G-68 지급액 50만 / 150만 / 500만 / 1000만 / 1500만 (v4.1 A1-1 원작 실측 확정, GOLD_DUNGEON 주석 참조) */
  golddungeon:{ title:'골드던전', render(b){
    b.appendChild(el('div','hint',`황금 용광로 — 단계 1~5, 고정 골드 지급. 일일 3회 (오늘 남은 ${dailyLeft('gold',3)}/3)`));
    const car=el('div','gd-carousel');
    GOLD_DUNGEON.forEach(d=>{
      const have=matAvail(d.mat), ok=have>=d.need;
      const card=el('div','gd-card gframe');
      card.innerHTML=`<div class="gd-lv">${d.lv}단계</div><div class="gd-ic">${eImg("💰",2)}</div>
        <div class="gd-gold">${fmt(d.gold)}</div>
        <div class="gd-mat${ok?'':' lack'}">${matIcon(d.mat)} ${d.mat}<br>${have}/${d.need}</div>`;
      const btn=el('button','btn sm'+(ok?' gold':''),'입장');
      btn.onclick=()=>enterGoldDungeon(d,false);
      card.appendChild(btn); car.appendChild(card);
    });
    b.appendChild(car);
    const row=el('div','gd-autorow');
    const ab=el('button','gd-auto'+(S.goldAuto?' on':''),`⟳<span>자동<br>입장</span>`);
    ab.onclick=()=>{ S.goldAuto=!S.goldAuto; toast(`자동 입장 ${S.goldAuto?'ON':'OFF'}`); openModal('golddungeon'); };
    row.appendChild(ab);
    row.appendChild(el('div','small mut','자동 입장을 켜면 전투가 끝난 뒤 같은 단계로 다시 입장합니다 (재료·횟수가 남아 있을 때만).'));
    b.appendChild(row);
  }},

  /* ★ B5/G-69(§4-7): 보스 소환 7종 (R×2 / E×3 / L×2)
       카드마다 등급색 테두리 + 2행×3열(6칸) 요구 재료 그리드.
       일일 5회 게이팅(dailyLeft('boss',5))을 제거하고 재료를 실제로 차감한다. */
  boss:{ title:'보스 소환', render(b){
    b.appendChild(el('div','small mut','보스 카드 선택 → 요구 재료 소모 → 실전 자동전투. 일일 횟수 제한은 없습니다.'));
    BOSS_TYPES.forEach(bt=>{
      const G=GRADES[bt.g];
      const card=el('div','boss-card'); card.style.setProperty('--gc',G.color);
      card.innerHTML=`<div class="bc-head"><div class="bc-ic">${bt.img?`<img src="assets/monsters/${bt.img}.png" style="width:48px;height:48px;image-rendering:pixelated;object-fit:contain" alt="${bt.n}">`:eImg(bt.ic,2)}</div>
        <div class="bc-info"><div class="bc-n">${bt.n}</div><div class="bc-g">${G.name} · 처치 시 ${G.name} 재료 드랍</div></div></div>`;
      const grid=el('div','bc-mats'); let ok=true;
      for(let i=0;i<6;i++){
        const m=bt.mats[i];
        if(!m){ grid.appendChild(el('div','bc-mat empty','')); continue; }
        const have=matAvail(m[0]), lack=have<m[1]; if(lack) ok=false;
        const cell=el('div','bc-mat'+(lack?' lack':''),`<span class="bm-ic">${matIcon(m[0])}</span><span class="bm-n">${have}/${m[1]}</span>`);
        cell.title=m[0]; grid.appendChild(cell);
      }
      card.appendChild(grid);
      const need=bt.mats.filter(Boolean);
      const btn=el('button','btn sm wide'+(ok?' gold':''),'소환'); btn.style.marginTop='6px';
      btn.onclick=()=>{ if(busyFight())return;
        const short=need.find(m=>matAvail(m[0])<m[1]);
        if(short){ toast(`${short[0]} 부족 (${matAvail(short[0])}/${short[1]})`); return; }
        styledConfirm('소환 하시겠습니까?', ()=>{
          if(need.find(m=>matAvail(m[0])<m[1])){ toast('재료가 부족합니다'); return; }
          need.forEach(m=>matSpend(m[0],m[1]));                 // ← 차감은 [예] 이후에만
          S.stats.bossChallenges=(S.stats.bossChallenges||0)+1; // ★ B9/G-120 일일미션 '보스 3번 도전' 카운터
          enterDungeonFight({ name:bt.n, col:G.color, foeCP:bt.foe, kind:'boss', dur:30,
            rewardText:`${G.name} 재료 드랍`,
            reward:()=>{ if(bt.drop) bt.drop();
              // ★ F2 칭호 '중견 대장장이' — 원작의 '최상위 보스 던전 클리어'를 레전더리 보스 처치로 치환
              if(bt.g==='L') S.stats.bossTop=(S.stats.bossTop||0)+1;
              sysLog(`${bt.n} 처치 성공`); } });
        }, { title:bt.n, sub:need.map(m=>`${matIcon(m[0])}${m[0]} ${m[1]}`).join(' · '), yes:'소환' });
      };
      card.appendChild(btn); b.appendChild(card);
    });
  }},

  /* ★ B5/G-70·G-71·G-72·G-66: 월드보스
       G-70 랭킹 30행 스크롤 + 길드태그 컬럼 + 1~3위 색배지(.rk1 적 / .rk2 주황 / .rk3 청)
       G-71 좌상단 [i] 정보버튼 · 적색 입장 제한시간 라인 · 보스 초상 카드 + 값박스 2개 + '전투 보상 X2'
       G-72 (v4.1 A1-2) 보상은 순위·점수 무관 '전투 보상 X2' 고정. 랭킹은 누적 데미지 표시 전용,
            전투 결과는 정수 'N점'으로 별도 적립(S.wbScore)
       ★ N2 — 20260728 재수색 2장, 전 스크롤 구간: 원작 월드보스 화면에는 순위별 차등 보상표가 존재하지
            않는다는 것이 확정됐다(랭킹 행 = 순위·닉네임·점수 3열뿐, 보상 컬럼 없음 / 하단은 '전투 보상 X2'
            고정 1줄). 갭스펙 §5-5 '순위→보상 환산식 미확인'은 '원작에 없음 확정'으로 종결 → 코드 수정 없음. */
  worldboss:{ title:'월드보스', render(b){
    const left=dailyLeft('wb',1);
    const head=el('div','dg-head');
    const info=el('button','dg-i','i');
    info.onclick=()=>toast('서버 전체가 함께 도전합니다. 누적 데미지로 서버 순위를 겨루며, 참가 보상은 순위와 무관하게 전투 보상 X2로 지급됩니다.');
    head.append(info, el('div','dg-title','재의 용'));
    // ★ v4.8: 탑과 동일하게 랭킹 보상 서브화면 진입 버튼
    const wbrw=el('button','btn xs','랭킹 보상'); wbrw.onclick=()=>openModal('worldbossReward'); head.appendChild(wbrw);
    b.appendChild(head);
    b.appendChild(el('div','dg-limit','- 입장 제한 시간 -  10:00 ~ 12:00'));
    b.appendChild(el('div','small mut','서버 랭킹 (누적 데미지)'));
    b.appendChild(dgRankList(WB_RANK.concat([[S.name, S.guildName||'무소속', S._wbdmg||0]])));
    const foot=el('div','dg-foot');
    foot.appendChild(el('div','dg-portrait gframe','<div class="dp-ic">🐉</div><div class="dp-n">재의 용</div>'));
    const right=el('div','dg-right');
    right.appendChild(el('div','dg-once','1회 입장 가능'));
    const vals=el('div','dg-vals');
    vals.appendChild(el('div','dg-val',`<span>가능 횟수</span><b>${left}/1</b>`));
    vals.appendChild(el('div','dg-val',`<span>보유 입장권</span><b>${S.ticket}</b>`));
    right.appendChild(vals);
    right.appendChild(el('div','dg-x2','전투 보상 X2'));
    foot.appendChild(right); b.appendChild(foot);
    const btn=el('button','btn gold wide','도전 (입장권 1)'); btn.style.marginTop='8px';
    btn.onclick=()=>{ if(busyFight())return;
      if(dailyLeft('wb',1)<=0){toast('오늘 도전 완료');return;}
      if(S.ticket<1){toast('입장권 부족');return;}
      styledConfirm('입장 하시겠습니까?', ()=>{
        if(dailyLeft('wb',1)<=0){toast('오늘 도전 완료');return;}
        if(S.ticket<1){toast('입장권 부족');return;}
        S.ticket--; dailyUse('wb');                              // ← 차감은 [예] 이후에만
        enterDungeonFight({ name:'월드보스 · 재의 용', col:'#f2b23a', foeCP:Math.round(totalCP()*3), kind:'boss', dur:15, race:true,
          rewardText:'참가 보상 (전투 보상 X2)',
          reward:(st)=>{ const dmg=(st&&st.dmg)||0; S._wbdmg=Math.max(S._wbdmg||0,dmg);
            S.wbScore=(S.wbScore||0)+wbScoreOf(st);   // 정수 점수는 보상과 무관하게 별도 적립
            grantWorldBossReward(); },
          resultExtra:(bx,win,st)=>{ const rk=wbRankOf((st&&st.dmg)||0), pt=wbScoreOf(st);
            bx.appendChild(el('div','center small',`<b style="color:var(--g-legend)">${pt}점</b> · 누적 ${fmt(S.wbScore||0)}점`));
            bx.appendChild(el('div','center small mut',`서버 순위 ${rk}위 (누적 데미지 기준)`)); } });
      }, { title:'월드보스 · 재의 용', sub:`입장권 1개 차감 · 오늘 ${left}/1회`, yesFirst:true });
    };
    b.appendChild(btn);
  }},

  /* ★ B5/G-73·G-74·G-75·G-76·G-77·G-66: 시련의 탑
       G-74 월드보스와 동형 레이아웃([i] · 제한시간 · 초상 카드 · 값박스 2개 · 전투 보상 X2)
       G-73 랭킹(정렬 기준 = 도달 웨이브, 각 값 위 적색 wave 라벨)
       G-75 버튼 3개 [소탕][도전][교환] — 교환은 웨이브 상자(S.towerBox) 환전 서브 팝업
       G-76 일일 1회 제한 + 입장권 1 소비
       G-77 kind:'wave' — 웨이브 클리어마다 제한시간 60초 리셋 */
  tower:{ title:'시련의 탑', render(b){
    const w=S._tower||0, left=dailyLeft('tower',1);
    const head=el('div','dg-head');
    const info=el('button','dg-i','i');
    info.onclick=()=>toast('웨이브가 오를수록 적이 강해집니다. 한 웨이브를 전멸시키면 제한시간 60초가 다시 채워집니다.');
    head.append(info, el('div','dg-title','불꽃의 탑')); b.appendChild(head);
    b.appendChild(el('div','dg-limit','- 입장 제한 시간 -  10:00 ~ 12:00'));
    const rh=el('div','dg-rankhead');
    rh.appendChild(el('div','small mut','서버 랭킹 (도달 웨이브)'));
    const rw=el('button','btn xs','랭킹 보상'); rw.onclick=()=>openModal('towerReward'); rh.appendChild(rw);
    b.appendChild(rh);
    b.appendChild(dgRankList(TW_RANK.concat([[S.name, S.guildName||'무소속', w]]), { label:'wave', fmt:v=>String(v) }));
    const foot=el('div','dg-foot');
    foot.appendChild(el('div','dg-portrait gframe',`<div class="dp-ic">🗼</div><div class="dp-n">불꽃의 탑</div>`));
    const right=el('div','dg-right');
    right.appendChild(el('div','dg-once','1회 입장 가능'));
    const vals=el('div','dg-vals');
    vals.appendChild(el('div','dg-val',`<span>가능 횟수</span><b>${left}/1</b>`));
    vals.appendChild(el('div','dg-val',`<span>보유 입장권</span><b>${S.ticket}</b>`));
    right.appendChild(vals);
    right.appendChild(el('div','dg-x2','전투 보상 X2'));
    foot.appendChild(right); b.appendChild(foot);
    b.appendChild(el('div','hint',`최고 도달 <b style="color:var(--frame-lit)">${w} Wave</b> · 웨이브 상자 <b>${S.towerBox||0}</b>개 · 웨이브당 골드 40만+강화석 3, 상자 획득`));
    const row=el('div','btnrow'); row.style.marginTop='8px';
    // [소탕]
    const sw=el('button','btn','소탕');
    sw.onclick=()=>{ if(w<1){toast('먼저 1 Wave 이상 도달');return;}
      if(dailyLeft('towerSweep',1)<=0){toast('오늘 소탕 완료');return;}
      styledConfirm('소탕 하시겠습니까?', ()=>{ if(dailyLeft('towerSweep',1)<=0){toast('오늘 소탕 완료');return;}
        dailyUse('towerSweep');
        const gold=Math.floor(w*400000*0.5), stn=Math.floor(w*3*0.5), box=Math.max(1,Math.floor(w/4));
        addGold(gold); S.stones+=stn; S.towerBox=(S.towerBox||0)+box;
        toast(`소탕 · 골드 +${fmt(gold)} · 상자 +${box}`); openModal('tower'); refreshHUD();
      }, { title:'소탕', sub:`최고 기록 ${w} Wave 의 50% · 일일 1회` });
    };
    // [도전]
    const ch=el('button','btn gold','도전');
    ch.onclick=()=>{ if(busyFight())return;
      if(dailyLeft('tower',1)<=0){toast('오늘 도전 완료');return;}
      if(S.ticket<1){toast('입장권 부족');return;}
      styledConfirm('입장 하시겠습니까?', ()=>{
        if(dailyLeft('tower',1)<=0){toast('오늘 도전 완료');return;}
        if(S.ticket<1){toast('입장권 부족');return;}
        S.ticket--; dailyUse('tower');                          // ★ G-76 — 차감은 [예] 이후에만
        const foe=600+w*450;
        enterDungeonFight({ name:'불꽃의 탑', col:'#e85a2e', foeCP:foe, kind:'wave', dur:60, waveDur:60, race:true,
          rewardText:'도달 웨이브 비례 보상',
          reward:(st)=>{ const reach=Math.max(1,(st&&st.wave)||1); S._tower=Math.max(S._tower||0,reach);
            const gold=reach*400000, stn=reach*3, box=Math.max(1,Math.floor(reach/2));
            addGold(gold); S.stones+=stn; S.towerBox=(S.towerBox||0)+box;
            if(reach>=10) matGainGrade(pick(['R','E']), 2);   // ★ v4.5.1: 등급풀 폐지 대응
            sysLog(`불꽃의 탑 결과 — <b>${reach} Wave</b> · 골드 +${fmt(gold)} · 강화석 +${stn} · 웨이브 상자 +${box}`); },
          resultExtra:(bx,win,st)=>{ bx.appendChild(el('div','center big',`도달 ${Math.max(1,(st&&st.wave)||1)} Wave`)); } });
      }, { title:'불꽃의 탑', sub:`입장권 1개 차감 · 오늘 ${left}/1회`, yesFirst:true });
    };
    // [교환]
    const ex=el('button','btn','교환'); ex.onclick=()=>towerExchange();
    row.append(sw,ch,ex); b.appendChild(row);
  }},

  /* ★ B5/G-78: 시련의 탑 랭킹 보상 9행 + 적색 '매월 15일 초기화' (1~3위 색배지) */
  /* ★ v4.8: 월드보스 랭킹 보상 9행 + 적색 '매월 1일 초기화' (1~3위 색배지) */
  worldbossReward:{ title:'랭킹 보상', render(b){
    b.appendChild(el('div','small mut','누적 데미지 순위 보상'));
    WB_REWARD.forEach(([rk,rwd],i)=>{
      const row=el('div','lrow dg-rwrow');
      row.innerHTML=`<div class="rk${i<3?(' rk'+(i+1)):''}">${rk}</div><div class="nm2"></div><div class="sc">🎒 ${rwd}</div>`;
      b.appendChild(row);
    });
    b.appendChild(el('div','dg-limit','매월 1일 초기화'));
    const back=el('button','btn wide','◀ 월드보스'); back.style.marginTop='8px'; back.onclick=()=>openModal('worldboss'); b.appendChild(back);
  }},

  towerReward:{ title:'탑 랭킹 보상', render(b){
    b.appendChild(el('div','small mut','도달 웨이브 순위 보상 (주사위)'));
    TOWER_REWARD.forEach(([rk,rwd],i)=>{
      const row=el('div','lrow dg-rwrow');
      row.innerHTML=`<div class="rk${i<3?(' rk'+(i+1)):''}">${rk}</div><div class="nm2"></div><div class="sc">${eImg("🎲",2)} ${rwd}</div>`;
      b.appendChild(row);
    });
    b.appendChild(el('div','dg-limit','매월 15일 초기화'));
    const back=el('button','btn wide','◀ 시련의 탑'); back.style.marginTop='8px'; back.onclick=()=>openModal('tower'); b.appendChild(back);
  }},

  /* ★ A2: 세트효과 도감 — 원작은 세로 스크롤 카드 리스트다(그리드 아님).
     카드 1장 = 세트명 명판 + 임계값별 효과 블록. 8종은 6세트 1단계, '작열'만 3/6/8 3단계. */
  setfx:{ title:'세트효과', render(b){
    b.appendChild(el('div','hint','장비 세트 9종. 8종은 <b>6세트</b> 단일 임계값이며, ‘작열’ 1종만 <b>3 → 6 → 8세트</b> 3단계로 누적됩니다.'));
    /* ★ v5.7: 무엇을 모아야 하는지 보이게 한다 — 구성품과 보유 진행도.
       종전 카드는 효과 문구만 있어서 "그래서 뭘 모으라는 거지"에 답이 없었다. */
    SETS.forEach(s=>{
      const card=el('div','setcard');
      const list=SET_PIECES[s.n]||[], own=setPieceCount(s.n), max=list.length;
      const done=s.tiers.filter(t=>own>=t.k).length;
      let h=`<div class="sc-name">${s.n}${s.multi?' <span class="mut" style="font-size:9px">3단계</span>':''}`
          + `<span class="sc-prog${own>0?' on':''}">${own} / ${max}</span></div>`;
      s.tiers.forEach(t=>{
        const hit = own>=t.k;
        h+=`<div class="sc-tier${hit?' hit':''}"><div class="sc-k">${t.k}세트${hit?' ✓':''}</div>`+
           t.fx.map(x=>`<div class="sc-fx">${x}</div>`).join('')+`</div>`;
      });
      h+=`<div class="sc-pieces">`+list.map(nm=>{
        const has=(S.equips||[]).some(e=>e&&e.slot===nm);
        return `<span class="sc-pc${has?' has':''}">${nm}</span>`; }).join('')+`</div>`;
      card.innerHTML=h;
      if(done) card.classList.add('active');
      b.appendChild(card);
    });
  }},

  /* ★ B9/G-123·G-124·G-125: 7일 출석 — 1일 1회 날짜 검증 + 7열 그리드 + 원작 수량비 40:40:150:10:50:20:250 */
  attend:{ title:'7일 출석', render(b){
    b.appendChild(el('div','hint','출석 체크는 1일 1회만 가능합니다. 미수령 중 가장 빠른 날짜부터 순서대로 개봉됩니다.'));
    const g=el('div','grid c7'); g.style.marginTop='8px';
    const days=ATTEND_DAYS;
    const next = days.findIndex((_,i)=>!S.claimed.attend[i]);           // 미수령 중 최저 인덱스
    const claimedToday = S.attendLastDate===today();
    days.forEach(([t,ic,give],i)=>{ const done=S.claimed.attend[i]; const open=(i===next && !claimedToday);
      const c=el('div','cell gframe'); if(done) c.style.opacity='.4'; else if(!open) c.style.opacity='.7';
      if(open) c.style.borderColor='var(--frame-lit)';
      c.innerHTML=`<div class="gtag">${i+1}일</div><div class="ei">${eImg(ic,2)}</div><div class="cn">${t}${done?' ✓':''}</div>`;
      c.onclick=()=>{
        if(S.claimed.attend[i]){ toast('이미 수령한 날짜입니다'); return; }
        if(S.attendLastDate===today()){ toast('출석 체크는 1일 1회만 가능합니다'); return; }
        if(i!==next){ toast(`${next+1}일차부터 순서대로 수령됩니다`); return; }
        give(); S.claimed.attend[i]=true; S.attendLastDate=today();
        toast(`${t} 수령`); sysLog(`7일 출석 ${i+1}일차 — ${t}`); openModal('attend'); refreshHUD(); };
      g.appendChild(c); });
    b.appendChild(g);
    b.appendChild(el('div','center small mut', claimedToday ? '오늘 출석 완료 — 내일 다시 방문하세요.'
      : (next<0 ? '7일 출석을 모두 완료했습니다.' : `오늘 개봉 가능 · ${next+1}일차`)));
  }},

  /* ★ B9/G-128: 허브 2열×3행 + 하단 가로 [닫기] · G-129~G-132: 본문 규칙 문구 정합 */
  help:{ title:'도움말', render(b){
    const topics={
      // G-130: 강화 파괴 보호 규칙 (B3/G-41 과 정합)
      '영웅':'영웅은 등급(일반→레전더리)과 레벨로 성장합니다. 소환으로 조각을 모아 합성하면 등급이 오르고 스킬이 해금됩니다. 각성은 계정 전체 스탯을 +1.5%/단계 올립니다(상한 12).<br><br>강화 실패 시 장비가 파괴됩니다. 파괴방지에는 일반 망치 5개·희귀 망치 10개·영웅 전설망치 5개·레전더리 전설망치 10개가 필요합니다.',
      // G-131: 난이도 배율(X1~X3)은 요일던전 전용이라 삭제하고, 소환속도·보스 드랍 규칙으로 교체
      '몬스터':'몬스터를 소환해 사냥하면 등급별 재료를 얻습니다.<br><br>소환속도: 1.5초당 소환되는 몬스터의 수입니다.<br><br>보스는 일반 몬스터에게서 얻을 수 없는 고유 아이템(정수 관련)을 드랍합니다.',
      '제작':'대장간에서 등급×부위로 장비를 제작합니다. 확률 제작(희귀85·영웅55·레전더리40%)이며 실패 시 재료 100% 환급됩니다. 길잡이 구간은 성공률 100%로 고정됩니다.',
      '인벤토리':'재료·완성 장비·소환권·재화를 보관합니다.<br><br>재료: 일반·희귀 최대 2,000개, 영웅·레전더리 최대 900개(초과분 미획득)<br>무기: 종류당 최대 99개',
      // G-132: 직업별 사용 스탯 5행 표 — 빙결술사만 마법 공격력
      '직업':'5직업의 원소·역할과 <b>피해 계산에 사용하는 스탯</b>은 다음과 같습니다.'
        + '<div class="hr"></div>'
        + JOBS.map(j=>`<div class="kv"><span>${jobIcon(j.id)} ${j.name} <span class="mut small">(${j.el}·${j.role})</span></span><b style="color:${j.color}">${j.id==='frost'?'마법 공격력':'공격력'}</b></div>`).join('')
        + '<div class="hr"></div><span class="mut small">※ 빙결술사만 마법 공격력을 사용하며, 나머지 4직업은 공격력을 사용합니다.</span>',
      // G-129: 길드 랭킹 리셋 규칙
      '길드':'정원 30명. 길드 레이드·점령전으로 상시 버프를 얻습니다. 창설비 루비 600 또는 골드 3억(할인 시 루비 100 · 골드 1억).<br><br>길드 랭킹은 매주 월요일 오전 11시에 초기화됩니다.',
    };
    b.appendChild(el('div','small mut','도움말 · 토픽을 선택하세요'));
    const g=el('div','grid c2'); g.style.marginTop='6px';
    Object.keys(topics).forEach(k=>{ const c=el('div','cell gframe'); c.style.aspectRatio='auto'; c.style.padding='14px 4px'; c.innerHTML=`<div class="cn" style="font-size:13px;color:var(--txt-hi)">${k}</div>`;
      c.onclick=()=>{ setModalTitle('도움말 · '+k); const bb=$('#modalBody'); bb.innerHTML=''; const p=el('div','hint'); p.style.lineHeight='1.8'; p.innerHTML=topics[k]; bb.appendChild(p); const back=el('button','btn sm','◀ 도움말'); back.style.marginTop='10px'; back.onclick=()=>openModal('help'); bb.appendChild(back); };
      g.appendChild(c); });
    b.appendChild(g);
    const close=el('button','btn wide','닫기'); close.style.marginTop='10px'; close.onclick=()=>closeModal(); b.appendChild(close);
  }},
  strategy:{ title:'공략', render(b){ b.innerHTML=`<div class="hint" style="line-height:1.8">
    <b style="color:#f0cd82">■ 초반 로드맵</b><br>1) 방치로 골드·재료 축적 → 2) 희귀 장비 제작·장착 → 3) 소환으로 조각 모아 영웅 등급업 → 4) 각성으로 계정 스탯 상승 → 5) 투기장·던전으로 재화 확보.<br><br>
    <b style="color:#f0cd82">■ 병목</b><br>재료가 유일한 병목입니다. 확정 합성으로 고등급 재료를 안정 확보하세요.<br><br>
    <b style="color:#f0cd82">■ 효율</b><br>골드던전(일 3회)·마을회관 성장으로 골드 수급을 늘리고, 강화석은 마을재료로 환전해 마을을 키우세요.</div>`; }},

  /* ---------- 방치 수익 정산 ---------- */
  /* ★ B9/G-135(§4-9): settle = '정산 상세' 전용.
     영웅 상태바 → 통화줄 → 배터리+대형 시계 → 3행×4열(12칸) 그리드 → 2분할 카드 순.
     절전 '시작' 기능은 power 모달로 분리했다. */
  settle:{ title:'방치 정산', render(b){
    const rate=Math.round(18885*(1+(S.villHall-1)*0.0005)*costumeGoldMul()*titleGoldMul());   // ★ F2 칭호 골드 버프 반영
    // ① 영웅 상태바 — {직업} {N}LV [경험치바 %]
    const p0=(typeof party==='function')?party()[0]:null;
    if(p0){
      const pct=clamp((S.stats.kills%100), 0, 100);   // 데모: 누적 처치 기반 진행률
      const bar=el('div','settle-hero');
      bar.innerHTML=`<div class="sh-top"><b style="color:${GRADES[p0.grade].color}">${p0.job.name}</b><span>${p0.level}LV</span></div>`;
      const pb=el('div','pbar'); pb.appendChild(el('i')); pb.firstChild.style.width=pct+'%'; bar.appendChild(pb);
      bar.appendChild(el('div','sh-pct',`${pct}%`));
      b.appendChild(bar);
    }
    // ② 통화줄
    const cur=el('div','settle-cur');
    cur.innerHTML=`<span>${eImg("🪙",2)} <b style="color:var(--gold)">${fmt(S.gold)}</b></span><span>${eImg("💎",2)} <b>${fmt(S.ruby)}</b></span>`;
    b.appendChild(cur);
    // ③ 배터리 + 대형 시계
    b.appendChild(el('div','center',`<div class="small mut">🔋 100%</div>
      <div class="settle-clock">${$('#clock')?$('#clock').textContent:'--:--'}</div>`));
    // ④ 3행×4열 = 12칸 획득 재화 그리드
    b.appendChild(el('div','small mut','획득 재화'));
    const g=el('div','grid c4'); g.style.marginTop='6px';
    const cells=pwCells();   // ★ N3: 12칸 정본을 절전 오버레이와 공유(두 화면의 그리드가 동일 구성)
    cells.forEach(([ic,nm,v])=>{ const c=el('div','cell gframe'); c.innerHTML=`<div class="ei" style="font-size:19px">${eImg(ic,2)}</div><div class="cn">${nm}<br><b>${fmt(v||0)}</b></div>`; g.appendChild(c); });
    b.appendChild(g);
    // ⑤ 2분할 카드 — 1분당 획득 골드 / 오프라인 골드 (누적 시간 mm:ss)
    const offSec=Math.min(8*3600, Math.floor((S.offlinePending||0)/1000*60));
    const two=el('div'); two.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0';
    two.innerHTML=`<div class="gframe" style="padding:10px;text-align:center"><div class="small mut">1분당 획득 골드</div><div style="font-size:15px;font-weight:800;color:var(--gold)">${fmt(rate)} G</div></div>
      <div class="gframe" style="padding:10px;text-align:center"><div class="small mut">오프라인 골드 ${mmss(offSec)}</div><div style="font-size:15px;font-weight:800;color:var(--gold)">${fmt(S.offlinePending||0)} G</div></div>`;
    b.appendChild(two);
    if(S.offlinePending>0){
      const btn=el('button','btn gold wide','수령'); btn.style.marginTop='6px';
      btn.onclick=()=>{ addGold(S.offlinePending); toast(`오프라인 골드 +${fmt(S.offlinePending)}`); sysLog(`오프라인 방치 보상 +${fmt(S.offlinePending)}G`); S.offlinePending=0; closeModal(); refreshHUD(); };
      b.appendChild(btn);
    } else b.appendChild(el('div','center mut small','현재 온라인 실시간 수급 중 · 접속 종료 시 자동 누적됩니다.'));
  }},

  /* ---------- 간이/정보 모달 ---------- */
  /* ★ B9/G-122: 3탭 [임무목록][일일][업적] — 별도 quest2 모달을 '업적' 탭으로 흡수(모달 폐지). */
  quest:{ title:'퀘스트', render(b){
    let tab='임무목록'; const TB=['임무목록','일일','업적'];
    const tabs=el('div','tabrow'); TB.forEach(t=>{ const x=el('div','tab'+(t===tab?' on':''),t); x.onclick=()=>{ tab=t; render(); [...tabs.children].forEach((c,i)=>c.classList.toggle('on',TB[i]===tab)); }; tabs.appendChild(x); });
    b.appendChild(tabs); const body=el('div'); b.appendChild(body);
    function render(){ body.innerHTML='';
      if(tab==='임무목록'){
        body.appendChild(el('div','hint','길잡이 제작 체인 · 완료 시 보상. 최종 단계에서 약탈 해금.'));
        GUIDE_CHAIN.forEach((q,i)=>{ const done=i<S.guideStep, cur=i===S.guideStep;
          const row=el('div','pack'); row.style.opacity=done?'.5':'1'; row.innerHTML=`<div class="pic">${done?'✅':cur?q.goalIcon:eImg("🔒",2)}</div><div class="info"><div class="t">${i+1}. ${q.name} 제작</div><div class="d">${done?'완료':cur?`진행 중 · 보상 ${q.rewardIcon} X${fmt(q.rewardQty)}`:'잠김'}</div></div>`;
          if(cur){ const btn=el('button','btn sm gold','바로가기'); btn.onclick=()=>{ closeModal(); openModal('forge'); }; row.appendChild(btn); }
          body.appendChild(row); });
        const need=GUIDE_NEED[S.guideStep]||1;
        body.appendChild(el('div','hint',S.guideStep>=GUIDE_CHAIN.length?'모든 길잡이 완료 — 약탈이 해금되었습니다.':`각 단계는 <b>실제 행동으로 자동 완료</b>됩니다. 현재 진행 ${S.guideProg||0}/${need}`));
      } else if(tab==='일일'){
        // ★ B9/G-121: 상단 날짜 헤더 (장식 프레임)
        body.appendChild(el('div','datehead', `${todayLabel()} · ${S.day||1}일차`));
        body.appendChild(el('div','small mut','일일 미션 · 매일 0시 리셋'));
        /* ★ B9/G-120: 원작 6행. 보상은 전부 주사위 🎲 X n.
           '보스 3번 도전'은 수령 버튼 없이 진행 텍스트(N/3)만 표시한다. */
        DAILY_QUESTS.forEach((q,i)=>{
          const c=q.cnt(), goal=q.goal, met=c>=goal, done=dailyLeft('dqc'+i,1)<=0;
          const row=el('div','pack');
          row.innerHTML=`<div class="pic">${q.noBtn?eImg("👹",2):done?'✅':met?eImg("🎁",2):'📋'}</div><div class="info"><div class="t">${q.t}</div>`+
            `<div class="d">${Math.min(c,goal)}/${goal} · 보상 ${eImg("🎲",2)} X${q.rw}</div></div>`;
          if(q.noBtn){ row.appendChild(el('div','dq-prog',`${Math.min(c,goal)}/${goal}`)); }
          else {
            const btn=el('button','btn sm'+(met&&!done?' gold':''),done?'완료':'받기'); btn.disabled=!met||done;
            btn.onclick=()=>{ if(!met||dailyLeft('dqc'+i,1)<=0)return; S.dice+=q.rw; dailyUse('dqc'+i); toast(`주사위 X${q.rw} 수령`); openModal('quest'); refreshHUD(); };
            row.appendChild(btn);
          }
          body.appendChild(row); });
      } else {
        // ★ B9/G-122: 폐지된 quest2 모달의 업적 진행바를 이 탭으로 이식
        body.appendChild(el('div','hint','누적 처치·제작·소환 업적. (데모)'));
        [['몬스터 처치',S.stats.kills,100],['제작 성공',S.stats.crafts,10],['소환',S.stats.summons,20],['투기장 승리',S.stats.arenaWins,15],['재료 합성',S.stats.synths||0,10],['보스 도전',S.stats.bossChallenges||0,10]]
          .forEach(([t,v,goal])=>{ const row=el('div'); row.style.margin='8px 0';
            row.innerHTML=`<div class="kv"><span>${t}</span><b>${v}/${goal}</b></div>`;
            const pb=el('div','pbar'); pb.appendChild(el('i')); pb.firstChild.style.width=clamp(v/goal*100,0,100)+'%';
            row.appendChild(pb); body.appendChild(row); });
      }
    }
    render();
  }},
  /* ★ B8/G-105·G-106·G-107·G-110·G-111·G-112: 길드
       G-106 내부 탭 5개(정보/멤버/랭킹/레이드/점령전) 평탄화 → '길드 메인 단일 화면'.
             헤더(정원 N/30 배지 + 타이틀 + [길드 공지])와 누적점수 전폭 석판은 뷰를 바꿔도 유지되고,
             하단 고정 버튼은 미가입 2개(랭킹/점령지) · 가입 3개(길드 레이드/랭킹/점령전)로 갈린다.
       G-105 미가입 분기 — [길드 생성](길드장 버프 안내 + 길드명 입력 + 루비/골드 취소선 할인 2버튼)
             + [길드 가입](빈 리스트 + `Enter text...` + [검색])
       G-107 랭킹 6행 + 내 길드 요약행(별도 테두리) = 7요소. 1~3위만 구역 배지(3색), 4~6위는 숫자 등수.
             행 클릭 시 인라인 확장 [길드명][신청][X] · 신청 시 '가입 신청 완료' 토스트
       G-110 멤버 행 5필드 — 직급 뱃지 / 닉네임 / 기여점수 '~점' / 온라인 상태 / 참여기록
       G-111 길드장 버프 = '골드, 경험치 획득량 35% 증가'
       G-112 헤더 우측 [길드 공지] → 열람 서브모달(길드장·임원 편집 / 길드원 읽기전용) */
  guild:{ title:'길드', render(b){
    let view='main';                       // 'main' | 'rank'
    const head=el('div'), body=el('div'), foot=el('div','gu-foot');
    b.append(head, body, foot);
    guildHeadBlock(head);

    /* ---- 하단 고정 버튼 ---- */
    function drawFoot(){
      foot.innerHTML='';
      const items = guildJoined()
        /* ★ v5.2: 원작은 길드 메인 헤더(정원·길드명·공지·누적점수 석판)와 멤버 목록이 뒤에 남은 채
           레이드·점령전이 서브패널로 얹힌다 → openSub 로 부모를 유지한다. */
        ? [['길드 레이드', ()=>openSub('guildRaid')], ['랭킹', ()=>setView('rank')], ['점령전', ()=>openSub('conquest')]]
        : [['랭킹', ()=>setView('rank')], ['점령지', ()=>openSub('conquest')]];
      items.forEach(([label,fn])=>{
        const bt=el('button','gu-fbtn'+((label==='랭킹'&&view==='rank')?' on':''),label);
        bt.onclick=fn; foot.appendChild(bt);
      });
    }
    function setView(v){ view = (view===v && v==='rank') ? 'main' : v; draw(); }
    function draw(){ body.innerHTML=''; if(view==='rank') drawRank(); else if(guildJoined()) drawMain(); else drawJoinFlow(); drawFoot(); }

    /* ---- 가입 상태 메인 — 길드장 버프 · 멤버 스크롤 리스트 (G-106·G-110·G-111) ---- */
    function drawMain(){
      const master = guildMyGrade()==='master';
      body.appendChild(el('div','kv',`<span>👑 길드장 버프</span><b>${master?'골드, 경험치 획득량 35% 증가':'미보유 (길드장 전용)'}</b>`));
      body.appendChild(el('div','kv',`<span>${eImg("🛡️",2)} 길드 버프</span><b>골드 +5% · 경험치 +5%</b>`));
      body.appendChild(el('div','kv',`<span>🗿 내 레이드 누적</span><b>${fmt(S.guildRaidScore||0)}점</b>`));
      body.appendChild(el('div','small mut','길드원 목록 (기여도 순)'));
      const list=el('div','gu-mlist');
      const me=[S.name, guildMyGrade(), (S.guildScore||0), 0, '07-27', Math.floor((S.guildScore||0)/50000)+1];
      GUILD_MEMBERS.concat([me]).sort((a,b)=>b[2]-a[2]).forEach(m=>list.appendChild(memberRow(m, m[0]===S.name)));
      body.appendChild(list);
    }
    /* G-110: 5필드 = 직급 뱃지 / 닉네임 / 기여점수 / 온라인 상태 / 참여기록 */
    function memberRow(m, isMe){
      const [nm, rk, sc, mins, date, joins] = m;
      const G = GUILD_GRADES[rk] || GUILD_GRADES.member;
      const r=el('div','gu-mrow'+(isMe?' me':''));
      r.innerHTML = `<div class="gm-badge" style="--bc:${G.c}">${G.n}</div>`
        + `<div class="gm-nm">${nm}</div>`
        + `<div class="gm-sc">${fmt(sc)}점</div>`
        + `<div class="gm-on${mins===0?' live':''}">${mins===0?'온라인':fmt(mins)+'분 전'}</div>`
        + `<div class="gm-log">${date}<br>${joins}회 참여</div>`;
      return r;
    }

    /* ---- 미가입 분기 — [길드 생성] + [길드 가입] (G-105) ---- */
    function drawJoinFlow(){
      body.appendChild(el('div','gu-sect','길드 생성'));
      body.appendChild(el('div','gu-mbuff','*길드장 버프* 골드, 경험치 획득량 35% 증가'));
      const nameIn=el('input','gu-input'); nameIn.placeholder='길드명 입력...'; nameIn.maxLength=12;
      body.appendChild(nameIn);
      const crow=el('div','gu-crow');
      [['ruby','💎',600,100],['gold','🪙',300000000,100000000]].forEach(([cur,ic,was,now])=>{
        const bt=el('button','gu-cbtn');
        bt.innerHTML=`<span class="gc-ic">${eImg(ic,1.5)}</span><s class="gc-was">${fmtFull(was)}</s><b class="gc-now">${fmtFull(now)}</b><span class="gc-t">생성</span>`;
        bt.onclick=()=>guildCreate(nameIn.value, cur, now);
        crow.appendChild(bt);
      });
      body.appendChild(crow);

      body.appendChild(el('div','gu-sect','길드 가입'));
      const res=el('div','gu-searchres');
      const clearRes=()=>{ res.innerHTML=''; res.appendChild(el('div','gu-empty','검색 결과가 없습니다.')); };
      const srow=el('div','gu-searchrow');
      const si=el('input','gu-input'); si.placeholder='Enter text...';
      const sb=el('button','btn sm gold','검색');
      const doSearch=()=>{
        const q=(si.value||'').trim(); res.innerHTML='';
        const hits = q ? GUILD_RANK.filter(g=>g[0].indexOf(q)>=0) : [];
        if(!hits.length){ clearRes(); return; }
        hits.forEach(g=>{ const row=el('div','gu-srow');
          row.innerHTML=`<div class="nm2">${g[0]}</div><div class="sc">${fmt(g[1])}</div>`;
          const ap=el('button','btn sm gold','신청'); ap.onclick=()=>guildApply(g[0]);
          row.appendChild(ap); res.appendChild(row); });
      };
      sb.onclick=doSearch;
      si.addEventListener('keydown',ev=>{ if(ev.key==='Enter') doSearch(); });
      srow.append(si,sb); body.appendChild(srow);
      clearRes(); body.appendChild(res);
    }

    /* ---- 랭킹 뷰 — 6행 + 내 길드 요약행 (G-107) ---- */
    function drawRank(){
      body.appendChild(el('div','small mut','구역별 길드 랭킹 · 매주 월요일 오전 11시 초기화'));
      const list=el('div','gu-rank');
      GUILD_RANK.forEach((g,i)=>{
        const zone = i<3 ? GUILD_ZONES[i] : null;
        const wrap=el('div','gu-rwrap');
        const row=el('div','gu-rrow');
        row.innerHTML = (zone ? `<div class="gz" style="--zc:${zone.c}">${zone.n}</div>` : `<div class="gz num">${i+1}</div>`)
          + `<div class="nm2">${g[0]}</div><div class="sc">${fmt(g[1])}</div>`;
        const exp=el('div','gu-exp');
        exp.appendChild(el('span','ge-n',g[0]));
        const ap=el('button','btn sm gold','신청');
        ap.onclick=ev=>{ ev.stopPropagation(); guildApply(g[0]); };
        const cx=el('button','btn sm','X');
        cx.onclick=ev=>{ ev.stopPropagation(); exp.classList.remove('on'); };
        exp.append(ap,cx);
        row.onclick=()=>{ list.querySelectorAll('.gu-exp.on').forEach(n=>{ if(n!==exp) n.classList.remove('on'); }); exp.classList.toggle('on'); };
        wrap.append(row,exp); list.appendChild(wrap);
      });
      body.appendChild(list);
      const myNo = guildJoined() ? (GUILD_RANK.filter(g=>g[1]>guildTotalScore()).length+1) : 0;
      const me=el('div','gu-myrow');
      me.innerHTML = guildJoined()
        ? `<div class="gz num">${myNo}</div><div class="nm2">${S.guildName||'무명 길드'} <span class="small mut">내 길드</span></div><div class="sc">${fmt(guildTotalScore())}</div>`
        : `<div class="gz num">-</div><div class="nm2">가입한 길드가 없습니다 <span class="small mut">내 길드</span></div><div class="sc">-</div>`;
      body.appendChild(me);
    }

    draw();
  }},
  /* ★ B8/G-108: 길드 레이드 서브모달 — 대형 2/2 카운터 + 좌 보스 초상·이름 + 우 '내 누적점수 N점'
     + 적색 입장 제한시간 라인 + '자동 입장' 원형 토글 + [입장] → '입장 하시겠습니까?' [예/아니요] */
  guildRaid:{ title:'길드 레이드', render(b){
    guildHeadBlock(b);
    const MAX=2, left=dailyLeft('raidBoss',MAX);
    b.appendChild(el('div','gr-count',`${left}/${MAX}`));
    const foot=el('div','dg-foot');
    foot.appendChild(el('div','dg-portrait gframe','<div class="dp-ic">🗿</div><div class="dp-n">재의 골렘</div>'));
    const right=el('div','dg-right');
    right.appendChild(el('div','gr-my',`내 누적점수 <b>${fmt(S.guildRaidScore||0)}</b>점`));
    const pb=el('div','pbar'); pb.appendChild(el('i')); pb.firstChild.style.width='62%'; right.appendChild(pb);
    right.appendChild(el('div','center small mut','보스 HP 62% · 누적 데미지가 길드 점수가 됩니다'));
    foot.appendChild(right); b.appendChild(foot);
    b.appendChild(el('div','dg-limit','- 입장 제한 시간 -  10:00 ~ 12:00'));
    const arow=el('div','gd-autorow');
    const ab=el('button','gd-auto'+(S.guildRaidAuto?' on':''),`⟳<span>자동<br>입장</span>`);
    ab.onclick=()=>{ S.guildRaidAuto=!S.guildRaidAuto; toast(`자동 입장 ${S.guildRaidAuto?'ON':'OFF'}`); openModal('guildRaid'); };
    arow.appendChild(ab);
    arow.appendChild(el('div','small mut','자동 입장을 켜면 전투가 끝난 뒤 남은 횟수만큼 다시 참전합니다.'));
    b.appendChild(arow);
    const btn=el('button','btn gold wide','입장'); btn.style.marginTop='8px';
    btn.onclick=()=>enterGuildRaid(false);
    b.appendChild(btn);
  }},
  /* ★ B8/G-109: 점령전 — 점수를 S.holds[id].score 로 영속화(렌더마다 ri() 재계산 제거).
     ⓘ 버튼 + 제한시간 별도 라인 + '내 길드 점수' 숫자 필드(기존엔 boolean 텍스트뿐) */
  conquest:{ title:'점령전', render(b){
    guildHeadBlock(b);
    const hd=el('div','dg-head');
    const info=el('button','dg-i','i');
    info.onclick=()=>toast('거점을 점령하면 길드 전체에 상시 버프가 적용됩니다. 점령 점수는 매주 월요일 오전 11시에 초기화됩니다.');
    hd.append(info, el('div','dg-title','거점 점령')); b.appendChild(hd);
    b.appendChild(el('div','dg-limit','- 입장 제한 시간 -  10:00 ~ 12:00'));
    b.appendChild(el('div','cq-my',`<span>내 길드 점수</span><b>${fmt(conquestMyScore())}</b>`));
    CONQUEST.forEach(c=>{
      const h=holdRec(c.id), mine=h.own;
      const row=el('div','pack');
      row.innerHTML=`<div class="pic">${eImg(c.ic,2)}</div><div class="info">`
        + `<div class="t">${c.n} <span class="small" style="color:${mine?'var(--ok)':'var(--txt-dim)'}">${mine?'우리 길드 점령중':'점령: '+c.owner}</span></div>`
        + `<div class="d">${c.buff}</div>`
        + `<div class="cq-vals"><span>점령 점수 <b>${fmt(h.score)}</b></span><span>내 길드 <b class="cq-mine">${fmt(h.mine)}</b></span></div></div>`;
      const btn=el('button','btn sm'+(mine?'':' gold'), mine?'점령중':'도전');
      if(mine) btn.disabled=true;
      btn.onclick=()=>{
        if(busyFight())return;
        if(!guildJoined()){ toast('길드에 가입해야 점령전에 참여할 수 있습니다.'); return; }
        if(S.gold<CONQUEST_COST){ toast(`도전 비용 골드 ${fmtFull(CONQUEST_COST)} 부족`); return; }
        styledConfirm('입장 하시겠습니까?', ()=>{
          if(S.gold<CONQUEST_COST){ toast('골드가 부족합니다.'); return; }
          S.gold-=CONQUEST_COST;                              // ← 차감은 [예] 이후에만
          enterDungeonFight({ name:`점령전 · ${c.n}`, col:'#8a9a6a',
            foeCP:Math.round(totalCP()*rnd(0.9,1.15)), kind:'mobs', count:8, dur:22,
            rewardText:`${c.n} 점령 성공 — ${c.buff} 상시 적용`,
            reward:()=>{ const rec=holdRec(c.id); const gain=ri(400,900);
              rec.own=true; rec.mine+=gain; rec.score=Math.max(rec.score, rec.mine);
              S.guildScore=(S.guildScore||0)+gain;
              S.guildCoin=(S.guildCoin||0)+ri(30,60);
              /* ★ A3-1: 회색코인 획득 3경로 중 '길드 기여'(점령전 = 길드 누적 점수 기여).
                 ⚠비전미확인 — 촬영대기: 점령 성공 1회당 회색코인 수량 미판독. 잠정값. */
              const gray=ri(5,15); S.gray+=gray;
              sysLog(`<b>${c.n}</b> 점령 성공 · ${c.buff} · 점령 점수 +${fmt(gain)} · 회색코인 +${gray}`); } });
        }, { title:`점령전 · ${c.n}`, sub:`${c.buff} 상시 적용`, warn:`${eImg("🪙",2)} 골드 ${fmtFull(CONQUEST_COST)} 소모` });
      };
      row.appendChild(btn); b.appendChild(row);
    });
  }},
  raid:{ title:'약탈', render(b){
    if(S.guideStep<GUIDE_CHAIN.length){
      b.appendChild(el('div','center',`<div class="ei" style="font-size:44px">${eImg("🔒",2)}</div><div class="big mut">약탈 잠김</div>`));
      b.appendChild(el('div','warn',`길잡이 퀘스트 전 단계(${S.guideStep}/${GUIDE_CHAIN.length}) 완료 시 해금됩니다.`));
      const go=el('button','btn gold wide','길잡이 확인'); go.style.marginTop='8px'; go.onclick=()=>openModal('quest'); b.appendChild(go);
      return;
    }
    /* ★ G-113: 일일 약탈 횟수 3 → 1 (2곳 모두) */
    b.appendChild(el('div','hint',`매일 자정 충전 · 성공 시 <b>3종 효과</b>가 함께 적용됩니다 · 오늘 남은 ${dailyLeft('raid',1)}회`));
    /* ★ G-114: 약탈 성공 효과 3종 (골드 20% 1종만 있던 것을 복원) */
    b.appendChild(el('div','rd-fx',
        `<div class="rf-t">약탈 성공 효과</div>`
      + `<div class="rf-r"><span class="rf-i">①</span>타겟의 길드 레이드 횟수 <b>0회</b>로 초기화</div>`
      + `<div class="rf-r"><span class="rf-i">②</span>타겟의 길드 토큰 <b>30%</b> 약탈</div>`
      + `<div class="rf-r"><span class="rf-i">③</span>타겟의 골드 <b>20%</b> 약탈 (최대 30,000,000)</div>`));
    /* ★ G-115: 활성화는 자기 페널티가 아니라 자기 버프 2종. 리스크는 '피약탈 대상이 됨' 뿐이다.
       ★ G-116: 단일 ON/OFF 텍스트 토글 → [활성화][비활성화] 2버튼 상시 노출(선택된 쪽 초록 테두리) */
    const tg=el('div','pack');
    tg.innerHTML=`<div class="pic">⚡</div><div class="info"><div class="t">약탈 활성화</div>`
      + `<div class="d">활성화 시 길드레이드 피해 +50%, 골드 획득량 +20%</div>`
      + `<div class="d rd-risk">활성화 중에는 다른 군주의 피약탈 대상이 됩니다.</div></div>`;
    b.appendChild(tg);
    const oo=el('div','rd-onoff');
    [['활성화',true],['비활성화',false]].forEach(([label,on])=>{
      const bt=el('button','rd-ob'+(S.raidOn===on?' on':''),label);
      bt.onclick=()=>{ if(S.raidOn===on) return; S.raidOn=on; S.raidVictim=on;
        toast(on?'약탈 활성화 — 길드레이드 피해 +50% · 골드 획득량 +20%':'약탈 비활성화'); openModal('raid'); };
      oo.appendChild(bt);
    });
    b.appendChild(oo);
    // 타겟 닉네임 입력 → 도전
    const ir=el('div'); ir.style.cssText='display:flex;gap:6px;margin:8px 0';
    const inp=el('input'); inp.placeholder='타겟 닉네임 입력...'; inp.style.cssText='flex:1;background:#0c0906;border:1px solid #33281a;border-radius:7px;padding:8px 12px;color:#eaddc4;font-size:12px;outline:none';
    ir.appendChild(inp); b.appendChild(ir);
    const btn=el('button','btn gold wide','약탈 도전'); btn.onclick=()=>{ if(busyFight())return;
      if(dailyLeft('raid',1)<=0){toast('오늘 약탈 소진');return;}
      const target=(inp.value||'').trim()||pick(CHAT_NAMES);
      styledConfirm('약탈을 시작 하시겠습니까?', ()=>{
        if(dailyLeft('raid',1)<=0){toast('오늘 약탈 소진');return;}
        dailyUse('raid');                                    // ← 차감은 [예] 이후에만
        const goldMul = S.raidOn ? 1.2 : 1;                  // ★ G-115: 골드 획득량 +20% (상대 저항 페널티 삭제)
        enterDungeonFight({ name:`약탈 · ${target}의 영지`, col:'#c8752e',
          foeCP:Math.round(totalCP()*rnd(0.75,1.05)), kind:'mobs', count:6, dur:20,
          rewardText:`${target} 약탈 성공 — 레이드 횟수 초기화 · 길드 토큰 30% · 골드 20%`,
          reward:()=>{
            S.stats.raids=(S.stats.raids||0)+1;              // 약탈 성공 누적(통계 · ★ F2 이후 칭호 조건에는 쓰이지 않는다)
            const token=Math.max(1, Math.round(ri(40,140)*0.3*goldMul));   // ② 길드 토큰 30% 약탈
            S.guildCoin=(S.guildCoin||0)+token;
            const g=Math.min(30000000, Math.round(ri(2000000,12000000)*goldMul)); // ③ 골드 20% (상한 3,000만)
            addGold(g, true);
            /* ★ A3-1: 회색코인 획득 3경로 중 '약탈'. ⚠비전미확인 — 촬영대기: 약탈 1회당 회색코인 수량은
               원작 결과 팝업에서 판독되지 않았다(효과 안내 3줄에도 회색코인 항목 없음). 길드 레이드
               지급량(10~30)보다 낮은 잠정값을 둔다 — 약탈 결과창 스샷 확보 시 교체할 것. */
            const gray=ri(5,15); S.gray+=gray;
            sysLog(`약탈 성공 · <b>${target}</b> — 길드 레이드 횟수 0회 초기화 · 길드 토큰 +${fmt(token)} · 골드 +${fmt(g)} · 회색코인 +${gray}`);
          } });
      }, { title:`약탈 · ${target}`, sub:'레이드 횟수 초기화 · 길드 토큰 30% · 골드 20%(최대 3,000만)', yes:'약탈' });
    }; b.appendChild(btn); }},
  /* ---------- 코스튬 도감 (★ B3/G-48: 목록/상세 2뷰 · COSTUMES 9종 단일 소스) ---------- */
  /* ★ v5.3: 원작 코스튬은 '목록 ↔ 상세' 화면 전환이 아니라 **한 화면 마스터-디테일**이다.
     상단에 큰 프리뷰 패널(이름 / 효과 / 캐릭터 / 미획득 뱃지)이 늘 떠 있고, 그 아래 2열로 늘어선
     '이름만 적힌 버튼' 목록을 눌러 위 패널만 갈아끼운다(04_장비_인벤토리 9장 전부 동일 구조).
     종전 구현은 그리드 카드를 눌러야 상세로 '넘어가고' 뒤로가기로 돌아오는 2뷰였다. */
  costume:{ title:'코스튬', render(b){
    let sel = (S.costumeOn && costumeById(S.costumeOn)) ? S.costumeOn : (COSTUMES[0]||{}).id;
    const head=el('div'); const list=el('div','cos-list');
    b.append(head, list);

    function drawHead(){
      head.innerHTML='';
      const c=costumeById(sel); if(!c) return;
      const owned=costumeHas(c.id), worn=S.costumeOn===c.id;
      const job=JOBS.find(j=>j.id===c.heroId)||JOBS[0];
      const hn=(c.hero&&HERO_BY_ID[c.hero])?HERO_BY_ID[c.hero].name:'';
      const pane=el('div','cos-pane'+(owned?'':' locked'));
      pane.innerHTML=`<div class="cos-title">${c.name}</div>
        <div class="cos-fxlabel">효 과</div>
        <div class="cos-fx">${c.fx}</div>
        <div class="cos-preview"><div class="cp-ico">${c.icon}</div><div class="cp-hero">${jobIcon(job.id)}</div>
          ${owned?'':'<div class="cos-lockbadge">미획득</div>'}</div>
        <div class="center small mut">대상 영웅 · ${hn||job.name}${hn?` (${job.name})`:''}</div>`;
      const btn=el('button','btn wide'+(owned?' gold':''), !owned?'미획득':(worn?'착용중 (해제)':'장착'));
      btn.style.marginTop='8px'; if(!owned) btn.disabled=true;
      btn.onclick=()=>{ if(!owned){ toast('미획득 코스튬입니다.'); return; }
        S.costumeOn = worn ? '' : c.id; Battle.refreshParty();
        toast(worn?'코스튬 해제':`${c.name} 착용 — ${c.fx}`); refreshHUD(); drawHead(); drawList(); };
      pane.appendChild(btn); head.appendChild(pane);
      const ownCnt=COSTUMES.filter(x=>costumeHas(x.id)).length;
      head.appendChild(el('div','center small mut',`도감 ${ownCnt} / ${COSTUMES.length} · 상점 코스튬 탭에서 획득`));
    }
    function drawList(){
      list.innerHTML='';
      COSTUMES.forEach(c=>{
        const owned=costumeHas(c.id), worn=S.costumeOn===c.id;
        const it=el('div','cos-item'+(sel===c.id?' on':'')+(owned?'':' locked')+(worn?' worn':''), c.name);
        it.onclick=()=>{ sel=c.id; sfx('tap'); drawHead(); drawList(); };
        list.appendChild(it);
      });
    }
    drawHead(); drawList();
  }},
  /* ★ B7/G-104: 한정 패키지 5카드 — 전 카드 '계정당 1회 구매 가능' 라벨 + 구성품 그리드 */
  package:{ title:'패키지', render(b){
    b.appendChild(el('div','hint','한정 상품 · 전 카드 계정당 1회 구매 가능 (데모)'));
    b.appendChild(el('div','center small',`보유 루비 <b style="color:#e05aa0">${(S.ruby||0).toLocaleString('ko-KR')}</b>`));
    ACCOUNT_PACKS.forEach(p=>{
      const bought=!!S.claimed.mail[p.id];
      const card=el('div','gframe'); card.style.cssText='padding:10px;margin-top:8px;border-color:'+(bought?'#4a3a22':'var(--g-legend)');
      card.appendChild(el('div','',`<div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:26px">${eImg(p.ic,2.5)}</span>
        <span style="font-weight:800;color:var(--txt-hi)">${p.t}</span>
        ${bought?'<span class="small" style="color:var(--ok)">구매완료</span>':''}
        <span style="margin-left:auto;font-weight:800;color:${p.cost?'#e05aa0':'var(--ok)'}">${p.cost?`${eImg("💎",2)} ${p.cost.toLocaleString('ko-KR')}`:'무료'}</span></div>`));
      const g=el('div'); g.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:8px 0';
      p.items.forEach(([ic,nm])=>{ const c=el('div','cell gframe'); c.style.padding='5px';
        c.innerHTML=`<div class="ei" style="font-size:20px">${eImg(ic,2)}</div><div class="cn" style="font-size:9px;line-height:1.3">${nm}</div>`; g.appendChild(c); });
      card.appendChild(g);
      card.appendChild(el('div','small mut','* 계정당 1회 구매 가능'));
      const ok = !bought && (S.ruby>=p.cost);
      const btn=el('button','btn wide'+(ok?' gold':''), bought?'구매 완료':(p.cost?'구매':'받 기')); btn.style.marginTop='6px';
      if(!ok) btn.disabled=true;
      btn.onclick=()=>{ if(S.claimed.mail[p.id]) return;
        if(p.cost && S.ruby<p.cost){ toast('루비가 부족합니다.'); return; }
        if(p.cost) S.ruby-=p.cost;
        p.give(); S.claimed.mail[p.id]=true; sfx('craft'); toast(`${p.t} 수령`); openModal('package'); refreshHUD(); };
      card.appendChild(btn); b.appendChild(card);
    });
  }},
  /* ★ B4/G-61: 등급 탭 4개(일반 0-1 / 희귀 2-3 / 영웅 4-5 / 레전더리 6-7), 탭 헤더 `N마리`.
     각 행에 `레벨 : N` + 직업 라벨. 레전더리 탭 좌상단 `난이도 X1` 배지.
     ★ B4/G-62: 타이틀 '몬스터 소환' → '몬스터' */
  monster:{ title:'몬스터', render(b){
    // ★ 사냥 대상 선택 — 선택한 몬스터가 홈 필드에 계속 출현한다.
    //   재료는 몬스터별 고정. 다음 등급 재료는 더 강한 몬스터가 떨군다.
    //   부대가 약한데 강한 몬스터를 고르면 맞아 죽는다(전멸 → 자동 후퇴).
    const myCP=totalCP();
    /* ★ v4.7: 등급 탭은 인덱스 구간 하드코딩이 아니라 drop 등급으로 거른다(등급당 30종). */
    const GT=[['N','일반'],['R','희귀'],['E','영웅'],['L','레전더리']];
    const byG = g => HUNT_TIERS.map((t,i)=>({t,i})).filter(x=>x.t.drop===g);
    let gi = MODALS.monster._tab;
    if(!(gi>=0&&gi<4)) gi = Math.max(0, GORDER.indexOf((HUNT_TIERS[S.huntTier||0]||HUNT_TIERS[0]).drop));
    MODALS.monster._tab = gi;
    const tabrow=el('div','tabrow');
    GT.forEach(([g,label],k)=>{
      const cnt=byG(g).length;
      const t=el('div','tab'+(k===gi?' on':''),`${label} <span class="small">${cnt}종</span>`);
      t.style.color = k===gi ? '' : GRADES[g].color;
      t.onclick=()=>{ MODALS.monster._tab=k; openModal('monster'); };
      tabrow.appendChild(t);
    });
    b.appendChild(tabrow);
    /* ★ v5.9: 마릿수 선택기 — 원작 '30마리' 상하 화살표(전량판독 라인 121, UI카탈로그 110).
       선택한 마릿수가 홈 필드 동시 스폰 상한이 된다(더 많이 소환할수록 더 둘러싸임). */
    const mc = el('div','mobcount-row'); mc.style.cssText='display:flex;align-items:center;justify-content:center;gap:10px;margin:8px 0;';
    const mcL=el('div','mc-btn','▲'); const mcR=el('div','mc-btn','▼');
    mcL.style.cssText=mcR.style.cssText='cursor:pointer;font-size:14px;padding:4px 10px;border:1px solid var(--frame);border-radius:6px;user-select:none;';
    const mcVal=el('span','mc-val',`${S.mobCount||30}마리 소환`); mcVal.style.cssText='font-weight:bold;min-width:96px;text-align:center;';
    const mcSet= v=>{ S.mobCount=clamp(v,5,30); mcVal.textContent=`${S.mobCount}마리 소환`; Battle.setHunt&&Battle.setHunt(); save(); };
    mcL.onclick=()=>mcSet((S.mobCount||30)+1);
    mcR.onclick=()=>mcSet((S.mobCount||30)-1);
    mc.append(mcL,mcVal,mcR); b.appendChild(mc);
    if(gi===3){ const bd=el('div','mon-diff','난이도 X1'); b.appendChild(bd); }   // 레전더리 탭 배지
    b.appendChild(el('div','hint',`선택한 몬스터가 <b>홈 필드에 계속 출현</b>합니다. 내 전투력 <b style="color:#f0d59a">${fmt(myCP)}</b> — 권장보다 약하면 부대가 전멸합니다.`));
    const g0=GT[gi][0];
    for(const {t,i} of byG(g0)){
      const cur = (S.huntTier||0)===i;
      const danger = myCP < t.cp;
      const jb = JOBS.find(j=>j.id===t.job) || JOBS[0];
      /* ★ v4.3 (대표 결정 A — 정보로 유도): 지금 사냥 중인 곳보다 '위'인 카드에는
         왜 올라가야 하는지를 붙인다 — 여기서만 나오는 재료 / 골드 배율 / 해금되는 제작 등급. */
      const curT = i > (S.huntTier||0);
      const base = HUNT_TIERS[S.huntTier||0] || HUNT_TIERS[0];
      const goldMul = base.gold ? t.gold/base.gold : 1;
      const row=el('div','pack'); if(cur) row.style.borderColor='var(--g-legend)';
      // ★ v4.7: 원작은 몬스터마다 드랍 아이템 아이콘 그리드를 보여준다(일반3·희귀3·영웅4·레전더리6)
      const dropGrid = (t.drops||[t.mat]).map(k=>
        `<span class="mdrop" title="${k}">${matIcon(k)}</span>`).join('');
      row.innerHTML=`<div class="pic" style="border-color:${t.c}">${t.img?`<img src="assets/monsters/${t.img}.png" style="width:48px;height:48px;image-rendering:pixelated;object-fit:contain" alt="${t.n}">`:'💀'}</div>
        <div class="info"><div class="t" style="color:${t.c}">${t.n} ${cur?'<span class="small" style="color:var(--ok)">소환 중</span>':''}</div>
        <div class="d"><b>레벨 : ${t.level}</b> · <span style="color:${jb.color}">${jb.emoji} ${jb.name}</span> · 권장 전투력 <b style="${danger?'color:var(--bad)':'color:var(--ok)'}">${fmt(t.cp)}</b>${danger?' ⚠ 전멸 위험':''}
        <div class="mdrops">${dropGrid}</div>
        ${curT&&!cur?`<div class="mon-why">
            <div class="mw"><span class="mwl">여기서만</span> ${matIcon(t.mat)} <b style="color:${GRADES[t.drop].color}">${t.mat}</b></div>
            <div class="mw"><span class="mwl">골드</span> <b style="color:${goldMul>=1.5?'var(--ok)':''}">×${goldMul.toFixed(1)}</b> <span class="mut">(${fmt(t.gold)}/마리)</span></div>
            ${GORDER.indexOf(t.drop)>GORDER.indexOf(base.drop)
              ? `<div class="mw"><span class="mwl">해금</span> <b style="color:${GRADES[t.drop].color}">${GRADES[t.drop].name} 장비</b> 제작 재료</div>`
              : `<div class="mw"><span class="mwl">난이도</span> 레벨 ${t.level} · 체력 ${fmt(t.hp)}</div>`}
          </div>`:`<br>드랍: ${matIcon(t.mat)} <b style="color:${GRADES[t.drop].color}">${t.mat}</b>${t.sub?` + ${GRADES[t.sub].name} 소량`:''} · 골드 ${fmt(t.gold)}`}
        </div></div>`;
      const btn=el('button','btn sm'+(cur?'':' gold'),cur?'사냥중':'사냥');
      if(cur) btn.disabled=true;
      btn.onclick=()=>{ S.huntTier=i; Battle.setHunt(); sfx('tap');
        toast(`${t.n} 소환 — 홈 필드에 출현합니다${danger?' · ⚠ 부대가 버틸 수 있을지…':''}`);
        sysLog(`몬스터 소환 → <span style="color:${t.c}">${t.n}</span> (${GRADES[t.drop].name} 재료)`);
        closeModal(); refreshHUD(); };
      row.appendChild(btn); b.appendChild(row);
    }
    b.appendChild(el('div','hint','파밍 순환: 현재 몬스터로 재료를 모아 장비 제작 → 강해지면 다음 몬스터 선택 → 상위 재료 파밍.'));
  }},

  mail:{ title:'우편', render(b){ giftBox(b,[['welcome','운영자 선물 · 루비 100','💎',()=>S.ruby+=100],['attend7','출석 보상 · 소환권 1','🎟️',()=>S.tickHero++],['shard','환영 조각 · 화염검사 30','🔥',()=>S.shards.flame+=30]]); }},
  /* ★ B9/G-127: 원작 순서 11항목만 노출.
     코스튬·각성·칭호는 캐릭터 스탯창으로, 점령전은 홀드 상태(길드)로, 광고 제거는 상점으로 이관했다. */
  buff:{ title:'버프', render(b){
    const now=Date.now();
    const joined  = (S.guildJoined===undefined) ? true : !!S.guildJoined;   // B8 미가입 분기 도입 전에는 가입 상태
    const master  = !!S.guildMaster;
    const rankPct = personalRankBuffPct();
    const costPct = Math.round((costumeGoldMul()-1)*100);
    const holdPct = holdOwn('mine') ? 80 : 0;   // ★ B8/G-109: holds 가 {own,score,mine} 객체가 되어 truthy 판정 불가
    // ★ F2: 칭호 효과를 TITLES[].e 에서 직접 읽어 집계에 반영한다(하드코딩 id 분기 제거).
    const wornTitle = TITLE_BY_ID[S.title] || null;
    const tGoldPct = Math.round(titleEff('gold')*100), tExpPct = Math.round(titleEff('exp')*100);
    const goldPct = (S.villHall-1)*VILL_BUFF_PP + (S.buffs.goldUntil>now?100:0) + (joined?5:0) + (master?35:0)
                  + rankPct + costPct + holdPct + tGoldPct;
    const expPct  = (S.villTrain-1)*VILL_BUFF_PP + (S.buffs.expUntil>now?100:0) + (joined?5:0) + (master?35:0) + tExpPct;
    const days = ts => ts>now ? `${Math.ceil((ts-now)/86400000)}일 남음` : '미보유';
    b.appendChild(el('div','center small mut','현재 적용 중인 버프 집계 (11종)'));
    [ ['🪙','최종 골드',        `+${goldPct.toFixed(2)}%`],
      ['📈','최종 경험치',      `+${expPct.toFixed(2)}%`],
      ['🗡️','약탈 활성화 버프', S.raidOn ? '길드레이드 피해 +50% · 골드 획득 +20%' : '비활성'],
      ['🛡️','길드 버프',        joined ? '골드 +5% · 경험치 +5%' : '길드 미가입'],
      ['👑','길드장 버프',      master ? '골드, 경험치 획득량 35% 증가' : '미보유'],
      ['🏅','개인랭크 버프',    rankPct>0 ? `${TIERS[S.arenaTier]||'브론즈'} · 골드 +${rankPct}%` : '미보유'],
      ['💎','골드 프리미엄',    days(S.buffs.goldUntil)],
      ['📘','경험치 프리미엄',  days(S.buffs.expUntil)],
      ['🔨','제작 프리미엄',    S.buffs.craftUntil>now ? `제작 시간 -50% · ${Math.ceil((S.buffs.craftUntil-now)/86400000)}일 남음` : '미보유'],
      ['🏛️','마을회관',         `Lv${S.villHall} · 골드 +${((S.villHall-1)*VILL_BUFF_PP).toFixed(2)}%`],
      ['⛺','훈련소',           `Lv${S.villTrain} · 경험치 +${((S.villTrain-1)*VILL_BUFF_PP).toFixed(2)}%`],
    ].forEach(([ic,nm,v])=>{ b.appendChild(el('div','kv',`<span>${eImg(ic,1.2)} ${nm}</span><b>${v}</b>`)); });
    /* ★ v5.81: 칭호 효과를 별도 행으로 명시 — 체감 개선.
       착용 칭호명 + 골드/경험치/제작시간/제작확률 효과 표시. */
    if(wornTitle){
      const tworn = TITLES.find(t=>t.id===S.title);
      const tfx = [];
      if(titleEff('gold')) tfx.push(`골드 +${Math.round(titleEff('gold')*100)}%`);
      if(titleEff('exp')) tfx.push(`경험치 +${Math.round(titleEff('exp')*100)}%`);
      if(titleEff('crate')) tfx.push(`제작확률 +${Math.round(titleEff('crate')*100)}%p`);
      if(titleEff('ctime')) tfx.push(`제작시간 ${Math.round(titleEff('ctime')*100)}%`);
      const fxText = tfx.length ? tfx.join(' · ') : '특수 효과';
      b.appendChild(el('div','hr',''));
      b.appendChild(el('div','kv',`<span>${eImg('🏅',1.2)} 칭호「${wornTitle.n}」</span><b style="color:#e8a04a">${fxText}</b>`));
    }
    b.appendChild(el('div','hint',`<div class="hr"></div>코스튬·각성 효과는 캐릭터 스탯창에서, 점령지 버프는 길드 점령전에서 확인합니다.`));
  }},
  /* ★ N3/§7-10: '유저 소통'·'라운지'는 인게임 화면이 아니라 **게임 밖 외부 서비스로 나가는 링크**다.
     [근거] 02_홈_메인HUD/ 2장 — 소통 버튼은 외부 메신저 앱(미설치 시 앱스토어 상세)으로,
       라운지 버튼은 새 브라우저 탭의 외부 커뮤니티 홈(탭 3개 · 가입/게임하기 버튼)으로 각각 랜딩한다.
       즉 종전의 '친구·귓속말·차단 (데모)' / '서버 랭킹 라운지 (데모)' 인게임 stub 은 오답이었다.
     ⚠비전미확인 — 촬영대기: 이동 **직전** 인게임 확인 팝업의 유무·문구(2장 모두 '이동 후' 목적지만 캡처됨).
       확인 없이 곧바로 나가면 데모에서 되돌아올 수 없으므로 안전하게 확인 단계를 둔다. */
  social:{ title:'유저 소통', render(b){ extLinkPanel(b,'social'); }},
  lounge:{ title:'라운지',   render(b){ extLinkPanel(b,'lounge'); }},
  /* ★ B9/G-134: 압축 나열 → 제목 밴드 + 양피지 서술형 본문 단일 상세뷰 (다건이므로 목록→상세 2단) */
  notice:{ title:'공지', render(b){
    const list=NOTICES;
    const body=el('div'); b.appendChild(body);
    function detail(i){
      const n=list[i]; body.innerHTML='';
      body.appendChild(el('div','notice-band',`<span class="nb-cat">${n.cat}</span><span class="nb-t">${n.t}</span>`));
      body.appendChild(el('div','notice-date',n.d));
      const p=el('div','notice-body'); p.innerHTML=n.body; body.appendChild(p);
      if(list.length>1){ const back=el('button','btn sm','◀ 공지 목록'); back.style.marginTop='10px'; back.onclick=()=>index(); body.appendChild(back); }
    }
    function index(){
      body.innerHTML=''; body.appendChild(el('div','small mut','공지사항'));
      list.forEach((n,i)=>{ const row=el('div','pack'); row.style.cursor='pointer';
        row.innerHTML=`<div class="pic">${eImg(n.ic,1.5)}</div><div class="info"><div class="t">${n.cat} ${n.t}</div><div class="d">${n.d}</div></div>`;
        row.onclick=()=>detail(i); body.appendChild(row); });
    }
    if(list.length===1) detail(0); else index();
  }},
  /* ★ B9/G-135(§4-9)·G-136 → N3/§7-9 갱신: power = '절전 시작' 전용(배터리 + 안내문 + 시작 버튼).
     [실측 반영] 절전 화면 8장을 확보해 종전의 `⚠비전불확실`(캡처 0장)을 해제했다 — 오버레이 구성·해제 방식은
       startPowerSave() 주석 참조. 원작의 정규 진입은 **좌상단 명패 탭(확인 없이 즉시)** 이며,
       사이드메뉴 '절전' 경로가 같은 동작인지는 해당 경로 캡처가 없어 미확인이라 이 확인 모달을 회귀 방지로 존치한다.
     ⚠비전미확인 — 촬영대기: 사이드메뉴 🔋'절전'을 눌렀을 때 확인 모달이 실제로 뜨는지 여부. */
  power:{ title:'절전 모드', render(b){
    b.appendChild(el('div','center',`<div class="ei" style="font-size:52px">🔋</div>
      <div class="big">절전 모드</div><div class="small mut">배터리 100%</div>`));
    b.appendChild(el('div','hint','화면을 어둡게 하여 배터리 소모를 줄입니다. 절전 중에도 <b>방치 전투·골드 수급과 채팅은 계속</b>됩니다. 해제하려면 하단의 <b>모루를 오른쪽 끝까지 밀어주세요.</b>'));
    b.appendChild(el('div','hint','좌상단 <b>명패(이름·칭호)</b>를 누르면 이 창 없이 곧바로 절전으로 들어갑니다.'));
    const btn=el('button','btn gold wide','절전 시작'); btn.style.marginTop='10px';
    btn.onclick=()=>{ closeModal(); startPowerSave(); };
    b.appendChild(btn);
  }},
  /* ★ B9/G-133: '그래픽·계정·고객센터 (데모)' 안내 문구를 실제 3행 항목으로 대체 */
  settings:{ title:'설정', render(b){
    b.appendChild(el('div','small mut','옵션'));
    // 사운드
    const sr=el('div','pack'); sr.innerHTML=`<div class="pic">🔊</div><div class="info"><div class="t">사운드</div><div class="d">타격·제작·소환 효과음</div></div>`;
    const sb=el('button','btn sm'+(S.settings.sound?' gold':''),S.settings.sound?'켜짐':'꺼짐'); sb.onclick=()=>{ S.settings.sound=!S.settings.sound; if(S.settings.sound){ initAudio(); sfx('tap'); } openModal('settings'); }; sr.appendChild(sb); b.appendChild(sr);
    // ① 그래픽 품질 (상/중/하)
    const gr=el('div','pack'); gr.innerHTML=`<div class="pic">🖼️</div><div class="info"><div class="t">그래픽 품질</div><div class="d">현재 · ${S.settings.graphic||'상'}</div></div>`;
    const gw=el('div','optbtns');
    ['상','중','하'].forEach(q=>{ const qb=el('button','btn sm'+(S.settings.graphic===q?' gold':''),q);
      qb.onclick=()=>{ S.settings.graphic=q; toast(`그래픽 품질 · ${q}`); openModal('settings'); }; gw.appendChild(qb); });
    gr.appendChild(gw); b.appendChild(gr);
    // ② 계정
    const ar=el('div','pack'); ar.innerHTML=`<div class="pic">👤</div><div class="info"><div class="t">계정</div><div class="d">${S.name} · ${S.server}</div></div>`;
    const ab=el('button','btn sm','로그아웃'); ab.onclick=()=>toast('로그아웃은 데모에서 지원하지 않습니다'); ar.appendChild(ab); b.appendChild(ar);
    // ③ 고객센터
    const cr=el('div','pack'); cr.innerHTML=`<div class="pic">🎧</div><div class="info"><div class="t">고객센터</div><div class="d">자주 묻는 질문 · 1:1 문의</div></div>`;
    const cb=el('button','btn sm','FAQ·문의'); cb.onclick=()=>toast('고객센터 준비 중입니다'); cr.appendChild(cb); b.appendChild(cr);
    const btn=el('button','btn red wide','데이터 초기화'); btn.style.marginTop='10px'; btn.onclick=()=>{ if(confirm('세이브를 초기화할까요?')){ localStorage.removeItem(SAVE_KEY); location.reload(); } }; b.appendChild(btn);
  }},
  codex:{ title:'도감', render(b){
    let tab='영웅'; const TB=['영웅','몬스터','세트'];
    const tabs=el('div','tabrow'); TB.forEach(t=>{ const x=el('div','tab'+(t===tab?' on':''),t); x.onclick=()=>{ tab=t; render(); [...tabs.children].forEach((c,i)=>c.classList.toggle('on',TB[i]===tab)); }; tabs.appendChild(x); });
    b.appendChild(tabs); const body=el('div'); b.appendChild(body);
    function render(){ body.innerHTML='';
      if(tab==='영웅'){ const g=el('div','grid c3'); JOBS.forEach(j=>{ const _b=classBest(j.id); const owned=!!_b; const gr=owned?_b.grade:'N'; const c=el('div','cell gframe grade-'+gr);   /* ★ B4/G-50: 로스터 구조 대응 */ c.innerHTML=`<div class="gtag">${owned?GRADES[gr].name:'미보유'}</div><div class="ei" style="${owned?'':'filter:grayscale(1);opacity:.4'}">${jobIcon(j.id)}</div><div class="cn">${j.name}<br><span class="mut" style="font-size:8px">${j.el}·${j.role}</span></div>`; g.appendChild(c); }); body.appendChild(g); }
      else if(tab==='몬스터'){ const g=el('div','grid c4'); MONSTERS.forEach((m,i)=>{ const gr=['N','N','R','R','E','E','L'][i]||'N'; const c=el('div','cell gframe grade-'+gr); c.innerHTML=`<div class="gtag">${GRADES[gr].name}</div><div class="ei">💀</div><div class="cn">${m}</div>`; g.appendChild(c); }); body.appendChild(g); }
      else { const g=el('div','grid c3'); SETS.forEach(s=>{ const c=el('div','cell gframe'); c.style.aspectRatio='auto'; c.style.padding='8px 4px'; c.innerHTML=`<div class="ei" style="font-size:20px">🧩</div><div class="cn"><b>${s.n}</b><br><span class="mut" style="font-size:9px">${setFxSummary(s)}</span></div>`; g.appendChild(c); }); body.appendChild(g); }
    }
    render();
  }},
  /* ★ B9/G-118·G-119: 칭호 — (보유)/(도감) 2뷰 토글. 착용중 칭호는 해제 불가([착용중] disabled). */
  titles:{ title:'칭호', render(b){
    let view = MODALS.titles._view || '보유';
    const body=el('div');
    const foot=el('button','btn sm wide',''); foot.style.marginTop='10px';
    function draw(){
      body.innerHTML='';
      if(view==='보유'){
        const own=TITLES.filter(titleOwned);
        body.appendChild(el('div','hint',`보유 칭호 ${own.length}종 / 전체 ${TITLES.length}종 · 1개만 착용 가능하며 해제할 수 없습니다.`));
        if(!own.length) body.appendChild(el('div','center mut small','보유한 칭호가 없습니다.'));
        /* ★ N3: 원작 보유 카드는 [칭호명 | 효과박스 | 착용/착용중] 아래에 **접었다 펴는 '조건' 서브텍스트**가 붙는다. */
        own.forEach(t=>{ const worn=S.title===t.id; const c=titleGradeColor(t.g);
          const row=el('div','pack'); row.innerHTML=`<div class="pic" style="border-color:${c}">${eImg("🎖️",2)}</div><div class="info">`+
            `<div class="t" style="color:${c}">${t.n}<span class="small mut" style="margin-left:6px">${(TITLE_GRADES[t.g]||{}).n||''}</span></div>`+
            `<div class="d"><span class="titlecap">${t.fx}</span> <span class="tc-more">조건 ▾</span></div>`+
            `<div class="tc-cond hidden">획득 조건 · ${t.cond}</div></div>`;
          row.onclick=()=>{ const cd=row.querySelector('.tc-cond'), mo=row.querySelector('.tc-more');
            if(cd&&cd.classList) cd.classList.toggle('hidden');
            if(mo) mo.textContent = (cd&&cd.classList&&cd.classList.contains('hidden')) ? '조건 ▾' : '조건 ▴'; };
          const btn=el('button','btn sm'+(worn?'':' gold'),worn?'착용중':'착용');
          if(worn) btn.disabled=true;
          else btn.onclick=(ev)=>{ ev&&ev.stopPropagation&&ev.stopPropagation(); S.title=t.id; if(typeof Battle!=='undefined'&&Battle.refreshParty) Battle.refreshParty(); toast(`${t.n} 착용`); openModal('titles'); refreshHUD(); };
          row.appendChild(btn); b.appendChild(row); });
      } else {
        // ★ N3: 원작 목록 순서대로 — 일반 → 희귀 → 영웅 → GM → 레전더리
        body.appendChild(el('div','hint',`칭호 도감 · 전체 ${TITLES.length}종 (일반 5 · 희귀 9 · 영웅 6 · GM 1 · 레전더리 8)`));
        TITLE_GORDER.forEach(g=>{
          const list=TITLES.filter(t=>t.g===g); if(!list.length) return;
          const c=titleGradeColor(g);
          body.appendChild(el('div','small mut',`<span style="color:${c};font-weight:700">— ${(TITLE_GRADES[g]||{}).n} ${list.length}종 —</span>`));
          list.forEach(t=>{ const has=titleOwned(t);
            const card=el('div','titlecard'); card.style.borderColor=c; if(!has) card.style.opacity='.45';
            card.innerHTML=`<div class="tc-top"><b style="color:${c}">${t.n}</b><span class="titlecap">${t.fx}</span></div>`+
              `<div class="tc-cond">${has?'획득 완료':'획득 조건'} · ${t.cond}</div>`;
            body.appendChild(card); });
        });
      }
      foot.textContent = view==='보유' ? '획득 방법 ▾' : '◀ 보유 칭호';
    }
    foot.onclick=()=>{ view = (view==='보유'?'도감':'보유'); MODALS.titles._view=view; draw(); };
    b.appendChild(body); b.appendChild(foot); draw();
  }},
};

/* ------- 모달 헬퍼 ------- */
/* ★ N3/§7-10: 외부 서비스 링크 정본.
   url 은 **의도적으로 비어 있다.** 원작 스샷에 찍힌 실제 주소·서비스 브랜드는 타사 자산이라 코드에 옮기지 않는다.
   라이브 빌드에서 화신 자체 채널 주소를 주입하면 window.open 경로가 그대로 살아난다(구조는 이미 외부 이동). */
const EXT_LINKS = {
  social:{ ic:'💬', n:'공식 오픈채팅',  p:'으로', dest:'외부 메신저 앱',
    d:'운영진·이용자와 실시간으로 이야기하는 결정의 시대 공식 채팅방입니다.',
    note:'앱이 설치돼 있지 않으면 앱 설치 페이지로 연결됩니다.', url:'' },
  lounge:{ ic:'🏆', n:'공식 커뮤니티',  p:'로',   dest:'외부 브라우저 새 탭',
    d:'공지·게시판·영상이 모여 있는 결정의 시대 공식 커뮤니티입니다.',
    note:'가입 후 글쓰기가 가능하며, 커뮤니티에서 바로 게임으로 돌아올 수 있습니다.', url:'' },
};
/* 실제 이동 — 주소가 주입돼 있으면 새 창(_blank)으로 나가고, 데모(주소 없음)에서는 안내로 대체한다. */
function openExternalLink(key){
  const L=EXT_LINKS[key]; if(!L) return false;
  if(L.url && typeof window!=='undefined' && typeof window.open==='function'){
    window.open(L.url, '_blank', 'noopener,noreferrer');
    sysLog(`${L.n}${L.p} 이동했습니다. 게임은 절전 없이 계속 진행됩니다.`);
    return true;
  }
  toast(`${L.n} — 외부로 이동합니다 (데모 빌드에는 연결된 주소가 없습니다)`);
  sysLog(`${L.n}${L.p} 이동을 시도했습니다. 데모 빌드에는 연결된 주소가 없어 게임 화면에 머무릅니다.`);
  return false;
}
/* 외부 링크 안내 패널 — [설명] → [이동 확인] 2단. 인게임 콘텐츠가 아님을 문구로 분명히 한다. */
function extLinkPanel(b, key){
  const L=EXT_LINKS[key]; if(!L) return;
  const body=el('div'); b.appendChild(body);
  function intro(){
    body.innerHTML='';
    body.appendChild(el('div','center',`<div class="ei" style="font-size:46px">${eImg(L.ic,3)}</div><div class="big">${L.n}</div>`));
    body.appendChild(el('div','hint',L.d));
    const row=el('div','pack');
    row.innerHTML=`<div class="pic">🔗</div><div class="info"><div class="t">이동 대상 · ${L.dest}</div><div class="d">${L.note}</div></div>`;
    body.appendChild(row);
    body.appendChild(el('div','hint','이 메뉴는 게임 안의 화면이 아니라 <b>게임 밖 외부 서비스</b>로 이동합니다. 이동해도 방치 전투와 골드 수급은 계속됩니다.'));
    const go=el('button','btn gold wide',`${L.n}${L.p} 이동`); go.style.marginTop='10px';
    go.onclick=()=>confirmStep(); body.appendChild(go);
  }
  function confirmStep(){
    body.innerHTML='';
    body.appendChild(el('div','center',`<div class="ei" style="font-size:40px">${eImg(L.ic,3)}</div>`));
    body.appendChild(el('div','hint',`<b>${L.n}</b>${L.p} 이동하시겠습니까?<br>게임 화면을 벗어납니다 · 이동 위치 <b>${L.dest}</b>`));
    const btns=el('div','optbtns'); btns.style.marginTop='10px';
    const no=el('button','btn sm','취소'); no.onclick=()=>intro();
    const yes=el('button','btn sm gold','이동'); yes.onclick=()=>{ openExternalLink(key); closeModal(); };
    btns.appendChild(no); btns.appendChild(yes); body.appendChild(btns);
  }
  intro();
}
/* ★ N3/§7-9: 절전 오버레이 — 실측 캡처 8장으로 전면 재구성.
   [근거] docs/reference/기능별/02_홈_메인HUD/절전화면/ 5장 + 06_스테이지_던전/보스전 절전/ 3장.
     · 진입 = **좌상단 명패 탭 → 확인 모달 없이 즉시**(캡처 파일명에 대표가 직접 주석).
     · 화면 구성(위→아래) = ① 이름+레벨+경험치바 한 줄  ② 골드·루비 수량(＋/☰ 버튼 없음)
       ③ 배터리 100% + 대형 시계  ④ 4열×3행(12칸) 자원 카운트 그리드
       ⑤ 2분할 카드 '1분당 획득 골드' / '오프라인 골드'+mm:ss 카운트다운
     · **채팅 패널은 절전 중에도 계속 보인다** → 오버레이는 채팅 상단까지만 덮는다(종전엔 전체를 덮어 가렸다).
     · 하단 내비 7메뉴는 사라지고 **모루 아이콘 1개짜리 가로 스와이프 바**로 대체된다.
     · 해제 = 그 모루 바를 **오른쪽으로 스와이프**(종전의 '아무 데나 탭'은 오답이었다).
     · 절전 중에도 골드가 실시간으로 오른다(스샷 4프레임에서 81,864,931→81,886,591 실측) → 1초 주기로 다시 그린다.
   [잔여 ⚠비전미확인 — 촬영대기]
     · '오프라인 골드' 옆 mm:ss 카운트다운이 0에 닿았을 때의 동작(자동 정산/재시작/알림). 감소 중 프레임만 4장 확보.
     · '1분당 획득 골드'와 '오프라인 골드' 두 수치의 산식 차이(보스전에서 49,095 / 48,373 로 서로 달랐다).
     · 12칸 중 6칸(상자 2종·함·주머니·부적·밧줄)의 재화 정체 — 라벨이 화면에 없어 아이콘만으로는 특정 불가.
       현재는 settle(정산 상세) 모달과 **같은 12칸 정본**을 재사용한다(두 화면의 그리드가 동일 구성으로 보인다).
     · 스와이프 해제의 실제 임계 거리·완료 연출. 잠정 60px. */
let PW_OVL=null, PW_BAR=null, PW_TIMER=0;
// 절전 오버레이 본문 — 1초 주기로 다시 그려 골드·시계·카운트다운이 실시간으로 움직인다
function pwBodyHTML(){
  const clock=$('#clock')?$('#clock').textContent:'--:--';
  // ① 이름 + 레벨 + 경험치바
  let p0=null; try{ p0=(typeof party==='function')?(party()[0]||null):null; }catch(e){}
  const nm = p0 ? p0.job.name : (S.name||'군주');
  const lv = p0 ? p0.level : 1;
  const pct = clamp(((S.stats&&S.stats.kills)||0)%100, 0, 100);
  // ⑤ 1분당 획득 골드 — settle 모달과 같은 산식(마을회관·코스튬·칭호 버프 반영)
  const rate = Math.round(18885*(1+((S.villHall||1)-1)*0.0005)*costumeGoldMul()*titleGoldMul());
  // ⚠비전미확인 — 촬영대기: 카운트다운의 의미가 불명이라 '다음 1분 정산까지 남은 시간'으로 표시만 한다(경제 영향 없음).
  const cd = 60 - (Math.floor(S.playSec||0)%60);
  const cells=pwCells();
  const grid=cells.map(([ic,nm2,v])=>`<div class="pw-cell"><span class="pc-ic">${ic}</span><b>${fmt(v||0)}</b></div>`).join('');
  return `<div class="pw-name"><span class="pn-nm">${nm}</span><span class="pn-lv">${lv}LV</span>`+
    `<span class="pn-bar"><i style="width:${pct}%"></i></span><span class="pn-pct">${pct}%</span></div>`+
    `<div class="pw-cur"><span>${eImg("🪙",2)} <b>${fmt(S.gold)}</b></span><span>${eImg("💎",2)} <b>${fmt(S.ruby)}</b></span></div>`+
    `<div class="pw-batline"><span class="pw-bat">🔋 100%</span></div>`+
    `<div class="pw-clock">${clock}</div>`+
    `<div class="pw-grid">${grid}</div>`+
    `<div class="pw-two">`+
      `<div class="pw-card"><div class="pw-cv">${fmt(rate)} G</div><div class="pw-ct">1분당 획득 골드</div></div>`+
      `<div class="pw-card"><div class="pw-cv">${fmt(S.offlinePending||0)} G</div><div class="pw-ct">오프라인 골드 <b>${mmss(cd)}</b></div></div>`+
    `</div>`;
}
/* 12칸 자원 그리드 정본 — settle(정산 상세)과 공유한다.
   ⚠비전미확인: 원작 그리드의 6칸은 아이콘만 있고 라벨이 없어 재화를 특정하지 못했다(촬영대기). */
function pwCells(){
  return [
    ['⬜',   '일반 재료',      matGradeTotal('N')], ['🟦','희귀 재료',    matGradeTotal('R')],
    ['🟪',   '영웅 재료',      matGradeTotal('E')], ['🟨','레전더리 재료', matGradeTotal('L')],
    ['🪨',   '강화석',        S.stones],   ['🎫','입장권',       S.ticket],
    ['🪙',   '회색코인',       S.gray],     ['🏘️','마을재료',     S.villMat],
    ['🎲',   '주사위',        S.dice],     ['🎟️','영웅소환권',   S.tickHero],
    ['🎫',   '재료소환권',     S.tickMat],  ['🪪','골드던전권',   S.goldTicket||0],
  ];
}
function startPowerSave(){
  const home=$('#home'); if(!home) return;
  if(PW_OVL) return;
  const ov=el('div','pw-ovl');
  /* 채팅 패널을 살리기 위해 오버레이 높이를 '채팅 상단'까지로 자른다.
     (측정 불가한 환경에서는 전체를 덮되, 채팅은 z-index 로 위에 남는다) */
  const chat=$('#chat'); const cut=(chat&&chat.offsetTop)|0;
  if(cut>0){ ov.style.height=cut+'px'; } else { ov.style.bottom='0'; }
  ov.innerHTML=pwBodyHTML();
  home.appendChild(ov);
  // 하단: "밀어서 해제" 슬라이더 — 모루 손잡이를 트랙 끝까지 밀면 절전 해제.
  // ★ v5.24: 텍스트 안내만으로는 직관성이 부족해 slide-to-unlock 패턴으로 전면 개편.
  const bar=el('div','pw-swipe');
  bar.innerHTML=`<div class="pw-track">
    <div class="pw-fill"></div>
    <div class="pw-hint"><span class="pw-ar">›</span> 밀어서 해제 <span class="pw-ar">›</span></div>
    <div class="pw-handle">${eImg("⚒️",1.4)}</div>
  </div>`;
  const nav=$('#navbar'); const navH=(nav&&nav.offsetHeight)|0;   // 내비 높이를 그대로 덮어 잔상이 남지 않게 한다
  if(navH>0) bar.style.height=navH+'px';
  home.appendChild(bar);
  PW_OVL=ov; PW_BAR=bar;
  home.classList && home.classList.add('pw-on');
  pwWireSwipe(bar);
  if(typeof setInterval==='function') PW_TIMER=setInterval(()=>{ if(PW_OVL) PW_OVL.innerHTML=pwBodyHTML(); }, 1000);
  toast('절전 모드 — 모루를 오른쪽 끝까지 밀면 해제됩니다');
}
/* 해제 제스처 — 모루 손잡이를 트랙 우측 끝까지 드래그.
   ★ v5.24.1: 임계값 75%→98%로 올려 끝까지 밀어야 해제.
   해제 순간 끝까지 스냅(transition) 후 해제 — 깔끔한 마무리 연출. */
function pwWireSwipe(bar){
  if(!bar || typeof bar.addEventListener!=='function') return;
  const track=bar.querySelector('.pw-track');
  const handle=bar.querySelector('.pw-handle');
  const fill=bar.querySelector('.pw-fill');
  const hint=bar.querySelector('.pw-hint');
  if(!track||!handle) return;
  let x0=null, trackW=0, unlocked=false;
  const THRESHOLD=0.98;  // 끝까지(98%) 밀어야 해제
  const SNAP_MS=200;     // 해제 스냅 지속시간
  const setPct=(p, snap)=>{
    const pct=Math.max(0,Math.min(1,p));
    if(handle){ handle.style.transition = snap ? `left ${SNAP_MS}ms ease-out` : 'none';
      handle.style.left=(pct*(100-42/trackW*100))+'%'; }
    if(fill){ fill.style.transition = snap ? `width ${SNAP_MS}ms ease-out` : 'none';
      fill.style.width=(42+pct*(trackW-42))+'px'; }
    if(hint) hint.style.opacity=String(Math.max(0,0.8-pct*1.2));
  };
  const down=e=>{ if(unlocked) return; x0=(e&&typeof e.clientX==='number')?e.clientX:0; trackW=track.offsetWidth||300;
    if(bar.setPointerCapture&&e&&e.pointerId!=null){ try{ bar.setPointerCapture(e.pointerId); }catch(err){} } };
  const move=e=>{ if(x0==null||trackW<=0||unlocked) return;
    const dx=((e&&typeof e.clientX==='number')?e.clientX:0)-x0;
    const pct=dx/(trackW-42);
    setPct(pct,false);
    if(pct>=THRESHOLD){
      unlocked=true; x0=null;
      setPct(1,true);  // 끝까지 스냅
      setTimeout(()=>endPowerSave(), SNAP_MS);  // 스냅 후 해제
    } };
  const up=()=>{ if(unlocked) return; x0=null; setPct(0,true); };  // 손 떼면 원위치로 (부드럽게)
  bar.addEventListener('pointerdown',down); bar.addEventListener('pointermove',move);
  bar.addEventListener('pointerup',up);     bar.addEventListener('pointercancel',up);
  // 마우스/터치 폴백 (pointerevents 미지원 환경)
  bar.addEventListener('touchstart',e=>{ const t=e&&e.touches&&e.touches[0]; if(t) down({clientX:t.clientX}); });
  bar.addEventListener('touchmove', e=>{ const t=e&&e.touches&&e.touches[0]; if(t) move({clientX:t.clientX}); }, {passive:true});
  bar.addEventListener('touchend',  up);
}
function endPowerSave(){
  if(PW_TIMER && typeof clearInterval==='function'){ clearInterval(PW_TIMER); }
  PW_TIMER=0;
  if(PW_OVL) PW_OVL.remove(); if(PW_BAR) PW_BAR.remove();
  PW_OVL=null; PW_BAR=null;
  const home=$('#home'); if(home&&home.classList) home.classList.remove('pw-on');
  sfx('tap');
}

// ★ B9/G-126: 미수령 1건 이상이면 상단에 [모두 받기] 노출
function giftBox(b, items){
  const pending = items.filter(([id])=>!S.claimed.mail[id]);
  if(pending.length){
    const all=el('button','btn gold wide',`모두 받기 (${pending.length})`); all.style.marginBottom='8px';
    all.onclick=()=>{ let n=0; pending.forEach(([id,t,ic,give])=>{ if(S.claimed.mail[id]) return; give(); S.claimed.mail[id]=true; n++; });
      toast(`우편 ${n}건 일괄 수령`); sysLog(`우편 ${n}건을 모두 수령했습니다.`); openModal('mail'); refreshHUD(); };
    b.appendChild(all);
  }
  items.forEach(([id,t,ic,give])=>{ const done=S.claimed.mail[id]; const row=el('div','pack'); row.innerHTML=`<div class="pic">${ic}</div><div class="info"><div class="t">${t}${done?' ✓':''}</div></div>`;
    const btn=el('button','btn sm'+(done?'':' gold'),done?'수령완료':'받기'); btn.disabled=!!done; btn.onclick=()=>{ if(S.claimed.mail[id])return; give(); S.claimed.mail[id]=true; toast(`${t}`); openModal('mail'); refreshHUD(); }; row.appendChild(btn); b.appendChild(row); });
  if(!pending.length) b.appendChild(el('div','center small mut','새 우편이 없습니다.'));
}
function questList(b){
  b.appendChild(el('div','hint','길잡이 제작 체인. 완료 시 보상.'));
  [['해골 지팡이 제작(무기)','⚒️'],['강철 방어구 세트','🛡️'],['금 반지(희귀) 제작','💍']].forEach(([t,ic])=>{ const row=el('div','pack'); row.innerHTML=`<div class="pic">${ic}</div><div class="info"><div class="t">${t}</div><div class="d">보상: 골드·소환권</div></div>`; const btn=el('button','btn sm gold','바로가기'); btn.onclick=()=>{ closeModal(); openModal('forge'); }; row.appendChild(btn); b.appendChild(row); });
}

/* ------- 편성 배정 ------- */
function assignFormation(slot){
  const owned=ownedHeroes();
  setModalTitle('편성 · 슬롯 '+(slot+1));
  const b=$('#modalBody'); b.innerHTML=''; b.appendChild(el('div','hint','이 슬롯에 배치할 영웅을 선택하세요.'));
  const g=el('div','grid c3'); g.style.marginTop='8px';
  owned.forEach(h=>{ const c=el('div','cell gframe grade-'+h.grade); c.innerHTML=`<div class="ei">${jobIcon(h.job.id)}</div><div class="cn">${h.name}</div>`;
    c.onclick=()=>{ S.formation[slot]=h.hero_id; toast(`${h.name} 배치`); openModal('arena'); }; g.appendChild(c); });   /* ★ B4/G-50: 편성값은 hero_id */
  b.appendChild(g);
  const back=el('button','btn sm','◀ 투기장'); back.style.marginTop='8px'; back.onclick=()=>openModal('arena'); b.appendChild(back);
}

/* ------- 영웅 상세 -------
   ★ B4/G-53: 4탭 [강화][스탯][스킬][각성]. 스탯 탭은 10항목 전부(직업 무관 공격력·마법 공격력 둘 다).
   ★ B4/G-54 (v4.2 A3-2): [강화] 탭 = 영웅별 강화. 원작 재수색으로 확정된 규칙만 반영한다.
      확정 ① 강화 1회당 조각 300개 고정(패널 적색 문구 "*300개의 조각 소모*")
      확정 ② 레전더리 이상 등급만 강화 가능 — 미만이면 [강화] 버튼 비활성
      확정 ③ 효과 문구 = "4강화당 (해당 영웅 스킬명) 발사 횟수 증가" — 영웅마다 스킬명 치환
      확정 ④ 0강화 시 "0회 증가" 표기(4강화 미만 구간은 증가량 0)
      확정 ⑤ 파괴·하락방지 토글 없음 → 확정 성공형(실패 분기 없음)
   인자는 hero_id 를 받는다(구코드 호환을 위해 직업 id 도 heroResolve 로 해석). */
/* ★ A3-2: 강화 1회당 조각 소모량 — 원작 패널 적색 문구로 확정된 300 고정.
   ⚠비전미확인 — 촬영대기: 단계가 오를수록 300이 스케일업하는지(단계별 요구량 표)는 미확인이다.
   현행은 전 단계 300 고정으로 둔다. 확인되면 이 상수를 단계 함수로 바꾸면 된다. */
const HERO_ENH_COST = 300;
/* ★ A3-2: 4강화당 발사 횟수 +N.
   ⚠비전미확인 — 촬영대기: N 값(4강화당 몇 회 증가하는지)과 강화 상한 단계는 원작에서 판독되지 않았다.
   현행값 N=1 · 상한 없음을 그대로 유지한다(칭호 '영웅 +20강화 2명' 조건과의 정합 때문에 상한을 넣지 않는다). */
const HERO_ENH_N = 1;
function heroEnhShots(enh){ return Math.floor(((enh|0)/4)) * HERO_ENH_N; }
/* ★ A3-2: 효과 문구에 치환되는 '해당 영웅 스킬명'.
   ⚠비전미확인 — 촬영대기: 원작이 4스킬 중 어느 슬롯을 가리키는지 미확인. 강화 자격(레전더리)에서
   정확히 해금되는 4번째 스킬(궁극)을 잠정 사용한다. 확정되면 이 함수 한 곳만 바꾸면 된다. */
function heroEnhSkillName(j){ const L=SKILLS[j&&j.id]; return (L && L[3] && L[3][0]) || '스킬'; }
let _heroTab='스탯';
function heroDetail(hidOrJob){
  const key = (hidOrJob && hidOrJob.id) ? hidOrJob.id : hidOrJob;   // 구코드가 JOBS 엔트리를 넘기는 경우 방어
  const e = heroResolve(key);
  if(!e){ toast('영웅을 찾을 수 없습니다.'); openModal('hero'); return; }
  const j=e.job, hid=e.hero_id, G=GRADES[e.grade];
  const st=heroSlot(hid);
  const b=subBody(e.name);   // ★ v5.1 착용창/영웅목록 위 오버레이
  b.appendChild(el('div','center',`<div class="ei" style="font-size:52px">${jobIcon(j.id)}</div>
    <div class="big" style="color:${G.color}">${G.name} · ${e.name}</div>
    <div class="small mut">${j.name} · ${j.el} · ${j.role} · ${j.pos} · 주스탯 ${j.stat}</div>
    <div class="big" style="margin:6px 0">전투력 ${fmt(heroPower({grade:e.grade,level:e.level}))}</div>`));
  const TABS=['강화','스탯','스킬','각성'];
  if(TABS.indexOf(_heroTab)<0) _heroTab='스탯';
  const tabrow=el('div','tabrow');
  const body=el('div');
  TABS.forEach(t=>{ const n=el('div','tab'+(t===_heroTab?' on':''),t);
    n.onclick=()=>{ _heroTab=t; heroDetail(hid); }; tabrow.appendChild(n); });
  b.append(tabrow, body);

  const gm=G.mult, aw=1+S.awaken*0.015, lv=e.level;
  if(_heroTab==='스탯'){
    const rows=[
      ['레벨',            String(lv)],
      ['체력',            fmt(Math.round((800+lv*120)*gm*aw))],
      ['공격력',          fmt(Math.round((150+lv*30)*gm*aw))],
      ['마법 공격력',     fmt(Math.round((140+lv*28)*gm*aw))],
      ['방어력',          fmt(Math.round((100+lv*20)*gm*aw))],
      ['마법 저항력',     fmt(Math.round((90+lv*18)*gm*aw))],
      ['치명타율',        (5+GORDER.indexOf(e.grade)*2.5+lv*0.05).toFixed(1)+'%'],
      ['치명타 피해',     (150+GORDER.indexOf(e.grade)*15+lv*0.4).toFixed(0)+'%'],
      ['공격속도',        (1+GORDER.indexOf(e.grade)*0.08+lv*0.004).toFixed(2)],
      ['이동속도',        (100+GORDER.indexOf(e.grade)*6+lv*0.3).toFixed(0)],
    ];
    rows.forEach(([k,v])=>body.appendChild(el('div','kv',`<span>${k}</span><b>${v}</b>`)));
    const lvCost = lv*80000; const lb=el('button','btn wide',`레벨업 (골드 ${fmt(lvCost)})`); lb.style.marginTop='8px';
    if(S.gold<lvCost) lb.disabled=true;
    lb.onclick=()=>{ if(S.gold<lvCost){ toast('골드 부족'); return; } S.gold-=lvCost; st.level=(st.level||1)+1;
      Battle.refreshParty(); toast(`Lv${st.level}`); heroDetail(hid); refreshHUD(); };
    body.appendChild(lb);
  }
  else if(_heroTab==='스킬'){
    body.appendChild(el('div','small','<b>스킬</b> <span class="mut">(영웅 등급에 따라 해금)</span>'));
    const unlocked=GORDER.indexOf(e.grade)+1;
    SKILLS[j.id].forEach(([nm,desc,cd],i)=>{
      const on=i<unlocked; const sg=GORDER[i]; const SG=GRADES[sg];
      const row=el('div','pack skill-row'); row.style.opacity=on?'1':'.45';
      row.innerHTML=`<div class="sk-badge" style="color:${SG.color};border-color:${SG.color}">${SG.name}</div>
        <div class="pic">${on?'✨':'🔒'}</div>
        <div class="info"><div class="t">${nm} ${i===3?'<span class="small lgd">궁극</span>':''}</div>
        <div class="d">${on?desc:SG.name+' 등급 영웅에서 해금'} · <b>쿨타임 ${cd}초</b></div></div>`;
      body.appendChild(row);
    });
  }
  else if(_heroTab==='강화'){
    const enh=(S.heroEnh&&S.heroEnh[hid])||0;
    const canGrade = GORDER.indexOf(e.grade) >= GORDER.indexOf('L');
    const sh=heroShardAvail(hid), cost=HERO_ENH_COST;   // ★ B7/F1: 전용 조각 + 직업 공용 조각
    body.appendChild(el('div','center',`<div class="big" style="color:${G.color}">${enh}강화</div>`));
    /* ★ A3-2: 효과 문구는 영웅마다 스킬명이 치환된다 — "4강화당 (스킬명) 발사 횟수 증가" (원작 확정).
       0강화 구간은 증가량 0 → "0회 증가"로 표기한다(4강화 미만은 증가 없음). */
    body.appendChild(el('div','kv',`<span>효과</span><b>4강화당 ${heroEnhSkillName(j)} 발사 횟수 증가</b>`));
    body.appendChild(el('div','kv',`<span>현재 효과</span><b>${heroEnhShots(enh)}회 증가</b>`));
    body.appendChild(el('div','kv',`<span>조건</span><b>레전더리 이상의 등급 강화 가능</b>`));
    body.appendChild(el('div','kv',`<span>보유 조각 (전용 ${fmt(heroShardOwn(hid))} + ${j.name} 공용)</span><b>${fmt(sh)}</b>`));
    body.appendChild(el('div','warn',`*${HERO_ENH_COST}개의 조각 소모*`));
    const eb=el('button','btn gold wide','강화'); eb.style.marginTop='8px';
    if(!canGrade || sh<cost) eb.disabled=true;
    eb.onclick=()=>{
      if(!canGrade){ toast('레전더리 이상의 등급만 강화할 수 있습니다.'); return; }
      if(!heroShardSpend(hid,cost)){ toast('조각이 부족합니다.'); return; }
      S.heroEnh[hid]=((S.heroEnh&&S.heroEnh[hid])||0)+1;
      sfx('awaken'); toast(`${e.name} ${S.heroEnh[hid]}강화`); sysLog(`${e.name} <span class="lgd">${S.heroEnh[hid]}강화</span> 달성`);
      heroDetail(hid); refreshHUD();
    };
    body.appendChild(eb);
    if(!canGrade) body.appendChild(el('div','center small mut','⚠ 이 영웅은 레전더리 미만이라 강화할 수 없습니다.'));
  }
  else { // 각성
    body.appendChild(el('div','center',`<div class="big" style="margin:4px 0">계정 각성 +${S.awaken}</div>`));
    body.appendChild(el('div','kv',`<span>최종 최대 체력</span><b>+${(S.awaken*1.5).toFixed(1)}%</b>`));
    body.appendChild(el('div','kv',`<span>최종 공격력·마법 공격력</span><b>+${(S.awaken*1.5).toFixed(1)}%</b>`));
    body.appendChild(el('div','kv',`<span>최종 방어력·마법 저항력</span><b>+${(S.awaken*1.5).toFixed(1)}%</b>`));
    body.appendChild(el('div','small mut center','각성은 계정 전체 영웅에게 동일하게 적용됩니다.'));
    const ab=el('button','btn gold wide','⚡ 각성 화면 열기'); ab.style.marginTop='8px';
    ab.onclick=()=>openModal('awaken'); body.appendChild(ab);
  }

  // 합성(상위 등급 해금) 안내 — 같은 직업의 바로 윗 등급 영웅
  const nextG=GORDER[GORDER.indexOf(e.grade)+1];
  if(nextG){
    const nx=rosterOf(j.id).find(r=>r.grade===nextG && !heroOwned(r.hero_id));
    if(nx){ const need=heroFuseNeed(nx.hero_id), sh=heroShardAvail(nx.hero_id);
      const row=el('div','kv'); row.innerHTML=`<span>${GRADES[nextG].name} 합성 (${nx.name})</span><b>${fmt(sh)} / ${fmt(need)}</b>`; b.appendChild(row);
      const btn=el('button','btn gold wide',`${nx.name} 합성`); btn.style.margin='6px 0';
      if(!heroFuseReady(nx.hero_id)) btn.disabled=true;
      btn.onclick=()=>{ if(heroFuse(nx.hero_id)){ sfx('craft'); toast(`${nx.name} 합성 성공!`);
        sysLog(`${gradeBadge(nextG)} ${nx.name} 합성 성공`); guideCheck('fuse'); heroDetail(nx.hero_id); refreshHUD(); } };
      b.appendChild(btn);
    } else b.appendChild(el('div','center small mut',`${GRADES[nextG].name} 영웅을 모두 보유 중입니다.`));
  } else b.appendChild(el('div','center warn','최고 등급 · 스킬 전부 해금'));

  const back=el('button','btn sm','◀ 영웅 목록'); back.style.marginTop='8px'; back.onclick=()=>openModal('hero'); b.appendChild(back);
}

/* ------- [B3/G-46] 커스텀 확인 오버레이 (네이티브 confirm 대체) ------- */
function showConfirmDialog(opt){
  const root=$('#modal-root');
  if(!root){ if(opt.onYes) opt.onYes(); return; }
  root.querySelectorAll('.b3-ovl').forEach(n=>n.remove());
  const ov=el('div','b2-ovl b3-ovl'), pop=el('div','b2-pop');
  pop.style.position='relative';
  const close=()=>ov.remove();
  const x=el('div','b3-x','✕'); x.onclick=close; pop.appendChild(x);
  pop.appendChild(el('div','b2-head',opt.title||'확인'));
  if(opt.warn) pop.appendChild(el('div','b2-warnline',opt.warn));
  pop.appendChild(el('div','center',opt.msg||''));
  const row=el('div','btnrow'); row.style.marginTop='10px';
  const yes=el('button','btn gold',opt.yes||'확인'); yes.onclick=()=>{ close(); if(opt.onYes) opt.onYes(); };
  const no=el('button','btn',opt.no||'취소'); no.onclick=close;
  row.append(yes,no); pop.appendChild(row);
  ov.appendChild(pop); ov.onclick=ev=>{ if(ev.target===ov) close(); };
  root.appendChild(ov);
}

/* ------- 장비 상세 (장착→파괴 확인 플로우) -------
   ★ B3/G-38: SLOT_STAT_SCHEMA 로 부위별 옵션 종류·개수 분기 (방패는 특수문구 추가) */
let _itemDetailHeroId=null;
function itemDetail(e, heroId){ _itemDetailHeroId=heroId||null;
  const b=subBody('장비 상세');   // ★ v5.1 착용창 위 오버레이
  const G=GRADES[e.grade];
  const sc=slotSchema(e.slot);
  const opts=sc.stats.map(k=>statLine(k,e.enh,G.mult)).filter(Boolean);
  const card=el('div','item-card grade-'+e.grade); card.style.setProperty('--gc',G.color);
  card.innerHTML=`<div class="ic-head"><div class="ic-ico grade-${e.grade}" style="--gc:${G.color}">${equipImg(e.slot,2)}</div>
    <div><div style="color:${G.color};font-weight:800">${G.name} ${e.slot} +${e.enh}</div><div class="small mut">부위: ${sc.part}${e.equipped?' · 장착 중':''}</div></div></div>`
    + opts.map(o=>`<div class="ic-opt opt-row"><span>${o.n}</span><span class="v">${o.v}</span></div>`).join('')
    + (sc.special?`<div class="ic-opt opt-sp">${sc.special}</div>`:'');
  b.appendChild(card);
  b.appendChild(el('div','small mut center',itemFlavor(e.slot)));
  b.appendChild(el('div','warn','⚠ *장착시 기존 아이템이 파괴됩니다.*'));
  const row=el('div','btnrow'); row.style.marginTop='8px';
  const eq=el('button','btn gold wide', e.equipped?'장착됨':'장착');
  eq.onclick=()=>{ if(e.equipped){ toast('이미 장착됨'); return; }
    /* ★ v5.81: 영웅 귀속 없는 착용 방지 — 인벤토리에서 heroId 없이 착용하면
       모든 영웅에게 적용되는 버그. 영웅 선택창(equip 모달)을 먼저 열도록 유도. */
    if(!_itemDetailHeroId){ toast('영웅 착용창에서 장비를 장착해 주세요'); openModal('equip'); return; }
    showConfirmDialog({ title:'장착', warn:'*장착시 기존 아이템이 파괴됩니다.*', msg:'장착 하시겠습니까?', yes:'장착', no:'취소',
      onYes:()=>{
        /* ★ v5.71→v5.81: 원작처럼 착용 시 같은 부위 기존 장비는 파괴(삭제).
           ★ v5.81: 부위 매칭을 slotSchema(부위 추출) 기준으로 통일.
           종전엔 x.slot===e.slot 정확매칭이라 '흑철 대검'↔'용암 소드'가
           같은 무기 부위인데도 파괴되지 않았음. findEq의 부분매칭과 통일. */
        const newPart = slotSchema(e.slot).part;
        const before = S.equips.length;
        S.equips = S.equips.filter(x=>{
          if(x===e) return true;  /* 새로 착용할 장비는 유지 */
          if(x.equipped && (!x.heroId || x.heroId===_itemDetailHeroId) && slotSchema(x.slot).part===newPart){
            return false;  /* 같은 영웅 같은 부위 착용 중 → 파괴 */
          }
          return true;
        });
        e.equipped=true;
        e.heroId=_itemDetailHeroId;
        toast(`${G.name} ${e.slot} 장착` + (S.equips.length<before ? ' · 기존 장비 파괴' : ''));
        sfx('tap');
        Battle.refreshParty(); openModal('equip', _itemDetailHeroId); refreshHUD(); } }); };
  const enh=el('button','btn wide','강화'); enh.onclick=()=>openEnhance(e);
  row.append(eq,enh); b.appendChild(row);
  const back=el('button','btn sm','◀ 장비 착용창'); back.style.marginTop='8px'; back.onclick=()=>openModal('equip'); b.appendChild(back);
}

/* ------- 장비 강화 (골드 + 강화석) -------
   ★ B3/G-39: 보호 토글 2종(파괴 보호 / 하락 방지)을 강화 레벨과 무관하게 상시 노출
   ★ B3/G-40: 패널 상단 3행 상시 카운터 (강화석 / 파괴방지 / 하락방지)
   ★ B3/G-41: 파괴 보호 비용 등급 분기 — N 일반망치5 / R 일반망치10 / E 전설망치5 / L 전설망치10 */
function openEnhance(e){
  const b=subBody('강화');   // ★ v5.1 착용창 위 오버레이
  b.appendChild(el('div','center',`<div class="ei" style="font-size:52px">${equipImg(e.slot,2.5)}</div><div class="big" style="color:${GRADES[e.grade].color}">${GRADES[e.grade].name} ${e.slot} +${e.enh}</div>`));
  const p = e.enh<5?0.95:e.enh<10?0.82:e.enh<15?0.63:0.44;
  const cost = [50000,300000,1500000,6000000][Math.min(3,Math.floor(e.enh/5))];
  const stoneCost = 1+Math.floor(e.enh/5);
  const prot = PROTECT_COST[e.grade] || PROTECT_COST.N;
  const protHave = ()=> (prot.cur==='hammerN' ? (S.hammerN||0) : (S.hammers||0));
  // 상단 3행 상시 카운터
  const cnt=el('div','enh-counters');
  [['🪨','강화석',fmt(S.stones)],
   ['🔨','파괴방지 ('+prot.label+')',fmt(protHave())],
   ['🔮','하락방지',fmt(S.wards||0)]].forEach(([ic,nm,v])=>{
    const r=el('div','enh-cnt'); r.innerHTML=`<span class="ci">${eImg(ic,1.5)}</span><span class="cl">${nm}</span><b class="cv">${v}</b>`; cnt.appendChild(r); });
  b.appendChild(cnt);
  b.appendChild(el('div','stat-line',`<span>성공 확률</span><span class="v" style="color:#5ecb6a">${Math.round(p*100)}%</span>`));
  b.appendChild(el('div','stat-line',`<span>강화 비용</span><span class="v" style="color:#f0cd82">골드 ${fmt(cost)} · 강화석 ${stoneCost}</span>`));
  b.appendChild(el('div','warn','⚠ 실패 시 단계 하락 · +11 이상은 장비 파괴 위험'));
  // 보호 토글 2종 — 강화 레벨 무관 상시 노출
  let useHammer=false, useWard=false;
  const hr=el('div','pack'); hr.innerHTML=`<div class="pic">${eImg("🔨",2)}</div><div class="info"><div class="t">파괴 보호</div><div class="d">실패 파괴 시 ${prot.label} ${prot.n}개 소모로 방지 · 보유 ${fmt(protHave())}</div></div>`;
  const ht=el('button','btn sm','OFF'); ht.onclick=()=>{ if(protHave()<prot.n){ toast(`${prot.label} 부족 (${prot.n}개 필요)`); return; }
    useHammer=!useHammer; ht.textContent=useHammer?'ON':'OFF'; ht.classList.toggle('gold',useHammer); };
  hr.appendChild(ht); b.appendChild(hr);
  const wr=el('div','pack'); wr.innerHTML=`<div class="pic">${eImg("🔮",2)}</div><div class="info"><div class="t">하락 방지</div><div class="d">실패 시 강화 단계 하락을 막습니다 · 1개 소모 · 보유 ${fmt(S.wards||0)}</div></div>`;
  const wt=el('button','btn sm','OFF'); wt.onclick=()=>{ if((S.wards||0)<=0){ toast('하락 방지권이 없습니다.'); return; }
    useWard=!useWard; wt.textContent=useWard?'ON':'OFF'; wt.classList.toggle('gold',useWard); };
  wr.appendChild(wt); b.appendChild(wr);
  const btn=el('button','btn gold wide','강화'); btn.style.marginTop='8px'; if(S.gold<cost||S.stones<stoneCost||e.enh>=20) btn.disabled=true;
  btn.onclick=()=>{ if(S.gold<cost||S.stones<stoneCost){toast('재화 부족');return;} S.gold-=cost; S.stones-=stoneCost;
    if(Math.random()<p){ e.enh++; sfx('craft'); toast(`강화 성공 +${e.enh}`); sysLog(`장비 강화 <span class="rar">+${e.enh}</span> 성공`); }
    else { sfx('fail');
      if(e.enh>=11 && Math.random()<0.5){
        if(useHammer && protHave()>=prot.n){
          if(prot.cur==='hammerN') S.hammerN-=prot.n; else S.hammers-=prot.n;
          toast(`강화 실패 · ${prot.label} ${prot.n} 소모로 파괴 방지`);
        }
        else { S.equips=S.equips.filter(x=>x!==e); toast('강화 실패 · 장비 파괴…'); Battle.refreshParty(); openModal('inventory'); refreshHUD(); return; }
      } else {
        if(useWard && (S.wards||0)>0){ S.wards--; toast('강화 실패 · 하락 방지권으로 단계 유지'); }
        else { e.enh=Math.max(0,e.enh-1); toast('강화 실패 · 단계 하락'); }
      } }
    Battle.refreshParty(); openEnhance(e); refreshHUD(); };
  b.appendChild(btn);
  const back=el('button','btn sm','◀ 인벤토리'); back.style.marginTop='8px'; back.onclick=()=>openModal('inventory'); b.appendChild(back);
}

/* ------- 제작 결과 ------- */
/* ★ N3: 제작 성공 스트릭 칭호(숙련·행운·신의 손)의 원작 조건 부기 '(해골 장비 제외)' 실집계용 판정.
   화신의 제작 목록에는 현재 해골 계열 장비가 없어 상시 false 지만, 규칙을 코드에 고정해 둔다. */
function isSkullGear(c){
  const nm = String((c&&(c.slot||c.name))||'');
  return /해골|백골/.test(nm);
}
// forceSuccess=true 이면 확정제작 — 성공 100% 보장 + 남은 시간 스킵 (G-29)
function resolveCraft(forceSuccess){
  if(!S.craft) return; const c=S.craft;
  const ok = forceSuccess ? true : (Math.random()<c.p0);
  S.stats.crafts++; sfx(ok?'craft':'fail');
  const grade=c.grade, slot=c.slot||'장비', cat=c.cat||'무기', ic=c.ic||'⚔️', recipe=c.recipe||[];
  /* ★ F2 → N3 갱신: 제작 계열 칭호는 누적이 아니라 '연속(스트릭)' 조건이다.
     · 실패 스트릭 5/7/10/15 → 제작 시간 단축 칭호
     · '영웅 등급 이상' 장비 제작 성공 스트릭 5/10/15 → 제작 확률 칭호
       ★ N3 실측: 원작 조건문 3종(숙련·행운·신의 손) 모두 끝에 **'(해골 장비 제외)'** 부기가 붙는다.
         화신에는 현재 해골 계열 제작 장비가 없어 실제 제외 대상이 0건이지만, 규칙이 문구로만 남으면
         나중에 해골 장비를 추가했을 때 조용히 어긋난다 → isSkullGear() 로 집계에서 실제로 뺀다.
         (제외 대상은 성공 스트릭을 **올리지도 끊지도 않는다** — 영웅등급 미만 제작과 같은 취급) */
  {
    const st=S.stats, heroic = GORDER.indexOf(grade) >= GORDER.indexOf('E') && !isSkullGear(c);
    if(ok){
      st.craftFail=0;
      if(heroic){ st.craftWin=(st.craftWin||0)+1; st.craftWinBest=Math.max(st.craftWinBest||0, st.craftWin); }
    } else {
      st.craftWin=0;
      st.craftFail=(st.craftFail||0)+1; st.craftFailBest=Math.max(st.craftFailBest||0, st.craftFail);
    }
  }
  S.craft=null;
  if(ok){ S.equips.push({ grade, slot, enh:0, equipped:false }); sysLog(`${gradeBadge(grade)} ${slot} 제작 성공`); Battle.refreshParty(); guideCheck('craft',{grade,cat,slot}); }
  else { recipe.forEach(r=>matGain(r.k, Math.max(1,Math.floor(r.need*0.9)))); }
  refreshHUD();
  // 제작 결과 팝업 (G-30: 성공 시 '제작 성공' 타이틀 + 상단 '확인' 헤더바 + 부위 아이콘 + 플레이버)
  const G=GRADES[grade]; const b=subBody(ok?'제작 성공':'제작 결과');   // ★ v5.1 대장간 위 오버레이
  b.appendChild(el('div','b2-head','확인'));
  if(ok) b.appendChild(el('div','result-card',`<div class="rc-icon grade-${grade}" style="color:${G.color}">${eImg(ic,3)}</div><div class="rc-title win" style="color:${G.color};font-size:20px">${G.name} ${slot}</div><div class="small mut">${itemFlavor(slot)}</div><div class="small mut">인벤토리에 추가되었습니다.</div>`));
  else b.appendChild(el('div','result-card',`<div class="rc-icon">💥</div><div class="rc-title lose">제작 실패</div><div class="small mut">재료 90% 환급 · 다시 도전하세요</div>`));
  const btn=el('button','btn gold wide','확인'); btn.style.marginTop='10px'; btn.onclick=()=>openModal('forge'); b.appendChild(btn);
  $('#modal-root').classList.add('on'); currentModal='craftResult';
}
/* ★ v5.58: 제작 완성 시 중앙 강제 팝업 (원작: 완성되면 알림 팝업이 중앙에 뜸). */
/* ★ v5.62: 제작 완료 시 자동 성공/실패 판정 + 강제 팝업.
   시간이 완료되면 곧바로 확률 판정 → 성공 시 인벤토리 자동 추가.
   팝업은 결과만 보여주고 확인 버튼으로 닫음. */
function craftAutoCheck(){
  if(S.craft && Date.now()>=S.craft.endAt && !S.craft._notified){
    S.craft._notified=true;
    const c=S.craft;
    /* 즉시 성공/실패 판정 */
    const p0 = c.p0 || CRAFT[c.grade].p0;
    const success = Math.random() < p0;
    if(success){
      S.equips.push({ grade:c.grade, slot:c.slot, enh:0, equipped:false });
      sysLog(`${gradeBadge(c.grade)} ${c.slot} 제작 성공`);
    } else {
      const refund = Math.floor(CRAFT[c.grade].mat * 0.9);
      for(let r=0;r<refund;r++) matGainGrade(c.grade, 1);
      sysLog(`${c.slot} 제작 실패 · 재료 90% 환급`);
    }
    S.stats.crafts++; guideCheck('craft',{grade:c.grade,cat:c.cat,slot:c.slot});
    const wasSuccess = success;
    S.craft=null; refreshHUD();
    /* 강제 결과 팝업 */
    setModalTitle(wasSuccess ? '제작 성공!' : '제작 실패');
    const b=$('#modalBody'); b.innerHTML='';
    if(wasSuccess){
      b.appendChild(el('div','center',`<div class="ei" style="font-size:52px">${eImg(c.ic,3)}</div>
        <div class="big" style="margin:8px 0;color:${GRADES[c.grade].color}">${GRADES[c.grade].name} ${c.slot}</div>
        <div class="small" style="color:var(--ok)">인벤토리에 추가되었습니다.</div>`));
      sfx('win');
    } else {
      b.appendChild(el('div','center',`<div class="ei" style="font-size:48px;opacity:.5">${eImg(c.ic,3)}</div>
        <div class="big" style="margin:8px 0;color:var(--bad)">제작 실패</div>
        <div class="small mut">재료 90% 환급되었습니다.</div>`));
      sfx('fail');
    }
    const btn=el('button','btn gold wide','확인');
    btn.style.marginTop='12px';
    btn.onclick=()=>{ closeModal(); };
    b.appendChild(btn);
    $('#modal-root').classList.add('on'); currentModal='craftDone';
  }
}

/* ------- 소환 ------- */
/* ★ B4/G-50: 조각은 여전히 '직업' 단위로 누적되고, 20개를 넘으면 해당 직업의
   N등급 영웅(HERO_001~005)이 자동 해금된다. 상위 등급은 [영웅] 카드의 [합성]으로만 해금. */
function summonRun(count, fixJob){
  S.stats.summons++; const gained={}; let legend=false;
  for(let i=0;i<count;i++){ const j = fixJob ? fixJob : pick(JOBS).id;
    S.summonFail=(S.summonFail||0)+1;
    let p=0.01; if(S.summonFail>=70) p=1; else if(S.summonFail>=40) p=0.01+(S.summonFail-40)*0.02; // 소프트 40 / 하드 70
    const r=Math.random(); let amt=1;
    if(r<p){ legend=true; amt=3; S.summonFail=0; } else if(r<0.12){ amt=2; }
    S.shards[j]=(S.shards[j]||0)+amt; gained[j]=(gained[j]||0)+amt; }
  const unlocked=[];
  for(const cid in gained){
    const base=rosterOf(cid)[0];   // 해당 직업의 N등급 영웅
    if(base && !heroOwned(base.hero_id) && (S.shards[cid]||0)>=HERO_SHARD_NEED.N){
      const st=heroSlot(base.hero_id); st.own=true; st.level=st.level||1; unlocked.push(base);
    }
  }
  Battle.refreshParty(); tutEvent('hsum'); return { gained, legend, unlocked };
}
/* ★ v5.4: 등급 공용풀 폐지(v4.3) 잔재 — `S.mats[g]++` (g='N'/'R'/'E') 로 적재하고 있었다.
   matAvail/matSpend 는 실제 재료명 키만 인식하므로, 이렇게 쌓인 값은 대장간에서 조회도 소비도 안 된다.
   튜토리얼 STEP6 이 직접 가르치는 '재료 소환'이 정작 쓸 수 있는 결과를 안 만들던 셈이다.
   (사냥 드랍·요일던전·시련의 탑에 이어 같은 계열 다섯 번째 잔재) */
function matSummon(n){ n=n||20; const got={}, list=[];
  for(let i=0;i<n;i++){ const g=pick(['N','N','R','R','E']); const m=matGainGrade(g,1);
    const k=m?m.k:g; got[k]=(got[k]||0)+1; list.push({ k, g }); }   // 상자를 열면 실제 재료가 나오도록 키까지 전달
  tutEvent('msum'); return { mats:got, list }; }
function playSummon(res){
  const fx=$('#summon-fx'), rc=$('#runeCircle'); rc.textContent = res.legend?'🌟':'✨'; fx.classList.toggle('legend', !!res.legend); fx.classList.add('on'); sfx(res.legend?'legendary':'summon');
  setTimeout(()=>{ fx.classList.remove('on');
    setModalTitle('소환 결과'); const b=$('#modalBody'); b.innerHTML='';
    if(res.mats){
      b.appendChild(el('div','center small mut','상자를 열어 재료를 확인하세요 (탭 또는 모두 열기)'));
      // ★ v4.7: 원작 재료 소환 결과는 4열×5행=20. 영웅 조각 결과(G-60)만 4열로 고치고 여기엔 미적용이었다.
      const g=el('div','grid'); g.style.gridTemplateColumns='repeat(4,1fr)'; g.style.gap='5px'; g.style.marginTop='8px';
      // ★ v5.4: 상자를 열면 등급 색 사각형이 아니라 **실제로 받은 재료**가 나온다(원작도 아이템 아이콘).
      const openOne=(c,i)=>{ if(c.dataset.open) return; setTimeout(()=>{ const gr=c.dataset.g, mk=c.dataset.k; c.dataset.open='1';
        c.className='cell gframe grade-'+gr; c.style.aspectRatio='1';
        c.innerHTML=`<div class="ei" style="font-size:20px">${matIcon(mk)}</div><div class="cn" style="font-size:7.5px">${mk}</div>`;
        sfx('tap'); }, i*35); };
      const cells=(res.list||[]).map(it=>{ const gr=(it&&it.g)||it, mk=(it&&it.k)||it;
        const c=el('div','cell gframe'); c.style.aspectRatio='1'; c.innerHTML='<div class="ei" style="font-size:22px">'+eImg('📦',1.8)+'</div>';
        c.dataset.g=gr; c.dataset.k=mk; c.onclick=()=>openOne(c,0); g.appendChild(c); return c; });
      b.appendChild(g);
      const allBtn=el('button','btn gold wide','모두 열기'); allBtn.style.marginTop='10px'; allBtn.onclick=()=>{ cells.forEach(openOne); allBtn.disabled=true; }; b.appendChild(allBtn);
    }
    else {
      if(res.legend) b.appendChild(el('div','center legend-burst',`<div class="ei" style="font-size:56px">🌟</div><div class="big lgd">레전더리 조각 획득!</div>`));
      // ★ B4/G-60: 결과 그리드 5열 → 4열 (X20 = 4열 × 5행)
      const g=el('div','grid'); g.style.gridTemplateColumns='repeat(4,1fr)'; g.style.marginTop='8px';
      for(const id in res.gained){ const j=JOBS.find(x=>x.id===id)||JOBS[0];
        const best=classBest(id); const gr=best?best.grade:'N';
        const c=el('div','cell gframe grade-'+gr);
        c.innerHTML=`<div class="ei">${jobIcon(j.id)}</div><div class="cn">${j.name}<br>조각 ×${res.gained[id]}</div>`; g.appendChild(c); }
      b.appendChild(g);
    }
    const btn=el('button','btn gold wide','확인'); btn.style.marginTop='10px'; btn.onclick=()=>openModal('summon'); b.appendChild(btn);
    $('#modal-root').classList.add('on'); if(res.legend) sysLog('<span class="lgd">레전더리</span> 조각 소환 성공!');
    // ★ B4/G-59: 2단계 연출 — 마법진 종료 후 '영웅 등장' 화면을 띄운다.
    //   신규 해금 영웅이 있으면 그 영웅을, 없으면(레전더리 대박 시) 최다 획득 직업의 대표 영웅을 보여준다.
    if(res.gained){
      let list = res.unlocked || [];
      if(!list.length && res.legend){
        const top=Object.keys(res.gained).sort((a,b)=>res.gained[b]-res.gained[a])[0];
        const rep=classBest(top) || rosterOf(top)[0];
        if(rep) list=[rep];
      }
      if(list.length) heroRevealFx(list, res.gained);
    }
  }, 1400);
}
/* ★ B4/G-59: 영웅 등장 연출 — 중앙상단 `조각 X N` 라벨 + 대형 영웅 + 하단 이름 플레이트 + [확인] */
function heroRevealFx(list, gained){
  let i=0;
  (function next(){
    if(i>=list.length) return;
    const r=list[i++]; const e=heroEntry(r.hero_id); const G=GRADES[r.grade];
    b2Overlay('영웅 등장',(bd,close)=>{
      bd.appendChild(el('div','center hr-shard',`조각 X ${fmt((gained&&gained[r.class_id])||0)}`));
      bd.appendChild(el('div','hr-art',jobIcon(e.job.id)));
      bd.appendChild(el('div','hr-plate',`<b style="color:${G.color}">${G.name}</b> ${e.name}<div class="small mut">${e.job.name}</div>`));
      const ok=el('button','btn gold wide','확인'); ok.onclick=()=>{ close(); next(); };
      bd.appendChild(ok);
    });
    sfx('legendary'); sysLog(`${gradeBadge(r.grade)} ${r.name} 획득!`);
  })();
}

/* ------- 투기장 전투 (기여도% 포함) ------- */
// ★ 투기장(원작): 콜로세움에서 상대 소환수 4마리와 실전 전투 → WIN/Loss(변경 전→후) → 3초 후 자동 연전
/* ★ v5.5: 원작 투기장 매치 제한시간은 2:00 이다(전량판독 159행, 01:58→01:49 직접 관찰).
   우리는 20 초로 1/6 이었고, 짧게 잡은 결재 근거가 기획서 어디에도 없었다.
   제한시간은 '상한'이라 승부가 나면 그 전에 끝난다 — 늘려도 매 판이 2분이 되지는 않는다. */
const ARENA_DUR = 120;   // 1매치 제한 시간(초) — 헤더 mm:ss 와 동일 소스
/* ★ B6/G-88·G-90: 랭킹 리스트 행 생성. 내 순위가 5위 이내로 올라와도 NPC 와 순위가 겹치지 않게 민다.
   ★ N2/G-93: 돋보기(유저 정보) 팝업이 요구하는 필드(길드·서버·ID)를 행에 같이 실어 보낸다.
     원작 ID 는 ISO 타임스탬프 문자열(예: 2026-05-02T23:40:25.551Z)이라 계정 생성 시각으로 읽힌다 →
     NPC 는 고정 시드로 생성해 화면을 다시 그려도 같은 ID 가 나오게 한다(랜덤 금지). */
const ARENA_NPC = [
  ['불철',   1088140, '강철결의',     '2026-05-02T23:40:25.551Z'],
  ['무쇠손',   16430, '불의 형제단',  '2026-05-11T08:12:44.907Z'],
  ['잿불',     14150, '잿빛동맹',     '2026-05-19T14:03:02.118Z'],
  ['강철심',   12040, '용광로기사단', '2026-06-01T21:55:37.640Z'],
  ['청염',      7430, '새벽의 인장',  '2026-06-14T05:27:19.283Z'],
];
function arenaRankRows(){
  const my=Math.max(1,(S.arenaRank|0)||1);
  const sv=(S && S.server) || '화로 1서버';
  const rows=[]; let rk=0;
  ARENA_NPC.forEach(([nm,sc,gd,uid])=>{ rk++; if(rk===my) rk++;
    rows.push({rk, nm, sc, gd, uid, sv, raid:(rk%2===1)}); });   // raid = '약탈 활성화' 상태 태그
  rows.push({rk:my, nm:S.name, sc:S.arenaPts, me:true, gd:(S.guildName||'무소속'), sv,
             uid:'ME-'+String(S.name||'군주'), raid:!!S.raidOn});
  return rows.sort((a,b)=>a.rk-b.rk);
}
/* ★ N2/G-93: 돋보기 활성화 판정 — 활성 대상은 uid 로 기억한다(순위가 바뀌어도 같은 유저를 가리키도록). */
function arenaPeekIs(r){ return !!(r && MODALS.arena && MODALS.arena._peek===r.uid); }
/* ★ N2/G-93: '유저 정보' 팝업 — 닉네임(대) / 길드 / 서버 / 상태 태그(적색) / ID + 복사 버튼.
   ⚠비전미확인: 상태 태그 원문은 저해상도로 앞 두 글자가 흐리다. 게임 내 기존 용어(약탈 활성화, G-115)와
   일치하는 쪽으로 읽어 '약탈 활성화'로 둔다 — 확정 스샷 확보 시 이 문자열만 교체하면 된다. */
function arenaUserInfo(r){
  b2Overlay('유저 정보',(bd,close)=>{
    bd.appendChild(el('div','ui-name', r.nm));
    const mid=el('div','ui-mid');
    mid.innerHTML=`<div class="ui-gd">길드 : ${r.gd||'무소속'}</div>
      <div class="ui-right"><div class="ui-sv">서버 : ${r.sv||''}</div>${r.raid?'<div class="ui-tag">약탈 활성화</div>':''}</div>`;
    bd.appendChild(mid);
    const idr=el('div','ui-id');
    idr.innerHTML=`<span>ID : ${r.uid}</span>`;
    const cp=el('div','ui-copy','📋');
    cp.onclick=()=>{ try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(r.uid)); }catch(e){}
      sfx('tap'); toast('ID를 복사했습니다.'); };
    idr.appendChild(cp); bd.appendChild(idr);
    const row=el('div','btnrow'); row.style.marginTop='10px';
    const ok=el('button','btn gold wide','확인'); ok.onclick=close; row.appendChild(ok); bd.appendChild(row);
  });
}
/* ★ N2: '랭킹은 매주 월요일 12시에 초기화 됩니다.'(원작 ⓘ) — 주간 리셋 스케줄러.
   길드 랭킹 리셋(월요일 오전 11시)과는 시각이 다르므로 별개로 둔다.
   주차 키는 '직전 월요일 12:00' 시각으로 만든다 → 그 경계를 넘긴 첫 진입에서 1회만 초기화된다. */
function arenaWeekKey(d){
  const t = new Date(d||Date.now());
  const back = (t.getDay()+6)%7;                 // 월요일까지 거슬러 올라갈 일수
  const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate()-back, 12, 0, 0, 0);
  if(t.getTime() < mon.getTime()) mon.setDate(mon.getDate()-7);   // 월요일 12시 이전이면 지난 주차
  return mon.getFullYear()+'-'+(mon.getMonth()+1)+'-'+mon.getDate();
}
function arenaWeekRoll(){
  const k=arenaWeekKey();
  if(!S.arenaWeek){ S.arenaWeek=k; return false; }   // 구세이브·첫 진입은 현재 주차로 봉인(즉시 초기화 금지)
  if(S.arenaWeek===k) return false;
  S.arenaWeek=k;
  S.arenaPts=0; S.arenaTier=arenaTierOf(0); S.arenaStreak=0; S.arenaRank=ARENA_RANK_RESET;
  if(S.arenaSession) { S.arenaSession.w=0; S.arenaSession.l=0; }
  toast('투기장 랭킹이 초기화되었습니다.');
  return true;
}
/* ★ B6/G-87: 대전 화면 DOM 3분할 헤더 — 좌(내 닉/내 점수 2줄) · 중앙(대형 mm:ss) · 우(상대 닉/상대 티어 2줄).
   §4-3 판정에 따라 '내 티어'는 헤더에 넣지 않는다(티어는 정보패널·결과창에만). */
let _arHeadT=null;
function arenaHeadShow(foeName, foeTier){
  arenaHeadHide();
  const wrap=$('#stage-wrap'); if(!wrap) return;
  wrap.classList.add('arena-on');
  const h=el('div','ar-head'); h.id='ar-head';
  h.innerHTML=`<div class="ah-side"><div class="ah-nm">${S.name}</div><div class="ah-sc">${fmtFull(S.arenaPts)}점</div></div>
    <div class="ah-time" id="arHeadT">${mmss(ARENA_DUR)}</div>
    <div class="ah-side r"><div class="ah-nm">${foeName}</div><div class="ah-tier">${foeTier}</div></div>`;
  wrap.appendChild(h);
  const endAt=Date.now()+ARENA_DUR*1000;
  _arHeadT=setInterval(()=>{
    const t=$('#arHeadT'); if(!t){ arenaHeadHide(); return; }
    const s=Math.max(0,Math.ceil((endAt-Date.now())/1000));
    t.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, 200);
}
function arenaHeadHide(){
  if(_arHeadT){ clearInterval(_arHeadT); _arHeadT=null; }
  const wrap=$('#stage-wrap'); if(wrap) wrap.classList.remove('arena-on');
  const h=$('#ar-head'); if(h) h.remove();
}
function arenaFight(){
  if(Battle.inDungeon && Battle.inDungeon()){ toast('전투 진행 중'); return; }
  /* ★ N2: 매칭 기준 전투력을 '보유 전체(totalCP)'에서 '실제 출전하는 PVP 4인'으로 바꾼다.
     원작 투기장은 상대의 4인 편성과 겨루는데, 종전 기준은 보유 영웅이 늘수록 상대만 강해져
     (출전 전투력은 그대로인데 foeCP 만 커져) 로스터가 넓은 계정이 구조적으로 불리했다.
     '모든 데미지 50% 감소'가 들어가면 이 왜곡이 그대로 승률 붕괴로 이어지므로 같이 바로잡는다.
     편성이 비어 있는 예외 상황에서만 종전대로 totalCP() 를 쓴다. */
  const p=arenaParty();
  const myCP=p.length ? Math.max(1, p.reduce((a,h)=>a+heroPower(h),0)) : totalCP();
  const foeCP=Math.round(myCP*rnd(0.7,1.25)); const foeName=pick(CHAT_NAMES);
  const foeTier=TIERS[clamp(S.arenaTier+ri(-1,1),0,TIERS.length-1)];   // 매칭은 ±1단차 이내
  closeModal(); sysLog(`투기장 매칭 · vs ${foeName}`);
  if(Battle.setPartySource) Battle.setPartySource(arenaParty);   // ★ G-81: 투기장만 4인 출전
  /* ★ N2: dmgMul — 원작 ⓘ '투기장에선 모든 데미지가 50% 감소 됩니다.'
     양쪽 피해량만 절반이 되고 제한시간·몹 수·승패 판정(±100점)은 그대로다. */
  Battle.startDungeon({ name:`투기장 · vs ${foeName}`, col:'#c8324b', foeCP, kind:'mobs', count:4, dur:ARENA_DUR,
    dmgMul:ARENA_DMG_MUL,
    onEnd:(win)=>arenaResult(win, foeName, foeCP, foeTier) });
  arenaHeadShow(foeName, foeTier);
}
function arenaResult(win, foeName, foeCP, foeTier){
  arenaHeadHide();
  if(Battle.setPartySource) Battle.setPartySource(null);          // ★ G-81: 타 콘텐츠는 3인으로 복귀
  const before={pts:S.arenaPts, tier:S.arenaTier, streak:S.arenaStreak, rank:S.arenaRank};
  /* ★ v4.5 (대표 결정): 결과창 배너를 '연승/연패 스트릭'으로 한다.
       연승 중이면 승이 쌓이고(4연승 → 4승 0패), 연패 중이면 패가 쌓인다(2연패 → 0승 2패).
       흐름이 바뀌는 순간 반대쪽은 0으로 리셋된다.

     ※ 원작은 이렇게 동작하지 않는다 — 결과창 배너를 5배 확대해 판독한 결과
       2·3·4연승 판이 전부 `1승 0패`였고 패배 판만 `0승 1패`였다(누적도 스트릭도 아닌
       '이번 판 결과'만 표시. 입장권 1개=1판이라 매 판 초기화되는 것으로 보인다).
       근거: 07_투기장_PvP/20260728_투기장연승후패배 결과창 4장.
       정보량이 더 낫다는 대표 판단으로 의도적으로 원작과 다르게 간다. */
  if(!S.arenaSession || typeof S.arenaSession!=='object') S.arenaSession={w:0,l:0,t:0};
  S.arenaSession.t=Date.now();
  /* ★ v4.4: 원작 연승 보너스 확정 — 대표가 4연승→패배까지 8장을 촬영해 주셔서 식이 잡혔다.
       승리 획득 = 100 + 10 × (달성 연승 − 1)
       근거(07_투기장_PvP/20260728_투기장연승후패배, 결과창의 before → after):
         0점 1연승 → 110점 2연승  (+110)
         110점 2연승 → 230점 3연승 (+120)
         230점 3연승 → 360점 4연승 (+130)
         360점 4연승 → 260점 0연승 (−100, 연승 초기화)
         260점 0연승 → 360점 1연승 (+100)  ← 첫 승. 대표 추가 촬영으로 확정
       0~4연승 전 구간이 실측으로 채워져 식에 추정이 남아 있지 않다(비전미확인 해소).
     갱신된 점수로 TIER_PTS 를 다시 읽어 실시간 승급·강등을 판정한다. */
  const gain = 100 + 10*(S.arenaStreak||0);   // arenaStreak 은 아직 증가 전 = 달성 연승 − 1
  if(win){ S.arenaPts+=gain; S.arenaStreak++; S.stats.arenaWins++; S.dice+=3;
    S.arenaSession.w++; S.arenaSession.l=0;          // 승 스트릭 누적 · 패는 끊김
    // ★ G-89·G-92: 순위가 실제로 오른다 → 정보패널 대형 순위 숫자와 순위 골드버프가 함께 갱신된다
    S.arenaRank=Math.max(1, Math.round(S.arenaRank*0.94) - ri(1,5) - S.arenaStreak); }
  else { S.arenaPts=Math.max(0,S.arenaPts-100); S.arenaStreak=0;
    S.arenaSession.l++; S.arenaSession.w=0;          // 패 스트릭 누적 · 승은 끊김
    S.arenaRank=Math.min(999999, Math.round(S.arenaRank*1.03) + ri(1,4)); }
  const nt=arenaTierOf(S.arenaPts);
  if(nt>S.arenaTier){ S.arenaTier=nt; toast(`${TIERS[S.arenaTier]} 승급!`); }
  else if(nt<S.arenaTier){ S.arenaTier=nt; toast(`${TIERS[S.arenaTier]}(으)로 강등…`); }
  sfx(win?'win':'fail');
  setModalTitle('투기장'); const b=$('#modalBody'); b.innerHTML='';
  // ★ G-91: 결과 카드 상단 세션 승패 배너
  b.appendChild(el('div','ar-session',`${S.arenaSession.w}승 ${S.arenaSession.l}패`));
  b.appendChild(el('div','result-card',`<div class="rc-icon">${win?eImg("🏆",2):'💥'}</div><div class="rc-title ${win?'win':'lose'}">${win?'WIN':'Loss'}</div><div class="small mut">vs ${foeName} · ${foeTier||''} (전투력 ${fmt(foeCP)})</div>`));
  // 변경 전 → 변경 후 2열 (원작 결과창)
  const cmp=el('div'); cmp.style.cssText='display:grid;grid-template-columns:1fr auto 1fr;gap:6px;margin:8px 0;text-align:center;align-items:center';
  // ★ v4.8: 원작 비교란은 점수 / 티어 / 연승 3줄뿐이다. '순위' 는 우리가 임의로 넣은 4번째 줄이라 뺀다.
  cmp.innerHTML=`<div class="small mut">${before.pts}점<br>${TIERS[before.tier]}<br>${before.streak}연승</div>
    <div style="color:var(--frame-lit);font-size:16px">▶</div>
    <div class="small" style="color:var(--txt-hi)">${S.arenaPts}점<br>${TIERS[S.arenaTier]}<br>${S.arenaStreak} 연승</div>`;
  b.appendChild(cmp);
  /* ★ v4.4: "싸웠고 뭘 받았다"가 한눈에 오도록 획득량을 명시한다.
     원작 결과창은 before→after 숫자만 주고 획득량을 안 알려줘서 역산해야 했다(대표 지적).
     before→after 2열 구조는 원작 그대로 두고 델타 한 줄만 추가한다. */
  if(win) b.appendChild(el('div','ar-gain',
    `<b>+${gain}점</b> <span class="mut">(기본 100${S.arenaStreak>1?` + 연승 ${10*(S.arenaStreak-1)}`:''})</span> · 주사위 +3`));
  else b.appendChild(el('div','ar-gain lose',`<b>−100점</b> <span class="mut">· 연승 초기화</span>`));
  b.appendChild(el('div','center small mut','*3초후 자동으로 넘어갑니다*'));
  // ★ v4.8: 원작 투기장 결과창은 '*3초후…*' 안내 아래에 버튼이 없다(던전은 G-80 에서 이미 제거, 여기만 누락됐었다).
  //   자동 연전 중일 때만 상태 표시를 남긴다.
  if(S.arenaAuto) b.appendChild(el('div','center small mut','자동 연전 중…'));
  $('#modal-root').classList.add('on'); currentModal='arenaResult'; refreshHUD();
  setTimeout(()=>{ if(currentModal!=='arenaResult') return;
    if(S.arenaAuto && S.ticket>0){ S.ticket--; refreshHUD(); arenaFight(); }
    else { if(S.arenaAuto) toast('입장권 소진 · 자동 연전 종료'); openModal('arena'); } }, 3000);
}

/* ------- 던전 실행 ------- */
// ★ 던전 입장 플로우(원작): 입장 → 홈 캔버스가 던전 전투로 전환(몬스터 여러 마리 or 보스 1마리와 실전)
//    → 성공/실패 판정(전멸·시간초과=실패) → 결과 팝업 → 3초 후 자동 퇴장(홈 파밍 복귀)
// 전투 중이면 재화 차감 전에 막는다(선차감 증발 방지) — 모든 입장 버튼이 최상단에서 호출
function busyFight(){ if(Battle.inDungeon && Battle.inDungeon()){ toast('전투 진행 중입니다'); return true; } return false; }
/* ★ B5/G-66: 5개 던전(요일/골드/보스/월드보스/시련의 탑) 공용 입장 확인 오버레이.
   금테 패널 + 배경 딤 + [아니요][예]. 네이티브 confirm() 을 전부 대체한다.
   ★ v4.1 A1-3: 버튼 좌우 배치는 던전마다 다르다.
     · 기본(골드던전·요일던전·보스소환·투기장 등) = 좌 [아니요] / 우 [예]
     · opt.yesFirst = 좌 [예] / 우 [아니요] — 월드보스·시련의 탑 전용
       근거: docs/reference/기능별/06_스테이지_던전/캡처_2026_07_22_06_40_37_666.png
             (시련의 탑 '입장 하시겠습니까?' 팝업에서 [예]가 좌측)
   ⚠ 호출 규약 — 재화·횟수 체크를 모두 통과한 뒤 "차감 직전"에만 부른다.
     onYes 안에서 실제 차감이 일어나며, [예] 시점에 busyFight() 를 한 번 더 확인해
     확인창이 떠 있는 사이에 다른 전투가 시작돼도 재화가 증발하지 않게 한다(v3.6 회귀 방지). */
function styledConfirm(msg, onYes, opt){
  opt = opt || {};
  const root=$('#modal-root');
  if(!root){ if(!busyFight() && onYes) onYes(); return; }
  root.querySelectorAll('.b5-ovl').forEach(n=>n.remove());
  const ov=el('div','b5-ovl'), pop=el('div','b5-pop');
  const close=()=>ov.remove();
  pop.appendChild(el('div','b5-head',opt.title||'입장 확인'));
  if(opt.sub) pop.appendChild(el('div','b5-sub',opt.sub));
  pop.appendChild(el('div','b5-msg',msg||'입장 하시겠습니까?'));
  if(opt.warn) pop.appendChild(el('div','b5-warn',opt.warn));
  const row=el('div','btnrow'); row.style.marginTop='10px';
  const no=el('button','btn',opt.no||'아니요'); no.onclick=close;
  const yes=el('button','btn gold',opt.yes||'예');
  yes.onclick=()=>{ close(); if(busyFight()) return; if(onYes) onYes(); };
  if(opt.yesFirst) row.append(yes,no); else row.append(no,yes);
  pop.appendChild(row);
  ov.appendChild(pop); ov.onclick=ev=>{ if(ev.target===ov) close(); };
  root.appendChild(ov);
}
/* ★ B5/G-70·G-73: 던전 공용 랭킹 리스트 — 30행 스크롤 + 길드태그 컬럼 + 1~3위 색배지.
   rows = [닉네임, 길드태그, 값] · opt.label 을 주면 값 위에 적색 라벨(탑의 'wave')을 얹는다. */
function dgRankList(rows, opt){
  opt=opt||{};
  const box=el('div','dg-rank');
  rows.slice().sort((a,b)=>b[2]-a[2]).forEach((r,i)=>{
    const row=el('div','lrow dg-rrow'+(r[0]===S.name?' me':''));
    row.innerHTML=`<div class="rk${i<3?(' rk'+(i+1)):''}">${i+1}</div>`
      + `<div class="gt">${r[1]||'-'}</div><div class="nm2">${r[0]}</div>`
      + `<div class="sc">${opt.label?`<span class="wv">${opt.label}</span>`:''}${opt.fmt?opt.fmt(r[2]):fmt(r[2])}</div>`;
    box.appendChild(row);
  });
  return box;
}
/* ★ B5/G-72 (v4.1 A1-2): 월드보스 보상 = 순위·점수 무관 '전투 보상 X2' 고정.
   재수색 결과 원작 UI에는 순위 구간별 차등 지급표가 존재하지 않는다(두 세션 결과 팝업 모두
   점수는 다른데 보상 표기는 'X2'로 동일). 종전 4구간 차등(1위/2~3위/4~10위/11위 이하)은
   우리가 지어낸 값이었으므로 제거한다.
   wbRankOf 는 랭킹 리스트(누적 데미지 정렬) 표시용으로만 남긴다 — 보상에 관여하지 않는다. */
function wbRankOf(dmg){ let r=1; WB_RANK.forEach(x=>{ if(x[2]>dmg) r++; }); return r; }
/* ⚠비전미확인 — 촬영대기: 원작은 'X2' 배수만 노출하고 배수의 기준이 되는 '전투 보상' 원본 수량이
   결과 팝업에서 판독되지 않았다. 아래 기준값은 종전 참가(11위 이하) 구간 수치를 그대로 승계한
   임시값이며, 원작 결과 팝업 스샷 확보 시 교체할 것. 점수→보상 환산은 원작에 없으므로 만들지 않는다. */
/* ★ A3-1: 월드보스는 길드 콘텐츠가 아니므로 회색코인을 지급하지 않는다(종전 gray:20 항목 삭제).
   회색코인 충전은 길드 레이드 / 약탈 / 길드 기여(점령전) 3경로 전용 — UI재현카탈로그 길드상점 절. */
const WB_BASE_REWARD = { g:2000000, tk:1 };
const WB_MULT = 2; // '전투 보상 X2' (G-71 패널 표기와 동일 배율) — 순위·점수와 무관한 고정 배수
function grantWorldBossReward(){
  const b=WB_BASE_REWARD, X=WB_MULT;
  addGold(b.g*X); S.tickHero+=b.tk*X;
  sysLog(`월드보스 참가 보상 (전투 보상 X${X}) · 골드 +${fmt(b.g*X)} · 영웅소환권 +${b.tk*X}`);
}
/* 전투 결과 점수 — 원작 결과 팝업은 성패 대신 정수 'N점'을 띄우고 별도로 적립한다(전량판독 #44).
   ⚠비전미확인 — 촬영대기: 점수 산출식(전투 중 상단 누적 점수 바 4→6)은 미촬영이라
   여기서는 처치 수(최소 1)를 정수 점수로 표기만 한다. 보상과는 연결하지 않는다. */
function wbScoreOf(st){ return Math.max(1, Math.round((st&&st.kills)||0)); }
/* ★ B5/G-67: 골드던전 입장 — 재료·횟수 체크 → styledConfirm → 차감.
   auto=true 는 '자동 입장' 연전 경유(확인창 생략). 재입장에 성공하면 true 를 돌려준다. */
function enterGoldDungeon(d, auto){
  if(busyFight()) return false;
  if(dailyLeft('gold',3)<=0){ if(!auto) toast('오늘 입장 3회 소진'); return false; }
  if(matAvail(d.mat)<d.need){ if(!auto) toast(`${d.mat} ${d.need}개 필요 (보유 ${matAvail(d.mat)})`); return false; }
  const go=()=>{
    if(dailyLeft('gold',3)<=0){ toast('오늘 입장 3회 소진'); return; }
    if(matAvail(d.mat)<d.need){ toast('재료가 부족합니다'); return; }
    matSpend(d.mat,d.need); dailyUse('gold');                  // ← 차감은 [예] 이후에만
    enterDungeonFight({ name:`황금 용광로 ${d.lv}단계`, col:'#e8b552', foeCP:d.foe, kind:'mobs', count:8+d.lv*2, dur:25,
      rewardText:`골드 +${fmt(d.gold)}`,
      reward:()=>{ addGold(d.gold); sysLog(`골드던전 ${d.lv}단계 클리어 · 골드 +${fmt(d.gold)}`); },
      autoNext:()=>S.goldAuto ? enterGoldDungeon(d,true) : false });
  };
  if(auto){ go(); return true; }
  styledConfirm('입장 하시겠습니까?', go,
    { title:`황금 용광로 ${d.lv}단계`, sub:`${matIcon(d.mat)} ${d.mat} ${d.need}개 소모 · 골드 ${fmt(d.gold)}` });
  return true;
}
/* ★ B5/G-75: [교환] — 웨이브 도달 상자(S.towerBox)를 재료로 환전하는 서브 팝업 */
function towerExchange(){
  const root=$('#modal-root'); if(!root) return;
  root.querySelectorAll('.b5-ovl').forEach(n=>n.remove());
  const ov=el('div','b5-ovl'), pop=el('div','b5-pop');
  pop.appendChild(el('div','b5-head','웨이브 상자 교환'));
  pop.appendChild(el('div','b5-msg',`보유 상자 <b style="color:var(--g-legend)">${S.towerBox||0}</b>개`));
  /* ★ v5.8: 재료 외 교환품 — 탑 상자의 소비처를 넓히고, 기록서·고급권의 두 번째 획득 경로가 된다. */
  [['📕','영웅 기록서',8,1,()=>{ S.records=(S.records||0)+1; }],
   ['📜','영웅 소환권+',4,1,()=>{ S.tickHeroP=(S.tickHeroP||0)+1; }],
   ['🩸','몬스터 소환권+',3,1,()=>{ S.tickMonP=(S.tickMonP||0)+1; }]].forEach(([ic,nm,cost,gain,give])=>{
    const r=el('div','pack'); r.innerHTML=`<div class="pic">${ic}</div><div class="info"><div class="t">${nm} X${gain}</div><div class="d">웨이브 상자 ${cost}개 소모</div></div>`;
    const bt=el('button','btn sm'+((S.towerBox||0)>=cost?' gold':''),'교환');
    bt.onclick=()=>{ if((S.towerBox||0)<cost){ toast('상자가 부족합니다'); return; }
      S.towerBox-=cost; give(); toast(`${nm} +${gain}`); ov.remove(); openModal('tower'); refreshHUD(); };
    r.appendChild(bt); pop.appendChild(r);
  });
  [['흑염석',1,20],['차원석',2,10],['심연광석',5,4],['금강석',12,2]].forEach(([mk,cost,gain])=>{
    const r=el('div','pack'); r.innerHTML=`<div class="pic">${matIcon(mk)}</div><div class="info"><div class="t">${mk} X${gain}</div><div class="d">웨이브 상자 ${cost}개 소모</div></div>`;
    const bt=el('button','btn sm'+((S.towerBox||0)>=cost?' gold':''),'교환');
    bt.onclick=()=>{ if((S.towerBox||0)<cost){ toast('상자가 부족합니다'); return; }
      S.towerBox-=cost; matGain(mk,gain); toast(`${mk} +${gain}`); ov.remove(); openModal('tower'); refreshHUD(); };
    r.appendChild(bt); pop.appendChild(r);
  });
  const cl=el('button','btn wide','닫기'); cl.style.marginTop='6px'; cl.onclick=()=>ov.remove(); pop.appendChild(cl);
  ov.appendChild(pop); ov.onclick=ev=>{ if(ev.target===ov) ov.remove(); };
  root.appendChild(ov);
}
function enterDungeonFight(cfg){
  if(busyFight()) return;
  closeModal(); sysLog(`${cfg.name} 입장`); sfx('tap');
  Battle.startDungeon({ name:cfg.name, col:cfg.col, foeCP:cfg.foeCP, kind:cfg.kind, count:cfg.count, dur:cfg.dur, waveDur:cfg.waveDur,
    onEnd:(win,stats)=>showDungeonResult(cfg,win,stats) });
}
/* ★ v4.5.1: 던전 결과창 "뭘 받았다" — 보상 함수를 하나하나 고치지 않고
   실행 전후 지갑을 비교해 실제 증가분만 칩으로 보여준다(투기장 델타와 같은 취지).
   rewardText 는 입장 시점에 만든 예고 문구라 실제 획득량과 어긋날 수 있었다. */
const WALLET_LABEL = [
  ['gold','🪙','골드'], ['ruby','💎','루비'], ['gray','🪙','회색코인'], ['guildCoin','🛡️','길드코인'],
  ['stones','🪨','강화석'], ['dice','🎲','주사위'], ['ticket','🎫','입장권'], ['goldTicket','🪪','골드던전권'],
  ['towerBox','📦','웨이브 상자'], ['tickHero','🎟️','영웅소환권'], ['tickMat','🎫','재료소환권'],
  ['hammerN','🔨','일반 망치'], ['hammers','🔨','전설 망치'], ['craftScroll','📜','제작서'], ['villMat','🏘️','마을재료'],
];
function walletSnap(){
  const w={}; WALLET_LABEL.forEach(([k])=>w[k]=Number(S[k])||0);
  MATS.forEach(m=>w['mat:'+m.k]=Number(S.mats[m.k])||0);
  return w;
}
function walletDiff(a,b){
  const out=[];
  WALLET_LABEL.forEach(([k,ic,nm])=>{ const d=(Number(b[k])||0)-(Number(a[k])||0); if(d>0) out.push({ic,nm,d}); });
  MATS.forEach(m=>{ const k='mat:'+m.k; const d=(Number(b[k])||0)-(Number(a[k])||0); if(d>0) out.push({ic:m.ic,nm:m.k,d}); });
  return out;
}
function showDungeonResult(cfg, win, stats){
  const rewarded = (win || cfg.race);
  const _w0 = walletSnap();
  if(rewarded && cfg.reward) cfg.reward(stats||{});
  const _gains = rewarded ? walletDiff(_w0, walletSnap()) : [];
  sfx(win?'win':'fail');
  setModalTitle(cfg.name); const b=$('#modalBody'); b.innerHTML='';
  // ★ v4.8: race 던전(탑·월드보스·길드레이드) 결과창 제목은 원작 3곳 모두 '결과' 다('전투 종료' 는 원작에 없는 문구)
  const title = win?'도전 성공!':(cfg.race?'결과':'도전 실패');
  b.appendChild(el('div','result-card',`<div class="rc-icon">${win?eImg("🎉",2):(cfg.race?'🐉':'💥')}</div><div class="rc-title ${win?'win':'lose'}">${title}</div>
    <div class="small mut">${rewarded?(cfg.rewardText||'보상 획득'):'부대가 전멸했습니다. 더 강해진 후 재도전하세요.'}${stats&&stats.dmg?` · 누적 데미지 ${fmt(stats.dmg)}`:''}</div>`));
  if(cfg.resultExtra) cfg.resultExtra(b, win, stats||{});
  // ★ v4.5.1: 실제 획득물 칩 — 예고 문구가 아니라 이번 판에 실제로 늘어난 것만 보여준다.
  if(_gains.length){
    const gw=el('div','dg-gain');
    gw.appendChild(el('div','dg-gain-h','획득'));
    const row=el('div','dg-gain-row');
    _gains.forEach(g=>row.appendChild(el('div','dg-chip',`${eImg(g.ic,1.5)} ${g.nm} <b>+${fmt(g.d)}</b>`)));
    gw.appendChild(row); b.appendChild(gw);
  }
  // ★ B5/G-80: [확인] 버튼과 3초 자동퇴장이 병존하던 구조 → 버튼 제거, 안내 텍스트만 남긴다.
  b.appendChild(el('div','center small mut','*3초후 자동으로 퇴장됩니다*'));
  $('#modal-root').classList.add('on'); currentModal='dgResult';
  setTimeout(()=>{ if(currentModal!=='dgResult') return;
    if(cfg.autoNext && cfg.autoNext()) return;   // ★ B5/G-67: 골드던전 '자동 입장' 연전
    closeModal(); }, 3000);
  refreshHUD();
}

/* ============================================================
   메인 루프 & 초기화
   ============================================================ */
let lastFrame=0, _loopOn=false;
// 대장간 진행 중: 전체 재렌더 대신 진행바·확정버튼만 부분 갱신(탭 유실·선택 초기화 방지)
function tickForge(){
  if(currentModal!=='forge' || !S.craft) return;
  const bar=document.getElementById('forgeBar');
  if(!bar){ openModal('forge'); return; }
  const left=Math.max(0,Math.ceil((S.craft.endAt-Date.now())/1000)), done=left<=0;
  bar.style.width=(clamp(1-left/(S.craft.sec||CRAFT[S.craft.grade].sec),0,1)*100)+'%';
  const lt=document.getElementById('forgeLeft'); if(lt) lt.textContent=done?'제작 완료 · 확정하세요':`남은 시간 ${mmss(left)}`;
  const fin=document.getElementById('forgeFin'); if(fin && done && fin.disabled){ fin.disabled=false; fin.classList.add('gold'); }
}
function gameLoop(ts){
  const dt=Math.min(0.1,(ts-lastFrame)/1000||0); lastFrame=ts;
  idleTick(dt); chatTick(dt); craftAutoCheck();
  hudT-=dt; if(hudT<=0){ hudT=0.5; refreshHUD(); tickClock(); tickForge(); reviveHUDTick(); }
  requestAnimationFrame(gameLoop);
}
setInterval(()=>{ save(); }, 5000);

function enterHome(){
  $('#title').classList.add('hidden');
  const lm=$('#login-mock'); if(lm) lm.classList.add('hidden');
  const ss=$('#server-select'); if(ss) ss.classList.add('hidden');
  const sc=$('#server-confirm'); if(sc) sc.classList.add('hidden');
  $('#home').classList.remove('hidden');
  Battle.resize(); Battle.start(); refreshHUD(); tickClock();
  for(let i=0;i<5;i++) pushChat(pick(CHAT_LINES)(), '전체');
  sysLog('결정의 시대에 오신 것을 환영합니다, 군주여.');
  if(!_loopOn){ _loopOn=true; requestAnimationFrame(gameLoop); }
  updateGuideBanner();
  if(!S.seenTutorial){ setTimeout(runIntro, 500); }
  else { renderTutorial(); if(S.offlinePending>0) setTimeout(()=>openModal('settle'), 450); }
}
/* ★ B1/G-06: START → 홈 직행이 아니라 로그인 목업 2단계(알약 버튼 → 계정 선택 시트)를 거친다.
   ★ B1/G-07: 서버 선택 [입장] 은 확인 오버레이를 띄우고, [예]에서만 enterHome() 한다. */
function startGame(){
  initAudio();
  const lm=$('#login-mock');
  if(lm){ $('#title').classList.add('hidden'); const sh=$('#acct-sheet'); if(sh) sh.classList.add('hidden'); lm.classList.remove('hidden'); }
  else gotoServerSelect();
}
function showAcctSheet(){ const sh=$('#acct-sheet'); if(sh) sh.classList.remove('hidden'); }
function gotoServerSelect(acct){
  if(acct) S.name=acct;
  const lm=$('#login-mock'); if(lm) lm.classList.add('hidden');
  $('#title').classList.add('hidden');
  const ss=$('#server-select');
  if(ss){ ss.classList.remove('hidden'); refreshHUD(); } else enterHome();
}
function selectedServerName(){
  const rows=[...document.querySelectorAll('#server-select .srv-row')];
  const hit=rows.find(r=>{ const i=r.querySelector('input'); return i && i.checked; });
  return hit ? hit.textContent.replace('New!','').trim() : (S.server||'화로 1서버');
}
function askServerConfirm(){
  const box=$('#server-confirm'); const nm=selectedServerName();
  const nmEl=$('#scName'); if(nmEl) nmEl.textContent=nm;
  if(!box){ S.server=nm; enterHome(); return; }
  box.classList.remove('hidden');
}

function wire(){
  $('#btnStart').onclick=startGame;
  // ★ B1/G-06 로그인 목업 2단계
  const lmg=$('#lmGuest'); if(lmg) lmg.onclick=()=>{ sfx('tap'); gotoServerSelect(); };
  const lma=$('#lmAcct');  if(lma) lma.onclick=()=>{ sfx('tap'); showAcctSheet(); };
  const asc=$('#asCancel'); if(asc) asc.onclick=()=>{ const sh=$('#acct-sheet'); if(sh) sh.classList.add('hidden'); };
  document.querySelectorAll('#acct-sheet .as-row').forEach(r=>r.addEventListener('click',()=>{ sfx('tap'); gotoServerSelect(r.dataset.acct); }));
  // ★ B1/G-07 서버 입장 확인 오버레이
  $('#srvEnter') && ($('#srvEnter').onclick=askServerConfirm);
  const scNo=$('#scNo'); if(scNo) scNo.onclick=()=>$('#server-confirm').classList.add('hidden');
  const scYes=$('#scYes'); if(scYes) scYes.onclick=()=>{ S.server=selectedServerName(); enterHome(); };
  // ★ B1/G-13 자동전투 토글
  const ab=$('#autoBat'); if(ab) ab.onclick=()=>{ S.autoBattle=!S.autoBattle; syncAutoBat(); toast(`자동전투 ${S.autoBattle?'On':'Off'}`); };
  // ★ B5/G-79: 전투 화면 우측 원형 '＋절전' 토글 — power 모달을 거치지 않고 절전 오버레이만 켠다(전투는 계속 진행)
  const pwt=$('#pwToggle'); if(pwt) pwt.onclick=(ev)=>{ ev.stopPropagation(); sfx('tap'); startPowerSave(); };
  /* ★ N3/§7-9: 좌상단 명패 탭 = 절전 즉시 진입(확인 모달 없음). 원작 실측 — 절전화면 캡처 5장의 대표 주석 근거. */
  const nmc=$('#namecap'); if(nmc) nmc.onclick=()=>{ sfx('tap'); $('#sidemenu')&&$('#sidemenu').classList.add('hidden'); startPowerSave(); };
  syncAutoBat();
  $('#modalClose').onclick=closeModal;
  $('#scrim').onclick=closeModal;
  // ★ v4.9: 원작대로 사이드메뉴와 콘텐츠 아이콘열을 함께 여닫는다(둘은 한 덩어리로 뜬다).
  $('#btnMenuToggle').onclick=()=>{
    const on=$('#sidemenu').classList.toggle('hidden');
    $('#content-rail').classList.toggle('hidden', on);
  };
  $('#btnPlusRuby').onclick=()=>openModal('shop');
  const tp=$('.timepod'); if(tp) tp.addEventListener('click',()=>openModal('settle'));   // ★ B1/G-14: topbar → stage-wrap 이동
  const npl=$('#npc-layer'); if(npl) npl.addEventListener('click', nextDialogue);
  const gbGo=$('#gbGo'); if(gbGo) gbGo.addEventListener('click',()=>openModal('quest'));
  $('#battle').addEventListener('click',()=>{ $('#sidemenu').classList.add('hidden'); });
  document.querySelectorAll('[data-modal]').forEach(elm=>{ elm.addEventListener('click',()=>{ sfx('tap'); $('#sidemenu').classList.add('hidden'); openModal(elm.dataset.modal); }); });
  const ci=$('#chatInput'); ci.addEventListener('keydown',e=>{ if(e.key==='Enter'&&ci.value.trim()){
    const said=ci.value.trim();
    /* ★ v5.81: 내 채팅에도 칭호 표시 — 봇 메시지와 동일한 형식.
       봇은 chatWho()로 '칭호[순위] 닉네임' 형태. 내 메시지도 착용 칭호 + 순위 표시. */
    const _myTitle = TITLES.find(t=>t.id===S.title);
    const _myTitleName = _myTitle ? _myTitle.n : '신참 대장장이';
    const _myTitleColor = _myTitle ? titleGradeColor(_myTitle.g) : '#8ee6c0';
    pushChat(`<span class="tier" style="color:${_myTitleColor}">${_myTitleName}</span><span class="rank">[1위]</span> <span class="who" style="color:#f0cd82">${S.name}</span>: ${said.replace(/</g,'&lt;')}`, chatFilter==='전체'?'전체':chatFilter);
    ci.value='';
    chatTitleCheck(said);   // ★ F2: 월드챗 문구 칭호 4종(다정한 대장장이·인사쟁이·마을 사람·고양이 집사)
  } });
  document.querySelectorAll('#chat .ctab').forEach(t=>t.addEventListener('click',()=>{ document.querySelectorAll('#chat .ctab').forEach(x=>x.classList.remove('on')); t.classList.add('on'); chatFilter=t.textContent.trim(); applyChatFilter(); guildTabNotice(); }));
  document.querySelectorAll('#chat .sk').forEach(s=>s.addEventListener('click',()=>toast('스킬은 완전 자동 전투로 발동됩니다')));
  // ★ B1/G-15: .plusminus → .logtools 로 이전
  document.querySelectorAll('#chat .logtools .iconbtn').forEach((b,i)=>b.addEventListener('click',()=>{ const log=$('#chatLog'); const cur=parseFloat(getComputedStyle(log).fontSize); log.style.fontSize=clamp(cur+(i===0?1:-1),9,16)+'px'; }));
}

/* ★ v5.13: #device(453×852)를 화면에 맞춰 균일 확대 — transform:scale.
   게임 내부 좌표계(453)는 불변, 표시 배율만 키운다. 가로/세로 중 작은 비율로 맞춤. */
function updateUIScale(){
  const dev = document.getElementById('device'); if(!dev) return;
  const s = Math.min(window.innerWidth/453, window.innerHeight/852);
  dev.style.setProperty('--ui-scale', s);
}
window.addEventListener('DOMContentLoaded',()=>{
  load(); wire(); refreshHUD();
  updateUIScale();
  setTimeout(()=>{ if(!$('#home').classList.contains('hidden')) Battle.resize(); }, 100);
});
window.addEventListener('resize', updateUIScale);
window.addEventListener('beforeunload', save); // 오프라인 정산 정확도
