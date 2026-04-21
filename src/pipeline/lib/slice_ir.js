/**
 * slice_ir.js — IR 裁剪器
 *
 * 读取模块的 contract.yaml → 提取 ir_fields_required 路径列表
 * → 从 ir_filled.json 中裁剪出该模块所需的 IR 子集
 *
 * 用法（CLI）:
 *   node pipeline/lib/slice_ir.js <case_dir> <module_key>
 *   node pipeline/lib/slice_ir.js outputs/case_01_truck bubble_chart
 *
 * 用法（模块）:
 *   const { sliceIR, parseContractPaths } = require('./lib/slice_ir');
 *   const sliced = sliceIR(irData, contractPath);
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// 项目根目录（从 pipeline/lib/ 往上两层）
// ============================================================================
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CONTRACTS_DIR = path.join(PROJECT_ROOT, 'contracts', 'skills');

// ============================================================================
// 从 contract.yaml 提取 ir_fields_required 的 path 列表
// 不依赖 js-yaml，使用正则匹配 "- path:" 行
// ============================================================================
function parseContractPaths(contractPath) {
    const content = fs.readFileSync(contractPath, 'utf-8');
    const paths = [];

    // 匹配所有 `- path: "xxx"` 或 `- path: xxx` 行
    const regex = /^\s*-\s*path:\s*"?([^"\n]+?)"?\s*$/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
        paths.push(match[1].trim());
    }

    if (paths.length === 0) {
        throw new Error(`contract 中未找到 ir_fields_required 路径: ${contractPath}`);
    }

    return paths;
}

// ============================================================================
// 从 IR 对象中按路径提取值
// 支持的路径格式:
//   "level_id"              → ir.level_id
//   "SPACE.regions"         → ir.SPACE.regions
//   "FEEL.overall_tone"     → ir.FEEL.overall_tone
// ============================================================================
function getByPath(obj, dotPath) {
    const parts = dotPath.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') {
            return undefined;
        }
        current = current[part];
    }
    return current;
}

// ============================================================================
// 将值设置到目标对象的指定路径
// "SPACE.regions" → result.SPACE.regions = value
// ============================================================================
function setByPath(obj, dotPath, value) {
    const parts = dotPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current)) {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

// ============================================================================
// 核心: 裁剪 IR
// ============================================================================
function sliceIR(irData, contractPath) {
    const requiredPaths = parseContractPaths(contractPath);
    const sliced = {};
    const report = { found: [], missing: [] };

    for (const p of requiredPaths) {
        const value = getByPath(irData, p);
        if (value !== undefined) {
            setByPath(sliced, p, value);
            report.found.push(p);
        } else {
            report.missing.push(p);
        }
    }

    return { sliced, report };
}

// ============================================================================
// 便捷方法: 通过 module_key 自动定位 contract.yaml
// ============================================================================
function sliceForModule(irData, moduleKey) {
    const contractPath = path.join(CONTRACTS_DIR, moduleKey, 'contract.yaml');
    if (!fs.existsSync(contractPath)) {
        throw new Error(`contract.yaml 不存在: ${contractPath}`);
    }
    return sliceIR(irData, contractPath);
}

// ============================================================================
// 批量裁剪: 为所有有 contract.yaml 的模块生成 IR 子集
// ============================================================================
function sliceAll(irData) {
    const results = {};
    const dirs = fs.readdirSync(CONTRACTS_DIR, { withFileTypes: true });

    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const contractPath = path.join(CONTRACTS_DIR, dir.name, 'contract.yaml');
        if (!fs.existsSync(contractPath)) continue;

        try {
            results[dir.name] = sliceIR(irData, contractPath);
        } catch (err) {
            results[dir.name] = { sliced: null, report: { error: err.message } };
        }
    }

    return results;
}

// ============================================================================
// CLI 入口
// ============================================================================
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('用法:');
        console.log('  node pipeline/lib/slice_ir.js <case_dir> [module_key]');
        console.log('  node pipeline/lib/slice_ir.js <case_dir> --all');
        console.log('');
        console.log('示例:');
        console.log('  node pipeline/lib/slice_ir.js outputs/case_01_truck bubble_chart');
        console.log('  node pipeline/lib/slice_ir.js outputs/case_01_truck --all');
        process.exit(1);
    }

    const caseDirArg = args[0];
    const caseDir = path.isAbsolute(caseDirArg)
        ? caseDirArg
        : path.join(PROJECT_ROOT, caseDirArg);

    // 尝试两个位置找 ir_filled.json: test_cases/{case_id}/ 或 case_dir 本身
    const caseId = path.basename(caseDir);
    const irCandidates = [
        path.join(PROJECT_ROOT, 'test_cases', caseId, 'ir_filled.json'),
        path.join(caseDir, 'ir_filled.json'),
    ];
    const irPath = irCandidates.find(p => fs.existsSync(p));
    if (!irPath) {
        console.error(`找不到 ir_filled.json，已搜索:\n  ${irCandidates.join('\n  ')}`);
        process.exit(1);
    }

    const irData = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
    console.log(`IR 来源: ${irPath}`);
    console.log(`IR 版本: ${irData.version || 'unknown'}\n`);

    if (args[1] === '--all') {
        // 批量模式
        const results = sliceAll(irData);
        let totalFound = 0, totalMissing = 0;

        for (const [mod, { sliced, report }] of Object.entries(results)) {
            if (report.error) {
                console.log(`  ${mod}: ERROR — ${report.error}`);
                continue;
            }
            const foundCount = report.found.length;
            const missingCount = report.missing.length;
            totalFound += foundCount;
            totalMissing += missingCount;

            const status = missingCount === 0 ? 'OK' : 'WARN';
            const slicedKeys = Object.keys(sliced).join(', ');
            console.log(`  ${mod}: ${status} — ${foundCount} found, ${missingCount} missing → [${slicedKeys}]`);
            if (missingCount > 0) {
                for (const m of report.missing) {
                    console.log(`    MISSING: ${m}`);
                }
            }
        }
        console.log(`\n总计: ${totalFound} found, ${totalMissing} missing`);
    } else {
        // 单模块模式
        const moduleKey = args[1];
        if (!moduleKey) {
            console.error('请指定 module_key 或使用 --all');
            process.exit(1);
        }

        const { sliced, report } = sliceForModule(irData, moduleKey);

        console.log(`模块: ${moduleKey}`);
        console.log(`契约路径: ${path.join(CONTRACTS_DIR, moduleKey, 'contract.yaml')}`);
        console.log(`\n声明字段: ${report.found.length + report.missing.length}`);
        console.log(`  找到: ${report.found.length} — ${report.found.join(', ')}`);
        if (report.missing.length > 0) {
            console.log(`  缺失: ${report.missing.length} — ${report.missing.join(', ')}`);
        }
        console.log(`\n裁剪结果 (${JSON.stringify(sliced).length} bytes):`);
        console.log(JSON.stringify(sliced, null, 2));
    }
}

module.exports = { parseContractPaths, sliceIR, sliceForModule, sliceAll };
