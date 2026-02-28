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

        // Log streaming state
        this.isLogStreaming = false;
        this.logStreamChatId = null;
        this.logBuffer = [];
        this.logFlushInterval = null;
        this.logCallback = this.handleLog.bind(this);
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

            // Handle /logs command specifically (outside commandHandler cause it needs state)
            this.bot.command('logs', async (ctx) => {
                if (!this.auth.isTelegramUserAuthorized(ctx.from.id)) return;

                if (this.isLogStreaming) {
                    this.stopLogStream();
                    await ctx.reply('🛑 Log streaming stopped.');
                } else {
                    this.startLogStream(ctx.chat.id);
                    await ctx.reply('▶️ Log streaming started. Logs will be sent here in batches.');
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
            // Signal handling is managed by index.js
            // process.once('SIGINT', () => this.bot.stop('SIGINT'));
            // process.once('SIGTERM', () => this.bot.stop('SIGTERM'));

        } catch (error) {
            logger.error(`Failed to start Telegram bot: ${error.message}`);
        }
    }

    // Escape HTML special characters to prevent parse errors
    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>');
    }

    async sendResponse(ctx, result) {
        if (!result) {
            await ctx.reply('❌ No response');
            return;
        }

        let message = result.success ? '✅ ' : '❌ ';
        // Convert **bold** markdown to HTML <b> tags for Telegram
        message += this.mdToHtml(result.message);

        // Status or inventory formatting
        if (result.data) {
            if (Array.isArray(result.data) && result.data.length > 0 && result.data[0].status !== undefined) {
                message += '\n\n';
                for (const status of result.data) {
                    message += this.formatStatusLine(status) + '\n';
                }
            } else if (Array.isArray(result.data)) {
                message += '\n\n' + this.formatInventory(result.data);
            } else if (result.data.slot && result.data.status) {
                message += '\n\n' + this.formatStatusDetailed(result.data);
            }
        }

        const options = result.parseOptions || { parse_mode: 'HTML' };
        try {
            await ctx.reply(message, options);
        } catch (err) {
            // Fallback: send without formatting if parse error
            logger.error(`Telegram reply error: ${err.message}`);
            await ctx.reply(message.replace(/<[^>]+>/g, ''));
        }
    }

    // Convert **bold** and `code` markdown to HTML for Telegram
    mdToHtml(text) {
        if (!text) return '';
        return this.escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
    }

    formatStatusLine(status) {
        const emoji = this.getStatusEmoji(status.status);
        const pausedText = status.isPaused ? ' ⏸' : '';
        let line = `${emoji} <b>Slot ${status.slot}</b>${pausedText} — ${this.escapeHtml(status.username)}`;
        if (status.health !== undefined) {
            line += ` | 💗 ${Math.round(status.health)} 🍗 ${Math.round(status.food)}`;
        }
        return line;
    }

    formatStatusDetailed(status) {
        const emoji = this.getStatusEmoji(status.status);
        let text = `${emoji} <b>Slot ${status.slot}</b> — ${this.escapeHtml(status.username)}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n`;
        text += `📶 Durum: <b>${this.escapeHtml(status.status)}</b>\n`;
        text += `⏸ Duraklatıldı: <b>${status.isPaused ? 'Evet' : 'Hayır'}</b>\n`;

        if (status.health !== undefined) {
            const healthBar = '❤️'.repeat(Math.min(10, Math.round(status.health / 2)));
            text += `💗 Can: <b>${Math.round(status.health)}/20</b> ${healthBar}\n`;
            text += `🍗 Açlık: <b>${Math.round(status.food)}/20</b>\n`;
        }

        if (status.position) {
            text += `📍 Konum: <code>${Math.floor(status.position.x)}, ${Math.floor(status.position.y)}, ${Math.floor(status.position.z)}</code>\n`;
        }

        if (status.reconnectAttempts > 0) {
            text += `🔄 Reconnect Denemesi: <b>${status.reconnectAttempts}</b>\n`;
        }

        return text;
    }

    formatInventory(items) {
        if (items.length === 0) return 'Envanter boş';

        const getCategory = (slot) => {
            if (slot === 45) return '🛡️ Off-hand';
            if (slot >= 5 && slot <= 8) return '👕 Zırh';
            if (slot >= 36 && slot <= 44) return '🔥 Hotbar';
            return '🎒 Ana Envanter';
        };

        const getSlotName = (slot) => {
            if (slot >= 36 && slot <= 44) return `Hotbar ${slot - 35}`;
            if (slot === 45) return 'Off-hand';
            const armorNames = { 5: 'Kask', 6: 'Zırh', 7: 'Pantolon', 8: 'Bot' };
            return armorNames[slot] || `Slot ${slot}`;
        };

        const categories = {};

        for (const item of items) {
            const cat = getCategory(item.slot);
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(item);
        }

        let text = '📦 <b>Envanter Detayları</b>\n';

        for (const [cat, catItems] of Object.entries(categories)) {
            if (catItems.length > 0) {
                text += `\n<b>${cat}</b>\n`;
                for (const item of catItems) {
                    text += `• ${item.count}x <code>${this.escapeHtml(item.name)}</code> (${getSlotName(item.slot)})\n`;
                }
            }
        }

        if (text === '📦 <b>Envanter Detayları</b>\n') return 'Envanter boş';

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
        this.stopLogStream();
        if (this.bot) {
            this.bot.stop();
            logger.info('Telegram bot stopped');
        }
    }

    handleLog(message) {
        if (!this.isLogStreaming) return;
        this.logBuffer.push(message);
    }

    startLogStream(chatId) {
        this.isLogStreaming = true;
        this.logStreamChatId = chatId;
        this.logBuffer = [];

        // Subscribe to logger
        logger.addStream(this.logCallback);

        // Start flush interval (every 2 seconds)
        this.logFlushInterval = setInterval(() => {
            if (this.logBuffer.length > 0 && this.bot) {
                const logsToSend = this.logBuffer.join('\n');
                this.logBuffer = []; // Clear buffer immediately

                // Split if too long (Telegram limit 4096 chars)
                const chunks = logsToSend.match(/[\s\S]{1,4000}/g) || [];

                for (const chunk of chunks) {
                    this.bot.telegram.sendMessage(this.logStreamChatId, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' })
                        .catch(err => {
                            console.error('Failed to send log chunk to Telegram:', err.message);
                            // If error is related to chat not found or blocked, stop stream?
                            if (err.message.includes('blocked') || err.message.includes('not found')) {
                                this.stopLogStream();
                            }
                        });
                }
            }
        }, 2000);
    }

    stopLogStream() {
        this.isLogStreaming = false;
        this.logStreamChatId = null;
        this.logBuffer = [];

        if (this.logFlushInterval) {
            clearInterval(this.logFlushInterval);
            this.logFlushInterval = null;
        }

        // Unsubscribe from logger
        logger.removeStream(this.logCallback);
    }
}
