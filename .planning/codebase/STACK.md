# STACK

## Languages & Runtime
- **JavaScript (ES Modules)** — Node.js runtime
- **Type safety** — JSDoc comments in some files, but primarily plain JS

## Framework & Libraries
- **mineflayer** (`^4.20.1`) — Minecraft bot protocol library
- **telegraf** (`^4.16.3`) — Telegram Bot API framework
- **discord.js** (`^14.14.1`) — Discord API wrapper
- **winston** (`^3.11.0`) — Logging library
- **prismarine-auth** (`^2.4.0`) — Microsoft authentication for Minecraft

## Project Configuration
- **package.json** — ES modules (`"type": "module"`)
- **Entry point**: `index.js`
- **Scripts**: `npm start`, `npm run dev` (with `--watch` flag)

## File Structure
```
src/
├── MinecraftBot.js      — Core mineflayer bot wrapper (2246 lines)
├── BotManager.js       — Multi-slot bot orchestration
├── commands/
│   ├── CommandHandler.js — Command routing & execution
│   └── CommandParser.js  — CLI argument parsing
├── platforms/
│   ├── DiscordBot.js    — Discord integration with slash commands
│   └── TelegramBot.js   — Telegram bot integration
└── utils/
    ├── Logger.js       — Winston logger with stream support
    └── Auth.js         — Platform authorization checks
```

## Key Patterns
- Singleton logger instance exported from `Logger.js`
- All MinecraftBot instances share config reference
- Platform bots created in `index.js`, passed to BotManager
- CommandHandler instantiated separately per platform
