#!/usr/bin/env bash
# Deploy finance-api ke home server.
#
# Jalanin dari laptop:
#   bash scripts/deploy.sh              # deploy beneran
#   bash scripts/deploy.sh --dry-run    # cek preflight + tunjukin file apa yang bakal berubah
#
# Alurnya: server clone sendiri dari GitHub (server BUKAN git repo — cuma source
# hasil deploy + .env), rsync ke ~/dev/finance-project, build, pm2 restart.
#
# Server, repo, branch bisa dioverride lewat env var kalau perlu.
set -euo pipefail

SERVER="${FINANCE_SERVER:-mrrizaldi@192.168.31.221}"
REPO="${FINANCE_REPO:-https://github.com/mrrizaldi/finance-projects.git}"
BRANCH="${FINANCE_BRANCH:-main}"
HEALTH_URL="${FINANCE_HEALTH_URL:-http://localhost:3701/}"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

cd "$(dirname "$0")/.."

die() { printf '\n\033[31mGAGAL:\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[36m==>\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- preflight
step "Preflight di laptop"

git diff --quiet && git diff --cached --quiet \
  || die "working tree kotor. Commit atau stash dulu:$(printf '\n  %s' "$(git status --short)")"

git fetch -q origin "$BRANCH"
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")
[[ "$local_sha" == "$remote_sha" ]] \
  || die "HEAD ($(git rev-parse --short HEAD)) beda dari origin/$BRANCH ($(git rev-parse --short origin/$BRANCH)). Push dulu — server clone dari GitHub, bukan dari sini."

# .gitignore baris `*.json` bikin file json baru ke-ignore diam-diam. Udah dua kali
# kejadian: locale i18n (build gagal di server) dan fixture test (CI merah).
# Scan semua dir yang ke-commit, buang cuma output build.
untracked_json=()
while IFS= read -r f; do
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 || untracked_json+=("$f")
done < <(find api dashboard tests scripts supabase -name '*.json' \
  -not -name '.*' \
  -not -path '*/node_modules/*' -not -path '*/build/*' -not -path '*/dist/*' \
  -not -path '*/coverage/*' -not -path '*/.next/*' -not -path '*/.react-router/*' \
  -not -path '*/test-results/*' -not -path '*/playwright-report/*' 2>/dev/null)
if (( ${#untracked_json[@]} )); then
  die "file .json di source belum ke-track (ke-ignore sama \`*.json\` di .gitignore).
Server clone dari GitHub jadi file ini GAK ikut dan build bakal gagal.
Fix: git add -f $(printf '%s ' "${untracked_json[@]}")"
fi

# Deploy commit yang CI-nya merah = persis kesalahan yang mau dicegah CI.
if command -v gh >/dev/null 2>&1; then
  ci=$(gh run list --branch "$BRANCH" --commit "$local_sha" --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"' 2>/dev/null || echo "")
  case "$ci" in
    "completed success") echo "  CI: hijau" ;;
    "") echo "  CI: belum ada run buat commit ini (dilewat)" ;;
    completed*)          die "CI commit ini GAGAL ($ci). Benerin dulu, atau skip cek ini dengan: gh run rerun" ;;
    *)                   die "CI masih jalan ($ci). Tunggu selesai." ;;
  esac
else
  echo "  CI: gh gak ada, cek dilewat"
fi

echo "  commit : $(git log -1 --format='%h %s')"
echo "  target : $SERVER"
(( DRY_RUN )) && echo "  mode   : DRY RUN (gak ada yang diubah di server)"

# ---------------------------------------------------------------- remote
step "Deploy ke server"

ssh "$SERVER" "REPO='$REPO' BRANCH='$BRANCH' DRY_RUN='$DRY_RUN' HEALTH_URL='$HEALTH_URL' bash -s" <<'REMOTE'
set -euo pipefail

# pnpm/pm2 gak ada di PATH default buat shell non-interaktif
export PATH="$HOME/.proto/tools/node/globals/bin:$HOME/.proto/shims:$PATH"

APP_DIR="$HOME/dev/finance-project"
SRC_DIR=$(mktemp -d /tmp/finance-deploy.XXXXXX)
trap 'rm -rf "$SRC_DIR"' EXIT

echo "--> clone $BRANCH"
git clone --depth 1 -b "$BRANCH" "$REPO" "$SRC_DIR" 2>&1 | tail -1

# --delete WAJIB dibarengi exclude .env* — tanpa itu secrets produksi kehapus.
RSYNC_OPTS=(-a --delete
  --exclude node_modules
  --exclude '.env'
  --exclude '.env.*'
  --exclude build
  --exclude dist
  --exclude '*.tsbuildinfo')

if [ "$DRY_RUN" = "1" ]; then
  echo "--> DRY RUN — yang bakal berubah:"
  for d in dashboard api; do
    echo "    [$d]"
    rsync "${RSYNC_OPTS[@]}" -n -i "$SRC_DIR/$d/" "$APP_DIR/$d/" | sed 's/^/      /'
  done
  echo "--> dry run selesai, server gak disentuh"
  exit 0
fi

echo "--> rsync source"
for d in dashboard api; do
  rsync "${RSYNC_OPTS[@]}" "$SRC_DIR/$d/" "$APP_DIR/$d/"
done

# Sabuk pengaman: kalau exclude di atas bocor, berhenti SEBELUM build/restart.
for f in "$APP_DIR/api/.env" "$APP_DIR/dashboard/.env.local" "$APP_DIR/.env"; do
  [ -f "$f" ] || { echo "GAGAL: $f hilang setelah rsync — deploy dibatalkan" >&2; exit 1; }
done
echo "--> file .env aman"

# Build sebelum sentuh pm2: build gagal = proses lama tetap jalan.
echo "--> build dashboard"
cd "$APP_DIR/dashboard" && pnpm install --frozen-lockfile && pnpm build

echo "--> build api"
# tsc gak hapus output dari file sumber yang udah dihapus, jadi dist/ numpuk modul
# mati tiap deploy. Hapus dulu. Aman karena preflight udah maksa CI hijau di commit
# yang sama — build di sini gagal cuma kalau toolchain server beda, dan proses lama
# tetap jalan (kodenya udah kebaca di memori).
cd "$APP_DIR/api" && pnpm install --frozen-lockfile && rm -rf dist && pnpm build

echo "--> restart finance-api"
pm2 restart finance-api --update-env
pm2 save --force >/dev/null

echo "--> health check"
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || echo 000)
  [ "$code" = "200" ] && { echo "    HTTP $code — hidup"; exit 0; }
  sleep 2
done

echo "GAGAL: health check gak balik 200 (terakhir: $code)" >&2
pm2 logs finance-api --nostream --lines 30 >&2
exit 1
REMOTE

step "Selesai"
