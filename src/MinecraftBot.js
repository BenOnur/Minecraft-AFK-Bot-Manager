import mineflayer from 'mineflayer';
import logger from './utils/Logger.js';

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}g ${hours % 24}s ${minutes % 60}dk`;
    if (hours > 0) return `${hours}s ${minutes % 60}dk`;
    if (minutes > 0) return `${minutes}dk ${seconds % 60}sn`;
    return `${seconds}sn`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getMaxDurability(toolName) {
    const durabilities = {
        'wooden_pickaxe': 59, 'stone_pickaxe': 131, 'iron_pickaxe': 250,
        'golden_pickaxe': 32, 'diamond_pickaxe': 1561, 'netherite_pickaxe': 2031,
        'wooden_axe': 59, 'stone_axe': 131, 'iron_axe': 250,
        'golden_axe': 32, 'diamond_axe': 1561, 'netherite_axe': 2031,
        'wooden_sword': 59, 'stone_sword': 131, 'iron_sword': 250,
        'golden_sword': 32, 'diamond_sword': 1561, 'netherite_sword': 2031,
        'wooden_shovel': 59, 'stone_shovel': 131, 'iron_shovel': 250,
        'golden_shovel': 32, 'diamond_shovel': 1561, 'netherite_shovel': 2031,
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

    // Prioritize stronger/faster tier first, then durability.
    return (base * 10000) + remaining;
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

function extractReasonText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
        return value.map(extractReasonText).filter(Boolean).join(' ').trim();
    }

    if (typeof value === 'object') {
        const parts = [];

        if (typeof value.text === 'string') {
            parts.push(value.text);
        }
        if (typeof value.value === 'string') {
            parts.push(value.value);
        }
        if (typeof value.translate === 'string') {
            parts.push(value.translate);
        }
        if (value.with) {
            parts.push(extractReasonText(value.with));
        }
        if (value.extra) {
            parts.push(extractReasonText(value.extra));
        }

        return parts.filter(Boolean).join(' ').trim();
    }

    return String(value);
}

function formatKickReason(reason) {
    const text = extractReasonText(reason);
    if (text) return text;

    try {
        return JSON.stringify(reason);
    } catch (error) {
        return String(reason);
    }
}

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
        this.manualStopRequested = false;
        this.reconnectAttempts = 0;
        this.alreadyOnlineRetries = 0;
        this.sameKickStreak = 0;
        this.lastKickSignature = '';
        this.lastKickAt = 0;
        this.reconnectScheduleId = 0;
        this.antiAfkInterval = null;
        this.proximityInterval = null;
        this.autoEatTimeout = null;
        this.alertCooldowns = new Map();
        this.onProximityAlert = null;
        this.onLobbyDetected = null;
        this.onInventoryAlert = null;
        this.tempReconnectDelay = null;
        this.protectionEnabled = this.config.settings.protection?.enabled || false;
        if (this.accountConfig.protectionEnabled !== undefined) { // Persistence override
            this.protectionEnabled = this.accountConfig.protectionEnabled;
        }
        this.reconnectTimeout = null;
        this.lastPosition = null;
        this.isInLobby = false;
        this.lobbyRetryInterval = null;
        this.isEating = false;
        this.eatTimeoutCount = 0;
        this.inventoryMonitorInterval = null;
        this.inventoryAlertSent = false;
        this.toolAlertSent = new Set();
        this.lastProtectionTargetPos = null;
        this.afkDriftInterval = null;
        this.afkProfile = this.normalizeAfkProfile(this.accountConfig.afkProfile);
        if (this.afkProfile) {
            this.accountConfig.afkProfile = this.afkProfile;
        }

        // Stats tracking
        this.stats = {
            connectedAt: null,
            totalUptime: 0,
            reconnects: 0,
            spawnersBroken: 0,
            alertsTriggered: 0,
            lobbyEvents: 0,
            lastDisconnect: null,
            sessionStart: Date.now()
        };

        // Removed cached whitelist to allow dynamic updates from config in memory
        // this._cachedWhitelist = (this.config.settings.alertWhitelist || []).map(u => u.toLowerCase());
    }

    async start(startReason = 'manual') {
        if (startReason === 'reconnect' && this.manualStopRequested) {
            logger.info(`Slot ${this.slot}: Reconnect start blocked - bot was manually stopped`);
            return false;
        }

        if (this.isConnecting) {
            logger.warn(`Slot ${this.slot}: Already connecting`);
            return false;
        }

        if (this.bot) {
            logger.warn(`Slot ${this.slot}: Bot is already running`);
            return false;
        }

        // Cancel pending reconnect timers before any fresh start.
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.reconnectScheduleId++;

        const manualStartReasons = new Set(['manual', 'restart', 'startup', 'account-add', 'account-add-finalize']);
        if (manualStartReasons.has(startReason)) {
            this.manualStopRequested = false;
        }

        this.isConnecting = true;
        this.isManuallyStopped = false;
        this.status = 'connecting';

        try {
            logger.info(`Slot ${this.slot}: Starting bot for ${this.accountConfig.username} (reason: ${startReason})`);

            const botOptions = {
                host: this.config.minecraft.server.host,
                port: this.config.minecraft.server.port || 25565,
                username: this.accountConfig.username,
                auth: this.accountConfig.auth || 'microsoft',
                version: this.config.minecraft.server.version || false,
                hideErrors: false,
                profilesFolder: `./sessions/${this.accountConfig.username || 'temp_' + Date.now()}`,
                checkTimeoutInterval: 60000, // Keep-alive kontrolünü daha toleranslı yap
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

    normalizeAfkProfile(afkProfile) {
        if (!afkProfile || typeof afkProfile !== 'object') {
            return null;
        }

        const anchorX = Number(afkProfile?.anchor?.x);
        const anchorY = Number(afkProfile?.anchor?.y);
        const anchorZ = Number(afkProfile?.anchor?.z);
        if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY) || !Number.isFinite(anchorZ)) {
            return null;
        }

        const rawSpawners = Array.isArray(afkProfile.spawners) ? afkProfile.spawners : [];
        const unique = new Set();
        const spawners = [];

        for (const spawner of rawSpawners) {
            const x = Math.round(Number(spawner?.x));
            const y = Math.round(Number(spawner?.y));
            const z = Math.round(Number(spawner?.z));
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                continue;
            }

            const key = `${x}:${y}:${z}`;
            if (unique.has(key)) {
                continue;
            }
            unique.add(key);
            spawners.push({ x, y, z });
        }

        return {
            anchor: { x: anchorX, y: anchorY, z: anchorZ },
            spawners,
            updatedAt: typeof afkProfile.updatedAt === 'string'
                ? afkProfile.updatedAt
                : new Date().toISOString()
        };
    }

    setAfkProfile(afkProfile) {
        const normalized = this.normalizeAfkProfile(afkProfile);
        this.afkProfile = normalized;

        if (normalized) {
            this.accountConfig.afkProfile = normalized;
        } else {
            delete this.accountConfig.afkProfile;
        }

        return this.afkProfile;
    }

    getAfkAnchor() {
        if (!this.afkProfile?.anchor) {
            return null;
        }

        const { x, y, z } = this.afkProfile.anchor;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            return null;
        }

        return { x, y, z };
    }

    getHomeReferencePosition() {
        const anchor = this.getAfkAnchor();
        if (anchor) {
            return anchor;
        }

        if (!this.lastPosition) {
            return null;
        }

        return {
            x: this.lastPosition.x,
            y: this.lastPosition.y,
            z: this.lastPosition.z
        };
    }

    getDistanceFromReference(referencePos, currentPos) {
        if (!referencePos || !currentPos) {
            return null;
        }

        const dx = currentPos.x - referencePos.x;
        const dy = currentPos.y - referencePos.y;
        const dz = currentPos.z - referencePos.z;
        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    }

    getDistanceToHome(currentPos) {
        const referencePos = this.getHomeReferencePosition();
        return this.getDistanceFromReference(referencePos, currentPos);
    }

    getLobbyReturnThreshold() {
        return this.getAfkAnchor() ? 20 : 50;
    }

    toBlockVec3(pos) {
        if (!this.bot?.entity?.position?.constructor) {
            return null;
        }

        const x = Math.round(Number(pos?.x));
        const y = Math.round(Number(pos?.y));
        const z = Math.round(Number(pos?.z));
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            return null;
        }

        return new this.bot.entity.position.constructor(x, y, z);
    }

    getSavedSpawnerTargets(blockName, maxBlocksPerScan, radius) {
        if (!this.bot || !this.bot.entity) {
            return [];
        }

        const saved = this.afkProfile?.spawners;
        if (!Array.isArray(saved) || saved.length === 0) {
            return [];
        }

        const currentPos = this.bot.entity.position;
        const maxDistanceSq = radius * radius;
        const targets = [];

        for (const savedPos of saved) {
            if (targets.length >= maxBlocksPerScan) {
                break;
            }

            const pos = this.toBlockVec3(savedPos);
            if (!pos) {
                continue;
            }

            if (currentPos.distanceSquared(pos) > maxDistanceSq) {
                continue;
            }

            const block = this.bot.blockAt(pos);
            if (block && block.name === blockName) {
                targets.push(pos);
            }
        }

        return targets;
    }

    getProtectionTargets(blockName, maxBlocksPerScan, radius) {
        const savedTargets = this.getSavedSpawnerTargets(blockName, maxBlocksPerScan, radius);
        if (savedTargets.length > 0) {
            return { targets: savedTargets, source: 'afkProfile' };
        }

        if (!this.bot) {
            return { targets: [], source: 'none' };
        }

        const scannedTargets = this.bot.findBlocks({
            matching: (block) => block.name === blockName,
            maxDistance: radius,
            count: maxBlocksPerScan
        });

        return {
            targets: scannedTargets,
            source: scannedTargets.length > 0 ? 'scan' : 'none'
        };
    }

    getStackedBatchGain(breakResult, stillSameBlock, batchSize) {
        const rawGain = Number(breakResult?.gained ?? 0);
        if (Number.isFinite(rawGain) && rawGain > 0) {
            return Math.max(1, Math.round(rawGain));
        }

        // Stacked spawner plugins can keep the same block while paying out fixed chunks.
        if (stillSameBlock) {
            return Math.max(1, batchSize);
        }

        return 1;
    }

    async captureAfkProfile() {
        if (!this.bot || this.status !== 'online' || !this.bot.entity) {
            return { success: false, message: 'Bot online değil veya hazır değil.' };
        }

        const anchorPos = this.bot.entity.position;
        const protectionConfig = this.config.settings.protection || {};
        const blockName = protectionConfig.blockType || 'spawner';
        const radius = protectionConfig.radius || 64;
        const maxBlocksPerScan = Math.max(1, protectionConfig.maxBlocksPerScan ?? 256);

        const spawnerPositions = this.bot.findBlocks({
            matching: (block) => block.name === blockName,
            maxDistance: radius,
            count: maxBlocksPerScan
        });

        if (anchorPos && spawnerPositions.length > 1) {
            spawnerPositions.sort((a, b) => anchorPos.distanceSquared(a) - anchorPos.distanceSquared(b));
        }

        const nextProfile = {
            anchor: {
                x: Number(anchorPos.x),
                y: Number(anchorPos.y),
                z: Number(anchorPos.z)
            },
            spawners: spawnerPositions.map(pos => ({
                x: Math.round(pos.x),
                y: Math.round(pos.y),
                z: Math.round(pos.z)
            })),
            updatedAt: new Date().toISOString()
        };

        this.setAfkProfile(nextProfile);
        this.lastPosition = this.bot.entity.position.clone();

        return {
            success: true,
            afkProfile: this.afkProfile,
            spawnerCount: this.afkProfile?.spawners?.length || 0,
            blockType: blockName,
            radius
        };
    }

    checkAfkAnchorDrift(source = 'runtime') {
        if (!this.bot || !this.bot.entity) {
            return false;
        }

        const anchor = this.getAfkAnchor();
        if (!anchor) {
            return false;
        }

        const distance = this.getDistanceFromReference(anchor, this.bot.entity.position);
        if (distance === null) {
            return false;
        }

        if (!this.isInLobby && distance > 20) {
            logger.warn(`Slot ${this.slot}: AFK anchor drift (${Math.round(distance)} blocks) via ${source}. Entering lobby mode.`);
            this.enterLobbyMode();
            return true;
        }

        if (this.isInLobby && distance <= 20) {
            logger.info(`Slot ${this.slot}: AFK anchor reached again (${Math.round(distance)} blocks) via ${source}. Exiting lobby mode.`);
            this.exitLobbyMode();
            return true;
        }

        return false;
    }

    startAfkDriftCheck() {
        this.stopAfkDriftCheck();

        this.afkDriftInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online') {
                return;
            }
            this.checkAfkAnchorDrift('interval');
        }, 5000);
    }

    stopAfkDriftCheck() {
        if (this.afkDriftInterval) {
            clearInterval(this.afkDriftInterval);
            this.afkDriftInterval = null;
        }
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            logger.info(`Slot ${this.slot}: Logged in successfully`);
            this.status = 'online';
            this.isConnecting = false;
            this.stats.connectedAt = Date.now();
            if (this.reconnectAttempts > 0) {
                this.stats.reconnects++;
            }
            this.reconnectAttempts = 0;
            this.alreadyOnlineRetries = 0;
            this.sameKickStreak = 0;
            this.lastKickSignature = '';
            this.lastKickAt = 0;
            this.isInLobby = false; // Reset lobby state on login to prevent stale state

            // Sneak to hide name tag
            this.bot.setControlState('sneak', true);

            if (this.config.settings.antiAfkEnabled) {
                this.startAntiAfk();
            }
            if (this.config.settings.proximityAlertEnabled) {
                this.startProximityCheck();
            }

            if (this.onConnect) {
                // Prefer real negotiated protocol version over configured value.
                this.onConnect(this.config.minecraft.server.host, this.bot.version || this.config.minecraft.server.version);
            }

            this.startAutoEat();
            this.startInventoryMonitor();
            this.startAfkDriftCheck();
        });

        this.bot.on('spawn', () => {
            logger.info(`Slot ${this.slot}: Spawned in game`);

            // Re-apply sneak on every spawn to keep name tag hidden
            this.bot.setControlState('sneak', true);

            // Lobby/maintenance detection: if position changed drastically
            if (this.checkAfkAnchorDrift('spawn')) {
                return;
            }

            if (this.bot && this.bot.entity) {
                const currentPos = this.bot.entity.position;
                const distance = this.getDistanceToHome(currentPos);

                if (distance !== null && distance > 200 && !this.isInLobby) {
                    logger.warn(`Slot ${this.slot}: 🏢 LOBBY DETECTED! Teleported ${Math.round(distance)} blocks.`);
                    this.enterLobbyMode();
                    return;
                }
            }

            // If returning from lobby: check if back near original position
            if (this.bot && this.bot.entity && this.isInLobby) {
                const currentPos = this.bot.entity.position;
                const distToHome = this.getDistanceToHome(currentPos);

                if (distToHome !== null && distToHome <= this.getLobbyReturnThreshold()) {
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
            this.stats.lastDisconnect = Date.now();
            if (this.stats.connectedAt) {
                this.stats.totalUptime += Date.now() - this.stats.connectedAt;
                this.stats.connectedAt = null;
            }
            const statusBeforeCleanup = this.status;
            this.cleanup();

            // Keep terminal state visible when reconnect loop is intentionally stopped.
            if ((statusBeforeCleanup === 'kicked' || statusBeforeCleanup === 'error') && this.isManuallyStopped) {
                this.status = statusBeforeCleanup;
            }

            if (this.config.settings.autoReconnect && !this.isPaused && !this.manualStopRequested) {
                this.handleReconnect();
            }
        });

        this.bot.on('kicked', (reason) => {
            this.isConnecting = false;
            const reasonText = formatKickReason(reason);
            logger.warn(`Slot ${this.slot}: Kicked from reason: ${reasonText}`);
            this.status = 'kicked';

            const reasonStr = String(reasonText || '').toLowerCase();
            const maxAlreadyOnlineRetries = this.config.settings.maxAlreadyOnlineRetries ?? 3;
            const alreadyOnlineReconnectDelay = this.config.settings.alreadyOnlineReconnectDelay ?? 120000;
            const maxSameKickRetries = this.config.settings.maxSameKickRetries ?? 5;
            const sameKickWindowMs = this.config.settings.sameKickWindowMs ?? 300000;
            const now = Date.now();

            if (
                this.lastKickSignature === reasonStr &&
                reasonStr &&
                (now - this.lastKickAt) <= sameKickWindowMs
            ) {
                this.sameKickStreak++;
            } else {
                this.sameKickStreak = 1;
            }

            this.lastKickSignature = reasonStr;
            this.lastKickAt = now;

            if (this.sameKickStreak > 1) {
                logger.warn(`Slot ${this.slot}: Same kick reason repeated (${this.sameKickStreak}/${maxSameKickRetries})`);
            }

            if (this.sameKickStreak >= maxSameKickRetries) {
                logger.error(`Slot ${this.slot}: Kick loop protection triggered after ${this.sameKickStreak} repeated kicks. Auto-reconnect stopped for this slot.`);
                this.isManuallyStopped = true;
                return;
            }

            const isSessionConflict = (
                reasonStr.includes('already online') ||
                reasonStr.includes('already connected') ||
                reasonStr.includes('another instance of game') ||
                reasonStr.includes('logged in from another')
            );

            if (isSessionConflict) {
                this.alreadyOnlineRetries++;
                if (this.alreadyOnlineRetries >= maxAlreadyOnlineRetries) {
                    logger.error(`Slot ${this.slot}: 'already online' repeated ${this.alreadyOnlineRetries} times. Auto-reconnect stopped for this slot.`);
                    this.isManuallyStopped = true;
                    return;
                }

                logger.warn(`Slot ${this.slot}: Detected session conflict kick. Waiting ${Math.round(alreadyOnlineReconnectDelay / 1000)}s before reconnect (${this.alreadyOnlineRetries}/${maxAlreadyOnlineRetries}).`);
                this.tempReconnectDelay = alreadyOnlineReconnectDelay;
            } else {
                this.alreadyOnlineRetries = 0;
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

            // CRITICAL: Detect "Servers are updating" message which teleports players to lobby/hub
            if (msg.includes('servers are updating') || msg.includes('do not teleport')) {
                logger.warn(`Slot ${this.slot}: 🚨 SERVER UPDATE DETECTED! Entering lobby mode immediately to prevent false alarms.`);
                this.enterLobbyMode();
                return;
            }

            if (msg.includes('teleported') || msg.includes('ışınlandı')) {
                if (!this.isInLobby) {
                    // Verify with position check before entering lobby mode
                    setTimeout(() => {
                        if (this.bot && this.bot.entity && !this.isInLobby) {
                            if (this.checkAfkAnchorDrift('chat')) {
                                return;
                            }

                            const dist = this.getDistanceToHome(this.bot.entity.position);
                            if (dist !== null && dist > 200) {
                                logger.warn(`Slot ${this.slot}: 🏢 TELEPORT DETECTED via chat: "${message}" (${Math.round(dist)} blocks). Entering lobby mode.`);
                                this.enterLobbyMode();
                            }
                        }
                    }, 1000);
                } else {
                    // Already in lobby → might be returning home via /home sp
                    setTimeout(() => {
                        if (this.bot && this.bot.entity && this.isInLobby) {
                            if (this.checkAfkAnchorDrift('chat-return')) {
                                return;
                            }

                            const dist = this.getDistanceToHome(this.bot.entity.position);
                            if (dist !== null && dist <= this.getLobbyReturnThreshold()) {
                                this.exitLobbyMode();
                            }
                        }
                    }, 1500);
                }
            }

            // Improve detection for "Your region started back up"
            if (msg.includes('region started back up') || msg.includes('we will teleport you back')) {
                logger.info(`Slot ${this.slot}: 🔄 Server region restarted! Teleport pending... Stopping lobby retry loops.`);
                this.stopLobbyRetry(); // Stop spamming /home sp so we don't interfere with server teleport
            }
        });

        this.bot.on('forcedMove', () => {
            // Standard Event: Forced Move (Teleport)
            if (this.checkAfkAnchorDrift('forcedMove')) {
                return;
            }

            // This is more reliable than chat messages for detecting return from lobby
            if (this.bot && this.bot.entity && this.isInLobby) {
                const currentPos = this.bot.entity.position;
                const distToHome = this.getDistanceToHome(currentPos);

                if (distToHome !== null && distToHome <= this.getLobbyReturnThreshold()) {
                    logger.info(`Slot ${this.slot}: ⚡ ForcedMove detected return to base (${Math.round(distToHome)} blocks away). Exiting lobby mode.`);
                    this.exitLobbyMode();
                }
            } else if (this.bot && this.bot.entity && !this.isInLobby) {
                // Also check for unexpected teleports AWAY from base via forcedMove
                const currentPos = this.bot.entity.position;
                const dist = this.getDistanceToHome(currentPos);

                if (dist !== null && dist > 200) {
                    logger.warn(`Slot ${this.slot}: ⚡ ForcedMove detected TELEPORT AWAY (${Math.round(dist)} blocks). Entering lobby mode.`);
                    this.enterLobbyMode();
                }
            }
        });
    }

    enterLobbyMode() {
        if (this.isInLobby) return; // Already in lobby mode, prevent duplicate triggers
        this.isInLobby = true;
        this.stats.lobbyEvents++;

        // Stop proximity and anti-afk (not needed while teleported)
        if (this.proximityInterval) {
            clearInterval(this.proximityInterval);
            this.proximityInterval = null;
        }
        if (this.antiAfkInterval) {
            clearTimeout(this.antiAfkInterval);
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

        // Ensure bot sneaks after teleport
        if (this.bot) {
            this.bot.setControlState('sneak', true);
            // Double ensure after a delay just in case server lags
            setTimeout(() => {
                if (this.bot) this.bot.setControlState('sneak', true);
            }, 2000);
        }

        if (this.config.settings.antiAfkEnabled) {
            this.startAntiAfk();
        }
        if (this.config.settings.proximityAlertEnabled) {
            this.startProximityCheck();
        }
    }

    startAntiAfk() {
        if (this.antiAfkInterval) {
            clearTimeout(this.antiAfkInterval);
            this.antiAfkInterval = null;
        }

        const runTick = async () => {
            if (!this.bot || this.status !== 'online' || this.isPaused || this.isEating) {
                this.antiAfkInterval = setTimeout(runTick, 10000);
                return;
            }

            try {
                const hasAfkAnchor = !!this.getAfkAnchor();
                // 1. Rastgele Zıplama (%70 şans)
                if (!hasAfkAnchor && Math.random() > 0.3) {
                    this.bot.setControlState('jump', true);
                    setTimeout(() => {
                        if (this.bot) this.bot.setControlState('jump', false);
                    }, 100 + Math.random() * 100);
                }

                // 2. Hafif Rastgele Bakış Değişikliği (%50 şans)
                if (Math.random() > 0.5) {
                    const currentYaw = this.bot.entity.yaw;
                    const currentPitch = this.bot.entity.pitch;
                    const newYaw = currentYaw + (Math.random() - 0.5) * 0.2;
                    const newPitch = currentPitch + (Math.random() - 0.5) * 0.1;
                    await this.bot.look(newYaw, newPitch, true);
                }

                // 3. Rastgele Bekleme Süresi (20 - 45 saniye arası)
                const baseDelay = this.config.settings.antiAfkInterval || 30000;
                const randomDelay = baseDelay * (0.8 + Math.random() * 0.7);
                this.antiAfkInterval = setTimeout(runTick, randomDelay);

            } catch (err) {
                this.antiAfkInterval = setTimeout(runTick, 10000);
            }
        };

        this.antiAfkInterval = setTimeout(runTick, 5000 + (this.slot * 2000));
    }

    getBestPickaxe() {
        if (!this.bot) return null;

        const pickaxes = this.bot.inventory.items().filter(item => item.name.includes('pickaxe'));
        if (pickaxes.length === 0) return null;

        pickaxes.sort((a, b) => getPickaxeScore(b) - getPickaxeScore(a));
        return pickaxes[0];
    }

    async equipPickaxe(force = false) {
        if (!this.bot) return;

        const bestPickaxe = this.getBestPickaxe();
        if (!bestPickaxe) return;

        const heldItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')];
        if (!force && heldItem && heldItem.name === bestPickaxe.name) return;

        try {
            await this.bot.equip(bestPickaxe, 'hand');
            logger.info(`Slot ${this.slot}: Equipped ${bestPickaxe.name}`);
        } catch (error) {
            logger.error(`Slot ${this.slot}: Failed to equip pickaxe: ${error.message}`);
        }
    }

    async startAutoEat() {
        const checkInterval = 5000;

        const checkFood = async () => {
            let nextDelay = checkInterval + (this.slot * 200); // Slotlar arası kaydırma

            if (!this.bot || this.status !== 'online' || this.isPaused) {
                this.autoEatTimeout = setTimeout(checkFood, checkInterval);
                return;
            }

            try {
                // Ensure pickaxe is held if not eating
                if (!this.isEating) {
                    await this.equipPickaxe();
                }

                const food = this.bot.food;

                if (food < 14) {
                    const foodItem = this.bot.inventory.items().find(item =>
                        FOOD_ITEMS.has(item.name)
                    );

                    if (foodItem) {
                        this.isEating = true;

                        // Wrap equip/consume in timeout promise to prevent hanging
                        const eatTask = async () => {
                            await this.bot.equip(foodItem, 'hand');
                            await this.bot.consume();
                        };

                        const timeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Eat operation timed out')), 5000)
                        );

                        await Promise.race([eatTask(), timeoutPromise]);

                        this.isEating = false;
                        this.eatTimeoutCount = 0;
                        logger.info(`Slot ${this.slot}: Ate ${foodItem.name} (food: ${food} -> ${this.bot.food})`);

                        // Re-equip pickaxe immediately after eating
                        await this.equipPickaxe();
                    } else {
                        logger.warn(`Slot ${this.slot}: Hungry (food: ${food}) but no food in inventory!`);
                    }
                }
            } catch (error) {
                this.isEating = false;
                if (error.message.includes('Promise timed out') || error.message.includes('Eat operation timed out')) {
                    this.eatTimeoutCount++;
                    if (this.eatTimeoutCount <= 3) {
                        logger.warn(`Slot ${this.slot}: Auto-eat timed out (${this.eatTimeoutCount}/3). Retrying in 30s.`);
                    }
                    // After 3 consecutive timeouts, go silent and retry less frequently
                    nextDelay = this.eatTimeoutCount > 3 ? 60000 : 30000;
                } else {
                    logger.error(`Slot ${this.slot}: Auto-eat error: ${error.message}`);
                    nextDelay = 10000;
                }
                // Attempt to re-equip pickaxe even if eat failed
                await this.equipPickaxe();
            } finally {
                this.autoEatTimeout = setTimeout(checkFood, nextDelay);
            }
        };

        this.autoEatTimeout = setTimeout(checkFood, checkInterval);
    }

    startProximityCheck() {
        // Kontrol aralığını 1 saniyeden 2.5 saniyeye çıkarıyoruz (Yük azaltma)
        const checkInterval = 2500 + (this.slot * 100);

        this.proximityInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online' || this.isPaused || this.isInLobby) return;

            const cooldown = this.config.settings.alertCooldown || 300000;
            const now = Date.now();

            // Performans için oyuncuları önceden filtrele
            const currentWhitelist = (this.config.settings.alertWhitelist || []).map(u => u.toLowerCase());

            const players = Object.values(this.bot.entities).filter(e =>
                e.type === 'player' &&
                e.username !== this.accountConfig.username &&
                !currentWhitelist.includes(e.username.toLowerCase()) &&
                e.position && this.bot.entity
            );

            for (const entity of players) {
                const distance = this.bot.entity.position.distanceTo(entity.position);

                // Emergency disconnect
                const emergencyDistance = this.config.settings.protection?.emergencyDistance || 10;
                if (distance <= emergencyDistance) {
                    logger.error(`Slot ${this.slot}: 🚨 EMERGENCY: ${entity.username} at ${Math.round(distance)}m! DISCONNECTING! 🚨`);
                    if (this.onProximityAlert) this.onProximityAlert(entity.username, distance);
                    this._protectionRunning = false;
                    this.stop();
                    return;
                }

                const lastAlert = this.alertCooldowns.get(entity.username) || 0;
                if (now - lastAlert > cooldown) {
                    this.alertCooldowns.set(entity.username, now);
                    logger.info(`Slot ${this.slot}: Threat detected (${entity.username} at ${Math.round(distance)}m).`);

                    // Start protection for any non-whitelisted detected player (loaded range).
                    this.executeProtection();

                    this.stats.alertsTriggered++;
                    if (this.onProximityAlert) this.onProximityAlert(entity.username, distance);
                }
            }
        }, checkInterval);
    }

    isEnemyNearby() {
        if (!this.bot || !this.bot.entity) return false;
        const emergencyDistance = this.config.settings.protection?.emergencyDistance || 10;

        const myUsername = this.accountConfig.username;
        const currentWhitelist = (this.config.settings.alertWhitelist || []).map(u => u.toLowerCase());

        for (const id in this.bot.entities) {
            const entity = this.bot.entities[id];
            if (entity.type !== 'player' || entity.username === myUsername) continue;
            if (currentWhitelist.includes(entity.username.toLowerCase())) continue;
            if (!entity.position) continue;

            const dist = this.bot.entity.position.distanceTo(entity.position);
            if (dist <= emergencyDistance) return true;
        }
        return false;
    }

    getSpawnerItemCount() {
        if (!this.bot) return 0;
        return this.bot.inventory.items()
            .filter(item => item?.name?.includes('spawner'))
            .reduce((sum, item) => sum + (item.count || 0), 0);
    }

    async naturalLookAtBlock(pos, options = {}) {
        if (!this.bot) return;

        const naturalLookEnabled = options.naturalLookEnabled !== false;
        const preDigPause = Math.max(0, options.preDigPause ?? 35);
        const target = pos.offset(0.5, 0.5, 0.5);

        if (!naturalLookEnabled) {
            await this.bot.lookAt(target, true);
            if (preDigPause > 0) await sleep(preDigPause);
            return;
        }

        const steps = Math.max(1, Math.min(8, options.naturalLookSteps ?? 4));
        const stepDelay = Math.max(0, options.naturalLookStepDelay ?? 20);
        const jitter = Math.max(0, options.naturalLookJitter ?? 0.01);

        for (let i = 0; i < steps; i++) {
            const ratio = (steps - i) / steps;
            const spread = jitter * (1 + (ratio * 2));
            const stepTarget = target.offset(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread
            );
            await this.bot.lookAt(stepTarget, false);
            if (stepDelay > 0) await sleep(stepDelay);
        }

        await this.bot.lookAt(target, false);
        if (preDigPause > 0) await sleep(preDigPause);
    }

    orderBlocksSequentially(blocks, startPos = null) {
        if (!Array.isArray(blocks) || blocks.length <= 1) {
            return blocks || [];
        }

        const remaining = [...blocks];
        const ordered = [];

        let cursor = null;
        if (startPos && typeof startPos.clone === 'function') {
            cursor = startPos.clone();
        } else if (this.bot?.entity?.position) {
            cursor = this.bot.entity.position.clone();
        }

        if (!cursor) {
            return remaining;
        }

        while (remaining.length > 0) {
            let bestIdx = 0;
            let bestDist = Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const d = cursor.distanceSquared(remaining[i]);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }

            const nextPos = remaining.splice(bestIdx, 1)[0];
            ordered.push(nextPos);
            cursor = nextPos;
        }

        return ordered;
    }

    async breakBlockWithVerification(pos, blockName, options = {}) {
        const breakDelay = Math.max(0, options.breakDelay ?? 0);
        const verifyDelay = Math.max(0, options.verifyDelay ?? 80);
        const breakRetryCount = Math.max(0, options.breakRetryCount ?? 1);
        const breakRetryDelay = Math.max(0, options.breakRetryDelay ?? 100);
        const inventoryConfirmTimeout = Math.max(
            0,
            options.inventoryConfirmTimeout ??
            options.inventoryConfirmDelay ??
            80
        );
        const inventoryConfirmPollInterval = Math.max(20, options.inventoryConfirmPollInterval ?? 250);
        const goneConfirmChecks = Math.max(1, options.goneConfirmChecks ?? 3);
        const goneConfirmInterval = Math.max(0, options.goneConfirmInterval ?? 50);
        const stackedFastMode = options.stackedFastMode !== false;
        const stackedFastGraceMs = Math.max(0, options.stackedFastGraceMs ?? 150);
        const naturalLookEnabled = options.naturalLookEnabled !== false;
        const naturalLookSteps = Math.max(1, options.naturalLookSteps ?? 4);
        const naturalLookStepDelay = Math.max(0, options.naturalLookStepDelay ?? 20);
        const naturalLookJitter = Math.max(0, options.naturalLookJitter ?? 0.01);
        const preDigPause = Math.max(0, options.preDigPause ?? 35);
        const blockGoneStableMs = Math.max(0, options.blockGoneStableMs ?? 500);
        const blockGoneRecheckInterval = Math.max(20, options.blockGoneRecheckInterval ?? 100);

        for (let attempt = 0; attempt <= breakRetryCount; attempt++) {
            if (!this.bot || this.status !== 'online') {
                return { broken: false, reason: 'bot_not_ready' };
            }

            const block = this.bot.blockAt(pos);
            if (!block || block.name !== blockName) {
                return { broken: false, reason: 'already_gone' };
            }

            if (typeof this.bot.canDigBlock === 'function' && !this.bot.canDigBlock(block)) {
                return { broken: false, reason: 'cannot_dig' };
            }

            const spawnerBefore = this.getSpawnerItemCount();

            try {
                await this.naturalLookAtBlock(pos, {
                    naturalLookEnabled,
                    naturalLookSteps,
                    naturalLookStepDelay,
                    naturalLookJitter,
                    preDigPause
                });
                await this.bot.dig(block, false);
            } catch (error) {
                if (attempt >= breakRetryCount) {
                    return { broken: false, reason: 'dig_error', error };
                }
            }

            if (breakDelay > 0) {
                await sleep(breakDelay);
            }

            // Stacked spawner servers may keep the same block and add items later (e.g. 10s cooldown).
            const confirmStart = Date.now();
            while ((Date.now() - confirmStart) <= inventoryConfirmTimeout) {
                const spawnerAfter = this.getSpawnerItemCount();
                if (spawnerAfter > spawnerBefore) {
                    return { broken: true, byInventory: true, gained: spawnerAfter - spawnerBefore };
                }

                // If block vanished during the wait, treat as broken and continue.
                const midCheckBlock = this.bot?.blockAt(pos);
                if (!midCheckBlock || midCheckBlock.name !== blockName) {
                    return { broken: true, byInventory: false, gained: 0 };
                }

                // Fast stacked mode: if block still exists shortly after dig, keep hitting immediately.
                if (stackedFastMode && (Date.now() - confirmStart) >= stackedFastGraceMs) {
                    return { broken: false, reason: 'stack_still_exists' };
                }

                await sleep(inventoryConfirmPollInterval);
            }

            if (verifyDelay > 0) {
                await sleep(verifyDelay);
            }

            // Confirm block disappearance across multiple checks to avoid false positives.
            let stillExists = false;
            for (let i = 0; i < goneConfirmChecks; i++) {
                if (i > 0 && goneConfirmInterval > 0) {
                    await sleep(goneConfirmInterval);
                }
                const verifyBlock = this.bot?.blockAt(pos);
                if (verifyBlock && verifyBlock.name === blockName) {
                    stillExists = true;
                    break;
                }
            }

            if (!stillExists) {
                // Keep checking for a short period; some anti-cheat/plugins can briefly fake client break.
                const stableStart = Date.now();
                while ((Date.now() - stableStart) <= blockGoneStableMs) {
                    const lateCheck = this.bot?.blockAt(pos);
                    if (lateCheck && lateCheck.name === blockName) {
                        return { broken: false, reason: 'block_reappeared' };
                    }
                    await sleep(blockGoneRecheckInterval);
                }
                return { broken: true, byInventory: false, gained: 0 };
            }

            if (attempt < breakRetryCount) {
                logger.warn(`Slot ${this.slot}: Ghost-block suspicion at ${pos}. Retrying (${attempt + 1}/${breakRetryCount})`);
                if (breakRetryDelay > 0) {
                    await sleep(breakRetryDelay);
                }
            }
        }

        return { broken: false, reason: 'ghost_block_persisted' };
    }

    async executeProtection() {
        if (!this.bot || this.status !== 'online') return;
        if (this._protectionRunning) return; // Prevent multiple concurrent runs

        // Safety check: Deke before shooting
        if (this.isInLobby) {
            logger.warn(`Slot ${this.slot}: 🛡️ Protection triggered but bot is in LOBBY mode. Aborting.`);
            return;
        }

        const protectionConfig = this.config.settings.protection || {};
        const startDelay = Math.max(0, protectionConfig.startDelay ?? 250);
        const blockName = protectionConfig.blockType || 'spawner';
        const radius = protectionConfig.radius || 64;
        const breakDelay = Math.max(0, protectionConfig.breakDelay ?? 0);
        const verifyDelay = Math.max(0, protectionConfig.verifyDelay ?? 80);
        const breakRetryCount = Math.max(0, protectionConfig.breakRetryCount ?? 1);
        const breakRetryDelay = Math.max(0, protectionConfig.breakRetryDelay ?? 100);
        const maxBlocksPerScan = Math.max(1, protectionConfig.maxBlocksPerScan ?? 256);
        const maxBreakReach = Math.max(1, protectionConfig.maxBreakReach ?? 5.0);
        const inventoryConfirmTimeout = Math.max(
            0,
            protectionConfig.inventoryConfirmTimeout ??
            protectionConfig.inventoryConfirmDelay ??
            80
        );
        const inventoryConfirmPollInterval = Math.max(20, protectionConfig.inventoryConfirmPollInterval ?? 250);
        const goneConfirmChecks = Math.max(1, protectionConfig.goneConfirmChecks ?? 3);
        const goneConfirmInterval = Math.max(0, protectionConfig.goneConfirmInterval ?? 50);
        const stackedFastMode = protectionConfig.stackedFastMode !== false;
        const stackedFastGraceMs = Math.max(0, protectionConfig.stackedFastGraceMs ?? 150);
        const naturalLookEnabled = protectionConfig.naturalLookEnabled !== false;
        const naturalLookSteps = Math.max(1, protectionConfig.naturalLookSteps ?? 4);
        const naturalLookStepDelay = Math.max(0, protectionConfig.naturalLookStepDelay ?? 20);
        const naturalLookJitter = Math.max(0, protectionConfig.naturalLookJitter ?? 0.01);
        const preDigPause = Math.max(0, protectionConfig.preDigPause ?? 35);
        const blockGoneStableMs = Math.max(0, protectionConfig.blockGoneStableMs ?? 500);
        const blockGoneRecheckInterval = Math.max(20, protectionConfig.blockGoneRecheckInterval ?? 100);
        const maxHitsPerBlock = Math.max(1, protectionConfig.maxHitsPerBlock ?? 256);
        const stackBatchSize = Math.max(1, protectionConfig.stackBatchSize ?? 64);
        const stackedDepletionConfirmMs = Math.max(
            1000,
            protectionConfig.stackedDepletionConfirmMs ?? Math.max(30000, inventoryConfirmTimeout + 1000)
        );
        const noTargetRescanDelay = Math.max(100, protectionConfig.noTargetRescanDelay ?? 500);
        const hasSavedAfkTargets = Array.isArray(this.afkProfile?.spawners) && this.afkProfile.spawners.length > 0;

        // Small safety delay to allow maintenance/lobby messages to arrive.
        if (startDelay > 0) {
            await sleep(startDelay);
        }

        // Re-check lobby status after delay
        if (this.isInLobby) {
            logger.warn(`Slot ${this.slot}: 🛡️ Protection aborted (Lobby detected after delay).`);
            return;
        }

        this._protectionRunning = true;

        logger.warn(`Slot ${this.slot}: 🛡️ INITIATING SPAWNER PROTECTION PROTOCOL 🛡️`);

        // Equip the best available pickaxe for faster breaking.
        const bestPickaxe = this.getBestPickaxe();
        if (bestPickaxe) {
            await this.equipPickaxe(true);
        } else {
            logger.warn(`Slot ${this.slot}: No pickaxe found! Breaking with hand (slow).`);
        }

        this.bot.setControlState('sneak', true);

        let totalBroken = 0;
        let completedByClearingTargets = false;
        let noTargetSince = null;
        let nextNoTargetLogAt = 0;
        // Loop: keep scanning and breaking until no spawners remain or inventory full
        while (this.bot && this.status === 'online') {
            if (this.isInLobby) {
                logger.warn(`Slot ${this.slot}: Lobby detected during protection. Aborting protection without disconnect.`);
                this._protectionRunning = false;
                if (this.bot) this.bot.setControlState('sneak', false);
                return;
            }

            // Check inventory fullness (stop if <= 2 empty slots to ensure we picked up loot)
            const emptySlots = this.bot.inventory.emptySlotCount();
            if (emptySlots <= 2) {
                logger.warn(`Slot ${this.slot}: 📦 Inventory nearly FULL (<=2 slots)! Stopping protection and disconnecting.`);
                break;
            }

            // Scan for spawners (prioritize /afkset saved coordinates first)
            const targetResult = this.getProtectionTargets(blockName, maxBlocksPerScan, radius);
            const blocks = targetResult.targets;
            const targetSource = targetResult.source;

            if (this.bot?.entity?.position) {
                const currentPos = this.bot.entity.position;
                blocks.sort((a, b) => currentPos.distanceSquared(a) - currentPos.distanceSquared(b));
            }

            if (blocks.length === 0) {
                this.lastProtectionTargetPos = null;
                if (this.isInLobby) {
                    logger.warn(`Slot ${this.slot}: In lobby and no target blocks found. Aborting protection without disconnect.`);
                    this._protectionRunning = false;
                    if (this.bot) this.bot.setControlState('sneak', false);
                    return;
                }

                if (hasSavedAfkTargets) {
                    if (!noTargetSince) {
                        noTargetSince = Date.now();
                        nextNoTargetLogAt = 0;
                    }

                    const now = Date.now();
                    const elapsed = now - noTargetSince;
                    if (elapsed < stackedDepletionConfirmMs) {
                        if (now >= nextNoTargetLogAt) {
                            const remainSec = Math.ceil((stackedDepletionConfirmMs - elapsed) / 1000);
                            logger.info(
                                `Slot ${this.slot}: No visible ${blockName} at AFK targets yet. Re-checking for ${remainSec}s before retreat.`
                            );
                            nextNoTargetLogAt = now + 5000;
                        }
                        await sleep(noTargetRescanDelay);
                        continue;
                    }
                }

                logger.info(`Slot ${this.slot}: All ${blockName}s destroyed (${totalBroken} total). Preparing spawn retreat.`);
                completedByClearingTargets = true;
                break;
            }
            noTargetSince = null;
            nextNoTargetLogAt = 0;

            const orderedBlocks = this.orderBlocksSequentially(
                blocks,
                this.lastProtectionTargetPos || this.bot?.entity?.position || null
            );

            const sourceLabel = targetSource === 'afkProfile' ? 'AFK saved targets' : 'radius scan';
            logger.info(`Slot ${this.slot}: Found ${blocks.length} ${blockName}(s) remaining (${sourceLabel}). Breaking...`);
            let reachableInScan = 0;
            let brokeInScan = 0;
            let stackPendingInScan = 0;

            for (const pos of orderedBlocks) {
                if (!this.bot) { this._protectionRunning = false; return; }
                this.lastProtectionTargetPos = pos;

                let hitsOnCurrentBlock = 0;
                let brokenOnCurrentTarget = 0;
                let missingSince = null;
                let nextMissingLogAt = 0;
                while (this.bot && this.status === 'online') {
                    // Emergency: check if any enemy is within 10 blocks
                    if (this.isEnemyNearby()) {
                        logger.error(`Slot ${this.slot}: Enemy too close while breaking! Emergency disconnect.`);
                        this._protectionRunning = false;
                        this.stop();
                        return;
                    }

                    // Re-check inventory before each break
                    if (this.bot.inventory.emptySlotCount() <= 2) {
                        logger.warn(`Slot ${this.slot}: Inventory nearly full mid-break. Stopping protection and disconnecting.`);
                        break;
                    }

                    const blockDistance = this.bot.entity.position.distanceTo(pos.offset(0.5, 0.5, 0.5));
                    if (blockDistance > maxBreakReach) {
                        break;
                    }
                    reachableInScan++;

                    const block = this.bot.blockAt(pos);
                    if (!block || block.name !== blockName) {
                        if (targetSource === 'afkProfile') {
                            if (!missingSince) {
                                missingSince = Date.now();
                                nextMissingLogAt = 0;
                            }

                            const now = Date.now();
                            const missingElapsed = now - missingSince;
                            if (missingElapsed < stackedDepletionConfirmMs) {
                                if (now >= nextMissingLogAt) {
                                    const waitSec = Math.ceil((stackedDepletionConfirmMs - missingElapsed) / 1000);
                                    logger.info(
                                        `Slot ${this.slot}: ${pos} stacked target temporary missing. Waiting ${waitSec}s for re-appearance.`
                                    );
                                    nextMissingLogAt = now + 5000;
                                }
                                await sleep(noTargetRescanDelay);
                                continue;
                            }
                        }
                        break;
                    }

                    missingSince = null;
                    nextMissingLogAt = 0;

                    const breakResult = await this.breakBlockWithVerification(pos, blockName, {
                        breakDelay,
                        verifyDelay,
                        breakRetryCount,
                        breakRetryDelay,
                        inventoryConfirmTimeout,
                        inventoryConfirmPollInterval,
                        goneConfirmChecks,
                        goneConfirmInterval,
                        stackedFastMode,
                        stackedFastGraceMs,
                        naturalLookEnabled,
                        naturalLookSteps,
                        naturalLookStepDelay,
                        naturalLookJitter,
                        preDigPause,
                        blockGoneStableMs,
                        blockGoneRecheckInterval
                    });

                    if (breakResult.broken) {
                        const stillSameBlock = this.bot?.blockAt(pos)?.name === blockName;
                        const gained = this.getStackedBatchGain(breakResult, stillSameBlock, stackBatchSize);
                        totalBroken += gained;
                        brokeInScan += gained;
                        brokenOnCurrentTarget += gained;
                        this.stats.spawnersBroken += gained;
                        if (totalBroken === 1 || totalBroken % 10 === 0 || gained > 1) {
                            logger.info(`Slot ${this.slot}: Broken ${totalBroken} ${blockName}(s) so far`);
                        }

                        // If block still exists, this is likely a stacked spawner, keep hitting same block.
                        if (stillSameBlock) {
                            hitsOnCurrentBlock++;
                            if (brokenOnCurrentTarget >= stackBatchSize && (brokenOnCurrentTarget % stackBatchSize) === 0) {
                                logger.info(
                                    `Slot ${this.slot}: ${pos} stacked target drained chunk -> ${brokenOnCurrentTarget} ${blockName}(s) collected from this point.`
                                );
                            }
                            if (hitsOnCurrentBlock >= maxHitsPerBlock) {
                                logger.warn(`Slot ${this.slot}: Hit limit reached at ${pos}. Moving to next block.`);
                                break;
                            }
                            continue;
                        }

                        if (brokenOnCurrentTarget > stackBatchSize) {
                            logger.info(`Slot ${this.slot}: ${pos} stacked target fully cleared (${brokenOnCurrentTarget} ${blockName}).`);
                        }

                        if (targetSource === 'afkProfile') {
                            if (!missingSince) {
                                missingSince = Date.now();
                                nextMissingLogAt = 0;
                            }
                            await sleep(noTargetRescanDelay);
                            continue;
                        }
                        break;
                    }

                    if (breakResult.reason === 'already_gone') {
                        break;
                    }

                    if (breakResult.reason === 'stack_still_exists' || breakResult.reason === 'block_reappeared') {
                        stackPendingInScan++;
                        hitsOnCurrentBlock++;
                        if (hitsOnCurrentBlock >= maxHitsPerBlock) {
                            logger.warn(`Slot ${this.slot}: Stack pending too long at ${pos}. Moving to next block.`);
                            break;
                        }
                        continue;
                    }

                    if (breakResult.reason === 'cannot_dig') {
                        logger.warn(`Slot ${this.slot}: Cannot dig ${blockName} at ${pos}. Skipping.`);
                        break;
                    }

                    if (breakResult.reason === 'ghost_block_persisted') {
                        logger.warn(`Slot ${this.slot}: ${blockName} at ${pos} still exists after retries.`);
                        hitsOnCurrentBlock++;
                        if (hitsOnCurrentBlock >= maxHitsPerBlock) break;
                        continue;
                    }

                    if (breakResult.reason === 'dig_error') {
                        logger.error(`Slot ${this.slot}: Failed to break block at ${pos}: ${breakResult.error?.message || 'unknown dig error'}`);
                        break;
                    }

                    break;
                }
            }

            if (reachableInScan === 0 && blocks.length > 0) {
                logger.warn(`Slot ${this.slot}: ${blockName}s found but none are within reach (${maxBreakReach}m). Stopping protection.`);
                break;
            }

            if (brokeInScan === 0 && stackPendingInScan === 0 && reachableInScan > 0) {
                logger.warn(`Slot ${this.slot}: No ${blockName} broken in this scan despite reachable targets. Retrying quickly.`);
            }

            // Small delay before re-scanning
            await sleep(25);
        }

        if (this.bot) {
            this.bot.setControlState('sneak', false);
        }
        this.lastProtectionTargetPos = null;

        // Only disconnect if we actually ran the logic and finished (not early returned)
        if (completedByClearingTargets) {
            logger.info(`Slot ${this.slot}: Protection complete. Retreating to random /spawn (1-5), then stopping in 10s.`);
            try {
                await this.retreatToRandomSpawnAndStop();
            } finally {
                this._protectionRunning = false;
            }
            return;
        }

        logger.info(`Slot ${this.slot}: Protection protocol complete. Disconnecting.`);
        this._protectionRunning = false;
        await this.stop();
    }

    async retreatToRandomSpawnAndStop() {
        const spawnIndex = Math.floor(Math.random() * 5) + 1;
        const spawnCommand = `/spawn ${spawnIndex}`;

        if (this.bot && this.status === 'online') {
            try {
                this.bot.chat(spawnCommand);
                logger.info(`Slot ${this.slot}: Sent ${spawnCommand}. Stopping in 10 seconds.`);
            } catch (error) {
                logger.warn(`Slot ${this.slot}: Failed to send ${spawnCommand}: ${error.message}`);
            }
        }

        await sleep(10000);

        if (this.bot) {
            await this.stop();
        }
    }

    toggleProtection(forceState = null) {
        if (forceState !== null) {
            this.protectionEnabled = forceState;
        } else {
            this.protectionEnabled = !this.protectionEnabled;
        }
        logger.info(`Slot ${this.slot}: Protection ${this.protectionEnabled ? 'ENABLED' : 'DISABLED'}`);
        return this.protectionEnabled;
    }

    startLobbyRetry() {
        this.stopLobbyRetry();

        const retryIntervalMs = 120000;
        const returnCmd = this.config.settings.lobbyReturnCommand || '/home sp';
        logger.info(`Slot ${this.slot}: Starting lobby retry loop (every ${Math.round(retryIntervalMs / 1000)}s with ${returnCmd})`);

        const sendReturnCommand = (reason = 'retry') => {
            if (!this.bot || !this.isInLobby) {
                return;
            }

            this.bot.chat(returnCmd);
            logger.info(`Slot ${this.slot}: Sent ${returnCmd} (${reason})`);

            // Fallback check: sometimes we might have already been teleported back but missed the event.
            if (this.bot && this.bot.entity) {
                if (this.checkAfkAnchorDrift('lobby-retry')) {
                    return;
                }

                const distToHome = this.getDistanceToHome(this.bot.entity.position);
                if (distToHome !== null && distToHome <= this.getLobbyReturnThreshold()) {
                    logger.info(`Slot ${this.slot}: Lobby Retry Loop detected we are back at base (${Math.round(distToHome)}m). Exiting lobby mode.`);
                    this.exitLobbyMode();
                }
            }
        };

        sendReturnCommand('initial');

        this.lobbyRetryInterval = setInterval(() => {
            if (!this.bot || !this.isInLobby) {
                this.stopLobbyRetry();
                return;
            }

            sendReturnCommand('retry');
        }, retryIntervalMs);
    }

    stopLobbyRetry() {
        if (this.lobbyRetryInterval) {
            clearInterval(this.lobbyRetryInterval);
            this.lobbyRetryInterval = null;
        }
    }

    startInventoryMonitor() {
        if (this.inventoryMonitorInterval) {
            clearInterval(this.inventoryMonitorInterval);
        }

        this.inventoryAlertSent = false;
        this.toolAlertSent.clear();

        this.inventoryMonitorInterval = setInterval(() => {
            if (!this.bot || this.status !== 'online' || this.isPaused || this.isInLobby) return;

            // Check inventory fullness
            const totalSlots = 36;
            const emptySlots = this.bot.inventory.emptySlotCount();
            const usedSlots = totalSlots - emptySlots;
            const fillPercent = Math.round((usedSlots / totalSlots) * 100);

            if (emptySlots <= 3 && !this.inventoryAlertSent) {
                this.inventoryAlertSent = true;
                const msg = emptySlots === 0
                    ? `📦 **Slot ${this.slot}:** Envanter **DOLU!** (${usedSlots}/${totalSlots})`
                    : `📦 **Slot ${this.slot}:** Envanter neredeyse dolu! (${usedSlots}/${totalSlots} - ${emptySlots} slot kaldı)`;
                if (this.onInventoryAlert) this.onInventoryAlert(msg);
            } else if (emptySlots > 5) {
                this.inventoryAlertSent = false;
            }

            // Check tool durability
            const tools = this.bot.inventory.items().filter(item =>
                item.name.includes('pickaxe') || item.name.includes('sword') ||
                item.name.includes('axe') || item.name.includes('shovel')
            );

            for (const tool of tools) {
                if (tool.durabilityUsed !== undefined && tool.maxDurability) {
                    const remaining = tool.maxDurability - tool.durabilityUsed;
                    const percent = Math.round((remaining / tool.maxDurability) * 100);

                    if (percent <= 10 && !this.toolAlertSent.has(tool.slot)) {
                        this.toolAlertSent.add(tool.slot);
                        const msg = `⚠️ **Slot ${this.slot}:** **${tool.name}** dayanıklılığı çok düşük! (%${percent} - ${remaining}/${tool.maxDurability})`;
                        if (this.onInventoryAlert) this.onInventoryAlert(msg);
                    }
                }

                // nbt-based durability check (mineflayer stores it in nbt)
                if (tool.nbt?.value?.Damage?.value !== undefined) {
                    const maxDur = getMaxDurability(tool.name);
                    if (maxDur) {
                        const damage = tool.nbt.value.Damage.value;
                        const remaining = maxDur - damage;
                        const percent = Math.round((remaining / maxDur) * 100);

                        if (percent <= 10 && !this.toolAlertSent.has(tool.slot)) {
                            this.toolAlertSent.add(tool.slot);
                            const msg = `⚠️ **Slot ${this.slot}:** **${tool.name}** dayanıklılığı çok düşük! (%${percent})`;
                            if (this.onInventoryAlert) this.onInventoryAlert(msg);
                        }
                    }
                }
            }
        }, 60000); // Check every 60 seconds
    }

    resolveDisplayStatus() {
        // In some short race windows, internal status may still be "offline/connecting"
        // even though protocol state is already in play. Prefer runtime client state.
        const clientState = this.bot?._client?.state;
        if ((this.status === 'offline' || this.status === 'connecting') && clientState === 'play') {
            return 'online';
        }
        return this.status;
    }

    getStats() {
        let currentUptime = this.stats.totalUptime;
        if (this.stats.connectedAt) {
            currentUptime += Date.now() - this.stats.connectedAt;
        }

        const totalSessionTime = Date.now() - this.stats.sessionStart;

        return {
            slot: this.slot,
            username: this.accountConfig.username,
            status: this.resolveDisplayStatus(),
            uptime: currentUptime,
            uptimeFormatted: formatDuration(currentUptime),
            sessionTime: totalSessionTime,
            sessionTimeFormatted: formatDuration(totalSessionTime),
            reconnects: this.stats.reconnects,
            spawnersBroken: this.stats.spawnersBroken,
            alertsTriggered: this.stats.alertsTriggered,
            lobbyEvents: this.stats.lobbyEvents,
            lastDisconnect: this.stats.lastDisconnect,
        };
    }

    handleReconnect() {
        if (this.manualStopRequested) {
            logger.info(`Slot ${this.slot}: Reconnect skipped - manual stop lock is active`);
            return;
        }

        if (this.isManuallyStopped) {
            logger.info(`Slot ${this.slot}: Reconnect skipped - bot was manually stopped`);
            return;
        }

        if (this.isConnecting || this.bot) {
            logger.info(`Slot ${this.slot}: Reconnect skipped - bot is already connecting/online`);
            return;
        }

        let delay = this.tempReconnectDelay || this.config.settings.reconnectDelay || 5000;
        this.tempReconnectDelay = null;
        const maxAttempts = this.config.settings.maxReconnectAttempts ?? 10;
        const permanentRetry = this.config.settings.permanentRetryAfterMaxReconnect ?? false;

        // Prevent duplicate queued reconnect timers for the same slot.
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        const scheduledId = ++this.reconnectScheduleId;

        if (this.reconnectAttempts >= maxAttempts) {
            if (permanentRetry) {
                logger.warn(`Slot ${this.slot}: Max reconnect attempts (${maxAttempts}) reached. Entering permanent retry mode (60s interval).`);
                delay = 60000; // 60 seconds sticky interval
            } else {
                logger.error(`Slot ${this.slot}: Max reconnect attempts (${maxAttempts}) reached. Auto-reconnect stopped.`);
                this.isManuallyStopped = true;
                return;
            }
        } else {
            this.reconnectAttempts++;
            logger.info(`Slot ${this.slot}: Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${maxAttempts})`);
        }

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (
                scheduledId === this.reconnectScheduleId &&
                !this.isManuallyStopped &&
                !this.isConnecting &&
                !this.bot
            ) {
                this.start('reconnect');
            }
        }, delay);
    }

    async stop() {
        this.manualStopRequested = true;
        this.isManuallyStopped = true;
        this.reconnectScheduleId++;

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

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
            this.start('restart');
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

    async sendChat(message) {
        if (!this.bot || this.status !== 'online' || this.isPaused) {
            logger.warn(`Slot ${this.slot}: Cannot send chat message - bot not ready`);
            return false;
        }

        try {
            // Check if sneaking
            const isSneaking = this.bot.getControlState('sneak');

            if (isSneaking) {
                this.bot.setControlState('sneak', false);
                await new Promise(resolve => setTimeout(resolve, 100)); // Wait for server to process unsneak
            }

            this.bot.chat(message);
            logger.info(`Slot ${this.slot}: Sent message: ${message}`);

            if (isSneaking) {
                await new Promise(resolve => setTimeout(resolve, 100)); // Wait for message to be sent
                this.bot.setControlState('sneak', true);
            }

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
            clearTimeout(this.antiAfkInterval);
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
        if (this.inventoryMonitorInterval) {
            clearInterval(this.inventoryMonitorInterval);
            this.inventoryMonitorInterval = null;
        }
        this.stopAfkDriftCheck();
        this.stopLobbyRetry();
        this.isInLobby = false;
        this.lastProtectionTargetPos = null;

        this.bot = null;
        this.status = 'offline';
    }

    getStatus() {
        const resolvedStatus = this.resolveDisplayStatus();
        return {
            slot: this.slot,
            username: this.accountConfig.username,
            status: resolvedStatus,
            isPaused: this.isPaused,
            protectionEnabled: this.protectionEnabled,
            reconnectAttempts: this.reconnectAttempts,
            health: this.bot?.health,
            food: this.bot?.food,
            position: this.bot?.entity?.position
        };
    }
}
