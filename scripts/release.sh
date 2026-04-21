#!/usr/bin/env bash
# One-shot release: build dist + tag + push + create GitHub release.
#
# Usage:
#   ./scripts/release.sh v1.1
#
# Prerequisites:
#   - clean working tree (will refuse otherwise)
#   - on main branch (will refuse otherwise)
#   - CHANGELOG.md updated for the new version
#   - gh CLI authenticated

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>   e.g. $0 v1.1" >&2
    exit 1
fi
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
    echo "ERROR: version must look like v1.1 or v1.1.0, got: $VERSION" >&2
    exit 1
fi

# ── Pre-flight ──
echo ">> Pre-flight checks"

# Clean working tree
if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree dirty — commit or stash first:" >&2
    git status --short >&2
    exit 1
fi

# On main
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
    echo "ERROR: not on main branch (on $BRANCH)" >&2
    exit 1
fi

# Tag must not exist locally or remotely
if git rev-parse --verify "$VERSION" >/dev/null 2>&1; then
    echo "ERROR: tag $VERSION already exists locally" >&2
    exit 1
fi
if git ls-remote --exit-code --tags origin "$VERSION" >/dev/null 2>&1; then
    echo "ERROR: tag $VERSION already exists on origin" >&2
    exit 1
fi

# CHANGELOG must mention this version
if ! grep -q "$VERSION\|${VERSION#v}" CHANGELOG.md; then
    echo "WARNING: CHANGELOG.md doesn't mention $VERSION (or ${VERSION#v})" >&2
    read -p "  Continue anyway? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || exit 1
fi

# gh auth
gh auth status >/dev/null 2>&1 || { echo "ERROR: gh not authenticated, run: gh auth login" >&2; exit 1; }

echo "   OK"
echo ""

# ── Build ──
echo ">> Building dist for $VERSION"
./scripts/build-dist.sh "$VERSION"
ZIP="dist/level-skill-pipeline-${VERSION}.zip"
[ -f "$ZIP" ] || { echo "ERROR: build did not produce $ZIP" >&2; exit 1; }
echo ""

# ── Tag ──
echo ">> Tagging $VERSION"
git tag -a "$VERSION" -m "Release $VERSION"
echo "   created tag $VERSION"
echo ""

# ── Push ──
echo ">> Pushing main + tag"
git push origin main
git push origin "$VERSION"
echo ""

# ── Release ──
echo ">> Creating GitHub release"
gh release create "$VERSION" "$ZIP" \
    --title "$VERSION" \
    --notes-file CHANGELOG.md
echo ""

URL="$(gh release view "$VERSION" --json url --jq .url)"
echo "============================================="
echo "  ✓ Released $VERSION"
echo "  $URL"
echo "============================================="
