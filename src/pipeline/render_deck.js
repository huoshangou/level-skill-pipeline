#!/usr/bin/env node
/**
 * render_deck.js v0.2.0
 *
 * 用法: node render_deck.js <case_id>
 * 例:   node render_deck.js case_05_gangster_mansion
 *
 * 读 11 模块 HTML 路径 + IR 元数据 → 18 页 deck（5 layout 模板填字段）
 * 契约: contracts/views/deck/contract.yaml v0.2
 *
 * 设计原则: 零 LLM 判断，纯模板填充。
 * 输出: outputs/{case_id}/deck/index.html + motion.min.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================
//  来源 contract.yaml v0.2 — 改契约时同步更新
// ============================================================

// modules_default 是该 act 可能包含的模块全集；实际 modules 由 manifest 动态过滤。
// 注意:
// - spatial_topology 已在 changelog v2.4 移除 (功能由 bubble_chart + spatial_layout 共同覆盖)，永不引用
// - 不渲染 uncertainty_flags 为 slide (用户反馈为 log 噪音，已在主流程中删除)
// - act_title 按 isGameplay() 切换术语（关卡 vs 玩法）
const ACT_TEMPLATE = [
  { act: 1, titleSpatial: '关卡定调',   titleGameplay: '玩法定调',   titleEn: 'Tone',       theme: 'hero light',
    modules_default: ['level_overview'] },
  { act: 2, titleSpatial: '空间与氛围', titleGameplay: '机制与流程', titleEn: 'Space',      theme: 'hero dark',
    modules_default: ['spatial_layout', 'atmosphere_ref', 'bubble_chart'] },
  { act: 3, titleSpatial: '节奏与情绪', titleGameplay: '节奏与情绪', titleEn: 'Rhythm',     theme: 'hero light',
    modules_default: ['emotion_curve', 'storyboard'] },
  { act: 4, titleSpatial: '制作需求',   titleGameplay: '制作需求',   titleEn: 'Production', theme: 'hero dark',
    modules_default: ['lighting_req', 'vfx_req', 'audio_req', 'tech_req', 'asset_list'] },
];

// 玩法 vs 关卡术语切换（来源: contracts/level_type_rules.md + memory/feedback_levelagent_gameplay_vs_level.md）
const GAMEPLAY_TYPES = ['OpenWorldEvent', 'OpenWorldChallenge'];
const TERM_MAP = {
  spatial: {
    docCN: '关卡设计文档', docEN: 'Level Design Document',
    overview: '关卡概览',  overviewDesc: '关卡概览',
    docTag: '关卡',
  },
  gameplay: {
    docCN: '玩法设计文档', docEN: 'Gameplay Design Document',
    overview: '玩法概览',  overviewDesc: '玩法概览',
    docTag: '玩法',
  },
};

function isGameplay(caseType, casePath) {
  if (GAMEPLAY_TYPES.includes(caseType)) return true;
  if (caseType === 'POI') return false;
  // MainMission / SideQuest / 未知 → 按 spatial_layout 是否存在兜底
  return !fs.existsSync(path.join(casePath, 'spatial_layout.html'));
}

const THEME_MAPPING = {
  POI:             { name: 'dune',             vars: { ink: '#1f1a14', inkRgb: '31,26,20',  paper: '#f0e6d2', paperRgb: '240,230,210', paperTint: '#e3d7bf', inkTint: '#2d2620' } },
  OpenWorldEvent:  { name: 'forest_ink',       vars: { ink: '#1a2e1f', inkRgb: '26,46,31',  paper: '#f5f1e8', paperRgb: '245,241,232', paperTint: '#ece7da', inkTint: '#253d2c' } },
  MECHANIC:        { name: 'ink_classic',      vars: { ink: '#0a0a0b', inkRgb: '10,10,11',  paper: '#f1efea', paperRgb: '241,239,234', paperTint: '#e8e5de', inkTint: '#18181a' } },
  STRATEGY:        { name: 'indigo_porcelain', vars: { ink: '#0a1f3d', inkRgb: '10,31,61',  paper: '#f1f3f5', paperRgb: '241,243,245', paperTint: '#e4e8ec', inkTint: '#152a4a' } },
  NARRATIVE:       { name: 'kraft_paper',      vars: { ink: '#2a1e13', inkRgb: '42,30,19',  paper: '#eedfc7', paperRgb: '238,223,199', paperTint: '#e0d0b6', inkTint: '#3a2a1d' } },
};
const FALLBACK_THEME = THEME_MAPPING.MECHANIC; // 未识别 type 时用墨水经典

// 注意: level_overview / *_overview 的中文名按 isGameplay 在运行时切换（见 moduleNameZh / moduleDesc）
const MODULE_DESC_BASE = {
  spatial_layout: '空间布局 · 2D / 3D 交互',
  atmosphere_ref: '氛围参考 · 各区域 mood prompt',
  bubble_chart:   '核心流程图',
  emotion_curve:  'emotional_beats 曲线',
  storyboard:     '关键分镜 · 演出节点拆解',
  lighting_req:   '灯光需求',
  vfx_req:        '特效需求',
  audio_req:      '音频需求',
  tech_req:       '技术需求 · 系统依赖 + 硬约束',
  asset_list:     '资产清单 · required + reuse_candidates',
};

const MODULE_NAME_ZH_BASE = {
  spatial_layout: '空间布局',
  atmosphere_ref: '氛围参考',
  bubble_chart:   '核心流程图',
  emotion_curve:  '情绪曲线',
  storyboard:     '关键分镜',
  lighting_req:   '灯光需求',
  vfx_req:        '特效需求',
  audio_req:      '音频需求',
  tech_req:       '技术需求',
  asset_list:     '资产清单',
};

function moduleDesc(name, term) {
  if (name === 'level_overview') return term.overviewDesc;
  return MODULE_DESC_BASE[name] || name;
}
function moduleNameZh(name, term) {
  if (name === 'level_overview') return term.overview;
  return MODULE_NAME_ZH_BASE[name] || name;
}

// 玩法类核心模块（必须 ≥6 个有产物才允许出 deck，对应 level_type_rules.md 中"必生成 6 个"）
const CORE_MODULES = ['level_overview', 'bubble_chart', 'emotion_curve', 'asset_list', 'storyboard', 'tech_req'];

// ============================================================
//  主流程
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const portable = args.includes('--portable');
  const caseId = args.find(a => !a.startsWith('--'));
  if (!caseId) {
    console.error('用法: node render_deck.js <case_id> [--portable]');
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..');
  const casePath    = path.join(projectRoot, 'outputs', caseId);
  const irPath      = path.join(projectRoot, 'test_cases', caseId, 'ir_filled.json');
  const manifestPath = path.join(casePath, 'manifest.json');
  const templatePath = path.join(projectRoot, 'contracts/views/deck/template.html');
  const motionSrc    = path.join(projectRoot, 'contracts/views/deck/motion.min.js');
  const deckDir      = path.join(casePath, 'deck');
  const deckOut      = path.join(deckDir, 'index.html');
  const motionOut    = path.join(deckDir, 'motion.min.js');

  // 校验存在
  if (!fs.existsSync(manifestPath)) die(`manifest 不存在: ${manifestPath}`);
  if (!fs.existsSync(irPath))       die(`IR 不存在: ${irPath}`);
  if (!fs.existsSync(templatePath)) die(`template 不存在: ${templatePath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const ir       = JSON.parse(fs.readFileSync(irPath, 'utf-8'));

  // P0-5 manifest 双 gate（接受 confirmed 或 locked，locked 更严格）
  const irStatus = manifest.ir?.status;
  if (irStatus !== 'confirmed' && irStatus !== 'locked') {
    die(`P0-5 manifest gate: IR 状态需为 confirmed 或 locked (当前: ${irStatus})`);
  }
  if (manifest.assembly?.status !== 'assembled') {
    die(`P0-5 manifest gate: assembly 未 assembled (当前: ${manifest.assembly?.status})`);
  }

  // 玩法 vs 关卡术语切换（必须早于 acts 构造，act_divider 标题需要）
  const gameplay = isGameplay(ir.type, casePath);
  const term = gameplay ? TERM_MAP.gameplay : TERM_MAP.spatial;
  console.log(`> 类型: ${gameplay ? '玩法类' : '空间类'} (${ir.type}) → 术语: ${term.docCN}`);

  // 按 manifest 动态构造 acts（按 case_type 裁剪：skipped 或文件缺失模块跳过）
  const acts = buildActsFromManifest(manifest, casePath, term);
  const allModules = acts.flatMap(a => a.modules);

  // P0 校验：核心 6 模块必须齐
  const missingCore = CORE_MODULES.filter(m => !allModules.includes(m));
  if (missingCore.length > 0) {
    die(`P0-3 核心模块缺失: ${missingCore.join(', ')} (level_type_rules.md 要求必生成)`);
  }
  console.log(`> 模块: ${allModules.length} 个 (${allModules.join(' · ')})`);

  // 读 template + 应用主题
  let html = fs.readFileSync(templatePath, 'utf-8');
  const theme = THEME_MAPPING[ir.type] || FALLBACK_THEME;
  if (!THEME_MAPPING[ir.type]) {
    console.log(`> ⚠ case_type "${ir.type}" 未在 THEME_MAPPING 中，fallback 到 ${FALLBACK_THEME.name}`);
  }
  console.log(`> 主题: ${theme.name} (case_type=${ir.type || 'unknown'})`);

  html = applyTheme(html, theme);

  // title (按术语切换)
  const caseIndex = (caseId.match(/case_(\d+)/) || [, '00'])[1];
  html = html.replace(
    /<title>.*<\/title>/,
    `<title>${escapeHtml(ir.level_name || caseId)} · ${ir.type || ''} ${term.docCN} · Vol.${caseIndex}</title>`
  );

  // 生成 slides (1 cover + N acts + N modules + 1 coda; 不再含 open_loops)
  const slides = generateSlides(ir, manifest, caseIndex, acts, term);
  html = html.replace(/<!-- SLIDES_HERE -->/, slides);

  // 写出 + 拷贝 motion
  if (!fs.existsSync(deckDir)) fs.mkdirSync(deckDir, { recursive: true });
  fs.writeFileSync(deckOut, html);
  fs.copyFileSync(motionSrc, motionOut);

  console.log(`> 写出: ${deckOut}`);
  console.log(`> 拷贝: ${motionOut}`);

  // 自检
  const checks = runChecks(deckOut, manifest);
  reportChecks(checks);

  // 单文件版（可发群,无需服务器,无需同目录文件）
  if (portable) {
    const portableOut = path.join(deckDir, 'portable.html');
    const portableHtml = buildPortable(html, casePath);
    fs.writeFileSync(portableOut, portableHtml);
    const sizeMB = (fs.statSync(portableOut).size / 1024 / 1024).toFixed(1);
    console.log(`> 单文件: ${portableOut} (${sizeMB} MB)`);
    console.log(`  → 可直接发微信/钉钉,接收方双击打开即可`);
  }

  console.log(`\n打开浏览器: open ${deckOut}`);
  process.exit(checks.passed ? 0 : 1);
}

// ============================================================
//  Portable 模式 — 把 iframe src 替换为 srcdoc 内联模块全文
// ============================================================
//
// 为什么:
// - 默认 deck/index.html 的 iframe src="../{module}.html" 依赖同目录文件,转发到群里链接断裂
// - srcdoc 把模块 HTML 字符串直接嵌入 attribute,接收方双击单文件即可看完整内容
// - 代价: 文件 50-60MB(spatial_layout 含 base64 大图),发群慢但一次性
//
// 注意:
// - srcdoc 中只需转义 & 和 " (不需要 < > — attribute 解析器只看引号边界)
// - motion.min.js 仍走 CDN fallback(template 内置),离线会动效失效但内容可读
function buildPortable(html, casePath) {
  return html.replace(
    /<iframe\s+src="\.\.\/([^"]+)"([^>]*)>/g,
    (match, modFile, rest) => {
      const modPath = path.join(casePath, modFile);
      if (!fs.existsSync(modPath)) {
        console.warn(`! portable: 模块缺失,保留 src 引用: ${modFile}`);
        return match;
      }
      const content = fs.readFileSync(modPath, 'utf-8');
      const escaped = content.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return `<iframe srcdoc="${escaped}"${rest}>`;
    }
  );
}

// ============================================================
//  主题应用
// ============================================================

function applyTheme(html, theme) {
  const v = theme.vars;
  // 替换 :root 块里默认沙丘的 6 个变量定义行（template 里第一个非注释块）
  const replacements = [
    [/--ink:#[0-9a-fA-F]+;/,        `--ink:${v.ink};`],
    [/--ink-rgb:[0-9, ]+;/,         `--ink-rgb:${v.inkRgb};`],
    [/--paper:#[0-9a-fA-F]+;/,      `--paper:${v.paper};`],
    [/--paper-rgb:[0-9, ]+;/,       `--paper-rgb:${v.paperRgb};`],
    [/--paper-tint:#[0-9a-fA-F]+;/, `--paper-tint:${v.paperTint};`],
    [/--ink-tint:#[0-9a-fA-F]+;/,   `--ink-tint:${v.inkTint};`],
  ];
  for (const [pat, rep] of replacements) html = html.replace(pat, rep);
  return html;
}

// ============================================================
//  Slide 生成
// ============================================================

function generateSlides(ir, manifest, caseIndex, acts, term) {
  const moduleCount = acts.reduce((s, a) => s + a.modules.length, 0);
  // 1 cover + N acts + N modules + 1 coda（不再有 open_loops）
  const totalPages  = 1 + acts.length + moduleCount + 1;

  const out = [];
  let page = 1;

  out.push(renderCover(ir, totalPages, page++, caseIndex, term));

  for (const act of acts) {
    out.push(renderActDivider(act, totalPages, page++));
    for (const mod of act.modules) {
      out.push(renderModuleWrap(mod, totalPages, page++, term));
    }
  }

  out.push(renderCoda(ir, manifest, totalPages, page++, moduleCount, acts.length, term));

  return out.join('\n\n');
}

// 按 manifest 状态过滤每个 act 的模块（保留有产物且未 skipped 的）
// term 用于 act_divider 标题（关卡 vs 玩法）
function buildActsFromManifest(manifest, casePath, term) {
  const isUsable = (m) => {
    const ms = manifest.modules?.[m];
    if (ms && ms.status === 'skipped') return false;
    return fs.existsSync(path.join(casePath, `${m}.html`));
  };

  const isGameplayTerm = term === TERM_MAP.gameplay;
  return ACT_TEMPLATE
    .map(act => ({
      act: act.act,
      title: isGameplayTerm ? act.titleGameplay : act.titleSpatial,
      titleEn: act.titleEn,
      theme: act.theme,
      modules: act.modules_default.filter(isUsable),
    }))
    .filter(act => act.modules.length > 0);
}

function renderCover(ir, total, page, caseIndex, term) {
  const date = new Date().toISOString().slice(0, 10);
  const yyyymm = date.slice(0, 7);
  const year = date.slice(0, 4);
  const tone = (ir.FEEL?.overall_tone || '').slice(0, 200);
  const lastMod = (ir.last_modified || date).slice(0, 10);
  const ver = ir.version || '?';

  return `<!-- ============ ${stamp(page)} cover ============ -->
<section class="slide hero dark">
  <div class="chrome">
    <div>${escapeHtml(ir.level_id || '')} · ${ir.type || ''}</div>
    <div>Vol.${caseIndex} · ${yyyymm}</div>
  </div>
  <div class="frame" style="display:grid; gap:4vh; align-content:center; min-height:80vh">
    <div class="kicker" data-anim>${ir.type || ''} · ${term.docCN}</div>
    <h1 class="h-hero" data-anim>${escapeHtml(ir.level_name || '')}</h1>
    <p class="lead" style="max-width:62vw" data-anim>${escapeHtml(tone)}</p>
    <div class="meta-row" data-anim>
      <span>${escapeHtml(ir.level_id || '')}</span><span>·</span><span>v${ver}</span><span>·</span><span>${lastMod}</span>
    </div>
  </div>
  <div class="foot">
    <div>${term.docCN} · ${term.docEN}</div>
    <div>— LevelAgent · ${year} —</div>
  </div>
</section>`;
}

function renderActDivider(act, total, page) {
  const moduleNames = act.modules.join(' / ');
  return `<!-- ============ ${stamp(page)} act_divider Act ${roman(act.act)} ============ -->
<section class="slide ${act.theme}">
  <div class="chrome">
    <div>Act ${roman(act.act)} · ${act.title}</div>
    <div>Act ${roman(act.act)} · ${pad(page)} / ${pad(total)}</div>
  </div>
  <div class="frame" style="display:grid; gap:6vh; align-content:center; min-height:80vh">
    <div class="kicker" data-anim>Act ${roman(act.act)}</div>
    <h1 class="h-hero" style="font-size:8.5vw" data-anim>${act.title}</h1>
    <p class="lead" style="max-width:55vw" data-anim>本幕含 ${act.modules.length} 个模块 · ${moduleNames}</p>
  </div>
  <div class="foot">
    <div>第${act.act}幕 · ${act.titleEn}</div>
    <div>— · —</div>
  </div>
</section>`;
}

function renderModuleWrap(moduleName, total, page, term) {
  const desc = moduleDesc(moduleName, term);
  const nameZh = moduleNameZh(moduleName, term);
  return `<!-- ============ ${stamp(page)} module_wrap · ${moduleName} ============ -->
<section class="slide light">
  <div class="chrome">
    <div>${moduleName} · ${nameZh}</div>
    <div>${pad(page)} / ${pad(total)}</div>
  </div>
  <div style="padding:5vh 4vw 2vh; display:flex; flex-direction:column; height:100vh; box-sizing:border-box">
    <div class="kicker" style="margin-bottom:1vh">Module · ${desc}</div>
    <iframe src="../${moduleName}.html" loading="lazy"
            style="flex:1; width:100%; border:1px solid rgba(var(--ink-rgb),.15); background:#fff; border-radius:2px;"></iframe>
  </div>
  <div class="foot">
    <div>来源 · ${moduleName}.html</div>
    <div>Page ${pad(page)} · ${moduleName}</div>
  </div>
</section>`;
}

// 注: renderOpenLoops 已删除 (v2.5.5)
// 原因: uncertainty_flags 早在主流程中就被用户标为"log 噪音"删除 (changelog v? line 46)，不应在 deck 中重新出现
// 不要再加回。如需展示未决项，应在 module 级（如 level_overview）按各 module 的契约决定，不归 deck 视图层管。

function renderCoda(ir, manifest, total, page, moduleCount, actCount, term) {
  const date = new Date().toISOString().slice(0, 10);
  const year = date.slice(0, 4);
  const ver = ir.version || '?';
  const docTag = term.docTag;

  // coda 文案哲学:
  // - 不写实现细节(iframe / render_deck 版本号 / "杂志感字体")
  // - 不写主流程内部状态(auto_score / passed/pending)
  // - 写读者关心的:N 个模块的设计稿就绪了 / 下一步制作团队该做什么 / 元数据可追溯

  return `<!-- ============ ${stamp(page)} coda ============ -->
<section class="slide hero light">
  <div class="chrome">
    <div>End of Document · 文档结束</div>
    <div>${pad(page)} / ${pad(total)}</div>
  </div>
  <div class="frame" style="display:grid; gap:5vh; align-content:center; min-height:80vh">
    <div class="kicker" data-anim>${escapeHtml(ir.level_name || '')}</div>
    <h1 class="h-hero" style="font-size:7vw; line-height:1.2" data-anim>${docTag}设计稿完成。</h1>
    <p class="lead" style="max-width:62vw" data-anim>
      ${moduleCount} 个模块 · ${actCount} 幕 · 共 ${total} 页。<br>
      下一步：白盒搭建 → 灯光烘焙 → 节点级 QA 测试。
    </p>
    <div class="meta-row" data-anim style="margin-top:2vh">
      <span>${escapeHtml(ir.level_id || '')}</span><span>·</span><span>v${ver}</span><span>·</span><span>${date}</span>
    </div>
  </div>
  <div class="foot">
    <div>${term.docCN} · ${escapeHtml(ir.level_name || '')}</div>
    <div>— LevelAgent · ${year} —</div>
  </div>
</section>`;
}

// ============================================================
//  自检
// ============================================================

function runChecks(deckPath, manifest) {
  const html = fs.readFileSync(deckPath, 'utf-8');
  const errors = [];
  const warnings = [];

  // P0-1 占位符残留
  if (/\{\{[A-Z_]+\}\}|\[必填\]|\bTODO\b/.test(html)) {
    errors.push('P0-1 占位符残留');
  }

  // P0-2 主题节奏（先 strip 掉所有 HTML 注释，避免命中模板多行注释里的 '<section class="slide ..."> 页面' 示例文本）
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  const themes = [...stripped.matchAll(/<section\s+class="slide ([^"]+)"/g)].map(m => m[1]);
  if (!themes.some(t => t.includes('hero dark')))  errors.push('P0-2 缺少 hero dark');
  if (!themes.some(t => t.includes('hero light'))) errors.push('P0-2 缺少 hero light');

  // P0-4 iframe lazy
  const iframes = html.match(/<iframe[^>]*>/g) || [];
  for (const ifr of iframes) {
    if (!/loading="lazy"/.test(ifr)) {
      errors.push('P0-4 iframe 缺少 loading="lazy"');
      break;
    }
  }

  // P0-5 redundant safety
  const s = manifest.ir?.status;
  if (s !== 'confirmed' && s !== 'locked') errors.push('P0-5 IR 状态非 confirmed/locked');

  // 信息：iframe / slide 数
  warnings.push(`info: ${themes.length} slides · ${iframes.length} iframes`);

  return { errors, warnings, passed: errors.length === 0 };
}

function reportChecks(checks) {
  console.log('\n=== 自检 ===');
  if (checks.errors.length === 0) {
    console.log('  ✓ 全部 P0 通过');
  } else {
    console.log('  ✗ 错误:');
    checks.errors.forEach(e => console.log(`    - ${e}`));
  }
  if (checks.warnings.length > 0) {
    checks.warnings.forEach(w => console.log(`    ${w}`));
  }
}

// ============================================================
//  工具
// ============================================================

function stamp(n) { return `SLIDE ${pad(n)}`; }
function pad(n) { return String(n).padStart(2, '0'); }
function roman(n) { return ['', 'I', 'II', 'III', 'IV', 'V'][n] || String(n); }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

main();
