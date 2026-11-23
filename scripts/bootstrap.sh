#!/bin/sh
# Zero-setup bootstrap for GENESIS-OMEGA on Linux / macOS (POSIX sh).
# Checks Node >= 20 and local Ollama reachability, installs dependencies,
# reports toolchains, runs the verification gate and prints startup commands.
# Models are pulled ONLY with --pull-models; no PATH changes, no secrets.

set -eu

PULL_MODELS=0
for arg in "$@"; do
  case "$arg" in
    --pull-models) PULL_MODELS=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"

step() { printf '\n==> %s\n' "$1"; }
ok() { printf '[OK] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

step '1/6 Node.js runtime'
if ! command -v node >/dev/null 2>&1; then fail 'Node.js is not installed or not on PATH.'; fi
NODE_VERSION=$(node -v)
NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then fail "Node.js >= 20 required, found $NODE_VERSION"; fi
ok "Node.js $NODE_VERSION"

step "2/6 Local Ollama reachability ($OLLAMA_HOST)"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 5 "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
    ok 'Ollama is reachable.'
  else
    warn "Ollama is not reachable at $OLLAMA_HOST. Start Ollama, or use the deterministic local path."
  fi
elif command -v ollama >/dev/null 2>&1 && ollama list >/dev/null 2>&1; then
  ok 'Ollama CLI is available.'
else
  warn "Cannot probe $OLLAMA_HOST (install curl or start Ollama)."
fi

step '3/6 Install dependencies'
npm install
ok 'Dependencies installed.'

step '4/6 Toolchain readiness (18 ecosystems)'
if npm run doctor; then
  ok 'All critical doctor gates passed.'
else
  warn 'npm run doctor reported missing host toolchains; see the table above.'
fi

step '5/6 Optional local starter models'
if [ "$PULL_MODELS" -eq 1 ]; then
  for model in qwen2.5-coder:1.5b qwen2.5-coder:3b; do
    printf 'ollama pull %s\n' "$model"
    ollama pull "$model" || warn "Could not pull $model (Ollama must be running)."
  done
else
  ok 'Skipped (pass --pull-models to pull qwen2.5-coder:1.5b and 3b explicitly).'
fi

step '6/6 Full verification gate'
npm run check || fail 'npm run check failed; fix the reported gates before starting the studio.'
ok 'SECRETS_OK and doctor critical gates passed.'

printf '\nBOOTSTRAP_OK\n'
printf 'Start the studio (local-first, no cloud key required):\n'
printf '  OMEGA_LOCAL_FIRST=1 npm run dev\n'
printf 'Open http://127.0.0.1:3000\n'
