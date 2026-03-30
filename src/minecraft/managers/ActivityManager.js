import logger from '../../utils/Logger.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const FOOD_ITEMS = new Set([
    'bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken',
    'cooked_mutton', 'cooked_rabbit', 'cooked_cod', 'cooked_salmon',
    'golden_apple', 'apple', 'golden_carrot', 'carrot',
    'baked_potato', 'beetroot', 'melon_slice', 'cookie',
    'beef', 'porkchop', 'chicken', 'mutton', 'rabbit',
    'cod', 'salmon', 'potato', 'beetroot_soup',
    'mushroom_stew', 'rabbit_stew', 'suspicious_stew',
    'sweet_berries', 'glow_berries', 'dried_kelp',
    'pumpkin_pie', 'honey_bottle'
]);

export class ActivityManager {
    constructor(owner) {
        this.owner = owner;
    }

    startAntiAfk() {
        if (this.owner.antiAfkInterval) {
            clearTimeout(this.owner.antiAfkInterval);
            this.owner.antiAfkInterval = null;
        }

        const runTick = async () => {
            if (!this.owner.bot || this.owner.status !== 'online' || this.owner.isPaused || this.owner.isEating || this.owner._protectionRunning) {
                this.owner.antiAfkInterval = setTimeout(runTick, 10000);
                return;
            }

            try {
                const hasAfkAnchor = !!this.owner.getAfkAnchor();
                if (!hasAfkAnchor && Math.random() > 0.3) {
                    this.owner.bot.setControlState('jump', true);
                    setTimeout(() => {
                        if (this.owner.bot) this.owner.bot.setControlState('jump', false);
                    }, 100 + Math.random() * 100);
                }

                if (Math.random() > 0.5) {
                    const currentYaw = this.owner.bot.entity.yaw;
                    const currentPitch = this.owner.bot.entity.pitch;
                    const newYaw = currentYaw + (Math.random() - 0.5) * 0.2;
                    const newPitch = currentPitch + (Math.random() - 0.5) * 0.1;
                    await this.owner.bot.look(newYaw, newPitch, true);
                }

                const baseDelay = this.owner.config.settings.antiAfkInterval || 30000;
                const randomDelay = baseDelay * (0.8 + Math.random() * 0.7);
                this.owner.antiAfkInterval = setTimeout(runTick, randomDelay);
            } catch (_) {
                this.owner.antiAfkInterval = setTimeout(runTick, 10000);
            }
        };

        this.owner.antiAfkInterval = setTimeout(runTick, 5000 + (this.owner.slot * 2000));
    }

    async startAutoEat() {
        const checkInterval = 5000;

        const checkFood = async () => {
            let nextDelay = checkInterval + (this.owner.slot * 200);

            if (!this.owner.bot || this.owner.status !== 'online' || this.owner.isPaused || this.owner._protectionRunning) {
                this.owner.autoEatTimeout = setTimeout(checkFood, checkInterval);
                return;
            }

            try {
                if (!this.owner.isEating) {
                    await this.owner.equipPickaxe();
                }

                const food = this.owner.bot.food;

                if (food < 14) {
                    const foodItem = this.owner.bot.inventory.items().find(item => FOOD_ITEMS.has(item.name));

                    if (foodItem) {
                        this.owner.isEating = true;

                        const eatTask = async () => {
                            await this.owner.bot.equip(foodItem, 'hand');
                            await this.owner.bot.consume();
                        };

                        const timeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Eat operation timed out')), 5000)
                        );

                        await Promise.race([eatTask(), timeoutPromise]);

                        this.owner.isEating = false;
                        this.owner.eatTimeoutCount = 0;
                        logger.info(`Slot ${this.owner.slot}: Ate ${foodItem.name} (food: ${food} -> ${this.owner.bot.food})`);

                        await this.owner.equipPickaxe();
                    } else {
                        logger.warn(`Slot ${this.owner.slot}: Hungry (food: ${food}) but no food in inventory!`);
                    }
                }
            } catch (error) {
                this.owner.isEating = false;
                if (error.message.includes('Promise timed out') || error.message.includes('Eat operation timed out')) {
                    this.owner.eatTimeoutCount++;
                    if (this.owner.eatTimeoutCount <= 3) {
                        logger.warn(`Slot ${this.owner.slot}: Auto-eat timed out (${this.owner.eatTimeoutCount}/3). Retrying in 30s.`);
                    }
                    nextDelay = this.owner.eatTimeoutCount > 3 ? 60000 : 30000;
                } else {
                    logger.error(`Slot ${this.owner.slot}: Auto-eat error: ${error.message}`);
                    nextDelay = 10000;
                }
                await this.owner.equipPickaxe();
            } finally {
                this.owner.autoEatTimeout = setTimeout(checkFood, nextDelay);
            }
        };

        this.owner.autoEatTimeout = setTimeout(checkFood, checkInterval);
    }

    startProximityCheck() {
        const checkInterval = 2500 + (this.owner.slot * 100);

        this.owner.proximityInterval = setInterval(() => {
            if (!this.owner.bot || this.owner.status !== 'online' || this.owner.isPaused || this.owner.isInLobby) return;

            const cooldown = this.owner.config.settings.alertCooldown || 300000;
            const now = Date.now();
            const currentWhitelist = (this.owner.config.settings.alertWhitelist || []).map(u => u.toLowerCase());

            const players = Object.values(this.owner.bot.entities).filter(e =>
                e.type === 'player' &&
                e.username !== this.owner.accountConfig.username &&
                !currentWhitelist.includes(e.username.toLowerCase()) &&
                e.position && this.owner.bot.entity
            );

            for (const entity of players) {
                const distance = this.owner.bot.entity.position.distanceTo(entity.position);
                const emergencyDistance = this.owner.config.settings.protection?.emergencyDistance || 10;

                if (distance <= emergencyDistance) {
                    logger.error(`Slot ${this.owner.slot}: 🚨 EMERGENCY: ${entity.username} at ${Math.round(distance)}m! DISCONNECTING! 🚨`);
                    if (this.owner.onProximityAlert) this.owner.onProximityAlert(entity.username, distance);
                    this.owner._protectionRunning = false;
                    this.owner.stop();
                    return;
                }

                const lastAlert = this.owner.alertCooldowns.get(entity.username) || 0;
                if (now - lastAlert > cooldown) {
                    this.owner.alertCooldowns.set(entity.username, now);
                    logger.info(`Slot ${this.owner.slot}: Threat detected (${entity.username} at ${Math.round(distance)}m).`);

                    this.owner.executeProtection();

                    this.owner.stats.alertsTriggered++;
                    if (this.owner.onProximityAlert) this.owner.onProximityAlert(entity.username, distance);
                }
            }
        }, checkInterval);
    }

    isEnemyNearby() {
        if (!this.owner.bot || !this.owner.bot.entity) return false;
        const emergencyDistance = this.owner.config.settings.protection?.emergencyDistance || 10;

        const myUsername = this.owner.accountConfig.username;
        const currentWhitelist = (this.owner.config.settings.alertWhitelist || []).map(u => u.toLowerCase());

        for (const id in this.owner.bot.entities) {
            const entity = this.owner.bot.entities[id];
            if (entity.type !== 'player' || entity.username === myUsername) continue;
            if (currentWhitelist.includes(entity.username.toLowerCase())) continue;
            if (!entity.position) continue;

            const dist = this.owner.bot.entity.position.distanceTo(entity.position);
            if (dist <= emergencyDistance) return true;
        }
        return false;
    }
}
