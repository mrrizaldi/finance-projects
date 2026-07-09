#!/usr/bin/env bash
# ponytail: jembatan sementara — pull kode bot dari server buat dibaca lokal.
# Hapus kalau docs/SERVER.md sudah cukup.
set -euo pipefail
SERVER=mrrizaldi@192.168.31.221
DEST="$(cd "$(dirname "$0")/.." && pwd)/.server-pull"
mkdir -p "$DEST"
for app in telegram-bot monitor-bot; do
  rsync -avz --delete --exclude=node_modules --exclude=dist --exclude=sessions \
    "$SERVER:~/dev/finance-project/$app/" "$DEST/$app/"
done
echo "Pulled ke $DEST (gitignored, read-only reference)"
