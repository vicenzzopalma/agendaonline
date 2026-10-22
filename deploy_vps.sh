#!/bin/bash
set -e

echo "=================================================="
echo "🚀 [AGENDA] Iniciando atualização automática..."
echo "📅 Data: $(date)"
echo "=================================================="

cd /var/www/agenda

# 1. Atualizar repositório Git
echo "📥 1. Puxando alterações do GitHub..."
git fetch origin main
git reset --hard origin/main

# 2. Configurar ambiente para usar Node 22 isolado com PATH completo
export PATH="/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# 3. Instalar dependências se necessário
if [ -f "package.json" ]; then
    echo "📦 2. Verificando dependências..."
    npm install --no-audit --no-fund
fi

# 4. Compilar aplicação (build-selfhost já sincroniza assets para .next/standalone)
echo "🔨 3. Compilando Next.js (Standalone)..."
npm run build

# 5. Garantir que o .env esteja presente no standalone
if [ -d ".next/standalone" ]; then
    cp .env .next/standalone/ 2>/dev/null || true
fi

# 6. Reiniciar no PM2
echo "🔄 4. Reiniciando agenda-realess no PM2..."
pm2 restart agenda-realess --update-env
pm2 save

echo "=================================================="
echo "✅ [AGENDA] Atualização concluída com sucesso!"
echo "=================================================="
