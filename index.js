import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BotManager } from './src/BotManager.js';
import { CommandHandler } from './src/commands/CommandHandler.js';
import { TelegramBot } from './src/platforms/TelegramBot.js';
import { DiscordBot } from './src/platforms/DiscordBot.js';
import logger from './src/utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Load configuration
let config;
try {
    const configPath = path.join(__dirname, 'config.json');

    if (!fs.existsSync(configPath)) {
        logger.error('config.json not found! Please copy config.example.json to config.json and configure it.');
        process.exit(1);
    }

    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
    logger.info('Configuration loaded successfully');
} catch (error) {
    logger.error(`Failed to load configuration: ${error.message}`);
    process.exit(1);
}

function normalizeConfig(config) {
    const normalized = config || {};

    normalized.minecraft = normalized.minecraft || {};
    normalized.minecraft.server = normalized.minecraft.server || {};
    if (!Array.isArray(normalized.minecraft.accounts)) {
        normalized.minecraft.accounts = [];
    }
    for (const account of normalized.minecraft.accounts) {
        if (account && typeof account === 'object' && account.autoStart === undefined) {
            account.autoStart = true;
        }
    }

    normalized.telegram = normalized.telegram || {};
    if (!Array.isArray(normalized.telegram.allowedUsers)) {
        normalized.telegram.allowedUsers = [];
    }
    if (normalized.telegram.enabled === undefined) {
        normalized.telegram.enabled = false;
    }

    normalized.discord = normalized.discord || {};
    if (!Array.isArray(normalized.discord.allowedUsers)) {
        normalized.discord.allowedUsers = [];
    }
    if (normalized.discord.enabled === undefined) {
        normalized.discord.enabled = false;
    }

    normalized.settings = normalized.settings || {};
    const settingDefaults = {
        autoReconnect: true,
        reconnectDelay: 5000,
        maxReconnectAttempts: 10,
        permanentRetryAfterMaxReconnect: false,
        maxAlreadyOnlineRetries: 3,
        alreadyOnlineReconnectDelay: 120000,
        maxSameKickRetries: 5,
        sameKickWindowMs: 300000,
        antiAfkEnabled: true,
        antiAfkInterval: 30000,
        proximityAlertEnabled: true,
        alertDistance: 96,
        alertCooldown: 300000,
        lobbyReturnCommand: '/home sp'
    };

    for (const [key, value] of Object.entries(settingDefaults)) {
        if (normalized.settings[key] === undefined) {
            normalized.settings[key] = value;
        }
    }

    if (!Array.isArray(normalized.settings.alertWhitelist)) {
        normalized.settings.alertWhitelist = [];
    }

    normalized.settings.protection = {
        enabled: false,
        emergencyDistance: 10,
        blockType: 'spawner',
        radius: 64,
        startDelay: 250,
        breakDelay: 0,
        verifyDelay: 80,
        breakRetryCount: 1,
        breakRetryDelay: 100,
        maxBlocksPerScan: 256,
        maxBreakReach: 5.0,
        inventoryConfirmTimeout: 11000,
        inventoryConfirmPollInterval: 250,
        inventoryConfirmDelay: 80,
        stackedFastMode: true,
        stackedFastGraceMs: 150,
        naturalLookEnabled: true,
        naturalLookSteps: 4,
        naturalLookStepDelay: 20,
        naturalLookJitter: 0.01,
        preDigPause: 35,
        blockGoneStableMs: 500,
        blockGoneRecheckInterval: 100,
        stackBatchSize: 64,
        stackedDepletionConfirmMs: 30000,
        stackedExhaustionIdleMs: 45000,
        stackedTargetMissingConfirmMs: 8000,
        noTargetRescanDelay: 100,
        maxHitsPerBlock: 256,
        goneConfirmChecks: 3,
        goneConfirmInterval: 50,
        ...(normalized.settings.protection || {})
    };

    return normalized;
}

config = normalizeConfig(config);

// Validate configuration
function validateConfig(config) {
    if (!config.minecraft?.server?.host) {
        throw new Error('Minecraft server host not configured');
    }

    if (!config.minecraft?.accounts || config.minecraft.accounts.length === 0) {
        logger.warn('No Minecraft accounts configured. Use /account add to set one up.');
    } else {
        logger.info(`Configured ${config.minecraft.accounts.length} Minecraft accounts`);
    }
}

async function main() {
    try {
        logger.info('='.repeat(50));
        logger.info('Starting Minecraft AFK Bot Manager');
        logger.info('='.repeat(50));

        // Validate config
        validateConfig(config);

        // Initialize Bot Manager
        const botManager = new BotManager(config);
        await botManager.initialize();
        const commandHandler = new CommandHandler(botManager);

        // Start Telegram Bot
        logger.info('Starting Telegram Bot...');
        const telegramBot = new TelegramBot(config, botManager);
        try {
            await telegramBot.start();
            logger.info('Telegram Bot started');
        } catch (error) {
            logger.error(`Failed to start Telegram Bot: ${error.message}`);
        }

        // Start Discord Bot
        logger.info('Starting Discord Bot...');
        const discordBot = new DiscordBot(config, botManager);
        try {
            await discordBot.start();
            logger.info('Discord Bot started');
        } catch (error) {
            logger.error(`Failed to start Discord Bot: ${error.message}`);
        }

        // Set platform bots for notifications
        botManager.setPlatformBots(telegramBot, discordBot);

        // Start only autoStart-enabled Minecraft bots
        logger.info('Starting autoStart-enabled Minecraft bots...');
        await botManager.startAutoStartBots();
        logger.info('Bot initialization complete. Use /start <slot> to connect any stopped slot.');

        logger.info('='.repeat(50));
        logger.info('All systems started successfully!');
        logger.info('='.repeat(50));
        // CLI Command Support (fallback when Telegram/Discord unavailable)
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.on('line', async (input) => {
            const command = input.trim();
            if (!command.startsWith('/')) return;

            if (command === '/stop_app') {
                shutdown('CONSOLE');
                return;
            }

            try {
                const result = await commandHandler.handleCommand(command, 'console', null);
                if (result.success) {
                    logger.info(`✅ ${result.message}`);
                    if (result.data) logger.info(JSON.stringify(result.data, null, 2));
                } else {
                    logger.warn(`❌ ${result.message}`);
                }
            } catch (error) {
                logger.error(`Command error: ${error.message}`);
            }
        });

        logger.info('📟 Console commands enabled. Type /help for commands.');

        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`\nReceived ${signal}, shutting down gracefully...`);
            rl.close();

            await botManager.stopAll();
            await telegramBot.stop();
            await discordBot.stop();

            logger.info('Shutdown complete');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (error) {
        logger.error(`Fatal error: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Start the application
main();
