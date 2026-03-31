import { Client, GatewayIntentBits, EmbedBuilder, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
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

        // Log streaming state
        this.isLogStreaming = false;
        this.logStreamChannelId = null;
        this.logBuffer = [];
        this.logFlushInterval = null;
        this.logCallback = this.handleLog.bind(this);
    }

    // Define slash commands
    async registerSlashCommands() {
        const rest = new REST({ version: '10' }).setToken(this.config.discord.token);

        const commands = [
            new SlashCommandBuilder()
                .setName('status')
                .setDescription('Bot durumlarını göster')
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot numarası').setRequired(false)),
            new SlashCommandBuilder()
                .setName('start')
                .setDescription('Botu başlat')
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot numarası').setRequired(true)),
            new SlashCommandBuilder()
                .setName('stop')
                .setDescription('Botu durdur')
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot numarası').setRequired(true)),
            new SlashCommandBuilder()
                .setName('restart')
                .setDescription('Botu yeniden başlat')
                .addStringOption(opt => opt.setName('slot').setDescription('Slot veya "all"').setRequired(true)),
            new SlashCommandBuilder()
                .setName('inv')
                .setDescription('Envanter görüntüle')
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot numarası').setRequired(true)),
            new SlashCommandBuilder()
                .setName('stats')
                .setDescription('Bot istatistikleri')
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot numarası').setRequired(false)),
            new SlashCommandBuilder()
                .setName('say')
                .setDescription('Slota mesaj gönder')
                .addStringOption(opt => opt.setName('slot').setDescription('Slot(lar)').setRequired(true))
                .addStringOption(opt => opt.setName('mesaj').setDescription('Mesaj').setRequired(true)),
            new SlashCommandBuilder()
                .setName('all')
                .setDescription('Tüm botlara mesaj gönder')
                .addStringOption(opt => opt.setName('mesaj').setDescription('Mesaj').setRequired(true)),
            new SlashCommandBuilder()
                .setName('whitelist')
                .setDescription('Whitelist yönetimi')
                .addStringOption(opt => opt.setName('islem').setDescription('add, remove veya list').setRequired(true))
                .addStringOption(opt => opt.setName('oyuncu').setDescription('Oyuncu adı').setRequired(false)),
            new SlashCommandBuilder()
                .setName('protect')
                .setDescription('Spawner korumasını aç/kapat')
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot numarası').setRequired(true)),
            new SlashCommandBuilder()
                .setName('afkset')
                .setDescription('AFK noktası ve yakın spawnerları kaydet')
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot numarası').setRequired(true)),
            new SlashCommandBuilder()
                .setName('logs')
                .setDescription('Log akışını aç/kapat')
                .addChannelOption(opt => opt.setName('kanal').setDescription('Log kanalı').setRequired(false)),
            new SlashCommandBuilder()
                .setName('help')
                .setDescription('Yardım menüsünü göster')
        ].map(cmd => cmd.toJSON());

        try {
            if (this.config.discord.guildId) {
                await rest.put(
                    Routes.applicationGuildCommands(this.client.user.id, this.config.discord.guildId),
                    { body: commands }
                );
                logger.info(`Discord: ${commands.length} slash komutu kaydedildi (guild: ${this.config.discord.guildId})`);
            } else {
                await rest.put(
                    Routes.applicationCommands(this.client.user.id),
                    { body: commands }
                );
                logger.info(`Discord: ${commands.length} global slash komutu kaydedildi`);
            }
        } catch (err) {
            logger.error(`Discord slash komut kayıt hatası: ${err.message}`);
        }
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

            this.client.on(Events.ClientReady, async () => {
                logger.info(`Discord bot logged in as ${this.client.user.tag}`);

                // Register slash commands
                await this.registerSlashCommands();

                // Otomatik log başlatma
                if (this.config.discord.logChannelId) {
                    logger.info(`Discord: Otomatik log akışı başlatılıyor (Kanal: ${this.config.discord.logChannelId})`);
                    this.startLogStream(this.config.discord.logChannelId);
                }
            });

            this.client.on('messageCreate', async (message) => {
                if (message.author.bot) return;

                // Handle !logs toggle
                if (message.content === '!logs') {
                    if (!this.auth.isDiscordUserAuthorized(message.author.id, message.guildId)) return;

                    if (this.isLogStreaming) {
                        this.stopLogStream();
                        await message.reply('🛑 Log akışı durduruldu.');
                    } else {
                        const channelId = this.config.discord.logChannelId || message.channel.id;
                        this.startLogStream(channelId);
                        await message.reply(`▶️ Log akışı başlatıldı (Kanal: <#${channelId}>).`);
                    }
                    return;
                }

                if (!message.content.startsWith('!') && !message.content.startsWith('/')) return;

                if (!this.auth.isDiscordUserAuthorized(message.author.id, message.guildId)) {
                    await message.reply('❌ You are not authorized to use this bot.');
                    return;
                }

                try {
                    const commandContent = '/' + message.content.substring(1);
                    const result = await this.commandHandler.handleCommand(commandContent, 'discord', message.author);
                    await this.sendResponse(message, result);
                } catch (error) {
                    logger.error(`Discord command error: ${error.message}`);
                    await message.reply(`❌ Error: ${error.message}`);
                }
            });

            // Slash command handler
            this.client.on('interactionCreate', async (interaction) => {
                if (!interaction.isChatInputCommand()) return;

                if (!this.auth.isDiscordUserAuthorized(interaction.user.id, interaction.guildId)) {
                    await interaction.reply({ content: '❌ Yetkin yok.', ephemeral: true });
                    return;
                }

                const { commandName, options } = interaction;

                try {
                    let commandContent = '/' + commandName;
                    const args = [];

                    // Map slash command options to args array
                    if (commandName === 'status') {
                        const slot = options.getInteger('slot');
                        if (slot) args.push(slot.toString());
                    } else if (commandName === 'start' || commandName === 'stop' || commandName === 'inv' || commandName === 'protect' || commandName === 'afkset') {
                        args.push(options.getInteger('slot').toString());
                    } else if (commandName === 'restart') {
                        args.push(options.getString('slot'));
                    } else if (commandName === 'stats') {
                        const slot = options.getInteger('slot');
                        if (slot) args.push(slot.toString());
                    } else if (commandName === 'say') {
                        args.push(options.getString('slot'));
                        args.push(options.getString('mesaj'));
                    } else if (commandName === 'all') {
                        args.push(options.getString('mesaj'));
                    } else if (commandName === 'whitelist') {
                        args.push(options.getString('islem'));
                        const oyuncu = options.getString('oyuncu');
                        if (oyuncu) args.push(oyuncu);
                    } else if (commandName === 'logs') {
                        const kanal = options.getChannel('kanal');
                        if (kanal) {
                            if (this.isLogStreaming) {
                                this.stopLogStream();
                                await interaction.reply('🛑 Log akışı durduruldu.');
                            } else {
                                this.startLogStream(kanal.id);
                                await interaction.reply(`▶️ Log akışı başlatıldı (Kanal: <#${kanal.id}>).`);
                            }
                            return;
                        } else {
                            // Toggle
                            if (this.isLogStreaming) {
                                this.stopLogStream();
                                await interaction.reply('🛑 Log akışı durduruldu.');
                            } else {
                                await interaction.reply('❌ Log akışı için kanal belirtin veya önce bir kanala log başlatın.');
                            }
                            return;
                        }
                    } else if (commandName === 'help') {
                        // Handle help
                        const result = await this.commandHandler.handleCommand('/help', 'discord', interaction.user);
                        await this.sendResponse(interaction, result);
                        return;
                    }

                    const result = await this.commandHandler.handleCommand(commandContent + (args.length ? ' ' + args.join(' ') : ''), 'discord', interaction.user);
                    await this.sendResponse(interaction, result);
                } catch (error) {
                    logger.error(`Discord slash command error: ${error.message}`);
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ content: `Error: ${error.message}`, ephemeral: true });
                    } else {
                        await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
                    }
                }
            });

            await this.client.login(this.config.discord.token);
            logger.info('Discord bot started successfully');

        } catch (error) {
            logger.error(`Failed to start Discord bot: ${error.message}`);
        }
    }

    async sendResponse(target, result) {
        // target can be a Message (prefix commands) or Interaction (slash commands)
        const isInteraction =
            typeof target.followUp === 'function' &&
            typeof target.reply === 'function' &&
            'replied' in target;

        const reply = async (payload) => {
            if (isInteraction) {
                if (target.deferred || target.replied) {
                    await target.followUp(payload);
                } else {
                    await target.reply(payload);
                }
            } else {
                await target.reply(payload);
            }
        };

        if (!result) {
            await reply({ content: 'No response' });
            return;
        }

        if (result.type === 'embed' && result.data) {
            const embed = new EmbedBuilder(result.data);
            await reply({ embeds: [embed] });
            return;
        }

        // Status command embed
        if (result.data && Array.isArray(result.data) && result.data[0]?.slot) {
            const embed = result.data[0]?.status !== undefined
                ? this.createStatusEmbed(result.data)
                : this.createInventoryEmbed(result.data, result.message);
            await reply({ embeds: [embed] });
            return;
        }

        // Tek status objesi
        if (result.data?.slot && result.data?.status) {
            const embed = this.createSingleStatusEmbed(result.data);
            await reply({ embeds: [embed] });
            return;
        }

        // Normal message
        const prefix = result.success ? '[OK]' : '[ERROR]';
        await reply({ content: `${prefix} ${result.message}` });
    }

    createStatusEmbed(statuses) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Durumları')
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: `Toplam ${statuses.length} bot` });

        for (const status of statuses) {
            const emoji = this.getStatusEmoji(status.status);
            const protectText = status.protectionEnabled ? 'AÇIK' : 'KAPALI';
            let value = `📶 **${status.status}**\n👤 ${status.username}\n🛡️ Koruma: **${protectText}**`;
            if (status.health !== undefined) {
                value += `\n💗 ${Math.round(status.health)}/20 🍗 ${Math.round(status.food)}/20`;
            }
            if (status.position) {
                value += `\n📍 \`${Math.floor(status.position.x)}, ${Math.floor(status.position.y)}, ${Math.floor(status.position.z)}\``;
            }

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
            .setTitle(`${emoji} Slot ${status.slot} — ${status.username}`)
            .setColor(this.getStatusColor(status.status))
            .setTimestamp();

        embed.addFields(
            { name: '📶 Durum', value: status.status, inline: true },
            { name: '🛡️ Koruma', value: status.protectionEnabled ? 'AÇIK' : 'KAPALI', inline: true }
        );

        if (status.health !== undefined) {
            embed.addFields(
                { name: '💗 Can', value: `${Math.round(status.health)}/20`, inline: true },
                { name: '🍗 Açlık', value: `${Math.round(status.food)}/20`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true }
            );
        }

        if (status.position) {
            const pos = `\`${Math.floor(status.position.x)}, ${Math.floor(status.position.y)}, ${Math.floor(status.position.z)}\``;
            embed.addFields({ name: '📍 Konum', value: pos, inline: false });
        }

        if (status.reconnectAttempts > 0) {
            embed.addFields({ name: '🔄 Reconnect Denemesi', value: `${status.reconnectAttempts}`, inline: true });
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
        if (!this.client || !this.client.isReady() || !this.config.discord.allowedUsers) return;

        for (const userId of this.config.discord.allowedUsers) {
            try {
                const user = await this.client.users.fetch(userId);
                if (user) {
                    await user.send(`<@${userId}>\n${message}`);
                }
            } catch (error) {
                logger.error(`Failed to send alert to Discord user ${userId}: ${error.message}`);
            }
        }
    }

    handleLog(message) {
        if (!this.isLogStreaming || !this.logStreamChannelId) return;
        this.logBuffer.push(message);
    }

    async startLogStream(channelId) {
        this.isLogStreaming = true;
        this.logStreamChannelId = channelId;
        this.logBuffer = [];

        logger.addStream(this.logCallback);

        this.logFlushInterval = setInterval(async () => {
            if (this.logBuffer.length > 0 && this.client) {
                const logsToSend = this.logBuffer.join('\n');
                this.logBuffer = [];

                try {
                    const channel = await this.client.channels.fetch(this.logStreamChannelId);
                    if (!channel) {
                        this.stopLogStream();
                        return;
                    }

                    const chunks = logsToSend.match(/[\s\S]{1,1900}/g) || [];
                    for (const chunk of chunks) {
                        await channel.send(`\`\`\`\n${chunk}\n\`\`\``);
                    }
                } catch (error) {
                    console.error('Failed to send log chunk to Discord:', error.message);
                    this.stopLogStream();
                }
            }
        }, 2000);
    }

    stopLogStream() {
        this.isLogStreaming = false;
        this.logStreamChannelId = null;
        this.logBuffer = [];

        if (this.logFlushInterval) {
            clearInterval(this.logFlushInterval);
            this.logFlushInterval = null;
        }

        logger.removeStream(this.logCallback);
    }

    async stop() {
        if (this.client) {
            await this.client.destroy();
            logger.info('Discord bot stopped');
        }
    }
}
