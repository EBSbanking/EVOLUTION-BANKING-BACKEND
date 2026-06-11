// no-pidusage.js - Place this at the very top of your app
if (process.platform === 'win32') {
    // Mock the pidusage module
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    
    Module.prototype.require = function(id) {
        if (id === 'pidusage') {
            return function(pid, options, callback) {
                const mockData = {
                    cpu: 0,
                    memory: 0,
                    pid: pid,
                    timestamp: Date.now()
                };
                if (typeof callback === 'function') {
                    callback(null, mockData);
                }
                return Promise.resolve(mockData);
            };
        }
        return originalRequire.apply(this, arguments);
    };
}