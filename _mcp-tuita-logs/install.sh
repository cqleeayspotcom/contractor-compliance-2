#!/usr/bin/env bash
# =============================================================================
# Installation du serveur MCP "tuita-logs" dans WSL Ubuntu.
#
# A QUOI CA SERT
#   Ce serveur permet a Claude de LIRE les logs de l'app Tuita sans copier-coller :
#     - logs du BACKEND  : containers Docker du monolithe (platform-backend)
#     - logs du FRONTEND : sortie du serveur de dev Angular `ng serve`
#   Claude peut ainsi recuperer un OTP de SMS, voir une erreur 500 PHP ou une
#   erreur de compilation Angular, tout seul, pendant un test de bout en bout.
#
# POURQUOI WSL
#   Les containers Docker du backend tournent dans WSL Ubuntu. Le serveur MCP
#   doit donc tourner la-bas pour parler au demon Docker via /var/run/docker.sock.
#
# USAGE (dans un terminal Ubuntu) :
#   cd /mnt/c/Users/MSA/Desktop/code/frontend-tuita-contractor-compliance/_mcp-tuita-logs
#   bash install.sh
#
# Idempotent : on peut le relancer sans risque (il met juste a jour server.py).
# =============================================================================
set -euo pipefail

INSTALL_DIR="${HOME}/mcp-tuita-logs"
VENV_DIR="${INSTALL_DIR}/.venv"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "→ Installation dans ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cp -f "${SRC_DIR}/server.py" "${INSTALL_DIR}/server.py"
chmod +x "${INSTALL_DIR}/server.py"

# python3 + le module venv (sur Ubuntu 24.04 il faut le paquet python3.x-venv
# pour avoir 'ensurepip', sinon le venv n'a pas de pip).
if ! command -v python3 >/dev/null 2>&1; then
  echo "→ python3 manquant, installation..."
  sudo apt-get update -qq && sudo apt-get install -y -qq python3
fi
PYVER="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  echo "→ paquet python${PYVER}-venv manquant, installation..."
  sudo apt-get update -qq && sudo apt-get install -y -qq "python${PYVER}-venv"
fi

# Environnement Python isole (Ubuntu 24.04 interdit 'pip install' global - PEP 668).
if [ ! -x "${VENV_DIR}/bin/python" ]; then
  echo "→ creation du venv ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi

echo "→ installation du SDK MCP officiel dans le venv"
"${VENV_DIR}/bin/pip" install -q --upgrade pip 'mcp[cli]>=1.4'

# Verification : l'utilisateur doit pouvoir parler a Docker sans sudo.
if ! groups | grep -qw docker; then
  echo "⚠ L'utilisateur courant n'est PAS dans le groupe 'docker'."
  echo "  Corrige avec :  sudo usermod -aG docker \$USER && newgrp docker"
  echo "  Sans ca, 'docker logs' echouera avec EACCES sur /var/run/docker.sock."
fi

echo
echo "✓ MCP tuita-logs installe."
echo
echo "Test :"
echo "    ${VENV_DIR}/bin/python ${INSTALL_DIR}/server.py --self-test"
echo
echo "Config a coller dans le client (voir README.md) :"
echo
cat <<JSON
{
  "mcpServers": {
    "tuita-logs": {
      "command": "wsl.exe",
      "args": [
        "-d", "Ubuntu",
        "--exec", "${VENV_DIR}/bin/python",
        "${INSTALL_DIR}/server.py"
      ]
    }
  }
}
JSON
