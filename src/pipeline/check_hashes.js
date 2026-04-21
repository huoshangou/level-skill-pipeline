/**
 * check_hashes.js — 完整性校验工具
 *
 * 对比 manifest.json 记录的 SHA-256 哈希与文件实际哈希，
 * 检测已锁定产物是否被手动修改、损坏或缺失。
 *
 * 用法:
 *   node pipeline/check_hashes.js <case_dir>
 *   node pipeline/check_hashes.js outputs/case_01_truck
 *   node pipeline/check_hashes.js outputs/case_01_truck --fix
 *
 * --fix: 用实际文件哈希更新 manifest（仅对 hash_mismatch，不修复 file_missing）
 *
 * 退出码:
 *   0 = 全部通过
 *   1 = 发现问题
 */

const fs = require('fs');
const path = require('path');
const manifest = require('./lib/manifest');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ============================================================================
// 主函数
// ============================================================================
function checkHashes(casePath, options = {}) {
    const mf = manifest.load(casePath);
    if (!mf) {
        console.error(`manifest.json 不存在: ${casePath}`);
        return { valid: false, issues: [{ module: 'manifest', error: 'not_found' }] };
    }

    const issues = [];
    const ok = [];

    // --- 1. IR 哈希 ---
    if (mf.ir && mf.ir.file_hash) {
        const caseId = mf.case_id || path.basename(casePath);
        const irCandidates = [
            path.join(PROJECT_ROOT, 'test_cases', caseId, 'ir_filled.json'),
            path.join(casePath, 'ir_filled.json'),
        ];
        const irPath = irCandidates.find(p => fs.existsSync(p));

        if (!irPath) {
            issues.push({ module: 'ir', error: 'file_missing', expected: mf.ir.file_hash });
        } else {
            const actualHash = manifest.computeFileHash(irPath);
            if (actualHash !== mf.ir.file_hash) {
                issues.push({ module: 'ir', error: 'hash_mismatch', expected: mf.ir.file_hash, actual: actualHash, path: irPath });
            } else {
                ok.push('ir');
            }
        }
    }

    // --- 2. 模块哈希（复用 manifest.validateIntegrity） ---
    const moduleResult = manifest.validateIntegrity(mf, casePath);
    issues.push(...moduleResult.issues);

    // 统计通过的模块
    for (const key of manifest.MODULE_ORDER) {
        const mod = mf.modules?.[key];
        if (!mod || !mod.file_hash || mod.status === 'skipped') continue;
        if (!moduleResult.issues.find(i => i.module === key)) {
            ok.push(key);
        }
    }

    // --- 3. Assembly 哈希（validateIntegrity 已包含，但检查是否在 ok 中） ---
    if (mf.assembly?.file_hash) {
        if (!moduleResult.issues.find(i => i.module === 'assembly')) {
            ok.push('assembly');
        }
    }

    return { valid: issues.length === 0, issues, ok };
}

// ============================================================================
// 修复模式: 用实际哈希更新 manifest
// ============================================================================
function fixHashes(casePath, issues) {
    const mf = manifest.load(casePath);
    let fixCount = 0;

    for (const issue of issues) {
        if (issue.error !== 'hash_mismatch' || !issue.actual) continue;

        if (issue.module === 'ir') {
            mf.ir.file_hash = issue.actual;
            fixCount++;
        } else if (issue.module === 'assembly') {
            mf.assembly.file_hash = issue.actual;
            fixCount++;
        } else if (mf.modules[issue.module]) {
            mf.modules[issue.module].file_hash = issue.actual;
            fixCount++;
        }
    }

    if (fixCount > 0) {
        manifest.save(casePath, mf);
    }

    return fixCount;
}

// ============================================================================
// CLI
// ============================================================================
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('用法: node pipeline/check_hashes.js <case_dir> [--fix]');
        process.exit(1);
    }

    const caseDirArg = args[0];
    const caseDir = path.isAbsolute(caseDirArg)
        ? caseDirArg
        : path.join(PROJECT_ROOT, caseDirArg);
    const doFix = args.includes('--fix');

    console.log(`检查完整性: ${path.basename(caseDir)}`);
    console.log('─'.repeat(50));

    const { valid, issues, ok } = checkHashes(caseDir);

    // 打印通过的
    for (const name of ok) {
        console.log(`  ✓ ${name}`);
    }

    // 打印跳过的
    const mf = manifest.load(caseDir);
    if (mf) {
        for (const key of manifest.MODULE_ORDER) {
            const mod = mf.modules?.[key];
            if (mod?.status === 'skipped') {
                console.log(`  - ${key} (skipped)`);
            } else if (!mod?.file_hash && mod?.status === 'pending') {
                console.log(`  - ${key} (pending, 无哈希)`);
            }
        }
    }

    // 打印问题
    if (issues.length > 0) {
        console.log('');
        for (const issue of issues) {
            if (issue.error === 'file_missing') {
                console.log(`  ✗ ${issue.module}: 文件缺失 (manifest 记录哈希 ${issue.expected?.substring(0, 8)}...)`);
            } else if (issue.error === 'hash_mismatch') {
                console.log(`  ✗ ${issue.module}: 哈希不匹配`);
                console.log(`      manifest: ${issue.expected?.substring(0, 16)}...`);
                console.log(`      实际文件: ${issue.actual?.substring(0, 16)}...`);
            } else if (issue.error === 'not_found') {
                console.log(`  ✗ ${issue.module}: 不存在`);
            }
        }
    }

    console.log('─'.repeat(50));

    if (valid) {
        console.log(`结果: PASS — ${ok.length} 项校验通过`);
        process.exit(0);
    } else {
        console.log(`结果: FAIL — ${issues.length} 项问题`);

        if (doFix) {
            const mismatchCount = issues.filter(i => i.error === 'hash_mismatch').length;
            if (mismatchCount > 0) {
                const fixCount = fixHashes(caseDir, issues);
                console.log(`\n已修复 ${fixCount} 项哈希不匹配（manifest 已更新）`);
            }
            const missingCount = issues.filter(i => i.error === 'file_missing').length;
            if (missingCount > 0) {
                console.log(`${missingCount} 项文件缺失无法自动修复，需重新生成`);
            }
        } else {
            console.log('提示: 使用 --fix 自动更新哈希不匹配的 manifest 记录');
        }

        process.exit(doFix ? 0 : 1);
    }
}

module.exports = { checkHashes, fixHashes };
