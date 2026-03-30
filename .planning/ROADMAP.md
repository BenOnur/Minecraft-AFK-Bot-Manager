# Roadmap

## Overview

**4 phases** | **22 requirements** | All v1 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | TypeScript Foundation | Setup TypeScript, type utilities | TS-01 to TS-05 | Config works, utilities typed |
| 2 | Core Decomposition | Split MinecraftBot into managers | MOD-01 to MOD-06, TS-06 to TS-09 | Managers work, bot functional |
| 3 | Testing Infrastructure | Add Vitest, write tests | TEST-01 to TEST-08 | 70% coverage achieved |
| 4 | Polish & Build | Build scripts, final integration | BUILD-01 to BUILD-04, TS-10 | App runs normally |

---

## Phase 1: TypeScript Foundation

**Goal**: Setup TypeScript infrastructure and type utility files.

### Requirements
- TS-01: Add TypeScript configuration with strict mode
- TS-02: Create `src/types/` directory with shared type definitions
- TS-03: Type Logger utility (src/utils/Logger.ts)
- TS-04: Type Auth utility (src/utils/Auth.ts)
- TS-05: Type CommandParser (src/commands/CommandParser.ts)

### Success Criteria
1. `tsc --noEmit` passes with no errors
2. All utility functions have proper return types
3. Existing functionality unchanged
4. `npm run typecheck` works

### Plans
- [x] 01-01-PLAN.md — Setup TypeScript config (tsconfig.json, package.json scripts)
- [ ] 01-02-PLAN.md — Create src/types/ and type Logger utility
- [ ] 01-03-PLAN.md — Type Auth and CommandParser utilities

---

## Phase 2: Core Decomposition

**Goal**: Type remaining modules and decompose MinecraftBot.

### Requirements
- MOD-01: Create ConnectionManager for bot lifecycle
- MOD-02: Create AntiAfkManager for AFK behavior
- MOD-03: Create ProtectionManager for spawner breaking
- MOD-04: Create InventoryManager for item management
- MOD-05: Refactor MinecraftBot to use new managers
- MOD-06: Verify all existing functionality works
- TS-06: Type CommandHandler (src/commands/CommandHandler.ts)
- TS-07: Type BotManager (src/BotManager.ts)
- TS-08: Type MinecraftBot (src/MinecraftBot.ts)

### Success Criteria
1. MinecraftBot uses new manager modules
2. No functionality regression
3. All commands work via Telegram/Discord/CLI
4. Bot connects and plays normally

---

## Phase 3: Testing Infrastructure

**Goal**: Add test framework and comprehensive test coverage.

### Requirements
- TEST-01: Setup Vitest testing framework
- TEST-02: Write tests for CommandParser.parseSlots()
- TEST-03: Write tests for CommandParser.parseCommand()
- TEST-04: Write tests for Auth.isTelegramUserAuthorized()
- TEST-05: Write tests for Auth.isDiscordUserAuthorized()
- TEST-06: Write tests for config normalization
- TEST-07: Write integration tests for command routing
- TEST-08: Verify 70% code coverage on refactored modules

### Success Criteria
1. `npm test` runs successfully
2. 70% line coverage on src/managers/
3. All tests pass
4. CI-ready test script

---

## Phase 4: Polish & Build

**Goal**: Finalize build scripts and platform bot typing.

### Requirements
- BUILD-01: Add npm scripts for TypeScript compilation
- BUILD-02: Add npm scripts for type checking
- BUILD-03: Update README with TypeScript build instructions
- BUILD-04: Verify existing startup scripts work
- TS-09: Type platform bots (TelegramBot.ts, DiscordBot.ts)
- TS-10: Add type definitions for mineflayer, telegraf, discord.js

### Success Criteria
1. `npm run build` produces dist/
2. `npm start` runs TypeScript via tsx or compiled JS
3. README reflects TypeScript setup
4. All type errors resolved
