// Bot status types
export type BotStatus = 'offline' | 'online' | 'connecting' | 'error' | 'kicked';

// Account configuration
export interface MinecraftAccount {
  slot: number;
  username: string;
  auth: 'microsoft' | 'offline' | string;
  authUsername?: string;
  autoStart?: boolean;
  afkProfile?: AfkProfile;
  protectionEnabled?: boolean;
}

// AFK profile for position management
export interface AfkProfile {
  anchor: Position;
  spawners: Position[];
  recordedAt: number;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

// Config structure
export interface BotConfig {
  minecraft: {
    accounts: MinecraftAccount[];
    server: {
      host: string;
      port?: number;
    };
  };
  telegram?: {
    allowedUsers: string[];
    token?: string;
  };
  discord?: {
    allowedUsers: string[];
    guildId?: string;
    token?: string;
  };
  settings: {
    alertWhitelist?: string[];
    protection?: {
      enabled?: boolean;
    };
  };
}

// Command parsing
export interface ParsedCommand {
  command: string;
  args: string[];
}

export interface SlotValidation {
  valid: boolean;
  slots?: number[];
  error?: string;
  validSlots?: number[];
}

// Platform types
export type Platform = 'telegram' | 'discord' | 'cli';
