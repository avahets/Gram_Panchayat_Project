// logger.js - Logging Utility Module
class Logger {
    constructor(firestore = null, enableConsole = true, enableFirestore = true) {
        this.db = firestore;
        this.enableConsole = enableConsole;
        this.enableFirestore = enableFirestore;
        this.sessionId = this.generateSessionId();
        this.logBuffer = [];
        this.maxBufferSize = 100;
        this.flushInterval = 30000; // 30 seconds

        // Start periodic flush
        if (this.enableFirestore && this.db) {
            this.startPeriodicFlush();
        }
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {Object} context - Additional context
     */
    info(message, data = null, context = {}) {
        this.log('info', message, data, context);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {Object} context - Additional context
     */
    warn(message, data = null, context = {}) {
        this.log('warn', message, data, context);
    }

    /**
     * Log an error message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {Object} context - Additional context
     */
    error(message, data = null, context = {}) {
        this.log('error', message, data, context);
    }

    /**
     * Log a debug message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {Object} context - Additional context
     */
    debug(message, data = null, context = {}) {
        this.log('debug', message, data, context);
    }

    /**
     * Log a security event
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {Object} context - Additional context
     */
    security(message, data = null, context = {}) {
        this.log('security', message, data, { ...context, security: true });
    }

    /**
     * Log a performance metric
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} data - Additional data
     */
    performance(operation, duration, data = null) {
        this.log('performance', `${operation} completed in ${duration}ms`, {
            operation,
            duration,
            ...data
        }, { performance: true });
    }

    /**
     * Log a user action
     * @param {string} action - Action performed
     * @param {string} userId - User ID
     * @param {Object} data - Additional data
     */
    userAction(action, userId, data = null) {
        this.log('user_action', action, data, { userId, userAction: true });
    }

    /**
     * Main logging method
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {Object} context - Additional context
     */
    log(level, message, data = null, context = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            data: data ? this.sanitizeData(data) : null,
            context: {
                sessionId: this.sessionId,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                url: typeof window !== 'undefined' ? window.location.href : null,
                ...context
            },
            id: this.generateLogId()
        };

        // Console logging
        if (this.enableConsole) {
            this.logToConsole(logEntry);
        }

        // Buffer for Firestore logging
        if (this.enableFirestore && this.db) {
            this.logBuffer.push(logEntry);
            
            // Flush if buffer is full
            if (this.logBuffer.length >= this.maxBufferSize) {
                this.flushLogs();
            }
        }

        // Emit custom event for external listeners
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('log', { detail: logEntry }));
        }
    }

    /**
     * Log to console with appropriate styling
     * @private
     * @param {Object} logEntry - Log entry
     */
    logToConsole(logEntry) {
        const { timestamp, level, message, data } = logEntry;
        const timeStr = new Date(timestamp).toLocaleTimeString();
        
        const styles = {
            'INFO': 'color: #2196F3',
            'WARN': 'color: #FF9800',
            'ERROR': 'color: #F44336; font-weight: bold',
            'DEBUG': 'color: #9E9E9E',
            'SECURITY': 'color: #E91E63; font-weight: bold',
            'PERFORMANCE': 'color: #4CAF50',
            'USER_ACTION': 'color: #9C27B0'
        };

        const style = styles[level] || 'color: #000';
        
        console.log(
            `%c[${timeStr}] ${level}: ${message}`,
            style,
            data || ''
        );
    }

    /**
     * Flush logs to Firestore
     * @private
     * @returns {Promise<void>}
     */
    async flushLogs() {
        if (!this.db || this.logBuffer.length === 0) return;

        try {
            const batch = this.db.batch();
            const logsToFlush = [...this.logBuffer];
            this.logBuffer = [];

            logsToFlush.forEach(logEntry => {
                const logRef = this.db.collection('logs').doc();
                batch.set(logRef, {
                    ...logEntry,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();
            
            if (this.enableConsole) {
                console.log(`%c[LOGGER] Flushed ${logsToFlush.length} logs to Firestore`, 'color: #607D8B');
            }
        } catch (error) {
            console.error('Failed to flush logs to Firestore:', error);
            // Put logs back in buffer for retry
            this.logBuffer.unshift(...this.logBuffer);
        }
    }

    /**
     * Start periodic log flushing
     * @private
     */
    startPeriodicFlush() {
        setInterval(() => {
            this.flushLogs();
        }, this.flushInterval);

        // Flush on page unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                this.flushLogs();
            });
        }
    }

    /**
     * Generate unique session ID
     * @private
     * @returns {string} Session ID
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate unique log ID
     * @private
     * @returns {string} Log ID
     */
    generateLogId() {
        return 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Sanitize data for logging (remove sensitive information)
     * @private
     * @param {Object} data - Data to sanitize
     * @returns {Object} Sanitized data
     */
    sanitizeData(data) {
        if (!data || typeof data !== 'object') return data;

        const sanitized = { ...data };
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'credential'];

        // Recursively sanitize object
        const sanitizeObject = (obj) => {
            if (Array.isArray(obj)) {
                return obj.map(item => sanitizeObject(item));
            }
            
            if (obj && typeof obj === 'object') {
                const sanitizedObj = {};
                for (const [key, value] of Object.entries(obj)) {
                    const lowerKey = key.toLowerCase();
                    if (sensitiveFields.some(field => lowerKey.includes(field))) {
                        sanitizedObj[key] = '[REDACTED]';
                    } else {
                        sanitizedObj[key] = sanitizeObject(value);
                    }
                }
                return sanitizedObj;
            }
            
            return obj;
        };

        return sanitizeObject(sanitized);
    }

    /**
     * Create a performance timer
     * @param {string} operation - Operation name
     * @returns {Function} Timer function
     */
    timer(operation) {
        const startTime = Date.now();
        return (data = null) => {
            const duration = Date.now() - startTime;
            this.performance(operation, duration, data);
            return duration;
        };
    }

    /**
     * Log HTTP request/response
     * @param {string} method - HTTP method
     * @param {string} url - Request URL
     * @param {number} status - Response status
     * @param {number} duration - Request duration
     * @param {Object} data - Additional data
     */
    httpRequest(method, url, status, duration, data = null) {
        const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
        this.log(level, `${method} ${url} - ${status}`, {
            method,
            url,
            status,
            duration,
            ...data
        }, { http: true });
    }

    /**
     * Get logs from Firestore with filters
     * @param {Object} filters - Filter options
     * @param {number} limit - Maximum number of logs to retrieve
     * @returns {Promise<Array>} Filtered logs
     */
    async getLogs(filters = {}, limit = 100) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }

        try {
            let query = this.db.collection('logs');

            // Apply filters
            if (filters.level) {
                query = query.where('level', '==', filters.level.toUpperCase());
            }
            if (filters.userId) {
                query = query.where('context.userId', '==', filters.userId);
            }
            if (filters.sessionId) {
                query = query.where('context.sessionId', '==', filters.sessionId);
            }
            if (filters.startDate) {
                query = query.where('timestamp', '>=', filters.startDate);
            }
            if (filters.endDate) {
                query = query.where('timestamp', '<=', filters.endDate);
            }

            const snapshot = await query
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();

            const logs = [];
            snapshot.forEach(doc => {
                logs.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return logs;
        } catch (error) {
            this.error('Failed to retrieve logs', { error: error.message });
            throw error;
        }
    }

    /**
     * Get log statistics
     * @param {Object} filters - Filter options
     * @returns {Promise<Object>} Log statistics
     */
    async getLogStatistics(filters = {}) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }

        try {
            const logs = await this.getLogs(filters, 1000);
            
            const stats = {
                total: logs.length,
                byLevel: {},
                byHour: {},
                byUser: {},
                errorRate: 0,
                topErrors: {},
                performance: {
                    averageResponseTime: 0,
                    slowestOperations: []
                }
            };

            const performanceLogs = [];
            const errorMessages = {};

            logs.forEach(log => {
                // Level distribution
                stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

                // Hourly distribution
                const hour = new Date(log.timestamp).getHours();
                stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;

                // User distribution
                if (log.context?.userId) {
                    stats.byUser[log.context.userId] = (stats.byUser[log.context.userId] || 0) + 1;
                }

                // Error tracking
                if (log.level === 'ERROR') {
                    errorMessages[log.message] = (errorMessages[log.message] || 0) + 1;
                }

                // Performance tracking
                if (log.level === 'PERFORMANCE' && log.data?.duration) {
                    performanceLogs.push({
                        operation: log.data.operation,
                        duration: log.data.duration
                    });
                }
            });

            // Calculate error rate
            stats.errorRate = logs.length > 0 ? (stats.byLevel.ERROR || 0) / logs.length : 0;

            // Top errors
            stats.topErrors = Object.entries(errorMessages)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([message, count]) => ({ message, count }));

            // Performance statistics
            if (performanceLogs.length > 0) {
                const totalDuration = performanceLogs.reduce((sum, log) => sum + log.duration, 0);
                stats.performance.averageResponseTime = totalDuration / performanceLogs.length;

                stats.performance.slowestOperations = performanceLogs
                    .sort((a, b) => b.duration - a.duration)
                    .slice(0, 10);
            }

            return stats;
        } catch (error) {
            this.error('Failed to get log statistics', { error: error.message });
            throw error;
        }
    }

    /**
     * Clear old logs (Admin only)
     * @param {number} daysToKeep - Number of days to keep logs
     * @returns {Promise<number>} Number of logs deleted
     */
    async clearOldLogs(daysToKeep = 30) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const snapshot = await this.db.collection('logs')
                .where('timestamp', '<', cutoffDate.toISOString())
                .get();

            const batch = this.db.batch();
            let deleteCount = 0;

            snapshot.forEach(doc => {
                batch.delete(doc.ref);
                deleteCount++;
            });

            if (deleteCount > 0) {
                await batch.commit();
                this.info('Old logs cleared', { deleteCount, daysToKeep });
            }

            return deleteCount;
        } catch (error) {
            this.error('Failed to clear old logs', { error: error.message });
            throw error;
        }
    }

    /**
     * Export logs to JSON
     * @param {Object} filters - Filter options
     * @param {number} limit - Maximum number of logs
     * @returns {Promise<string>} JSON string of logs
     */
    async exportLogs(filters = {}, limit = 1000) {
        try {
            const logs = await this.getLogs(filters, limit);
            return JSON.stringify(logs, null, 2);
        } catch (error) {
            this.error('Failed to export logs', { error: error.message });
            throw error;
        }
    }

    /**
     * Set log level filter
     * @param {string} level - Minimum log level to record
     */
    setLogLevel(level) {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        this.minLevel = level.toUpperCase();
        this.minLevelIndex = levels.indexOf(this.minLevel);
        
        if (this.minLevelIndex === -1) {
            this.minLevelIndex = 1; // Default to INFO
        }
    }

    /**
     * Check if log level should be recorded
     * @private
     * @param {string} level - Log level to check
     * @returns {boolean} Whether to record the log
     */
    shouldLog(level) {
        if (!this.minLevel) return true;
        
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        const levelIndex = levels.indexOf(level.toUpperCase());
        
        return levelIndex >= this.minLevelIndex;
    }

    /**
     * Create a child logger with additional context
     * @param {Object} context - Additional context for all logs
     * @returns {Logger} Child logger instance
     */
    child(context) {
        const childLogger = new Logger(this.db, this.enableConsole, this.enableFirestore);
        childLogger.defaultContext = { ...this.defaultContext, ...context };
        return childLogger;
    }

    /**
     * Gracefully shutdown logger
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.info('Logger shutting down');
        await this.flushLogs();
        
        if (this.flushIntervalId) {
            clearInterval(this.flushIntervalId);
        }
    }
}

// Create singleton instance for global use
let globalLogger = null;

/**
 * Initialize global logger
 * @param {Object} firestore - Firestore instance
 * @param {Object} options - Logger options
 * @returns {Logger} Logger instance
 */
function initLogger(firestore, options = {}) {
    globalLogger = new Logger(
        firestore,
        options.enableConsole !== false,
        options.enableFirestore !== false
    );
    
    if (options.logLevel) {
        globalLogger.setLogLevel(options.logLevel);
    }
    
    return globalLogger;
}

/**
 * Get global logger instance
 * @returns {Logger} Global logger instance
 */
function getLogger() {
    if (!globalLogger) {
        globalLogger = new Logger();
    }
    return globalLogger;
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Logger, initLogger, getLogger };
} else if (typeof window !== 'undefined') {
    window.Logger = Logger;
    window.initLogger = initLogger;
    window.getLogger = getLogger;
}