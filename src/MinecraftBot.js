import mineflayer from 'mineflayer';
import logger from './utils/Logger.js';

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
        this.autoEatTimeout = null;
        this.alertCooldowns = new Map();
        this.onProximityAlert = null;
        this.onLobbyDetected = null;
        this.tempReconnectDelay = null;
        this.protectionEnabled = this.config.settings.protection?.enabled || false;
        this.lastPosition = null;
        this.isInLobby = false;
        this.lobbyRetryInterval = null;

        this._cachedWhitelist = (this.config.settings.alertWhitelist || []).map(u => u.toLowerCase());
    }

    async start() {
        if (this.isConnecting) {
            logger.warn(`Slot ${this.slot}: Already connecting`);
            return false;
        }

        if (this.bot) {
            logger.warn(`Slot ${this.slot}: Bot is already running`);
            return false;
        }

        this.isConnecting = true;
        this.isManuallyStopped = false;
        this.status = 'connecting';

        try {
            logger.info(`Slot ${this.slot}: Starting bot for ${this.accountConfig.username}`);

            const botOptions = {
                host: this.config.minecraft.server.host,
                port: this.config.minecraft.server.port || 25565,
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

            this.startAutoEat();
        });

        this.bot.on('spawn', () => {
            logger.info(`Slot ${this.slot}: Spawned in game`);

            // Lobby/maintenance detection: if position changed drastically
            if (this.lastPosition && this.bot && this.bot.entity) {
                const currentPos = this.bot.entity.position;
                const distance = this.lastPosition.distanceTo(currentPos);

                if (distance > 200 && !this.isInLobby) {
                    logger.warn(`Slot ${this.slot}: 🏢 LOBBY DETECTED! Teleported ${Math.round(distance)} blocks.`);
                    this.enterLobbyMode();
                    return;
                }
            }

            // If returning from lobby: check if back near original position
            if (this.isInLobby && this.lastPosition && this.bot && this.bot.entity) {
                const currentPos = this.bot.entity.position;
                const distToHome = this.lastPosition.distanceTo(currentPos);

                if (distToHome < 50) {
                    this.exitLobbyMode();
                }
            }

            // Save position for future lobby detection (only when not in lobby)
            if (!this.isInLobby && this.bot && this.bot.entity) {
                this.lastPosition = this.bot.entity.position.clone();
            }
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

            // Detect teleportation via chat (e.g., server /spawn, /warp)
            const msg = message.toLowerCase();
            if (msg.includes('teleported') || msg.includes('ışınlandı')) {
                if (!this.isInLobby) {
                    // Teleported AWAY from home → enter lobby mode
                    logger.warn(`Slot ${this.slot}: 🏢 TELEPORT DETECTED via chat: "${message}". Entering lobby mode.`);
                    this.enterLobbyMode();
                } else {
                    // Already in lobby → might be returning home via /home sp1
                    setTimeout(() => {
                        if (this.bot && this.bot.entity && this.lastPosition && this.isInLobby) {
                            const dist = this.bot.entity.position.distanceTo(this.lastPosition);
                            if (dist < 50) {
                                this.exitLobbyMode();
                            }
                        }
                    }, 1500);
                }
            }
        });
    }

    enterLobbyMode() {
        this.isInLobby = true;

        // Stop proximity and anti-afk (not needed while teleported)
        if (this.proximityInterval) {
            clearInterval(this.proximityInterval);
            this.proximityInterval = null;
        }
        if (this.antiAfkInterval) {
            clearInterval(this.antiAfkInterval);
            this.antiAfkInterval = null;
        }

        // Notify
        if (this.onLobbyDetected) {
            this.onLobbyDetected(true);
        }

        // Start retry loop to return home
        this.startLobbyRetry();
    }

    exitLobbyMode() {
        logger.info(`Slot ${this.slot}: ✅ Returned from lobby! Resuming normal operation.`);
        this.isInLobby = false;
        this.stopLobbyRetry();

        if (this.onLobbyDetected) {
            this.onLobbyDetected(false);
        }

        if (this.config.settings.antiAfkEnabled) {
            this.startAntiAfk();
        }
        if (this.config.settings.proximityAlertEnabled) {
            this.startProximityCheck();
        }
    }

    startAntiAfk() {
        const interval = this.config.settings.antiAfkInterval || 30000;

        this.antiAfkInterval = setInterval(() => {
            if (this.bot && this.status === 'online' && !this.isPaused) {
                this.bot.setControlState('jump', true);
                setTimeout(() => {
                    if (this.bot) this.bot.setControlState('jump', false);
                }, 100);
            }
        }, interval);
    }

    async startAutoEat() {
        const checkInterval = 5000;

        const checkFood = async () => {
            let nextDelay = checkInterval;

            if (!this.bot || this.status !== 'online' || this.isPaused) {
                this.autoEatTimeout = setTimeout(checkFood, checkInterval);
                return;
            }

            try {
                const food = this.bot.food;

                if (food < 14) {
                    const foodItem = this.bot.inventory.items().find(item =>
                        FOOD_ITEMS.has(item.name)
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
                if (error.message.includes('Promise timed out')) {
                    logger.warn(`Slot ${this.slot}: Auto-eat timed out. Retrying in 30s.`);
                    nextDelay = 30000;
                } else {
                    logger.error(`Slot ${this.slot}: Auto-eat error: ${error.message}`);
                    nextDelay = 10000;
                }
            } finally {
                this.autoEatTimeout = setTimeout(checkFood, nextDelay);
            }
        };

        this.autoEatTimeout = setTimeout(checkFood, checkInterval);
    }

    startProximityCheck() {
        this.proximityInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online' || this.isPaused || this.isInLobby) return;

            const alertDistance = this.config.settings.alertDistance || 96;
            const cooldown = this.config.settings.alertCooldown || 300000;
            const now = Date.now();

            for (const id in this.bot.entities) {
                const entity = this.bot.entities[id];
                if (entity.type !== 'player' || entity.username === this.accountConfig.username) continue;
                if (this._cachedWhitelist.includes(entity.username.toLowerCase())) continue;
                if (!entity.position || !this.bot.entity) continue;

                const distance = this.bot.entity.position.distanceTo(entity.position);

                // Emergency disconnect: player within 10 blocks → disconnect to save inventory
                const emergencyDistance = this.config.settings.protection?.emergencyDistance || 10;
                if (distance <= emergencyDistance) {
                    logger.error(`Slot ${this.slot}: 🚨 EMERGENCY: ${entity.username} at ${Math.round(distance)}m! DISCONNECTING to save inventory! 🚨`);
                    if (this.onProximityAlert) {
                        this.onProximityAlert(entity.username, distance);
                    }
                    this._protectionRunning = false;
                    this.stop();
                    return;
                }

                if (distance <= alertDistance) {
                    const lastAlert = this.alertCooldowns.get(entity.username) || 0;

                    if (now - lastAlert > cooldown) {
                        this.alertCooldowns.set(entity.username, now);

                        if (this.config.settings.protection && this.protectionEnabled) {
                            this.executeProtection();
                        }

                        let count = 0;
                        const alertLoop = setInterval(() => {
                            count++;
                            if (this.onProximityAlert) {
                                this.onProximityAlert(entity.username, distance);
                            }
                            if (count >= 5) clearInterval(alertLoop);
                        }, 1000);
                    }
                }
            }
        }, 1000);
    }

    isEnemyNearby() {
        if (!this.bot || !this.bot.entity) return false;
        const emergencyDistance = this.config.settings.protection?.emergencyDistance || 10;

        for (const id in this.bot.entities) {
            const entity = this.bot.entities[id];
            if (entity.type !== 'player' || entity.username === this.accountConfig.username) continue;
            if (this._cachedWhitelist.includes(entity.username.toLowerCase())) continue;
            if (!entity.position) continue;

            const dist = this.bot.entity.position.distanceTo(entity.position);
            if (dist <= emergencyDistance) return true;
        }
        return false;
    }

    async executeProtection() {
        if (!this.bot || this.status !== 'online') return;
        if (this._protectionRunning) return; // Prevent multiple concurrent runs
        this._protectionRunning = true;

        logger.warn(`Slot ${this.slot}: 🛡️ INITIATING SPAWNER PROTECTION PROTOCOL 🛡️`);

        const blockName = this.config.settings.protection.blockType || 'spawner';
        const radius = this.config.settings.protection.radius || 5;
        const breakDelay = this.config.settings.protection.breakDelay || 1500;

        // Equip pickaxe
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

        this.bot.setControlState('sneak', true);

        let totalBroken = 0;

        // Loop: keep scanning and breaking until no spawners remain or inventory full
        while (this.bot && this.status === 'online') {
            // Check inventory fullness (36 slots total, if empty slots <= 0 it's full)
            const emptySlots = this.bot.inventory.emptySlotCount();
            if (emptySlots <= 0) {
                logger.warn(`Slot ${this.slot}: 📦 Inventory FULL! Stopping protection and disconnecting.`);
                break;
            }

            // Scan for spawners
            const blocks = this.bot.findBlocks({
                matching: (block) => block.name === blockName,
                maxDistance: radius,
                count: 100
            });

            if (blocks.length === 0) {
                logger.info(`Slot ${this.slot}: ✅ All ${blockName}s destroyed (${totalBroken} total). Disconnecting.`);
                break;
            }

            logger.info(`Slot ${this.slot}: Found ${blocks.length} ${blockName}(s) remaining. Breaking...`);

            for (const pos of blocks) {
                if (!this.bot) { this._protectionRunning = false; return; }

                // Emergency: check if any enemy is within 10 blocks
                if (this.isEnemyNearby()) {
                    logger.error(`Slot ${this.slot}: 🚨 Enemy too close while breaking! EMERGENCY DISCONNECT! 🚨`);
                    this._protectionRunning = false;
                    this.stop();
                    return;
                }

                // Re-check inventory before each break
                if (this.bot.inventory.emptySlotCount() <= 0) {
                    logger.warn(`Slot ${this.slot}: 📦 Inventory FULL mid-break! Stopping.`);
                    break;
                }

                const block = this.bot.blockAt(pos);
                if (!block || block.name !== blockName) continue;

                try {
                    await this.bot.lookAt(pos);
                    if (!this.bot) { this._protectionRunning = false; return; }

                    logger.info(`Slot ${this.slot}: Breaking ${block.name} at ${pos}`);
                    await this.bot.dig(block);
                    totalBroken++;
                    logger.info(`Slot ${this.slot}: Broken ${block.name} (${totalBroken} total)`);

                    await new Promise(resolve => setTimeout(resolve, breakDelay));
                } catch (err) {
                    logger.error(`Slot ${this.slot}: Failed to break block at ${pos}: ${err.message}`);
                }
            }

            // Small delay before re-scanning
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (this.bot) {
            this.bot.setControlState('sneak', false);
        }
        logger.info(`Slot ${this.slot}: Protection protocol complete. Disconnecting.`);
        this._protectionRunning = false;
        this.stop();
    }

    toggleProtection() {
        this.protectionEnabled = !this.protectionEnabled;
        logger.info(`Slot ${this.slot}: Protection ${this.protectionEnabled ? 'ENABLED' : 'DISABLED'}`);
        return this.protectionEnabled;
    }

    startLobbyRetry() {
        this.stopLobbyRetry();

        logger.info(`Slot ${this.slot}: Starting lobby retry loop (every 30s with /home sp1)`);

        setTimeout(() => {
            if (this.bot && this.isInLobby) {
                this.bot.chat('/home sp1');
                logger.info(`Slot ${this.slot}: Sent /home sp1 (initial attempt)`);
            }
        }, 10000);

        this.lobbyRetryInterval = setInterval(() => {
            if (!this.bot || !this.isInLobby) {
                this.stopLobbyRetry();
                return;
            }

            logger.info(`Slot ${this.slot}: Retrying /home sp1...`);
            this.bot.chat('/home sp1');
        }, 30000);
    }

    stopLobbyRetry() {
        if (this.lobbyRetryInterval) {
            clearInterval(this.lobbyRetryInterval);
            this.lobbyRetryInterval = null;
        }
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

        return this.bot.inventory.items().map(item => ({
            name: item.name,
            count: item.count,
            slot: item.slot
        }));
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
        if (this.autoEatTimeout) {
            clearTimeout(this.autoEatTimeout);
            this.autoEatTimeout = null;
        }
        this.stopLobbyRetry();
        this.isInLobby = false;

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
