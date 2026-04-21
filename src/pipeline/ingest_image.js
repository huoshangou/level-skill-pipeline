#!/usr/bin/env node
/**
 * ingest_image.js — 把本地图片以 base64 形式注入 manifest.reference_assets
 *
 * 设计目的：Agent（在 Claude Code 对话里跑）不要直接 Read 大图，
 * 也不要让用户 paste 图片。改用此脚本：用户提供路径，脚本读取/编码/写
 * manifest，stdout 只回 metadata（≤500 字节）。彻底避免图片 base64 流回对话。
 *
 * 用法:
 *   node pipeline/ingest_image.js \
 *       --case=outputs/case_01_truck \
 *       --src=outputs/case_01_truck/refs/approach.png \
 *       --label=approach_screenshot \
 *       --category=overview_reference \
 *       [--caption="发现并接近"] \
 *       [--max-bytes=1572864]
 *
 * 退出码: 0 成功 / 1 参数或文件错误 / 2 超过字节预算
 *
 * stdout (JSON, 单行): { ok, manifest_path, label, bytes, sha, mime, total_assets }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const manifestLib = require('./lib/manifest');

const DEFAULT_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB per image
const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
};

function parseArgs(argv) {
    const out = {};
    for (const a of argv.slice(2)) {
        const m = a.match(/^--([^=]+)=(.*)$/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

function emit(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

function fail(msg, code = 1, extra = {}) {
    emit({ ok: false, error: msg, ...extra });
    process.exit(code);
}

const args = parseArgs(process.argv);
const required = ['case', 'src', 'label'];
for (const k of required) {
    if (!args[k]) fail(`missing required arg: --${k}=...`);
}

const projectRoot = path.resolve(__dirname, '..');
const caseDir = path.isAbsolute(args.case) ? args.case : path.resolve(projectRoot, args.case);
const srcPath = path.isAbsolute(args.src) ? args.src : path.resolve(projectRoot, args.src);
const label = args.label;
const category = args.category || 'overview_reference';
const caption = args.caption || '';
const maxBytes = args['max-bytes'] ? parseInt(args['max-bytes'], 10) : DEFAULT_MAX_BYTES;

if (!fs.existsSync(srcPath)) fail(`source image not found: ${srcPath}`);
if (!fs.existsSync(caseDir)) fail(`case dir not found: ${caseDir}`);

const stat = fs.statSync(srcPath);
if (stat.size > maxBytes) {
    fail(
        `image too large: ${stat.size} bytes > ${maxBytes} (limit). ` +
        `compress to ≤${Math.floor(maxBytes / 1024)}KB before ingest, ` +
        `or pass --max-bytes=<n> if you really need to override.`,
        2,
        { bytes: stat.size, max_bytes: maxBytes }
    );
}

const ext = path.extname(srcPath).toLowerCase();
const mime = MIME_BY_EXT[ext];
if (!mime) fail(`unsupported image extension: ${ext}`);

const buf = fs.readFileSync(srcPath);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
const dataUri = `data:${mime};base64,${buf.toString('base64')}`;

const mf = manifestLib.load(caseDir);
if (!mf) fail(`manifest.json not found in ${caseDir}; run pipeline phase 0 first`);

if (!Array.isArray(mf.reference_assets)) {
    mf.reference_assets = [];
}

const existingIdx = mf.reference_assets.findIndex(
    (a) => a.label === label && a.category === category
);

const entry = {
    label,
    category,
    caption,
    src_path: path.relative(projectRoot, srcPath),
    mime,
    bytes: stat.size,
    sha,
    data_uri: dataUri,
    ingested_at: new Date().toISOString(),
};

if (existingIdx >= 0) {
    mf.reference_assets[existingIdx] = entry;
} else {
    mf.reference_assets.push(entry);
}

mf.last_updated = new Date().toISOString();
manifestLib.save(caseDir, mf);

emit({
    ok: true,
    manifest_path: path.relative(projectRoot, path.join(caseDir, 'manifest.json')),
    label,
    category,
    bytes: stat.size,
    sha: sha.slice(0, 16),
    mime,
    total_assets: mf.reference_assets.length,
    replaced: existingIdx >= 0,
});
