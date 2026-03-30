# INTEGRATIONS

## Minecraft Server
- **Protocol**: mineflayer (TCP connection to Minecraft server)
- **Auth**: Microsoft OAuth via prismarine-auth
- **Version**: Configurable (defaults to server detection)
- **Features**: Chat, movement, block interaction, inventory management

## Telegram Bot
- **API**: Telegram Bot API via Telegraf
- **Auth**: User ID whitelist checking
- **Features**:
  - Command parsing (prefix `/`)
  - HTML message formatting
  - Log streaming (real-time log forwarding)
  - Inline command help

## Discord Bot
- **API**: Discord REST API v10 via discord.js v14
- **Auth**: User ID whitelist + optional guild restriction
- **Features**:
  - Slash commands registration (global/guild)
  - Prefix commands (prefix `!` or `/`)
  - Embed responses for structured data
  - Log streaming to Discord channels
  - Direct message alerts

## External Services
- **Microsoft Auth Server** — Minecraft account authentication
- **Minecraft Server** — Target game server (configurable host/port)

## Configuration
- **config.json** — All runtime configuration
- **config.example.json** — Template with placeholder values
- Config includes: server, accounts, telegram, discord, settings
