# CONVENTIONS

## Code Style
- **Indentation**: 4 spaces
- **Semicolons**: Yes (trailing semicolons)
- **Quotes**: Single for strings, double in JSX/HTML
- **Braces**: K&R style (opening brace on same line)

## Async/Await
- Prefer `async/await` over raw Promises
- Use `try/catch` for error handling
- Timeout patterns via `Promise.race()`

## Class Patterns
- ES6 classes with constructor initialization
- Instance methods for behaviors
- Public methods for external API
- Callback properties for events (`this.onProximityAlert = null`)

## Error Handling
- Logger used for all errors (`logger.error()`)
- Graceful degradation where possible
- Error callbacks for async operations

## State Management
- Instance state in class properties
- Config passed by reference (shared mutable state)
- Bot status tracked: `offline`, `online`, `connecting`, `error`, `kicked`

## Config Patterns
- Default values applied in `normalizeConfig()` (`index.js:37-134`)
- Runtime config changes persisted via `BotManager.saveConfig()`
- AFK profiles stored per-account in config

## Communication Patterns
- Callback properties for event notification
- Platform bots receive BotManager reference
- CommandHandler receives BotManager reference

## Module System
- ES Modules (`import`/`export`)
- Relative imports with `.js` extension
- Singleton pattern for Logger

## Protection System
- Complex state machine in `executeProtection()`
- Adaptive timing based on no-gain streaks
- Block verification with multiple confirmations
