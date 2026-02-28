import { CommandParser } from './CommandParser.js';
import logger from '../utils/Logger.js';

export class CommandHandler {
    constructor(botManager) {
        this.botManager = botManager;
    }

    async handleCommand(commandText, platform = 'generic', userId = null) {
        try {
            const parsed = CommandParser.parseCommand(commandText);
            const { command, args } = parsed;

            logger.info(`Handling command: ${command} with args: ${JSON.stringify(args)} for platform: ${platform}`);

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
                case 'pause':
                    return await this.handlePause(args);
                case 'resume':
                    return await this.handleResume(args);
                case 'inv':
                    return await this.handleInventory(args);
                case 'take':
                    return await this.handleTake(args);
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

    // /say 1 mesaj veya /say 1,3,5 mesaj veya /say 1-3 mesaj
    async handleSay(args) {
        if (args.length < 2) {
            return { success: false, message: '❌ Kullanım: `/say <slot(lar)> <mesaj>`\nÖrnek: `/say 1 merhaba` veya `/say 1-3 merhaba`' };
        }

        const slotArg = args[0];
        const message = args.slice(1).join(' ');

        let slots = CommandParser.parseSlots(slotArg);
        const availableSlots = this.botManager.getAvailableSlots();

        if (slots === 'all') {
            slots = availableSlots;
        }

        const validation = CommandParser.validateSlots(slots, availableSlots);
        if (!validation.valid) {
            return { success: false, message: `❌ Geçersiz slot: ${validation.error}` };
        }

        const results = await this.botManager.sendMessage(validation.slots, message);
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success);

        let msg = `💬 Mesaj gönderildi: **${successful}/${validation.slots.length}** bot\n`;
        msg += `📝 Mesaj: \`${message}\``;
        if (failed.length > 0) {
            msg += `\n⚠️ Başarısız slotlar: ${failed.map(r => r.slot).join(', ')}`;
        }

        return { success: true, message: msg };
    }

    // /all mesaj
    async handleAll(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/all <mesaj>`' };
        }

        const message = args.join(' ');
        const results = await this.botManager.sendMessageToAll(message);
        const successful = results.filter(r => r.success).length;

        return {
            success: true,
            message: `💬 Tüm botlara mesaj gönderildi: **${successful}/${results.length}** bot\n📝 Mesaj: \`${message}\``
        };
    }

    // /status veya /status 1
    async handleStatus(args) {
        if (args.length === 0) {
            const statuses = this.botManager.getAllStatus();
            return {
                success: true,
                message: 'Tüm bot durumları',
                data: statuses
            };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const status = this.botManager.getBotStatus(slot);
        if (!status) {
            return { success: false, message: `❌ Slot **${slot}** bulunamadı` };
        }

        return {
            success: true,
            message: `Slot ${slot} durumu`,
            data: status
        };
    }

    // /restart 1 veya /restart all
    async handleRestart(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/restart <slot|all>`' };
        }

        if (args[0] === 'all') {
            await this.botManager.restartAll();
            return { success: true, message: '🔄 Tüm botlar yeniden başlatılıyor...' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const result = await this.botManager.restartBot(slot);
        return {
            success: result,
            message: result ? `🔄 Slot **${slot}** yeniden başlatılıyor...` : `❌ Slot **${slot}** yeniden başlatılamadı`
        };
    }

    async handleAccount(args, platform, userId) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/account <add|remove|list> [slot]`' };
        }

        const action = args[0].toLowerCase();

        if (action === 'add') {
            return await this.botManager.addAccount(platform, userId);
        } else if (action === 'remove') {
            if (args.length < 2) return { success: false, message: '❌ Kullanım: `/account remove <slot>`' };
            const slot = args[1];
            return await this.botManager.removeAccount(slot);
        } else if (action === 'list') {
            const accounts = this.botManager.getAccountList();
            if (accounts.length === 0) {
                return { success: true, message: '📋 Kayıtlı hesap yok.\n💡 Eklemek için: `/account add`' };
            }

            let message = '📋 **Kayıtlı Hesaplar**\n━━━━━━━━━━━━━━━━━━━━\n';
            accounts.forEach(acc => {
                const statusEmoji = acc.status === 'online' ? '🟢' : (acc.status === 'offline' ? '⚫' : '🔴');
                const pausedText = acc.isPaused ? ' ⏸' : '';
                message += `${statusEmoji} **Slot ${acc.slot}** — ${acc.username}${pausedText}`;
                if (acc.health !== undefined) {
                    message += ` | 💗 ${Math.round(acc.health)} 🍗 ${Math.round(acc.food)}`;
                }
                message += '\n';
            });
            message += `━━━━━━━━━━━━━━━━━━━━\n📊 Toplam: **${accounts.length}** hesap`;
            return { success: true, message };
        } else {
            return { success: false, message: '❌ Bilinmeyen işlem. Kullanım: `add`, `remove` veya `list`' };
        }
    }

    // /stop 1
    async handleStop(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/stop <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const result = await this.botManager.stopBot(slot);
        return {
            success: result,
            message: result ? `⏹️ Slot **${slot}** durduruldu` : `❌ Slot **${slot}** durdurulamadı`
        };
    }

    // /start 1
    async handleStart(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/start <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const result = await this.botManager.startBot(slot);
        return {
            success: result,
            message: result ? `▶️ Slot **${slot}** başlatılıyor...` : `❌ Slot **${slot}** başlatılamadı`
        };
    }

    // /pause 1
    async handlePause(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/pause <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const result = this.botManager.pauseBot(slot);
        return {
            success: result,
            message: result ? `⏸️ Slot **${slot}** duraklatıldı (Anti-AFK devre dışı)` : `❌ Slot **${slot}** duraklatılamadı`
        };
    }

    // /resume 1
    async handleResume(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/resume <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const result = this.botManager.resumeBot(slot);
        return {
            success: result,
            message: result ? `▶️ Slot **${slot}** devam ettiriliyor (Anti-AFK aktif)` : `❌ Slot **${slot}** devam ettirilemedi`
        };
    }

    // /inv 1
    async handleInventory(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/inv <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const inventory = this.botManager.getBotInventory(slot);
        if (!inventory) {
            return { success: false, message: `❌ Slot **${slot}** çevrimdışı veya bulunamadı` };
        }

        return {
            success: true,
            message: `Slot ${slot} envanteri`,
            data: inventory
        };
    }

    // /take 1 spawner 15
    async handleTake(args) {
        if (args.length < 3) {
            return { success: false, message: 'Usage: /take <slot> <item> <count>' };
        }

        const slot = parseInt(args[0]);
        const itemName = args[1];
        const count = parseInt(args[2]);

        if (isNaN(slot) || isNaN(count)) {
            return { success: false, message: 'Invalid slot or count' };
        }

        // Note: "take" fonksiyonu Minecraft'ta genelde bir chest'ten item almak demektir
        // Bu mineflayer ile daha karmaşık olduğundan, şimdilik basit bir mesaj döndürelim
        return {
            success: false,
            message: 'Take command not yet implemented - requires chest interaction logic'
        };
    }

    // /drop 1 all veya /drop 1 diamond 5
    async handleDrop(args) {
        if (args.length < 2) {
            return { success: false, message: 'Usage: /drop <slot> <item|all> [count]' };
        }

        const slot = parseInt(args[0]);
        const itemName = args[1];
        const count = args.length > 2 ? parseInt(args[2]) : null;

        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const result = await this.botManager.dropItem(slot, itemName, count);

        // BotManager now returns { success, message } from MinecraftBot
        if (typeof result === 'object' && result.message) {
            return result;
        }

        return {
            success: result,
            message: result ? `Dropped ${itemName} from slot ${slot}` : `Failed to drop item`
        };
    }

    // /forward 1 5
    async handleMove(args, direction) {
        const dirEmoji = { forward: '⬆️', back: '⬇️', left: '⬅️', right: '➡️' };
        const dirTR = { forward: 'ileri', back: 'geri', left: 'sola', right: 'sağa' };

        if (args.length < 2) {
            return { success: false, message: `❌ Kullanım: \`/${direction === 'back' ? 'backward' : direction} <slot> <blok>\`` };
        }

        const slotArg = args[0];
        const distance = parseInt(args[1]);

        if (isNaN(distance)) {
            return { success: false, message: '❌ Geçersiz mesafe değeri' };
        }

        let slots = CommandParser.parseSlots(slotArg);
        const availableSlots = this.botManager.getAvailableSlots();

        if (slots === 'all') {
            slots = availableSlots;
        }

        const validation = CommandParser.validateSlots(slots, availableSlots);
        if (!validation.valid) {
            return { success: false, message: `❌ Geçersiz slot: ${validation.error}` };
        }

        const results = [];
        for (const slot of validation.slots) {
            const result = await this.botManager.moveBot(slot, direction, distance);
            results.push({ slot, ...result });
        }

        const successful = results.filter(r => r.success).length;
        const emoji = dirEmoji[direction] || '🏃';
        const tr = dirTR[direction] || direction;

        return {
            success: successful > 0,
            message: `${emoji} **${successful}/${validation.slots.length}** bot **${distance}** blok **${tr}** hareket etti`
        };
    }

    // /whitelist add <name> | /whitelist remove <name> | /whitelist list
    async handleWhitelist(args) {
        if (args.length === 0) {
            return { success: false, message: '❌ Kullanım: `/whitelist <add|remove|list> [oyuncu]`' };
        }

        const action = args[0].toLowerCase();

        if (action === 'list') {
            const list = this.botManager.getWhitelist();
            if (list.length === 0) {
                return { success: true, message: '📋 **Whitelist boş**\n💡 Eklemek için: `/whitelist add <oyuncu>`' };
            }
            const numbered = list.map((u, i) => `${i + 1}. \`${u}\``).join('\n');
            return { success: true, message: `📋 **Whitelist** (${list.length} oyuncu)\n━━━━━━━━━━━━━━━━\n${numbered}` };
        }

        if (args.length < 2) {
            return { success: false, message: `❌ Kullanım: \`/whitelist ${action} <oyuncu>\`` };
        }

        const player = args[1];

        if (action === 'add') {
            const result = await this.botManager.addToWhitelist(player);
            return result.success
                ? { success: true, message: `✅ **${player}** whitelist'e eklendi` }
                : { success: false, message: `⚠️ **${player}** zaten whitelist'te` };
        } else if (action === 'remove' || action === 'delete') {
            const result = await this.botManager.removeFromWhitelist(player);
            return result.success
                ? { success: true, message: `🗑️ **${player}** whitelist'ten çıkarıldı` }
                : { success: false, message: `❌ **${player}** whitelist'te bulunamadı` };
        } else {
            return { success: false, message: '❌ Bilinmeyen işlem. Kullanım: `add`, `remove` veya `list`' };
        }
    }

    async handleStats(args) {
        if (args.length === 0) {
            const allStats = this.botManager.getAllStats();
            if (allStats.length === 0) {
                return { success: true, message: '📊 Kayıtlı bot yok.' };
            }

            let message = '📊 **Bot İstatistikleri**\n━━━━━━━━━━━━━━━━━━━━\n';
            for (const stat of allStats) {
                const statusEmoji = stat.status === 'online' ? '🟢' : '⚫';
                message += `\n${statusEmoji} **Slot ${stat.slot}** — ${stat.username}\n`;
                message += `  ⏱ Uptime: \`${stat.uptimeFormatted}\`\n`;
                message += `  🔄 Reconnect: **${stat.reconnects}** | ⚠️ Alert: **${stat.alertsTriggered}**\n`;
                message += `  💎 Spawner: **${stat.spawnersBroken}** | 🏢 Lobby: **${stat.lobbyEvents}**\n`;
            }
            message += '━━━━━━━━━━━━━━━━━━━━';

            return { success: true, message: message.trim() };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }

        const stat = this.botManager.getBotStats(slot);
        if (!stat) {
            return { success: false, message: `❌ Slot **${slot}** bulunamadı` };
        }

        const statusEmoji = stat.status === 'online' ? '🟢' : '⚫';
        let message = `📊 **Slot ${stat.slot} İstatistikleri**\n`;
        message += `👤 Kullanıcı: **${stat.username}**\n`;
        message += `━━━━━━━━━━━━━━━━━━━━\n`;
        message += `${statusEmoji} Durum: **${stat.status}**\n`;
        message += `⏱ Uptime: **${stat.uptimeFormatted}**\n`;
        message += `📅 Oturum Süresi: **${stat.sessionTimeFormatted}**\n`;
        message += `🔄 Reconnect Sayısı: **${stat.reconnects}**\n`;
        message += `⚠️ Alarm Sayısı: **${stat.alertsTriggered}**\n`;
        message += `💎 Kırılan Spawner: **${stat.spawnersBroken}**\n`;
        message += `🏢 Lobby Olayları: **${stat.lobbyEvents}**`;

        if (stat.lastDisconnect) {
            const ago = Date.now() - stat.lastDisconnect;
            const minutes = Math.floor(ago / 60000);
            message += `\n📡 Son Kopma: **${minutes} dk önce**`;
        }

        return { success: true, message };
    }

    handleHelp(platform) {
        if (platform === 'telegram') {
            return this.handleTelegramHelp();
        } else if (platform === 'discord') {
            return this.handleDiscordHelp();
        } else {
            return this.handleGenericHelp();
        }
    }

    handleTelegramHelp() {
        const helpText = `
🤖 <b>Minecraft AFK Bot Manager</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 <b>Mesajlaşma</b>
<code>/say <slot> <mesaj></code> — Belirli slota mesaj
<code>/say 1,2,3 <mesaj></code> — Birden fazla slota
<code>/say 1-3 <mesaj></code> — Slot aralığına
<code>/all <mesaj></code> — Tüm botlara mesaj

📊 <b>Durum & Bilgi</b>
<code>/status</code> — Tüm botların durumu
<code>/status <slot></code> — Belirli bot durumu (/s)
<code>/inv <slot></code> — Envanter görüntüle
<code>/stats</code> — Tüm bot istatistikleri
<code>/stats <slot></code> — Belirli bot istatistikleri

🎮 <b>Bot Kontrolü</b>
<code>/start <slot></code> — Botu başlat
<code>/stop <slot></code> — Botu durdur
<code>/restart <slot|all></code> — Yeniden başlat
<code>/pause <slot></code> — Anti-AFK durdur
<code>/resume <slot></code> — Anti-AFK devam

👤 <b>Hesap Yönetimi</b>
<code>/account add</code> — Yeni hesap ekle (MS Auth)
<code>/account remove <slot></code> — Hesap sil
<code>/account list</code> — Hesapları listele

🏃 <b>Hareket</b>
<code>/forward <slot> <blok></code> — İleri git (/f)
<code>/back <slot> <blok></code> — Geri git (/b)
<code>/left <slot> <blok></code> — Sola git (/l)
<code>/right <slot> <blok></code> — Sağa git (/r)

🗑️ <b>Eşya</b>
<code>/drop <slot> all</code> — Tüm eşyaları bırak
<code>/drop <slot> <eşya> [adet]</code> — Belirli eşya bırak

🛡️ <b>Güvenlik</b>
<code>/whitelist add <oyuncu></code> — Whitelist'e ekle
<code>/whitelist remove <oyuncu></code> — Whitelist'ten çıkar
<code>/whitelist list</code> — Whitelist'i göster
<code>/protect <slot></code> — Spawner korumasını aç/kapat

━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 <b>Slot formatları:</b> <code>1</code> · <code>1,2,3</code> · <code>1-5</code> · <code>all</code>
        `.trim();

        return { success: true, message: helpText, parseOptions: { parse_mode: 'HTML' } };
    }

    handleDiscordHelp() {
        return {
            success: true,
            type: 'embed',
            data: {
                title: '🤖 Minecraft AFK Bot Manager',
                description: '> Botlarını Telegram, Discord veya konsoldan yönet.\n> Slot formatları: `1` · `1,2,3` · `1-5` · `all`',
                color: 0x5865F2,
                fields: [
                    {
                        name: '💬 Mesajlaşma',
                        value: '`/say <slot> <mesaj>` — Slota mesaj gönder\n`/say 1,2,3 <mesaj>` — Birden fazla slota\n`/say 1-3 <mesaj>` — Slot aralığına\n`/all <mesaj>` — Tüm botlara mesaj',
                        inline: false
                    },
                    {
                        name: '📊 Durum & Bilgi',
                        value: '`/status` — Tüm botların durumu\n`/status <slot>` — Belirli bot durumu\n`/inv <slot>` — Envanter görüntüle\n`/stats [slot]` — İstatistikler',
                        inline: true
                    },
                    {
                        name: '🎮 Bot Kontrolü',
                        value: '`/start <slot>` — Botu başlat\n`/stop <slot>` — Botu durdur\n`/restart <slot|all>` — Yeniden başlat\n`/pause <slot>` — Anti-AFK durdur\n`/resume <slot>` — Anti-AFK devam',
                        inline: true
                    },
                    {
                        name: '👤 Hesap Yönetimi',
                        value: '`/account add` — Yeni hesap ekle (MS Auth)\n`/account remove <slot>` — Hesap sil\n`/account list` — Hesapları listele',
                        inline: false
                    },
                    {
                        name: '🏃 Hareket',
                        value: '`/forward <slot> <blok>` — İleri git\n`/back <slot> <blok>` — Geri git\n`/left <slot> <blok>` — Sola git\n`/right <slot> <blok>` — Sağa git',
                        inline: true
                    },
                    {
                        name: '🗑️ Eşya',
                        value: '`/drop <slot> all` — Tüm eşyaları bırak\n`/drop <slot> <eşya> [adet]` — Belirli eşya bırak',
                        inline: true
                    },
                    {
                        name: '🛡️ Güvenlik',
                        value: '`/whitelist add <oyuncu>` — Whitelist\'e ekle\n`/whitelist remove <oyuncu>` — Whitelist\'ten çıkar\n`/whitelist list` — Whitelist\'i göster\n`/protect <slot>` — Spawner korumasını aç/kapat',
                        inline: false
                    }
                ],
                footer: { text: 'Minecraft AFK Bot Manager • github.com/BenOnur/Minecraft-AFK-Bot-Manager' }
            }
        };
    }

    handleGenericHelp() {
        const helpText = `
📋 **Available Commands:**

**Messaging:**
/say 1 <message> - Send to slot 1
/all <message> - Send to all bots

**Status:**
/status - All bots status
/status 1 - Slot 1 status

**Bot Control:**
/restart 1 - Restart slot 1
/stop 1 - Stop slot 1
/account add - Add new account
/account remove 1 - Remove account 1
/account list - List accounts
/start 1 - Start slot 1
/pause 1 - Pause slot 1
/resume 1 - Resume slot 1

**Inventory:**
/inv 1 - Show slot 1 inventory
/drop 1 all - Drop all items

**Movement:**
/forward 1 5 - Move slot 1 forward 5 blocks
/backward 1 5 - Move slot 1 backward 5 blocks

**Security:**
/whitelist add <player> - Add player to alert whitelist
/whitelist list - Show whitelisted players
/protect <slot> - Toggle spawner protection
/stats [slot] - Bot statistics
    `.trim();

        return { success: true, message: helpText };
    }

    async handleProtect(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /protect <slot>' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        return await this.botManager.toggleProtection(slot);
    }
}
