export function handleHelp(_ctx, platform) {
    if (platform === 'telegram') {
        return handleTelegramHelp();
    } else if (platform === 'discord') {
        return handleDiscordHelp();
    }
    return handleGenericHelp();
}

export function handleTelegramHelp() {
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

export function handleDiscordHelp() {
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
                    value: '`/whitelist add <oyuncu>` — Whitelist\'e ekle\n`/whitelist remove <oyuncu>` — Whitelist\'ten çıkar\n`/whitelist list` — Whitelist\'i göster\n`/protect <slot> [on|off]` — Lobby + spawner korumasını aç/kapat\n`/afkset <slot>` — AFK anchor + spawner kaydı al',
                    inline: false
                }
            ],
            footer: { text: 'Minecraft AFK Bot Manager • github.com/BenOnur/Minecraft-AFK-Bot-Manager' }
        }
    };
}

export function handleGenericHelp() {
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
