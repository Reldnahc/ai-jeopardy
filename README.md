# AI Jeopardy

AI Jeopardy is a self-hostable, multiplayer Jeopardy-style game that uses large language models for board generation and speech synthesis. The project is designed to run as a single cohesive system with a local database, predictable performance, and minimal external infrastructure.

This repository is optimized for running via Docker and Docker Compose on a personal server.

---

## Features

- Multiplayer Jeopardy-style gameplay
- AI-generated boards and clues
- AI-generated text-to-speech narration
- Real-time gameplay using WebSockets
- Final Jeopardy with wagers and submissions
- Deterministic asset caching for audio and images
- Fully self-hostable backend and database

---

## Architecture Overview

The application runs as two containers:

### Application Container
- Node.js backend
- Static frontend served from a Vite build output
- API and WebSocket server on the same origin

### PostgreSQL Container
- Stores:
  - user accounts and authentication data
  - generated boards
  - generated TTS audio (stored as bytea)
  - generated image assets (stored as bytea)
- Automatically initializes schema on first startup

There is no external object storage. All generated assets are stored directly in PostgreSQL.

---

## Tech Stack

- Node.js 22
- PostgreSQL 16
- Vite (build-time only)
- WebSockets
- Docker / Docker Compose
- OpenAI / Anthropic / DeepSeek (pluggable)
- AWS Polly (text-to-speech)

---

## Project Structure

```
.
├── backend/
│   ├── auth/
│   ├── game/
│   ├── http/
│   ├── services/
│   ├── ws/
│   └── server.js
├── shared/
├── dist/                # built frontend
├── sql/
│   └── 001_init.sql     # database schema
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Database

### Initialization

The database schema is defined in:

```
sql/001_init.sql
```

When using the official PostgreSQL Docker image, this file is automatically executed on first startup if the database volume is empty.

The schema includes:
- profiles
- jeopardy_boards
- tts_assets
- image_assets

Assets are deduplicated using SHA-256 hashes to prevent duplicate storage.

---

## Environment Variables

Create a `.env` file next to `docker-compose.yml`.

```
DATABASE_PASSWORD=
JWT_SECRET=

BRAVE_API_KEY=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1

OPENAI_API_KEY=
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
```

Notes:
- `DATABASE_URL` is constructed automatically inside docker-compose.
- `VITE_API_BASE` is only used during local development builds.

---

## Docker Compose Setup

Example `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    container_name: ai-jeopardy-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ai_jeopardy
      POSTGRES_USER: ai_jeopardy
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - /mnt/user/appdata/ai-jeopardy/postgres:/var/lib/postgresql/data
      - /mnt/user/appdata/ai-jeopardy/sql:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ai_jeopardy -d ai_jeopardy -h 127.0.0.1"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 30s

  app:
    image: ghcr.io/reldnahc/ai-jeopardy:latest
    container_name: ai-jeopardy
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://ai_jeopardy:${DATABASE_PASSWORD}@db:5432/ai_jeopardy
      JWT_SECRET: ${JWT_SECRET}

      BRAVE_API_KEY: ${BRAVE_API_KEY}

      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      AWS_REGION: ${AWS_REGION}

      OPENAI_API_KEY: ${OPENAI_API_KEY}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}

      NODE_ENV: production
    ports:
      - "3002:3002"
```

---

## Running the Stack

1. Place `001_init.sql` in the mounted SQL directory.
2. Ensure the PostgreSQL data directory is empty on first run.
3. Start the stack:

```
docker compose up -d
```

4. Open the app in a browser:

```
http://<server-ip>:3002
```

---

## Development Notes

- The frontend is built during the Docker image build step.
- The Vite dev server is not used at runtime.
- In development, API calls may target `localhost:3002`.
- In deployed environments, the frontend uses same-origin API calls.

---

## Deployment Notes

- The application image is built and published via GitHub Actions.
- No runtime rebuilds are required.
- Database schema changes after `001_init.sql` should be handled via additional migration scripts.

---

## Legal

Jeopardy is a trademark of Sony Pictures Television and CBS.
This project is not affiliated with or endorsed by the owners of Jeopardy.