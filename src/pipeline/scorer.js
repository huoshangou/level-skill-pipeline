#!/usr/bin/env node
/**
 * scorer.js — 自动评分脚本
 *
 * 用法: node pipeline/scorer.js <case_dir>
 * 示例: node pipeline/scorer.js outputs/case_01_truck
 *
 * 对模块产物执行 4 维度自动评分，输出 score_report.json 并更新 manifest。
 */

const fs = require('fs');
const path = require('path');
const manifest = require('./lib/manifest');
const validateIr = require('./lib/validate_ir');

const caseDir = process.argv[2];
if (!caseDir) {
    console.error('用法: node pipeline/scorer.js <case_dir>');
    process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const casePath = path.resolve(projectRoot, caseDir);

// 加载 manifest 和 IR
const mf = manifest.load(casePath);
if (!mf) {
    console.error(`找不到 manifest: ${casePath}/manifest.json`);
    process.exit(1);
}

const caseId = mf.case_id || path.basename(casePath);
const irPath = path.join(projectRoot, 'test_cases', caseId, 'ir_filled.json');
let ir = null;
if (fs.existsSync(irPath)) {
    ir = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
}

// ===== 评分维度 =====

/**
 * 维度 1: 结构完整性 (30%)
 */
function scoreStructure() {
    const checks = [];
    let score = 1.0;

    // 1.1 模块数量完整性（跳过 skipped 模块）
    const progress = manifest.getProgress(mf);
    const existCount = progress.locked + progress.confirmed + progress.generated;
    const effectiveTotal = progress.effective_total || progress.total;
    const ratio = effectiveTotal > 0 ? existCount / effectiveTotal : 1.0;
    checks.push({ check: 'module_count', result: `${existCount}/${effectiveTotal}(skipped:${progress.skipped})`, pass: ratio >= 1.0 });
    if (ratio < 1.0) score -= (1.0 - ratio) * 0.3;

    // 1.2 各模块文件存在（跳过 skipped 模块）
    for (const key of manifest.MODULE_ORDER) {
        const moduleStatus = manifest.getModuleStatus(mf, key);
        if (moduleStatus === 'skipped') {
            checks.push({ check: `file_exists:${key}`, result: 'skipped', pass: true, note: '按类型规则跳过' });
            continue;
        }
        const filePath = path.join(casePath, `${key}.html`);
        const exists = fs.existsSync(filePath);
        checks.push({ check: `file_exists:${key}`, result: exists, pass: exists });
        if (!exists) score -= 0.05;
    }

    // 1.3 IR 存在且有效
    if (ir) {
        const validation = validateIr.validateAll(ir);
        checks.push({ check: 'ir_valid', result: validation.summary, pass: validation.valid });
        if (!validation.valid) score -= 0.1;
    } else {
        checks.push({ check: 'ir_valid', result: 'IR not found', pass: false });
        score -= 0.2;
    }

    // 1.4 节点数合理性
    if (ir?.FLOW?.nodes) {
        const nodeCount = ir.FLOW.nodes.length;
        const reasonable = nodeCount <= 15;
        checks.push({ check: 'node_count', result: nodeCount, pass: reasonable, warning: !reasonable });
        if (!reasonable) score -= 0.05;
    }

    return { dimension: 'structure_completeness', weight: 0.3, score: Math.max(0, score), checks };
}

/**
 * 维度 2: 一致性 (30%)
 */
function scoreConsistency() {
    const checks = [];
    let score = 1.0;

    if (!ir) return { dimension: 'consistency', weight: 0.3, score: 0.5, checks: [{ check: 'ir_missing', pass: false }] };

    const nodeNames = new Set((ir.FLOW?.nodes || []).map(n => n.name));
    const regionNames = new Set((ir.SPACE?.regions || []).map(r => r.name));

    // 2.1 跨模块节点名引用一致
    // 检查 emotion_curve 和 tech_req 是否引用了正确的节点名
    for (const key of ['emotion_curve', 'tech_req', 'storyboard']) {
        const filePath = path.join(casePath, `${key}.html`);
        if (!fs.existsSync(filePath)) continue;

        const html = fs.readFileSync(filePath, 'utf-8');
        let matchCount = 0;
        for (const name of nodeNames) {
            if (html.includes(name)) matchCount++;
        }
        const coverage = nodeNames.size > 0 ? matchCount / nodeNames.size : 1;
        checks.push({ check: `node_ref:${key}`, result: `${matchCount}/${nodeNames.size}`, pass: coverage >= 0.5 });
        if (coverage < 0.5) score -= 0.1;
    }

    // 2.2 IR 版本一致：所有模块的 ir_version_used 应相同
    const versions = new Set();
    for (const key of manifest.MODULE_ORDER) {
        const ver = mf.modules?.[key]?.ir_version_used;
        if (ver) versions.add(ver);
    }
    const versionConsistent = versions.size <= 1;
    checks.push({ check: 'ir_version_consistent', result: [...versions].join(',') || 'none', pass: versionConsistent });
    if (!versionConsistent) score -= 0.2;

    return { dimension: 'consistency', weight: 0.3, score: Math.max(0, score), checks };
}

/**
 * 维度 3: 规范符合度 (20%)
 */
function scoreCompliance() {
    const checks = [];
    let score = 1.0;

    for (const key of manifest.MODULE_ORDER) {
        // 跳过 skipped 模块
        if (manifest.getModuleStatus(mf, key) === 'skipped') continue;

        const filePath = path.join(casePath, `${key}.html`);
        if (!fs.existsSync(filePath)) continue;

        const html = fs.readFileSync(filePath, 'utf-8');

        // 3.1 data-module 属性存在
        const hasDataModule = /data-module=/.test(html);
        checks.push({ check: `data-module:${key}`, pass: hasDataModule });
        if (!hasDataModule) score -= 0.03;

        // 3.2 module-header 结构存在
        const hasHeader = /class="module-header"/.test(html);
        checks.push({ check: `module-header:${key}`, pass: hasHeader });
        if (!hasHeader) score -= 0.02;

        // 3.3 module-footer 存在
        const hasFooter = /class="module-footer"/.test(html);
        checks.push({ check: `module-footer:${key}`, pass: hasFooter });
        if (!hasFooter) score -= 0.02;
    }

    // 3.4 CSS 变量一致性（抽查 --border:#111111，跳过 skipped 模块）
    for (const key of manifest.MODULE_ORDER) {
        if (manifest.getModuleStatus(mf, key) === 'skipped') continue;
        const filePath = path.join(casePath, `${key}.html`);
        if (!fs.existsSync(filePath)) continue;
        const html = fs.readFileSync(filePath, 'utf-8');
        const hasCorrectBorder = /--border\s*:\s*#111111/.test(html) || /--border\s*:\s*#111/.test(html);
        if (!hasCorrectBorder && html.includes('--border')) {
            checks.push({ check: `css-border:${key}`, pass: false, note: '--border 不是 #111111' });
            score -= 0.02;
        }
    }

    return { dimension: 'compliance', weight: 0.2, score: Math.max(0, score), checks };
}

/**
 * 维度 4: 信息保真度 (20%)
 */
function scoreFidelity() {
    const checks = [];
    let score = 1.0;

    if (!ir) return { dimension: 'fidelity', weight: 0.2, score: 0.5, checks: [{ check: 'ir_missing', pass: false }] };

    // 4.1 level_overview 包含关卡名和 ID
    const overviewPath = path.join(casePath, 'level_overview.html');
    if (fs.existsSync(overviewPath)) {
        const html = fs.readFileSync(overviewPath, 'utf-8');
        const hasName = html.includes(ir.level_name);
        const hasId = html.includes(ir.level_id);
        checks.push({ check: 'overview_has_name', pass: hasName });
        checks.push({ check: 'overview_has_id', pass: hasId });
        if (!hasName) score -= 0.05;
        if (!hasId) score -= 0.05;
    }

    // 4.2 asset_list 包含所有必需资产
    const assetPath = path.join(casePath, 'asset_list.html');
    if (fs.existsSync(assetPath) && ir.ASSET?.required_assets) {
        const html = fs.readFileSync(assetPath, 'utf-8');
        let found = 0;
        for (const asset of ir.ASSET.required_assets) {
            if (html.includes(asset.id)) found++;
        }
        const total = ir.ASSET.required_assets.length;
        checks.push({ check: 'asset_coverage', result: `${found}/${total}`, pass: found === total });
        if (found < total) score -= 0.1 * ((total - found) / total);
    }

    return { dimension: 'fidelity', weight: 0.2, score: Math.max(0, score), checks };
}

// ===== 占位符残留扫描 (placeholder_leak) =====
// 任何 {{...}} 残留均视为 hard fail，不受加权分影响

const PLACEHOLDER_RE = /\{\{[^}]+\}\}/g;
let totalPlaceholderLeaks = 0;
const placeholderLeakDetails = [];

for (const key of manifest.MODULE_ORDER) {
    if (manifest.getModuleStatus(mf, key) === 'skipped') continue;
    const filePath = path.join(casePath, `${key}.html`);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf-8');
    const leaks = (html.match(PLACEHOLDER_RE) || []);
    if (leaks.length > 0) {
        totalPlaceholderLeaks += leaks.length;
        placeholderLeakDetails.push({ module: key, count: leaks.length, leaks: [...new Set(leaks)] });
    }
}

const hasPlaceholderLeaks = totalPlaceholderLeaks > 0;

// ===== 执行评分 =====

const dimensions = [
    scoreStructure(),
    scoreConsistency(),
    scoreCompliance(),
    scoreFidelity(),
];

// 加权总分
const totalScore = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
const roundedScore = Math.round(totalScore * 100) / 100;
// 占位符残留 = hard fail，即使加权分 >= 0.7 也不通过
const passed = roundedScore >= 0.7 && !hasPlaceholderLeaks;

const report = {
    case_id: caseId,
    scored_at: new Date().toISOString(),
    auto_score: roundedScore,
    passed,
    placeholder_leak: {
        pass: !hasPlaceholderLeaks,
        total_count: totalPlaceholderLeaks,
        modules_affected: placeholderLeakDetails,
    },
    dimensions: dimensions.map(d => ({
        dimension: d.dimension,
        weight: d.weight,
        score: Math.round(d.score * 100) / 100,
        weighted: Math.round(d.score * d.weight * 100) / 100,
        checks_total: d.checks.length,
        checks_passed: d.checks.filter(c => c.pass).length,
    })),
    details: dimensions,
};

// 写入 score_report.json
const reportPath = path.join(casePath, 'score_report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

// 更新 manifest
mf.scoring = {
    auto_score: roundedScore,
    auto_score_details: Object.fromEntries(dimensions.map(d => [d.dimension, Math.round(d.score * 100) / 100])),
    human_scores: mf.scoring?.human_scores || null,
    passed,
    scored_at: report.scored_at,
};
manifest.save(casePath, mf);

// 输出
console.log(`\n===== 自动评分 — ${caseId} =====`);
for (const d of dimensions) {
    const pct = Math.round(d.score * 100);
    const icon = d.score >= 0.9 ? '✓' : d.score >= 0.7 ? '△' : '✗';
    console.log(`  ${icon} ${d.dimension} (${d.weight * 100}%): ${pct}%`);
}
const leakIcon = hasPlaceholderLeaks ? '✗' : '✓';
console.log(`  ${leakIcon} placeholder_leak (hard-fail): ${hasPlaceholderLeaks ? `FAIL — ${totalPlaceholderLeaks} leaks in ${placeholderLeakDetails.length} modules` : 'CLEAN'}`);
console.log(`\n  总分: ${roundedScore} ${passed ? 'PASS' : 'FAIL'}`);
console.log(`  报告: ${reportPath}`);
