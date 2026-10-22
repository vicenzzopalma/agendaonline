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

# 2. Configurar ambiente para usar Node 22 isolado
export PATH="/opt/node22/bin:$PATH"

# 3. Instalar dependências se necessário
if [ -f "package.json" ]; then
    echo "📦 2. Verificando dependências..."
    npm install --omit=dev --no-audit --no-fund
fi

# 4. Compilar aplicação
echo "🔨 3. Compilando Next.js (Standalone)..."
npm run build

# 5. Copiar assets estáticos para a pasta standalone
if [ -d ".next/standalone" ]; then
    echo "📂 4. Sincronizando arquivos estáticos para standalone..."
    cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
    cp -r public .next/standalone/ 2>/dev/null || true
    cp -r drizzle .next/standalone/ 2>/dev/null || true
    cp -r scripts .next/standalone/ 2>/dev/null || true
    cp -r db .next/standalone/ 2>/dev/null || true
    cp .env .next/standalone/ 2>/dev/null || true
fi

# 6. Reiniciar no PM2
echo "🔄 5. Reiniciando agenda-realess no PM2..."
pm2 restart agenda-realess --update-env
pm2 save

echo "=================================================="
echo "✅ [AGENDA] Atualização concluída com sucesso!"
echo "=================================================="
