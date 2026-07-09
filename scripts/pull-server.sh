#!/usr/bin/env bash
# ponytail: jembatan sementara — pull semua setup finance dari server buat dibaca lokal.
# Hapus kalau SERVER.md sudah cukup.
set -euo pipefail
SERVER=mrrizaldi@192.168.31.221
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/.server-pull"
mkdir -p "$DEST"

# Bot code
for app in telegram-bot monitor-bot; do
  rsync -avz --delete --exclude=node_modules --exclude=dist --exclude=sessions \
    "$SERVER:~/dev/finance-project/$app/" "$DEST/$app/"
done

# OpenClaw finance skills
rsync -avz --delete \
  --include='finance-*/***' --include='WHATSAPP_SETUP.md' --exclude='*' \
  "$SERVER:~/.openclaw/skills/" "$DEST/openclaw-skills/"

# n8n finance workflows (via public API, key dari .mcp.json)
N8N_URL=https://n8n.mrrizaldi.my.id
KEY=$(python3 -c "import json;print(json.load(open('$ROOT/.mcp.json'))['mcpServers']['n8n']['env']['N8N_API_KEY'])")
mkdir -p "$DEST/n8n-workflows"
curl -s -H "X-N8N-API-KEY: $KEY" "$N8N_URL/api/v1/workflows?limit=100" \
  | python3 -c "
import json,sys,re
for w in json.load(sys.stdin)['data']:
    if re.match(r'Email Parser|Finance Reporter|Daily Report', w['name']):
        print(w['id'], re.sub(r'[^a-z0-9]+','-',w['name'].lower()).strip('-'))
" | while read -r id slug; do
  curl -s -H "X-N8N-API-KEY: $KEY" "$N8N_URL/api/v1/workflows/$id" > "$DEST/n8n-workflows/$slug.json"
  echo "  n8n: $slug"
done

echo "Pulled ke $DEST (gitignored, read-only reference)"
