import { CommandParser } from '../CommandParser.js';

export async function handleSay(ctx, args) {
    if (args.length < 2) {
        return { success: false, message: '❌ Kullanım: `/say <slot(lar)> <mesaj>`\nÖrnek: `/say 1 merhaba` veya `/say 1-3 merhaba`' };
    }

    const slotArg = args[0];
    const message = args.slice(1).join(' ');

    let slots = CommandParser.parseSlots(slotArg);
    const availableSlots = ctx.botManager.getAvailableSlots();

    if (slots === 'all') {
        slots = availableSlots;
    }

    const validation = CommandParser.validateSlots(slots, availableSlots);
    if (!validation.valid) {
        return { success: false, message: `❌ Geçersiz slot: ${validation.error}` };
    }

    const results = await ctx.botManager.sendMessage(validation.slots, message);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    let msg = `💬 Mesaj gönderildi: **${successful}/${validation.slots.length}** bot\n`;
    msg += `📝 Mesaj: \`${message}\``;
    if (failed.length > 0) {
        msg += `\n⚠️ Başarısız slotlar: ${failed.map(r => r.slot).join(', ')}`;
    }

    return { success: true, message: msg };
}

export async function handleAll(ctx, args) {
    if (args.length === 0) {
        return { success: false, message: '❌ Kullanım: `/all <mesaj>`' };
    }

    const message = args.join(' ');
    const results = await ctx.botManager.sendMessageToAll(message);
    const successful = results.filter(r => r.success).length;

    return {
        success: true,
        message: `💬 Tüm botlara mesaj gönderildi: **${successful}/${results.length}** bot\n📝 Mesaj: \`${message}\``
    };
}

export async function handleMove(ctx, args, direction) {
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
    const availableSlots = ctx.botManager.getAvailableSlots();

    if (slots === 'all') {
        slots = availableSlots;
    }

    const validation = CommandParser.validateSlots(slots, availableSlots);
    if (!validation.valid) {
        return { success: false, message: `❌ Geçersiz slot: ${validation.error}` };
    }

    const results = [];
    for (const slot of validation.slots) {
        const result = await ctx.botManager.moveBot(slot, direction, distance);
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
