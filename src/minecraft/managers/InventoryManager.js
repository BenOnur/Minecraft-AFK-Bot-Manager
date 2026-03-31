import logger from '../../utils/Logger.js';

function getMaxDurability(toolName) {
    const durabilities = {
        wooden_pickaxe: 59,
        stone_pickaxe: 131,
        iron_pickaxe: 250,
        golden_pickaxe: 32,
        diamond_pickaxe: 1561,
        netherite_pickaxe: 2031,
        wooden_axe: 59,
        stone_axe: 131,
        iron_axe: 250,
        golden_axe: 32,
        diamond_axe: 1561,
        netherite_axe: 2031,
        wooden_sword: 59,
        stone_sword: 131,
        iron_sword: 250,
        golden_sword: 32,
        diamond_sword: 1561,
        netherite_sword: 2031,
        wooden_shovel: 59,
        stone_shovel: 131,
        iron_shovel: 250,
        golden_shovel: 32,
        diamond_shovel: 1561,
        netherite_shovel: 2031
    };
    return durabilities[toolName] || null;
}

const PICKAXE_PRIORITY = {
    netherite_pickaxe: 600,
    diamond_pickaxe: 500,
    iron_pickaxe: 400,
    stone_pickaxe: 300,
    golden_pickaxe: 200,
    wooden_pickaxe: 100
};

function getPickaxeScore(item) {
    if (!item || !item.name || !item.name.includes('pickaxe')) return -1;

    const base = PICKAXE_PRIORITY[item.name] ?? 0;
    const durability = getMaxDurability(item.name);
    const damage = item?.nbt?.value?.Damage?.value ?? item?.durabilityUsed ?? 0;
    const remaining = durability ? Math.max(0, durability - damage) : 0;

    return (base * 10000) + remaining;
}

export class InventoryManager {
    constructor(owner) {
        this.owner = owner;
    }

    getBestPickaxe() {
        if (!this.owner.bot) return null;

        const pickaxes = this.owner.bot.inventory.items().filter(item => item.name.includes('pickaxe'));
        if (pickaxes.length === 0) return null;

        pickaxes.sort((a, b) => getPickaxeScore(b) - getPickaxeScore(a));
        return pickaxes[0];
    }

    async equipPickaxe(force = false) {
        if (!this.owner.bot) return;

        const bestPickaxe = this.getBestPickaxe();
        if (!bestPickaxe) return;

        const heldItem = this.owner.bot.inventory.slots[this.owner.bot.getEquipmentDestSlot('hand')];
        if (!force && heldItem && heldItem.name === bestPickaxe.name) return;

        try {
            await this.owner.bot.equip(bestPickaxe, 'hand');
            logger.info(`Slot ${this.owner.slot}: Equipped ${bestPickaxe.name}`);
        } catch (error) {
            logger.error(`Slot ${this.owner.slot}: Failed to equip pickaxe: ${error.message}`);
        }
    }

    startInventoryMonitor() {
        if (this.owner.inventoryMonitorInterval) {
            clearInterval(this.owner.inventoryMonitorInterval);
        }

        this.owner.inventoryAlertSent = false;
        this.owner.toolAlertSent.clear();

        this.owner.inventoryMonitorInterval = setInterval(() => {
            if (!this.owner.bot || this.owner.status !== 'online' || this.owner.isInLobby) return;

            const totalSlots = 36;
            const emptySlots = this.owner.bot.inventory.emptySlotCount();
            const usedSlots = totalSlots - emptySlots;

            if (emptySlots <= 3 && !this.owner.inventoryAlertSent) {
                this.owner.inventoryAlertSent = true;
                const msg = emptySlots === 0
                    ? `📦 **Slot ${this.owner.slot}:** Envanter **DOLU!** (${usedSlots}/${totalSlots})`
                    : `📦 **Slot ${this.owner.slot}:** Envanter neredeyse dolu! (${usedSlots}/${totalSlots} - ${emptySlots} slot kaldı)`;
                if (this.owner.onInventoryAlert) this.owner.onInventoryAlert(msg);
            } else if (emptySlots > 5) {
                this.owner.inventoryAlertSent = false;
            }

            const tools = this.owner.bot.inventory.items().filter(item =>
                item.name.includes('pickaxe') || item.name.includes('sword') ||
                item.name.includes('axe') || item.name.includes('shovel')
            );

            for (const tool of tools) {
                if (tool.durabilityUsed !== undefined && tool.maxDurability) {
                    const remaining = tool.maxDurability - tool.durabilityUsed;
                    const percent = Math.round((remaining / tool.maxDurability) * 100);

                    if (percent <= 10 && !this.owner.toolAlertSent.has(tool.slot)) {
                        this.owner.toolAlertSent.add(tool.slot);
                        const msg = `⚠️ **Slot ${this.owner.slot}:** **${tool.name}** dayanıklılığı çok düşük! (%${percent} - ${remaining}/${tool.maxDurability})`;
                        if (this.owner.onInventoryAlert) this.owner.onInventoryAlert(msg);
                    }
                }

                if (tool.nbt?.value?.Damage?.value !== undefined) {
                    const maxDur = getMaxDurability(tool.name);
                    if (maxDur) {
                        const damage = tool.nbt.value.Damage.value;
                        const remaining = maxDur - damage;
                        const percent = Math.round((remaining / maxDur) * 100);

                        if (percent <= 10 && !this.owner.toolAlertSent.has(tool.slot)) {
                            this.owner.toolAlertSent.add(tool.slot);
                            const msg = `⚠️ **Slot ${this.owner.slot}:** **${tool.name}** dayanıklılığı çok düşük! (%${percent})`;
                            if (this.owner.onInventoryAlert) this.owner.onInventoryAlert(msg);
                        }
                    }
                }
            }
        }, 60000);
    }

    getInventory() {
        if (!this.owner.bot || this.owner.status !== 'online') {
            return null;
        }

        return this.owner.bot.inventory.items().map(item => ({
            name: item.name,
            count: item.count,
            slot: item.slot
        }));
    }

    async dropItem(itemName, count = null) {
        if (!this.owner.bot || this.owner.status !== 'online') {
            return { success: false, message: 'Bot not ready' };
        }

        try {
            const items = this.owner.bot.inventory.items().filter(item =>
                itemName === 'all' || item.name.includes(itemName)
            );

            if (items.length === 0) {
                return { success: false, message: 'Item not found' };
            }

            const droppedItems = [];

            for (const item of items) {
                const dropCount = count || item.count;
                await this.owner.bot.toss(item.type, null, dropCount);
                logger.info(`Slot ${this.owner.slot}: Dropped ${dropCount}x ${item.name}`);
                droppedItems.push(`${dropCount}x ${item.name}`);
            }

            return {
                success: true,
                message: `Dropped: ${droppedItems.join(', ')}`
            };
        } catch (error) {
            logger.error(`Slot ${this.owner.slot}: Failed to drop item: ${error.message}`);
            return { success: false, message: error.message };
        }
    }
}
