# AI Jeopardy

Self-hostable multiplayer Jeopardy-style game with AI-generated boards, narration, and judging.

## Quickstart

1. Copy env template and set required values:

```bash
cp .env.example .env
```

Minimum for `docker-compose.yml`:

- `DATABASE_PASSWORD`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `CORS_ORIGINS` (set to your app origin)

2. Update `docker-compose.yml` volume paths for your machine.
3. Ensure `backend/migration/001_init.sql` is available in the directory mounted to `/docker-entrypoint-initdb.d` for first boot.
4. Start the stack:

```bash
docker compose up -d
```

5. Open `http://<your-host>:3002`.

If you do not want local `kokoro`/`whisper`, remove those services plus related `depends_on` and env vars (`KOKORO_URL`, `WHISPER_URL`) from the `app` service.

Note: OpenAI-based STT/TTS can become expensive with sustained usage. Running local `kokoro`/`whisper` can reduce ongoing API costs.

## Features

- Real-time multiplayer gameplay over WebSockets
- AI-generated Single Jeopardy, Double Jeopardy, and Final Jeopardy boards
- AI-assisted judging and speech workflows
- Optional local TTS/STT services (`kokoro`, `whisper`) with OpenAI fallback
- User accounts, profiles, stats, and leaderboard
- PostgreSQL-backed storage for boards and generated media assets

## Feature Matrix

| Capability | OpenAI-only setup | OpenAI + Kokoro/Whisper setup |
|---|---|---|
| Core multiplayer gameplay | Yes | Yes |
| AI board generation | Yes | Yes |
| AI answer judging | Yes | Yes |
| TTS narration | Yes (OpenAI provider) | Yes (Kokoro preferred, OpenAI fallback) |
| STT transcription | Yes (OpenAI provider) | Yes (Whisper preferred, OpenAI fallback) |
| Local/self-hosted speech services | No | Yes |
| Best speech throughput/latency | Limited by external API | Better with local GPU-backed services |
| Ongoing speech cost | Higher (per-request API charges) | Lower (self-hosted compute) |

## Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: Express + `ws` + TypeScript
- Database: PostgreSQL 16
- Runtime: Node.js 22
- Tooling: Vitest, Playwright, ESLint, Docker Compose

## Project Layout

```text
.
|-- src/                    # frontend app
|-- backend/                # API, WS server, game logic, services
|-- shared/                 # shared models/types
|-- backend/migration/      # SQL migrations
|   `-- 001_init.sql
|-- docker-compose.yml      # production-style stack
|-- docker-compose.dev.yml  # local development stack
`-- README.md
```

## Environment Variables

`backend/config/env.ts` is the source of truth.

Required:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `NODE_ENV`

Optional:

- `KOKORO_URL` (enables Kokoro TTS routing)
- `WHISPER_URL` (enables Whisper STT routing)
- `BRAVE_API_KEY` (image search support)
- `PORT` (default `3002`)
- `CORS_ORIGINS` (comma-separated, default `http://localhost:5173`)
- `DEFAULT_MODEL` (default `gpt-4o-mini`)
- `OPENAI_JUDGE_MODEL` (default `gpt-4o-mini`)
- `OPENAI_STT_MODEL` (default `gpt-4o-mini-transcribe`)
- `OPENAI_IMAGE_JUDGE_MODEL` (default `gpt-4.1-mini`)
- `OPENAI_COTD_MODEL` (default `gpt-4o-mini`)
- `OPENAI_CATEGORY_POOL_MODEL` (default `gpt-4o-mini`)
- `BUZZ_LOCKOUT_MS` (default `1`)
- `CLUE_ANSWER_TIMEOUT_MS` (default `10000`)
- `FINAL_DRAW_SECONDS` (default `30`)
- `FINAL_WAGER_SECONDS` (default `30`)

You can start from `.env.example` and adjust values for your setup.

For development and contribution workflows, see `CONTRIBUTING.md`.

## Docker Workflows

Production-style stack:

```bash
docker compose up -d
```

`docker-compose.yml` expects Postgres credentials via `DATABASE_PASSWORD` and mounts an init SQL directory at `/docker-entrypoint-initdb.d`. Ensure `001_init.sql` is present in the mounted SQL directory on first boot.

If you do not want local TTS/STT services, remove `kokoro` and `whisper` from `docker-compose.yml`, and remove related `depends_on`/env entries from `app` (`KOKORO_URL`, `WHISPER_URL`). In that mode, speech features fall back to OpenAI-backed providers where applicable.

If you do run `kokoro`/`whisper`, a CUDA-capable NVIDIA GPU is strongly recommended for usable performance.

## Useful Scripts

- `npm run build` - build frontend and backend
- `npm run start` - run compiled backend (`dist-backend`)
- `npm run test` - run unit/integration tests (Vitest)
- `npm run test:e2e` - run Playwright e2e tests
- `npm run lint` - run ESLint

## Legal

Jeopardy is a trademark of Sony Pictures Television and CBS.
This project is not affiliated with or endorsed by the owners of Jeopardy.
