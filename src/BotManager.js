import { MinecraftBot } from './MinecraftBot.js';
import fs from 'fs/promises';
import path from 'path';

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

    // Convert **bold** markdown to HTML <b> tags for Telegram
    _mdToHtml(text) {
        return String(text)
            .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    }

    broadcastMessage(message) {
        if (this.telegramBot && this.telegramBot.bot) {
            const htmlMessage = this._mdToHtml(message);
            for (const userId of this.config.telegram.allowedUsers) {
                this.telegramBot.bot.telegram.sendMessage(userId, htmlMessage, { parse_mode: 'HTML' }).catch(() => { });
            }
        }
        if (this.discordBot) {
            this.discordBot.sendAlert(message);
        }
    }

    handleProximityAlert(slot, player, distance) {
        const message = `⚠️ <b>PROXIMITY ALERT</b> ⚠️\nSlot ${slot} — Oyuncu <b>${player}</b> <b>${Math.round(distance)}</b> blok uzakta!`;
        logger.warn(`Slot ${slot}: Proximity alert - ${player} (${Math.round(distance)} blocks)`);
        // Send HTML directly to Telegram, plain text to Discord
        if (this.telegramBot && this.telegramBot.bot) {
            for (const userId of this.config.telegram.allowedUsers) {
                this.telegramBot.bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' }).catch(() => { });
            }
        }
        if (this.discordBot) {
            this.discordBot.sendAlert(`⚠️ **PROXIMITY ALERT** ⚠️\nSlot ${slot} — Oyuncu **${player}** **${Math.round(distance)}** blok uzakta!`);
        }
    }

    handleConnect(slot, host, version) {
        const message = `✅ Slot <b>${slot}</b> bağlandı → <code>${host}</code> (${version})`;
        logger.info(`[${slot}] connected -> (${host}) (${version})`);
        if (this.telegramBot && this.telegramBot.bot) {
            for (const userId of this.config.telegram.allowedUsers) {
                this.telegramBot.bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' }).catch(() => { });
            }
        }
        if (this.discordBot) {
            this.discordBot.sendAlert(`✅ Slot **${slot}** bağlandı → \`${host}\` (${version})`);
        }
    }

    async initialize() {
        logger.info('Initializing Bot Manager');

        for (const accountConfig of this.config.minecraft.accounts) {
            const bot = new MinecraftBot(this.config, accountConfig);
            // Callback for alerts
            bot.onProximityAlert = (player, distance) => this.handleProximityAlert(accountConfig.slot, player, distance);
            bot.onConnect = (host, version) => this.handleConnect(accountConfig.slot, host, version);
            bot.onLobbyDetected = (inLobby) => this.handleLobbyDetected(accountConfig.slot, inLobby);
            bot.onInventoryAlert = (msg) => this.handleInventoryAlert(msg);

            this.bots.set(accountConfig.slot, bot);
            logger.info(`Registered slot ${accountConfig.slot} for ${accountConfig.username}`);
        }

        logger.info(`Bot Manager initialized with ${this.bots.size} accounts`);
    }

    handleLobbyDetected(slot, inLobby) {
        const emoji = inLobby ? '🏢' : '✅';
        const statusTR = inLobby ? 'Lobby tespit edildi! Sunucu bakımda olabilir. Bekleniyor...' : 'Lobby\'den döndü! Normal operasyon devam ediyor.';
        const htmlMsg = `${emoji} <b>Slot ${slot}:</b> ${statusTR}`;
        const discordMsg = `${emoji} **Slot ${slot}:** ${statusTR}`;
        logger.warn(`Slot ${slot}: ${statusTR}`);
        if (this.telegramBot && this.telegramBot.bot) {
            for (const userId of this.config.telegram.allowedUsers) {
                this.telegramBot.bot.telegram.sendMessage(userId, htmlMsg, { parse_mode: 'HTML' }).catch(() => { });
            }
        }
        if (this.discordBot) {
            this.discordBot.sendAlert(discordMsg);
        }
    }

    handleInventoryAlert(message) {
        logger.warn(message);
        this.broadcastMessage(message);
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

        for (const bot of this.bots.values()) {
            promises.push(bot.start());
        }

        await Promise.all(promises);
        logger.info('All bots started');
    }

    async stopAll() {
        logger.info('Stopping all bots');
        const promises = [];

        for (const bot of this.bots.values()) {
            promises.push(bot.stop());
        }

        await Promise.all(promises);
        logger.info('All bots stopped');
    }

    async restartAll() {
        logger.info('Restarting all bots');
        await this.stopAll();
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.startAll();
    }

    async addAccount(platform, userId) {
        const existingSlots = Array.from(this.bots.keys());
        const newSlot = existingSlots.length > 0 ? Math.max(...existingSlots) + 1 : 1;

        const initMessage = `🚀 **Initializing New Account**\nSlot: ${newSlot}\nStatus: Waiting for Microsoft Auth...`;
        this.sendPlatformMessage(platform, userId, initMessage);

        const tempConfig = {
            slot: newSlot,
            username: `New_Account_${newSlot}`, // Temporary
            auth: 'microsoft',
            onMsaCode: (data) => {
                const codeMessage = `🔐 **Microsoft Authentication Required**\n\n1. Go to: ${data.verification_uri}\n2. Enter Code: **${data.user_code}**\n\nThe bot will start automatically after login.`;
                this.sendPlatformMessage(platform, userId, codeMessage);
                logger.info(`[Slot ${newSlot}] Auth Code: ${data.user_code}`);
            }
        };

        const bot = new MinecraftBot(this.config, tempConfig);

        // Hook into login event to save config
        bot.onConnect = async (host, version) => {
            const username = bot.bot.username;
            logger.info(`[Slot ${newSlot}] Successfully authenticated as ${username}`);

            const successMessage = `✅ **Authentication Successful!**\nUser: **${username}**\nSlot: ${newSlot}\nAdded to configuration.`;
            this.sendPlatformMessage(platform, userId, successMessage);

            // Save to config
            this.config.minecraft.accounts.push({
                username: username,
                auth: 'microsoft',
                slot: newSlot
            });
            await this.saveConfig();

            // Stop temp bot, rename session folder, create permanent bot
            await bot.stop();

            try {
                await new Promise(resolve => setTimeout(resolve, 1000));

                const oldPath = path.resolve(`./sessions/New_Account_${newSlot}`);
                const newPath = path.resolve(`./sessions/${username}`);

                try {
                    await fs.rm(newPath, { recursive: true, force: true });
                } catch (e) { /* ignore */ }

                await fs.rename(oldPath, newPath);
                logger.info(`[Slot ${newSlot}] Renamed session folder to ${username}`);
            } catch (err) {
                logger.error(`[Slot ${newSlot}] Failed to rename session folder: ${err.message}`);
            }

            // Create new bot instance with correct session path
            const realAccountConfig = this.config.minecraft.accounts.find(a => a.slot === newSlot);

            const newBot = new MinecraftBot(this.config, realAccountConfig);
            newBot.onProximityAlert = (p, d) => this.handleProximityAlert(newSlot, p, d);
            newBot.onConnect = (h, v) => this.handleConnect(newSlot, h, v);
            newBot.onLobbyDetected = (inLobby) => this.handleLobbyDetected(newSlot, inLobby);
            newBot.onInventoryAlert = (msg) => this.handleInventoryAlert(msg);

            this.bots.set(newSlot, newBot);

            try {
                await newBot.start();
                this.handleConnect(newSlot, this.config.minecraft.server.host, this.config.minecraft.server.version);
            } catch (e) {
                logger.error(`Failed to restart bot with new session: ${e.message}`);
                this.sendPlatformMessage(platform, userId, `❌ Failed to restart with saved session: ${e.message}`);
            }
        };

        this.bots.set(newSlot, bot);

        try {
            await bot.start();
            return { success: true, message: `Auth process started for slot ${newSlot}` };
        } catch (error) {
            this.bots.delete(newSlot);
            return { success: false, message: `Failed to start auth process: ${error.message}` };
        }
    }

    async removeAccount(slot) {
        const slotNum = parseInt(slot);
        if (!this.bots.has(slotNum)) {
            return { success: false, message: `Slot ${slotNum} not found.` };
        }

        const botToRemove = this.bots.get(slotNum);
        await botToRemove.stop();
        this.bots.delete(slotNum);

        // Remove from config array
        this.config.minecraft.accounts = this.config.minecraft.accounts.filter(acc => acc.slot !== slotNum);

        // Shift subsequent slots down
        const botsToShift = [];
        this.bots.forEach(bot => {
            if (bot.slot > slotNum) botsToShift.push(bot);
        });
        botsToShift.sort((a, b) => a.slot - b.slot);

        let shiftedCount = 0;
        for (const bot of botsToShift) {
            const oldSlot = bot.slot;
            const newSlot = oldSlot - 1;

            const configAcc = this.config.minecraft.accounts.find(a => a.slot === oldSlot);
            if (configAcc) configAcc.slot = newSlot;

            this.bots.delete(oldSlot);
            bot.slot = newSlot;
            bot.accountConfig.slot = newSlot;
            this.bots.set(newSlot, bot);
            shiftedCount++;
        }

        await this.saveConfig();

        let message = `Account in slot ${slotNum} removed.`;
        if (shiftedCount > 0) {
            message += ` ${shiftedCount} subsequent account(s) shifted down.`;
        }

        return { success: true, message: message };
    }

    getAccountList() {
        if (!this.config.minecraft.accounts?.length) return [];

        // Sort by slot
        return [...this.config.minecraft.accounts]
            .sort((a, b) => a.slot - b.slot)
            .map(acc => {
                const bot = this.bots.get(acc.slot);
                return {
                    slot: acc.slot,
                    username: acc.username,
                    status: bot ? bot.status : 'stopped'
                };
            });
    }

    sendPlatformMessage(platform, userId, message) {
        if (platform === 'telegram' && this.telegramBot?.bot) {
            this.telegramBot.bot.telegram.sendMessage(userId, this._mdToHtml(message), { parse_mode: 'HTML' })
                .catch(e => logger.error(`TG Send Error: ${e.message}`));
        } else if (platform === 'discord' && this.discordBot) {
            if (userId && typeof userId.send === 'function') {
                userId.send(message).catch(e => logger.error(`DS Send Error: ${e.message}`));
            } else {
                this.discordBot.sendAlert(message);
            }
        } else {
            logger.info(`[Config Action] ${message}`);
        }
    }


    async sendMessage(slots, message) {
        const results = [];

        for (const slot of slots) {
            const bot = this.bots.get(slot);
            if (bot) {
                const success = await bot.sendChat(message);
                results.push({ slot, success });
            } else {
                results.push({ slot, success: false, error: 'Slot not found' });
            }
        }

        return results;
    }

    async sendMessageToAll(message) {
        const slots = Array.from(this.bots.keys());
        return await this.sendMessage(slots, message);
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

    getBotStats(slot) {
        const bot = this.bots.get(slot);
        if (!bot) return null;
        return bot.getStats();
    }

    getAllStats() {
        const stats = [];
        for (const [slot, bot] of this.bots) {
            stats.push(bot.getStats());
        }
        return stats;
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
            const configPath = path.resolve('config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 4));
            logger.info('Configuration saved');
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

    async toggleProtection(slot) {
        // 1. Update config first (persistence)
        const accountConfig = this.config.minecraft.accounts.find(acc => acc.slot === slot);
        if (!accountConfig) {
            return { success: false, message: `Slot ${slot} not found in configuration.` };
        }

        // Toggle state (default to config setting if undefined)
        const currentGlobal = this.config.settings.protection?.enabled || false;
        const currentState = accountConfig.protectionEnabled !== undefined ? accountConfig.protectionEnabled : currentGlobal;
        const newState = !currentState;

        accountConfig.protectionEnabled = newState;

        try {
            await this.saveConfig();
        } catch (error) {
            logger.error(`Failed to save protection state for slot ${slot}: ${error.message}`);
            return { success: false, message: 'Failed to save configuration.' };
        }

        // 2. Update running bot if exists
        const bot = this.bots.get(slot);
        if (bot) {
            bot.toggleProtection(newState);
        }

        return {
            success: true,
            message: `Protection for Slot ${slot} is now ${newState ? 'VP AÇIK' : 'VP KAPALI'} (kaydedildi).`,
            enabled: newState
        };
    }
}
