import mineflayer from 'mineflayer';
import logger from './utils/Logger.js';
import { InventoryManager } from './minecraft/managers/InventoryManager.js';
import { ActivityManager } from './minecraft/managers/ActivityManager.js';
import { ConnectionManager } from './minecraft/managers/ConnectionManager.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        this.isConnecting = false;
        this.isManuallyStopped = false;
        this.manualStopRequested = false;
        this.reconnectAttempts = 0;
        this.alreadyOnlineRetries = 0;
        this.sameKickStreak = 0;
        this.lastKickSignature = '';
        this.lastKickAt = 0;
        this.reconnectScheduleId = 0;
        this.proximityInterval = null;
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

            if (this.config.settings.proximityAlertEnabled) {
                this.startProximityCheck();
            }

            if (this.onConnect) {
                // Prefer real negotiated protocol version over configured value.
                this.onConnect(this.config.minecraft.server.host, this.bot.version || this.config.minecraft.server.version);
            }

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

            if (this.config.settings.autoReconnect && !this.manualStopRequested) {
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

        // Stop proximity while teleported.
        if (this.proximityInterval) {
            clearInterval(this.proximityInterval);
            this.proximityInterval = null;
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

        if (this.config.settings.proximityAlertEnabled) {
            this.startProximityCheck();
        }
    }

    getBestPickaxe() {
        return this.inventoryManager.getBestPickaxe();
    }

    async equipPickaxe(force = false) {
        return this.inventoryManager.equipPickaxe(force);
    }

    startProximityCheck() {
        this.activityManager.startProximityCheck();
    }

    isEnemyNearby() {
        return this.activityManager.isEnemyNearby();
    }

    async breakSpawnerNormally(pos, blockName, options = {}) {
        const preDigPause = Math.max(0, options.preDigPause ?? 80);
        const verifyDelay = Math.max(0, options.verifyDelay ?? 200);
        const digActionTimeout = Math.max(1000, options.digActionTimeout ?? 7000);
        const breakRetryCount = Math.max(0, options.breakRetryCount ?? 2);
        const breakRetryDelay = Math.max(0, options.breakRetryDelay ?? 220);
        const visibilityTimeout = Math.max(200, options.visibilityTimeout ?? 1400);
        const stackReappearConfirmMs = Math.max(250, options.stackReappearConfirmMs ?? 1600);

        for (let attempt = 0; attempt <= breakRetryCount; attempt++) {
            if (!this.bot || this.status !== 'online') {
                return { broken: false, reason: 'bot_not_ready' };
            }

            let block = this.bot.blockAt(pos);
            if (!block || block.name !== blockName) {
                const visibleUntil = Date.now() + visibilityTimeout;
                while (Date.now() < visibleUntil) {
                    await this.refreshProtectionView(pos);
                    await sleep(90);

                    block = this.bot.blockAt(pos);
                    if (block && block.name === blockName) {
                        break;
                    }
                }

                if (!block || block.name !== blockName) {
                    return { broken: false, reason: 'not_visible' };
                }
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

            let verifyBlock = this.bot?.blockAt(pos);
            if (!verifyBlock || verifyBlock.name !== blockName) {
                const reappearUntil = Date.now() + stackReappearConfirmMs;
                while (Date.now() < reappearUntil) {
                    await this.refreshProtectionView(pos);
                    await sleep(110);

                    verifyBlock = this.bot?.blockAt(pos);
                    if (verifyBlock && verifyBlock.name === blockName) {
                        return { broken: false, reason: 'stack_remaining' };
                    }
                }

                return { broken: true, reason: 'broken' };
            }

            return { broken: false, reason: 'stack_remaining' };
        }

        return { broken: false, reason: 'still_exists' };
    }

    async refreshProtectionView(referencePos) {
        if (!this.bot || this.status !== 'online' || this.manualStopRequested || !referencePos) {
            return;
        }

        const targetCenter = referencePos.offset(0.5, 0.5, 0.5);
        const safeLookAt = async (lookTarget) => {
            const bot = this.bot;
            if (!bot || this.status !== 'online' || this.manualStopRequested) {
                return false;
            }

            try {
                await bot.lookAt(lookTarget, true);
                return true;
            } catch (_) {
                return false;
            }
        };

        if (!(await safeLookAt(targetCenter))) {
            return;
        }

        const sweepTargets = [
            targetCenter.offset(0.40, 0.12, 0),
            targetCenter.offset(-0.40, -0.10, 0),
            targetCenter.offset(0, 0.08, 0.40),
            targetCenter.offset(0, -0.08, -0.40),
            targetCenter
        ];

        for (const lookTarget of sweepTargets) {
            if (!(await safeLookAt(lookTarget))) {
                return;
            }
            await sleep(85);
            if (!this.bot || this.status !== 'online' || this.manualStopRequested) {
                return;
            }
        }

        await safeLookAt(targetCenter);
    }

    async executeProtectionSimple() {
        if (!this.bot || this.status !== 'online' || this.manualStopRequested) return;
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
        if (!this.bot || this.status !== 'online' || this.manualStopRequested || this.isInLobby) {
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
        let lastBrokenPos = null;
        let lastStackTargetPos = null;

        try {
            while (this.bot && this.status === 'online' && !this.manualStopRequested) {
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

                if (blocks.length === 0 && lastStackTargetPos) {
                    blocks = [lastStackTargetPos.clone ? lastStackTargetPos.clone() : lastStackTargetPos];
                    targetSource = 'stack-fallback';
                }

                if (blocks.length === 0) {
                    emptyScanCount++;

                    if (lastBrokenPos && emptyScanCount <= requiredEmptyScans) {
                        logger.info(`[Spawner] Slot ${this.slot}: Hedef gorunmuyor, son kirilan bolgede gorus yenileniyor.`);
                        await this.refreshProtectionView(lastBrokenPos);
                        if (!this.bot || this.status !== 'online' || this.manualStopRequested) {
                            break;
                        }
                    }

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
                    lastBrokenPos = targetPos.clone ? targetPos.clone() : targetPos;
                    lastStackTargetPos = null;

                    const progressMsg = `[Spawner] Slot ${this.slot}: +1 spawner kirildi | Toplam: ${totalBroken}`;
                    logger.info(progressMsg);
                    notify(progressMsg);

                    await this.refreshProtectionView(targetPos);
                    if (!this.bot || this.status !== 'online' || this.manualStopRequested) {
                        break;
                    }
                } else if (breakResult.reason === 'stack_remaining') {
                    stalledCycles = 0;
                    lastBrokenPos = targetPos.clone ? targetPos.clone() : targetPos;
                    lastStackTargetPos = targetPos.clone ? targetPos.clone() : targetPos;
                    await this.refreshProtectionView(targetPos);
                    if (!this.bot || this.status !== 'online' || this.manualStopRequested) {
                        break;
                    }
                } else if (breakResult.broken && breakResult.reason === 'already_gone') {
                    stalledCycles = 0;
                    lastStackTargetPos = null;
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
