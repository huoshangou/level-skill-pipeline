/**
 * fill_template.js — 通用模板填充引擎
 *
 * 读取模块 HTML 模板 + IR 切片数据 → 机械填充 → 输出完整 HTML
 * 对于纯数据映射模块（asset_list 等）可完全替代 LLM 生成。
 *
 * 模板语法:
 *   {{placeholder}}                    → 简单值替换
 *   <!-- REPEAT: description -->       → 后面紧跟的 <tr>...</tr> 块按数组重复
 *   <!-- REPEAT-SECTION: description -->→ 后面紧跟的 <div class="table-section">...</div> 整块重复
 *
 * 用法（CLI）:
 *   node pipeline/fill_template.js <case_dir> <module_key> [--dry-run]
 *   node pipeline/fill_template.js outputs/case_01_truck asset_list
 *
 * 用法（模块）:
 *   const { renderTemplate, fillModule } = require('./fill_template');
 */

const fs = require('fs');
const path = require('path');
const { sliceForModule } = require('./lib/slice_ir');
const extractorsLib = require('./lib/extractors');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTRACTS_DIR = path.join(PROJECT_ROOT, 'contracts', 'skills');

// ============================================================================
// 通用模板渲染引擎
// ============================================================================

/**
 * 替换字符串中的 {{placeholder}}
 */
function replaceVars(str, vars) {
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return vars[key] !== undefined ? String(vars[key]) : match;
    });
}

/**
 * 渲染模板：替换 {{vars}} + 处理 REPEAT 块
 *
 * @param {string} templateHtml - 模板 HTML
 * @param {object} data - { vars: {}, repeats: [ { id: "repeatId", items: [{...}, ...] }, ... ] }
 * @returns {string} 渲染后的 HTML
 */
function renderTemplate(templateHtml, data) {
    let html = templateHtml;

    // 1. 处理 SECTION 级别的 REPEAT（必须先于行级 REPEAT，避免内嵌 REPEAT 被提前消费）
    html = processSectionRepeats(html, data.sections || []);

    // 2. 处理 ROW 级别的 REPEAT（<tr> 块）
    html = processRowRepeats(html, data.repeats || []);

    // 3. 替换剩余的 {{vars}}
    html = replaceVars(html, data.vars || {});

    return html;
}

/**
 * 处理 <tr> 级别的 REPEAT 块
 * 按模板中出现的顺序与 repeats 数组对应
 */
/**
 * 通用 REPEAT 块处理器 v3
 *
 * 支持任意 HTML/SVG 元素类型的重复：
 *   <tr>, <div>, <li>, <circle>, <text>, <path>, <rect> 等
 *
 * 3 种匹配模式：
 *   1. <!-- /REPEAT --> 结束标记：取 REPEAT 注释与 /REPEAT 注释之间的全部内容
 *   2. 自闭合标签（<circle ... />）：整个标签是重复块
 *   3. 开闭合标签（<div>...</div>）：通过同名标签层级计数找到闭标签
 *
 * 跳过 REPEAT 后不紧跟元素标签的情况（如后跟 </div> 或另一个注释）
 */
function processRowRepeats(html, repeats) {
    // 找到所有 <!-- REPEAT: ... --> 注释
    const commentRe = /<!--\s*REPEAT:.*?-->/g;
    const comments = [];
    let cm;
    while ((cm = commentRe.exec(html)) !== null) {
        comments.push({ index: cm.index, length: cm[0].length });
    }
    if (comments.length === 0 || !repeats || repeats.length === 0) return html;

    // 正向扫描：为每个 REPEAT 确定其重复块的范围
    const blocks = []; // { start, end, repeatIdx }
    let repeatIdx = 0;

    for (const comment of comments) {
        const afterPos = comment.index + comment.length;
        const afterStr = html.substring(afterPos);

        // 跳过空白和非 REPEAT 注释（如 <!-- Critical region -->）
        const leadMatch = afterStr.match(/^(\s*(?:<!--(?!\s*\/REPEAT)(?!\s*REPEAT:)[^]*?-->\s*)*)/);
        const leadLen = leadMatch ? leadMatch[0].length : 0;
        const contentStart = afterPos + leadLen;
        const contentStr = html.substring(contentStart);

        // 模式 1: 检查是否有 <!-- /REPEAT --> 结束标记
        const endMarker = '<!-- /REPEAT -->';
        const endMarkerIdx = html.indexOf(endMarker, contentStart);
        if (endMarkerIdx > 0 && endMarkerIdx < html.indexOf('<!-- REPEAT:', contentStart + 1) ||
            (endMarkerIdx > 0 && html.indexOf('<!-- REPEAT:', contentStart + 1) < 0)) {
            // 取 contentStart 到 endMarker 之间的内容
            const blockContent = html.substring(contentStart, endMarkerIdx).trim();
            if (blockContent.length > 0) {
                blocks.push({
                    start: comment.index,
                    end: endMarkerIdx + endMarker.length,
                    template: blockContent,
                    repeatIdx: repeatIdx++,
                });
                continue;
            }
        }

        // 检查是否紧跟一个 HTML 标签（跳过闭标签如 </div>）
        const tagMatch = contentStr.match(/^(\s*)(<([a-zA-Z][a-zA-Z0-9]*)\b)/);
        if (!tagMatch) continue; // 不紧跟元素标签，跳过此 REPEAT

        const wsLen = tagMatch[1].length;
        const tagName = tagMatch[3];
        const elemStartPos = contentStart + wsLen;

        // 模式 2: 自闭合标签
        const selfCloseMatch = contentStr.substring(wsLen).match(new RegExp(`^<${tagName}\\b[^>]*/>`));
        if (selfCloseMatch) {
            blocks.push({
                start: comment.index,
                end: elemStartPos + selfCloseMatch[0].length,
                template: selfCloseMatch[0],
                repeatIdx: repeatIdx++,
            });
            continue;
        }

        // 模式 3: 开闭合标签——通过层级计数找闭标签
        let depth = 0;
        let endIdx = elemStartPos;

        const openTag = '<' + tagName;     // e.g. "<tr"
        const closeTag = '</' + tagName + '>'; // e.g. "</tr>"

        let found = false;
        for (let i = elemStartPos; i < html.length; i++) {
            if (html.substring(i, i + openTag.length) === openTag &&
                /[\s>\/]/.test(html[i + openTag.length] || '')) {
                depth++;
            }
            if (html.substring(i, i + closeTag.length) === closeTag) {
                depth--;
                if (depth === 0) {
                    endIdx = i + closeTag.length;
                    found = true;
                    break;
                }
            }
        }

        if (!found) continue;

        const blockContent = html.substring(elemStartPos, endIdx);
        blocks.push({
            start: comment.index,
            end: endIdx,
            template: blockContent,
            repeatIdx: repeatIdx++,
        });
    }

    // 反向替换（从后往前，避免索引偏移）
    let result = html;
    for (let bi = blocks.length - 1; bi >= 0; bi--) {
        const block = blocks[bi];
        const items = repeats[block.repeatIdx];

        let replacement;
        if (!items || items.length === 0) {
            // 检查是否是 <tr>，生成"暂无数据"行
            if (block.template.trim().startsWith('<tr')) {
                const colCount = (block.template.match(/<td/g) || []).length;
                replacement = `<tr><td colspan="${colCount}" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>`;
            } else {
                replacement = '';
            }
        } else {
            replacement = items.map(item => replaceVars(block.template, item)).join('\n');
        }

        result = result.substring(0, block.start) + replacement + result.substring(block.end);
    }

    return result;
}

/**
 * 处理 <div class="table-section"> 级别的 REPEAT 块
 * 匹配 <!-- REPEAT: ... --> 后面的整个 table-section div（含内嵌的 REPEAT 行）
 * 替换为预生成的 sections HTML
 */
function processSectionRepeats(html, sections) {
    if (!sections || sections.length === 0) return html;

    // 找 <!-- REPEAT: ... --> 紧跟的第一个 <div（支持 table-section / beat-section 等）
    const commentPattern = /<!--\s*REPEAT:[\s\S]*?-->\s*\n?\s*<div\s/;
    const commentMatch = html.match(commentPattern);
    if (!commentMatch) return html;

    const startIdx = commentMatch.index;
    // 找到 REPEAT 注释后第一个 <div 的位置
    const afterComment = html.indexOf('-->', startIdx) + 3;
    const divStart = html.indexOf('<div', afterComment);
    if (divStart < 0) return html;

    // 通过 div 层级计数找到该 div 的关闭标签
    let depth = 0;
    let endIdx = divStart;
    for (let i = divStart; i < html.length; i++) {
        if (html.substring(i, i + 4) === '<div') {
            depth++;
        } else if (html.substring(i, i + 6) === '</div>') {
            depth--;
            if (depth === 0) {
                endIdx = i + 6;
                break;
            }
        }
    }

    // 检查紧跟的同级 div（如 beat-divider）也一并替换
    const afterFirstDiv = html.substring(endIdx);
    const nextDivMatch = afterFirstDiv.match(/^\s*\n?\s*<!--[^>]*-->\s*\n?\s*<div\s/);
    if (!nextDivMatch) {
        // 也检查无注释的紧跟 div（如 beat-divider）
        const plainDivMatch = afterFirstDiv.match(/^\s*\n?\s*<div\s/);
        if (plainDivMatch) {
            let d2 = 0;
            const d2Start = endIdx + plainDivMatch.index + afterFirstDiv.indexOf('<div');
            for (let i = d2Start; i < html.length; i++) {
                if (html.substring(i, i + 4) === '<div') d2++;
                else if (html.substring(i, i + 6) === '</div>') {
                    d2--;
                    if (d2 === 0) { endIdx = i + 6; break; }
                }
            }
        }
    }

    const before = html.substring(0, startIdx);
    const after = html.substring(endIdx);
    return before + sections.join('\n\n    ') + after;
}

// ============================================================================
// 模块数据提取器注册表
// ============================================================================
const extractors = {};

/**
 * 注册模块数据提取器
 */
function registerExtractor(moduleKey, fn) {
    extractors[moduleKey] = fn;
}

// ============================================================================
// asset_list 提取器
// ============================================================================
registerExtractor('asset_list', function (irSlice) {
    const assets = irSlice.ASSET?.required_assets || [];
    const reuseCandidates = irSlice.ASSET?.reuse_candidates || [];
    const regions = irSlice.SPACE?.regions || [];

    // 统计
    const total = assets.length;
    const mustCount = assets.filter(a => a.priority === 'must_have').length;
    const niceCount = total - mustCount;
    const typeSet = new Set(assets.map(a => a.type));
    const typeCount = typeSet.size;

    // 按类型分组
    const groups = {};
    for (const asset of assets) {
        const type = asset.type || 'other';
        if (!groups[type]) groups[type] = [];
        groups[type].push(asset);
    }

    // 类型显示名映射
    const typeLabels = {
        mesh: 'Mesh 模型', vfx: 'VFX 特效', animation: 'Animation 动画',
        sound: 'Sound 音频', ui: 'UI 界面', texture: 'Texture 贴图',
        other: '其他',
    };

    // 区域 ID → 名称映射
    const regionMap = {};
    for (const r of regions) {
        regionMap[r.id] = r.name;
    }

    // 生成分类 section HTML
    const sectionTemplate = `    <div class="table-section">
        <div class="table-section-title">{{section_title}}</div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr><th>#</th><th>资产 ID</th><th>名称 / 描述</th><th>数量</th><th>放置区域</th><th>优先级</th></tr>
                </thead>
                <tbody>
{{rows}}
                </tbody>
            </table>
        </div>
    </div>`;

    const sections = [];
    let globalIndex = 1;

    for (const [type, items] of Object.entries(groups)) {
        const label = typeLabels[type] || type;
        const title = `${label}（${items.length}项）`;
        const typeTag = type; // css class

        const rows = items.map(asset => {
            const priorityTag = asset.priority === 'must_have' ? 'must' : 'nice';
            const priorityLabel = asset.priority === 'must_have' ? 'MUST' : 'NICE';
            const regionName = regionMap[asset.region] || asset.notes?.match(/放置区域[：:]\s*(.+)/)?.[1] || '—';

            const row = `                    <tr>
                        <td>${globalIndex}</td>
                        <td><code>${asset.id}</code></td>
                        <td>${asset.notes || asset.name || asset.id}</td>
                        <td>${asset.count || 1}</td>
                        <td>${regionName}</td>
                        <td><span class="tag ${priorityTag}">${priorityLabel}</span> <span class="tag ${typeTag}">${type.toUpperCase()}</span></td>
                    </tr>`;
            globalIndex++;
            return row;
        });

        const sectionHtml = sectionTemplate
            .replace('{{section_title}}', title)
            .replace('{{rows}}', rows.join('\n'));
        sections.push(sectionHtml);
    }

    // 复用候选行
    const reuseRows = reuseCandidates.length > 0
        ? reuseCandidates.map(rc => ({
            reuse_source_level: rc.source_level || '—',
            reuse_asset_id: rc.asset_id || '—',
            reuse_note: rc.note || '—',
        }))
        : [{ reuse_source_level: '—', reuse_asset_id: '—', reuse_note: '暂无可复用资产' }];

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            type: irSlice.type || '',
            timestamp: new Date().toISOString().split('T')[0],
            total_assets: total,
            must_have_count: mustCount,
            nice_to_have_count: niceCount,
            asset_type_count: typeCount,
        },
        sections,           // 预生成的分类 section HTML
        repeats: [reuseRows], // 第一个 REPEAT 被 sections 覆盖，第二个是复用候选
    };
});

// ============================================================================
// level_overview 提取器（gameplay 变体）
// ============================================================================
registerExtractor('level_overview', function (irSlice) {
    const isGameplay = GAMEPLAY_TYPES.includes(irSlice.type);

    // 基础 vars（POI 和 gameplay 共用）
    const vars = {
        level_id: irSlice.level_id || '',
        level_name: irSlice.level_name || '',
        type: irSlice.type || '',
        version: irSlice.version || '1.0.0',
        timestamp: new Date().toISOString().split('T')[0],
    };

    const pendingConfirms = [];

    if (isGameplay) {
        // === Gameplay 变体 ===
        const mechanics = irSlice.MECHANIC?.mechanics || [];
        const deps = irSlice.SYSTEM?.dependencies || [];
        const constraints = irSlice.SYSTEM?.constraints || [];
        const nodes = irSlice.FLOW?.nodes || [];
        const tone = irSlice.FEEL?.overall_tone || '';

        // 基本信息
        vars.one_line_summary = tone;
        vars.references = '[待确认]';
        vars.participant_count = '1';
        vars.duration = '[待确认]';
        vars.trigger_condition = '[待确认]';
        vars.completion_condition = '[待确认]';
        vars.abort_condition = '[待确认]';
        vars.is_reusable = '[待确认]';
        vars.is_reusable_tag = 'yes';
        vars.reusable_detail = '';

        // 收集需确认项（ir_path: 对应 IR JSON 路径，confirm.js 据此写回；其余模块 TODO: 补充 ir_path）
        pendingConfirms.push(
            { field: '参考作品', currentValue: vars.references, hint: '有哪些参考游戏/玩法？', ir_path: 'meta.references' },
            { field: '预计单次时长', currentValue: vars.duration, hint: '单次玩法循环耗时', ir_path: 'meta.duration_estimate' },
            { field: '触发条件', currentValue: vars.trigger_condition, hint: '玩家如何进入此玩法', ir_path: 'FLOW.trigger_condition' },
            { field: '完成条件', currentValue: vars.completion_condition, hint: '什么算完成', ir_path: 'FLOW.completion_condition' },
            { field: '中止条件', currentValue: vars.abort_condition, hint: '什么情况下被打断/退出', ir_path: 'FLOW.abort_condition' },
            { field: '是否可复用', currentValue: vars.is_reusable, hint: '各类机制是否均可跨情境复用', ir_path: 'meta.is_reusable' },
        );

        // 机制卡片 REPEAT
        const mechCards = mechanics.map(m => ({
            mech_name: m.name || m.id,
            mech_description: m.description || '',
            mech_category: m.category || '—',
            mech_constraints: '[待确认]',
        }));

        // 3C 需求表 REPEAT
        const threecDims = ['移动', 'Camera', 'Locomotion', '战斗', '手持物', '角色切换'];
        const threecRows = threecDims.map(dim => ({
            threec_dimension: dim,
            threec_requirement: '[待确认]',
            threec_note: '',
        }));

        // 合作需求清单（固定 22 项，从 IR.SYSTEM.dependencies 推导默认值）
        const depNames = deps.map(d => (d.system || d.name || '').toLowerCase());
        for (let i = 1; i <= 22; i++) {
            vars[`req_${String(i).padStart(2, '0')}`] = '—';
            vars[`req_${String(i).padStart(2, '0')}_note`] = '';
        }

        // 每个 3C 和合作需求项都需确认
        // TODO(ir_path): 3C/合作需求无直接 IR 路径，confirm.js 写入 confirmed_fields fallback
        pendingConfirms.push(
            { field: '3C 需求表', currentValue: '6 项待填', hint: '移动/Camera/Locomotion/战斗/手持物/角色切换的具体约束' },
            { field: '合作需求清单', currentValue: '22 项待填', hint: '11 组合作需求的是/否判断' },
        );

        // 机制约束也需确认
        // TODO(ir_path): 机制约束需 MECHANIC.mechanics[name].constraints 路径，待 M1 asset_binding.md 规范后补充
        for (const m of mechanics) {
            pendingConfirms.push({
                field: `${m.name || m.id} 玩家行为约束`,
                currentValue: '[待确认]',
                hint: `该机制下玩家输入锁定/操作限制`,
            });
        }

        return { vars, repeats: [mechCards, threecRows], pendingConfirms };

    } else {
        // === POI 变体（沿用原有逻辑，deterministic 填充） ===
        const regions = irSlice.SPACE?.regions || [];
        const nodes = irSlice.FLOW?.nodes || [];
        const tone = irSlice.FEEL?.overall_tone || '';
        const mechanics = irSlice.MECHANIC?.mechanics || [];
        const assets = irSlice.ASSET?.required_assets || [];
        const deps = irSlice.SYSTEM?.dependencies || [];
        const constraints = irSlice.SYSTEM?.constraints || [];
        const uncertainties = irSlice.uncertainty_flags || [];

        vars.flow_type = '半开放';
        vars.flow_tier = 'T2';
        vars.duration = '15-20分钟';
        vars.scale = regions.length > 0 ? `${regions.length} 个区域` : '—';
        vars.atmosphere = tone;
        vars.is_team = '否'; vars.is_team_tag = 'no'; vars.team_detail = '';
        vars.is_char_limit = '否'; vars.is_char_limit_tag = 'no'; vars.char_limit_detail = '';
        vars.is_loading = '否'; vars.is_loading_tag = 'no';
        vars.is_timed = '否'; vars.is_timed_tag = 'no'; vars.timed_detail = '';
        vars.one_line_summary = tone;
        // 从 IR.FEEL 推导体验三维
        const feelBeats = irSlice.FEEL?.emotional_beats || [];
        const hasIntensity = feelBeats.some(b => (b.intensity || 0) > 0.7);
        const hasDread = feelBeats.some(b => b.emotion === 'dread');
        vars.fantasy_desc = hasDread ? '潜入黑帮大宅的深夜行动者，在和风建筑中穿行于权力与危险之间' : tone;
        vars.challenge_desc = hasIntensity ? '信息拼图 + 潜行 + 突发战斗的复合挑战' : '以观察和探索为主的低强度挑战';
        vars.sensation_desc = '和风美学 × 黑色电影：灯笼暖光、剪影、高反差、水面倒影';
        vars.design_notes = tone;
        vars.flow_summary = nodes.map(n => n.name || n.id).join(' → ');

        return { vars, repeats: [] };
    }
});

// ============================================================================
// 批量注册 lib/extractors.js 中的提取器
// ============================================================================
registerExtractor('lighting_req', extractorsLib.extractLightingReq);
registerExtractor('vfx_req', extractorsLib.extractVfxReq);
registerExtractor('audio_req', extractorsLib.extractAudioReq);
registerExtractor('atmosphere_ref', extractorsLib.extractAtmosphereRef);
registerExtractor('tech_req', extractorsLib.extractTechReq);
registerExtractor('emotion_curve', extractorsLib.extractEmotionCurve);
registerExtractor('spatial_layout', extractorsLib.extractSpatialLayout);
registerExtractor('storyboard', extractorsLib.extractStoryboard);
registerExtractor('bubble_chart', extractorsLib.extractBubbleChart);

// ============================================================================
// 模板变体路由
// ============================================================================
const GAMEPLAY_TYPES = ['OpenWorldEvent', 'OpenWorldChallenge'];

/**
 * 根据 IR.type 选择模板文件路径
 * gameplay 类型优先使用 template_gameplay.html（如存在）
 */
function resolveTemplatePath(moduleKey, irType) {
    const isGameplay = GAMEPLAY_TYPES.includes(irType);
    if (isGameplay) {
        const gameplayPath = path.join(CONTRACTS_DIR, moduleKey, 'template_gameplay.html');
        if (fs.existsSync(gameplayPath)) {
            return { path: gameplayPath, variant: 'gameplay' };
        }
    }
    const defaultPath = path.join(CONTRACTS_DIR, moduleKey, 'template.html');
    return { path: defaultPath, variant: 'default' };
}

// ============================================================================
// 通用入口：填充指定模块
// ============================================================================
function fillModule(irData, moduleKey, options) {
    const extractor = extractors[moduleKey];
    if (!extractor) {
        return { success: false, error: `无数据提取器: ${moduleKey}（可用: ${Object.keys(extractors).join(', ')}）` };
    }

    // 1. 切片 IR（额外注入 type 字段，模板头部常用）
    const { sliced, report } = sliceForModule(irData, moduleKey);
    if (irData.type && !sliced.type) sliced.type = irData.type;

    // 2. 读取模板（v2.3: 模板变体路由）
    const templateInfo = resolveTemplatePath(moduleKey, irData.type);
    if (!fs.existsSync(templateInfo.path)) {
        return { success: false, error: `模板不存在: ${templateInfo.path}` };
    }
    const template = fs.readFileSync(templateInfo.path, 'utf-8');

    // 3. 提取数据（传入 options.caseDir 供需要读取外部文件的提取器使用）
    const caseDir = options?.caseDir || null;
    const data = extractor(sliced, caseDir);

    // 4. 渲染
    const html = renderTemplate(template, data);

    // 5. 收集 pendingConfirms（v2.3: HITL 确认机制）
    const pendingConfirms = data.pendingConfirms || [];

    return {
        success: true,
        html,
        irReport: report,
        templateVariant: templateInfo.variant,
        pendingConfirms,
    };
}

/**
 * 获取已支持的模块列表
 */
function getSupportedModules() {
    return Object.keys(extractors);
}

// ============================================================================
// CLI
// ============================================================================
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('用法: node pipeline/fill_template.js <case_dir> <module_key> [--dry-run]');
        console.log(`\n已支持的模块: ${getSupportedModules().join(', ')}`);
        process.exit(1);
    }

    const caseDirArg = args[0];
    const moduleKey = args[1];
    const dryRun = args.includes('--dry-run');

    const caseDir = path.isAbsolute(caseDirArg)
        ? caseDirArg
        : path.join(PROJECT_ROOT, caseDirArg);

    // 找 IR
    const caseId = path.basename(caseDir);
    const irCandidates = [
        path.join(PROJECT_ROOT, 'test_cases', caseId, 'ir_filled.json'),
        path.join(caseDir, 'ir_filled.json'),
    ];
    const irPath = irCandidates.find(p => fs.existsSync(p));
    if (!irPath) {
        console.error(`找不到 ir_filled.json`);
        process.exit(1);
    }
    const irData = JSON.parse(fs.readFileSync(irPath, 'utf-8'));

    console.log(`模块: ${moduleKey}`);
    console.log(`IR: ${irPath} (v${irData.version || '?'})`);

    const result = fillModule(irData, moduleKey, { caseDir: caseDir });

    if (!result.success) {
        console.error(`错误: ${result.error}`);
        process.exit(1);
    }

    console.log(`IR 切片: ${result.irReport.found.length} found, ${result.irReport.missing.length} missing`);
    console.log(`输出: ${result.html.length} bytes`);

    if (dryRun) {
        console.log('\n--- DRY RUN: 预览前 80 行 ---');
        const lines = result.html.split('\n');
        console.log(lines.slice(0, 80).join('\n'));
        if (lines.length > 80) console.log(`... (共 ${lines.length} 行)`);
    } else {
        const outPath = path.join(caseDir, `${moduleKey}.html`);
        fs.writeFileSync(outPath, result.html, 'utf-8');
        console.log(`已写入: ${outPath}`);
    }
}

module.exports = { renderTemplate, replaceVars, fillModule, registerExtractor, getSupportedModules };
