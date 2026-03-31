import mineflayer from 'mineflayer';
import logger from './utils/Logger.js';
import { InventoryManager } from './minecraft/managers/InventoryManager.js';
import { ActivityManager } from './minecraft/managers/ActivityManager.js';
import { ConnectionManager } from './minecraft/managers/ConnectionManager.js';

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

        this.inventoryManager = new InventoryManager(this);
        this.activityManager = new ActivityManager(this);
        this.connectionManager = new ConnectionManager(this);
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

    getSavedSpawnerTargets(blockName, maxBlocksPerScan, radius, options = {}) {
        if (!this.bot || !this.bot.entity) {
            return [];
        }

        const includeMissing = options.includeMissing === true;

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

            if (includeMissing) {
                targets.push(pos);
                continue;
            }

            const block = this.bot.blockAt(pos);
            if (block && block.name === blockName) {
                targets.push(pos);
            }
        }

        return targets;
    }

    getProtectionTargets(blockName, maxBlocksPerScan, radius, options = {}) {
        const includeMissingSavedTargets = options.includeMissingSavedTargets === true;
        const savedTargets = this.getSavedSpawnerTargets(
            blockName,
            maxBlocksPerScan,
            radius,
            { includeMissing: includeMissingSavedTargets }
        );
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
        this.activityManager.startAntiAfk();
    }

    getBestPickaxe() {
        return this.inventoryManager.getBestPickaxe();
    }

    async equipPickaxe(force = false) {
        return this.inventoryManager.equipPickaxe(force);
    }

    async startAutoEat() {
        return this.activityManager.startAutoEat();
    }

    startProximityCheck() {
        this.activityManager.startProximityCheck();
    }

    isEnemyNearby() {
        return this.activityManager.isEnemyNearby();
    }

    getSpawnerItemCount() {
        return this.inventoryManager.getSpawnerItemCount();
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

    getDigFaceForPosition(pos) {
        if (!this.bot?.entity?.position || !pos?.offset) {
            return 1; // top
        }

        const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height || 1.62, 0);
        const center = pos.offset(0.5, 0.5, 0.5);
        const dx = center.x - eyePos.x;
        const dy = center.y - eyePos.y;
        const dz = center.z - eyePos.z;

        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const az = Math.abs(dz);

        if (ay >= ax && ay >= az) {
            return dy > 0 ? 0 : 1; // bottom : top
        }

        if (ax >= az) {
            return dx > 0 ? 4 : 5; // west : east
        }

        return dz > 0 ? 2 : 3; // north : south
    }

    async performPacketDigCycle(pos, options = {}) {
        if (!this.bot?._client) {
            return { gained: 0 };
        }

        const holdMs = Math.max(250, options.digActionTimeout ?? 1200);
        const pulseMs = Math.max(45, options.packetDigPulseMs ?? 120);
        const restartMs = Math.max(0, options.packetDigRestartMs ?? 0);
        const spawnerBefore = Number.isFinite(options.spawnerBefore) ? options.spawnerBefore : null;
        const location = {
            x: Math.floor(Number(pos.x)),
            y: Math.floor(Number(pos.y)),
            z: Math.floor(Number(pos.z))
        };
        const face = this.getDigFaceForPosition(pos);

        const sendDigPacket = (status) => {
            this.bot._client.write('block_dig', { status, location, face });
        };

        try {
            // Clear stale state first.
            sendDigPacket(1);
        } catch (_) {
            // ignore
        }

        sendDigPacket(0);
        let lastRestartAt = Date.now();
        const startedAt = Date.now();

        while ((Date.now() - startedAt) <= holdMs) {
            if (!this.bot || this.status !== 'online') {
                break;
            }

            if (spawnerBefore !== null) {
                const gainedNow = this.getSpawnerItemCount() - spawnerBefore;
                if (gainedNow > 0) {
                    try {
                        sendDigPacket(2);
                    } catch (_) {
                        // ignore
                    }
                    await sleep(90);
                    return {
                        gained: gainedNow
                    };
                }
            }

            if (restartMs > 0 && (Date.now() - lastRestartAt) >= restartMs) {
                try {
                    sendDigPacket(1);
                    sendDigPacket(0);
                } catch (_) {
                    // ignore
                }
                lastRestartAt = Date.now();
            }

            await sleep(pulseMs);
        }

        try {
            sendDigPacket(2);
        } catch (_) {
            // ignore
        }

        await sleep(90);
        let gained = 0;
        if (spawnerBefore !== null) {
            gained = Math.max(0, this.getSpawnerItemCount() - spawnerBefore);
        }
        return { gained };
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
        const skipLook = options.skipLook === true;
        const alwaysRealignAim = options.alwaysRealignAim !== false;
        const forceLookForDig = options.forceLookForDig !== false;
        const digFace = options.digFace ?? 'raycast';
        const packetDigEnabled = options.packetDigEnabled !== false;
        const packetDigPulseMs = Math.max(45, options.packetDigPulseMs ?? 120);
        const packetDigRestartMs = Math.max(packetDigPulseMs, options.packetDigRestartMs ?? 420);
        const digActionTimeout = Math.max(150, options.digActionTimeout ?? 650);
        const postDigReleaseDelay = Math.max(0, options.postDigReleaseDelay ?? 25);
        const blockGoneStableMs = Math.max(0, options.blockGoneStableMs ?? 500);
        const blockGoneRecheckInterval = Math.max(20, options.blockGoneRecheckInterval ?? 100);

        for (let attempt = 0; attempt <= breakRetryCount; attempt++) {
            let digSettled = true;
            const releaseDigIfPending = async (withDelay = true) => {
                if (!digSettled && this.bot && typeof this.bot.stopDigging === 'function') {
                    try {
                        this.bot.stopDigging();
                    } catch (_) {
                        // Ignore stopDigging transport errors.
                    }
                    digSettled = true;
                    if (withDelay && postDigReleaseDelay > 0) {
                        await sleep(postDigReleaseDelay);
                    }
                }
            };

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
            let packetCycleResult = null;

            try {
                const digTarget = pos.offset(0.5, 0.5, 0.5);
                if (!skipLook || alwaysRealignAim) {
                    if (skipLook && alwaysRealignAim) {
                        // Re-aim every swing so stacked-spawner plugins treat each click as valid.
                        await this.bot.lookAt(digTarget, true);
                        if (preDigPause > 0) {
                            await sleep(Math.max(45, Math.min(preDigPause, 120)));
                        }
                    } else {
                        await this.naturalLookAtBlock(pos, {
                            naturalLookEnabled,
                            naturalLookSteps,
                            naturalLookStepDelay,
                            naturalLookJitter,
                            preDigPause
                        });
                    }
                }
                if (packetDigEnabled) {
                    packetCycleResult = await this.performPacketDigCycle(pos, {
                        digActionTimeout,
                        packetDigPulseMs,
                        packetDigRestartMs,
                        spawnerBefore
                    });
                } else {
                    digSettled = false;
                    let digError = null;
                    const digPromise = this.bot.dig(block, forceLookForDig, digFace)
                        .then(() => {
                            digSettled = true;
                        })
                        .catch((error) => {
                            digSettled = true;
                            digError = error;
                        });

                    // Stacked-spawner plugins may not turn block into air; avoid hanging forever on dig().
                    await Promise.race([
                        digPromise,
                        sleep(digActionTimeout)
                    ]);

                    if (!digSettled) {
                        await releaseDigIfPending(true);
                    } else if (digError) {
                        throw digError;
                    }
                }
            } catch (error) {
                await releaseDigIfPending(true);
                if (attempt >= breakRetryCount) {
                    return { broken: false, reason: 'dig_error', error };
                }
            }

            if (breakDelay > 0) {
                await sleep(breakDelay);
            }

            if (packetCycleResult?.gained > 0) {
                await releaseDigIfPending(true);
                return { broken: true, byInventory: true, gained: packetCycleResult.gained };
            }

            if (packetDigEnabled) {
                const packetConfirmStart = Date.now();
                let sawDisappearDuringPacketConfirm = false;
                while ((Date.now() - packetConfirmStart) <= inventoryConfirmTimeout) {
                    const spawnerAfter = this.getSpawnerItemCount();
                    if (spawnerAfter > spawnerBefore) {
                        await releaseDigIfPending(true);
                        return { broken: true, byInventory: true, gained: spawnerAfter - spawnerBefore };
                    }

                    const packetCheckBlock = this.bot?.blockAt(pos);
                    if (!packetCheckBlock || packetCheckBlock.name !== blockName) {
                        sawDisappearDuringPacketConfirm = true;
                        break;
                    }

                    await sleep(inventoryConfirmPollInterval);
                }

                if (sawDisappearDuringPacketConfirm) {
                    if (verifyDelay > 0) {
                        await sleep(verifyDelay);
                    }

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
                        const stableStart = Date.now();
                        while ((Date.now() - stableStart) <= blockGoneStableMs) {
                            const lateCheck = this.bot?.blockAt(pos);
                            if (lateCheck && lateCheck.name === blockName) {
                                await releaseDigIfPending(true);
                                return { broken: false, reason: 'block_reappeared' };
                            }
                            await sleep(blockGoneRecheckInterval);
                        }
                        await releaseDigIfPending(true);
                        return { broken: true, byInventory: false, gained: 0 };
                    }
                }

                await releaseDigIfPending(true);
                return { broken: false, reason: 'stack_still_exists' };
            }

            // Stacked spawner servers may keep the same block and add items later (e.g. 10s cooldown).
            const confirmStart = Date.now();
            let sawDisappearDuringConfirm = false;
            while ((Date.now() - confirmStart) <= inventoryConfirmTimeout) {
                const spawnerAfter = this.getSpawnerItemCount();
                if (spawnerAfter > spawnerBefore) {
                    await releaseDigIfPending(true);
                    return { broken: true, byInventory: true, gained: spawnerAfter - spawnerBefore };
                }

                // Block may vanish briefly client-side; verify with stable checks below instead of instant success.
                const midCheckBlock = this.bot?.blockAt(pos);
                if (!midCheckBlock || midCheckBlock.name !== blockName) {
                    sawDisappearDuringConfirm = true;
                    break;
                }

                // Fast stacked mode: if block still exists shortly after dig, keep hitting immediately.
                if (stackedFastMode && (Date.now() - confirmStart) >= stackedFastGraceMs) {
                    await releaseDigIfPending(true);
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
                        await releaseDigIfPending(true);
                        return { broken: false, reason: 'block_reappeared' };
                    }
                    await sleep(blockGoneRecheckInterval);
                }
                await releaseDigIfPending(true);
                return { broken: true, byInventory: false, gained: 0 };
            }

            if (sawDisappearDuringConfirm) {
                await releaseDigIfPending(true);
                return { broken: false, reason: 'block_reappeared' };
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

    async breakSpawnerNormally(pos, blockName, options = {}) {
        const preDigPause = Math.max(0, options.preDigPause ?? 80);
        const verifyDelay = Math.max(0, options.verifyDelay ?? 200);
        const digActionTimeout = Math.max(1000, options.digActionTimeout ?? 7000);
        const breakRetryCount = Math.max(0, options.breakRetryCount ?? 2);
        const breakRetryDelay = Math.max(0, options.breakRetryDelay ?? 220);

        for (let attempt = 0; attempt <= breakRetryCount; attempt++) {
            if (!this.bot || this.status !== 'online') {
                return { broken: false, reason: 'bot_not_ready' };
            }

            const block = this.bot.blockAt(pos);
            if (!block || block.name !== blockName) {
                return { broken: true, reason: 'already_gone' };
            }

            try {
                await this.equipPickaxe();
                await this.bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);
                if (preDigPause > 0) {
                    await sleep(preDigPause);
                }

                await Promise.race([
                    this.bot.dig(block, true),
                    sleep(digActionTimeout).then(() => {
                        throw new Error('dig_timeout');
                    })
                ]);
            } catch (error) {
                if (error.message === 'dig_timeout' && this.bot?.stopDigging) {
                    try {
                        this.bot.stopDigging();
                    } catch (_) {
                        // ignore
                    }
                }

                if (attempt >= breakRetryCount) {
                    return {
                        broken: false,
                        reason: error.message === 'dig_timeout' ? 'dig_timeout' : 'dig_error'
                    };
                }

                if (breakRetryDelay > 0) {
                    await sleep(breakRetryDelay);
                }
                continue;
            }

            if (verifyDelay > 0) {
                await sleep(verifyDelay);
            }

            const verifyBlock = this.bot?.blockAt(pos);
            if (!verifyBlock || verifyBlock.name !== blockName) {
                return { broken: true, reason: 'broken' };
            }

            if (attempt < breakRetryCount && breakRetryDelay > 0) {
                await sleep(breakRetryDelay);
            }
        }

        return { broken: false, reason: 'still_exists' };
    }

    async executeProtectionSimple() {
        if (!this.bot || this.status !== 'online') return;
        if (this._protectionRunning) return;
        if (this.isInLobby) {
            logger.warn(`Slot ${this.slot}: Protection triggered in lobby, aborting.`);
            return;
        }

        const protectionConfig = this.config.settings.protection || {};
        const startDelay = Math.max(0, protectionConfig.startDelay ?? 150);
        const blockName = protectionConfig.blockType || 'spawner';
        const baseRadius = protectionConfig.radius || 64;
        const maxScanRadius = Math.max(baseRadius, protectionConfig.maxScanRadius ?? 192);
        const scanRadiusStep = Math.max(8, protectionConfig.scanRadiusStep ?? 16);
        const savedTargetsRadius = Math.max(baseRadius, protectionConfig.savedTargetsRadius ?? maxScanRadius);
        const maxBlocksPerScan = Math.max(1, protectionConfig.maxBlocksPerScan ?? 256);
        const maxBreakReach = Math.max(1, protectionConfig.maxBreakReach ?? 5.0);
        const noTargetConfirmMs = Math.max(5000, protectionConfig.protectionClearConfirmMs ?? 20000);
        const noTargetRescanDelay = Math.max(80, protectionConfig.noTargetRescanDelay ?? 220);
        const requiredEmptyScans = Math.max(3, protectionConfig.requiredEmptyScans ?? 12);
        const postBreakDelay = Math.max(0, protectionConfig.postBreakDelay ?? 120);
        const maxStalledProtectionCycles = Math.max(20, protectionConfig.maxStalledProtectionCycles ?? 80);

        const notify = (message) => {
            if (this.onInventoryAlert) {
                this.onInventoryAlert(message);
            }
        };

        if (startDelay > 0) {
            await sleep(startDelay);
        }
        if (!this.bot || this.status !== 'online' || this.isInLobby) {
            return;
        }

        this._protectionRunning = true;
        this.bot.setControlState('sneak', true);
        await this.equipPickaxe(true);

        logger.info(`[Spawner] Slot ${this.slot}: Normal protection mode started (afkset targets first).`);

        let totalBroken = 0;
        let noTargetSince = null;
        let emptyScanCount = 0;
        let stalledCycles = 0;
        let completedByClearingTargets = false;

        try {
            while (this.bot && this.status === 'online') {
                if (this.isInLobby) {
                    logger.warn(`Slot ${this.slot}: Lobby detected during protection, aborting.`);
                    break;
                }

                if (this.isEnemyNearby()) {
                    logger.error(`Slot ${this.slot}: Enemy too close during protection, emergency stop.`);
                    await this.stop();
                    return;
                }

                if (this.bot.inventory.emptySlotCount() <= 2) {
                    logger.warn(`Slot ${this.slot}: Inventory nearly full, stopping protection.`);
                    break;
                }

                const scanRadius = Math.min(maxScanRadius, baseRadius + (emptyScanCount * scanRadiusStep));
                const savedTargets = this.getSavedSpawnerTargets(
                    blockName,
                    maxBlocksPerScan,
                    savedTargetsRadius,
                    { includeMissing: false }
                );

                let blocks = Array.isArray(savedTargets) ? [...savedTargets] : [];
                let targetSource = blocks.length > 0 ? 'afkProfile' : 'none';

                if (blocks.length === 0) {
                    const scannedTargets = this.bot.findBlocks({
                        matching: (block) => block.name === blockName,
                        maxDistance: scanRadius,
                        count: maxBlocksPerScan
                    });

                    blocks = Array.isArray(scannedTargets) ? [...scannedTargets] : [];
                    targetSource = blocks.length > 0 ? `scan(r=${scanRadius})` : 'none';
                }

                if (blocks.length === 0) {
                    emptyScanCount++;
                    if (!noTargetSince) {
                        noTargetSince = Date.now();
                    }

                    if (emptyScanCount % 5 === 0) {
                        logger.info(`[Spawner] Slot ${this.slot}: hedef bulunamadi (${targetSource}), bos tarama=${emptyScanCount}, yaricap=${scanRadius}`);
                    }

                    if ((Date.now() - noTargetSince) >= noTargetConfirmMs && emptyScanCount >= requiredEmptyScans) {
                        completedByClearingTargets = true;
                        break;
                    }

                    await sleep(noTargetRescanDelay);
                    continue;
                }

                noTargetSince = null;
                emptyScanCount = 0;

                const currentPos = this.bot?.entity?.position;
                if (!currentPos) {
                    await sleep(noTargetRescanDelay);
                    continue;
                }

                const reachableTargets = blocks
                    .map(pos => ({ pos, dist: currentPos.distanceTo(pos.offset(0.5, 0.5, 0.5)) }))
                    .filter(item => Number.isFinite(item.dist) && item.dist <= maxBreakReach)
                    .sort((a, b) => a.dist - b.dist);

                if (reachableTargets.length === 0) {
                    stalledCycles++;
                    if (stalledCycles % 5 === 0) {
                        logger.warn(`[Spawner] Slot ${this.slot}: ${blocks.length} hedef bulundu (${targetSource}) ama menzil disi.`);
                    }
                    if (stalledCycles >= maxStalledProtectionCycles) {
                        logger.warn(`Slot ${this.slot}: Protection stalled (out of reach) too long, stopping.`);
                        break;
                    }
                    await sleep(noTargetRescanDelay);
                    continue;
                }

                const targetPos = reachableTargets[0].pos;
                this.lastProtectionTargetPos = targetPos;

                const breakResult = await this.breakSpawnerNormally(targetPos, blockName, {
                    preDigPause: protectionConfig.preDigPause,
                    verifyDelay: protectionConfig.verifyDelay,
                    digActionTimeout: protectionConfig.digActionTimeout,
                    breakRetryCount: protectionConfig.breakRetryCount,
                    breakRetryDelay: protectionConfig.breakRetryDelay
                });

                if (breakResult.broken && breakResult.reason === 'broken') {
                    totalBroken++;
                    this.stats.spawnersBroken++;
                    stalledCycles = 0;

                    const progressMsg = `[Spawner] Slot ${this.slot}: +1 spawner kirildi | Toplam: ${totalBroken}`;
                    logger.info(progressMsg);
                    notify(progressMsg);
                } else if (breakResult.broken && breakResult.reason === 'already_gone') {
                    stalledCycles = 0;
                } else {
                    stalledCycles++;
                    if (stalledCycles % 5 === 0) {
                        logger.warn(`[Spawner] Slot ${this.slot}: hedef kirilamadi reason=${breakResult.reason} (${targetPos.x},${targetPos.y},${targetPos.z})`);
                    }
                    if (stalledCycles >= maxStalledProtectionCycles) {
                        logger.warn(`Slot ${this.slot}: Protection stalled too long, stopping.`);
                        break;
                    }
                }

                if (postBreakDelay > 0) {
                    await sleep(postBreakDelay);
                }
            }
        } finally {
            if (this.bot) {
                this.bot.setControlState('sneak', false);
            }
            this.lastProtectionTargetPos = null;
            this._protectionRunning = false;
        }

        if (completedByClearingTargets && this.bot && this.status === 'online') {
            const completeMsg = `[Spawner] Slot ${this.slot}: Tum spawnerlar temizlendi (${totalBroken}). /spawn 1-5 gidiliyor.`;
            logger.info(completeMsg);
            notify(completeMsg);
            await this.retreatToRandomSpawnAndStop();
            return;
        }

        if (this.bot) {
            await this.stop();
        }
    }

    async executeProtection() {
        return this.executeProtectionSimple();

        if (!this.bot || this.status !== 'online') return;
        if (this._protectionRunning) return;
        if (this.isInLobby) {
            logger.warn(`Slot ${this.slot}: Protection triggered in lobby, aborting.`);
            return;
        }

        const protectionConfig = this.config.settings.protection || {};
        const startDelay = Math.max(0, protectionConfig.startDelay ?? 250);
        const blockName = protectionConfig.blockType || 'spawner';
        const radius = protectionConfig.radius || 64;
        const maxBlocksPerScan = Math.max(1, protectionConfig.maxBlocksPerScan ?? 256);
        const maxBreakReach = Math.max(1, protectionConfig.maxBreakReach ?? 5.0);
        const noTargetConfirmMs = Math.max(1000, protectionConfig.protectionClearConfirmMs ?? 180000);
        const stackedTargetMissingConfirmMs = Math.max(1000, protectionConfig.stackedTargetMissingConfirmMs ?? 8000);
        const stackedExhaustionIdleMs = Math.max(5000, protectionConfig.stackedExhaustionIdleMs ?? 300000);
        const noTargetRescanDelay = Math.max(50, protectionConfig.noTargetRescanDelay ?? 100);
        const stackedNoGainRetryDelay = Math.min(1000, Math.max(100, protectionConfig.stackedNoGainRetryDelay ?? 350));
        const stackedNoGainBackoffAfter = Math.max(8, protectionConfig.stackedNoGainBackoffAfter ?? 8);
        const randomBreakIntervalMaxMs = Math.min(800, Math.max(0, protectionConfig.randomBreakIntervalMaxMs ?? 800));
        const vanillaDigPriority = protectionConfig.vanillaDigPriority !== false;
        const packetDigEnabled = !vanillaDigPriority && protectionConfig.packetDigEnabled !== false;
        let packetDigRuntimeEnabled = packetDigEnabled;
        const stackBatchSize = Math.max(1, protectionConfig.stackBatchSize ?? 64);
        const hasSavedAfkTargets = Array.isArray(this.afkProfile?.spawners) && this.afkProfile.spawners.length > 0;

        const configuredInventoryConfirmTimeout =
            protectionConfig.inventoryConfirmTimeout ??
            protectionConfig.inventoryConfirmDelay ??
            80;

        const breakOptions = {
            breakDelay: Math.max(0, protectionConfig.breakDelay ?? 0),
            verifyDelay: Math.max(0, protectionConfig.verifyDelay ?? 80),
            breakRetryCount: packetDigEnabled ? 0 : Math.max(0, protectionConfig.breakRetryCount ?? 1),
            breakRetryDelay: Math.max(0, protectionConfig.breakRetryDelay ?? 100),
            // Keep normal hit loop fast; occasional deep-probe is handled per-attempt below.
            inventoryConfirmTimeout: packetDigEnabled
                ? Math.max(5000, configuredInventoryConfirmTimeout)
                : Math.min(1500, Math.max(350, configuredInventoryConfirmTimeout)),
            inventoryConfirmPollInterval: Math.max(100, protectionConfig.inventoryConfirmPollInterval ?? 100),
            goneConfirmChecks: Math.max(1, protectionConfig.goneConfirmChecks ?? 3),
            goneConfirmInterval: Math.max(0, protectionConfig.goneConfirmInterval ?? 50),
            stackedFastMode: protectionConfig.stackedFastMode !== false,
            stackedFastGraceMs: Math.max(900, protectionConfig.stackedFastGraceMs ?? 900),
            naturalLookEnabled: protectionConfig.naturalLookEnabled !== false,
            naturalLookSteps: Math.max(1, protectionConfig.naturalLookSteps ?? 4),
            naturalLookStepDelay: Math.max(0, protectionConfig.naturalLookStepDelay ?? 20),
            naturalLookJitter: Math.max(0, protectionConfig.naturalLookJitter ?? 0.01),
            preDigPause: Math.max(0, protectionConfig.preDigPause ?? 35),
            packetDigEnabled,
            packetDigPulseMs: Math.max(45, protectionConfig.packetDigPulseMs ?? 120),
            packetDigRestartMs: protectionConfig.packetDigRestartMs === undefined
                ? 320
                : Math.max(0, protectionConfig.packetDigRestartMs),
            // Hold left-click long enough for stacked-spawner plugin break windows.
            digActionTimeout: packetDigEnabled
                ? Math.max(8000, protectionConfig.digActionTimeout ?? 9000)
                : Math.max(1000, protectionConfig.digActionTimeout ?? 4500),
            postDigReleaseDelay: Math.max(0, protectionConfig.postDigReleaseDelay ?? 25),
            blockGoneStableMs: Math.max(0, protectionConfig.blockGoneStableMs ?? 500),
            blockGoneRecheckInterval: Math.max(20, protectionConfig.blockGoneRecheckInterval ?? 100)
        };

        logger.info(`Slot ${this.slot}: Protection dig mode = ${packetDigEnabled ? 'packet-first' : 'vanilla-first'}`);

        if (startDelay > 0) {
            await sleep(startDelay);
        }
        if (!this.bot || this.status !== 'online' || this.isInLobby) {
            return;
        }

        this._protectionRunning = true;
        this.bot.setControlState('sneak', true);

        const bestPickaxe = this.getBestPickaxe();
        if (bestPickaxe) {
            await this.equipPickaxe(true);
        }

        let totalBroken = 0;
        let lastGainAt = 0;
        let lastProgressTargetPos = null;
        let noTargetSince = null;
        let completedByClearingTargets = false;

        const notify = (message) => {
            if (this.onInventoryAlert) {
                this.onInventoryAlert(message);
            }
        };
        const sleepWithBreakJitter = async (baseDelay = 0) => {
            const jitter = randomBreakIntervalMaxMs > 0
                ? Math.floor(Math.random() * (randomBreakIntervalMaxMs + 1))
                : 0;
            const totalDelay = Math.max(0, baseDelay) + jitter;
            if (totalDelay > 0) {
                await sleep(totalDelay);
            }
        };

        try {
            while (this.bot && this.status === 'online') {
                if (this.isInLobby) {
                    logger.warn(`Slot ${this.slot}: Lobby detected during protection, aborting.`);
                    break;
                }

                if (this.isEnemyNearby()) {
                    logger.error(`Slot ${this.slot}: Enemy too close during protection, emergency stop.`);
                    await this.stop();
                    return;
                }

                if (this.bot.inventory.emptySlotCount() <= 2) {
                    logger.warn(`Slot ${this.slot}: Inventory nearly full, stopping protection.`);
                    break;
                }

                const targetResult = this.getProtectionTargets(blockName, maxBlocksPerScan, radius, {
                    includeMissingSavedTargets: false
                });
                let blocks = targetResult.targets;
                let targetSource = targetResult.source;

                if (this.bot?.entity?.position) {
                    const currentPos = this.bot.entity.position;
                    blocks.sort((a, b) => currentPos.distanceSquared(a) - currentPos.distanceSquared(b));
                }

                if (blocks.length === 0) {
                    if (hasSavedAfkTargets) {
                        const savedFallbackTargets = this.getSavedSpawnerTargets(
                            blockName,
                            maxBlocksPerScan,
                            radius,
                            { includeMissing: true }
                        );

                        if (savedFallbackTargets.length > 0) {
                            blocks = savedFallbackTargets;
                            targetSource = 'afkProfile-fallback';
                        }
                    }
                }

                if (blocks.length === 0) {
                    const sinceLastGain = lastGainAt > 0 ? Date.now() - lastGainAt : Infinity;
                    if (lastProgressTargetPos && sinceLastGain < stackedExhaustionIdleMs) {
                        blocks = [lastProgressTargetPos];
                        targetSource = 'recent-gain-fallback';
                    }
                }

                if (blocks.length === 0) {
                    if (!noTargetSince) {
                        noTargetSince = Date.now();
                    }

                    const sinceNoTarget = Date.now() - noTargetSince;
                    const sinceLastGain = lastGainAt > 0 ? Date.now() - lastGainAt : Infinity;
                    if (sinceNoTarget >= noTargetConfirmMs && sinceLastGain >= noTargetConfirmMs) {
                        completedByClearingTargets = true;
                        break;
                    }

                    await sleep(noTargetRescanDelay);
                    continue;
                }

                noTargetSince = null;

                const orderedBlocks = this.orderBlocksSequentially(
                    blocks,
                    this.lastProtectionTargetPos || this.bot?.entity?.position || null
                );

                for (const pos of orderedBlocks) {
                    if (!this.bot || this.status !== 'online') {
                        break;
                    }

                    this.lastProtectionTargetPos = pos;
                    let missingSince = null;
                    let noGainStreak = 0;
                    let targetLastGainAt = Date.now();
                    let hasAimedAtTarget = false;

                    while (this.bot && this.status === 'online') {
                        if (this.isInLobby) {
                            break;
                        }

                        if (this.bot.inventory.emptySlotCount() <= 2) {
                            break;
                        }

                        const blockDistance = this.bot.entity.position.distanceTo(pos.offset(0.5, 0.5, 0.5));
                        if (blockDistance > maxBreakReach) {
                            break;
                        }

                        const block = this.bot.blockAt(pos);
                        if (!block || block.name !== blockName) {
                            if (!missingSince) {
                                missingSince = Date.now();
                            }

                            const missingElapsed = Date.now() - missingSince;
                            const missingLimit = targetSource === 'afkProfile-fallback'
                                ? Math.min(2000, stackedTargetMissingConfirmMs)
                                : (targetSource === 'recent-gain-fallback'
                                    ? Math.max(20000, stackedTargetMissingConfirmMs)
                                    : stackedTargetMissingConfirmMs);
                            if (missingElapsed < missingLimit) {
                                await sleepWithBreakJitter(noTargetRescanDelay);
                                continue;
                            }
                            break;
                        }

                        missingSince = null;
                        if (noGainStreak === 0 || (noGainStreak % 4) === 0) {
                            await this.equipPickaxe();
                        }

                        const activePacketDig = packetDigRuntimeEnabled;
                        const adaptivePacketRestartMs = activePacketDig
                            ? (noGainStreak >= 2
                                ? Math.max(220, breakOptions.packetDigRestartMs || 0)
                                : breakOptions.packetDigRestartMs)
                            : breakOptions.packetDigRestartMs;
                        const quickFollowUpSwing = activePacketDig ? false : hasAimedAtTarget;
                        const shouldDeepProbe = noGainStreak > 0 && (noGainStreak % 8 === 0);
                        const adaptiveConfirmTimeout = activePacketDig
                            ? Math.max(9000, breakOptions.inventoryConfirmTimeout)
                            : (shouldDeepProbe
                                ? Math.max(2500, breakOptions.inventoryConfirmTimeout)
                                : breakOptions.inventoryConfirmTimeout);
                        const maxDigHoldMs = activePacketDig
                            ? Math.max(8000, Math.min(15000, breakOptions.digActionTimeout))
                            : Math.max(3000, Math.min(7000, breakOptions.digActionTimeout));
                        const mediumDigHoldMs = Math.max(2400, Math.min(maxDigHoldMs, 3400));
                        const fastDigHoldMs = Math.max(1800, Math.min(maxDigHoldMs, 2600));
                        let adaptiveDigTimeout = fastDigHoldMs;
                        if (activePacketDig) {
                            adaptiveDigTimeout = maxDigHoldMs;
                            if (noGainStreak >= 4) {
                                adaptiveDigTimeout = Math.min(17000, maxDigHoldMs + 2000);
                            }
                            if (shouldDeepProbe) {
                                adaptiveDigTimeout = Math.min(18000, Math.max(adaptiveDigTimeout, adaptiveConfirmTimeout));
                            }
                        } else {
                            if (noGainStreak >= 3) {
                                adaptiveDigTimeout = mediumDigHoldMs;
                            }
                            if (noGainStreak >= 6) {
                                adaptiveDigTimeout = maxDigHoldMs;
                            }
                            if (shouldDeepProbe) {
                                adaptiveDigTimeout = Math.min(7000, Math.max(maxDigHoldMs, adaptiveConfirmTimeout + 900));
                            }
                        }

                        const breakResult = await this.breakBlockWithVerification(pos, blockName, {
                            ...breakOptions,
                            packetDigEnabled: activePacketDig,
                            packetDigRestartMs: adaptivePacketRestartMs,
                            breakRetryCount: activePacketDig ? 0 : Math.max(2, breakOptions.breakRetryCount),
                            skipLook: quickFollowUpSwing,
                            alwaysRealignAim: true,
                            forceLookForDig: true,
                            digFace: activePacketDig ? 'raycast' : 'auto',
                            // Stacked-spawner servers often need longer sustained hold; avoid early fast-exit.
                            stackedFastMode: false,
                            inventoryConfirmTimeout: adaptiveConfirmTimeout,
                            digActionTimeout: adaptiveDigTimeout,
                            naturalLookSteps: quickFollowUpSwing ? 1 : breakOptions.naturalLookSteps,
                            naturalLookStepDelay: quickFollowUpSwing ? 0 : breakOptions.naturalLookStepDelay,
                            naturalLookJitter: quickFollowUpSwing ? 0.004 : breakOptions.naturalLookJitter,
                            preDigPause: quickFollowUpSwing ? Math.min(12, breakOptions.preDigPause) : breakOptions.preDigPause
                        });
                        hasAimedAtTarget = true;

                        if (!this.bot || this.status !== 'online') {
                            break;
                        }

                        if (breakResult.broken) {
                            const stillSameBlock = this.bot?.blockAt(pos)?.name === blockName;
                            const gainedByInventory = Math.max(0, Number(breakResult.gained || 0));
                            const gained = stillSameBlock ? 0 : 1;

                            if (gained > 0) {
                                noGainStreak = 0;
                                targetLastGainAt = Date.now();
                                lastGainAt = targetLastGainAt;
                                lastProgressTargetPos = pos.clone();
                                totalBroken += gained;
                                this.stats.spawnersBroken += gained;
                                const progressMsg = `[Spawner] Slot ${this.slot}: +${gained} spawner kirildi | Toplam: ${totalBroken}`;
                                logger.info(progressMsg);
                                notify(progressMsg);
                            } else {
                                if (gainedByInventory > 0) {
                                    noGainStreak = 0;
                                    targetLastGainAt = Date.now();
                                    lastGainAt = targetLastGainAt;
                                    const estimatedLayers = Math.max(1, Math.round(gainedByInventory / stackBatchSize));
                                    logger.info(`[Spawner] Slot ${this.slot}: Stack hasar +${gainedByInventory} item (~${estimatedLayers} katman), blok hala duruyor.`);
                                } else {
                                    noGainStreak++;
                                }
                                if (noGainStreak % 10 === 0) {
                                    logger.warn(`[Spawner] Slot ${this.slot}: hedefte ilerleme yok x${noGainStreak} (${pos.x},${pos.y},${pos.z})`);
                                }
                                if (packetDigRuntimeEnabled && noGainStreak >= 6) {
                                    packetDigRuntimeEnabled = false;
                                    noGainStreak = 0;
                                    logger.warn(`[Spawner] Slot ${this.slot}: Packet dig ilerleme saglamadi, vanilla dig fallback moduna geciliyor.`);
                                }
                            }

                            if (stillSameBlock) {
                                if (noGainStreak >= stackedNoGainBackoffAfter) {
                                    await sleepWithBreakJitter(stackedNoGainRetryDelay);
                                } else {
                                    await sleepWithBreakJitter(noTargetRescanDelay);
                                }
                                continue;
                            }

                            await sleepWithBreakJitter(noTargetRescanDelay);
                            continue;
                        }

                        if (
                            breakResult.reason === 'stack_still_exists' ||
                            breakResult.reason === 'block_reappeared' ||
                            breakResult.reason === 'ghost_block_persisted' ||
                            breakResult.reason === 'cannot_dig' ||
                            breakResult.reason === 'dig_error'
                        ) {
                            noGainStreak++;
                            if (noGainStreak % 10 === 0) {
                                logger.warn(`[Spawner] Slot ${this.slot}: no-gain x${noGainStreak} reason=${breakResult.reason} (${pos.x},${pos.y},${pos.z})`);
                            }
                            if (packetDigRuntimeEnabled && noGainStreak >= 6) {
                                packetDigRuntimeEnabled = false;
                                noGainStreak = 0;
                                logger.warn(`[Spawner] Slot ${this.slot}: Packet dig reason=${breakResult.reason}. Vanilla dig fallback aktif.`);
                            }
                            if ((Date.now() - targetLastGainAt) >= stackedExhaustionIdleMs) {
                                logger.warn(`Slot ${this.slot}: ${pos} target stalled for too long, moving on.`);
                                break;
                            }

                            if (noGainStreak >= stackedNoGainBackoffAfter) {
                                await sleepWithBreakJitter(stackedNoGainRetryDelay);
                            } else {
                                await sleepWithBreakJitter(noTargetRescanDelay);
                            }
                            continue;
                        }

                        if (breakResult.reason === 'already_gone') {
                            break;
                        }

                        await sleepWithBreakJitter(noTargetRescanDelay);
                    }
                }

                await sleep(25);
            }
        } finally {
            if (this.bot) {
                this.bot.setControlState('sneak', false);
            }
            this.lastProtectionTargetPos = null;
            this._protectionRunning = false;
        }

        if (completedByClearingTargets && this.bot && this.status === 'online') {
            const completeMsg = `[Spawner] Slot ${this.slot}: Tum spawnerlar temizlendi (${totalBroken}). /spawn 1-5 gidiliyor.`;
            logger.info(completeMsg);
            notify(completeMsg);
            await this.retreatToRandomSpawnAndStop();
            return;
        }

        if (this.bot) {
            await this.stop();
        }
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
        this.inventoryManager.startInventoryMonitor();
    }

    resolveDisplayStatus() {
        return this.connectionManager.resolveDisplayStatus();
    }

    getStats() {
        return this.connectionManager.getStats();
    }

    handleReconnect() {
        this.connectionManager.handleReconnect();
    }

    async stop() {
        return this.connectionManager.stop();
    }

    pause() {
        return this.connectionManager.pause();
    }

    resume() {
        return this.connectionManager.resume();
    }

    async restart() {
        return this.connectionManager.restart();
    }

    async move(direction, distance) {
        return this.connectionManager.move(direction, distance);
    }

    async sendChat(message) {
        return this.connectionManager.sendChat(message);
    }

    getInventory() {
        return this.inventoryManager.getInventory();
    }

    async dropItem(itemName, count = null) {
        return this.inventoryManager.dropItem(itemName, count);
    }

    cleanup() {
        this.connectionManager.cleanup();
    }

    getStatus() {
        return this.connectionManager.getStatus();
    }
}
