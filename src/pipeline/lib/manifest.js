/**
 * manifest.js — Manifest 状态中枢管理工具
 *
 * 提供 manifest.json 的 CRUD、哈希计算、状态管理、完整性校验。
 * 所有 pipeline 脚本共享此模块，避免各自手动操作 JSON。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ORDER = [
    'level_overview', 'spatial_layout', 'bubble_chart', 'emotion_curve',
    'asset_list', 'atmosphere_ref', 'storyboard', 'lighting_req',
    'vfx_req', 'audio_req', 'tech_req',
];

/**
 * 初始化新 manifest（所有模块 pending）
 */
function init(casePath, caseId) {
    const modules = {};
    for (const key of MODULE_ORDER) {
        modules[key] = {
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

    const manifest = {
        case_id: caseId || path.basename(casePath),
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        ir: {
            status: 'pending',
            version: null,
            file_hash: null,
            confirmed_at: null,
        },
        modules,
        assembly: {
            status: 'not_started',
            file_hash: null,
            assembled_at: null,
            modules_snapshot: {},
        },
        scoring: {
            auto_score: null,
            auto_score_details: null,
            human_scores: null,
            passed: null,
            scored_at: null,
        },
        review_log: [],
    };

    save(casePath, manifest);
    return manifest;
}

/**
 * 加载 manifest.json
 */
function load(casePath) {
    const filePath = path.join(casePath, 'manifest.json');
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * 保存 manifest.json
 */
function save(casePath, manifest) {
    manifest.last_updated = new Date().toISOString();
    const filePath = path.join(casePath, 'manifest.json');
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * 获取模块状态
 */
function getModuleStatus(manifest, moduleKey) {
    return manifest.modules?.[moduleKey]?.status || 'unknown';
}

/**
 * 更新模块字段（浅合并）
 */
function updateModule(manifest, moduleKey, updates) {
    if (!manifest.modules[moduleKey]) {
        manifest.modules[moduleKey] = {};
    }
    Object.assign(manifest.modules[moduleKey], updates);
}

/**
 * 计算文件 SHA-256 哈希
 */
function computeFileHash(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 锁定模块：计算哈希 + 设置 locked + 记录时间
 */
function lockModule(manifest, moduleKey, filePath) {
    const hash = computeFileHash(filePath);
    const now = new Date().toISOString();
    updateModule(manifest, moduleKey, {
        status: 'locked',
        file_hash: hash,
        confirmed_at: manifest.modules[moduleKey].confirmed_at || now,
        locked_at: now,
    });
    // 版本至少为 1
    if (!manifest.modules[moduleKey].version || manifest.modules[moduleKey].version < 1) {
        manifest.modules[moduleKey].version = 1;
    }
}

/**
 * 添加修改记录（版本+1）
 */
function addModification(manifest, moduleKey, reason, changes, filePath) {
    const mod = manifest.modules[moduleKey];
    const prevHash = mod.file_hash;
    const newHash = computeFileHash(filePath);
    const newVersion = (mod.version || 1) + 1;
    const now = new Date().toISOString();

    if (!mod.modification_history) {
        mod.modification_history = [];
    }

    mod.modification_history.push({
        version: newVersion,
        reason,
        requester: 'level_design',
        changes,
        previous_hash: prevHash,
        new_hash: newHash,
        modified_at: now,
    });

    mod.version = newVersion;
    mod.file_hash = newHash;
    mod.status = 'locked';
    mod.locked_at = now;
}

/**
 * 获取管线进度摘要
 */
function getProgress(manifest) {
    const result = { total: MODULE_ORDER.length, locked: 0, confirmed: 0, generated: 0, pending: 0, skipped: 0, unknown: 0 };
    for (const key of MODULE_ORDER) {
        const status = manifest.modules?.[key]?.status || 'pending';
        if (result[status] !== undefined) {
            result[status]++;
        } else {
            result.unknown++;
        }
    }
    // effective_total 排除 skipped 模块（评分和完整性检查基于此值）
    result.effective_total = result.total - result.skipped;
    result.ir_status = manifest.ir?.status || 'pending';
    result.assembly_status = manifest.assembly?.status || 'not_started';
    result.score = manifest.scoring?.auto_score || null;
    result.passed = manifest.scoring?.passed || null;
    return result;
}

/**
 * 校验所有 file_hash 与实际文件一致
 */
function validateIntegrity(manifest, casePath) {
    const issues = [];
    for (const key of MODULE_ORDER) {
        const mod = manifest.modules?.[key];
        if (!mod || !mod.file_hash) continue;
        if (mod.status === 'skipped') continue;

        const filePath = path.join(casePath, `${key}.html`);
        if (!fs.existsSync(filePath)) {
            issues.push({ module: key, error: 'file_missing', expected: mod.file_hash });
            continue;
        }

        const actualHash = computeFileHash(filePath);
        if (actualHash !== mod.file_hash) {
            issues.push({ module: key, error: 'hash_mismatch', expected: mod.file_hash, actual: actualHash });
        }
    }

    // 检查 assembly
    if (manifest.assembly?.file_hash) {
        const asmPath = path.join(casePath, 'assembled_document.html');
        if (fs.existsSync(asmPath)) {
            const actualHash = computeFileHash(asmPath);
            if (actualHash !== manifest.assembly.file_hash) {
                issues.push({ module: 'assembly', error: 'hash_mismatch', expected: manifest.assembly.file_hash, actual: actualHash });
            }
        }
    }

    return { valid: issues.length === 0, issues };
}

/**
 * 生成 assembly 的 modules_snapshot
 */
function buildAssemblySnapshot(manifest) {
    const snapshot = {};
    for (const key of MODULE_ORDER) {
        const mod = manifest.modules?.[key];
        snapshot[key] = {
            version: mod?.version || 0,
            hash: mod?.file_hash ? mod.file_hash.substring(0, 8) : null,
        };
    }
    return snapshot;
}

module.exports = {
    MODULE_ORDER,
    init,
    load,
    save,
    getModuleStatus,
    updateModule,
    computeFileHash,
    lockModule,
    addModification,
    getProgress,
    validateIntegrity,
    buildAssemblySnapshot,
};
