#!/usr/bin/env node
/**
 * confirm.js — HITL 批量确认命令
 *
 * 用法: node pipeline/confirm.js <case_id_or_case_dir>
 *
 * 功能:
 *   1. 读取 manifest.pending_confirms
 *   2. 交互式逐项问用户确认或跳过
 *   3. 将确认值写入 IR 对应字段（ir_path）或 manifest.confirmed_fields（fallback）
 *   4. 自动调用 fillModule() 重生成受影响模块
 *   5. 清空 manifest.pending_confirms，将 pending_confirm 模块 status 改回 generated
 *
 * v2.4: 首次引入，对应 run_pipeline.js v2.4 聚合 HITL 流程。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const manifestLib = require('./lib/manifest');
const { fillModule } = require('./fill_template');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ===== 参数解析 =====

const args = process.argv.slice(2);
const caseArg = args[0];
if (!caseArg) {
    console.error('用法: node pipeline/confirm.js <case_id_or_case_dir>');
    console.error('示例: node pipeline/confirm.js case_05_gangster_mansion');
    process.exit(1);
}

// 支持两种形式：case_id（如 case_05_gangster_mansion）或完整路径（如 outputs/case_05_gangster_mansion）
let casePath;
if (path.isAbsolute(caseArg)) {
    casePath = caseArg;
} else if (caseArg.startsWith('outputs/') || caseArg.startsWith('./outputs/')) {
    casePath = path.resolve(PROJECT_ROOT, caseArg);
} else {
    // 纯 case_id → 在 outputs/ 下查找
    casePath = path.join(PROJECT_ROOT, 'outputs', caseArg);
}

// ===== 工具函数 =====

function hr() { console.log('─'.repeat(60)); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  △ ${msg}`); }
function info(msg) { console.log(`  · ${msg}`); }

/**
 * 查找 IR 文件路径
 */
function findIrPath(caseId) {
    const candidates = [
        path.join(PROJECT_ROOT, 'test_cases', caseId, 'ir_filled.json'),
        path.join(casePath, 'ir_filled.json'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * 根据点分路径读取 IR 中的值
 * 如 'FLOW.trigger_condition' → ir.FLOW.trigger_condition
 */
function getIrValue(ir, irPath) {
    if (!irPath) return undefined;
    const parts = irPath.split('.');
    let cur = ir;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

/**
 * 根据点分路径写入 IR 中的值（仅写存在的父路径，不创建新结构）
 * 返回 true=成功, false=父路径不存在
 */
function setIrValue(ir, irPath, value) {
    if (!irPath) return false;
    const parts = irPath.split('.');
    let cur = ir;
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur == null || typeof cur !== 'object' || !(parts[i] in cur)) {
            return false; // 父路径不存在，不强制创建
        }
        cur = cur[parts[i]];
    }
    const lastKey = parts[parts.length - 1];
    cur[lastKey] = value;
    return true;
}

/**
 * 交互式逐项确认
 */
async function promptConfirms(items) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (q) => new Promise(resolve => rl.question(q, resolve));

    const results = []; // { item, confirmed: string | null }

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log('');
        console.log(`  [${i + 1}/${items.length}] [${item.module}] ${item.field}`);
        console.log(`  当前值: "${item.currentValue}"`);
        console.log(`  提示: ${item.hint}`);
        if (item.ir_path) {
            console.log(`  IR 路径: ${item.ir_path}`);
        }
        if (item.suggested) {
            console.log(`  建议值: ${item.suggested}`);
        }

        const answer = await question('  请输入新值（回车跳过）: ');
        const trimmed = answer.trim();

        if (trimmed.length > 0) {
            results.push({ item, confirmed: trimmed });
            ok(`已确认: ${item.field} = "${trimmed}"`);
        } else {
            results.push({ item, confirmed: null });
            info(`跳过: ${item.field}`);
        }
    }

    rl.close();
    return results;
}

// ===== 主流程 =====

async function main() {
    // 1. 加载 manifest
    const mf = manifestLib.load(casePath);
    if (!mf) {
        console.error(`  ✗ 找不到 manifest.json: ${casePath}`);
        process.exit(1);
    }

    const pendingConfirms = mf.pending_confirms || [];
    if (pendingConfirms.length === 0) {
        console.log('');
        ok(`Case: ${mf.case_id}`);
        ok('没有待确认字段（manifest.pending_confirms 为空）');
        console.log('');
        process.exit(0);
    }

    console.log('');
    hr();
    console.log(`  HITL 批量确认 — ${mf.case_id}`);
    hr();
    info(`共 ${pendingConfirms.length} 个待确认字段`);

    // 按模块分组显示概览
    const byModule = {};
    for (const item of pendingConfirms) {
        if (!byModule[item.module]) byModule[item.module] = 0;
        byModule[item.module]++;
    }
    for (const [mod, cnt] of Object.entries(byModule)) {
        info(`  ${mod}: ${cnt} 项`);
    }

    // 2. 交互式确认
    const results = await promptConfirms(pendingConfirms);
    const confirmed = results.filter(r => r.confirmed !== null);
    const skipped = results.filter(r => r.confirmed === null);

    console.log('');
    info(`确认: ${confirmed.length} 项，跳过: ${skipped.length} 项`);

    if (confirmed.length === 0) {
        warn('没有确认任何字段，退出');
        process.exit(0);
    }

    // 3. 写回 IR 或 confirmed_fields fallback
    const caseId = mf.case_id;
    const irPath = findIrPath(caseId);
    let ir = null;
    let irModified = false;

    if (irPath) {
        ir = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
    }

    if (!mf.confirmed_fields) mf.confirmed_fields = {};

    for (const { item, confirmed: value } of results.filter(r => r.confirmed !== null)) {
        const mod = item.module;
        if (!mf.confirmed_fields[mod]) mf.confirmed_fields[mod] = {};
        mf.confirmed_fields[mod][item.field] = value;

        // 尝试写回 IR
        if (ir && item.ir_path) {
            const wrote = setIrValue(ir, item.ir_path, value);
            if (wrote) {
                ok(`IR 写回: ${item.ir_path} = "${value}"`);
                irModified = true;
            } else {
                warn(`IR 路径不存在，写入 confirmed_fields: ${item.ir_path}`);
            }
        } else if (!item.ir_path) {
            info(`无 ir_path，写入 confirmed_fields: ${mod}.${item.field}`);
        }
    }

    // 保存 IR（若有修改）
    if (ir && irModified) {
        fs.writeFileSync(irPath, JSON.stringify(ir, null, 2) + '\n', 'utf-8');
        ok(`IR 已保存: ${irPath}`);
    }

    // 4. 重生成受影响模块（status === 'pending_confirm' 的模块）
    const affectedModules = [...new Set(confirmed.map(r => r.item.module))];
    const irDataForRegen = ir || (irPath ? JSON.parse(fs.readFileSync(irPath, 'utf-8')) : null);

    if (irDataForRegen && affectedModules.length > 0) {
        console.log('');
        info(`重生成受影响模块: ${affectedModules.join(', ')}`);

        for (const key of affectedModules) {
            const status = manifestLib.getModuleStatus(mf, key);
            if (status !== 'pending_confirm' && status !== 'generated') {
                warn(`${key}: status=${status}，跳过重生成`);
                continue;
            }

            info(`${key}: 重生成中...`);
            const result = fillModule(irDataForRegen, key, { caseDir: casePath });
            if (result.success) {
                const outPath = path.join(casePath, `${key}.html`);
                fs.writeFileSync(outPath, result.html, 'utf-8');
                const hash = manifestLib.computeFileHash(outPath);
                manifestLib.updateModule(mf, key, {
                    status: 'generated',
                    version: (mf.modules[key]?.version || 1),
                    file_hash: hash,
                    generated_at: new Date().toISOString(),
                    ir_version_used: irDataForRegen.version || '1.0.0',
                });
                ok(`${key}: 重生成完成 (${result.html.length} bytes)`);
                if (result.pendingConfirms && result.pendingConfirms.length > 0) {
                    warn(`${key}: 仍有 ${result.pendingConfirms.length} 个未确认字段（已跳过的部分）`);
                }
            } else {
                warn(`${key}: 重生成失败 — ${result.error}`);
            }
        }
    }

    // 5. 清空 manifest.pending_confirms，只保留仍未确认（跳过）的字段
    const remainingConfirms = skipped.map(r => r.item);
    mf.pending_confirms = remainingConfirms;

    manifestLib.save(casePath, mf);

    console.log('');
    hr();
    if (remainingConfirms.length > 0) {
        warn(`${remainingConfirms.length} 个字段仍未确认，可再次运行 node pipeline/confirm.js ${caseId}`);
    } else {
        ok('所有待确认字段已处理完毕');
    }
    ok(`manifest.confirmed_fields 已更新`);
    info(`下一步: node pipeline/run_pipeline.js outputs/${caseId} --from=4`);
    console.log('');
}

main().catch(e => {
    console.error('  ✗ 错误:', e.message);
    process.exit(1);
});
