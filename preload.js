// preload.js - Run this instead of server.js
// ============================================
// COMPLETE PIDUSAGE SUPPRESSION
// ============================================

// 1. Force environment variables BEFORE anything else
process.env.PIDUSAGE_DISABLE = '1';
process.env.PIDUSAGE_NO_WMIC = '1';

// 2. Override the require cache for pidusage
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'pidusage' || id.includes('pidusage')) {
        // Return a mock pidusage module
        console.log('🔧 pidusage module intercepted and mocked');
        return {
            pidusage: function(pid, callback) {
                const mockData = {
                    cpu: 0,
                    memory: 0,
                    ppid: 1,
                    pid: pid,
                    ctime: 0,
                    elapsed: 0,
                    timestamp: Date.now()
                };
                if (typeof callback === 'function') {
                    callback(null, mockData);
                } else {
                    return Promise.resolve(mockData);
                }
            },
            default: {
                pidusage: function(pid, callback) {
                    const mockData = {
                        cpu: 0,
                        memory: 0,
                        ppid: 1,
                        pid: pid,
                        ctime: 0,
                        elapsed: 0,
                        timestamp: Date.now()
                    };
                    if (typeof callback === 'function') {
                        callback(null, mockData);
                    } else {
                        return Promise.resolve(mockData);
                    }
                }
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// 3. Override console.error to filter pidusage messages
const originalConsoleError = console.error;
console.error = function(...args) {
    const message = args[0];
    if (message && typeof message === 'string') {
        if (message.includes('spawn wmic ENOENT') || 
            message.includes('pidusage') ||
            (message.includes('Command "wmic"') && message.includes('failed'))) {
            // Suppress pidusage errors
            return;
        }
    }
    originalConsoleError.apply(console, args);
};

console.log('✅ pidusage preload complete - all pidusage calls will be mocked');

// 4. Now load your actual server
await import('./server.js');