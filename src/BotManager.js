import { MinecraftBot } from './MinecraftBot.js';
import { spawn } from 'child_process';
import logger from './utils/Logger.js';

export class BotManager {
    constructor(config) {
        this.config = config;
        this.bots = new Map(); // slot -> MinecraftBot instance
        this.telegramBot = null;
        this.discordBot = null;
    }

    setPlatformBots(telegramBot, discordBot) {
        this.telegramBot = telegramBot;
        this.discordBot = discordBot;
    }

    handleProximityAlert(slot, player, distance) {
        const message = `⚠️ **PROXIMITY ALERT** ⚠️\nSlot ${slot} detected player **${player}** at **${Math.round(distance)}** blocks!`;

        logger.warn(`Slot ${slot}: Proximity alert - ${player} (${Math.round(distance)} blocks)`);

        // Send to Telegram
        if (this.telegramBot && this.telegramBot.bot) {
            for (const userId of this.config.telegram.allowedUsers) {
                this.telegramBot.bot.telegram.sendMessage(userId, message).catch(() => { });
            }
        }

        // Send to Discord
        if (this.discordBot) {
            this.discordBot.sendAlert(message);
        }
    }

    handleConnect(slot, host, version) {
        const message = `[${slot}] connected -> (${host}) (${version})`;
        logger.info(message);

        // Send to Telegram
        if (this.telegramBot && this.telegramBot.bot) {
            for (const userId of this.config.telegram.allowedUsers) {
                this.telegramBot.bot.telegram.sendMessage(userId, message).catch(() => { });
            }
        }

        // Send to Discord
        if (this.discordBot) {
            this.discordBot.sendAlert(message);
        }
    }

    async initialize() {
        logger.info('Initializing Bot Manager');

        for (const accountConfig of this.config.minecraft.accounts) {
            const bot = new MinecraftBot(this.config, accountConfig);
            // Callback for alerts
            bot.onProximityAlert = (player, distance) => this.handleProximityAlert(accountConfig.slot, player, distance);
            bot.onConnect = (host, version) => this.handleConnect(accountConfig.slot, host, version);

            this.bots.set(accountConfig.slot, bot);
            logger.info(`Registered slot ${accountConfig.slot} for ${accountConfig.username}`);
        }

        logger.info(`Bot Manager initialized with ${this.bots.size} accounts`);
    }

    async startBot(slot) {
        const bot = this.bots.get(slot);
        if (!bot) {
            logger.error(`Slot ${slot} not found`);
            return false;
        }

        return await bot.start();
    }

    async stopBot(slot) {
        const bot = this.bots.get(slot);
        if (!bot) {
            logger.error(`Slot ${slot} not found`);
            return false;
        }

        return await bot.stop();
    }

    async restartBot(slot) {
        const bot = this.bots.get(slot);
        if (!bot) {
            logger.error(`Slot ${slot} not found`);
            return false;
        }

        return await bot.restart();
    }

    pauseBot(slot) {
        const bot = this.bots.get(slot);
        if (!bot) {
            logger.error(`Slot ${slot} not found`);
            return false;
        }

        return bot.pause();
    }

    resumeBot(slot) {
        const bot = this.bots.get(slot);
        if (!bot) {
            logger.error(`Slot ${slot} not found`);
            return false;
        }

        return bot.resume();
    }

    async startAll() {
        logger.info('Starting all bots');
        const promises = [];

        for (const [slot, bot] of this.bots) {
            promises.push(bot.start());
        }

        await Promise.all(promises);
        logger.info('All bots started');
    }

    async stopAll() {
        logger.info('Stopping all bots');
        const promises = [];

        for (const [slot, bot] of this.bots) {
            promises.push(bot.stop());
        }

        await Promise.all(promises);
        logger.info('All bots stopped');
    }

    async restartAll() {
        logger.info('Restarting all bots');
        await this.stopAll();

        setTimeout(async () => {
            await this.startAll();
        }, 3000);
    }

    async reloadSystem() {
        logger.warn('SYSTEM RELOAD REQUESTED');
        logger.info('Stopping all bots and services...');

        await this.stopAll();
        if (this.telegramBot) await this.telegramBot.stop();
        if (this.discordBot) await this.discordBot.stop();

        logger.info('Spawning new process...');

        // Spawn a new detached process
        const child = spawn(process.argv[0], ['index.js'], {
            detached: true,
            stdio: 'ignore',
            cwd: process.cwd()
        });

        child.unref();

        logger.info('Exiting current process...');
        process.exit(0);
    }

    sendMessage(slots, message) {
        const results = [];

        for (const slot of slots) {
            const bot = this.bots.get(slot);
            if (bot) {
                const success = bot.sendChat(message);
                results.push({ slot, success });
            } else {
                results.push({ slot, success: false, error: 'Slot not found' });
            }
        }

        return results;
    }

    sendMessageToAll(message) {
        const slots = Array.from(this.bots.keys());
        return this.sendMessage(slots, message);
    }

    getBotStatus(slot) {
        const bot = this.bots.get(slot);
        if (!bot) {
            return null;
        }

        return bot.getStatus();
    }

    getAllStatus() {
        const statuses = [];

        for (const [slot, bot] of this.bots) {
            statuses.push(bot.getStatus());
        }

        return statuses;
    }

    getBotInventory(slot) {
        const bot = this.bots.get(slot);
        if (!bot) {
            return null;
        }

        return bot.getInventory();
    }

    async moveBot(slot, direction, distance) {
        const bot = this.bots.get(slot);
        if (!bot) {
            return { success: false, message: 'Slot not found' };
        }

        return await bot.move(direction, distance);
    }

    async dropItem(slot, itemName, count) {
        const bot = this.bots.get(slot);
        if (!bot) {
            return false;
        }

        return await bot.dropItem(itemName, count);
    }

    getAvailableSlots() {
        return Array.from(this.bots.keys());
    }

    async saveConfig() {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const configPath = path.resolve('config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 4));
            logger.info('Configuration saved successfully');
            return true;
        } catch (error) {
            logger.error(`Failed to save configuration: ${error.message}`);
            return false;
        }
    }

    getWhitelist() {
        return this.config.settings.alertWhitelist || [];
    }

    async addToWhitelist(username) {
        if (!this.config.settings.alertWhitelist) {
            this.config.settings.alertWhitelist = [];
        }

        const currentList = this.config.settings.alertWhitelist.map(u => u.toLowerCase());
        if (currentList.includes(username.toLowerCase())) {
            return { success: false, message: `${username} is already in the whitelist` };
        }

        this.config.settings.alertWhitelist.push(username);
        await this.saveConfig();
        return { success: true, message: `Added ${username} to whitelist` };
    }

    async removeFromWhitelist(username) {
        if (!this.config.settings.alertWhitelist) {
            return { success: false, message: 'Whitelist is empty' };
        }

        const initialLength = this.config.settings.alertWhitelist.length;
        this.config.settings.alertWhitelist = this.config.settings.alertWhitelist.filter(
            u => u.toLowerCase() !== username.toLowerCase()
        );

        if (this.config.settings.alertWhitelist.length === initialLength) {
            return { success: false, message: `${username} not found in whitelist` };
        }

        await this.saveConfig();
        return { success: true, message: `Removed ${username} from whitelist` };
    }
}
