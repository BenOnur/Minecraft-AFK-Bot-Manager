import logger from '../../utils/Logger.js';

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

export class ConnectionManager {
    constructor(owner) {
        this.owner = owner;
    }

    resolveDisplayStatus() {
        const clientState = this.owner.bot?._client?.state;
        if ((this.owner.status === 'offline' || this.owner.status === 'connecting') && clientState === 'play') {
            return 'online';
        }
        return this.owner.status;
    }

    getStats() {
        let currentUptime = this.owner.stats.totalUptime;
        if (this.owner.stats.connectedAt) {
            currentUptime += Date.now() - this.owner.stats.connectedAt;
        }

        const totalSessionTime = Date.now() - this.owner.stats.sessionStart;

        return {
            slot: this.owner.slot,
            username: this.owner.accountConfig.username,
            status: this.resolveDisplayStatus(),
            uptime: currentUptime,
            uptimeFormatted: formatDuration(currentUptime),
            sessionTime: totalSessionTime,
            sessionTimeFormatted: formatDuration(totalSessionTime),
            reconnects: this.owner.stats.reconnects,
            spawnersBroken: this.owner.stats.spawnersBroken,
            alertsTriggered: this.owner.stats.alertsTriggered,
            lobbyEvents: this.owner.stats.lobbyEvents,
            lastDisconnect: this.owner.stats.lastDisconnect
        };
    }

    handleReconnect() {
        if (this.owner.manualStopRequested) {
            logger.info(`Slot ${this.owner.slot}: Reconnect skipped - manual stop lock is active`);
            return;
        }

        if (this.owner.isManuallyStopped) {
            logger.info(`Slot ${this.owner.slot}: Reconnect skipped - bot was manually stopped`);
            return;
        }

        if (this.owner.isConnecting || this.owner.bot) {
            logger.info(`Slot ${this.owner.slot}: Reconnect skipped - bot is already connecting/online`);
            return;
        }

        let delay = this.owner.tempReconnectDelay || this.owner.config.settings.reconnectDelay || 5000;
        this.owner.tempReconnectDelay = null;
        const maxAttempts = this.owner.config.settings.maxReconnectAttempts ?? 10;
        const permanentRetry = this.owner.config.settings.permanentRetryAfterMaxReconnect ?? false;

        if (this.owner.reconnectTimeout) {
            clearTimeout(this.owner.reconnectTimeout);
            this.owner.reconnectTimeout = null;
        }
        const scheduledId = ++this.owner.reconnectScheduleId;

        if (this.owner.reconnectAttempts >= maxAttempts) {
            if (permanentRetry) {
                logger.warn(`Slot ${this.owner.slot}: Max reconnect attempts (${maxAttempts}) reached. Entering permanent retry mode (60s interval).`);
                delay = 60000;
            } else {
                logger.error(`Slot ${this.owner.slot}: Max reconnect attempts (${maxAttempts}) reached. Auto-reconnect stopped.`);
                this.owner.isManuallyStopped = true;
                return;
            }
        } else {
            this.owner.reconnectAttempts++;
            logger.info(`Slot ${this.owner.slot}: Reconnecting in ${delay / 1000}s (attempt ${this.owner.reconnectAttempts}/${maxAttempts})`);
        }

        this.owner.reconnectTimeout = setTimeout(() => {
            this.owner.reconnectTimeout = null;
            if (
                scheduledId === this.owner.reconnectScheduleId &&
                !this.owner.isManuallyStopped &&
                !this.owner.isConnecting &&
                !this.owner.bot
            ) {
                this.owner.start('reconnect');
            }
        }, delay);
    }

    async stop() {
        this.owner.manualStopRequested = true;
        this.owner.isManuallyStopped = true;
        this.owner.reconnectScheduleId++;

        if (this.owner.reconnectTimeout) {
            clearTimeout(this.owner.reconnectTimeout);
            this.owner.reconnectTimeout = null;
        }

        logger.info(`Slot ${this.owner.slot}: Stopping bot`);

        if (this.owner.bot) {
            this.owner.bot.quit();
        }
        this.cleanup();
        return true;
    }

    pause() {
        if (!this.owner.bot) {
            logger.warn(`Slot ${this.owner.slot}: Bot is not running`);
            return false;
        }

        this.owner.isPaused = true;
        logger.info(`Slot ${this.owner.slot}: Bot paused`);
        return true;
    }

    resume() {
        if (!this.owner.bot) {
            logger.warn(`Slot ${this.owner.slot}: Bot is not running`);
            return false;
        }

        this.owner.isPaused = false;
        logger.info(`Slot ${this.owner.slot}: Bot resumed`);
        return true;
    }

    async restart() {
        logger.info(`Slot ${this.owner.slot}: Restarting bot`);
        await this.stop();

        setTimeout(() => {
            this.owner.start('restart');
        }, 2000);

        return true;
    }

    async move(direction, distance) {
        if (!this.owner.bot || this.owner.status !== 'online' || this.owner.isPaused) {
            return { success: false, message: 'Bot not ready' };
        }

        const validDirections = ['forward', 'back', 'left', 'right'];
        if (!validDirections.includes(direction)) {
            return { success: false, message: 'Invalid direction' };
        }

        if (isNaN(distance) || distance <= 0) {
            return { success: false, message: 'Invalid distance' };
        }

        const startPos = this.owner.bot.entity.position.clone();
        this.owner.bot.setControlState(direction, true);

        return new Promise((resolve) => {
            let isResolved = false;

            const checkInterval = setInterval(() => {
                if (!this.owner.bot) {
                    clearInterval(checkInterval);
                    if (!isResolved) {
                        isResolved = true;
                        resolve({ success: false, message: 'Bot disconnected' });
                    }
                    return;
                }

                const currentDist = this.owner.bot.entity.position.distanceTo(startPos);

                if (currentDist >= distance) {
                    this.owner.bot.setControlState(direction, false);
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
                    if (this.owner.bot) {
                        this.owner.bot.setControlState(direction, false);
                    }
                    isResolved = true;
                    const moved = this.owner.bot ? Math.round(this.owner.bot.entity.position.distanceTo(startPos)) : 0;
                    resolve({ success: true, message: `Movement timed out (moved ${moved} blocks)` });
                }
            }, timeoutMs);
        });
    }

    async sendChat(message) {
        if (!this.owner.bot || this.owner.status !== 'online' || this.owner.isPaused) {
            logger.warn(`Slot ${this.owner.slot}: Cannot send chat message - bot not ready`);
            return false;
        }

        try {
            const isSneaking = this.owner.bot.getControlState('sneak');

            if (isSneaking) {
                this.owner.bot.setControlState('sneak', false);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            this.owner.bot.chat(message);
            logger.info(`Slot ${this.owner.slot}: Sent message: ${message}`);

            if (isSneaking) {
                await new Promise(resolve => setTimeout(resolve, 100));
                this.owner.bot.setControlState('sneak', true);
            }

            return true;
        } catch (error) {
            logger.error(`Slot ${this.owner.slot}: Failed to send message: ${error.message}`);
            return false;
        }
    }

    cleanup() {
        if (this.owner.antiAfkInterval) {
            clearTimeout(this.owner.antiAfkInterval);
            this.owner.antiAfkInterval = null;
        }
        if (this.owner.proximityInterval) {
            clearInterval(this.owner.proximityInterval);
            this.owner.proximityInterval = null;
        }
        if (this.owner.autoEatTimeout) {
            clearTimeout(this.owner.autoEatTimeout);
            this.owner.autoEatTimeout = null;
        }
        if (this.owner.inventoryMonitorInterval) {
            clearInterval(this.owner.inventoryMonitorInterval);
            this.owner.inventoryMonitorInterval = null;
        }
        this.owner.stopAfkDriftCheck();
        this.owner.stopLobbyRetry();
        this.owner.isInLobby = false;
        this.owner.lastProtectionTargetPos = null;

        this.owner.bot = null;
        this.owner.status = 'offline';
    }

    getStatus() {
        const resolvedStatus = this.resolveDisplayStatus();
        return {
            slot: this.owner.slot,
            username: this.owner.accountConfig.username,
            status: resolvedStatus,
            isPaused: this.owner.isPaused,
            protectionEnabled: this.owner.protectionEnabled,
            reconnectAttempts: this.owner.reconnectAttempts,
            health: this.owner.bot?.health,
            food: this.owner.bot?.food,
            position: this.owner.bot?.entity?.position
        };
    }
}
