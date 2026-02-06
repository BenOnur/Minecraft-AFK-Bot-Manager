import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BotManager } from './src/BotManager.js';
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

        // Start all Minecraft bots
        // logger.info('Starting all Minecraft bots...');
        // await botManager.startAll();
        logger.info('Bots initialization complete. Use /start <slot> to connect.');

        logger.info('='.repeat(50));
        logger.info('All systems started successfully!');
        logger.info('='.repeat(50));

        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`\nReceived ${signal}, shutting down gracefully...`);

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
