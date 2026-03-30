# Research Summary

## Stack
- **TypeScript 5.x** with strict mode
- **Vitest** for testing (ESM-native)
- **Incremental compilation** via `tsc --watch`
- **Keep ESM modules** — no CommonJS conversion needed

## Key Findings

### Type Safety
- Add `tsconfig.json` with `strict: true`
- Start with utility files (Logger, Auth)
- Create shared types in `src/types/`
- Use type assertions for `JSON.parse()` results

### Module Decomposition
- Split `MinecraftBot.js` into 4 managers:
  1. `ConnectionManager` — lifecycle, reconnect
  2. `AntiAfkManager` — AFK behavior
  3. `ProtectionManager` — spawner breaking
  4. `InventoryManager` — items, auto-eat
- Each manager: max 500 lines (guideline)

### Testing Strategy
- **Vitest** — fast, modern, ESM support
- Unit tests: CommandParser, Auth, config
- Integration tests: command flow, bot lifecycle
- Target: 70% coverage on refactored code

### Migration Order
1. Setup TypeScript + Vitest
2. Type utility files (Logger, Auth)
3. Type command system
4. Decompose MinecraftBot
5. Update platform bots
6. Integration testing

## Watch Out For
- Type hoisting issues (define interfaces first)
- `any` type leaks (use `unknown` + narrowing)
- ESM extension requirements in imports
- Config type safety (`JSON.parse` returns `any`)

## Confidence: High
The approach is well-established. Similar migrations have been done successfully on other mineflayer-based projects.
