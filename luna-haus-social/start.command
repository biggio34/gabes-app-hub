#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  Luna Haus Social Sync"
echo "  Leave this window open while you sync posts."
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org then double-click this file again."
  read -r _
  exit 1
fi
(sleep 1; open "http://127.0.0.1:8787") &
exec node ./server.mjs
