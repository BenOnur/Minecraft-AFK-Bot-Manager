# CONCERNS

## Technical Debt

### No Type Safety
- Plain JavaScript with no TypeScript
- Complex objects (config, bot state) lack type definitions
- Runtime errors possible from typos

### No Test Coverage
- No automated tests
- Manual validation required for changes
- Regression risk on refactoring

### Large File: MinecraftBot.js
- 2246 lines in single file
- Multiple responsibilities (anti-AFK, protection, connection, etc.)
- Hard to navigate and test

### Complex Protection Logic
- `executeProtection()` is 365 lines
- Adaptive timing with many magic numbers
- Ghost block handling is fragile

## Known Issues

### Inventory Monitoring
- 60-second polling interval for tool durability alerts
- Tool alerts use Set to prevent duplicates (persists across reconnects)

### Slot Renumbering
- Removing accounts shifts slot numbers
- Runtime state may become inconsistent during shift

### Anti-AFK Collision
- Random delays calculated at tick time
- Multiple bots may sync their AFK actions

### Session Management
- Sessions stored in `sessions/[username]/`
- No cleanup of old sessions
- `prismarine-auth` cache grows indefinitely

## Security Considerations

### Authorization
- User ID whitelist (config-based)
- No role-based access control
- All authorized users can control all bots

### Secrets
- Tokens stored in config.json (plain text)
- Should use environment variables or secrets manager

### Input Validation
- Slot numbers parsed from strings
- No sanitization of Minecraft chat messages

## Performance

### Proximity Check
- 2.5s + (slot * 100ms) interval
- Filters entities each iteration

### Auto-Eat
- 5s + (slot * 200ms) interval
- Equips pickaxe on every tick when not eating

### Log Streaming
- 2-second flush interval
- Buffers messages in memory

## Stability

### Reconnection Logic
- Complex state machine with manual stop flags
- Multiple retry counters (reconnect, already-online, same-kick)
- Temporary delay overrides can conflict

### Lobby Detection
- Relies on position drift detection
- Chat message parsing is fragile
- Server update messages hardcoded detection
