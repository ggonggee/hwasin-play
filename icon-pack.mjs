/* 아이콘 팩 매핑 — 6000FantasyIcons → html/assets/icons/**
   사용: npm run icons   (node html/icon-pack.mjs)

   ★ v5.109: 종전 icon-map/ui-icon-map/emoji-icon-map 3종을 이 파일로 통합했다.
   그 3개는 소스가 'Layer Lab/GUI Pro-MinimalGame' 을 가리키고 있었는데, 실제 배포된
   아이콘은 이미 6000FantasyIcons 로 교체된 뒤였다 — 즉 npm run icons 를 돌리면 화면이
   통째로 예전 에셋으로 되돌아가는 상태였다. 현재 배포본을 해시로 역추적해 정본 표를
   복원하고, 아직 이모지로 남아 있던 항목을 새로 배정해 합쳤다.

   키 = 출력 파일명(확장자 제외). 이모지 항목의 키는 코드포인트 16진(emSlug 와 동일 규칙).
   값 = 6000FantasyIcons 하위 상대경로. */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
/* 아이콘 원본 팩(6000FantasyIcons)은 용량이 커서 이 공개 저장소에 두지 않는다.
   기본값은 구 개발 저장소의 Unity 프로젝트. 다른 곳에 있으면 ICON_PACK 으로 넘겨라.
   예) ICON_PACK=D:/path/to/6000FantasyIcons npm run icons */
const PACK = process.env.ICON_PACK || 'D:/Dev/Dev_AI/20260804_ZcodeHwasin/unity/ZcodeHwasinUnity/Assets/6000FantasyIcons';
const OUT  = join(ROOT, 'assets/icons');

const MAP = {
  // ── 재료 (game.js MATS[].icon) (29종) → assets/icons/
  '': {
    'anvil': 'BuildingMaterials/Anvil.png',
    'book': 'WeaponIcons/WeaponIconsVol1/Book_1.png',
    'crystal': 'ProfessionIcons/ResourceIcons/Res_25_crystal.png',
    'energy': 'ProfessionIcons/ResourceIcons/Res_103_magicpotion.png',
    'feather': 'ProfessionIcons/ResourceIcons/Res_70_scales.png',
    'fire': 'ProfessionIcons/ResourceIcons/Res_127_dragonegg.png',
    'gem_blue': 'ProfessionIcons/ProfessionAndCraftIcons/Jewelry/Jewelry_06_bluecrystal.png',
    'gem_diamond': 'ProfessionIcons/ProfessionAndCraftIcons/Jewelry/Jewelry_09_blackcrystal.png',
    'gem_green': 'ProfessionIcons/ProfessionAndCraftIcons/Jewelry/Jewelry_04_greencrystal.png',
    'gem_purple': 'ProfessionIcons/ProfessionAndCraftIcons/Jewelry/Jewelry_10_violetcrystal.png',
    'gem_red': 'ProfessionIcons/ProfessionAndCraftIcons/Jewelry/Jewelry_03_redcrystal.png',
    'hammer': 'ProfessionIcons/ProfessionAndCraftIcons/Blacksmith/Blacksmith_10_gold_stick.png',
    'heart': 'ProfessionIcons/ResourceIcons/Res_84_heart.png',
    'job_earth': 'WeaponIcons/WeaponIconsVol1/shield_10.png',
    'job_flame': 'WeaponIcons/WeaponIconsVol1/Sword_05.png',
    'job_frost': 'WeaponIcons/WeaponIconsVol1/staff_5.png',
    'job_shadow': 'WeaponIcons/WeaponIconsVol1/Dagger_10.png',
    'job_wind': 'WeaponIcons/WeaponIconsVol1/Bow_10.png',
    'key': 'ProfessionIcons/ResourceIcons/Res_43_manapotion.png',
    'leaf': 'ProfessionIcons/ProfessionAndCraftIcons/Herbalism/Herbalism_05_fireflower.png',
    'ore': 'ProfessionIcons/ProfessionAndCraftIcons/Mining/Mining_05_ironore.png',
    'potion': 'ProfessionIcons/ProfessionAndCraftIcons/Alchemy/Alchemy_03_flask.png',
    'ring': 'ArmorIcons/RingAndNeck_Icons/Ring_01.png',
    'rune': 'ProfessionIcons/ProfessionAndCraftIcons/Enchantment/Enchantment_10_magicdust.png',
    'snowflake': 'ProfessionIcons/ResourceIcons/Res_109_brokenCrystal.png',
    'soul': 'ProfessionIcons/ResourceIcons/Res_132_eye.png',
    'star': 'ProfessionIcons/ResourceIcons/Res_167_MageCrystal.png',
    'water': 'ProfessionIcons/ResourceIcons/Res_39_colbGreen.png',
    'wood': 'ProfessionIcons/ResourceIcons/Res_04_wood.png',
  },
  // ── 장비 부위 (equipImg) (28종) → assets/icons/equip/
  'equip': {
    'anvil': 'BuildingMaterials/Anvil.png',
    'arrow': 'WeaponIcons/WeaponIconsVol1/Arrow_01.png',
    'axe': 'WeaponIcons/WeaponIconsVol1/Axe_01.png',
    'belt': 'ArmorIcons/BasicArmor_Icons/BeltS1.png',
    'book': 'WeaponIcons/WeaponIconsVol1/Book_1.png',
    'boots': 'ArmorIcons/BasicArmor_Icons/Boots_01_common.png',
    'bow': 'WeaponIcons/WeaponIconsVol1/Bow_01.png',
    'bracelet': 'ArmorIcons/RingAndNeck_Icons/bracelet_b_01.png',
    'bracer': 'ArmorIcons/BasicArmor_Icons/Bracer_01.png',
    'cape': 'ArmorIcons/BasicArmor_Icons/Back_01.png',
    'chest': 'ArmorIcons/BasicArmor_Icons/Chest_01_farmer.png',
    'coins': 'ProfessionIcons/LootIcons/Loot_01_coins.png',
    'dagger': 'WeaponIcons/WeaponIconsVol1/Dagger_01.png',
    'essence': 'ProfessionIcons/ProfessionAndCraftIcons/Enchantment/Enchantment_05_magicdust.png',
    'gloves': 'ArmorIcons/BasicArmor_Icons/Gloves_01.png',
    'hammer_w': 'WeaponIcons/WeaponIconsVol1/Hammer_01.png',
    'helm': 'ArmorIcons/BasicArmor_Icons/Helm_01_guard.png',
    'necklace': 'ArmorIcons/RingAndNeck_Icons/Neck_b_01.png',
    'pants': 'ArmorIcons/BasicArmor_Icons/Pants_01.png',
    'potion': 'ProfessionIcons/ProfessionAndCraftIcons/Alchemy/Alchemy_05_poison.png',
    'ring': 'ArmorIcons/RingAndNeck_Icons/Ring_01.png',
    'scythe': 'WeaponIcons/WeaponIconsVol1/Scythe_01.png',
    'shield': 'WeaponIcons/WeaponIconsVol1/shield_01.png',
    'shoulder': 'ArmorIcons/BasicArmor_Icons/Shoulder_05_dragon.png',
    'spear': 'WeaponIcons/WeaponIconsVol1/Spear_01.png',
    'staff': 'WeaponIcons/WeaponIconsVol1/staff_1.png',
    'sword': 'WeaponIcons/WeaponIconsVol1/Sword_01.png',
    'wand': 'WeaponIcons/WeaponIconsVol1/Wand.png',
  },
  // ── UI 버튼·배지 (UI_ICON_MAP) (39종) → assets/icons/ui/
  'ui': {
    'ci_boss': 'ProfessionIcons/LootIcons/Loot_184_scull.png',
    'ci_dailydungeon': 'ProfessionIcons/LootIcons/Loot_169_dynamite.png',
    'ci_golddungeon': 'ProfessionIcons/LootIcons/Loot_127_Money.png',
    'ci_guild': 'BuildingMaterials/WoodenWall.png',
    'ci_quest': 'ProfessionIcons/LootIcons/Loot_153_map.png',
    'ci_raid': 'WeaponIcons/WeaponIconsVol1/Sword_10.png',
    'ci_village': 'BuildingMaterials/WoodenWall.png',
    'ci_worldboss': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/Creatures_01_nobg.png',
    'nav_arena': 'WeaponIcons/WeaponIconsVol1/Sword_05.png',
    'nav_forge': 'BuildingMaterials/Anvil.png',
    'nav_hero': 'ArmorIcons/BasicArmor_Icons/Helm_01_guard.png',
    'nav_inventory': 'ProfessionIcons/LootIcons/Loot_35_bag.png',
    'nav_monster': 'ProfessionIcons/LootIcons/Loot_184_scull.png',
    'nav_shop': 'ProfessionIcons/LootIcons/Loot_127_Money.png',
    'nav_summon': 'ProfessionIcons/ResourceIcons/Res_127_dragonegg.png',
    'res_gem': 'ProfessionIcons/ProfessionAndCraftIcons/Jewelry/Jewelry_02_yellowcrystal.png',
    'res_gold': 'ProfessionIcons/LootIcons/Loot_01_coins.png',
    'side_costume': 'ArmorIcons/BasicArmor_Icons/Chest_32_mage.png',
    'side_guide': 'MedievalIcons/SkillsMedieval/Skill_Attack.png',
    'side_package': 'ProfessionIcons/LootIcons/Loot_142_bag.png',
    'side_social': 'ProfessionIcons/QuestIcons/Quest_05.png',
    'side_tower': 'BuildingMaterials/BasicPick.png',
    'skill_earth': 'ProfessionIcons/ProfessionAndCraftIcons/Mining/Mining_03_hardstone.png',
    'skill_flame': 'ProfessionIcons/ProfessionAndCraftIcons/Alchemy/Alchemy_05_poison.png',
    'skill_frost': 'ProfessionIcons/ProfessionAndCraftIcons/Alchemy/Alchemy_10_blue_mixture.png',
    'skill_wind': 'ProfessionIcons/ResourceIcons/Res_52_leaves.png',
    'sm_attend': 'ProfessionIcons/ResourceIcons/Res_169_foodApple.png',
    'sm_buff': 'MedievalIcons/SkillsMedieval/Skill_Defence.png',
    'sm_chat': 'ProfessionIcons/LootIcons/Loot_04.png',
    'sm_codex': 'ProfessionIcons/LootIcons/Loot_153_map.png',
    'sm_help': 'ProfessionIcons/QuestIcons/Quest_06_pult.png',
    'sm_lounge': 'BuildingMaterials/WoodenWall.png',
    'sm_mail': 'ProfessionIcons/LootIcons/Loot_139_boxCOntainer.png',
    'sm_notice': 'ProfessionIcons/QuestIcons/Quest_01_explosion.png',
    'sm_power': 'BuildingMaterials/BasicHammer.png',
    'sm_setfx': 'ArmorIcons/ArmorSet_Icons/Mail/Mail1_Chest.png',
    'sm_settings': 'BuildingMaterials/WoodenWall.png',
    'sm_strategy': 'MedievalIcons/SkillsMedieval/Skill_Attack.png',
    'sm_titles': 'ProfessionIcons/ResourceIcons/Res_84_heart.png',
  },
  // ── 이모지 (EM_ICON_MAP · 파일명=코드포인트) (76종) → assets/icons/em/
  'em': {
    '1f300': 'SkillsIcons/Skillicons2/Skill_nobg/vortex_nobg.png',
    '1f311': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/Demon_05_nobg.png',
    '1f33e': 'ProfessionIcons/ResourceIcons/Res_124_woodlog.png',
    '1f381': 'ProfessionIcons/LootIcons/Loot_103_chest.png',
    '1f389': 'ProfessionIcons/LootIcons/Loot_105_vine.png',
    '1f392': 'MedievalIcons/ResourcesMedieval/BagBrown.png',
    '1f396': 'ProfessionIcons/LootIcons/Loot_151_compass.png',
    '1f39f': 'ProfessionIcons/LootIcons/Loot_01_coins.png',
    '1f3ab': 'ProfessionIcons/LootIcons/Loot_102_chest.png',
    '1f3ad': 'ProfessionIcons/LootIcons/Loot_150_Spyglass.png',
    '1f3af': 'ProfessionIcons/QuestIcons/Quest_04_glasses.png',
    '1f3b2': 'ProfessionIcons/LootIcons/Loot_03_coins.png',
    '1f3b4': 'ProfessionIcons/LootIcons/Loot_101_chest.png',
    '1f3c5': 'ProfessionIcons/LootIcons/Loot_147_jewelry.png',
    '1f3c6': 'ProfessionIcons/LootIcons/Loot_104_chest.png',
    '1f3cb': 'ProfessionIcons/ResourceIcons/Res_161_steel.png',
    '1f3d8': 'AvatarIconsMegapack/BuildingIcons/Building_nobg/Building_06_house_nobg.png',
    '1f3db': 'BuildingMaterials/WoodenWall.png',
    '1f3f9': 'WeaponIcons/WeaponIconsVol1/Bow_01.png',
    '1f409': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/Creatures_01_nobg.png',
    '1f43a': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/Animals_10_nobg.png',
    '1f451': 'MedievalIcons/ResourcesMedieval/Crown.png',
    '1f458': 'ProfessionIcons/LootIcons/Loot_04.png',
    '1f464': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/BoldWarrior_nb.png',
    '1f479': 'ProfessionIcons/LootIcons/Loot_09_axe.png',
    '1f480': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/Animals_01_nobg.png',
    '1f48a': 'ProfessionIcons/ProfessionAndCraftIcons/Alchemy/Alchemy_04_water.png',
    '1f48d': 'ArmorIcons/RingAndNeck_Icons/Ring_01.png',
    '1f48e': 'ProfessionIcons/ProfessionAndCraftIcons/Jewelry/Jewelry_02_yellowcrystal.png',
    '1f4a0': 'ProfessionIcons/ResourceIcons/Res_44_healthpotion.png',
    '1f4ac': 'ProfessionIcons/LootIcons/Loot_04.png',
    '1f4b0': 'ProfessionIcons/ResourceIcons/Res_03_goldenbar.png',
    '1f4c3': 'ProfessionIcons/ResourceIcons/Res_52_leaves.png',
    '1f4c8': 'ProfessionIcons/ResourceIcons/Res_168_BagAllres.png',
    '1f4ca': 'ProfessionIcons/ProfessionAndCraftIcons/Enchantment/Enchantment_22_scroll.png',
    '1f4d5': 'WeaponIcons/WeaponIconsVol1/Book_10.png',
    '1f4d6': 'WeaponIcons/WeaponIconsVol1/Book_1.png',
    '1f4d8': 'MedievalIcons/ResourcesMedieval/Book2.png',
    '1f4dc': 'WeaponIcons/WeaponIconsVol1/Book_5.png',
    '1f4e2': 'ProfessionIcons/QuestIcons/Quest_01_explosion.png',
    '1f4e6': 'ProfessionIcons/LootIcons/Loot_101_chest.png',
    '1f50a': 'MedievalIcons/ResourcesMedieval/MusicHorn.png',
    '1f50b': 'ProfessionIcons/ProfessionAndCraftIcons/Alchemy/Alchemy_24_energy_potion.png',
    '1f512': 'ProfessionIcons/LootIcons/Loot_07_trash.png',
    '1f513': 'ProfessionIcons/LootIcons/Loot_54_key.png',
    '1f517': 'MedievalIcons/WeponMedieval/Chain.png',
    '1f525': 'ProfessionIcons/ResourceIcons/Res_127_dragonegg.png',
    '1f528': 'WeaponIcons/WeaponIconsVol1/Hammer_01.png',
    '1f52e': 'ProfessionIcons/ResourceIcons/Res_25_crystal.png',
    '1f531': 'WeaponIcons/WeaponIconsVol1/Spear_01.png',
    '1f5d3': 'ProfessionIcons/ResourceIcons/Res_95_tulips.png',
    '1f5dd': 'ProfessionIcons/LootIcons/Loot_05.png',
    '1f5e1': 'WeaponIcons/WeaponIconsVol1/Dagger_01.png',
    '1f5fc': 'AvatarIconsMegapack/BuildingIcons/Building_nobg/Tower_01_nobg.png',
    '1f5ff': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/Demon_01_nobg.png',
    '1f6ab': 'ProfessionIcons/QuestIcons/Quest_03_bomb.png',
    '1f6e0': 'BuildingMaterials/BasicHammer.png',
    '1f6e1': 'WeaponIcons/WeaponIconsVol1/shield_01.png',
    '1f987': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/Bat_nb.png',
    '1f9d9': 'AvatarIconsMegapack/CharacterIcons/Characters_nobg/ElfMage_nb.png',
    '1f9ea': 'ProfessionIcons/ProfessionAndCraftIcons/Alchemy/Alchemy_03_flask.png',
    '1f9ed': 'BuildingMaterials/BasicDigger.png',
    '1f9f0': 'ProfessionIcons/LootIcons/Loot_06.png',
    '1fa78': 'ProfessionIcons/ResourceIcons/Res_49_health.png',
    '1fa84': 'WeaponIcons/WeaponIconsVol1/staff_1.png',
    '1fa93': 'WeaponIcons/WeaponIconsVol1/Axe_01.png',
    '1fa99': 'ProfessionIcons/ResourceIcons/Res_161_steel.png',
    '1faa8': 'ProfessionIcons/ProfessionAndCraftIcons/Mining/Mining_05_ironore.png',
    '1faaa': 'ProfessionIcons/QuestIcons/Quest_28_card.png',
    '1fab5': 'ProfessionIcons/ResourceIcons/Res_23_oldwood.png',
    '2692': 'ProfessionIcons/ProfessionAndCraftIcons/Blacksmith/Blacksmith_05_stick.png',
    '2694': 'WeaponIcons/WeaponIconsVol1/Sword_01.png',
    '26a1': 'SkillsIcons/Bonus/Skill1_Standart/Lightning.png',
    '26cf': 'BuildingMaterials/BasicPick.png',
    '26fa': 'ProfessionIcons/QuestIcons/Quest_02_mask.png',
    '2744': 'ProfessionIcons/ResourceIcons/Res_109_brokenCrystal.png',
  },
};

if(!existsSync(PACK)){
  console.error('✗ 아이콘 팩이 없다:', PACK);
  console.error('  (유니티 에셋은 저장소에 넣지 않는다 — .gitignore 참조. 로컬에 복원한 뒤 다시 실행하라)');
  process.exit(1);
}
let ok=0, miss=[];
for(const [sub, rows] of Object.entries(MAP)){
  const dir = sub ? join(OUT, sub) : OUT;
  mkdirSync(dir, { recursive: true });
  for(const [name, src] of Object.entries(rows)){
    const from = join(PACK, src);
    if(!existsSync(from)){ miss.push(`${sub||'.'}/${name} ← ${src}`); continue; }
    copyFileSync(from, join(dir, name + '.png')); ok++;
  }
}
console.log(`✓ 아이콘 ${ok}종 복사 완료`);
if(miss.length){ console.log('✗ 원본을 찾지 못한 항목 ' + miss.length + '건:'); miss.forEach(m=>console.log('   ' + m)); process.exit(1); }
