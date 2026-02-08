import winston from 'winston';

class CallbackTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
    this.callbacks = new Set();
  }

  log(info, callback) {
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

  addCallback(cb) {
    this.callbacks.add(cb);
  }

  removeCallback(cb) {
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
      sync: false, // Asynchronous logging to prevent blocking
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
    callbackTransport
  ]
});

// Attach stream methods to logger instance
logger.addStream = (cb) => callbackTransport.addCallback(cb);
logger.removeStream = (cb) => callbackTransport.removeCallback(cb);

export default logger;
