# MikroTik Magic - Local AI Setup

This setup integrates **local AI models** (via Ollama) with your MikroTik Magic app, replacing cloud-based AI inference.

## 🚀 Quick Start

### Prerequisites
- **Ollama installed** (native on macOS for Metal GPU): `brew install ollama`
- **Docker Desktop** running
- **Models downloaded** locally (you already have these):
  - `deepseek-r1:8b` (Magic Dude reasoning/chat)
  - `qwen2.5-coder:7b` (code generation)
  - `llama3.2:latest` (general chat)
  - `llama3:latest` (fallback)

### Launch (One Command)

```bash
# Ensure Ollama is running natively in another terminal
ollama serve

# Then in your project folder:
./scripts/start-local.sh
```

This:
1. ✅ Verifies Ollama is accessible on port 11434
2. ✅ Builds the Docker image (TanStack Start + Bun)
3. ✅ Starts the app container linked to your Ollama
4. ✅ Opens `http://localhost:3000`

## 📚 What's New

### Added Files

| File | Purpose |
|------|---------|
| `src/lib/ai/ollama-client.ts` | Ollama API client (streaming + non-streaming) |
| `src/routes/api/chat.ts` | SSR chat endpoint (TanStack Start server function) |
| `src/components/magic-dude/ChatPanel.tsx` | React chat UI with streaming |
| `src/routes/_authenticated/magic-dude.tsx` | Chat page route |
| `docker-compose.yml` | Updated with Ollama connectivity |
| `scripts/start-local.sh` | One-command launcher |

### Modified Files

| File | Change |
|------|--------|
| `.env.example` | Added `OLLAMA_API_URL`, `AI_MODEL`, `AI_DAILY_MESSAGE_CAP` |

## 🤖 Magic Dude Chatbot

Access at: **http://localhost:3000/app/magic-dude**

**Features:**
- **Streaming responses** from `deepseek-r1:8b`
- **Stop button** to abort mid-generation
- **Message history** with timestamps
- **System prompt** enforces network guidance tone (never claims direct changes)
- **Dark theme** optimized for terminal users

**Example prompts:**
- "How do I configure VLAN on MikroTik?"
- "What's the best practice for firewall rules?"
- "How do I set up a WireGuard VPN?"
- "Explain BGP routing policies"

## 🔧 Configuration

Edit `.env` to customize:

```bash
# Ollama API endpoint (use this exact value on macOS for host.docker.internal)
OLLAMA_API_URL=http://host.docker.internal:11434

# Model for Magic Dude (deepseek-r1:8b recommended)
AI_MODEL=deepseek-r1:8b

# Daily message cap per user
AI_DAILY_MESSAGE_CAP=50

# Keep your existing Supabase + VPS configs
SUPABASE_URL=...
VPS_ROUTER_API_URL=...
```

## 📊 Performance on M1 16GB

| Task | Model | Time | VRAM Used |
|------|-------|------|-----------|
| Simple question | `llama3.2` | 2-3s | ~5GB |
| Magic Dude response | `deepseek-r1:8b` | 5-10s | ~5.5GB |
| Code generation | `qwen2.5-coder:7b` | 3-5s | ~5GB |

**Note:** Docker Ollama on macOS runs on **CPU** (no Metal GPU access). For 3-5x faster responses, use **native Ollama**:

```bash
# Terminal 1: Native Ollama (Metal GPU enabled)
ollama serve

# Terminal 2: Your app
./scripts/start-local.sh
```

## 🔌 API Endpoints

### `POST /api/chat`

Stream chat responses from Ollama.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Configure VLAN on MikroTik?" }
  ],
  "threadId": "optional-uuid",
  "userId": "optional-user-id"
}
```

**Response (Server-Sent Events):**
```
data: {"content": "To configure"}
data: {"content": " VLAN on MikroTik"}
data: {"content": " RouterOS..."}
data: {"done": true, "content": "full response..."}
```

## 📁 Directory Structure

```
src/
├── lib/ai/
│   └── ollama-client.ts          # Ollama API wrapper
├── routes/
│   ├── api/
│   │   └── chat.ts               # Chat endpoint
│   └── _authenticated/
│       └── magic-dude.tsx         # Chat page
└── components/magic-dude/
    └── ChatPanel.tsx             # Chat UI

scripts/
└── start-local.sh                # Launcher

docker-compose.yml                # App + Ollama connectivity
.env.example                       # Config template
```

## 🛠️ Development Workflow

### Local Testing

```bash
# Terminal 1: Start native Ollama
ollama serve

# Terminal 2: Start app
./scripts/start-local.sh

# Terminal 3: Watch/build (if using dev mode)
bun run dev
```

### Testing Magic Dude

1. Open `http://localhost:3000/app/magic-dude`
2. Send a message
3. Watch streaming response from `deepseek-r1:8b`
4. Click **Stop** to abort
5. Check browser console for errors

### Debugging Ollama Connection

```bash
# Test Ollama is accessible
curl http://localhost:11434/api/tags

# From inside Docker container
docker exec mikromagic-app curl http://host.docker.internal:11434/api/tags

# View app logs
docker-compose logs -f app
```

## 🚀 Production Deployment

To deploy this setup to your VPS:

1. **Install Ollama** on your VPS:
   ```bash
   curl https://ollama.ai/install.sh | sh
   ollama pull deepseek-r1:8b qwen2.5-coder:7b llama3.2
   ```

2. **Update docker-compose.yml** on VPS to use your Ollama:
   ```yaml
   environment:
     - OLLAMA_API_URL=http://localhost:11434  # VPS local Ollama
   ```

3. **Deploy app container** with VPS credentials

4. **Run**: `docker-compose up -d`

## 📖 Model Selection

Use the model router in `ollama-client.ts`:

```typescript
// Automatically selects the best model for the task
const model = getModelForTask("reasoning");  // → deepseek-r1:8b

// Or manually:
streamOllamaResponse(messages, "qwen2.5-coder:7b");
```

## ❌ Troubleshooting

### "Connection refused: 11434"
- Ensure Ollama is running: `ollama serve`
- If using Docker Ollama, verify port forwarding: `docker ps | grep ollama`

### Slow responses (>20s)
- Docker Ollama on macOS runs on CPU — use native Ollama for Metal GPU
- Check system resources: `top` or Activity Monitor

### Models not found
- Verify with: `ollama list`
- Pull if missing: `ollama pull deepseek-r1:8b`

### App won't start
- Check logs: `docker-compose logs -f app`
- Ensure `.env` has valid Supabase credentials
- Rebuild: `docker-compose build --no-cache`

## 📝 Next Steps

- [ ] Test Magic Dude chatbot locally
- [ ] Customize system prompt in `src/routes/api/chat.ts`
- [ ] Add chat history persistence to Supabase
- [ ] Implement daily message cap enforcement
- [ ] Add rate limiting per user
- [ ] Deploy to VPS with Ollama

## 🔗 Resources

- [Ollama Docs](https://github.com/ollama/ollama)
- [TanStack Start](https://tanstack.com/start)
- [Deepseek-R1 Model Card](https://huggingface.co/deepseek-ai/deepseek-r1)
- [Qwen Coder](https://huggingface.co/collections/Qwen/qwen25-coder-67279c8aa8a93e4be3a9d57c)

---

**Questions?** Check the logs with `docker-compose logs -f app` or test Ollama directly with:
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "deepseek-r1:8b",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}'
```
