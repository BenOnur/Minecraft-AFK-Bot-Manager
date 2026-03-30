import winston from 'winston';
import type { TransformableInfo } from 'logform';

// Custom transport that supports callbacks - use any to avoid complex winston typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class CallbackTransport extends (winston.transport as any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(opts?: any) {
    super(opts);
    this.callbacks = new Set<(message: string) => void>();
  }

  callbacks: Set<(message: string) => void>;

  log(info: TransformableInfo, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Format message for display
    const formattedMessage = `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`;

    for (const cb of this.callbacks) {
      try {
        cb(formattedMessage);
      } catch (error) {
        console.error('Error in log callback:', error);
      }
    }

    if (callback) {
      callback();
    }
  }

  addCallback(cb: (message: string) => void): void {
    this.callbacks.add(cb);
  }

  removeCallback(cb: (message: string) => void): void {
    this.callbacks.delete(cb);
  }
}

const callbackTransport = new CallbackTransport();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      )
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 7
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 7
    }),
    callbackTransport as unknown as winston.transport
  ]
});

// Attach stream methods to logger instance
(logger as winston.Logger & {
  addStream: (cb: (message: string) => void) => void;
  removeStream: (cb: (message: string) => void) => void;
}).addStream = (cb: (message: string) => void) => callbackTransport.addCallback(cb);
(logger as winston.Logger & {
  addStream: (cb: (message: string) => void) => void;
  removeStream: (cb: (message: string) => void) => void;
}).removeStream = (cb: (message: string) => void) => callbackTransport.removeCallback(cb);

// Create typed interface for logger
interface Logger extends winston.Logger {
  addStream(cb: (message: string) => void): void;
  removeStream(cb: (message: string) => void): void;
}

export default logger as Logger;
