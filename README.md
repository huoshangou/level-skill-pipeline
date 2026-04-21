# Level Skill Pipeline

> 大世界关卡设计 AI Skill 管线 — 通过 Claude Code 的 slash command 串联，从对话生成完整关卡/玩法设计文档

## 架构

```
┌──────────────────────────────────────────────────────┐
│  Claude Code  +  slash commands (/input-processor,   │
│                  /design-level)                       │
└──────────────┬───────────────────────────────────────┘
               │ 读 contracts/、调用 pipeline/ 脚本、写 outputs/
               ▼
       ~/.claude/level-skill-pipeline/
       ├── contracts/      ← schema、模块模板、editor.html
       ├── pipeline/       ← Node.js 脚本（assemble、scorer 等）
       ├── test_cases/     ← 知识库种子
       └── outputs/        ← 生成产物（用户机器上）
```

**两个 skill 入口：**
- `/input-processor <描述>` — 对话引导，5 轮内填出 6 维 IR
- `/design-level [IR 路径或描述]` — 基于 IR 自动生成 12 个模块的 HTML 文档 + 评分

## 仓库结构

```
level-skill-pipeline/
├── src/                  ← 源码（=安装到用户机器的内容）
│   ├── contracts/
│   ├── pipeline/
│   ├── test_cases/       ← 仅种子案例（case_01、case_02）
│   ├── commands/         ← slash command .md 文件
│   └── package.json
├── installers/           ← 多平台安装器
│   ├── 安装.command      ← macOS / Linux
│   ├── 安装.bat          ← Windows 入口
│   └── installer.ps1     ← Windows GUI 实现
├── scripts/
│   └── build-dist.sh     ← 打包成发布 zip
├── dist/                 ← 构建产物（gitignore）
├── README.md
└── CHANGELOG.md
```

## 开发流程

```bash
# 改 src/ 后，本地 link 立即生效
ln -sfn ~/Desktop/level-skill-pipeline/src ~/.claude/level-skill-pipeline
ln -sfn ~/Desktop/level-skill-pipeline/src/commands/design-level.md ~/.claude/commands/design-level.md
ln -sfn ~/Desktop/level-skill-pipeline/src/commands/input-processor.md ~/.claude/commands/input-processor.md

# 一次性安装 npm 依赖
cd src && npm install
```

## 发布流程

```bash
# 1. 改完代码、更新 CHANGELOG.md
# 2. 打包 dist
./scripts/build-dist.sh                         # → dist/level-skill-pipeline-vX.Y.zip
# 3. 打 tag
git tag vX.Y && git push --tags
# 4. 发 GitHub Release
gh release create vX.Y dist/level-skill-pipeline-vX.Y.zip \
    --title "vX.Y: <one-line summary>" \
    --notes-file CHANGELOG.md
```

同事去 release 页面下 zip → 解压 → 双击 `安装.command` / `安装.bat`。

## 安装目标位置

| 内容 | 位置 |
|------|------|
| 项目文件 | `~/.claude/level-skill-pipeline/` |
| Slash commands | `~/.claude/commands/{design-level,input-processor}.md` |
| 安装日志 | `~/level-skill-pipeline_install_<timestamp>.log` |
| 用户输出 | `~/.claude/level-skill-pipeline/outputs/{case_id}/` |

## 前置要求

- Node.js v18+
- Claude Code（已登录）
