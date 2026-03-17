# Refactor Plan

This plan normalizes code style and patterns based on the conventions that already appear most often in this repository.

## Progress

- Completed: shared lobby wire contracts and guard-based narrowing for the main lobby socket flow.
- Completed: core game snapshot and audio socket narrowing, plus removal of all remaining non-test `as unknown as` casts.
- Completed: message narrowing for the remaining game board and answer socket routers.
- Completed: extracted shared HTTP parsing helpers and route-specific profile parsing helpers out of `backend/http/profileRoutes.ts`.
- Completed: centralized repeated backend lobby settings defaults into a shared helper used by lobby creation and update flows.
- Completed: normalized backend player payload serialization through a shared helper across lobby snapshots and socket handlers.
- Completed: centralized empty lobby locked-category defaults into a shared backend helper.
- Completed: centralized repeated lobby socket error-and-snapshot responses into a shared backend helper.
- Completed: extracted lobby category-pool replacement logic out of `lobbyCategoryHandlers.ts`.
- Completed: extracted lobby category slot validation and category-selection helpers out of `lobbyCategoryHandlers.ts`.
- Completed: extracted profile moderation access and patch logic out of `backend/http/profileRoutes.ts`.
- Completed: extracted profile customization patch parsing out of `backend/http/profileRoutes.ts`.
- Completed: extracted Board Creator template/parse/validation helpers out of `src/pages/BoardCreator.tsx`.
- Completed: extracted ProfileContext cache and freshness helpers out of `src/contexts/ProfileContext.tsx`.
- Completed: extracted profile page role/boards helpers out of `src/hooks/profile/useProfilePageController.ts`.
- Completed: extracted profile page request and mutation helpers out of `src/hooks/profile/useProfilePageController.ts`.
- Completed: extracted profile page local UI state and effects out of `src/hooks/profile/useProfilePageController.ts`.
- Completed: extracted pure game socket helpers out of `src/features/game/socket/useGameSocketSync.ts`.
- Completed: extracted ProfileContext request helpers out of `src/contexts/ProfileContext.tsx`.
- Completed: extracted ProfileContext shared types, store hook, and bootstrap effects out of `src/contexts/ProfileContext.tsx`.
- Completed: extracted WebSocketContext socket lifecycle into `src/contexts/useWebSocketConnection.ts` and slimmed `src/contexts/WebSocketContext.tsx` down to a thin provider.
- Completed: extracted board creation settings, section builders, and daily-double assembly out of `backend/services/ai/board/board.ts`.
- Completed: extracted preload URL helpers, DOM preload adapters, and queue state out of `src/hooks/game/usePreload.ts`.
- Completed: extracted benchmark workflow timing, usage, and summary helpers out of `backend/services/ai/board/boardBenchmarkWorkflow.ts`.
- Completed: extracted benchmark workflow board-generation helpers out of `backend/services/ai/board/boardBenchmarkWorkflow.ts`.
- Completed: extracted benchmark workflow classifier helpers out of `backend/services/ai/board/boardBenchmarkWorkflow.ts`.
- Completed: extracted benchmark workflow artifact writers out of `backend/services/ai/board/boardBenchmarkWorkflow.ts`.
- Completed: extracted benchmark workflow config/bootstrap helpers and execution runner out of `backend/services/ai/board/boardBenchmarkWorkflow.ts`.
- Completed: extracted game socket local state and router-dependency assembly out of `src/features/game/socket/useGameSocketSync.ts`.
- Pending: broader file decomposition for oversized controllers, hooks, and route modules.

## Chosen Defaults

- Formatting follows `.prettierrc`: 2 spaces, semicolons, double quotes, trailing commas, 100-character line width.
- Keep explicit local import extensions such as `.ts`, `.tsx`, and `.js`.
- Prefer relative imports over adding path aliases.
- Use `import type` for type-only imports.
- Prefer `type` aliases for unions, helper payloads, DTOs, and shared domain shapes.
- Prefer `interface` for React props and context contracts in UI code.
- `backend/` and `shared/` should prefer named exports.
- `src/pages/`, `src/components/`, and `src/features/**/components/` should default-export the primary component in the file.
- `src/hooks/`, `src/utils/`, router helpers, and other non-UI modules should prefer named exports.
- Prefer plain function components for new or normalized React components.
- Avoid adding new `as unknown as` casts; normalize boundary payloads with helpers or type guards instead.

## Audit Summary

- The repo already has a clear formatting baseline from Prettier and ESLint.
- Explicit file extensions in local imports are already common and should be preserved.
- `import type` is already widely used and should be normalized repo-wide.
- `type` aliases are more common overall than `interface`.
- React props in `src/` are more commonly modeled with `interface ...Props`.
- Default exports are mainly a frontend component pattern. Backend and shared modules mostly use named exports.
- The biggest consistency and safety issue is repeated boundary casting with `as unknown as`.

## Prioritized Workstreams

### 1. Low-Risk Mechanical Normalization

- Normalize type-only imports to `import type`.
- Keep import ordering consistent within files without introducing a new tooling rule.
- Preserve explicit file extensions in local imports.
- Fix export-style outliers so each layer matches the dominant convention.

### 2. Boundary Type Cleanup

- Status: In progress.
- Completed so far:
  - Moved the main lobby socket wire contracts into `shared/types/lobby.ts`.
  - Replaced the main lobby frontend socket casts with guard-based narrowing.
  - Aligned backend lobby and COTD emitters with the shared lobby message contracts.
  - Added core game socket guards for snapshot and audio hydration paths.
  - Added guard-based narrowing for the remaining game board and answer router payloads.
  - Removed all remaining non-test `as unknown as` casts.
- Remaining:
  - Continue moving reusable socket payload contracts into shared or local guard modules where it reduces boundary casting.
  - Apply the same boundary-cleanup approach to other large route/controller modules as they are decomposed.

### 3. Frontend Component Normalization

- Normalize new or touched components toward plain function components.
- Keep props types local and named `...Props`.
- Preserve default exports for top-level UI components.
- Keep hook logic in hooks and avoid growing page components with transport or data-massaging logic.

### 4. Oversized File Decomposition

- Status: In progress.
- Completed so far:
  - Extracted shared HTTP parsing helpers into `backend/http/httpParsing.ts`.
  - Extracted route-specific profile parsing and auth-user helpers into `backend/http/profileRouteHelpers.ts`.
  - Extracted profile customization patch parsing into `backend/http/profileCustomization.ts`.
  - Extracted category-pool replacement logic into `backend/lobby/categoryPoolRefresh.ts`.
  - Extracted lobby category slot validation and random category selection into `backend/lobby/categorySlots.ts` and `backend/lobby/categorySelection.ts`.
  - Extracted profile moderation logic into `backend/http/profileModeration.ts`.
  - Extracted Board Creator pure helpers into `src/features/boardCreator/boardCreatorUtils.ts`.
  - Extracted ProfileContext cache/freshness helpers into `src/contexts/profileContext.helpers.ts`.
  - Extracted ProfileContext request helpers into `src/contexts/profileContext.requests.ts`.
  - Extracted ProfileContext shared contracts into `src/contexts/profileContext.types.ts`.
  - Extracted ProfileContext cache/request state into `src/contexts/profileContext.store.ts`.
  - Extracted ProfileContext auth/bootstrap effects into `src/contexts/profileContext.bootstrap.ts`.
  - Extracted WebSocketContext time-sync and socket lifecycle logic into `src/contexts/webSocketContext.helpers.ts` and `src/contexts/useWebSocketConnection.ts`.
  - Extracted profile page role/boards helpers into `src/hooks/profile/profilePageController.helpers.ts`.
  - Extracted profile page request helpers into `src/hooks/profile/profilePageController.requests.ts`.
  - Extracted profile page mutation flow into `src/hooks/profile/useProfilePageMutations.ts`.
  - Extracted profile page local drafts, toggles, and board-loading effects into `src/hooks/profile/useProfilePageUiState.ts`.
  - Extracted preload queue state into `src/hooks/game/usePreloadUrlQueue.ts` and preload helpers into `src/hooks/game/preload.helpers.ts` and `src/hooks/game/preload.dom.ts`.
  - Extracted pure game socket helpers into `src/features/game/socket/useGameSocketSync.helpers.ts`.
  - Extracted game socket local state, refs, and router dependency assembly into `src/features/game/socket/useGameSocketSync.state.ts`.
  - Extracted benchmark workflow timing, usage, and summary logic into `backend/services/ai/board/boardBenchmarkWorkflow.summary.ts`.
  - Extracted benchmark workflow shared request/result types into `backend/services/ai/board/boardBenchmarkWorkflow.types.ts`.
  - Extracted benchmark workflow board-generation jobs and board assembly into `backend/services/ai/board/boardBenchmarkGeneration.ts`.
  - Extracted board creation defaults, section builders, persistence helpers, and daily-double assembly into `backend/services/ai/board/boardCreate.helpers.ts` and `backend/services/ai/board/boardCreate.sections.ts`.
  - Extracted benchmark workflow classifier batching, transport, and scored-clue assembly into `backend/services/ai/board/boardBenchmarkClassifier.ts`.
  - Extracted benchmark workflow JSON artifact writing into `backend/services/ai/board/boardBenchmarkArtifacts.ts`.
  - Extracted benchmark workflow config parsing, constants, and board-set selection into `backend/services/ai/board/boardBenchmarkConfig.ts`.
  - Extracted benchmark workflow provider/runtime setup and per-board execution into `backend/services/ai/board/boardBenchmarkExecution.ts`.
- Remaining:
  - Split large hooks and components by concern before adding more state branches.
  - Extract route/body parsing helpers from additional large HTTP route modules.
  - Continue targeting remaining stateful frontend controllers and hooks that still mix local UI state with transport orchestration.

### 5. Backend Module Consistency

- Status: In progress.
- Completed so far:
  - Centralized repeated backend lobby settings defaults into `backend/lobby/settings.ts`.
  - Centralized backend player payload serialization into `backend/lobby/playerPayloads.ts`.
  - Centralized empty locked-category defaults into `backend/lobby/lockedCategories.ts`.
  - Centralized repeated lobby socket error/snapshot responses into `backend/lobby/socketErrors.ts`.
  - Centralized lobby board-slot validation and category selection logic into `backend/lobby/categorySlots.ts` and `backend/lobby/categorySelection.ts`.
- Keep route modules structured as imports, local helpers/types, exported `registerXRoutes`.
- Keep websocket handler files structured as imports, payload/helper definitions, exported handler map.
- Preserve repository factory patterns such as `createRepos` and `createXRepo`.
- Prefer helper functions over inline cleanup logic repeated across handlers and services.

### 6. Test Pattern Normalization

- Completed so far:
  - Expanded Vitest include patterns so `src/**/*.test.ts[x]` helper tests run in the default suite.
- Keep Vitest mocks at the top of the file with `vi.hoisted` and `vi.mock` before the import under test.
- Keep helper builders local to the spec file unless reuse is proven.
- Keep Playwright specs scenario-oriented with small local setup helpers.
- Add or update targeted tests when refactors change parsing, payload handling, or exported contracts.
- Keep shared browser-facing helper modules testable under the default Node Vitest environment.

## High-Value Targets

These files are strong candidates for the first structural cleanup pass:

- `src/hooks/profile/useProfilePageController.ts`
- `src/features/game/socket/useGameSocketSync.ts`
- `src/pages/BoardCreator.tsx`
- `src/contexts/ProfileContext.tsx`
- `backend/http/profileRoutes.ts`

## Suggested Execution Order

1. Normalize imports and export-style outliers.
2. Remove the worst `as unknown as` cases at the frontend/backend boundaries.
3. Extract shared payload types into `shared/`.
4. Split oversized hooks and route modules by concern.
5. Run targeted tests after each pass and run broader lint/test checks at the end of each workstream.

## Verification Expectations

- Run the narrowest relevant tests first.
- Run `npm run lint` for TypeScript and React code changes.
- Run focused Vitest files for touched backend routes, handlers, repositories, or hooks.
- Run `npm run test` after broad normalization passes.
- If a refactor affects user flows, run the relevant Playwright spec or document why it was skipped.
