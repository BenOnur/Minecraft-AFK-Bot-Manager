import { CommandParser } from './CommandParser.js';
import logger from '../utils/Logger.js';
import { handleSay, handleAll, handleMove } from './handlers/messageHandlers.js';
import {
    handleStatus,
    handleRestart,
    handleStop,
    handleStart,
    handleInventory,
    handleDrop
} from './handlers/lifecycleHandlers.js';
import {
    handleAccount,
    handleWhitelist,
    handleStats,
    handleAfkSet,
    handleProtect
} from './handlers/adminHandlers.js';
import {
    handleHelp,
    handleTelegramHelp,
    handleDiscordHelp,
    handleGenericHelp
} from './handlers/helpHandlers.js';

export class CommandHandler {
    constructor(botManager) {
        this.botManager = botManager;
    }

    async handleCommand(commandText, platform = 'generic', userId = null) {
        try {
            const parsed = CommandParser.parseCommand(commandText);
            const { command, args } = parsed;

            logger.info(`Handling command: ${command} with args: ${JSON.stringify(args)} for platform: ${platform}`);

            if (/^\d+$/.test(command)) {
                return await this.handleSay([command, ...args]);
            }

            switch (command) {
                case 'say':
                    return await this.handleSay(args);
                case 'all':
                    return await this.handleAll(args);
                case 'status':
                case 's':
                    return await this.handleStatus(args);
                case 'restart':
                case 'reconnect':
                    return await this.handleRestart(args);
                case 'account':
                    return await this.handleAccount(args, platform, userId || parsed.userId);
                case 'stop':
                case 'disconnect':
                    return await this.handleStop(args);
                case 'start':
                    return await this.handleStart(args);
                case 'inv':
                    return await this.handleInventory(args);
                case 'drop':
                    return await this.handleDrop(args);
                case 'forward':
                case 'f':
                    return await this.handleMove(args, 'forward');
                case 'backward':
                case 'back':
                case 'b':
                    return await this.handleMove(args, 'back');
                case 'left':
                case 'l':
                    return await this.handleMove(args, 'left');
                case 'right':
                case 'r':
                    return await this.handleMove(args, 'right');
                case 'help':
                    return this.handleHelp(platform);
                case 'whitelist':
                case 'wl':
                    return await this.handleWhitelist(args);
                case 'protect':
                case 'p':
                    return await this.handleProtect(args);
                case 'afkset':
                    return await this.handleAfkSet(args);
                case 'stats':
                    return await this.handleStats(args);
                default:
                    return { success: false, message: `Unknown command: ${command}` };
            }
        } catch (error) {
            logger.error(`Command handler error: ${error.message}`);
            return { success: false, message: `Error: ${error.message}` };
        }
    }

    async handleSay(args) {
        return handleSay(this, args);
    }

    async handleAll(args) {
        return handleAll(this, args);
    }

    async handleStatus(args) {
        return handleStatus(this, args);
    }

    async handleRestart(args) {
        return handleRestart(this, args);
    }

    async handleAccount(args, platform, userId) {
        return handleAccount(this, args, platform, userId);
    }

    async handleStop(args) {
        return handleStop(this, args);
    }

    async handleStart(args) {
        return handleStart(this, args);
    }

    async handleInventory(args) {
        return handleInventory(this, args);
    }

    async handleDrop(args) {
        return handleDrop(this, args);
    }

    async handleMove(args, direction) {
        return handleMove(this, args, direction);
    }

    async handleWhitelist(args) {
        return handleWhitelist(this, args);
    }

    async handleStats(args) {
        return handleStats(this, args);
    }

    async handleAfkSet(args) {
        return handleAfkSet(this, args);
    }

    async handleProtect(args) {
        return handleProtect(this, args);
    }

    handleHelp(platform) {
        return handleHelp(this, platform);
    }

    handleTelegramHelp() {
        return handleTelegramHelp(this);
    }

    handleDiscordHelp() {
        return handleDiscordHelp(this);
    }

    handleGenericHelp() {
        return handleGenericHelp(this);
    }
}
