# ARCHITECTURE

## Core Pattern
**Event-Driven Multi-Slot Bot Manager**

```
index.js (Entry)
    ├── BotManager (orchestrator)
    │   ├── MinecraftBot[] (per-slot instances)
    │   ├── TelegramBot (platform)
    │   └── DiscordBot (platform)
    ├── CommandHandler (routing)
    │   ├── CommandParser (parsing)
    │   └── Platform-specific handlers
    └── Logger (singleton)
```

## Component Responsibilities

### index.js
- App initialization & graceful shutdown
- Config loading & normalization
- Platform bot instantiation
- Readline CLI for fallback commands

### BotManager
- Slot-to-MinecraftBot mapping
- Cross-platform state coordination
- Config persistence (account changes)
- Alert broadcasting (Telegram + Discord)

### MinecraftBot
- mineflayer instance lifecycle
- Anti-AFK behavior (jump, look, sneak)
- Auto-eat functionality
- Proximity detection & alerts
- Spawner breaking (protection)
- Lobby detection & return
- Connection recovery (auto-reconnect)

### Platform Bots (Telegram/Discord)
- Auth middleware
- Command forwarding to CommandHandler
- Response formatting (HTML for Telegram, embeds for Discord)
- Log streaming

### CommandHandler
- Command dispatch (switch-based routing)
- Slot validation
- Per-command business logic

## Data Flow
1. User → Platform (Telegram/Discord/CLI)
2. Platform → CommandParser → CommandHandler
3. CommandHandler → BotManager → MinecraftBot
4. MinecraftBot → mineflayer → Server
5. Events flow back: Server → MinecraftBot → BotManager → Platform → User

## Key Design Decisions
- **Slot-based multi-account**: Each Minecraft account is a "slot" with independent state
- **Callback-driven events**: BotManager receives callbacks from MinecraftBot for alerts
- **Config as source of truth**: Account config persisted to config.json
- **Platform abstraction**: Same commands work via Telegram, Discord, or CLI
