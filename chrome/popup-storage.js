// Storage and blocklist management for FancyTracker
// String constants for consistency with background.js
const STORAGE_KEYS = {
    DEDUPE_ENABLED: 'dedupeEnabled',
    BLOCKED_LISTENERS: 'blockedListeners', 
    BLOCKED_URLS: 'blockedUrls',
    LOG_URL: 'log_url'
};

class PopupStorage {
    constructor() {
        this.highlightRules = {};
        this.blockedListeners = [];
        this.blockedUrls = [];
        this.originalLogUrl = '';
        this.prettifyEnabled = false;
        this.dedupeEnabled = false;
    }

    // Initialize storage
    async init() {
        await this.loadHighlightRules();
        await this.loadBlocklists();
        await this.loadLogUrl();
        await this.loadPrettifySetting();
        await this.loadDedupeSetting();
    }

    // Load settings from storage
    loadDedupeSetting() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEYS.DEDUPE_ENABLED], (result) => {
                this.dedupeEnabled = result[STORAGE_KEYS.DEDUPE_ENABLED] !== undefined ? result[STORAGE_KEYS.DEDUPE_ENABLED] : false;  // Changed from true
                console.log('FancyTracker: Loaded dedupe setting:', this.dedupeEnabled);
                resolve();
            });
        });
    }

    loadPrettifySetting() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['prettifyEnabled'], (result) => {
                this.prettifyEnabled = result.prettifyEnabled || false;
                resolve();
            });
        });
    }

    loadHighlightRules() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['highlightRules'], (result) => {
                if (result.highlightRules) {
                    this.highlightRules = result.highlightRules;
                }
                resolve();
            });
        });
    }

    loadBlocklists() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEYS.BLOCKED_LISTENERS, STORAGE_KEYS.BLOCKED_URLS], (result) => {
                this.blockedListeners = result[STORAGE_KEYS.BLOCKED_LISTENERS] || [];
                this.blockedUrls = result[STORAGE_KEYS.BLOCKED_URLS] || [];
                resolve();
            });
        });
    }

    loadLogUrl() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([STORAGE_KEYS.LOG_URL], (result) => {
                this.originalLogUrl = result[STORAGE_KEYS.LOG_URL] || '';
                resolve();
            });
        });
    }

    // Save settings to storage
    saveDedupeSetting(enabled) {
        return new Promise((resolve) => {
            this.dedupeEnabled = enabled;
            chrome.storage.local.set({ [STORAGE_KEYS.DEDUPE_ENABLED]: enabled }, () => {
                console.log('FancyTracker: Saved dedupe setting:', enabled);
                // Also notify background script
                chrome.runtime.sendMessage({ 
                    action: 'updateDedupeSetting', 
                    enabled: enabled 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('FancyTracker: Error updating dedupe setting:', chrome.runtime.lastError);
                    } else {
                        console.log('FancyTracker: Background script updated dedupe setting');
                    }
                    resolve();
                });
            });
        });
    }

    savePrettifySetting(enabled) {
        return new Promise((resolve) => {
            this.prettifyEnabled = enabled;
            chrome.storage.local.set({ prettifyEnabled: enabled }, resolve);
        });
    }

    saveBlocklists() {
        chrome.storage.local.set({
            [STORAGE_KEYS.BLOCKED_LISTENERS]: this.blockedListeners,
            [STORAGE_KEYS.BLOCKED_URLS]: this.blockedUrls
        });
    }

    saveHighlightRules(rules, rulesText) {
        this.highlightRules = rules;
        chrome.storage.local.set({ 
            highlightRules: rules,
            highlightRulesText: rulesText 
        });
    }

    saveLogUrl(logUrl) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [STORAGE_KEYS.LOG_URL]: logUrl }, () => {
                this.originalLogUrl = logUrl;
                resolve();
            });
        });
    }

    // Check if listener is blocked
    isListenerBlocked(listener) {
        // Check if listener code is blocked
        if (this.blockedListeners.includes(listener.listener)) {
            return { type: 'listener', value: listener.listener };
        }
        
        // Check if JS file URL is blocked
        const jsUrl = this.extractJsUrlFromStack(listener.stack, listener.fullstack);
        if (jsUrl && this.blockedUrls.includes(jsUrl)) {
            return { type: 'url', value: jsUrl };
        }
        
        return null;
    }

    // Add/remove from blocklist
    addToBlocklist(type, value) {
        if (type === 'listener' && !this.blockedListeners.includes(value)) {
            this.blockedListeners.push(value);
        } else if (type === 'url' && !this.blockedUrls.includes(value)) {
            this.blockedUrls.push(value);
        }
        this.saveBlocklists();
    }

    removeFromBlocklist(type, value) {
        if (type === 'listener') {
            this.blockedListeners = this.blockedListeners.filter(listener => listener !== value);
        } else if (type === 'url') {
            this.blockedUrls = this.blockedUrls.filter(url => url !== value);
        }
        this.saveBlocklists();
    }

    // Extract JavaScript URL from stack trace
    extractJsUrlFromStack(stack, fullstack) {
        const stackLines = fullstack || (stack ? [stack] : []);
        
        for (const line of stackLines) {
            if (typeof line === 'string') {
                const urlMatch = line.match(/\(https?:\/\/[^)]+\)/g);
                if (urlMatch) {
                    for (const match of urlMatch) {
                        const url = match.slice(1, -1).replace(/:\d+:\d+$/, '').replace(/:\d+$/, '');
                        return url;
                    }
                }
            }
        }
        
        return null;
    }

    // Export/import functionality
    exportData(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportBlockedUrls() {
        const data = {
            blockedUrls: this.blockedUrls,
            exportDate: new Date().toISOString(),
            version: "1.0"
        };
        this.exportData(data, 'fancytracker-blocked-urls.json');
    }

    exportBlockedListeners() {
        const data = {
            blockedListeners: this.blockedListeners,
            exportDate: new Date().toISOString(),
            version: "1.0"
        };
        this.exportData(data, 'fancytracker-blocked-listeners.json');
    }

    importData(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                callback(null, data);
            } catch (err) {
                callback(err);
            }
        };
        reader.readAsText(file);
    }

    importBlockedUrls(file, callback) {
        this.importData(file, (err, data) => {
            if (err) {
                callback(err);
                return;
            }
            
            if (data.blockedUrls && Array.isArray(data.blockedUrls)) {
                this.blockedUrls = data.blockedUrls;
                this.saveBlocklists();
                callback(null, `Imported ${this.blockedUrls.length} blocked URLs`);
            } else {
                callback(new Error('Invalid file format'));
            }
        });
    }

    importBlockedListeners(file, callback) {
        this.importData(file, (err, data) => {
            if (err) {
                callback(err);
                return;
            }
            
            if (data.blockedListeners && Array.isArray(data.blockedListeners)) {
                this.blockedListeners = data.blockedListeners;
                this.saveBlocklists();
                callback(null, `Imported ${this.blockedListeners.length} blocked listeners`);
            } else {
                callback(new Error('Invalid file format'));
            }
        });
    }

    // Clear functions
    clearBlockedUrls() {
        this.blockedUrls = [];
        this.saveBlocklists();
    }

    clearBlockedListeners() {
        this.blockedListeners = [];
        this.saveBlocklists();
    }
}