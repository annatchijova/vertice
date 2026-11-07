#!/usr/bin/env bash
set -euo pipefail

# Launch the read-only MCP inside a bubblewrap user namespace.
# This is a process/filesystem sandbox, not a wallet or network sandbox.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BWRAP="${BWRAP_PATH:-$(command -v bwrap || true)}"

if [[ -z "$BWRAP" || ! -x "$BWRAP" ]]; then
  echo "bwrap is required; refusing to launch the MCP without a sandbox" >&2
  exit 78
fi

if [[ ! -f "$PROJECT_DIR/mcp_server.py" || ! -x "$PROJECT_DIR/.venv/bin/python" ]]; then
  echo "mcp_server.py is missing from $PROJECT_DIR" >&2
  echo "or .venv/bin/python is not installed; run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 78
fi

# Invoice files may only come from this explicitly mounted directory. The MCP
# itself never receives an arbitrary host path through the sandbox launcher.
INPUT_DIR="${VERTICE_INPUT_DIR:-$PROJECT_DIR/sandbox-input}"
INVOICE_PATH="${VERTICE_INVOICES_PATH:-}"
if [[ -n "$INVOICE_PATH" ]]; then
  INPUT_DIR="$(realpath -e "$INPUT_DIR")"
  INVOICE_PATH="$(realpath -e "$INVOICE_PATH")"
  case "$INVOICE_PATH" in
    "$INPUT_DIR"/*) ;;
    *) echo "VERTICE_INVOICES_PATH must be inside VERTICE_INPUT_DIR" >&2; exit 78 ;;
  esac
  INVOICE_RELATIVE="${INVOICE_PATH#"$INPUT_DIR"/}"
else
  INVOICE_RELATIVE=""
fi

ARGS=(
  --clearenv
  --ro-bind /usr /usr
  --ro-bind /bin /bin
  --ro-bind /lib /lib
  --ro-bind /lib64 /lib64
  --ro-bind /etc /etc
  --ro-bind "$PROJECT_DIR" /app
  --tmpfs /home
  --tmpfs /tmp
  --proc /proc
  --dev /dev
  --dir /tmp/home
  --setenv PATH /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  --setenv HOME /tmp/home
  --setenv VIRTUAL_ENV /app/.venv
  --setenv PYTHONDONTWRITEBYTECODE 1
  --setenv PYTHONUNBUFFERED 1
  --chdir /app
  --unshare-user
  --unshare-pid
  --unshare-ipc
  --unshare-uts
  --unshare-cgroup
  --share-net
  --die-with-parent
  --new-session
  --cap-drop ALL
  --uid 65534
  --gid 65534
)

for name in \
  ARBITRUM_RPC_URL \
  ARGT_ADDRESS \
  PAYMENT_BATCH_ADDRESS \
  PAYMENT_RECEIPT_REGISTRY_ADDRESS \
  VERTICE_MIN_CONFIRMATIONS \
  MAX_AMOUNT_PER_PAYMENT \
  MAX_AMOUNT_PER_BATCH \
  VERTICE_POLICY_JSON; do
  value="${!name-}"
  if [[ -n "$value" ]]; then
    ARGS+=(--setenv "$name" "$value")
  fi
done

if [[ -n "$INVOICE_RELATIVE" ]]; then
  ARGS+=(
    --ro-bind "$INPUT_DIR" /sandbox-input
    --setenv VERTICE_INVOICES_PATH "/sandbox-input/$INVOICE_RELATIVE"
  )
fi

exec "$BWRAP" "${ARGS[@]}" /app/.venv/bin/python /app/mcp_server.py
