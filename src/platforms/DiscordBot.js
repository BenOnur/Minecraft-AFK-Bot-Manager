import { Client, GatewayIntentBits, EmbedBuilder, Events } from 'discord.js';
import { CommandHandler } from '../commands/CommandHandler.js';
import { Auth } from '../utils/Auth.js';
import logger from '../utils/Logger.js';

export class DiscordBot {
    constructor(config, botManager) {
        this.config = config;
        this.botManager = botManager;
        this.commandHandler = new CommandHandler(botManager);
        this.auth = new Auth(config);
        this.client = null;
    }

    async start() {
        if (!this.config.discord.enabled) {
            logger.info('Discord bot is disabled');
            return;
        }

        if (!this.config.discord.token || this.config.discord.token === 'YOUR_DISCORD_BOT_TOKEN_HERE') {
            logger.warn('Discord token not configured. Skipping Discord bot.');
            return;
        }

        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent
                ]
            });

            this.client.on(Events.ClientReady, () => {
                logger.info(`Discord bot logged in as ${this.client.user.tag}`);
            });

            this.client.on('messageCreate', async (message) => {
                // Ignore bot messages
                if (message.author.bot) return;

                // Only process commands
                if (!message.content.startsWith('!')) return;

                // Authorization check
                if (!this.auth.isDiscordUserAuthorized(message.author.id, message.guildId)) {
                    logger.warn(`Unauthorized Discord user: ${message.author.id} (${message.author.tag})`);
                    await message.reply('❌ You are not authorized to use this bot.');
                    return;
                }

                logger.info(`Discord command from ${message.author.tag}: ${message.content}`);

                try {
                    // Send command with '/' prefix to maintain compatibility with CommandParser
                    const commandContent = '/' + message.content.substring(1);
                    const result = await this.commandHandler.handleCommand(commandContent, 'discord', message.author);
                    await this.sendResponse(message, result);
                } catch (error) {
                    logger.error(`Discord command error: ${error.message}`);
                    await message.reply(`❌ Error: ${error.message}`);
                }
            });

            await this.client.login(this.config.discord.token);
            logger.info('Discord bot started successfully');

        } catch (error) {
            logger.error(`Failed to start Discord bot: ${error.message}`);
        }
    }

    async sendResponse(message, result) {
        if (!result) {
            await message.reply('❌ No response');
            return;
        }

        if (result.type === 'embed' && result.data) {
            const embed = new EmbedBuilder(result.data);
            await message.reply({ embeds: [embed] });
            return;
        }

        // Status komutu için embed kullan
        if (result.data && Array.isArray(result.data) && result.data[0]?.slot) {
            const embed = this.createStatusEmbed(result.data);
            await message.reply({ embeds: [embed] });
            return;
        }

        // Tek bot status için
        if (result.data && result.data.slot) {
            const embed = this.createSingleStatusEmbed(result.data);
            await message.reply({ embeds: [embed] });
            return;
        }

        // Inventory için
        if (result.data && Array.isArray(result.data) && result.data[0]?.name) {
            const embed = this.createInventoryEmbed(result.data, result.message);
            await message.reply({ embeds: [embed] });
            return;
        }

        // Normal mesaj
        const emoji = result.success ? '✅' : '❌';
        await message.reply(`${emoji} ${result.message}`);
    }

    createStatusEmbed(statuses) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Status')
            .setColor(0x0099FF)
            .setTimestamp();

        for (const status of statuses) {
            const emoji = this.getStatusEmoji(status.status);
            const pausedText = status.isPaused ? ' (PAUSED)' : '';
            const value = `Status: ${status.status}${pausedText}\nUsername: ${status.username}`;

            embed.addFields({
                name: `${emoji} Slot ${status.slot}`,
                value: value,
                inline: true
            });
        }

        return embed;
    }

    createSingleStatusEmbed(status) {
        const emoji = this.getStatusEmoji(status.status);
        const embed = new EmbedBuilder()
            .setTitle(`${emoji} Slot ${status.slot} Status`)
            .setColor(this.getStatusColor(status.status))
            .setTimestamp();

        embed.addFields(
            { name: 'Username', value: status.username, inline: true },
            { name: 'Status', value: status.status, inline: true },
            { name: 'Paused', value: status.isPaused ? 'Yes' : 'No', inline: true }
        );

        if (status.health !== undefined) {
            embed.addFields(
                { name: 'Health', value: `${status.health}/20`, inline: true },
                { name: 'Food', value: `${status.food}/20`, inline: true }
            );
        }

        if (status.position) {
            const pos = `${Math.floor(status.position.x)}, ${Math.floor(status.position.y)}, ${Math.floor(status.position.z)}`;
            embed.addFields({ name: 'Position', value: pos, inline: false });
        }

        return embed;
    }

    createInventoryEmbed(items, title) {
        const embed = new EmbedBuilder()
            .setTitle('🎒 ' + title)
            .setColor(0x00FF00)
            .setTimestamp();

        if (items.length === 0) {
            embed.setDescription('Inventory is empty');
            return embed;
        }

        let description = '';
        for (const item of items.slice(0, 25)) { // Discord limit 25 fields
            description += `• ${item.count}x ${item.name}\n`;
        }

        embed.setDescription(description);

        if (items.length > 25) {
            embed.setFooter({ text: `... and ${items.length - 25} more items` });
        }

        return embed;
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

    getStatusColor(status) {
        switch (status) {
            case 'online': return 0x00FF00;  // Green
            case 'offline': return 0x808080; // Gray
            case 'error': return 0xFF0000;   // Red
            case 'kicked': return 0xFFA500;  // Orange
            default: return 0xFFFFFF;        // White
        }
    }

    async sendAlert(message) {
        if (!this.client || !this.config.discord.allowedUsers) return;

        for (const userId of this.config.discord.allowedUsers) {
            try {
                const user = await this.client.users.fetch(userId);
                if (user) {
                    await user.send(message);
                }
            } catch (error) {
                logger.error(`Failed to send alert to Discord user ${userId}: ${error.message}`);
            }
        }
    }

    async stop() {
        if (this.client) {
            await this.client.destroy();
            logger.info('Discord bot stopped');
        }
    }
}
