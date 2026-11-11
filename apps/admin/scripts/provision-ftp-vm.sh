#!/bin/bash
# Otak Albums — автоналаштування сервера прийому фото з камер (FTP).
#
# Використання: передати як user_data при створенні дроплета DigitalOcean
# (Ubuntu 24.04, s-1vcpu-1gb, fra1), попередньо замінивши 4 плейсхолдери
# __...__ на реальні значення (з apps/admin/.env.local; FTP_CONTROL_SECRET —
# новий випадковий, напр. `openssl rand -hex 32`). Секрети в репозиторій НЕ комітити.
# Потім у Vercel (проєкт admin) задати FTP_VM_HOST=<IP дроплета> і той самий
# FTP_CONTROL_SECRET, і передеплоїти. Детальніше: docs/camera-ftp-ingest.md.
#
# Node 22 обов'язково: свіжий @supabase/supabase-js на Node 20 падає при старті
# ("Node.js 20 detected without native WebSocket support").
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs ufw
useradd --system --create-home --home-dir /opt/otak-ftp --shell /usr/sbin/nologin otakftp || true
mkdir -p /opt/otak-ftp/scripts
curl -fsSL https://raw.githubusercontent.com/otakalbums-art/otak-albums/master/apps/admin/scripts/ftp-ingest.mjs -o /opt/otak-ftp/scripts/ftp-ingest.mjs
cat > /opt/otak-ftp/package.json <<'PKG'
{ "name": "otak-ftp-ingest", "private": true, "type": "module",
  "dependencies": { "@supabase/supabase-js": "^2.45.4", "chokidar": "^3.6.0", "ftp-srv": "4.6.3" } }
PKG
PUBIP=$(curl -fsS http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)
cat > /opt/otak-ftp/.env.local <<ENVF
NEXT_PUBLIC_SUPABASE_URL=__NEXT_PUBLIC_SUPABASE_URL__
SUPABASE_SERVICE_ROLE_KEY=__SUPABASE_SERVICE_ROLE_KEY__
FTP_INGEST_SECRET=__FTP_INGEST_SECRET__
FTP_CONTROL_SECRET=__FTP_CONTROL_SECRET__
FTP_PUBLIC_HOST=$PUBIP
FTP_PORT=2121
FTP_PASV_MIN=2122
FTP_PASV_MAX=2130
FTP_CONTROL_PORT=8090
ENVF
chmod 600 /opt/otak-ftp/.env.local
cd /opt/otak-ftp && npm install --omit=dev --no-audit --no-fund
chown -R otakftp:otakftp /opt/otak-ftp
cat > /etc/systemd/system/otak-ftp.service <<'UNIT'
[Unit]
Description=Otak Albums FTP camera ingest
After=network-online.target
Wants=network-online.target
[Service]
User=otakftp
WorkingDirectory=/opt/otak-ftp
ExecStart=/usr/bin/node /opt/otak-ftp/scripts/ftp-ingest.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now otak-ftp
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 2121/tcp
ufw allow 2122:2130/tcp
ufw allow 8090/tcp
ufw --force enable
echo OTAK_PROVISION_DONE > /opt/otak-ftp/provisioned
