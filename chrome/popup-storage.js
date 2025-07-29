// Storage and blocklist management for FancyTracker
// String constants for consistency with background.js
const STORAGE_KEYS = {
    DEDUPE_ENABLED: 'dedupeEnabled',
    BLOCKED_LISTENERS: 'blockedListeners', 
    BLOCKED_URLS: 'blockedUrls',
    BLOCKED_REGEX: 'blockedRegex',
    LOG_URL: 'log_url'
};

class PopupStorage {
    constructor() {
        this.highlightRules = {};
        this.blockedListeners = [];
        this.blockedUrls = [];
        this.blockedRegex = [];
        this.compiledRegex = []; // Compiled regex patterns for performance
        this.originalLogUrl = '';
        this.prettifyEnabled = false;
        this.dedupeEnabled = false;
        this.expandThreshold = 2000; // Increased from 1600
        this.maxLines = 40; // Increased from 30
        this.codeFontSize = 12; // Default font size
    }

    // Initialize storage
    async init() {
        await this.loadHighlightRules();
        await this.loadBlocklists();
        await this.loadLogUrl();
        await this.loadPrettifySetting();
        await this.loadDedupeSetting();
        await this.loadCodeSettings();
        await this.loadRegexPatterns();
    }

    // Load regex patterns from storage
    loadRegexPatterns() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEYS.BLOCKED_REGEX], (result) => {
                this.blockedRegex = result[STORAGE_KEYS.BLOCKED_REGEX] || [];
                this.compileRegexPatterns();
                console.log('FancyTracker: Loaded regex patterns:', this.blockedRegex.length);
                resolve();
            });
        });
    }

    // Compile regex patterns for performance
    compileRegexPatterns() {
        this.compiledRegex = [];
        for (const pattern of this.blockedRegex) {
            try {
                this.compiledRegex.push({
                    pattern: pattern,
                    regex: new RegExp(pattern, 'i') // Case insensitive by default
                });
            } catch (error) {
                console.warn('FancyTracker: Invalid regex pattern:', pattern, error);
            }
        }
        console.log('FancyTracker: Compiled regex patterns:', this.compiledRegex.length);
    }

    // Save regex patterns to storage
    saveRegexPatterns(patterns) {
        this.blockedRegex = patterns;
        this.compileRegexPatterns();
        chrome.storage.local.set({
            [STORAGE_KEYS.BLOCKED_REGEX]: this.blockedRegex
        });
    }

    // Parse regex patterns from text (one per line, ignore empty lines)
    parseRegexText(text) {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    // Check if listener matches any regex pattern
    isListenerMatchedByRegex(listener) {
        if (!listener.listener || this.compiledRegex.length === 0) {
            return null;
        }

        for (const compiled of this.compiledRegex) {
            try {
                if (compiled.regex.test(listener.listener)) {
                    return compiled.pattern;
                }
            } catch (error) {
                console.warn('FancyTracker: Error testing regex pattern:', compiled.pattern, error);
            }
        }
        return null;
    }

    // Load code display settings
    loadCodeSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['expandThreshold', 'maxLines', 'codeFontSize'], (result) => {
                this.expandThreshold = result.expandThreshold || 2000;
                this.maxLines = result.maxLines || 40;
                this.codeFontSize = result.codeFontSize || 12;
                resolve();
            });
        });
    }

    // Save code display settings
    saveCodeSettings() {
        chrome.storage.local.set({
            expandThreshold: this.expandThreshold,
            maxLines: this.maxLines,
            codeFontSize: this.codeFontSize
        });
    }

    // Load settings from storage
    loadDedupeSetting() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEYS.DEDUPE_ENABLED], (result) => {
                this.dedupeEnabled = result[STORAGE_KEYS.DEDUPE_ENABLED] !== undefined ? result[STORAGE_KEYS.DEDUPE_ENABLED] : true;  // Changed to true
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

    // FIXED: Clean URL to strip query parameters and fragments
    cleanUrl(url) {
        if (!url) return url;
        try {
            const urlObj = new URL(url);
            // Return just protocol + hostname + pathname (no query params or fragments)
            return urlObj.protocol + '//' + urlObj.hostname + urlObj.pathname;
        } catch (e) {
            // If URL parsing fails, try basic string manipulation
            return url.split('?')[0].split('#')[0];
        }
    }

    // FIXED: Extract JavaScript URL from stack trace with proper cleaning
    extractJsUrlFromStack(stack, fullstack) {
        const stackLines = fullstack || (stack ? [stack] : []);
        
        for (const line of stackLines) {
            if (typeof line === 'string') {
                // Look for URLs in parentheses first (most common format)
                const urlMatch = line.match(/\(https?:\/\/[^)]+\)/g);
                if (urlMatch) {
                    for (const match of urlMatch) {
                        let url = match.slice(1, -1); // Remove parentheses
                        // Remove line numbers and column numbers
                        url = url.replace(/:\d+:\d+$/, '').replace(/:\d+$/, '');
                        // Strip query parameters and fragments
                        url = this.cleanUrl(url);
                        if (url) return url;
                    }
                }
                
                // Fallback: look for bare URLs starting with http
                const bareUrlMatch = line.match(/https?:\/\/[^\s\)]+/g);
                if (bareUrlMatch) {
                    for (const match of bareUrlMatch) {
                        let url = match;
                        // Remove line numbers and column numbers
                        url = url.replace(/:\d+:\d+$/, '').replace(/:\d+$/, '');
                        // Strip query parameters and fragments
                        url = this.cleanUrl(url);
                        if (url) return url;
                    }
                }
            }
        }
        
        return null;
    }

    // Enhanced: Check if listener is blocked (includes regex check)
    isListenerBlocked(listener) {
        // Check if listener code is blocked
        if (this.blockedListeners.includes(listener.listener)) {
            return { type: 'listener', value: listener.listener };
        }
        
        // Check if JS file URL is blocked (with cleaned URL)
        const jsUrl = this.extractJsUrlFromStack(listener.stack, listener.fullstack);
        if (jsUrl && this.blockedUrls.includes(jsUrl)) {
            return { type: 'url', value: jsUrl };
        }
        
        // Check if listener matches any regex pattern
        const matchedPattern = this.isListenerMatchedByRegex(listener);
        if (matchedPattern) {
            return { type: 'regex', value: matchedPattern };
        }
        
        return null;
    }

    // Add/remove from blocklist
    addToBlocklist(type, value) {
        if (type === 'listener' && !this.blockedListeners.includes(value)) {
            this.blockedListeners.push(value);
        } else if (type === 'url' && !this.blockedUrls.includes(value)) {
            // Clean the URL before adding to blocklist
            const cleanedUrl = this.cleanUrl(value);
            if (cleanedUrl && !this.blockedUrls.includes(cleanedUrl)) {
                this.blockedUrls.push(cleanedUrl);
            }
        }
        this.saveBlocklists();
    }

    removeFromBlocklist(type, value) {
        if (type === 'listener') {
            this.blockedListeners = this.blockedListeners.filter(listener => listener !== value);
        } else if (type === 'url') {
            // Clean the URL before removing from blocklist
            const cleanedUrl = this.cleanUrl(value);
            this.blockedUrls = this.blockedUrls.filter(url => url !== cleanedUrl);
        }
        this.saveBlocklists();
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

    // Export regex patterns
    exportBlockedRegex() {
        const data = {
            blockedRegex: this.blockedRegex,
            exportDate: new Date().toISOString(),
            version: "1.0"
        };
        this.exportData(data, 'fancytracker-blocked-regex.json');
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

    // Import regex patterns
    importBlockedRegex(file, callback) {
        this.importData(file, (err, data) => {
            if (err) {
                callback(err);
                return;
            }
            
            if (data.blockedRegex && Array.isArray(data.blockedRegex)) {
                this.saveRegexPatterns(data.blockedRegex);
                callback(null, `Imported ${this.blockedRegex.length} regex patterns`);
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

    // Clear regex patterns
    clearBlockedRegex() {
        this.blockedRegex = [];
        this.compiledRegex = [];
        chrome.storage.local.set({
            [STORAGE_KEYS.BLOCKED_REGEX]: []
        });
    }
}