#!/usr/bin/env bash
# Build a release zip from src/ + installers/.
# Output: dist/level-skill-pipeline-<version>.zip
# When extracted: ./level-skill-pipeline-<version>/{安装.command, 安装.bat, installer.ps1, data/, commands/, SETUP.md}

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Resolve version ──
# Priority: CLI arg > git tag at HEAD > package.json version > "dev"
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    VERSION="$(git describe --tags --exact-match 2>/dev/null || true)"
fi
if [ -z "$VERSION" ]; then
    VERSION="v$(node -p "require('./src/package.json').version" 2>/dev/null || echo dev)"
fi
echo "Building $VERSION ..."

PKG_NAME="level-skill-pipeline-${VERSION}"
STAGE="dist/${PKG_NAME}"
ZIP="dist/${PKG_NAME}.zip"

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE/data" "$STAGE/commands"

# ── Copy src content as `data/` (matches installer expectations) ──
cp -R src/contracts  "$STAGE/data/"
cp -R src/pipeline   "$STAGE/data/"
cp    src/package.json "$STAGE/data/"

# test_cases: WHITELIST only — never ship company-internal cases (case_03+).
# Add new seed cases here explicitly; default is to NOT ship.
mkdir -p "$STAGE/data/test_cases"
SEED_CASES=(case_01_truck case_02_artmuseum)
for c in "${SEED_CASES[@]}"; do
    if [ -d "src/test_cases/$c" ]; then
        cp -R "src/test_cases/$c" "$STAGE/data/test_cases/"
    else
        echo "  WARN: seed case missing: src/test_cases/$c" >&2
    fi
done

# Sanity guard: refuse to ship if anything other than the seed list snuck in
SHIPPED="$(/bin/ls "$STAGE/data/test_cases/" | sort)"
EXPECTED="$(printf "%s\n" "${SEED_CASES[@]}" | sort)"
if [ "$SHIPPED" != "$EXPECTED" ]; then
    echo "ERROR: test_cases contains unexpected entries:" >&2
    echo "  Got:      $SHIPPED" >&2
    echo "  Expected: $EXPECTED" >&2
    rm -rf "$STAGE"
    exit 1
fi

# ── Copy slash commands ──
cp src/commands/*.md "$STAGE/commands/"

# ── Copy installers (entry points sit at zip root) ──
cp installers/安装.command   "$STAGE/"
cp installers/安装.bat       "$STAGE/"
cp installers/installer.ps1  "$STAGE/"
chmod +x "$STAGE/安装.command"

# ── SETUP.md inside the zip ──
cat > "$STAGE/SETUP.md" <<EOF
# Level Skill Pipeline — 安装指南 (${VERSION})

> 大世界关卡设计 AI Skill 管线 — Claude Code slash command

## 前置要求

- **Node.js** (v18+) — [下载](https://nodejs.org/)
- **Claude Code** — 已安装并登录

## 安装

### macOS / Linux
双击 \`安装.command\`，或在终端运行：
\`\`\`bash
chmod +x 安装.command && ./安装.command
\`\`\`

### Windows
双击 \`安装.bat\`。

安装器会：
1. 复制项目文件到 \`~/.claude/level-skill-pipeline/\`
2. 安装 slash commands 到 \`~/.claude/commands/\`
3. 跑 \`npm install\`
4. 全程日志写到 \`~/level-skill-pipeline_install_<时间戳>.log\`

**遇到问题？** 把日志文件发回来，里面有完整的环境信息和错误堆栈。

## 使用

打开 Claude Code：
\`\`\`
/input-processor 我想设计一个废弃工厂的潜入关卡
\`\`\`
（5 轮对话填出 IR，然后）
\`\`\`
/design-level
\`\`\`
自动生成 12 个模块的 HTML 文档。

## 卸载

删除以下：
- \`~/.claude/level-skill-pipeline/\`
- \`~/.claude/commands/design-level.md\`
- \`~/.claude/commands/input-processor.md\`
EOF

# ── Build zip ──
( cd dist && zip -rq "${PKG_NAME}.zip" "${PKG_NAME}" )
rm -rf "$STAGE"

SIZE="$(du -h "$ZIP" | awk '{print $1}')"
echo ""
echo "  ✓ Built: $ZIP  ($SIZE)"
echo ""
echo "  Verify locally:"
echo "    unzip -l $ZIP"
echo ""
echo "  Release:"
echo "    git tag $VERSION && git push --tags"
echo "    gh release create $VERSION $ZIP --title \"$VERSION\" --notes-file CHANGELOG.md"
