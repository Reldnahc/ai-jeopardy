# Contributing

Thanks for considering a contribution.

## Development Setup

1. Install dependencies:
   - `npm ci`
2. Run the app locally:
   - `npm run dev` for the frontend
   - `npm run dev:backend` for the backend
   - or use Docker: `npm run dev:docker`

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
