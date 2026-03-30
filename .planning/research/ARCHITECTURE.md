# ARCHITECTURE Research — Module Decomposition

## Current Structure (Problem)

```
src/
├── MinecraftBot.js (2246 lines) ← TOO LARGE
│   ├── Connection management
│   ├── Anti-AFK logic
│   ├── Auto-eat
│   ├── Proximity detection
│   ├── Protection/executeProtection
│   ├── Inventory monitoring
│   └── Event handlers
├── BotManager.js (630 lines)
├── CommandHandler.js (694 lines)
└── ...
```

## Proposed Structure (Target)

```
src/
├── types/                    # Type definitions
│   ├── config.ts
│   ├── bot.ts
│   └── commands.ts
├── managers/
│   ├── ConnectionManager.ts   # Bot lifecycle
│   ├── AntiAfkManager.ts     # AFK behavior
│   ├── ProtectionManager.ts   # Spawner breaking
│   └── InventoryManager.ts    # Items, auto-eat
├── platform/
│   ├── TelegramBot.ts
│   └── DiscordBot.ts
├── commands/
│   ├── CommandHandler.ts
│   └── CommandParser.ts
├── utils/
│   ├── Logger.ts
│   └── Auth.ts
├── MinecraftBot.ts            # Facade/orchestrator
└── BotManager.ts             # Multi-slot coordination
```

## Dependency Direction

```
MinecraftBot (facade)
    ↓
managers/* (depend on types)
    ↓
utils/* (no external dependencies)
```

## Migration Order

1. **Phase 1**: Types + Utils (Logger, Auth)
2. **Phase 2**: Command system (Parser, Handler)
3. **Phase 3**: MinecraftBot decomposition
4. **Phase 4**: Integration + BotManager
5. **Phase 5**: Platform bots
