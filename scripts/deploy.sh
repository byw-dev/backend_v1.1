#!/usr/bin/env bash
# Remote deployment script for backend-v1.
#
# Run this AFTER extracting the tarball on the target host.
#
# Usage:
#   sudo ./scripts/deploy.sh <user> [--offline]
#
# Example:
#   sudo ./scripts/deploy.sh yujie
#   sudo ./scripts/deploy.sh yujie --offline
#
# The script:
#   1. Installs source to /opt/<user>/backend_v1.1/
#   2. Creates/updates Python venv via uv sync
#   3. Sets up .env from .env.example (preserves existing)
#   4. Installs/updates the systemd user service file
#   5. Prints start/status commands (does NOT auto-start)
set -euo pipefail

# Config
REPO_NAME="backend_v1.1"
SERVICE_NAME="backend-v1"

# Args
if [ $# -lt 1 ]; then
  echo "Usage: sudo $0 <user> [--offline]"
  echo "Example: sudo $0 yujie"
  exit 1
fi
TARGET_USER="$1"
OFFLINE=false
if [ "${2:-}" = "--offline" ]; then OFFLINE=true; fi

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="/opt/${TARGET_USER}/${REPO_NAME}"
VENV_DIR="${INSTALL_DIR}/.venv"
USER_SERVICE_DIR="/home/${TARGET_USER}/.config/systemd/user"
SERVICE_FILE="${USER_SERVICE_DIR}/${SERVICE_NAME}.service"

echo "==> Deploying backend-v1 for user: ${TARGET_USER}"
echo "    Source:      ${SOURCE_DIR}"
echo "    Install to:  ${INSTALL_DIR}"
echo "    Mode:        $([ "$OFFLINE" = true ] && echo 'offline (no network)' || echo 'online')"

# 1. Copy source files
echo "==> [1/5] Installing source files..."
install -d -o "${TARGET_USER}" -g "${TARGET_USER}" "${INSTALL_DIR}"
rsync -a --delete "${SOURCE_DIR}/" "${INSTALL_DIR}/" \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.git' \
  --exclude='dist'
chown -R "${TARGET_USER}:${TARGET_USER}" "${INSTALL_DIR}"

# 2. Bootstrap .env
echo "==> [2/5] Setting up .env..."
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  chown "${TARGET_USER}:${TARGET_USER}" "${INSTALL_DIR}/.env"
  echo "    Created ${INSTALL_DIR}/.env from .env.example"
  echo "    Edit it before starting the service:"
  echo "       sudo -u ${TARGET_USER} vi ${INSTALL_DIR}/.env"
else
  echo "    .env already exists, keeping it"
fi

# 3. Create/update venv
echo "==> [3/5] Creating/updating Python venv..."

_uv_sync() {
  local user="$1" dir="$2"
  # Create venv with Python 3.12 (uv downloads interpreter if needed)
  su - "$user" -c "cd '$dir' && uv venv .venv --python 3.12 2>/dev/null; uv sync --frozen"
}

_uv_offline_install() {
  local user="$1" dir="$2"
  su - "$user" -c "
    cd '$dir'
    python3 -m venv .venv
    .venv/bin/pip install --no-index --find-links vendor/wheels/ -r vendor/requirements.txt
  "
}

if command -v uv &>/dev/null; then
  if [ "$OFFLINE" = true ]; then
    if [ -d "${INSTALL_DIR}/vendor/wheels" ]; then
      _uv_offline_install "${TARGET_USER}" "${INSTALL_DIR}"
    else
      echo "    Offline mode requested but vendor/wheels/ not found."
      echo "    Re-build with: ./scripts/build.sh --offline"
      exit 1
    fi
  else
    _uv_sync "${TARGET_USER}" "${INSTALL_DIR}"
  fi
else
  echo "    'uv' not found on this system."
  echo "    Install uv first: curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

# 4. Install/update systemd user service
echo "==> [4/5] Installing systemd user service..."
install -d -o "${TARGET_USER}" -g "${TARGET_USER}" "${USER_SERVICE_DIR}"

sed \
  -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
  -e "s|__VENV_DIR__|${VENV_DIR}|g" \
  "${SOURCE_DIR}/deploy/${SERVICE_NAME}.service" > "${SERVICE_FILE}"

chown "${TARGET_USER}:${TARGET_USER}" "${SERVICE_FILE}"

# Reload user daemon
su - "${TARGET_USER}" -c "XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) systemctl --user daemon-reload"

# Enable (but NOT start)
su - "${TARGET_USER}" -c "XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) systemctl --user enable ${SERVICE_NAME}.service"

echo "==> [5/5] Done!"

# 5. Print instructions
echo ""
echo "Service installed but NOT started"
echo ""
echo "  Edit config first (if needed):"
echo "    vi ${INSTALL_DIR}/.env"
echo ""
echo "  Start:"
echo "    su - ${TARGET_USER} -c 'XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) systemctl --user start ${SERVICE_NAME}'"
echo ""
echo "  Status:"
echo "    su - ${TARGET_USER} -c 'XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) systemctl --user status ${SERVICE_NAME}'"
echo ""
echo "  Logs:"
echo "    su - ${TARGET_USER} -c 'XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) journalctl --user -u ${SERVICE_NAME} -f'"
