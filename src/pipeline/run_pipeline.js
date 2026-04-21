#!/usr/bin/env node
/**
 * run_pipeline.js — CLI 编排器
 *
 * 用法: node pipeline/run_pipeline.js <case_dir> [--from=<phase>] [--to=<phase>]
 * 示例:
 *   node pipeline/run_pipeline.js outputs/case_01_truck
 *   node pipeline/run_pipeline.js outputs/case_01_truck --from=3
 *   node pipeline/run_pipeline.js outputs/case_01_truck --from=5 --to=6
 *
 * 7 阶段编排，确定性逻辑由脚本驱动，LLM 工作由 ⏸ 暂停提示。
 *
 * 阶段说明:
 *   Phase 0: INIT     — 初始化，加载/创建 manifest
 *   Phase 1: IR       — 获取与验证 IR，确认 IR 内容
 *   Phase 2: SELECT   — 类型感知模块裁剪（玩法类关卡询问确认）[v2.2 新增]
 *   Phase 3: GENERATE — 模块生成（LLM 工作，脚本仅检查状态并提示）
 *   Phase 4: ASSEMBLE — 文档组装（自动执行）
 *   Phase 5: SCORE    — 自动评分（自动执行）
 *   Phase 6: LOCK     — 全量锁定（评分通过后执行）
 *
 * v2.2: 新增 Phase 2 SELECT，支持 skipped 模块状态。
 * 回退方式: git checkout pipeline/run_pipeline.js (changelog.md 有记录)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const manifestLib = require('./lib/manifest');
const validateIr = require('./lib/validate_ir');
const { fillModule, getSupportedModules } = require('./fill_template');

// ===== 参数解析 =====

const args = process.argv.slice(2);
const caseDir = args.find(a => !a.startsWith('--'));
if (!caseDir) {
    console.error('用法: node pipeline/run_pipeline.js <case_dir> [--from=N] [--to=N]');
    process.exit(1);
}

let fromPhase = 0;
let toPhase = 6;
for (const arg of args) {
    if (arg.startsWith('--from=')) fromPhase = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--to=')) toPhase = parseInt(arg.split('=')[1], 10);
}

const projectRoot = path.resolve(__dirname, '..');
const casePath = path.resolve(projectRoot, caseDir);

// ===== 工具函数 =====

function hr() { console.log('─'.repeat(60)); }
function header(phase, title) {
    console.log('');
    hr();
    console.log(`  PHASE ${phase}: ${title}`);
    hr();
}
function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  △ ${msg}`); }
function err(msg) { console.log(`  ✗ ${msg}`); }
function info(msg) { console.log(`  · ${msg}`); }
function pause(msg) {
    console.log('');
    console.log(`  ⏸  ${msg}`);
    console.log(`  ⏸  脚本在此暂停。完成后重新运行: node pipeline/run_pipeline.js ${caseDir} --from=<next_phase>`);
    console.log('');
}

function findIrPath(caseId) {
    const candidates = [
        path.join(projectRoot, 'test_cases', caseId, 'ir_filled.json'),
        path.join(casePath, 'ir_filled.json'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// v2.5: context 占用预算（防 32MB API 上限）
// 估算"如果把这一 case 的所有产物 + 参考图原文塞进对话能有多大"
const CONTEXT_BUDGET_WARN = 8 * 1024 * 1024;   // 8 MB
const CONTEXT_BUDGET_FAIL = 16 * 1024 * 1024;  // 16 MB（API 32MB 的安全上界一半）

function estimateContextBytes(mf, casePath) {
    let total = 0;
    const breakdown = { html: 0, refs: 0, ir: 0 };

    // HTML 模块产物
    if (fs.existsSync(casePath)) {
        for (const f of fs.readdirSync(casePath)) {
            if (f.endsWith('.html')) {
                total += fs.statSync(path.join(casePath, f)).size;
                breakdown.html += fs.statSync(path.join(casePath, f)).size;
            }
        }
    }

    // 参考图（从 manifest.reference_assets[].bytes 取，不读图本身）
    if (Array.isArray(mf.reference_assets)) {
        // base64 编码 ≈ 原字节 × 4/3
        for (const a of mf.reference_assets) {
            const b64Bytes = Math.ceil((a.bytes || 0) * 4 / 3);
            total += b64Bytes;
            breakdown.refs += b64Bytes;
        }
    }

    // IR
    const irPath = findIrPath(mf.case_id);
    if (irPath && fs.existsSync(irPath)) {
        breakdown.ir = fs.statSync(irPath).size;
        total += breakdown.ir;
    }

    return { total, breakdown };
}

function fmtMB(n) { return (n / 1024 / 1024).toFixed(2) + ' MB'; }

// ===== PHASE 0: 初始化 =====

function phase0() {
    header(0, 'INIT — 初始化');

    // 加载或创建 manifest
    let mf = manifestLib.load(casePath);
    if (mf) {
        ok(`Manifest 已存在: ${mf.case_id}`);
    } else {
        if (!fs.existsSync(casePath)) {
            fs.mkdirSync(casePath, { recursive: true });
        }
        mf = manifestLib.init(casePath);
        ok(`Manifest 已创建: ${mf.case_id}`);
    }

    // 进度摘要
    const progress = manifestLib.getProgress(mf);
    info(`IR: ${progress.ir_status}`);
    info(`模块: ${progress.locked} locked / ${progress.confirmed} confirmed / ${progress.generated} generated / ${progress.pending} pending / ${progress.skipped} skipped`);
    info(`组装: ${progress.assembly_status}`);
    info(`评分: ${progress.score !== null ? progress.score + (progress.passed ? ' PASS' : ' FAIL') : '未评分'}`);

    // IR 预检
    const caseId = mf.case_id;
    const irPath = findIrPath(caseId);
    if (irPath) {
        ok(`IR 文件: ${irPath}`);
        const ir = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
        const validation = validateIr.validateAll(ir);
        if (validation.valid) {
            ok(`IR 验证: ${validation.summary}`);
        } else {
            err(`IR 验证失败: ${validation.summary}`);
            for (const e of validation.errors) err(`  ${e}`);
        }
        for (const w of validation.warnings) warn(`  ${w}`);
    } else {
        warn('未找到 IR 文件');
    }

    // 完整性校验
    const integrity = manifestLib.validateIntegrity(mf, casePath);
    if (integrity.valid) {
        ok('文件完整性: 全部一致');
    } else {
        warn(`文件完整性: ${integrity.issues.length} 个问题`);
        for (const issue of integrity.issues) {
            warn(`  ${issue.module}: ${issue.error}`);
        }
    }

    // 提取器覆盖率校验 — 确保每个有 contract 的模块都有对应的提取器
    const supported = getSupportedModules();
    const contractDir = path.join(projectRoot, 'contracts', 'skills');
    const modulesWithContract = fs.existsSync(contractDir)
        ? fs.readdirSync(contractDir).filter(d => fs.existsSync(path.join(contractDir, d, 'contract.yaml')))
        : [];
    const missingExtractors = modulesWithContract.filter(m => !supported.includes(m) && m !== 'bubble_chart');
    if (missingExtractors.length > 0) {
        warn(`提取器覆盖率: ${supported.length}/${modulesWithContract.length} 模块有提取器`);
        for (const m of missingExtractors) {
            warn(`  缺少提取器: ${m}（有 contract.yaml 但无注册的 extractor）`);
        }
    } else {
        ok(`提取器覆盖率: ${supported.length}/${modulesWithContract.length}（bubble_chart 需 LLM/算法，其余全覆盖）`);
    }

    // v2.5: context 占用预算（防 Claude API 32MB 上限）
    const ctx = estimateContextBytes(mf, casePath);
    const detail = `HTML ${fmtMB(ctx.breakdown.html)} + 参考图(base64) ${fmtMB(ctx.breakdown.refs)} + IR ${fmtMB(ctx.breakdown.ir)}`;
    if (ctx.total >= CONTEXT_BUDGET_FAIL) {
        err(`context 预算超限: ${fmtMB(ctx.total)} ≥ ${fmtMB(CONTEXT_BUDGET_FAIL)} (fail)`);
        err(`  ${detail}`);
        err('  会触发对话 32MB 上限。先压缩参考图（pipeline/ingest_image.js 默认拒收 >1.5MB），或拆 case。');
        process.exit(2);
    } else if (ctx.total >= CONTEXT_BUDGET_WARN) {
        warn(`context 预算偏高: ${fmtMB(ctx.total)} ≥ ${fmtMB(CONTEXT_BUDGET_WARN)} (warn)`);
        warn(`  ${detail}`);
    } else {
        ok(`context 预算: ${fmtMB(ctx.total)} (${detail})`);
    }

    return mf;
}

// ===== PHASE 1: IR 获取 =====

function phase1(mf) {
    header(1, 'IR — 获取与验证');

    if (mf.ir.status === 'locked') {
        ok(`IR 已锁定 (v${mf.ir.version})，跳过`);
        return 'skip';
    }

    const irPath = findIrPath(mf.case_id);
    if (!irPath) {
        warn('IR 不存在，请先运行 /input-processor 对话式填充');
        pause('请运行 /input-processor 生成 ir_filled.json');
        return 'pause';
    }

    const ir = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
    const validation = validateIr.validateAll(ir);

    info(`关卡: ${ir.level_name} (${ir.level_id})`);
    info(`类型: ${ir.type}`);
    info(`版本: ${ir.version}`);
    info(`节点: ${ir.FLOW?.nodes?.length || '?'}`);
    info(`区域: ${ir.SPACE?.regions?.length || '?'}`);

    if (validation.valid) {
        ok(`IR 验证通过: ${validation.summary}`);
    } else {
        err(`IR 验证失败: ${validation.summary}`);
        for (const e of validation.errors) err(`  ${e}`);
        pause('请修复 IR 中的错误后重新运行');
        return 'pause';
    }
    for (const w of validation.warnings) warn(`  ${w}`);

    if (mf.ir.status === 'confirmed') {
        ok('IR 已确认，等待锁定');
    } else {
        // 更新 IR 哈希
        mf.ir.file_hash = manifestLib.computeFileHash(irPath);
        mf.ir.version = ir.version || '1.0.0';
        mf.ir.status = 'confirmed';
        mf.ir.confirmed_at = new Date().toISOString();
        manifestLib.save(casePath, mf);
        ok('IR 状态 → confirmed');
        pause('请确认 IR 内容无误。确认后运行 --from=2 继续（进入模块裁剪）');
        return 'pause';
    }

    return 'continue';
}

// ===== PHASE 2: 模块裁剪 [v2.2 新增] =====

function phase2(mf) {
    header(2, 'SELECT — 类型感知模块裁剪');

    // 如果所有模块已有决策（无 pending 需要裁剪），跳过
    const pendingModules = manifestLib.MODULE_ORDER.filter(k =>
        manifestLib.getModuleStatus(mf, k) === 'pending'
    );

    if (pendingModules.length === 0) {
        const skipped = manifestLib.MODULE_ORDER.filter(k => mf.modules[k]?.status === 'skipped');
        ok(`所有模块已有决策（${skipped.length} 个跳过）`);
        if (skipped.length > 0) info(`跳过: ${skipped.join(', ')}`);
        return 'skip';
    }

    const irPath = findIrPath(mf.case_id);
    if (!irPath) {
        err('IR 文件不存在，无法确定模块类型');
        return 'error';
    }

    // 调用 select_modules.js（交互式，stdio: inherit 保证终端输入输出正常）
    info('运行 select_modules.js ...');
    try {
        execSync(`node "${path.join(__dirname, 'select_modules.js')}" "${caseDir}"`, {
            cwd: projectRoot,
            stdio: 'inherit',
        });
    } catch (e) {
        err('模块选择失败');
        return 'error';
    }

    // 重新加载 manifest（select_modules.js 已写入）
    mf = manifestLib.load(casePath);
    const skippedAfter = manifestLib.MODULE_ORDER.filter(k => mf.modules[k]?.status === 'skipped');
    const pendingAfter = manifestLib.MODULE_ORDER.filter(k => mf.modules[k]?.status === 'pending');
    ok(`模块选择完成: ${pendingAfter.length} 待生成, ${skippedAfter.length} 跳过`);

    return 'continue';
}

// ===== PHASE 3: 模块生成 =====

function phase3(mf) {
    header(3, 'GENERATE — 模块生成');

    const supported = getSupportedModules();
    const pending = [];
    const autoFilled = [];

    // 加载 IR（自动填充需要）
    const irPath = findIrPath(mf.case_id);
    let irData = null;
    if (irPath) {
        irData = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
    }

    for (const key of manifestLib.MODULE_ORDER) {
        const status = manifestLib.getModuleStatus(mf, key);
        if (status === 'locked' || status === 'confirmed') {
            ok(`${key}: v${mf.modules[key].version} ${status}，跳过`);
        } else if (status === 'skipped') {
            info(`${key}: skipped（按类型规则跳过）`);
        } else if (status === 'generated') {
            info(`${key}: generated（等待确认）`);
        } else if (supported.includes(key) && irData) {
            // 有提取器 → 自动填充
            info(`${key}: 有模板提取器，自动填充...`);
            const result = fillModule(irData, key, { caseDir: casePath });
            if (result.success) {
                // v2.3: HITL 确认检查 — 有待确认字段时暂停
                if (result.pendingConfirms && result.pendingConfirms.length > 0) {
                    // 先写入 HTML（含 [待确认] 标记），但不标为 generated
                    const outPath = path.join(casePath, `${key}.html`);
                    fs.writeFileSync(outPath, result.html, 'utf-8');

                    console.log('');
                    warn(`${key}: ${result.pendingConfirms.length} 个字段需用户确认:`);
                    if (result.templateVariant) info(`模板变体: ${result.templateVariant}`);
                    for (const item of result.pendingConfirms) {
                        info(`  → ${item.field}: 当前值 "${item.currentValue}" — ${item.hint}`);
                    }
                    pause(`请确认 ${key} 的待确认字段，修正 HTML 后重新运行 --from=3`);
                    return 'pause';
                }

                const outPath = path.join(casePath, `${key}.html`);
                fs.writeFileSync(outPath, result.html, 'utf-8');
                const hash = manifestLib.computeFileHash(outPath);
                manifestLib.updateModule(mf, key, {
                    status: 'generated',
                    version: 1,
                    file_hash: hash,
                    generated_at: new Date().toISOString(),
                    ir_version_used: irData.version || '1.0.0',
                });
                manifestLib.save(casePath, mf);
                autoFilled.push(key);
                ok(`${key}: 自动填充完成 (${result.html.length} bytes, 模板: ${result.templateVariant || 'default'})`);
            } else {
                warn(`${key}: 自动填充失败 — ${result.error}`);
                pending.push(key);
            }
        } else {
            pending.push(key);
            err(`${key}: ${status}，缺少提取器（需在 pipeline/lib/extractors.js 中注册或使用 LLM 生成）`);
        }
    }

    if (autoFilled.length > 0) {
        console.log('');
        ok(`自动填充完成: ${autoFilled.length} 个模块 (${autoFilled.join(', ')})`);
    }

    if (pending.length === 0) {
        ok('所有模块已生成/确认/锁定/跳过');

        // 检查是否有 generated 需要确认
        const generated = manifestLib.MODULE_ORDER.filter(k =>
            manifestLib.getModuleStatus(mf, k) === 'generated'
        );
        if (generated.length > 0) {
            info(`${generated.length} 个模块等待确认: ${generated.join(', ')}`);
            pause('请检查 generated 模块，确认后运行 --from=4 继续');
            return 'pause';
        }

        return 'continue';
    }

    console.log('');
    info(`还需 LLM 生成 ${pending.length} 个模块:`);
    for (const key of pending) {
        info(`  → ${key}`);
    }

    pause('请使用 /design-level 或手动生成以上模块，完成后重新运行 --from=3');
    return 'pause';
}

// ===== PHASE 4: 组装 =====

function phase4(mf) {
    header(4, 'ASSEMBLE — 文档组装');

    // 检查前置条件（skipped 模块不算"未就绪"）
    const notReady = manifestLib.MODULE_ORDER.filter(k => {
        const s = manifestLib.getModuleStatus(mf, k);
        return s !== 'locked' && s !== 'confirmed' && s !== 'generated' && s !== 'skipped';
    });
    if (notReady.length > 0) {
        err(`以下模块未就绪: ${notReady.join(', ')}`);
        return 'error';
    }

    // 执行组装
    info('运行 assemble_document.js ...');
    try {
        execSync(`node "${path.join(__dirname, 'assemble_document.js')}" "${caseDir}"`, {
            cwd: projectRoot,
            stdio: 'inherit',
        });
    } catch (e) {
        err('组装失败');
        return 'error';
    }

    // 更新 manifest
    const asmPath = path.join(casePath, 'assembled_document.html');
    const hash = manifestLib.computeFileHash(asmPath);
    mf.assembly = {
        status: 'assembled',
        file_hash: hash,
        assembled_at: new Date().toISOString(),
        modules_snapshot: manifestLib.buildAssemblySnapshot(mf),
    };
    manifestLib.save(casePath, mf);
    ok(`组装完成，哈希: ${hash.substring(0, 16)}...`);

    return 'continue';
}

// ===== PHASE 5: 评分 =====

function phase5(mf) {
    header(5, 'SCORE — 自动评分');

    info('运行 scorer.js ...');
    try {
        execSync(`node "${path.join(__dirname, 'scorer.js')}" "${caseDir}"`, {
            cwd: projectRoot,
            stdio: 'inherit',
        });
    } catch (e) {
        err('评分失败');
        return 'error';
    }

    // 重新加载（scorer 已更新 manifest）
    mf = manifestLib.load(casePath);
    const score = mf.scoring?.auto_score;
    const passed = mf.scoring?.passed;

    if (passed) {
        ok(`自动评分通过: ${score}`);
    } else {
        warn(`自动评分未通过: ${score}（阈值 0.7）`);
    }

    pause('请检查评分结果，提供人工评分后运行 --from=6 锁定');
    return 'pause';
}

// ===== PHASE 6: 锁定 =====

function phase6(mf) {
    header(6, 'LOCK — 全量锁定');

    // 重新加载
    mf = manifestLib.load(casePath);

    if (!mf.scoring?.passed) {
        err('评分未通过，无法锁定');
        return 'error';
    }

    // 锁定 IR
    const irPath = findIrPath(mf.case_id);
    if (irPath && mf.ir.status !== 'locked') {
        mf.ir.status = 'locked';
        mf.ir.file_hash = manifestLib.computeFileHash(irPath);
        ok('IR → locked');
    } else if (mf.ir.status === 'locked') {
        ok('IR 已锁定');
    }

    // 锁定所有非 skipped 模块
    let lockedCount = 0;
    for (const key of manifestLib.MODULE_ORDER) {
        const status = manifestLib.getModuleStatus(mf, key);
        if (status === 'locked') continue;
        if (status === 'skipped') {
            info(`${key}: skipped（不锁定）`);
            continue;
        }
        const filePath = path.join(casePath, `${key}.html`);
        if (fs.existsSync(filePath)) {
            manifestLib.lockModule(mf, key, filePath);
            lockedCount++;
        }
    }
    if (lockedCount > 0) {
        ok(`${lockedCount} 个模块 → locked`);
    } else {
        ok('所有模块已锁定');
    }

    manifestLib.save(casePath, mf);

    // 最终报告
    console.log('');
    hr();
    console.log('  ✓ 管线完成');
    hr();
    const progress = manifestLib.getProgress(mf);
    info(`Case: ${mf.case_id}`);
    info(`IR: ${progress.ir_status} (v${mf.ir.version})`);
    info(`模块: ${progress.locked}/${progress.effective_total || progress.total} locked (${progress.skipped} 已跳过)`);
    info(`评分: ${progress.score} ${progress.passed ? 'PASS' : 'FAIL'}`);
    info(`产物: ${casePath}/assembled_document.html`);
    console.log('');

    return 'done';
}

// ===== 主流程 =====

const phases = [phase0, phase1, phase2, phase3, phase4, phase5, phase6];

let mf = null;
for (let i = fromPhase; i <= toPhase && i < phases.length; i++) {
    const result = phases[i](mf || manifestLib.load(casePath));
    mf = manifestLib.load(casePath); // 每阶段后重新加载

    if (result === 'pause' || result === 'error') {
        break;
    }
}
