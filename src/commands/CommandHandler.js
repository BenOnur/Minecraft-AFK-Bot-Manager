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
                    return await this.handleProtect(args);
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
            return { success: false, message: 'Usage: /say <slot(s)> <message>' };
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
            return { success: false, message: validation.error };
        }

        const results = this.botManager.sendMessage(validation.slots, message);
        const successful = results.filter(r => r.success).length;

        return {
            success: true,
            message: `Message sent to ${successful}/${validation.slots.length} bots`,
            details: results
        };
    }

    // /all mesaj
    async handleAll(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /all <message>' };
        }

        const message = args.join(' ');
        const results = this.botManager.sendMessageToAll(message);
        const successful = results.filter(r => r.success).length;

        return {
            success: true,
            message: `Message sent to ${successful}/${results.length} bots`,
            details: results
        };
    }

    // /status veya /status 1
    async handleStatus(args) {
        if (args.length === 0) {
            // Tüm botların durumu
            const statuses = this.botManager.getAllStatus();
            return {
                success: true,
                message: 'All bots status',
                data: statuses
            };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const status = this.botManager.getBotStatus(slot);
        if (!status) {
            return { success: false, message: `Slot ${slot} not found` };
        }

        return {
            success: true,
            message: `Slot ${slot} status`,
            data: status
        };
    }

    // /restart 1 veya /restart all
    async handleRestart(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /restart <slot|all>' };
        }

        if (args[0] === 'all') {
            await this.botManager.restartAll();
            return { success: true, message: 'Restarting all bots' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const result = await this.botManager.restartBot(slot);
        return {
            success: result,
            message: result ? `Slot ${slot} restarting` : `Failed to restart slot ${slot}`
        };
    }

    async handleAccount(args, platform, userId) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /account <add|remove|list> [slot]' };
        }

        const action = args[0].toLowerCase();

        if (action === 'add') {
            return await this.botManager.addAccount(platform, userId);
        } else if (action === 'remove') {
            if (args.length < 2) return { success: false, message: 'Usage: /account remove <slot>' };
            const slot = args[1];
            return await this.botManager.removeAccount(slot);
        } else if (action === 'list') {
            const accounts = this.botManager.getAccountList();
            if (accounts.length === 0) {
                return { success: true, message: 'No accounts configured.' };
            }

            let message = '📋 **Configured Accounts:**\n';
            accounts.forEach(acc => {
                const statusEmoji = acc.status === 'online' ? '🟢' : (acc.status === 'offline' ? '⚫' : '🔴');
                message += `${statusEmoji} Slot ${acc.slot}: **${acc.username}** (${acc.status})`;
                if (acc.status === 'online' && acc.health) {
                    message += ` [💗 ${Math.round(acc.health)} 🍗 ${Math.round(acc.food)}]`;
                }
                message += '\n';
            });
            return { success: true, message: message };
        } else {
            return { success: false, message: 'Unknown account action. Use add, remove or list.' };
        }
    }

    // /stop 1
    async handleStop(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /stop <slot>' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const result = await this.botManager.stopBot(slot);
        return {
            success: result,
            message: result ? `Slot ${slot} stopped` : `Failed to stop slot ${slot}`
        };
    }

    // /start 1
    async handleStart(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /start <slot>' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const result = await this.botManager.startBot(slot);
        return {
            success: result,
            message: result ? `Slot ${slot} started` : `Failed to start slot ${slot}`
        };
    }

    // /pause 1
    async handlePause(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /pause <slot>' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const result = this.botManager.pauseBot(slot);
        return {
            success: result,
            message: result ? `Slot ${slot} paused` : `Failed to pause slot ${slot}`
        };
    }

    // /resume 1
    async handleResume(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /resume <slot>' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const result = this.botManager.resumeBot(slot);
        return {
            success: result,
            message: result ? `Slot ${slot} resumed` : `Failed to resume slot ${slot}`
        };
    }

    // /inv 1
    async handleInventory(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /inv <slot>' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        const inventory = this.botManager.getBotInventory(slot);
        if (!inventory) {
            return { success: false, message: `Slot ${slot} not available or offline` };
        }

        return {
            success: true,
            message: `Slot ${slot} inventory`,
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
        if (args.length < 2) {
            return { success: false, message: `Usage: /${direction === 'back' ? 'backward' : direction} <slot> <distance>` };
        }

        const slotArg = args[0];
        const distance = parseInt(args[1]);

        if (isNaN(distance)) {
            return { success: false, message: 'Invalid distance' };
        }

        let slots = CommandParser.parseSlots(slotArg);
        const availableSlots = this.botManager.getAvailableSlots();

        if (slots === 'all') {
            slots = availableSlots;
        }

        const validation = CommandParser.validateSlots(slots, availableSlots);
        if (!validation.valid) {
            return { success: false, message: validation.error };
        }

        const results = [];
        for (const slot of validation.slots) {
            const result = await this.botManager.moveBot(slot, direction, distance);
            results.push({ slot, ...result });
        }

        const successful = results.filter(r => r.success).length;

        return {
            success: successful > 0,
            message: `Moved ${successful}/${validation.slots.length} bots ${direction} for ${distance} blocks`,
            details: results
        };
    }

    // /whitelist add <name> | /whitelist remove <name> | /whitelist list
    async handleWhitelist(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /whitelist <add|remove|list> [player]' };
        }

        const action = args[0].toLowerCase();

        if (action === 'list') {
            const list = this.botManager.getWhitelist();
            if (list.length === 0) {
                return { success: true, message: 'Whitelist is empty' };
            }
            return { success: true, message: `📋 **Whitelist:**\n${list.join('\n')}` };
        }

        if (args.length < 2) {
            return { success: false, message: `Usage: /whitelist ${action} <player>` };
        }

        const player = args[1];

        if (action === 'add') {
            return await this.botManager.addToWhitelist(player);
        } else if (action === 'remove' || action === 'delete') {
            return await this.botManager.removeFromWhitelist(player);
        } else {
            return { success: false, message: 'Unknown whitelist action. Use add, remove, or list.' };
        }
    }

    // /protect 1
    async handleProtect(args) {
        if (args.length === 0) {
            return { success: false, message: 'Usage: /protect <slot>' };
        }

        const slot = parseInt(args[0]);
        if (isNaN(slot)) {
            return { success: false, message: 'Invalid slot number' };
        }

        return this.botManager.toggleProtection(slot);
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
🤖 *Minecraft Bot Manager Help*

💬 *Messaging:*
/say <slot> <msg> - Send to specific slot
/say <slot>,<slot> <msg> - Send to multiple
/say <start>-<end> <msg> - Send to range
/all <msg> - Send to all bots

📊 *Status & Info:*
/status [slot] - Check status (or /s)
/inv <slot> - Check inventory

🎮 *Controls:*
/start <slot> - Start bot
/stop <slot> - Stop bot
/restart <slot|all> - Restart bot(s)
/account add - Add new account
/account remove <slot> - Remove account
/account list - List accounts
/pause <slot> - Pause bot
/resume <slot> - Resume bot

🏃 *Movement:*
/forward <slot> <dist> - Move forward (/f)
/back <slot> <dist> - Move backward (/b)
/left <slot> <dist> - Move left (/l)
/right <slot> <dist> - Move right (/r)

🗑️ *Actions:*
/drop <slot> all - Drop all items
/drop <slot> <item> [count] - Drop specific

🛡️ *Security:*
/whitelist add <name> - Whitelist user
/whitelist remove <name> - Remove user
/whitelist list - Show whitelist
/protect <slot> - Toggle spawner protection
    `.trim();

        return { success: true, message: helpText, parseOptions: { parse_mode: 'Markdown' } };
    }

    handleDiscordHelp() {
        // Return a structure that DiscordBot.js handles to create an Embed
        return {
            success: true,
            type: 'embed',
            data: {
                title: '🛠️ Minecraft Bot Commands',
                description: 'Here are the available commands to control your bots.',
                color: 0x0099FF,
                fields: [
                    {
                        name: '💬 Messaging',
                        value: '`/say 1 <msg>` - Send to slot 1\n`/all <msg>` - Send to all bots\n`/say 1-3 <msg>` - Range send',
                        inline: false
                    },
                    {
                        name: '📊 Status & Info',
                        value: '`/status [1]` - Check status\n`/inv 1` - Check inventory',
                        inline: true
                    },
                    {
                        name: '🎮 Bot Control',
                        value: '`/start 1` - Start bot\n`/stop 1` - Stop bot\n`/restart 1` - Restart bot\n`/account add` - Add Account\n`/account remove 1` - Remove Account\n`/account list` - List Accounts\n`/pause 1` - Pause bot\n`/resume 1` - Resume bot',
                        inline: false
                    },
                    {
                        name: '🏃 Movement',
                        value: '`/forward 1 5` - Move forward\n`/back 1 5` - Move backward\n`/left 1 5` - Move left\n`/right 1 5` - Move right',
                        inline: false
                    },
                    {
                        name: '🗑️ Actions',
                        value: '`/drop 1 all` - Drop all items\n`/drop 1 <item>` - Drop specific',
                        inline: false
                    },
                    {
                        name: '🛡️ Security',
                        value: '`/whitelist add <name>`\n`/whitelist remove <name>`\n`/whitelist list`\n`/protect <slot>` - Toggle protection',
                        inline: false
                    }
                ],
                footer: { text: 'Onur Client Bot Manager' }
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
    `.trim();

        return { success: true, message: helpText };
    }
}
