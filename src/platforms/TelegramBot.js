import { Telegraf } from 'telegraf';
import { CommandHandler } from '../commands/CommandHandler.js';
import { Auth } from '../utils/Auth.js';
import logger from '../utils/Logger.js';

export class TelegramBot {
    constructor(config, botManager) {
        this.config = config;
        this.botManager = botManager;
        this.commandHandler = new CommandHandler(botManager);
        this.auth = new Auth(config);
        this.bot = null;
    }

    async start() {
        if (!this.config.telegram.enabled) {
            logger.info('Telegram bot is disabled');
            return;
        }

        if (!this.config.telegram.token || this.config.telegram.token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
            logger.warn('Telegram token not configured. Skipping Telegram bot.');
            return;
        }

        try {
            this.bot = new Telegraf(this.config.telegram.token);

            // Authorization middleware
            this.bot.use(async (ctx, next) => {
                const userId = ctx.from?.id;

                if (!this.auth.isTelegramUserAuthorized(userId)) {
                    logger.warn(`Unauthorized Telegram user: ${userId} (${ctx.from?.username})`);
                    await ctx.reply('❌ You are not authorized to use this bot.');
                    return;
                }

                return next();
            });

            // Command handler
            this.bot.on('text', async (ctx) => {
                const text = ctx.message.text;

                if (!text.startsWith('/')) {
                    return;
                }

                logger.info(`Telegram command from ${ctx.from.username}: ${text}`);

                try {
                    const result = await this.commandHandler.handleCommand(text, 'telegram', ctx.from.id);
                    await this.sendResponse(ctx, result);
                } catch (error) {
                    logger.error(`Telegram command error: ${error.message}`);
                    await ctx.reply(`❌ Error: ${error.message}`);
                }
            });

            // Start bot with timeout
            logger.info('Launching Telegram bot...');

            const launchPromise = this.bot.launch();

            // Handle launch result in background
            launchPromise.then(() => {
                logger.info('Telegram bot connected and polling!');
            }).catch(err => {
                logger.error(`Telegram launch failed: ${err.message}`);
                // Retry logic could be added here
            });


            logger.info('Telegram bot launch initiated (background)...');

            // Enable graceful stop
            process.once('SIGINT', () => this.bot.stop('SIGINT'));
            process.once('SIGTERM', () => this.bot.stop('SIGTERM'));

        } catch (error) {
            logger.error(`Failed to start Telegram bot: ${error.message}`);
        }
    }

    async sendResponse(ctx, result) {
        if (!result) {
            await ctx.reply('❌ No response');
            return;
        }

        let message = result.success ? '✅ ' : '❌ ';
        message += result.message;

        // Status komutu için özel formatlama
        if (result.data) {
            if (Array.isArray(result.data)) {
                // Check if it's a status array or inventory array
                const isStatusArray = result.data.length > 0 && result.data[0].status !== undefined;

                if (isStatusArray) {
                    // Tüm botların durumu
                    message += '\n\n';
                    for (const status of result.data) {
                        message += this.formatStatusLine(status) + '\n';
                    }
                } else {
                    // Inventory (or empty array, defaulting to inventory format)
                    message += '\n\n' + this.formatInventory(result.data);
                }
            } else if (result.data.slot && result.data.status) {
                // Tek bot durumu (Wait, inventory items also have slot. Check for status property too)
                message += '\n\n' + this.formatStatusDetailed(result.data);
            }
        }

        await ctx.reply(message, result.parseOptions || {});
    }

    formatStatusLine(status) {
        const emoji = this.getStatusEmoji(status.status);
        const pausedText = status.isPaused ? ' (PAUSED)' : '';
        return `${emoji} Slot ${status.slot}: ${status.status}${pausedText} - ${status.username}`;
    }

    formatStatusDetailed(status) {
        const emoji = this.getStatusEmoji(status.status);
        let text = `${emoji} **Slot ${status.slot}**\n`;
        text += `Username: ${status.username}\n`;
        text += `Status: ${status.status}\n`;
        text += `Paused: ${status.isPaused ? 'Yes' : 'No'}\n`;

        if (status.health !== undefined) {
            text += `Health: ${status.health}/20\n`;
            text += `Food: ${status.food}/20\n`;
        }

        if (status.position) {
            text += `Position: ${Math.floor(status.position.x)}, ${Math.floor(status.position.y)}, ${Math.floor(status.position.z)}\n`;
        }

        return text;
    }

    formatInventory(items) {
        if (items.length === 0) {
            return 'Inventory is empty';
        }

        const armor = items.filter(i => i.slot >= 5 && i.slot <= 8); // Mineflayer slots: 5=helmet, 6=chest, 7=legs, 8=boots (Wait, standard MC protocol is different but mineflayer normalizes. Actually verify slots)
        // Mineflayer: 0-8 hotbar, 9-35 main, 36-39 armor, 45 offhand.
        // Wait, mineflayer 'items()' returns items with their slot index.
        // Let's rely on standard mineflayer slot mappings:
        // 0-8: Hotbar
        // 9-35: Inventory
        // 36-39: Armor (36=boots, 37=legs, 38=chest, 39=helmet) - Note: index might vary by version but this is common
        // 45: Offhand

        // Actually, let's just group them by range.

        // Helper to categorize
        const getCategory = (slot) => {
            if (slot === 45) return '🛡️ Off-hand';
            if (slot >= 5 && slot <= 8) return '👕 Armor';
            if (slot >= 36 && slot <= 44) return '🔥 Hotbar';
            return '🎒 Main Inventory';
        };

        const getItemSlotDetail = (slot) => {
            if (slot >= 36 && slot <= 44) return `Hotbar ${slot - 35}`; // 36->1, 44->9
            if (slot === 45) return 'Off-hand';
            if (slot === 5) return 'Helmet';
            if (slot === 6) return 'Chestplate';
            if (slot === 7) return 'Leggings';
            if (slot === 8) return 'Boots';
            return `Slot ${slot}`;
        };

        const categories = {
            '👕 Armor': [],
            '🛡️ Off-hand': [],
            '🔥 Hotbar': [],
            '🎒 Main Inventory': [],
            'Unknown': []
        };

        for (const item of items) {
            const cat = getCategory(item.slot);
            categories[cat] = categories[cat] || [];
            categories[cat].push(item);
        }

        let text = '📦 **Inventory Details**\n';

        for (const [cat, catItems] of Object.entries(categories)) {
            if (catItems.length > 0) {
                text += `\n**${cat}**\n`;
                for (const item of catItems) {
                    text += `• ${item.count}x ${item.name} _(${getItemSlotDetail(item.slot)})_\n`;
                }
            }
        }

        if (text === '📦 **Inventory Details**\n') return 'Inventory is empty';

        return text;
    }

    getStatusEmoji(status) {
        switch (status) {
            case 'online': return '🟢';
            case 'offline': return '⚫';
            case 'error': return '🔴';
            case 'kicked': return '🟠';
            default: return '⚪';
        }
    }

    async stop() {
        if (this.bot) {
            this.bot.stop();
            logger.info('Telegram bot stopped');
        }
    }
}
