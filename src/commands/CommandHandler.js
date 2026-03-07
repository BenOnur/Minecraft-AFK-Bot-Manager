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
            return { success: false, message: 'âŒ KullanÄ±m: `/say <slot(lar)> <mesaj>`\nÃ–rnek: `/say 1 merhaba` veya `/say 1-3 merhaba`' };
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
            return { success: false, message: `âŒ GeÃ§ersiz slot: ${validation.error}` };
        }

        const results = await this.botManager.sendMessage(validation.slots, message);
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success);

        let msg = `ğŸ’¬ Mesaj gÃ¶nderildi: **${successful}/${validation.slots.length}** bot\n`;
        msg += `ğŸ“ Mesaj: \`${message}\``;
        if (failed.length > 0) {
            msg += `\nâš ï¸ BaÅŸarÄ±sÄ±z slotlar: ${failed.map(r => r.slot).join(', ')}`;
        }

        return { success: true, message: msg };
    }

    // /all mesaj
    async handleAll(args) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/all <mesaj>`' };
        }

        const message = args.join(' ');
        const results = await this.botManager.sendMessageToAll(message);
        const successful = results.filter(r => r.success).length;

        return {
            success: true,
            message: `ğŸ’¬ TÃ¼m botlara mesaj gÃ¶nderildi: **${successful}/${results.length}** bot\nğŸ“ Mesaj: \`${message}\``
        };
    }

    // /status veya /status 1
    async handleStatus(args) {
        if (args.length === 0) {
            const statuses = this.botManager.getAllStatus();
            return {
                success: true,
                message: 'TÃ¼m bot durumlarÄ±',
                data: statuses
            };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const status = this.botManager.getBotStatus(slot);
        if (!status) {
            return { success: false, message: `âŒ Slot **${slot}** bulunamadÄ±` };
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
            return { success: false, message: 'âŒ KullanÄ±m: `/restart <slot|all>`' };
        }

        if (args[0] === 'all') {
            await this.botManager.restartAll();
            return { success: true, message: 'ğŸ”„ TÃ¼m botlar yeniden baÅŸlatÄ±lÄ±yor...' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const result = await this.botManager.restartBot(slot);
        return {
            success: result,
            message: result ? `ğŸ”„ Slot **${slot}** yeniden baÅŸlatÄ±lÄ±yor...` : `âŒ Slot **${slot}** yeniden baÅŸlatÄ±lamadÄ±`
        };
    }

    async handleAccount(args, platform, userId) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/account <add|remove|list> [slot]`' };
        }

        const action = args[0].toLowerCase();

        if (action === 'add') {
            return await this.botManager.addAccount(platform, userId);
        } else if (action === 'remove') {
            if (args.length < 2) return { success: false, message: 'âŒ KullanÄ±m: `/account remove <slot>`' };
            const slot = args[1];
            return await this.botManager.removeAccount(slot);
        } else if (action === 'list') {
            const accounts = this.botManager.getAccountList();
            if (accounts.length === 0) {
                return { success: true, message: 'ğŸ“‹ KayÄ±tlÄ± hesap yok.\nğŸ’¡ Eklemek iÃ§in: `/account add`' };
            }

            let message = 'ğŸ“‹ **KayÄ±tlÄ± Hesaplar**\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n';
            accounts.forEach(acc => {
                const statusEmoji = acc.status === 'online' ? 'ğŸŸ¢' : (acc.status === 'offline' ? 'âš«' : 'ğŸ”´');
                const pausedText = acc.isPaused ? ' â¸' : '';
                message += `${statusEmoji} **Slot ${acc.slot}** â€” ${acc.username}${pausedText}`;
                if (acc.health !== undefined) {
                    message += ` | ğŸ’— ${Math.round(acc.health)} ğŸ— ${Math.round(acc.food)}`;
                }
                message += '\n';
            });
            message += `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\nğŸ“Š Toplam: **${accounts.length}** hesap`;
            return { success: true, message };
        } else {
            return { success: false, message: 'âŒ Bilinmeyen iÅŸlem. KullanÄ±m: `add`, `remove` veya `list`' };
        }
    }

    // /stop 1
    async handleStop(args) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/stop <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const result = await this.botManager.stopBot(slot);
        return {
            success: result,
            message: result ? `â¹ï¸ Slot **${slot}** durduruldu` : `âŒ Slot **${slot}** durdurulamadÄ±`
        };
    }

    // /start 1
    async handleStart(args) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/start <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const result = await this.botManager.startBot(slot);
        return {
            success: result,
            message: result ? `â–¶ï¸ Slot **${slot}** baÅŸlatÄ±lÄ±yor...` : `âŒ Slot **${slot}** baÅŸlatÄ±lamadÄ±`
        };
    }

    // /pause 1
    async handlePause(args) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/pause <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const result = this.botManager.pauseBot(slot);
        return {
            success: result,
            message: result ? `â¸ï¸ Slot **${slot}** duraklatÄ±ldÄ± (Anti-AFK devre dÄ±ÅŸÄ±)` : `âŒ Slot **${slot}** duraklatÄ±lamadÄ±`
        };
    }

    // /resume 1
    async handleResume(args) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/resume <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const result = this.botManager.resumeBot(slot);
        return {
            success: result,
            message: result ? `â–¶ï¸ Slot **${slot}** devam ettiriliyor (Anti-AFK aktif)` : `âŒ Slot **${slot}** devam ettirilemedi`
        };
    }

    // /inv 1
    async handleInventory(args) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/inv <slot>`' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const inventory = this.botManager.getBotInventory(slot);
        if (!inventory) {
            return { success: false, message: `âŒ Slot **${slot}** Ã§evrimdÄ±ÅŸÄ± veya bulunamadÄ±` };
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
        // Bu mineflayer ile daha karmaÅŸÄ±k olduÄŸundan, ÅŸimdilik basit bir mesaj dÃ¶ndÃ¼relim
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
        const dirEmoji = { forward: 'â¬†ï¸', back: 'â¬‡ï¸', left: 'â¬…ï¸', right: 'â¡ï¸' };
        const dirTR = { forward: 'ileri', back: 'geri', left: 'sola', right: 'saÄŸa' };

        if (args.length < 2) {
            return { success: false, message: `âŒ KullanÄ±m: \`/${direction === 'back' ? 'backward' : direction} <slot> <blok>\`` };
        }

        const slotArg = args[0];
        const distance = parseInt(args[1]);

        if (isNaN(distance)) {
            return { success: false, message: 'âŒ GeÃ§ersiz mesafe deÄŸeri' };
        }

        let slots = CommandParser.parseSlots(slotArg);
        const availableSlots = this.botManager.getAvailableSlots();

        if (slots === 'all') {
            slots = availableSlots;
        }

        const validation = CommandParser.validateSlots(slots, availableSlots);
        if (!validation.valid) {
            return { success: false, message: `âŒ GeÃ§ersiz slot: ${validation.error}` };
        }

        const results = [];
        for (const slot of validation.slots) {
            const result = await this.botManager.moveBot(slot, direction, distance);
            results.push({ slot, ...result });
        }

        const successful = results.filter(r => r.success).length;
        const emoji = dirEmoji[direction] || 'ğŸƒ';
        const tr = dirTR[direction] || direction;

        return {
            success: successful > 0,
            message: `${emoji} **${successful}/${validation.slots.length}** bot **${distance}** blok **${tr}** hareket etti`
        };
    }

    // /whitelist add <name> | /whitelist remove <name> | /whitelist list
    async handleWhitelist(args) {
        if (args.length === 0) {
            return { success: false, message: 'âŒ KullanÄ±m: `/whitelist <add|remove|list> [oyuncu]`' };
        }

        const action = args[0].toLowerCase();

        if (action === 'list') {
            const list = this.botManager.getWhitelist();
            if (list.length === 0) {
                return { success: true, message: 'ğŸ“‹ **Whitelist boÅŸ**\nğŸ’¡ Eklemek iÃ§in: `/whitelist add <oyuncu>`' };
            }
            const numbered = list.map((u, i) => `${i + 1}. \`${u}\``).join('\n');
            return { success: true, message: `ğŸ“‹ **Whitelist** (${list.length} oyuncu)\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n${numbered}` };
        }

        if (args.length < 2) {
            return { success: false, message: `âŒ KullanÄ±m: \`/whitelist ${action} <oyuncu>\`` };
        }

        const player = args[1];

        if (action === 'add') {
            const result = await this.botManager.addToWhitelist(player);
            return result.success
                ? { success: true, message: `âœ… **${player}** whitelist'e eklendi` }
                : { success: false, message: `âš ï¸ **${player}** zaten whitelist'te` };
        } else if (action === 'remove' || action === 'delete') {
            const result = await this.botManager.removeFromWhitelist(player);
            return result.success
                ? { success: true, message: `ğŸ—‘ï¸ **${player}** whitelist'ten Ã§Ä±karÄ±ldÄ±` }
                : { success: false, message: `âŒ **${player}** whitelist'te bulunamadÄ±` };
        } else {
            return { success: false, message: 'âŒ Bilinmeyen iÅŸlem. KullanÄ±m: `add`, `remove` veya `list`' };
        }
    }

    // /protect | /protect on | /protect off
    async handleProtect(args) {
        if (args.length === 0) {
            return await this.botManager.toggleProtection();
        }

        const action = args[0].toLowerCase();

        if (['on', 'enable', 'enabled', 'true'].includes(action)) {
            return await this.botManager.toggleProtection(true);
        }

        if (['off', 'disable', 'disabled', 'false'].includes(action)) {
            return await this.botManager.toggleProtection(false);
        }

        return { success: false, message: 'Kullanım: /protect [on|off]' };
    }
    async handleStats(args) {
        if (args.length === 0) {
            const allStats = this.botManager.getAllStats();
            if (allStats.length === 0) {
                return { success: true, message: 'ğŸ“Š KayÄ±tlÄ± bot yok.' };
            }

            let message = 'ğŸ“Š **Bot Ä°statistikleri**\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n';
            for (const stat of allStats) {
                const statusEmoji = stat.status === 'online' ? 'ğŸŸ¢' : 'âš«';
                message += `\n${statusEmoji} **Slot ${stat.slot}** â€” ${stat.username}\n`;
                message += `  â± Uptime: \`${stat.uptimeFormatted}\`\n`;
                message += `  ğŸ”„ Reconnect: **${stat.reconnects}** | âš ï¸ Alert: **${stat.alertsTriggered}**\n`;
                message += `  ğŸ’ Spawner: **${stat.spawnersBroken}** | ğŸ¢ Lobby: **${stat.lobbyEvents}**\n`;
            }
            message += 'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”';

            return { success: true, message: message.trim() };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'âŒ GeÃ§ersiz slot numarasÄ±' };
        }

        const stat = this.botManager.getBotStats(slot);
        if (!stat) {
            return { success: false, message: `âŒ Slot **${slot}** bulunamadÄ±` };
        }

        const statusEmoji = stat.status === 'online' ? 'ğŸŸ¢' : 'âš«';
        let message = `ğŸ“Š **Slot ${stat.slot} Ä°statistikleri**\n`;
        message += `ğŸ‘¤ KullanÄ±cÄ±: **${stat.username}**\n`;
        message += `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n`;
        message += `${statusEmoji} Durum: **${stat.status}**\n`;
        message += `â± Uptime: **${stat.uptimeFormatted}**\n`;
        message += `ğŸ“… Oturum SÃ¼resi: **${stat.sessionTimeFormatted}**\n`;
        message += `ğŸ”„ Reconnect SayÄ±sÄ±: **${stat.reconnects}**\n`;
        message += `âš ï¸ Alarm SayÄ±sÄ±: **${stat.alertsTriggered}**\n`;
        message += `ğŸ’ KÄ±rÄ±lan Spawner: **${stat.spawnersBroken}**\n`;
        message += `ğŸ¢ Lobby OlaylarÄ±: **${stat.lobbyEvents}**`;

        if (stat.lastDisconnect) {
            const ago = Date.now() - stat.lastDisconnect;
            const minutes = Math.floor(ago / 60000);
            message += `\nğŸ“¡ Son Kopma: **${minutes} dk Ã¶nce**`;
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
ğŸ¤– <b>Minecraft AFK Bot Manager</b>
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

ğŸ’¬ <b>MesajlaÅŸma</b>
<code>/say <slot> <mesaj></code> â€” Belirli slota mesaj
<code>/say 1,2,3 <mesaj></code> â€” Birden fazla slota
<code>/say 1-3 <mesaj></code> â€” Slot aralÄ±ÄŸÄ±na
<code>/all <mesaj></code> â€” TÃ¼m botlara mesaj

ğŸ“Š <b>Durum & Bilgi</b>
<code>/status</code> â€” TÃ¼m botlarÄ±n durumu
<code>/status <slot></code> â€” Belirli bot durumu (/s)
<code>/inv <slot></code> â€” Envanter gÃ¶rÃ¼ntÃ¼le
<code>/stats</code> â€” TÃ¼m bot istatistikleri
<code>/stats <slot></code> â€” Belirli bot istatistikleri

ğŸ® <b>Bot KontrolÃ¼</b>
<code>/start <slot></code> â€” Botu baÅŸlat
<code>/stop <slot></code> â€” Botu durdur
<code>/restart <slot|all></code> â€” Yeniden baÅŸlat
<code>/pause <slot></code> â€” Anti-AFK durdur
<code>/resume <slot></code> â€” Anti-AFK devam

ğŸ‘¤ <b>Hesap YÃ¶netimi</b>
<code>/account add</code> â€” Yeni hesap ekle (MS Auth)
<code>/account remove <slot></code> â€” Hesap sil
<code>/account list</code> â€” HesaplarÄ± listele

ğŸƒ <b>Hareket</b>
<code>/forward <slot> <blok></code> â€” Ä°leri git (/f)
<code>/back <slot> <blok></code> â€” Geri git (/b)
<code>/left <slot> <blok></code> â€” Sola git (/l)
<code>/right <slot> <blok></code> â€” SaÄŸa git (/r)

ğŸ—‘ï¸ <b>EÅŸya</b>
<code>/drop <slot> all</code> â€” TÃ¼m eÅŸyalarÄ± bÄ±rak
<code>/drop <slot> <eÅŸya> [adet]</code> â€” Belirli eÅŸya bÄ±rak

ğŸ›¡ï¸ <b>GÃ¼venlik</b>
<code>/whitelist add <oyuncu></code> â€” Whitelist'e ekle
<code>/whitelist remove <oyuncu></code> â€” Whitelist'ten Ã§Ä±kar
<code>/whitelist list</code> â€” Whitelist'i gÃ¶ster
<code>/protect [on|off]</code> â€” Lobby + spawner korumasÄ±nÄ± aÃ§/kapat
<code>/stats [slot]</code> â€” Bot istatistikleri

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ğŸ’¡ <b>Slot formatlarÄ±:</b> <code>1</code> Â· <code>1,2,3</code> Â· <code>1-5</code> Â· <code>all</code>
        `.trim();

        return { success: true, message: helpText, parseOptions: { parse_mode: 'HTML' } };
    }

    handleDiscordHelp() {
        return {
            success: true,
            type: 'embed',
            data: {
                title: 'ğŸ¤– Minecraft AFK Bot Manager',
                description: '> BotlarÄ±nÄ± Telegram, Discord veya konsoldan yÃ¶net.\n> Slot formatlarÄ±: `1` Â· `1,2,3` Â· `1-5` Â· `all`',
                color: 0x5865F2,
                fields: [
                    {
                        name: 'ğŸ’¬ MesajlaÅŸma',
                        value: '`/say <slot> <mesaj>` â€” Slota mesaj gÃ¶nder\n`/say 1,2,3 <mesaj>` â€” Birden fazla slota\n`/say 1-3 <mesaj>` â€” Slot aralÄ±ÄŸÄ±na\n`/all <mesaj>` â€” TÃ¼m botlara mesaj',
                        inline: false
                    },
                    {
                        name: 'ğŸ“Š Durum & Bilgi',
                        value: '`/status` â€” TÃ¼m botlarÄ±n durumu\n`/status <slot>` â€” Belirli bot durumu\n`/inv <slot>` â€” Envanter gÃ¶rÃ¼ntÃ¼le\n`/stats [slot]` â€” Ä°statistikler',
                        inline: true
                    },
                    {
                        name: 'ğŸ® Bot KontrolÃ¼',
                        value: '`/start <slot>` â€” Botu baÅŸlat\n`/stop <slot>` â€” Botu durdur\n`/restart <slot|all>` â€” Yeniden baÅŸlat\n`/pause <slot>` â€” Anti-AFK durdur\n`/resume <slot>` â€” Anti-AFK devam',
                        inline: true
                    },
                    {
                        name: 'ğŸ‘¤ Hesap YÃ¶netimi',
                        value: '`/account add` â€” Yeni hesap ekle (MS Auth)\n`/account remove <slot>` â€” Hesap sil\n`/account list` â€” HesaplarÄ± listele',
                        inline: false
                    },
                    {
                        name: 'ğŸƒ Hareket',
                        value: '`/forward <slot> <blok>` â€” Ä°leri git\n`/back <slot> <blok>` â€” Geri git\n`/left <slot> <blok>` â€” Sola git\n`/right <slot> <blok>` â€” SaÄŸa git',
                        inline: true
                    },
                    {
                        name: 'ğŸ—‘ï¸ EÅŸya',
                        value: '`/drop <slot> all` â€” TÃ¼m eÅŸyalarÄ± bÄ±rak\n`/drop <slot> <eÅŸya> [adet]` â€” Belirli eÅŸya bÄ±rak',
                        inline: true
                    },
                    {
                        name: 'ğŸ›¡ï¸ GÃ¼venlik',
                        value: '`/whitelist add <oyuncu>` â€” Whitelist\'e ekle\n`/whitelist remove <oyuncu>` â€” Whitelist\'ten Ã§Ä±kar\n`/whitelist list` â€” Whitelist\'i gÃ¶ster\n`/protect [on|off]` â€” Lobby+Spawner korumasÄ±nÄ± aÃ§/kapat\n`/stats [slot]` â€” Bot istatistikleri',
                        inline: false
                    }
                ],
                footer: { text: 'Minecraft AFK Bot Manager â€¢ github.com/BenOnur/Minecraft-AFK-Bot-Manager' }
            }
        };
    }

    handleGenericHelp() {
        const helpText = `
ğŸ“‹ **Available Commands:**

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
/protect [on|off] - Toggle lobby + spawner protection
/stats [slot] - Bot statistics
    `.trim();

        return { success: true, message: helpText };
    }

}

