/**
 * image_embed.js — 参考图片嵌入工具 v2
 *
 * 核心思路：用中文字符 bigram Jaccard 相似度，自动将图片 context/slide title
 * 匹配到房间标签或区域名，不依赖任何手写关键词表。
 *
 * 匹配优先级：
 *   1. image.context 精确包含目标名 → score 1.0
 *   2. slide.title 精确包含目标名   → score 0.9
 *   3. bigram Jaccard(context, target) × 1.0
 *   4. bigram Jaccard(slide.title, target) × 0.8
 *   最终 score = max(以上 4 项)
 *
 * 图片路径：相对路径，从 outputs/{caseId}/ 到 test_cases/{caseId}/images/
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ============================================================================
// 常量
// ============================================================================

/** 自动匹配黑名单：这些文件是 POI 总览图，不应出现在房间/区域级别 */
const AUTO_MATCH_BLACKLIST = new Set([
    'image-import-58.png',   // POI 平面图，几乎出现在全部 POI 关键节点 slides
]);

/**
 * 通用 context 字符串（不含有效的匹配信息，需要 fallback 到 slide title）
 * 注意：以 http 开头的 URL 也视为通用
 */
const GENERIC_CONTEXT_PATTERNS = [
    /^POI关键节点美术氛围$/,
    /^参考氛围?$/,
    /^参考$/,
    /^https?:\/\//,
    /^详见文案/,
];

function isGenericContext(ctx) {
    if (!ctx || ctx.trim() === '') return true;
    return GENERIC_CONTEXT_PATTERNS.some(re => re.test(ctx.trim()));
}

// ============================================================================
// 文本相似度工具
// ============================================================================

/**
 * 提取文本的 n-gram 集合：
 *   - CJK 汉字 bigram（相邻两字）
 *   - ≤3 字的短中文词额外加 unigram
 *   - ASCII 单词（小写，≥2 字符），处理 "Boss"/"POI" 等
 */
function textNgrams(text) {
    const grams = new Set();
    const str   = text || '';

    // CJK bigrams
    const cjk = str.replace(/[^\u4e00-\u9fff]/g, '');
    for (let i = 0; i < cjk.length - 1; i++) grams.add(cjk[i] + cjk[i + 1]);
    if (cjk.length <= 3) for (const ch of cjk) grams.add(ch);

    // ASCII words (lowercased)
    for (const w of (str.match(/[a-zA-Z]{2,}/g) || [])) grams.add(w.toLowerCase());

    return grams;
}

// 内部别名（保持下方代码可读性）
const cjkBigrams = textNgrams;

/** Jaccard 相似度 */
function jaccard(a, b) {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
}

/**
 * 计算一张图片与一个目标名称的匹配分数 [0, 1]
 *
 * @param {string} slideTitle - 图片所在 slide 的标题
 * @param {string} imgContext - 图片自身的 context 说明
 * @param {string} targetName - 房间标签或区域中文名
 */
function scoreImage(slideTitle, imgContext, targetName) {
    if (!targetName || targetName === 'undefined') return 0;

    const ctx   = (imgContext   || '').trim();
    const title = (slideTitle   || '').trim();

    // 精确子串包含（最高优先）
    if (ctx.includes(targetName))   return 1.0;
    if (title.includes(targetName)) return 0.9;

    // bigram 相似度
    const targetGrams = cjkBigrams(targetName);
    if (targetGrams.size === 0) return 0;

    // 有效 context 优先；通用 context 降级到 slide title
    const effectiveCtx = isGenericContext(ctx) ? title : ctx;
    const cScore = jaccard(targetGrams, cjkBigrams(effectiveCtx));
    const sScore = jaccard(targetGrams, cjkBigrams(title));

    return Math.max(cScore, sScore * 0.8);
}

// ============================================================================
// Manifest 工具
// ============================================================================

/**
 * 加载 image_manifest.json
 */
function loadManifest(projectRoot, caseId) {
    const p = path.join(projectRoot, 'test_cases', caseId, 'image_manifest.json');
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
        console.warn('[image_embed] Failed to parse manifest:', e.message);
        return null;
    }
}

/**
 * 检查图片文件是否存在且大小在限制内
 */
function imageOk(projectRoot, caseId, file, maxSizeKB) {
    const p = path.join(projectRoot, 'test_cases', caseId, 'images', file);
    if (!fs.existsSync(p)) return false;
    if (maxSizeKB) {
        try {
            const sz = fs.statSync(p).size;
            if (sz > maxSizeKB * 1024) return false;
        } catch (e) { return false; }
    }
    return true;
}

function buildSrc(caseId, file) {
    return `../../test_cases/${caseId}/images/${file}`;
}

// ============================================================================
// 核心：图片 → 目标 分配矩阵
// ============================================================================

/**
 * 为每张图片计算其对所有目标的分数，返回按 target 分组的结果。
 *
 * @param {object}   manifest
 * @param {string}   caseId
 * @param {string}   projectRoot
 * @param {string[]} targets      - 目标名称列表（房间标签 or 区域中文名）
 * @param {object}   opts
 * @param {number}   [opts.threshold=0.15]   - 最低匹配分数
 * @param {number}   [opts.maxPerTarget=4]   - 每个目标最多保留几张图
 * @param {number}   [opts.maxSizeKB=2000]   - 文件大小上限（KB）
 * @param {number[]} [opts.slideFilter]       - 只考虑这些 slide index（可选）
 *
 * @returns {{ [targetName: string]: {src,caption,score}[] }}
 */
function buildAssignmentMap(manifest, caseId, projectRoot, targets, opts = {}) {
    const threshold    = opts.threshold    ?? 0.15;
    const maxPerTarget = opts.maxPerTarget ?? 4;
    const maxSizeKB    = opts.maxSizeKB    ?? 2000;
    const slideSet     = opts.slideFilter ? new Set(opts.slideFilter) : null;

    // 预计算每个 target 的 bigram（加速循环）
    const targetGrams = targets.map(t => ({ name: t, grams: cjkBigrams(t) }));

    // { targetName → [{src, caption, score}] }
    const result = {};
    for (const t of targets) result[t] = [];

    for (const slide of manifest.slides) {
        if (slideSet && !slideSet.has(slide.index)) continue;

        for (const img of slide.images) {
            if (AUTO_MATCH_BLACKLIST.has(img.file)) continue;
            if (!imageOk(projectRoot, caseId, img.file, maxSizeKB)) continue;

            const ctx   = (img.context   || '').trim();
            const title = (slide.title   || '').trim();

            // 对每个 target 打分，找最高分
            let bestScore = 0;
            let bestTarget = null;

            for (const tg of targetGrams) {
                const s = scoreImage(title, ctx, tg.name);
                if (s > bestScore) { bestScore = s; bestTarget = tg.name; }
            }

            if (bestScore < threshold || !bestTarget) continue;

            const entry = {
                src:     buildSrc(caseId, img.file),
                caption: isGenericContext(ctx) ? title : ctx,
                score:   bestScore,
            };

            // 同一张图可能被多个 target 匹配（当分数接近时）
            // 策略：只写入分数最高的那个 target（减少重复图）
            result[bestTarget].push(entry);
        }
    }

    // 每个 target：按 score 降序排列，去重文件名，截取 maxPerTarget
    for (const t of targets) {
        const seen = new Set();
        result[t] = result[t]
            .sort((a, b) => b.score - a.score)
            .filter(e => {
                const file = e.src.split('/').pop();
                if (seen.has(file)) return false;
                seen.add(file);
                return true;
            })
            .slice(0, maxPerTarget)
            .map(({ src, caption }) => ({ src, caption })); // 去掉 score 字段
    }

    return result;
}

// ============================================================================
// spatial_layout: ASSETS_JSON 构建
// ============================================================================

/**
 * 构建 spatial_layout 的 ASSETS_JSON。
 * 除房间标签外，还加入几个特殊 slot（POI 总览、鸟瞰等）。
 *
 * @param {object}   manifest
 * @param {string}   caseId
 * @param {string}   projectRoot
 * @param {string[]} roomLabels   - layout_data.json 中的 shape.label 列表
 * @returns {string} JSON 字符串，可直接填入模板
 */
function buildSpatialAssetsJson(manifest, caseId, projectRoot, roomLabels) {
    const validLabels = [...new Set(roomLabels.filter(l => l && l !== 'undefined'))];

    // 特殊总览 slot
    const overviewSlots = ['POI平面规划图', 'POI鸟瞰图', 'POI整体氛围', '小东京区域'];
    const allTargets = [...overviewSlots, ...validLabels];

    // 对所有 slides 跑分配
    const map = buildAssignmentMap(manifest, caseId, projectRoot, allTargets, {
        threshold:    0.10,
        maxPerTarget: 4,
        maxSizeKB:    2000,
    });

    // 只保留有图的 key
    const output = {};
    for (const [k, v] of Object.entries(map)) {
        if (v.length > 0) output[k] = v;
    }
    return JSON.stringify(output, null, 2);
}

// ============================================================================
// atmosphere_ref: 区域图片
// ============================================================================

/**
 * 氛围参考使用的 slide 范围（整体氛围 + 关键节点）
 */
const ATMO_SLIDES = [
    8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    29, 30, 31, 32,
    47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65,
];

/**
 * 为 atmosphere_ref 的单个区域获取参考图列表
 *
 * @param {object} manifest
 * @param {string} regionId      - 如 "reg_yamiko_room"
 * @param {string} regionName    - 中文区域名，如 "阳美子居室（含伞舞阁）"
 * @param {string} caseId
 * @param {string} projectRoot
 * @param {object} opts
 * @returns {{src,caption}[]}
 */
function getRegionImages(manifest, regionId, regionName, caseId, projectRoot, opts = {}) {
    const maxImages = opts.maxImages ?? 3;
    const maxSizeKB = opts.maxSizeKB ?? 1500;

    // 将复合区域名拆成多个候选（如 "阳美子居室（含伞舞阁）" → ["阳美子居室", "伞舞阁"]）
    // 若 regionName 无效（只有 regionId），候选列表为空 → 直接走 fallback
    const candidateNames = regionName && !regionName.startsWith('reg_')
        ? splitRegionName(regionName)
        : [];

    const results = [];
    const seen    = new Set();

    if (candidateNames.length > 0) {
        for (const slide of manifest.slides) {
            if (!ATMO_SLIDES.includes(slide.index)) continue;
            if (results.length >= maxImages) break;

            for (const img of slide.images) {
                if (results.length >= maxImages) break;
                if (AUTO_MATCH_BLACKLIST.has(img.file)) continue;
                if (seen.has(img.file)) continue;
                if (!imageOk(projectRoot, caseId, img.file, maxSizeKB)) continue;

                const ctx   = (img.context  || '').trim();
                const title = (slide.title  || '').trim();

                // 对所有候选名取最大分
                const best = Math.max(...candidateNames.map(n => scoreImage(title, ctx, n)));
                if (best < 0.10) continue;

                seen.add(img.file);
                results.push({
                    src:     buildSrc(caseId, img.file),
                    caption: isGenericContext(ctx) ? title : ctx,
                    score:   best,
                });
            }
        }
    }

    // Fallback：若没有精准匹配，从整体氛围 slides(8-21) 中取小图作为通用参考
    if (results.length < maxImages) {
        const fallbackSlides = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
        for (const slide of manifest.slides) {
            if (results.length >= maxImages) break;
            if (!fallbackSlides.includes(slide.index)) continue;

            for (const img of slide.images) {
                if (results.length >= maxImages) break;
                if (AUTO_MATCH_BLACKLIST.has(img.file)) continue;
                if (seen.has(img.file)) continue;
                // fallback 用更严格的大小限制（只取较小的图）
                if (!imageOk(projectRoot, caseId, img.file, 500)) continue;

                seen.add(img.file);
                const ctx = img.context || slide.title || '';
                results.push({
                    src:     buildSrc(caseId, img.file),
                    caption: isGenericContext(ctx) ? slide.title : ctx,
                    score:   0,
                });
            }
        }
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxImages)
        .map(({ src, caption }) => ({ src, caption }));
}

/**
 * 将区域名拆成多个匹配候选
 * "阳美子居室（含伞舞阁）" → ["阳美子居室", "阳美子", "伞舞阁"]
 * "夏院（含仓库、健身房/澡堂）" → ["夏院", "仓库", "健身房", "澡堂"]
 */
function splitRegionName(name) {
    const parts = name
        .split(/[（）【】()/、,，\s]+/)
        .map(s => s.replace(/^含/, '').trim())
        .filter(s => s.length >= 2);
    // 去重
    return [...new Set(parts)];
}

// ============================================================================
// atmosphere_ref: 整体画廊
// ============================================================================

/**
 * 构建 atmosphere_ref 顶部的整体氛围参考画廊 HTML
 */
function buildAtmoGalleryHtml(manifest, caseId, projectRoot) {
    // 来自 slide 8-21（整体氛围 slides）中体积较小的图
    const gallerySlides = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    const seen    = new Set();
    const images  = [];

    for (const slide of manifest.slides) {
        if (!gallerySlides.includes(slide.index)) continue;
        if (images.length >= 16) break;

        for (const img of slide.images) {
            if (images.length >= 16) break;
            if (AUTO_MATCH_BLACKLIST.has(img.file)) continue;
            if (seen.has(img.file)) continue;
            if (!imageOk(projectRoot, caseId, img.file, 1000)) continue;

            seen.add(img.file);
            const ctx = img.context || slide.title || '';
            images.push({ src: buildSrc(caseId, img.file), caption: ctx });
        }
    }

    if (images.length === 0) return '';

    const thumbs = images.map(img =>
        `<div class="ref-thumb" style="flex:0 0 auto;">
            <img src="${escapeAttr(img.src)}" title="${escapeAttr(img.caption)}" loading="lazy"
                 style="height:90px;width:auto;max-width:160px;object-fit:cover;border-radius:3px;display:block;">
            <div style="font-size:9px;color:#888;margin-top:2px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                 title="${escapeAttr(img.caption)}">${escapeHtml(img.caption)}</div>
        </div>`
    ).join('\n');

    return `
    <div class="ref-gallery-section" style="margin:12px 0 20px;padding:12px;background:var(--bg-secondary,#f8f7f4);border-radius:6px;border:1px solid var(--border-light,#e0ddd5);">
        <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">▸ POI 整体氛围参考 (${images.length} 张)</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${thumbs}</div>
    </div>`;
}

// ============================================================================
// 辅助
// ============================================================================

function escapeAttr(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
    loadManifest,
    buildSpatialAssetsJson,
    getRegionImages,
    buildAtmoGalleryHtml,
};
