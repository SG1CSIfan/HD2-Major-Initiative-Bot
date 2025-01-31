// utils/logger.js - Winston Logging System with Log Rotation
const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');
require('winston-daily-rotate-file');

const LOGS_DIR = path.join(__dirname, '../logs');
const IMAGE_DEBUG_DIR = path.join(LOGS_DIR, 'imageDebugOutput');
const IMAGE_SUBMITTED_DIR = path.join(LOGS_DIR, 'imageSubmitted');
const MAX_LOG_DAYS = 5;
const TIMEZONE = 'America/New_York';

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGE_DEBUG_DIR)) {
    fs.mkdirSync(IMAGE_DEBUG_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGE_SUBMITTED_DIR)) {
    fs.mkdirSync(IMAGE_SUBMITTED_DIR, { recursive: true });
}

const transport = new transports.DailyRotateFile({
    filename: path.join(LOGS_DIR, 'bot-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: `${MAX_LOG_DAYS}d`,
    zippedArchive: false
});

const logger = createLogger({
    level: process.env.DEV_MODE === 'true' ? 'debug' : 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level = 'info', message }) => {
            return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [
        new transports.Console({ format: format.colorize() }),
        transport
    ]
});

module.exports = { logger, IMAGE_DEBUG_DIR, IMAGE_SUBMITTED_DIR };