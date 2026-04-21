#!/usr/bin/env node
/**
 * select_modules.js — 确定性模块裁剪
 *
 * 根据 IR.type 判断玩法类 vs 空间类，决定各模块的生成计划：
 *   - 空间类 (POI/MainMission/SideQuest 有固定场景) → 全部11模块正常生成
 *   - 玩法类 (OpenWorldEvent/OpenWorldChallenge 等) →
 *       6个核心模块强制生成
 *       5个可选，通过交互式菜单确认: atmosphere_ref, lighting_req, vfx_req, audio_req, emotion_curve
 *
 * 写入 manifest.json 的 skipped 状态，供后续阶段自动跳过对应模块。
 * 此脚本是纯确定性逻辑，不依赖 LLM。
 *
 * 用法:
 *   node pipeline/select_modules.js outputs/case_XX_name
 *   node pipeline/select_modules.js outputs/case_XX_name --auto=A   # 跳过4个可选模块
 *   node pipeline/select_modules.js outputs/case_XX_name --auto=B   # 全部生成
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const manifestLib = require('./lib/manifest');

// ===== 常量定义 =====

// 玩法类关卡类型（SPACE 为概念性状态区域，无固定场景）
const GAMEPLAY_TYPES = ['OpenWorldEvent', 'OpenWorldChallenge'];

// 玩法类需要用户确认的模块（v2.3: 新增 emotion_curve）
const CONFIRM_MODULES = ['atmosphere_ref', 'lighting_req', 'vfx_req', 'audio_req', 'emotion_curve'];

const CONFIRM_MODULE_LABELS = {
    atmosphere_ref: '氛围参考  — 玩法类通常不需要，除非有特定视觉包装/IP需求',
    lighting_req:   '灯光需求  — 玩法通常沿用大世界全局灯光，除非有定制化灯光方案',
    vfx_req:        '特效需求  — 是否有需要专项文档化的 VFX 需求？',
    audio_req:      '音频需求  — 是否有需要专项文档化的音频设计需求？',
    emotion_curve:  '情绪曲线  — 纯框架玩法通常不需要，有情境实例(case_instance)时建议生成',
};

// ===== 工具函数 =====

function findIrPath(projectRoot, caseId) {
    const candidates = [
        path.join(projectRoot, 'test_cases', caseId, 'ir_filled.json'),
        path.join(projectRoot, 'outputs', caseId, 'ir_filled.json'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function markSkipped(mf, moduleKey, reason) {
    mf.modules[moduleKey] = Object.assign({}, mf.modules[moduleKey], {
        status: 'skipped',
        skip_reason: reason,
        version: 0,
    });
}

function markPending(mf, moduleKey) {
    if (mf.modules[moduleKey]?.status === 'skipped') {
        mf.modules[moduleKey] = {
            status: 'pending',
            version: 0,
            file_hash: null,
            generated_at: null,
            confirmed_at: null,
            locked_at: null,
            ir_version_used: null,
            modification_history: [],
        };
    }
}

// ===== 选择处理 =====

/**
 * 根据用户输入（A/B/C 或数字组合）更新 manifest
 * 返回 'A'|'B'|'C'|'custom'|null
 */
function applyChoice(mf, input, modulesToAsk) {
    const upper = input.trim().toUpperCase();

    if (upper === 'A') {
        for (const key of modulesToAsk) {
            markSkipped(mf, key, '玩法类关卡，用户选择A跳过可选模块');
        }
        return 'A';
    }

    if (upper === 'B') {
        for (const key of modulesToAsk) {
            markPending(mf, key);
        }
        return 'B';
    }

    if (upper === 'C') {
        return 'C';
    }

    // 自定义数字组合（如 "①③" 或 "13"）
    const selected = new Set();
    const numMap = [/[①1]/, /[②2]/, /[③3]/, /[④4]/];
    numMap.forEach((re, i) => {
        if (re.test(input) && modulesToAsk[i]) selected.add(modulesToAsk[i]);
    });

    if (selected.size > 0) {
        for (const key of modulesToAsk) {
            if (selected.has(key)) {
                markPending(mf, key);
            } else {
                markSkipped(mf, key, '玩法类关卡，用户自定义选择跳过');
            }
        }
        return 'custom';
    }

    return null; // 无效输入
}

// ===== 交互式提示 =====

async function promptMenu(modulesToAsk) {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────────────────┐');
    console.log('  │  【玩法类关卡 — 模块裁剪确认】                          │');
    console.log('  └──────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('  ✅ 自动生成（6个核心模块）:');
    console.log('     关卡概览 · 玩法流程图 · 情绪曲线 · 资产需求表 · 分镜 · 程序需求');
    console.log('');
    console.log('');
    console.log('  ❓ 以下模块是否需要生成？（默认不生成）:');
    const icons = '①②③④';
    modulesToAsk.forEach((key, i) => {
        console.log(`     ${icons[i]} ${CONFIRM_MODULE_LABELS[key]}`);
    });
    console.log('');
    console.log('  请选择:');
    console.log('    A. 全部跳过（仅6个核心模块）  ← 推荐，快速出稿');
    console.log('    B. 全部生成（10个模块，含上述4个）');
    console.log('    C. 逐项确认');
    console.log('    或输入数字组合，如 "①③" 表示仅生成氛围参考+特效需求');
    console.log('');
}

async function askItemByItem(mf, modulesToAsk) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for (const key of modulesToAsk) {
        const label = CONFIRM_MODULE_LABELS[key].split('—')[0].trim();
        await new Promise(resolve => {
            rl.question(`  生成「${label}」？(y/n, 默认n): `, answer => {
                if (answer.trim().toLowerCase() === 'y') {
                    markPending(mf, key);
                    console.log(`  → ${key}: 将生成`);
                } else {
                    markSkipped(mf, key, '玩法类关卡，用户逐项确认跳过');
                    console.log(`  → ${key}: 跳过`);
                }
                resolve();
            });
        });
    }
    rl.close();
}

async function promptInteractive(mf, modulesToAsk) {
    await promptMenu(modulesToAsk);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    await new Promise(resolve => {
        function ask() {
            rl.question('  → 你的选择: ', async answer => {
                const result = applyChoice(mf, answer, modulesToAsk);
                if (result === 'C') {
                    rl.close();
                    await askItemByItem(mf, modulesToAsk);
                    resolve();
                } else if (result !== null) {
                    const desc = result === 'A' ? '跳过4个可选模块' : result === 'B' ? '生成全部10个模块' : '自定义选择';
                    console.log(`  → 已选择 ${result}: ${desc}`);
                    rl.close();
                    resolve();
                } else {
                    console.log('  输入无效，请输入 A/B/C 或数字组合（如①③）');
                    ask();
                }
            });
        }
        ask();
    });
}

// ===== 主函数 =====

/**
 * 确定性模块选择。可由 run_pipeline.js 调用，也可独立运行。
 *
 * @param {string} casePath  - 绝对路径，如 .../outputs/case_03_continuous_destroy
 * @param {string|null} autoChoice  - 'A'|'B'|null（null=交互式）
 * @returns {{ type: 'spatial'|'gameplay', skipped: string[] }}
 */
async function selectModules(casePath, autoChoice) {
    const projectRoot = path.resolve(casePath, '..', '..');
    const mf = manifestLib.load(casePath);
    if (!mf) throw new Error(`找不到 manifest: ${casePath}/manifest.json`);

    const caseId = mf.case_id;
    const irPath = findIrPath(projectRoot, caseId);
    if (!irPath) throw new Error('找不到 IR 文件，请先运行 /input-processor');

    const ir = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
    const irType = ir.type || 'unknown';
    const isGameplay = GAMEPLAY_TYPES.includes(irType);

    // 空间类：全部生成，无需处理
    if (!isGameplay) {
        console.log(`  · IR 类型: ${irType} → 空间类，全部11模块正常生成`);
        return { type: 'spatial', skipped: [] };
    }

    console.log(`  · IR 类型: ${irType} → 玩法类`);

    // 找出仍是 pending 的可选模块（需要用户决策）
    const modulesToAsk = CONFIRM_MODULES.filter(key => {
        const s = mf.modules?.[key]?.status;
        return s === 'pending';
    });

    if (modulesToAsk.length === 0) {
        // 所有可选模块已有决策，沿用
        console.log('  · 可选模块已有决策，沿用现有选择');
    } else if (autoChoice) {
        // 非交互模式：自动选择
        const result = applyChoice(mf, autoChoice, modulesToAsk);
        const desc = autoChoice.toUpperCase() === 'A' ? '跳过4个可选模块' : '生成全部模块';
        console.log(`  · 自动选择 ${autoChoice}: ${desc}`);
    } else {
        // 交互模式：显示菜单等待用户
        await promptInteractive(mf, modulesToAsk);
    }

    manifestLib.save(casePath, mf);

    const skippedModules = manifestLib.MODULE_ORDER.filter(k => mf.modules[k]?.status === 'skipped');
    console.log('');
    if (skippedModules.length > 0) {
        console.log(`  ✓ 跳过模块 (${skippedModules.length}个): ${skippedModules.join(', ')}`);
    }
    const pendingModules = manifestLib.MODULE_ORDER.filter(k => mf.modules[k]?.status === 'pending');
    console.log(`  ✓ 待生成模块 (${pendingModules.length}个): ${pendingModules.join(', ')}`);

    return { type: 'gameplay', skipped: skippedModules };
}

// ===== 直接运行入口 =====

if (require.main === module) {
    const args = process.argv.slice(2);
    const caseDir = args.find(a => !a.startsWith('--'));
    if (!caseDir) {
        console.error('用法: node pipeline/select_modules.js <case_dir> [--auto=A|B]');
        process.exit(1);
    }

    const projectRoot = path.resolve(__dirname, '..');
    const casePath = path.resolve(process.cwd(), caseDir);
    const autoArg = args.find(a => a.startsWith('--auto='));
    const autoChoice = autoArg ? autoArg.split('=')[1] : null;

    selectModules(casePath, autoChoice)
        .then(() => process.exit(0))
        .catch(err => {
            console.error(`  ✗ 错误: ${err.message}`);
            process.exit(1);
        });
}

module.exports = { selectModules };
