#!/usr/bin/env bash
# Generate scripts/config.js from Netlify env vars (used only during deploy).
# Uses echo to write a CONFIG object and window.CONFIG, same shape as local config.js.

set -e
mkdir -p scripts

# Escape a value for use inside a double-quoted JS string (backslash, quote, newline)
escape() {
  local v="$1"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  v="${v//$'\n'/\\n}"
  printf '%s' "$v"
}

{
  echo '// Generated at build time from Netlify env vars.'
  echo 'const CONFIG = {'
} > scripts/config.js

echo '  FIREBASE_API_KEY: "'$(escape "${FIREBASE_API_KEY:-}")'",' >> scripts/config.js
echo '  FIREBASE_AUTH_DOMAIN: "'$(escape "${FIREBASE_AUTH_DOMAIN:-}")'",' >> scripts/config.js
echo '  FIREBASE_PROJECT_ID: "'$(escape "${FIREBASE_PROJECT_ID:-}")'",' >> scripts/config.js
echo '  FIREBASE_STORAGE_BUCKET: "'$(escape "${FIREBASE_STORAGE_BUCKET:-}")'",' >> scripts/config.js
echo '  FIREBASE_MESSAGING_SENDER_ID: "'$(escape "${FIREBASE_MESSAGING_SENDER_ID:-}")'",' >> scripts/config.js
echo '  FIREBASE_APP_ID: "'$(escape "${FIREBASE_APP_ID:-}")'",' >> scripts/config.js
echo '  DEEPSEEK_API_KEY: "'$(escape "${DEEPSEEK_API_KEY:-}")'",' >> scripts/config.js
echo '  OPENAI_API_KEY: "'$(escape "${OPENAI_API_KEY:-}")'",' >> scripts/config.js
echo '  OPENROUTER_API_KEY: "'$(escape "${OPENROUTER_API_KEY:-}")'",' >> scripts/config.js
echo '  UNSPLASH_ACCESS_KEY: "'$(escape "${UNSPLASH_ACCESS_KEY:-}")'"' >> scripts/config.js

echo '};' >> scripts/config.js
echo 'if (typeof window !== "undefined") { window.CONFIG = CONFIG; }' >> scripts/config.js
