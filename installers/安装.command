#!/bin/bash
# Level Skill Pipeline Installer for macOS
# Double-click this file in Finder to install.

# Ensure we're executable
if [ ! -x "$0" ]; then
    chmod +x "$0"
    exec "$0" "$@"
fi

# Work from the script's own directory
cd "$(dirname "$0")"

CLAUDE_DIR="$HOME/.claude"
INSTALL_DIR="$CLAUDE_DIR/level-skill-pipeline"
COMMANDS_DIR="$CLAUDE_DIR/commands"

# ── Log file ──
TS="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$HOME/level-skill-pipeline_install_${TS}.log"
mkdir -p "$CLAUDE_DIR" 2>/dev/null
START_EPOCH=$(date +%s)

log() {
    local ts="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[$ts] $*" >> "$LOG_FILE"
}

say() {
    # Echo to terminal AND log
    echo "$*"
    log "$*"
}

run_capture() {
    # Run a command, capture both stdout/stderr to log, also show stdout in terminal
    local label="$1"; shift
    log "RUN: $label  (cmd: $*)"
    local out
    out="$("$@" 2>&1)"
    local rc=$?
    if [ -n "$out" ]; then
        echo "$out" | sed 's/^/    /' >> "$LOG_FILE"
    fi
    log "EXIT: $label  rc=$rc"
    return $rc
}

# ── Header ──
{
    echo "==========================================="
    echo " Level Skill Pipeline Installer Log"
    echo " Time:     $(date)"
    echo " Host:     $(hostname)"
    echo " User:     $USER"
    echo " OS:       $(sw_vers -productName) $(sw_vers -productVersion) ($(uname -m))"
    echo " Shell:    $SHELL"
    echo " Script:   $0"
    echo " PWD:      $(pwd)"
    echo " HOME:     $HOME"
    echo "==========================================="
} >> "$LOG_FILE"

clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       Level Skill Pipeline Installer v1.0          ║"
echo "  ║  Level Design AI Agent for Claude Code   ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
say "  Log file: $LOG_FILE"
echo ""

# ── Environment Check ──
say "  Environment Check"
say "  ─────────────────"
CAN_INSTALL=true

# Node.js
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>/dev/null)
    NODE_PATH=$(command -v node)
    say "  [OK] Node.js $NODE_VER  ($NODE_PATH)"
else
    say "  [X]  Node.js not found — install from https://nodejs.org/"
    CAN_INSTALL=false
fi

# Claude Code
if [ -d "$CLAUDE_DIR" ]; then
    say "  [OK] Claude Code directory found ($CLAUDE_DIR)"
else
    say "  [X]  ~/.claude/ not found — install Claude Code first"
    CAN_INSTALL=false
fi
if command -v claude &>/dev/null; then
    CLAUDE_VER=$(claude --version 2>/dev/null | head -1)
    log "  Claude CLI: $CLAUDE_VER"
fi

# mermaid-cli
if command -v mmdc &>/dev/null; then
    say "  [OK] mermaid-cli installed (optional)"
else
    say "  [--] mermaid-cli not found (optional, can skip)"
fi

# npm
if command -v npm &>/dev/null; then
    log "  npm: $(npm --version 2>/dev/null)  ($(command -v npm))"
fi

echo ""

if [ "$CAN_INSTALL" = false ]; then
    say "  ERROR: Prerequisites not met. Please install them first."
    say "  Log saved to: $LOG_FILE"
    echo ""
    echo "  Press any key to exit..."
    read -n 1
    exit 1
fi

say "  Install to: $INSTALL_DIR"
echo ""
read -p "  Press Enter to install, or Ctrl+C to cancel... "
log "  User confirmed install."
echo ""

INSTALL_FAILED=0

# ── Step 1: Copy project files ──
say "  [1/4] Copying project files..."
if [ -d "$INSTALL_DIR" ]; then
    say "         Removing existing installation..."
    if ! rm -rf "$INSTALL_DIR" 2>>"$LOG_FILE"; then
        say "         ERROR: failed to remove existing installation."
        INSTALL_FAILED=1
    fi
fi
if [ "$INSTALL_FAILED" = 0 ]; then
    if cp -r "data" "$INSTALL_DIR" 2>>"$LOG_FILE"; then
        say "         Done."
        log "  Files copied: $(find "$INSTALL_DIR" -type f | wc -l | tr -d ' ') files"
    else
        say "         ERROR: failed to copy data/ to $INSTALL_DIR"
        INSTALL_FAILED=1
    fi
fi

# ── Step 2: Install slash commands ──
if [ "$INSTALL_FAILED" = 0 ]; then
    say "  [2/4] Installing slash commands..."
    if mkdir -p "$COMMANDS_DIR" 2>>"$LOG_FILE" \
        && cp "commands/input-processor.md" "$COMMANDS_DIR/" 2>>"$LOG_FILE" \
        && cp "commands/design-level.md" "$COMMANDS_DIR/" 2>>"$LOG_FILE"; then
        say "         Done."
        log "  Commands present: $(ls -1 "$COMMANDS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')"
    else
        say "         ERROR: failed to install slash commands."
        INSTALL_FAILED=1
    fi
fi

# ── Step 3: npm install ──
if [ "$INSTALL_FAILED" = 0 ]; then
    say "  [3/4] Installing npm dependencies..."
    cd "$INSTALL_DIR"
    log "  cd $INSTALL_DIR"
    log "  Running: npm install --silent"
    NPM_OUT=$(npm install --silent 2>&1)
    NPM_RC=$?
    if [ -n "$NPM_OUT" ]; then
        echo "$NPM_OUT" | sed 's/^/    /' >> "$LOG_FILE"
    fi
    if [ "$NPM_RC" = 0 ]; then
        say "         Done."
    else
        say "         WARNING: npm install failed (rc=$NPM_RC). See log for details."
        say "         Run manually: cd $INSTALL_DIR && npm install"
    fi
    cd - >/dev/null
fi

# ── Step 4: Optional deps ──
say "  [4/4] Checking optional dependencies..."
if command -v mmdc &>/dev/null; then
    say "         mermaid-cli found."
else
    say "         mermaid-cli not installed (optional)."
    say "         Install with: npm install -g @mermaid-js/mermaid-cli"
fi

END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - START_EPOCH))

echo ""
if [ "$INSTALL_FAILED" = 0 ]; then
    say "  ╔══════════════════════════════════════════╗"
    say "  ║       Installation Complete!  (${DURATION}s)        ║"
    say "  ╚══════════════════════════════════════════╝"
else
    say "  ╔══════════════════════════════════════════╗"
    say "  ║       Installation FAILED  (${DURATION}s)           ║"
    say "  ║  Please send the log file to support.    ║"
    say "  ╚══════════════════════════════════════════╝"
fi
echo ""
say "  Usage:"
say "    1. Open Claude Code (cc)"
say "    2. /input-processor <describe your level>"
say "    3. /design-level"
echo ""
say "  Output: $INSTALL_DIR/outputs/{case_id}/"
echo ""
say "  Reference examples:"
say "    $INSTALL_DIR/outputs/case_01_truck/"
say "    $INSTALL_DIR/outputs/case_02_artmuseum/"
echo ""
say "  Log file: $LOG_FILE"
echo ""
echo "  Press any key to close..."
read -n 1
exit $INSTALL_FAILED
