#!/usr/bin/env node
/**
 * match_cases.js — 跨案例确定性匹配
 * 用法: node pipeline/match_cases.js <case_id> [--top N]
 * 读: test_cases/<case_id>/ir_filled.json + contracts/case_index.json
 * 出: stdout 打印 top N 相似案例 + 匹配理由
 *
 * 匹配规则:
 *   1. 硬约束: type 完全一致
 *   2. 强信号: mechanics_tag 交集 ≥1
 *   3. 弱信号: emotions_top 交集 ≥2
 *   4. 排序: (mech_overlap * 2) + emo_overlap 降序
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function intersect(a, b) {
  const sb = new Set(b);
  return a.filter(x => sb.has(x));
}

function topEmotionsFromIR(ir) {
  const beats = (ir.FEEL && ir.FEEL.emotional_beats) || [];
  const counts = {};
  for (const b of beats) {
    if (b && b.emotion) counts[b.emotion] = (counts[b.emotion] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node pipeline/match_cases.js <case_id> [--top N]');
    process.exit(1);
  }
  const caseId = args[0];
  const topIdx = args.indexOf('--top');
  const topN = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : 3;

  const irPath = path.join(ROOT, 'test_cases', caseId, 'ir_filled.json');
  const idxPath = path.join(ROOT, 'contracts', 'case_index.json');

  if (!fs.existsSync(irPath)) {
    console.error(`IR not found: ${irPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(idxPath)) {
    console.error(`case_index not found: ${idxPath}. Skip Phase 1.4.`);
    process.exit(0);
  }

  const ir = readJSON(irPath);
  const idx = readJSON(idxPath);

  // 当前 case 的字段（mechanics_tag 需手填，否则用 mechanics_zh 名称）
  const currentType = ir.type;
  // mechanics_tag 默认无 — 提示用户可在 ir_filled.json 顶层加 mechanics_tag 字段
  const currentMechTag = ir.mechanics_tag || [];
  const currentEmoTop = topEmotionsFromIR(ir);

  // 排除当前 case 自己
  const candidates = idx.cases.filter(c => c.id !== caseId);
  // 硬约束: type 一致
  const sameType = candidates.filter(c => c.type === currentType);

  const scored = sameType.map(c => {
    const mechOverlap = currentMechTag.length ? intersect(currentMechTag, c.mechanics_tag || []) : [];
    const emoOverlap = intersect(currentEmoTop, c.emotions_top || []);
    const score = mechOverlap.length * 2 + emoOverlap.length;
    return { c, mechOverlap, emoOverlap, score };
  }).sort((a, b) => b.score - a.score);

  // 过滤无任何交集（score=0）的
  const ranked = scored.filter(s => s.score > 0).slice(0, topN);

  console.log(`【相似案例参考 (top ${ranked.length}/${topN})】`);
  console.log(`当前: type=${currentType}, mechanics_tag=[${currentMechTag.join(', ')}], emotions_top=[${currentEmoTop.join(', ')}]`);
  console.log('');

  if (ranked.length === 0) {
    console.log('未找到相似案例（type 一致但 mechanics/emotions 无交集）。');
    if (currentMechTag.length === 0) {
      console.log('提示: 当前 IR 未填 mechanics_tag 字段，匹配仅依赖 emotions。建议在 ir_filled.json 顶层补 mechanics_tag: [...] 提高匹配质量。');
    }
    process.exit(0);
  }

  ranked.forEach((s, i) => {
    console.log(`${i + 1}. ${s.c.id} (${s.c.level_name})`);
    console.log(`   匹配: mechanics=[${s.mechOverlap.join(', ') || '—'}], emotions=[${s.emoOverlap.join(', ') || '—'}], score=${s.score}`);
    console.log(`   规模: region ${s.c.region_count} / node ${s.c.node_count}`);
    if (s.c.key_learnings && s.c.key_learnings.length) {
      console.log(`   关键学习:`);
      s.c.key_learnings.forEach(kl => console.log(`     - ${kl}`));
    }
    console.log('');
  });

  console.log('> 仅供参考。当前案例的设计意图优先于参考案例。');
}

if (require.main === module) main();
