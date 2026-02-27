# AI Jeopardy

Self-hostable multiplayer Jeopardy-style game with AI-generated boards, narration, and judging.

## Features

- Real-time multiplayer gameplay over WebSockets
- AI-generated Single Jeopardy, Double Jeopardy, and Final Jeopardy boards
- AI-assisted judging and speech workflows
- Optional local TTS/STT services (`kokoro`, `whisper`) with OpenAI fallback
- User accounts, profiles, stats, and leaderboard
- PostgreSQL-backed storage for boards and generated media assets

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

## Local Development

1. Install dependencies:

```bash
npm ci
```

2. Apply database schema (`backend/migration/001_init.sql`) to your Postgres database.
3. Set `.env` values (at minimum: `DATABASE_URL`, `OPENAI_API_KEY`, `JWT_SECRET`, `NODE_ENV=development`).
4. Run web and backend in separate terminals:

```bash
npm run dev:web
npm run dev:backend
```

Frontend runs at `http://localhost:5173` and backend at `http://localhost:3002`.

## Docker Workflows

Development stack:

```bash
npm run dev:docker
```

Production-style stack:

```bash
docker compose up -d
```

`docker-compose.yml` expects Postgres credentials via `DATABASE_PASSWORD` and mounts an init SQL directory at `/docker-entrypoint-initdb.d`. Ensure `001_init.sql` is present in the mounted SQL directory on first boot.

## Useful Scripts

- `npm run dev:web` - start Vite dev server
- `npm run dev:backend` - start backend with `tsx`
- `npm run build` - build frontend and backend
- `npm run start` - run compiled backend (`dist-backend`)
- `npm run test` - run unit/integration tests (Vitest)
- `npm run test:e2e` - run Playwright e2e tests
- `npm run lint` - run ESLint

## Legal

Jeopardy is a trademark of Sony Pictures Television and CBS.
This project is not affiliated with or endorsed by the owners of Jeopardy.
