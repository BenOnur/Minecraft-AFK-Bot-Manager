export async function handleStatus(ctx, args) {
    if (args.length === 0) {
        const statuses = ctx.botManager.getAllStatus();
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

    const status = ctx.botManager.getBotStatus(slot);
    if (!status) {
        return { success: false, message: `❌ Slot **${slot}** bulunamadı` };
    }

    return {
        success: true,
        message: `Slot ${slot} durumu`,
        data: status
    };
}

export async function handleRestart(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/restart <slot|all>`' };
    }

    if (args[0] === 'all') {
        await ctx.botManager.restartAll();
        return { success: true, message: '🔄 Tüm botlar yeniden başlatılıyor...' };
    }

    const slot = parseInt(args[0]);
    if (isNaN(slot)) {
        return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    const result = await ctx.botManager.restartBot(slot);
    return {
        success: result,
        message: result ? `🔄 Slot **${slot}** yeniden başlatılıyor...` : `❌ Slot **${slot}** yeniden başlatılamadı`
    };
}

export async function handleStop(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/stop <slot>`' };
    }

    const slot = parseInt(args[0]);
    if (isNaN(slot)) {
        return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    const result = await ctx.botManager.stopBot(slot);
    return {
        success: result,
        message: result ? `⏹️ Slot **${slot}** durduruldu` : `❌ Slot **${slot}** durdurulamadı`
    };
}

export async function handleStart(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/start <slot>`' };
    }

    const slot = parseInt(args[0]);
    if (isNaN(slot)) {
        return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    const result = await ctx.botManager.startBot(slot);
    return {
        success: result,
        message: result ? `▶️ Slot **${slot}** başlatılıyor...` : `❌ Slot **${slot}** başlatılamadı`
    };
}

export function handlePause(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/pause <slot>`' };
    }

    const slot = parseInt(args[0]);
    if (isNaN(slot)) {
        return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    const result = ctx.botManager.pauseBot(slot);
    return {
        success: result,
        message: result ? `⏸️ Slot **${slot}** duraklatıldı (Anti-AFK devre dışı)` : `❌ Slot **${slot}** duraklatılamadı`
    };
}

export function handleResume(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/resume <slot>`' };
    }

    const slot = parseInt(args[0]);
    if (isNaN(slot)) {
        return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    const result = ctx.botManager.resumeBot(slot);
    return {
        success: result,
        message: result ? `▶️ Slot **${slot}** devam ettiriliyor (Anti-AFK aktif)` : `❌ Slot **${slot}** devam ettirilemedi`
    };
}

export function handleInventory(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/inv <slot>`' };
    }

    const slot = parseInt(args[0]);
    if (isNaN(slot)) {
        return { success: false, message: '❌ Geçersiz slot numarası' };
    }

    const inventory = ctx.botManager.getBotInventory(slot);
    if (!inventory) {
        return { success: false, message: `❌ Slot **${slot}** çevrimdışı veya bulunamadı` };
    }

    return {
        success: true,
        message: `Slot ${slot} envanteri`,
        data: inventory
    };
}

export function handleTake(_ctx, args) {
    if (args.length < 3) {
        return { success: false, message: 'Usage: /take <slot> <item> <count>' };
    }

    return {
        success: false,
        message: 'Take command not yet implemented - requires chest interaction logic'
    };
}

export async function handleDrop(ctx, args) {
    if (args.length < 2) {
        return { success: false, message: 'Usage: /drop <slot> <item|all> [count]' };
    }

    const slot = parseInt(args[0]);
    const itemName = args[1];
    const count = args.length > 2 ? parseInt(args[2]) : null;

    if (isNaN(slot)) {
        return { success: false, message: 'Invalid slot number' };
    }

    const result = await ctx.botManager.dropItem(slot, itemName, count);

    if (typeof result === 'object' && result.message) {
        return result;
    }

    return {
        success: result,
        message: result ? `Dropped ${itemName} from slot ${slot}` : 'Failed to drop item'
    };
}
