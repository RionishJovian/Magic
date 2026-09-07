# Ollama with Docker

This project can run Ollama as a persistent Docker Compose service. The application reaches it through the private Compose network at `http://ollama:11434`; the host exposes Ollama only on `127.0.0.1:11434` for local administration.

## Prerequisites

Install Docker Desktop on macOS or Windows, or Docker Engine with the Compose plugin on Linux. Verify the installation with:

```sh
docker version
docker compose version
```

The current repository Compose file runs the application and Ollama together. Ollama model files are stored in the named `ollama-data` volume so they survive container restarts.

## Start Ollama

From the repository root, start only the model service first:

```sh
docker compose up -d ollama
docker compose ps
```

Wait until the Ollama container is healthy, then download the model used by the current reasoning path:

```sh
docker exec -it mikromagic-ollama ollama pull deepseek-r1:8b
```

The repository also supports these model names in its model-selection helper:

```sh
docker exec -it mikromagic-ollama ollama pull qwen2.5-coder:7b
docker exec -it mikromagic-ollama ollama pull llama3.2:latest
```

You do not need to download every model at once. Start with one model that fits your machine’s RAM or VRAM, then benchmark response quality and latency.

## Verify the API

Check the host-published endpoint:

```sh
curl http://127.0.0.1:11434/api/tags
```

Run a small generation test:

```sh
curl http://127.0.0.1:11434/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-r1:8b",
    "messages": [{"role": "user", "content": "Reply with exactly: Ollama is ready."}],
    "stream": false
  }'
```

If the response contains a model message, Ollama is ready. From inside the application container, the correct endpoint is `http://ollama:11434`, not `localhost:11434`.

## Start the application

Once a model is available, build and start the application:

```sh
docker compose up -d --build app
docker compose ps
```

The application should be available at `http://localhost:3000`. The Compose configuration injects `OLLAMA_API_URL=http://ollama:11434` into the app container and waits for the Ollama health check before starting the app.

## Native Ollama alternative

If you prefer to run Ollama natively for better GPU integration, do not start the Compose `ollama` service. Start native Ollama on the host, pull the model there, and use a local override file or environment override that points the app to the host gateway. The correct host address varies by operating system:

| Host                           | Typical app-container endpoint                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| macOS / Windows Docker Desktop | `http://host.docker.internal:11434`                                                                                               |
| Linux Docker Engine            | `http://host.docker.internal:11434` with `extra_hosts: ["host.docker.internal:host-gateway"]`, or the Docker host gateway address |
| Local app outside Docker       | `http://127.0.0.1:11434`                                                                                                          |

Do not run both a native Ollama service and the Compose Ollama service unless you intentionally use different ports and model stores.

## Troubleshooting

If the app reports connection refused, check `docker compose ps`, `docker compose logs ollama`, and `curl http://127.0.0.1:11434/api/tags`. If the app starts before the model is downloaded, the API may be healthy while generation still fails; confirm the model with `docker exec mikromagic-ollama ollama list`.

If responses are slow or the container is killed, use a smaller quantized model, allocate more memory to Docker Desktop, or run Ollama natively with the appropriate GPU runtime. Model files can consume many gigabytes; monitor Docker’s disk allocation.

Keep port `11434` bound to `127.0.0.1` for local development. Do not publish Ollama directly to the public internet. The application should be the only service that calls the model in a deployed environment.

## Useful commands

```sh
docker compose logs -f ollama
docker exec -it mikromagic-ollama ollama list
docker exec -it mikromagic-ollama ollama ps
docker compose restart ollama
docker compose down
```

`docker compose down` stops and removes containers but keeps the named `ollama-data` volume. To delete downloaded models as well, use `docker compose down -v`; this is destructive to the local model cache.
