#!/bin/bash
# Jerry Sub-Agent Monitor for SwiftBar
# Refresh: 30 seconds (filename: jerry.30s.sh)

API_URL="http://100.116.235.105:3001/api/sessions"
data=$(curl -s "$API_URL" 2>/dev/null)

if [ -z "$data" ]; then
    echo "🤖 offline"
    exit 0
fi

active=$(echo "$data" | jq '[.sessions[] | select(.status=="active")] | length')

if [ "$active" -gt 0 ]; then
    echo "🟢 $active"
else
    echo "🤖"
fi

echo "---"
echo "Active: $active"
echo "---"
echo "Open Dashboard | href=http://100.116.235.105:5173"
