# TESTING

## Current State
- **No test framework** — Project has no automated tests
- **Manual testing** — Features validated by running against Minecraft server

## Test Patterns to Consider
If tests were to be added:

### Unit Tests
- `CommandParser.parseSlots()` — Slot range parsing
- `CommandParser.parseCommand()` — Command string parsing
- `Auth.isTelegramUserAuthorized()` — User validation
- `normalizeConfig()` — Config defaults

### Integration Tests
- Command execution through CommandHandler
- Platform message formatting
- Bot connection lifecycle

## Test Framework Recommendations
- **Node.js**: Vitest (modern, fast, ESM support)
- **Mocking**: `vi.mock()` for modules

## Manual Validation Checklist
When modifying core functionality:
- [ ] Telegram commands work
- [ ] Discord slash commands register
- [ ] Bot connects to Minecraft server
- [ ] Anti-AFK triggers movement
- [ ] Proximity alerts fire
- [ ] Lobby detection works
- [ ] Spawner breaking completes
- [ ] Reconnection logic works
- [ ] Config persistence works
