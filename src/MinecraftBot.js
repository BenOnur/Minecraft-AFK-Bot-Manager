import mineflayer from 'mineflayer';
import logger from './utils/Logger.js';

export class MinecraftBot {
    constructor(config, accountConfig) {
        this.config = config;
        this.accountConfig = accountConfig;
        this.slot = accountConfig.slot;
        this.bot = null;
        this.status = 'offline';
        this.isPaused = false;
        this.isConnecting = false;
        this.isManuallyStopped = false;
        this.reconnectAttempts = 0;
        this.antiAfkInterval = null;
        this.proximityInterval = null;
        this.autoEatInterval = null;
        this.alertCooldowns = new Map(); // username -> lastAlertTime
        this.onProximityAlert = null; // Callback function
        this.tempReconnectDelay = null; // Temporary override for reconnect delay
    }

    async start() {
        if (this.bot) {
            logger.warn(`Slot ${this.slot}: Bot already running`);
            return false;
        }

        if (this.isConnecting) {
            logger.warn(`Slot ${this.slot}: Bot is already connecting...`);
            return false;
        }

        if (this.isPaused) {
            logger.info(`Slot ${this.slot}: Bot is paused, resuming...`);
            this.isPaused = false;
            return true;
        }

        try {
            this.isConnecting = true;
            this.isManuallyStopped = false;
            logger.info(`Slot ${this.slot}: Starting bot for ${this.accountConfig.username}`);

            const botOptions = {
                host: this.config.minecraft.server.host,
                port: this.config.minecraft.server.port,
                username: this.accountConfig.username,
                auth: this.accountConfig.auth || 'microsoft',
                version: this.config.minecraft.server.version || false,
                hideErrors: false,
                profilesFolder: `./sessions/${this.accountConfig.username || 'temp_' + Date.now()}`,
                onMsaCode: (data) => {
                    if (this.accountConfig.onMsaCode) {
                        this.accountConfig.onMsaCode(data);
                    } else {
                        logger.info(`Slot ${this.slot}: MSA Code: ${data.user_code} (Link: ${data.verification_uri})`);
                    }
                }
            };

            this.bot = mineflayer.createBot(botOptions);
            this.setupEventHandlers();
            return true;
        } catch (error) {
            this.isConnecting = false;
            logger.error(`Slot ${this.slot}: Failed to start bot: ${error.message}`);
            this.status = 'error';
            return false;
        }
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            logger.info(`Slot ${this.slot}: Logged in successfully`);
            this.status = 'online';
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            if (this.config.settings.antiAfkEnabled) {
                this.startAntiAfk();
            }
            if (this.config.settings.proximityAlertEnabled) {
                this.startProximityCheck();
            }

            if (this.onConnect) {
                this.onConnect(this.config.minecraft.server.host, this.config.minecraft.server.version || this.bot.version);
            }

            // Start auto-eat monitoring
            this.startAutoEat();
        });

        this.bot.on('spawn', () => {
            logger.info(`Slot ${this.slot}: Spawned in game`);
        });

        this.bot.on('end', () => {
            this.isConnecting = false;
            logger.warn(`Slot ${this.slot}: Connection ended`);
            this.cleanup();

            if (this.config.settings.autoReconnect && !this.isPaused) {
                this.handleReconnect();
            }
        });

        this.bot.on('kicked', (reason) => {
            this.isConnecting = false;
            logger.warn(`Slot ${this.slot}: Kicked from reason: ${reason}`);
            this.status = 'kicked';

            // Check for "already online" message
            const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
            if (reasonStr.includes('already online') || reasonStr.includes('already connected')) {
                logger.warn(`Slot ${this.slot}: Detected 'already online' error. Waiting 6s before reconnect.`);
                this.tempReconnectDelay = 6000;
            }
        });

        this.bot.on('error', (error) => {
            this.isConnecting = false;
            logger.error(`Slot ${this.slot}: Error: ${error.message}`);
            this.status = 'error';
        });

        this.bot.on('messagestr', (message) => {
            logger.info(`Slot ${this.slot}: Chat: ${message}`);
        });
    }

    startAntiAfk() {
        const interval = this.config.settings.antiAfkInterval || 30000;

        this.antiAfkInterval = setInterval(() => {
            if (this.bot && this.status === 'online' && !this.isPaused) {
                // Basit anti-AFK hareketi
                this.bot.setControlState('jump', true);
                setTimeout(() => {
                    if (this.bot) this.bot.setControlState('jump', false);
                }, 100);
            }
        }, interval);
    }

    startAutoEat() {
        const checkInterval = 5000; // Check every 5 seconds

        this.autoEatInterval = setInterval(async () => {
            if (!this.bot || this.status !== 'online' || this.isPaused) return;

            try {
                const food = this.bot.food;

                // Start eating when food level drops below 14 (7 shanks)
                if (food < 14) {
                    const foodItem = this.bot.inventory.items().find(item =>
                        item.name.includes('bread') ||
                        item.name.includes('beef') ||
                        item.name.includes('porkchop') ||
                        item.name.includes('chicken') ||
                        item.name.includes('mutton') ||
                        item.name.includes('rabbit') ||
                        item.name.includes('cod') ||
                        item.name.includes('salmon') ||
                        item.name.includes('apple') ||
                        item.name.includes('carrot') ||
                        item.name.includes('potato') ||
                        item.name.includes('beetroot') ||
                        item.name.includes('melon') ||
                        item.name.includes('cookie') ||
                        item.name.includes('steak')
                    );

                    if (foodItem) {
                        await this.bot.equip(foodItem, 'hand');
                        await this.bot.consume();
                        logger.info(`Slot ${this.slot}: Ate ${foodItem.name} (food: ${food} -> ${this.bot.food})`);
                    } else {
                        logger.warn(`Slot ${this.slot}: Hungry (food: ${food}) but no food in inventory!`);
                    }
                }
            } catch (error) {
                logger.error(`Slot ${this.slot}: Auto-eat error: ${error.message}`);
            }
        }, checkInterval);
    }

    startProximityCheck() {
        const checkInterval = 1000; // Check every second

        this.proximityInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online' || this.isPaused) return;

            const players = this.bot.entities;
            const alertDistance = this.config.settings.alertDistance || 96;
            const cooldown = this.config.settings.alertCooldown || 300000; // 5 mins
            const now = Date.now();

            for (const id in players) {
                const entity = players[id];
                if (entity.type !== 'player' || entity.username === this.accountConfig.username) continue;

                // Check whitelist (case-insensitive)
                if (this.config.settings.alertWhitelist) {
                    const lowerWhitelist = this.config.settings.alertWhitelist.map(u => u.toLowerCase());
                    if (lowerWhitelist.includes(entity.username.toLowerCase())) continue;
                }

                if (!entity.position) continue;
                if (!this.bot.entity) continue;

                const distance = this.bot.entity.position.distanceTo(entity.position);

                // EMERGENCY DISCONNECT CHECK
                // Used defaults: emergencyDistance = 10 blocks
                const emergencyDistance = this.config.settings.protection?.emergencyDistance || 10;

                if (distance <= emergencyDistance && this.config.settings.protection?.enabled) {
                    logger.error(`Slot ${this.slot}: 🚨 EMERGENCY: Player ${entity.username} is too close (${Math.round(distance)}m)! DISCONNECTING IMMEDIATELY! 🚨`);

                    // Send alert before quitting
                    const message = `🚨 **EMERGENCY DISCONNECT** 🚨\nSlot ${this.slot} detected **${entity.username}** at **${Math.round(distance)}** blocks! Exiting immediately!`;
                    if (this.onProximityAlert) {
                        this.onProximityAlert(entity.username, distance); // Basic alert callback
                    }
                    // Force generic alert (BotManager handles it)
                    // Since we can't easily call botManager methods directly, we rely on the callback or just quitting.
                    // The disconnect event might logicly handle reconnect, but for protection we might want to stay offline?
                    // Current 'stop()' implementation sets isManuallyStopped=true which prevents auto-reconnect. Perfect.

                    this.stop();
                    return; // Stop processing other entities
                }

                if (distance <= alertDistance) {
                    const lastAlert = this.alertCooldowns.get(entity.username) || 0;

                    if (now - lastAlert > cooldown) {
                        this.alertCooldowns.set(entity.username, now);

                        // Trigger Spawner Protection if enabled
                        if (this.config.settings.protection && this.config.settings.protection.enabled) {
                            // execProtection sends start msg
                            this.executeProtection();
                        }

                        // Send 5 alerts as requested
                        let count = 0;
                        const alertLoop = setInterval(() => {
                            count++;
                            if (this.onProximityAlert) {
                                this.onProximityAlert(entity.username, distance);
                            }
                            if (count >= 5) clearInterval(alertLoop);
                        }, 1000); // 1-second interval for 5 alerts
                    }
                }
            }
        }, checkInterval);
    }

    async executeProtection() {
        if (!this.bot || this.status !== 'online') return;

        logger.warn(`Slot ${this.slot}: 🛡️ INITIATING SPAWNER PROTECTION PROTOCOL 🛡️`);

        const blockName = this.config.settings.protection.blockType || 'spawner';
        const radius = this.config.settings.protection.radius || 5;
        const breakDelay = this.config.settings.protection.breakDelay || 1500;

        // Find blocks
        const blocks = this.bot.findBlocks({
            matching: (block) => block.name === blockName,
            maxDistance: radius,
            count: 100
        });

        if (blocks.length === 0) {
            logger.info(`Slot ${this.slot}: No ${blockName} found to break.`);
            // Disconnect anyway as a safety measure? User said "break all... AND THEN quit".
            // If no spawners, maybe user still wants to quit due to intruder.
            // Let's quit to be safe.
            logger.info(`Slot ${this.slot}: Disconnecting for safety.`);
            this.stop();
            return;
        }

        logger.info(`Slot ${this.slot}: Found ${blocks.length} ${blockName}(s). Starting destruction.`);

        // Equip Pickaxe
        const pickaxe = this.bot.inventory.items().find(item => item.name.includes('pickaxe'));
        if (pickaxe) {
            try {
                await this.bot.equip(pickaxe, 'hand');
                logger.info(`Slot ${this.slot}: Equipped ${pickaxe.name}`);
            } catch (error) {
                logger.error(`Slot ${this.slot}: Failed to equip pickaxe: ${error.message}`);
            }
        } else {
            logger.warn(`Slot ${this.slot}: No pickaxe found! Breaking with hand (slow).`);
        }

        // Sneak
        this.bot.setControlState('sneak', true);

        for (const pos of blocks) {
            // Safety check: if emergency disconnect happened, stop loop
            if (!this.bot) return;

            const block = this.bot.blockAt(pos);
            if (!block) continue;

            try {
                // Look at block
                await this.bot.lookAt(pos);

                // Safety check before digging
                if (!this.bot) return;

                // Dig
                // Note: 'dig' automatically checks range, but we assume we are close enough based on 'findBlocks' radius
                logger.info(`Slot ${this.slot}: Breaking ${block.name} at ${pos}`);
                await this.bot.dig(block);
                logger.info(`Slot ${this.slot}: Broken ${block.name}`);

                // Wait 3 seconds
                await new Promise(resolve => setTimeout(resolve, breakDelay));
            } catch (err) {
                logger.error(`Slot ${this.slot}: Failed to break block at ${pos}: ${err.message}`);
                // Continue to next block even if one fails
            }
        }

        this.bot.setControlState('sneak', false);
        logger.info(`Slot ${this.slot}: Protection protocol complete. Disconnecting.`);

        // Disconnect
        this.stop();
    }

    handleReconnect() {
        if (this.isManuallyStopped) {
            logger.info(`Slot ${this.slot}: Reconnect skipped - bot was manually stopped`);
            return;
        }

        if (this.reconnectAttempts >= this.config.settings.maxReconnectAttempts) {
            logger.error(`Slot ${this.slot}: Max reconnect attempts reached`);
            this.status = 'failed';
            return;
        }

        this.reconnectAttempts++;
        const delay = this.tempReconnectDelay || this.config.settings.reconnectDelay || 5000;

        // Reset temp delay after use
        this.tempReconnectDelay = null;

        logger.info(`Slot ${this.slot}: Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.config.settings.maxReconnectAttempts})`);

        setTimeout(() => {
            if (!this.isManuallyStopped) {
                this.start();
            }
        }, delay);
    }

    async stop() {
        if (!this.bot) {
            logger.warn(`Slot ${this.slot}: Bot is not running`);
            return false;
        }

        this.isManuallyStopped = true;
        logger.info(`Slot ${this.slot}: Stopping bot`);
        if (this.bot) {
            this.bot.quit();
        }
        this.cleanup();
        return true;
    }

    pause() {
        if (!this.bot) {
            logger.warn(`Slot ${this.slot}: Bot is not running`);
            return false;
        }

        this.isPaused = true;
        logger.info(`Slot ${this.slot}: Bot paused`);
        return true;
    }

    resume() {
        if (!this.bot) {
            logger.warn(`Slot ${this.slot}: Bot is not running`);
            return false;
        }

        this.isPaused = false;
        logger.info(`Slot ${this.slot}: Bot resumed`);
        return true;
    }

    async restart() {
        logger.info(`Slot ${this.slot}: Restarting bot`);
        await this.stop();

        setTimeout(() => {
            this.start();
        }, 2000);

        return true;
    }

    async move(direction, distance) {
        if (!this.bot || this.status !== 'online' || this.isPaused) {
            return { success: false, message: 'Bot not ready' };
        }

        const validDirections = ['forward', 'back', 'left', 'right'];
        if (!validDirections.includes(direction)) {
            return { success: false, message: 'Invalid direction' };
        }

        if (isNaN(distance) || distance <= 0) {
            return { success: false, message: 'Invalid distance' };
        }

        const startPos = this.bot.entity.position.clone();
        this.bot.setControlState(direction, true);

        // Jumping removed as requested by user

        return new Promise((resolve) => {
            let isResolved = false;

            const checkInterval = setInterval(() => {
                if (!this.bot) {
                    clearInterval(checkInterval);
                    if (!isResolved) {
                        isResolved = true;
                        resolve({ success: false, message: 'Bot disconnected' });
                    }
                    return;
                }

                const currentDist = this.bot.entity.position.distanceTo(startPos);

                if (currentDist >= distance) {
                    this.bot.setControlState(direction, false);
                    clearInterval(checkInterval);
                    if (!isResolved) {
                        isResolved = true;
                        resolve({ success: true, message: `Moved ${direction} ${Math.round(currentDist)} blocks` });
                    }
                }
            }, 50);

            // Timeout after reasonable time (e.g. 1 sec per block + 2 sec buffer)
            const timeoutMs = (distance * 1000) + 2000;
            setTimeout(() => {
                if (!isResolved) {
                    clearInterval(checkInterval);
                    if (this.bot) {
                        this.bot.setControlState(direction, false);
                    }
                    isResolved = true;
                    const moved = this.bot ? Math.round(this.bot.entity.position.distanceTo(startPos)) : 0;
                    resolve({ success: true, message: `Movement timed out (moved ${moved} blocks)` });
                }
            }, timeoutMs);
        });
    }

    sendChat(message) {
        if (!this.bot || this.status !== 'online' || this.isPaused) {
            logger.warn(`Slot ${this.slot}: Cannot send chat message - bot not ready`);
            return false;
        }

        try {
            this.bot.chat(message);
            logger.info(`Slot ${this.slot}: Sent message: ${message}`);
            return true;
        } catch (error) {
            logger.error(`Slot ${this.slot}: Failed to send message: ${error.message}`);
            return false;
        }
    }

    getInventory() {
        if (!this.bot || this.status !== 'online') {
            return null;
        }

        const items = this.bot.inventory.items().map(item => ({
            name: item.name,
            count: item.count,
            slot: item.slot
        }));

        return items;
    }

    async dropItem(itemName, count = null) {
        if (!this.bot || this.status !== 'online') {
            return { success: false, message: 'Bot not ready' };
        }

        try {
            const items = this.bot.inventory.items().filter(item =>
                itemName === 'all' || item.name.includes(itemName)
            );

            if (items.length === 0) {
                return { success: false, message: 'Item not found' };
            }

            const droppedItems = [];

            for (const item of items) {
                const dropCount = count || item.count;
                await this.bot.toss(item.type, null, dropCount);
                logger.info(`Slot ${this.slot}: Dropped ${dropCount}x ${item.name}`);
                droppedItems.push(`${dropCount}x ${item.name}`);
            }

            return {
                success: true,
                message: `Dropped: ${droppedItems.join(', ')}`
            };
        } catch (error) {
            logger.error(`Slot ${this.slot}: Failed to drop item: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    cleanup() {
        if (this.antiAfkInterval) {
            clearInterval(this.antiAfkInterval);
            this.antiAfkInterval = null;
        }
        if (this.proximityInterval) {
            clearInterval(this.proximityInterval);
            this.proximityInterval = null;
        }
        if (this.autoEatInterval) {
            clearInterval(this.autoEatInterval);
            this.autoEatInterval = null;
        }

        this.bot = null;
        this.status = 'offline';
    }

    getStatus() {
        return {
            slot: this.slot,
            username: this.accountConfig.username,
            status: this.status,
            isPaused: this.isPaused,
            reconnectAttempts: this.reconnectAttempts,
            health: this.bot?.health,
            food: this.bot?.food,
            position: this.bot?.entity?.position
        };
    }
}
