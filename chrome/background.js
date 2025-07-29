// Background script for FancyTracker - V3 with State Persistence Fix and Regex Support
// IMPORTANT: Only persists listener data (tab_listeners, tab_listener_keys)
// Navigation state (tab_push, tab_lasturl) is NOT persisted to avoid double-listener bugs
// String constants for better performance and maintainability
const STORAGE_KEYS = {
    DEDUPE_ENABLED: 'dedupeEnabled',
    BLOCKED_LISTENERS: 'blockedListeners', 
    BLOCKED_URLS: 'blockedUrls',
    BLOCKED_REGEX: 'blockedRegex',
    LOG_URL: 'log_url'
};

const CONTENT_TYPE_JSON = 'application/json; charset=UTF-8';

// Simple extension blacklist - only the essentials
const EXTENSION_BLACKLIST = [
    'wappalyzer',
    'domlogger'
];

// Global variables - will be restored from storage
var tab_listeners = {};
var tab_listener_keys = {};
var tab_push = {}, tab_lasturl = {};
var selectedId = -1;
var connectedPorts = [];
var dedupeEnabled = true;  // Default: enabled
var blockedListeners = [];
var blockedUrls = [];
var blockedRegex = [];
var compiledRegex = []; // Compiled regex patterns for performance

// Pre-loading optimization: Keep popup data ready
var cachedPopupData = {
    listeners: {},
    currentTabId: null,
    currentUrl: '',
    lastUpdate: 0
};

// Simple extension filter
function isFromExtension(listener, stack) {
    try {
        var listenerStr = listener.toString();
        var stackStr = stack || '';
        var combined = listenerStr + ' ' + stackStr;
        
        for (var i = 0; i < EXTENSION_BLACKLIST.length; i++) {
            if (combined.includes(EXTENSION_BLACKLIST[i])) {
                return true;
            }
        }
    } catch(e) {
        // Ignore
    }
    return false;
}

// State Persistence Class
class PersistentState {
    constructor() {
        this.isLoaded = false;
        this.loadPromise = this.loadState();
    }

    async loadState() {
        if (this.isLoaded) return;
        
        try {
            const result = await chrome.storage.local.get(['tab_listeners', 'tab_listener_keys']);
            
            // Initialize with stored data or defaults
            tab_listeners = result.tab_listeners || {};
            
            // Convert arrays back to Sets
            tab_listener_keys = {};
            if (result.tab_listener_keys) {
                for (const [tabId, keys] of Object.entries(result.tab_listener_keys)) {
                    tab_listener_keys[tabId] = new Set(keys || []);
                }
            }
            
            // DON'T persist navigation state - reset on service worker restart
            tab_push = {};
            tab_lasturl = {};
            
            this.isLoaded = true;
            console.log('FancyTracker: State loaded from storage', {
                tabs: Object.keys(tab_listeners).length,
                totalListeners: Object.values(tab_listeners).reduce((sum, arr) => sum + arr.length, 0)
            });
        } catch (error) {
            console.error('FancyTracker: Failed to load state from storage:', error);
            this.isLoaded = true; // Continue with empty state
        }
    }

    async saveState() {
        if (!this.isLoaded) return;
        
        try {
            // Convert Sets to arrays for storage
            const tab_listener_keys_serializable = {};
            for (const [tabId, set] of Object.entries(tab_listener_keys)) {
                tab_listener_keys_serializable[tabId] = Array.from(set);
            }
            
            // Only persist listener data, NOT navigation state
            await chrome.storage.local.set({
                tab_listeners,
                tab_listener_keys: tab_listener_keys_serializable
            });
        } catch (error) {
            console.error('FancyTracker: Failed to save state to storage:', error);
        }
    }

    // Debounced save to avoid excessive storage writes
    debouncedSave = this.debounce(this.saveState.bind(this), 100);

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize persistent state
const persistentState = new PersistentState();

// Compile regex patterns for performance
function compileRegexPatterns() {
    compiledRegex = [];
    for (const pattern of blockedRegex) {
        try {
            compiledRegex.push({
                pattern: pattern,
                regex: new RegExp(pattern, 'i') // Case insensitive by default
            });
        } catch (error) {
            console.warn('FancyTracker: Invalid regex pattern:', pattern, error);
        }
    }
    console.log('FancyTracker: Compiled regex patterns:', compiledRegex.length);
}

// Load settings from storage
function loadSettings() {
    chrome.storage.local.get([STORAGE_KEYS.DEDUPE_ENABLED, STORAGE_KEYS.BLOCKED_LISTENERS, STORAGE_KEYS.BLOCKED_URLS, STORAGE_KEYS.BLOCKED_REGEX], (result) => {
        dedupeEnabled = result[STORAGE_KEYS.DEDUPE_ENABLED] !== undefined ? result[STORAGE_KEYS.DEDUPE_ENABLED] : true;  // Default: enabled
        blockedListeners = result[STORAGE_KEYS.BLOCKED_LISTENERS] || [];
        blockedUrls = result[STORAGE_KEYS.BLOCKED_URLS] || [];
        blockedRegex = result[STORAGE_KEYS.BLOCKED_REGEX] || [];
        compileRegexPatterns();
        console.log('FancyTracker: Loaded settings - dedupe:', dedupeEnabled, 'blocked listeners:', blockedListeners.length, 'blocked URLs:', blockedUrls.length, 'blocked regex:', blockedRegex.length);
    });
}

// Listen for storage changes to keep blocklists updated and refresh badge
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes[STORAGE_KEYS.BLOCKED_LISTENERS]) {
            blockedListeners = changes[STORAGE_KEYS.BLOCKED_LISTENERS].newValue || [];
            console.log('FancyTracker: Updated blocked listeners:', blockedListeners.length);
            updateCachedData(); // Refresh cached data when blocklist changes
            refreshCount(); // Update badge count when blocked listeners change
        }
        if (changes[STORAGE_KEYS.BLOCKED_URLS]) {
            blockedUrls = changes[STORAGE_KEYS.BLOCKED_URLS].newValue || [];
            console.log('FancyTracker: Updated blocked URLs:', blockedUrls.length);
            updateCachedData(); // Refresh cached data when blocklist changes
            refreshCount(); // Update badge count when blocked URLs change
        }
        if (changes[STORAGE_KEYS.BLOCKED_REGEX]) {
            blockedRegex = changes[STORAGE_KEYS.BLOCKED_REGEX].newValue || [];
            compileRegexPatterns();
            console.log('FancyTracker: Updated blocked regex patterns:', blockedRegex.length);
            updateCachedData(); // Refresh cached data when regex patterns change
            refreshCount(); // Update badge count when regex patterns change
        }
    }
});

// Pre-loading optimization: Update cached popup data
async function updateCachedData() {
    await persistentState.loadPromise; // Ensure state is loaded
    
    if (selectedId && selectedId > 0) {
        cachedPopupData.listeners = tab_listeners;
        cachedPopupData.currentTabId = selectedId;
        cachedPopupData.lastUpdate = Date.now();
        
        // Get current tab URL
        try {
            const tab = await chrome.tabs.get(selectedId);
            cachedPopupData.currentUrl = tab.url;
        } catch (error) {
            cachedPopupData.currentUrl = 'Unknown URL';
        }
        
        console.log('FancyTracker: Updated cached popup data for tab', selectedId);
    }
}

// Initialize service worker
async function initializeServiceWorker() {
    await persistentState.loadPromise; // Wait for state to load
    
    loadSettings();
    
    try {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs.length > 0) {
            selectedId = tabs[0].id;
            refreshCount();
            updateCachedData(); // Initialize cached data
        }
    } catch (error) {
        console.error('FancyTracker: Failed to query active tab:', error);
    }
}

// FIXED: Count only active (non-blocked) listeners for badge
async function refreshCount() {
    await persistentState.loadPromise;
    
    // Count only non-blocked listeners
    let activeCount = 0;
    if (tab_listeners[selectedId]) {
        activeCount = tab_listeners[selectedId].filter(listener => !isListenerBlocked(listener)).length;
    }
    
    if (selectedId > 0) {
        try {
            await chrome.tabs.get(selectedId);
            chrome.action.setBadgeText({"text": '' + activeCount, tabId: selectedId});
            chrome.action.setBadgeBackgroundColor({ 
                color: activeCount > 0 ? [255, 0, 0, 255] : [0, 0, 255, 0], 
                tabId: selectedId
            });
        } catch (error) {
            // Tab no longer exists, clean up
            delete tab_listeners[selectedId];
            delete tab_listener_keys[selectedId];
            delete tab_lasturl[selectedId];
            // Only persist listener data changes
            persistentState.debouncedSave();
        }
    }
}

function notifyPopups() {
    // Use cached data for instant response
    updateCachedData();
    
    connectedPorts.forEach(port => {
        try {
            port.postMessage({
                listeners: cachedPopupData.listeners,
                currentUrl: cachedPopupData.currentUrl,
                cached: true,
                timestamp: cachedPopupData.lastUpdate
            });
        } catch (error) {
            console.log('FancyTracker: Failed to notify popup:', error);
        }
    });
}

function logListener(data) {
    chrome.storage.sync.get({[STORAGE_KEYS.LOG_URL]: ''}, function(items) {
        const log_url = items[STORAGE_KEYS.LOG_URL];
        if (!log_url || !log_url.length) return;
        
        try {
            fetch(log_url, {
                method: 'POST',
                headers: {"Content-Type": CONTENT_TYPE_JSON},
                body: JSON.stringify(data)
            }).catch(e => {
                console.error('FancyTracker: Failed to log listener:', e);
            });
        } catch(e) {
            console.error('FancyTracker: Failed to log listener:', e);
        }
    });
}

// Generate unique key for listener identification
function generateListenerKey(listener) {
    const jsUrl = extractJsUrlFromStack(listener.stack, listener.fullstack) || '';
    const hops = listener.hops || '';
    const domain = listener.domain || '';
    const listenerCode = listener.listener || '';
    
    return `${jsUrl}|${hops}|${domain}|${listenerCode}`;
}

// FIXED: Strip query parameters and fragments from URLs
function cleanUrl(url) {
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

// Extract JS URL from stack trace with query parameter stripping
function extractJsUrlFromStack(stack, fullstack) {
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
                    url = cleanUrl(url);
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
                    url = cleanUrl(url);
                    if (url) return url;
                }
            }
        }
    }
    return null;
}

// Check if listener is duplicate
function isDuplicateListener(newListener, tabId) {
    if (!dedupeEnabled) return false;
    
    if (!tab_listener_keys[tabId]) {
        tab_listener_keys[tabId] = new Set();
    }
    
    const key = generateListenerKey(newListener);
    return tab_listener_keys[tabId].has(key);
}

// Add listener key to tracking
function addListenerKey(listener, tabId) {
    if (!dedupeEnabled) return;
    
    if (!tab_listener_keys[tabId]) {
        tab_listener_keys[tabId] = new Set();
    }
    
    const key = generateListenerKey(listener);
    tab_listener_keys[tabId].add(key);
}

// Check if listener matches any regex pattern
function isListenerMatchedByRegex(listener) {
    if (!listener.listener || compiledRegex.length === 0) {
        return false;
    }

    for (const compiled of compiledRegex) {
        try {
            if (compiled.regex.test(listener.listener)) {
                return true;
            }
        } catch (error) {
            console.warn('FancyTracker: Error testing regex pattern:', compiled.pattern, error);
        }
    }
    return false;
}

// Check if listener is blocked (synchronous version) - Enhanced with regex support
function isListenerBlocked(listener) {
    // Check if listener code is blocked
    if (blockedListeners.includes(listener.listener)) {
        return true;
    }
    
    // Check if JS file URL is blocked (with cleaned URL)
    const jsUrl = extractJsUrlFromStack(listener.stack, listener.fullstack);
    if (jsUrl && blockedUrls.includes(jsUrl)) {
        return true;
    }
    
    // Check if listener matches any regex pattern
    if (isListenerMatchedByRegex(listener)) {
        return true;
    }
    
    return false;
}

// Add listener with persistence and simple extension filtering
async function addListener(tabId, listener) {
    await persistentState.loadPromise;
    
    // Simple extension filter - only check for wappalyzer and domlogger
    if (isFromExtension(listener.listener, listener.stack)) {
        console.log('FancyTracker: Ignoring extension listener');
        return false;
    }
    
    if (!tab_listeners[tabId]) {
        tab_listeners[tabId] = [];
        tab_listener_keys[tabId] = new Set();
    }
    
    if (!isDuplicateListener(listener, tabId)) {
        tab_listeners[tabId].push(listener);
        addListenerKey(listener, tabId);
        
        // Save state after modification
        persistentState.debouncedSave();
        
        if (!isListenerBlocked(listener)) {
            logListener(listener);
        }
        return true;
    }
    return false;
}

// Clear listeners with persistence
async function clearListeners(tabId) {
    await persistentState.loadPromise;
    
    const hadListeners = tab_listeners[tabId] && tab_listeners[tabId].length > 0;
    tab_listeners[tabId] = [];
    if (tab_listener_keys[tabId]) {
        tab_listener_keys[tabId].clear();
    }
    
    // Save state after modification
    persistentState.debouncedSave();
    
    return hadListeners;
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    (async () => {
        // Handle dedupe setting update
        if (msg.action === 'updateDedupeSetting') {
            await persistentState.loadPromise;
            
            dedupeEnabled = msg.enabled;
            // Save to storage
            chrome.storage.local.set({ [STORAGE_KEYS.DEDUPE_ENABLED]: dedupeEnabled });
            if (!dedupeEnabled) {
                for (const tabId in tab_listener_keys) {
                    tab_listener_keys[tabId].clear();
                }
                // Only persist listener data changes
                persistentState.debouncedSave();
            }
            console.log('FancyTracker: Dedupe setting updated to:', dedupeEnabled);
            updateCachedData(); // Refresh cached data when settings change
            refreshCount(); // Update badge count when dedupe setting changes
            sendResponse({success: true});
            return;
        }
        
        if (!sender || !sender.tab) {
            sendResponse({success: false});
            return;
        }
        
        await persistentState.loadPromise;
        
        const tabId = sender.tab.id;
        let shouldNotifyPopups = false;
        
        if (msg.listener) {
            if (msg.listener == 'function () { [native code] }') {
                sendResponse({success: true});
                return;
            }
            
            msg.parent_url = sender.tab.url;
            const added = await addListener(tabId, msg);
            shouldNotifyPopups = added;
        }
        
        if (msg.pushState) {
            tab_push[tabId] = true;
            // Don't persist navigation state
        }
        
        if (msg.changePage) {
            delete tab_lasturl[tabId];
            // Don't persist navigation state
        }
        
        if (msg.log) {
            console.log('FancyTracker Log:', msg.log);
        } else {
            refreshCount(); // This now counts only active listeners
            if (shouldNotifyPopups) {
                // Update cached data when new listeners are added
                updateCachedData();
                notifyPopups();
            }
        }
        
        sendResponse({success: true});
    })().catch(error => {
        console.error('FancyTracker: Message handler error:', error);
        sendResponse({success: false, error: error.message});
    });
    
    return true; // Keep message channel open for async response
});

chrome.tabs.onUpdated.addListener(async function(tabId, props) {
    await persistentState.loadPromise;
    
    if (props.status == "complete") {
        if (tabId == selectedId) {
            refreshCount(); // This now counts only active listeners
            updateCachedData(); // Update cached data when page loads
        }
    } else if (props.status) {  // FIXED: Match V2 logic - trigger on ANY status change
        if (tab_push[tabId]) {
            delete tab_push[tabId];
            // Don't persist navigation state
        } else {
            if (!tab_lasturl[tabId]) {
                const hadListeners = await clearListeners(tabId);
                if (hadListeners) {
                    updateCachedData(); // Update cached data when listeners are cleared
                    notifyPopups();
                }
            }
        }
    }
    
    if (props.status == "loading") {
        tab_lasturl[tabId] = true;
        // Don't persist navigation state
    }
});

chrome.tabs.onActivated.addListener(async function(activeInfo) {
    await persistentState.loadPromise;
    
    selectedId = activeInfo.tabId;
    refreshCount(); // This now counts only active listeners
    updateCachedData(); // Pre-load data for the new active tab
    notifyPopups();
});

chrome.tabs.onRemoved.addListener(async function(tabId) {
    await persistentState.loadPromise;
    
    delete tab_listeners[tabId];
    delete tab_listener_keys[tabId];
    delete tab_push[tabId];
    delete tab_lasturl[tabId];
    
    // Only persist listener data changes
    persistentState.debouncedSave();
    
    // Clear cached data if it was for the removed tab
    if (cachedPopupData.currentTabId === tabId) {
        cachedPopupData = {
            listeners: {},
            currentTabId: null,
            currentUrl: '',
            lastUpdate: 0
        };
    }
});

chrome.runtime.onConnect.addListener(async function(port) {
    await persistentState.loadPromise;
    
    connectedPorts.push(port);
    
    port.onMessage.addListener(async function(msg) {
        // Instant response with cached data
        if (cachedPopupData.currentTabId === selectedId && cachedPopupData.lastUpdate > 0) {
            port.postMessage({
                listeners: cachedPopupData.listeners,
                currentUrl: cachedPopupData.currentUrl,
                cached: true,
                timestamp: cachedPopupData.lastUpdate
            });
        } else {
            // Fallback to traditional method if no cached data
            await updateCachedData();
            port.postMessage({
                listeners: tab_listeners,
                currentUrl: cachedPopupData.currentUrl || 'Loading...',
                cached: false,
                timestamp: Date.now()
            });
        }
    });
    
    port.onDisconnect.addListener(function() {
        connectedPorts = connectedPorts.filter(p => p !== port);
    });
    
    // Send initial data immediately when port connects
    if (cachedPopupData.currentTabId === selectedId && cachedPopupData.lastUpdate > 0) {
        port.postMessage({
            listeners: cachedPopupData.listeners,
            currentUrl: cachedPopupData.currentUrl,
            cached: true,
            timestamp: cachedPopupData.lastUpdate
        });
    } else {
        await updateCachedData();
        port.postMessage({
            listeners: tab_listeners,
            currentUrl: cachedPopupData.currentUrl || 'Loading...',
            cached: false,
            timestamp: Date.now()
        });
    }
});

// Initialize
chrome.runtime.onStartup.addListener(initializeServiceWorker);
chrome.runtime.onInstalled.addListener(initializeServiceWorker);

// Initialize immediately
initializeServiceWorker();

console.log('FancyTracker: Background script initialized with state persistence and regex support');