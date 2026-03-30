# Requirements

## v1 Requirements

### TypeScript Migration

- [ ] **TS-01**: Add TypeScript configuration with strict mode
- [ ] **TS-02**: Create `src/types/` directory with shared type definitions
- [ ] **TS-03**: Type Logger utility (src/utils/Logger.ts)
- [ ] **TS-04**: Type Auth utility (src/utils/Auth.ts)
- [ ] **TS-05**: Type CommandParser (src/commands/CommandParser.ts)
- [ ] **TS-06**: Type CommandHandler (src/commands/CommandHandler.ts)
- [ ] **TS-07**: Type BotManager (src/BotManager.ts)
- [ ] **TS-08**: Type MinecraftBot (src/MinecraftBot.ts)
- [ ] **TS-09**: Type platform bots (TelegramBot.ts, DiscordBot.ts)
- [ ] **TS-10**: Add type definitions for mineflayer, telegraf, discord.js

### Module Decomposition

- [ ] **MOD-01**: Create ConnectionManager for bot lifecycle
- [ ] **MOD-02**: Create AntiAfkManager for AFK behavior
- [ ] **MOD-03**: Create ProtectionManager for spawner breaking
- [ ] **MOD-04**: Create InventoryManager for item management
- [ ] **MOD-05**: Refactor MinecraftBot to use new managers
- [ ] **MOD-06**: Verify all existing functionality works

### Testing

- [ ] **TEST-01**: Setup Vitest testing framework
- [ ] **TEST-02**: Write tests for CommandParser.parseSlots()
- [ ] **TEST-03**: Write tests for CommandParser.parseCommand()
- [ ] **TEST-04**: Write tests for Auth.isTelegramUserAuthorized()
- [ ] **TEST-05**: Write tests for Auth.isDiscordUserAuthorized()
- [ ] **TEST-06**: Write tests for config normalization
- [ ] **TEST-07**: Write integration tests for command routing
- [ ] **TEST-08**: Verify 70% code coverage on refactored modules

### Build & Tooling

- [ ] **BUILD-01**: Add npm scripts for TypeScript compilation
- [ ] **BUILD-02**: Add npm scripts for type checking
- [ ] **BUILD-03**: Update README with TypeScript build instructions
- [ ] **BUILD-04**: Verify existing startup scripts work

## v2 Requirements (Deferred)

- [ ] Pre-commit hooks (ESLint, Prettier)
- [ ] GitHub Actions CI pipeline
- [ ] API documentation generation
- [ ] Performance benchmarking

## Out of Scope

- [ ] New features — focus on quality only
- [ ] Performance optimization — separate initiative
- [ ] Rewrite of game logic — keep existing mineflayer usage
- [ ] Database integration — no backend changes

## Traceability

| Requirement | Phase |
|------------|-------|
| TS-01 to TS-10 | Phase 1 |
| MOD-01 to MOD-06 | Phase 2 |
| TEST-01 to TEST-08 | Phase 3 |
| BUILD-01 to BUILD-04 | Phase 4 |
