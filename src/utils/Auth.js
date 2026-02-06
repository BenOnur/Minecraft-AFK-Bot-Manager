import logger from './Logger.js';

export class Auth {
    constructor(config) {
        this.telegramAllowedUsers = config.telegram?.allowedUsers || [];
        this.discordAllowedUsers = config.discord?.allowedUsers || [];
        this.discordGuildId = config.discord?.guildId || null;
    }

    isTelegramUserAuthorized(userId) {
        if (this.telegramAllowedUsers.length === 0) {
            logger.warn('No Telegram users are whitelisted. Anyone can control the bot!');
            return true;
        }
        return this.telegramAllowedUsers.includes(userId);
    }

    isDiscordUserAuthorized(userId, guildId) {
        if (this.discordAllowedUsers.length === 0) {
            logger.warn('No Discord users are whitelisted. Anyone can control the bot!');
            return true;
        }

        // Guild kontrolü (opsiyonel)
        if (this.discordGuildId && guildId !== this.discordGuildId) {
            return false;
        }

        return this.discordAllowedUsers.includes(userId);
    }
}
