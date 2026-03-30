# Project: Minecraft AFK Bot Manager — Quality Improvement

## What This Is

A comprehensive code quality improvement initiative for the existing Minecraft AFK Bot Manager. Transform the current JavaScript codebase into a well-tested, type-safe, modular TypeScript application while preserving all existing functionality.

## Core Value

**Maintain full backward compatibility while elevating code quality to production-grade standards.**

The system must remain operational throughout the migration. Users should experience zero downtime or feature loss during the transition.

## Context

### Current State
- **Language**: JavaScript (ES Modules)
- **Size**: ~2,500 lines across 9 source files
- **Largest File**: `src/MinecraftBot.js` (2,246 lines)
- **Testing**: None
- **Type Safety**: None

### Key Pain Points
1. No automated tests — manual validation required for all changes
2. Plain JavaScript with no type definitions
3. `MinecraftBot.js` handles too many responsibilities
4. Complex protection logic is fragile and hard to modify
5. No regression protection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript migration | Catch errors at compile time, better IDE support | — Pending |
| Incremental approach | Preserve functionality, reduce risk | — Pending |
| Vitest for testing | Modern, fast, ESM support | — Pending |
| Keep ESM modules | Maintain current bundling approach | — Pending |

## Requirements

### Active

- [ ] **TypeScript Migration (Foundation)**
  - Add TypeScript configuration
  - Type all utility files first (Logger, Auth, CommandParser)
  - Establish type naming conventions

- [ ] **Module Decomposition**
  - Split `MinecraftBot.js` into focused modules:
    - `ConnectionManager` — Bot lifecycle, reconnect logic
    - `AntiAfkManager` — AFK behavior
    - `ProtectionManager` — Spawner breaking logic
    - `InventoryManager` — Item management, auto-eat
    - `EventHandlers` — Event listener organization

- [ ] **Test Coverage**
  - Unit tests for CommandParser
  - Unit tests for Auth
  - Unit tests for config normalization
  - Integration tests for command routing

- [ ] **Backward Compatibility**
  - Zero downtime migration
  - Same config.json format
  - Same command interface (Telegram/Discord/CLI)
  - Same logging output

### Out of Scope

- [ ] New features — Focus only on quality improvement
- [ ] Performance optimization — Separate initiative
- [ ] Documentation rewrite — Keep existing README
- [ ] CI/CD pipeline — May add after migration complete

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-30 after initialization*
