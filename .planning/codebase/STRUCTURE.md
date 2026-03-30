# STRUCTURE

## Directory Layout
```
Minecraft-AFK-Bot-Manager/
├── index.js                 — Application entry point
├── package.json              — Dependencies & scripts
├── config.example.json       — Configuration template
├── start.bat                — Windows startup script
├── README.md                — Project documentation
├── logs/                    — Runtime logs (auto-created)
│   ├── error.log
│   └── combined.log
├── sessions/                — Minecraft auth sessions (auto-created)
│   └── [username]/
└── src/
    ├── MinecraftBot.js      — 2246 lines, core bot logic
    ├── BotManager.js        — 630 lines, orchestration
    ├── commands/
    │   ├── CommandHandler.js — 694 lines, command routing
    │   └── CommandParser.js  — 71 lines, argument parsing
    ├── platforms/
    │   ├── DiscordBot.js    — 489 lines, Discord integration
    │   └── TelegramBot.js   — 311 lines, Telegram integration
    └── utils/
        ├── Logger.js        — 80 lines, Winston wrapper
        └── Auth.js          — 31 lines, platform auth
```

## Key File Locations

### Entry Point
- `index.js:1-251` — App bootstrap, config loading, platform init

### Bot Core
- `src/MinecraftBot.js` — Mineflayer wrapper
  - Lines 172-234: `start()` method
  - Lines 522-760: `setupEventHandlers()`
  - Lines 812-854: `startAntiAfk()`
  - Lines 1424-1789: `executeProtection()` (spawner breaking)

### Command System
- `src/commands/CommandHandler.js` — Command routing
  - Lines 21-76: Command switch dispatcher
  - Lines 83-115: `handleSay()` implementation
- `src/commands/CommandParser.js` — Slot parsing (ranges, commas)

### Platform Integration
- `src/platforms/TelegramBot.js:34-47` — Auth middleware
- `src/platforms/DiscordBot.js:24-108` — Slash command registration

### Utilities
- `src/utils/Logger.js` — Custom callback transport for log streaming
- `src/utils/Auth.js` — Simple user ID checking

## Naming Conventions
- **Files**: PascalCase for classes (`MinecraftBot.js`), camelCase for utilities (`logger.js`)
- **Classes**: PascalCase (`BotManager`, `CommandHandler`)
- **Methods**: camelCase (`startBot`, `handleCommand`)
- **Config keys**: camelCase (`autoStart`, `alertDistance`)
