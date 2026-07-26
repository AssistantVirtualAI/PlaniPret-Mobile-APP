#!/bin/bash
# Après npx cap sync, réinjecter packageClassList dans capacitor.config.json
# pour que les plugins inline PpSipKeepAlive et PpVoipCall soient chargés par Capacitor

CONFIG_FILE="ios/App/App/capacitor.config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: $CONFIG_FILE not found — run npx cap sync first"
  exit 1
fi

# Ajouter packageClassList si absent ou incomplet
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
const required = ['PpSipKeepAlive', 'PpVoipCall'];
const current = config.packageClassList || [];
const merged = [...new Set([...current, ...required])];
config.packageClassList = merged;
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, '\t'));
console.log('packageClassList updated:', merged);
"
