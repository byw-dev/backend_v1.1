#!/usr/bin/env bash
# Remote deployment script for backend-v1.
#
# Run this AFTER extracting the tarball on the target host.
#
# Usage:
#   sudo ./scripts/deploy.sh <user>
#
# Example:
#   sudo ./scripts/deploy.sh yujie
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
  echo "Usage: sudo $0 <user>"
  echo "Example: sudo $0 yujie"
  exit 1
fi
TARGET_USER="$1"

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # extracted tarball root
INSTALL_DIR="/opt/${TARGET_USER}/${REPO_NAME}"
VENV_DIR="${INSTALL_DIR}/.venv"
USER_SERVICE_DIR="/home/${TARGET_USER}/.config/systemd/user"
SERVICE_FILE="${USER_SERVICE_DIR}/${SERVICE_NAME}.service"

echo "==> Deploying backend-v1 for user: ${TARGET_USER}"
echo "    Source:      ${SOURCE_DIR}"
echo "    Install to:  ${INSTALL_DIR}"

# 1. Copy source files
echo "==> [1/5] Installing source files..."
install -d -o "${TARGET_USER}" -g "${TARGET_USER}" "${INSTALL_DIR}"
# rsync preserves permissions and skips unchanged files
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
  echo "    ⚠  EDIT it before starting the service:"
  echo "       sudo -u ${TARGET_USER} vi ${INSTALL_DIR}/.env"
else
  echo "    .env already exists, keeping it"
fi

# 3. Create/update venv with uv
echo "==> [3/5] Creating/updating Python venv (uv sync)..."
if command -v uv &>/dev/null; then
  sudo -u "${TARGET_USER}" bash -c "
    cd '${INSTALL_DIR}'
    uv venv '.venv' --python 3.12 2>/dev/null || uv venv '.venv'
    uv sync --frozen
  "
else
  echo "    ⚠  'uv' not found on this system."

  # Fallback: standard venv + pip
  sudo -u "${TARGET_USER}" bash -c "
    cd '${INSTALL_DIR}'
    python3 -m venv '.venv'
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r <(grep -A999 'dependencies =' pyproject.toml | grep '^\s*\"' | sed 's/.*\"\\(.*\\)\".*/\\1/')
  "
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
sudo -u "${TARGET_USER}" XDG_RUNTIME_DIR="/run/user/$(id -u ${TARGET_USER})" \
  systemctl --user daemon-reload

# Enable (but NOT start)
sudo -u "${TARGET_USER}" XDG_RUNTIME_DIR="/run/user/$(id -u ${TARGET_USER})" \
  systemctl --user enable "${SERVICE_NAME}.service"

echo "==> [5/5] Done!"

# 5. Print instructions
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅  Service installed but NOT started"
echo ""
echo "  Edit config first (if needed):"
echo "    vi ${INSTALL_DIR}/.env"
echo ""
echo "  Start the service:"
echo "    sudo -u ${TARGET_USER} XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) systemctl --user start ${SERVICE_NAME}"
echo ""
echo "  Check status:"
echo "    sudo -u ${TARGET_USER} XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) systemctl --user status ${SERVICE_NAME}"
echo ""
echo "  View logs:"
echo "    sudo -u ${TARGET_USER} XDG_RUNTIME_DIR=/run/user/$(id -u ${TARGET_USER}) journalctl --user -u ${SERVICE_NAME} -f"
echo "═══════════════════════════════════════════════════════"
