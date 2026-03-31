import logger from '../../utils/Logger.js';

export class ActivityManager {
    constructor(owner) {
        this.owner = owner;
    }

    startProximityCheck() {
        const checkInterval = 2500 + (this.owner.slot * 100);

        this.owner.proximityInterval = setInterval(() => {
            if (!this.owner.bot || this.owner.status !== 'online' || this.owner.isInLobby) return;

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
