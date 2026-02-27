# Contributing

Thanks for considering a contribution.

## Development Setup

1. Install dependencies:
   - `npm ci`
2. Create a `.env` from `.env.example` and set at least:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `JWT_SECRET`
   - `NODE_ENV=development`
3. Apply database schema:
   - `backend/migration/001_init.sql`
4. Run locally (two terminals):
   - `npm run dev:web` (frontend at `http://localhost:5173`)
   - `npm run dev:backend` (backend at `http://localhost:3002`)
5. Optional Docker development stack:
   - `npm run dev:docker`

If you run local `kokoro` and `whisper` services, a CUDA-capable NVIDIA GPU is strongly recommended for usable performance.
If you do not want local TTS/STT containers, remove or disable `kokoro` and `whisper` from the compose setup and omit `KOKORO_URL`/`WHISPER_URL`.

## Testing and Linting

- Run tests: `npm run test`
- Run lint: `npm run lint`

## Pull Requests

1. Create a branch from `main`.
2. Keep changes focused and well-scoped.
3. Ensure tests and lint pass before opening a PR.
4. Include a short summary and testing notes in the PR description.

## Code Style

- This repo uses Prettier and ESLint.
- If formatting is needed, run `npx prettier --write .` or rely on your editor.
