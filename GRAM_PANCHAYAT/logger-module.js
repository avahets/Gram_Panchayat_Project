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

    