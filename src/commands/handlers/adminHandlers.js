function formatAccountList(accounts) {
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
    return message;
}

export async function handleAccount(ctx, args, platform, userId) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/account <add|remove|list> [slot]`' };
    }

    const action = args[0].toLowerCase();

    if (action === 'add') {
        return await ctx.botManager.addAccount(platform, userId);
    } else if (action === 'remove') {
        if (args.length < 2) return { success: false, message: '❌ Kullanım: `/account remove <slot>`' };
        const slot = parseInt(args[1], 10);
        if (isNaN(slot)) {
            return { success: false, message: '❌ Geçersiz slot numarası' };
        }
        return await ctx.botManager.removeAccount(slot);
    } else if (action === 'list') {
        const accounts = ctx.botManager.getAccountList();
        if (accounts.length === 0) {
            return { success: true, message: '📋 Kayıtlı hesap yok.\n💡 Eklemek için: `/account add`' };
        }
        return { success: true, message: formatAccountList(accounts) };
    }

    return { success: false, message: '❌ Bilinmeyen işlem. Kullanım: `add`, `remove` veya `list`' };
}

export async function handleWhitelist(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/whitelist <add|remove|list> [oyuncu]`' };
    }

    const action = args[0].toLowerCase();

    if (action === 'list') {
        const list = ctx.botManager.getWhitelist();
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
        const result = await ctx.botManager.addToWhitelist(player);
        return result.success
            ? { success: true, message: `✅ **${player}** whitelist'e eklendi` }
            : { success: false, message: `⚠️ **${player}** zaten whitelist'te` };
    } else if (action === 'remove' || action === 'delete') {
        const result = await ctx.botManager.removeFromWhitelist(player);
        return result.success
            ? { success: true, message: `🗑️ **${player}** whitelist'ten çıkarıldı` }
            : { success: false, message: `❌ **${player}** whitelist'te bulunamadı` };
    }

    return { success: false, message: '❌ Bilinmeyen işlem. Kullanım: `add`, `remove` veya `list`' };
}

export async function handleStats(ctx, args) {
    if (args.length === 0) {
        const allStats = ctx.botManager.getAllStats();
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

    const stat = ctx.botManager.getBotStats(slot);
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

export async function handleAfkSet(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/afkset <slot>`' };
    }

    const slot = parseInt(args[0], 10);
    if (isNaN(slot)) {
        return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    return await ctx.botManager.setAfkProfile(slot);
}

export async function handleProtect(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: 'Kullanım: /protect <slot> [on|off]' };
    }

    const slot = parseInt(args[0], 10);
    if (isNaN(slot)) {
        return { success: false, message: 'Geçersiz slot numarası' };
    }

    if (args.length === 1) {
        return await ctx.botManager.toggleProtection(slot);
    }

    const action = args[1].toLowerCase();

    if (['on', 'enable', 'enabled', 'true'].includes(action)) {
        return await ctx.botManager.toggleProtection(slot, true);
    }

    if (['off', 'disable', 'disabled', 'false'].includes(action)) {
        return await ctx.botManager.toggleProtection(slot, false);
    }

    if (action === 'toggle') {
        return await ctx.botManager.toggleProtection(slot);
    }

    return { success: false, message: 'Kullanım: /protect <slot> [on|off]' };
}
