# AGENTS.md

Instructions for coding agents working in this repository.

## Scope

- This file applies to the entire repository.
- Follow direct user instructions first, then this file, then other repo docs.
- Keep changes focused. Do not refactor unrelated code unless required to complete the task.

## Project Overview

- `src/`: React + Vite frontend in TypeScript.
- `backend/`: Express, WebSocket handlers, game logic, repositories, and AI services.
- `shared/`: Shared types and models used by frontend and backend.
- `tests/e2e/`: Playwright end-to-end coverage.
- `backend/migration/001_init.sql`: Initial database schema.

## Working Style

- Preserve existing architecture and naming patterns.
- When a file already has a strong local convention and you are not explicitly normalizing it, match the surrounding style.
- Prefer small, scoped changes over broad rewrites.
- Reuse existing helpers and modules before introducing new abstractions.
- Do not edit generated artifacts like `dist/`, `dist-backend/`, `coverage/`, `playwright-report/`, or `test-results/` unless the user explicitly asks.
- Treat `.env` and secrets as sensitive. Do not print or commit secret values.

## Environment Assumptions

- Node.js 22.
- TypeScript throughout the repo.
- PostgreSQL is required for full backend functionality.
- Optional local speech services may exist via `KOKORO_URL` and `WHISPER_URL`.
- `backend/config/env.ts` is the source of truth for environment variables.

## Common Commands

- Install dependencies: `npm ci`
- Frontend dev server: `npm run dev:web`
- Backend dev server: `npm run dev:backend`
- Full build: `npm run build`
- Lint: `npm run lint`
- Unit/integration tests: `npm run test`
- E2E tests: `npm run test:e2e`
- Docker dev stack: `npm run dev:docker`

## Code Style Baseline

- Respect `.prettierrc`: 2 spaces, semicolons, double quotes, trailing commas, and 100-character line width.
- Keep local import paths explicit with file extensions such as `.ts`, `.tsx`, and `.js`.
- Prefer relative imports over introducing path aliases.
- Use `import type` for type-only imports.
- Keep comments sparse and focused on non-obvious behavior, not line-by-line narration.

## TypeScript Conventions

- Prefer `type` aliases for unions, helper payloads, DTO/result shapes, and shared domain types.
- Prefer `interface` for React props and context-style object contracts when working in UI code, which is the dominant prop pattern in `src/`.
- Keep small parsing, normalization, and clamp helpers near the top of the file.
- Prefer narrow helpers or type guards over adding new `as unknown as` chains.
- When shared contracts are used by both frontend and backend, define or move them under `shared/` instead of duplicating local shapes.

## Export and File Role Conventions

- `backend/` and `shared/`: prefer named exports.
- `src/pages/`, `src/components/`, and `src/features/**/components/`: default export the primary React component for the file.
- `src/hooks/`, `src/utils/`, context helpers, router helpers, and other non-UI modules: prefer named exports.
- Repository modules should keep the existing factory pattern such as `createRepos` and `createProfileReadRepo`.
- HTTP route modules should expose `registerXRoutes`.
- WebSocket handler modules should export grouped handler maps like `const clueHandlers: Record<string, WsHandler>`.

## Frontend Patterns

- Prefer plain function components for new or normalized React components; keep existing `React.FC` in untouched files unless you are already normalizing that area.
- Name hook files and hook exports with the `useX` pattern.
- Keep props types close to the component and name them `...Props`.
- Split large components and hooks by concern before adding more state branches, especially for socket routing, form control sections, and profile or board workflows.

## Backend Patterns

- Keep route and handler modules organized as: imports, local types/helpers, main exported registration/handler object.
- Normalize unknown request or socket payloads immediately at the boundary.
- Prefer small repository/service helpers over repeating inline SQL shaping or payload cleanup logic across modules.
- Follow existing repository composition patterns instead of introducing classes.

## Change Guidelines

- If you change behavior, add or update tests when there is a clear existing test location.
- Keep frontend changes consistent with the existing UI patterns unless the user asks for a redesign.
- Keep backend route, websocket, and game-state changes aligned with existing snapshot and handler structure.
- When touching shared contracts, update both producers and consumers in the same change.
- Avoid adding new dependencies unless necessary.

## Verification

- For code changes, run the full unit/integration suite with `npm run test` by default.
- Prefer the full suite over narrow Vitest file runs in this repo because it is fast, catches cross-area regressions, and simplifies command permissions.
- Minimum expectation for code changes:
  - `npm run test`
  - `npm run lint` if the change meaningfully affects TypeScript or React code
- Use narrower test runs only for local iteration when needed, but final verification should still include the full `npm run test` suite unless the user explicitly says otherwise.
- If you cannot run a needed verification step, state that clearly.

## Testing Patterns

- Use Vitest with `describe`, `it`, `expect`, and `vi`.
- Treat `npm run test` as the default final verification command for code changes.
- When mocking imported modules, keep `vi.hoisted` and `vi.mock` near the top of the file before the import under test.
- Prefer local test helpers such as `makeRepos`, `request`, or context builders when they are specific to one test file.
- Keep Playwright specs task-oriented and factor repetitive setup into local helper functions inside the spec file.

## File Selection Hints

- Frontend pages live in `src/pages/` and feature folders under `src/features/`.
- WebSocket gameplay and lobby flow are under `backend/ws/handlers/`.
- Core game rules live under `backend/game/`.
- AI integrations live under `backend/services/ai/`, `backend/services/tts/`, and `backend/services/stt/`.
- Persistence logic lives under `backend/repositories/`.

## Docs

- Read `README.md` for deployment and runtime overview.
- Read `CONTRIBUTING.md` for local setup and contribution workflow.
