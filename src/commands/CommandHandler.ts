import { CommandParser } from './CommandParser.js';
import logger from '../utils/Logger.js';
import type { BotManager } from '../BotManager.js';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
  parseOptions?: { parse_mode: string };
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function resolveAccount(slotStr: string): number {
  return parseInt(slotStr);
}

export class CommandHandler {
  constructor(private botManager: BotManager) {}

  async handleCommand(commandText: string, platform = 'generic', userId: string | null = null): Promise<CommandResult> {
    try {
      const parsed = CommandParser.parseCommand(commandText);
      const { command, args } = parsed;

      logger.info(`Handling command: ${command} with args: ${JSON.stringify(args)} for platform: ${platform}`);

      if (/^\d+$/.test(command)) {
        return await this.handleSay([command, ...args]);
      }

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
          return await this.handleAccount(args, platform, userId ?? undefined);
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
        case 'afkset':
          return await this.handleAfkSet(args);
        case 'stats':
          return await this.handleStats(args);
        default:
          return { success: false, message: `Unknown command: ${command}` };
      }
    } catch (error) {
      logger.error(`Command handler error: ${(error as Error).message}`);
      return { success: false, message: `Error: ${(error as Error).message}` };
    }
  }

  async handleSay(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      return { success: false, message: '❌ Kullanım: `/say <slot(lar)> <mesaj>`\nÖrnek: `/say 1 merhaba` veya `/say 1-3 merhaba`' };
    }

    const slotArg = args[0];
    const message = args.slice(1).join(' ');

    let slots: number[] | 'all' = CommandParser.parseSlots(slotArg);
    const availableSlots = this.botManager.getAvailableSlots();

    if (slots === 'all') {
      slots = availableSlots;
    }

    const validation = CommandParser.validateSlots(slots, availableSlots);
    if (!validation.valid) {
      return { success: false, message: `❌ Geçersiz slot: ${validation.error}` };
    }

    const results = await this.botManager.sendMessage(validation.slots!, message);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    let msg = `💬 Mesaj gönderildi: **${successful}/${validation.slots!.length}** bot\n`;
    msg += `📝 Mesaj: \`${message}\``;
    if (failed.length > 0) {
      msg += `\n⚠️ Başarısız slotlar: ${failed.map(r => r.slot).join(', ')}`;
    }

    return { success: true, message: msg };
  }

  async handleAll(args: string[]): Promise<CommandResult> {
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

  async handleStatus(args: string[]): Promise<CommandResult> {
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

  async handleRestart(args: string[]): Promise<CommandResult> {
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

  async handleAccount(args: string[], platform: string, userId?: string): Promise<CommandResult> {
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
      const accounts = this.botManager.getAccountList() as { slot: number; username: string; status: string; autoStart: boolean; isPaused?: boolean; health?: number; food?: number }[];
      if (accounts.length === 0) {
        return { success: true, message: '📋 Kayıtlı hesap yok.\n💡 Eklemek için: `/account add`' };
      }

      let message = '📋 **Kayıtlı Hesaplar**\n━━━━━━━━━━━━━━━━━━━━\n';
      for (const acc of accounts) {
        const statusEmoji = acc.status === 'online' ? '🟢' : (acc.status === 'offline' ? '⚫' : '🔴');
        const pausedText = acc.isPaused ? ' ⏸' : '';
        message += `${statusEmoji} **Slot ${acc.slot}** — ${acc.username}${pausedText}`;
        if (acc.health !== undefined) {
          message += ` | 💗 ${Math.round(acc.health ?? 0)} 🍗 ${Math.round(acc.food ?? 0)}`;
        }
        message += '\n';
      }
      message += `━━━━━━━━━━━━━━━━━━━━\n📊 Toplam: **${accounts.length}** hesap`;
      return { success: true, message };
    } else {
      return { success: false, message: '❌ Bilinmeyen işlem. Kullanım: `add`, `remove` veya `list`' };
    }
  }

  async handleStop(args: string[]): Promise<CommandResult> {
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

  async handleStart(args: string[]): Promise<CommandResult> {
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

  async handlePause(args: string[]): Promise<CommandResult> {
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

  async handleResume(args: string[]): Promise<CommandResult> {
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

  async handleInventory(args: string[]): Promise<CommandResult> {
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

  async handleTake(args: string[]): Promise<CommandResult> {
    if (args.length < 3) {
      return { success: false, message: 'Usage: /take <slot> <item> <count>' };
    }

    return {
      success: false,
      message: 'Take command not yet implemented - requires chest interaction logic'
    };
  }

  async handleDrop(args: string[]): Promise<CommandResult> {
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

    if (typeof result === 'object' && result && 'message' in result) {
      return result as CommandResult;
    }

    return {
      success: result as boolean,
      message: result ? `Dropped ${itemName} from slot ${slot}` : `Failed to drop item`
    };
  }

  async handleMove(args: string[], direction: string): Promise<CommandResult> {
    const dirEmoji: Record<string, string> = { forward: '⬆️', back: '⬇️', left: '⬅️', right: '➡️' };
    const dirTR: Record<string, string> = { forward: 'ileri', back: 'geri', left: 'sola', right: 'sağa' };

    if (args.length < 2) {
      return { success: false, message: `❌ Kullanım: \`/${direction === 'back' ? 'backward' : direction} <slot> <blok>\`` };
    }

    const slotArg = args[0];
    const distance = parseInt(args[1]);

    if (isNaN(distance)) {
      return { success: false, message: '❌ Geçersiz mesafe değeri' };
    }

    let slots: number[] | 'all' = CommandParser.parseSlots(slotArg);
    const availableSlots = this.botManager.getAvailableSlots();

    if (slots === 'all') {
      slots = availableSlots;
    }

    const validation = CommandParser.validateSlots(slots, availableSlots);
    if (!validation.valid) {
      return { success: false, message: `❌ Geçersiz slot: ${validation.error}` };
    }

    const results = [];
    for (const slot of validation.slots!) {
      const result = await this.botManager.moveBot(slot, direction, distance);
      results.push({ slot, ...result });
    }

    const successful = results.filter(r => r.success).length;
    const emoji = dirEmoji[direction] || '🏃';
    const tr = dirTR[direction] || direction;

    return {
      success: successful > 0,
      message: `${emoji} **${successful}/${validation.slots!.length}** bot **${distance}** blok **${tr}** hareket etti`
    };
  }

  async handleWhitelist(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      return { success: false, message: '❌ Kullanım: `/whitelist <add|remove|list> [oyuncu]`' };
    }

    const action = args[0].toLowerCase();

    if (action === 'list') {
      const list = this.botManager.getWhitelist();
      if (list.length === 0) {
        return { success: true, message: '📋 **Whitelist boş**\n💡 Eklemek için: `/whitelist add <oyuncu>`' };
      }
      const numbered = list.map((u: string, i: number) => `${i + 1}. \`${u}\``).join('\n');
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

  async handleStats(args: string[]): Promise<CommandResult> {
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

  async handleAfkSet(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      return { success: false, message: '❌ Kullanım: `/afkset <slot>`' };
    }

    const slot = parseInt(args[0], 10);
    if (isNaN(slot)) {
      return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    return await this.botManager.setAfkProfile(slot);
  }

  async handleProtect(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      return { success: false, message: 'Kullanım: /protect <slot> [on|off]' };
    }

    const slot = parseInt(args[0], 10);
    if (isNaN(slot)) {
      return { success: false, message: 'Geçersiz slot numarası' };
    }

    if (args.length === 1) {
      return await this.botManager.toggleProtection(slot, undefined);
    }

    const action = args[1].toLowerCase();

    if (['on', 'enable', 'enabled', 'true'].includes(action)) {
      return await this.botManager.toggleProtection(slot, true as unknown as null);
    }

    if (['off', 'disable', 'disabled', 'false'].includes(action)) {
      return await this.botManager.toggleProtection(slot, false as unknown as null);
    }

    if (action === 'toggle') {
      return await this.botManager.toggleProtection(slot);
    }

    return { success: false, message: 'Kullanım: /protect <slot> [on|off]' };
  }

  handleHelp(platform: string): CommandResult {
    if (platform === 'telegram') {
      return this.handleTelegramHelp();
    } else if (platform === 'discord') {
      return this.handleDiscordHelp();
    } else {
      return this.handleGenericHelp();
    }
  }

  handleTelegramHelp(): CommandResult {
    const helpText = `
**Minecraft AFK Bot Manager**
------------------------------

**Mesajlasma**
/say <slot> <mesaj> - Belirli slota mesaj
/say 1,2,3 <mesaj> - Birden fazla slota
/say 1-3 <mesaj> - Slot araligina
/all <mesaj> - Tum botlara mesaj

**Durum ve Bilgi**
/status - Tum botlarin durumu
/status <slot> - Belirli bot durumu
/inv <slot> - Envanter goruntule
/stats - Tum bot istatistikleri
/stats <slot> - Belirli bot istatistikleri

**Bot Kontrolu**
/start <slot>
/stop <slot>
/restart <slot|all>
/pause <slot>
/resume <slot>

**Hesap Yonetimi**
/account add
/account remove <slot>
/account list

**Hareket**
/forward <slot> <blok> (/f)
/back <slot> <blok> (/b)
/left <slot> <blok> (/l)
/right <slot> <blok> (/r)

**Esya**
/drop <slot> all
/drop <slot> <esya> [adet]

**Guvenlik**
/whitelist add <oyuncu>
/whitelist remove <oyuncu>
/whitelist list
/protect <slot> [on|off]
/afkset <slot>

**Slot formatlari:** 1 - 1,2,3 - 1-5 - all
    `.trim();

    return { success: true, message: helpText, parseOptions: { parse_mode: 'HTML' } };
  }

  handleDiscordHelp(): CommandResult {
    return {
      success: true,
      message: '', // Required but not used for embed
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
            value: '`/status` — Tüm botların durumu\n`/status <slot>` — Belirli bot durumu\n`/inv <slot>` — Envanter görüntüle\n`/stats [slot]` —İstatistikler',
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
            value: '`/whitelist add <oyuncu>` — Whitelist\'e ekle\n`/whitelist remove <oyuncu>` — Whitelist\'ten çıkar\n`/whitelist list` — Whitelist\'i göster\n`/protect <slot> [on|off]` — Lobby + spawner korumasını aç/kapat\n`/afkset <slot>` — AFK anchor + spawner kaydı al',
            inline: false
          }
        ],
        footer: { text: 'Minecraft AFK Bot Manager • github.com/BenOnur/Minecraft-AFK-Bot-Manager' }
      }
    };
  }

  handleGenericHelp(): CommandResult {
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
/protect <slot> [on|off] - Toggle lobby + spawner protection
/afkset <slot> - Save AFK anchor + nearby spawners
/stats [slot] - Bot statistics
    `.trim();

    return { success: true, message: helpText };
  }
}
