#!/bin/bash
set -e

echo "🚀 MikroTik Magic - Local AI Stack Launcher"
echo "=========================================="
echo ""

# Check if Ollama is running
echo "📡 Checking Ollama status..."
if ! lsof -i :11434 > /dev/null 2>&1; then
    echo "⚠️  Ollama not found on port 11434"
    echo ""
    echo "Option 1: Run native Ollama (RECOMMENDED - uses M1 Metal GPU)"
    echo "  brew install ollama"
    echo "  ollama serve"
    echo ""
    echo "Option 2: Ollama is already running in Docker"
    echo "  (If you've already started it, just ensure port 11434 is accessible)"
    echo ""
    read -p "Continue with Docker Compose anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Ollama is running on port 11434"
fi

echo ""
echo "📦 Verifying models are available..."
models=$(curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | head -5)
echo "   Models found:"
echo "$models" | sed 's/^/     • /'
echo ""

# Ensure .env exists
if [ ! -f .env ]; then
    echo "⚙️  Creating .env from template..."
    cp .env.example .env
    echo "   📝 Please edit .env with your Supabase and VPS credentials"
    echo ""
fi

echo "🔨 Building Docker image..."
docker-compose build

echo ""
echo "🚀 Starting mikromagic-app..."
docker-compose up -d app

echo ""
echo "⏳ Waiting for app to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "✅ App is ready!"
        break
    fi
    echo -n "."
    sleep 1
done

echo ""
echo "════════════════════════════════════════"
echo "✨ MikroTik Magic is running locally!"
echo ""
echo "🌐 Web App:     http://localhost:3000"
echo "🤖 Ollama API:  http://localhost:11434"
echo "💬 Magic Dude:  /app/magic-dude"
echo ""
echo "Models available:"
echo "$models" | sed 's/^/  • /'
echo ""
echo "🛑 To stop:     docker-compose down"
echo "📋 To view logs: docker-compose logs -f app"
echo "════════════════════════════════════════"
