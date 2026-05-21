#!/usr/bin/env bash
# V-remote — Instalador all-in-one para Ubuntu 24.04
# Uso:
#   sudo bash install-ubuntu.sh DOMINIO EMAIL
# Exemplos:
#   sudo bash install-ubuntu.sh painel.seudominio.com.br seu@email.com
#   curl -fsSL https://raw.githubusercontent.com/grupoicoreservices-cmyk/vremote/main/scripts/install-ubuntu.sh | sudo bash -s -- painel.seudominio.com.br seu@email.com

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" ]]; then
    read -rp "Domínio (ex: painel.seudominio.com.br): " DOMAIN
fi
if [[ -z "$EMAIL" ]]; then
    read -rp "E-mail para Let's Encrypt: " EMAIL
fi
if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    echo "Domínio e e-mail são obrigatórios." >&2
    exit 1
fi

INSTALL_USER="${SUDO_USER:-${USER}}"
APP_DIR="/opt/vremote"
REPO_URL="https://github.com/grupoicoreservices-cmyk/vremote.git"
SERVER_URL="https://${DOMAIN}"

echo "=============================="
echo "  V-remote Installer"
echo "  Domínio: ${DOMAIN}"
echo "  E-mail : ${EMAIL}"
echo "  Usuário: ${INSTALL_USER}"
echo "=============================="

# ---- 1. Dependências do sistema --------------------------------------------
echo ">> [1/9] Dependências do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3.12 python3.12-venv python3-pip git curl ufw nginx gnupg lsb-release ca-certificates

# ---- 2. MongoDB 8 (suporte oficial para Ubuntu 24 noble) -------------------
echo ">> [2/9] MongoDB 8"
# Limpa entrada antiga da 7.0 se existir (falha em noble)
rm -f /etc/apt/sources.list.d/mongodb-org-7.0.list /usr/share/keyrings/mongodb-server-7.0.gpg
if ! systemctl list-unit-files | grep -q '^mongod\.service'; then
    curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
    echo "deb [signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list
    apt-get update -y
    apt-get install -y mongodb-org
fi
systemctl enable --now mongod

# ---- 3. Node.js 20 + Yarn ---------------------------------------------------
echo ">> [3/9] Node.js 20 + Yarn"
if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
if ! command -v yarn >/dev/null; then
    npm install -g yarn
fi

# ---- 4. Clonar repositório --------------------------------------------------
echo ">> [4/9] Clonar repositório"
mkdir -p /opt
if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" pull --ff-only
else
    git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$INSTALL_USER":"$INSTALL_USER" "$APP_DIR"

# ---- 5. Backend (venv + .env) -----------------------------------------------
echo ">> [5/9] Backend"
cd "$APP_DIR/backend"
sudo -u "$INSTALL_USER" python3.12 -m venv .venv
sudo -u "$INSTALL_USER" bash -c "source .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt"

if [[ ! -f .env ]]; then
    JWT_SECRET=$(openssl rand -hex 48)
    cat > .env <<EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="vremote"
CORS_ORIGINS="${SERVER_URL}"
JWT_SECRET="${JWT_SECRET}"
ADMIN_EMAIL="admin@vremote.io"
ADMIN_PASSWORD="Admin@2026"
FRONTEND_URL="${SERVER_URL}"
EOF
    chown "$INSTALL_USER":"$INSTALL_USER" .env
    chmod 600 .env
    echo "   .env criado com JWT_SECRET aleatório"
fi

# ---- 6. Frontend (build) ----------------------------------------------------
echo ">> [6/9] Frontend (build)"
cd "$APP_DIR/frontend"
echo "REACT_APP_BACKEND_URL=${SERVER_URL}" > .env
chown "$INSTALL_USER":"$INSTALL_USER" .env
sudo -u "$INSTALL_USER" yarn install --frozen-lockfile
sudo -u "$INSTALL_USER" yarn build

# ---- 7. Systemd: backend ----------------------------------------------------
echo ">> [7/9] Systemd service"
cat > /etc/systemd/system/vremote-backend.service <<EOF
[Unit]
Description=V-remote Backend API
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=${INSTALL_USER}
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=${APP_DIR}/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now vremote-backend
systemctl restart vremote-backend

# ---- 8. Nginx ---------------------------------------------------------------
echo ">> [8/9] Nginx"
cat > /etc/nginx/sites-available/vremote <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 50M;

    root ${APP_DIR}/frontend/build;
    index index.html;

    location / {
        try_files \$uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF
ln -sf /etc/nginx/sites-available/vremote /etc/nginx/sites-enabled/vremote
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ---- 9. Firewall + HTTPS ----------------------------------------------------
echo ">> [9/9] Firewall + HTTPS"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

if ! command -v certbot >/dev/null; then
    # Tenta apt primeiro (mais leve), snap como fallback
    if apt-get install -y certbot python3-certbot-nginx 2>/dev/null; then
        :
    elif command -v snap >/dev/null; then
        snap install --classic certbot
        ln -sf /snap/bin/certbot /usr/bin/certbot
    else
        apt-get install -y snapd
        snap install --classic certbot
        ln -sf /snap/bin/certbot /usr/bin/certbot
    fi
fi
certbot --nginx -d "${DOMAIN}" --redirect --agree-tos -m "${EMAIL}" -n || {
    echo "AVISO: certbot falhou. Verifique se o DNS do domínio aponta para este servidor e rode de novo:"
    echo "  sudo certbot --nginx -d ${DOMAIN}"
}

echo ""
echo "=============================="
echo "  V-remote INSTALADO ✓"
echo "=============================="
echo "  URL    : ${SERVER_URL}"
echo "  Login  : admin@vremote.io"
echo "  Senha  : Admin@2026  (TROQUE em Usuários!)"
echo ""
echo "  Status : sudo systemctl status vremote-backend"
echo "  Logs   : sudo journalctl -u vremote-backend -f"
echo "  Update : cd ${APP_DIR} && git pull && sudo systemctl restart vremote-backend"
echo "=============================="
