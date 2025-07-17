// Main popup script for FancyTracker - Optimized with Pre-loading
class PopupMain {
    constructor() {
        this.storage = new PopupStorage();
        this.ui = new PopupUI(this.storage);
        this.port = chrome.runtime.connect({
            name: "FancyTracker Communication"
        });
        
        this.currentListeners = [];
        this.currentUrl = '';
        this.currentTabId = null;
        this.dataLoaded = false; // Track if we've received initial data
        
        // Cache DOM elements to avoid repeated queries
        this.domCache = {
            container: null,
            headerElement: null,
            countElement: null,
            statusElement: null,
            contentElement: null,
            showBlockedBtn: null
        };
        
        // Debounce rapid updates
        this.updateDebounceTimer = null;
        this.updateDebounceDelay = 50; // Reduced from 100ms for faster response
        
        // Track if we're currently updating to prevent cascading updates
        this.isUpdating = false;
        
        // Track if the last refresh was a manual action (blocking/unblocking)
        this.isManualRefresh = false;
    }

    // Initialize the popup with DOM caching and immediate data loading
    async init() {
        try {
            // Cache frequently accessed DOM elements early
            this.cacheDOMElements();
            
            // Clear initial loading state - we'll get real data immediately
            this.clearLoadingState();
            
            // Setup port communication FIRST for immediate data
            this.setupPortCommunication();
            
            // Load storage settings in parallel
            const storagePromise = this.storage.init();
            
            // Get initial tab info in parallel
            const tabPromise = this.updateCurrentTab();
            
            // Setup UI components while data loads
            this.setupEventListeners();
            this.setupHighlightEditor();
            this.setupSettingsModal();
            
            // Wait for storage and tab info
            await Promise.all([storagePromise, tabPromise]);
            
            console.log('FancyTracker popup initialized with pre-loading optimization');
        } catch (error) {
            console.error('FancyTracker: Popup initialization error:', error);
            this.ui.displayListeners([], 'Error loading', () => {});
        }
    }

    // Clear the initial loading state
    clearLoadingState() {
        const container = document.getElementById('x');
        if (container) {
            container.innerHTML = ''; // Clear "Scanning for listeners..." immediately
        }
    }

    // Cache DOM elements to avoid repeated queries
    cacheDOMElements() {
        this.domCache.container = document.getElementById('x');
        this.domCache.headerElement = document.getElementById('h');
        this.domCache.countElement = document.getElementById('listener-count');
        this.domCache.statusElement = document.getElementById('status-badge');
        this.domCache.contentElement = document.querySelector('.content');
        this.domCache.showBlockedBtn = document.getElementById('show-blocked-btn');
    }

    // Update current tab information
    async updateCurrentTab() {
        try {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (tabs.length > 0) {
                this.currentTabId = tabs[0].id;
                this.currentUrl = tabs[0].url;
                console.log('FancyTracker: Current tab updated:', this.currentTabId, this.currentUrl);
            }
        } catch (error) {
            console.error('FancyTracker: Failed to query current tab:', error);
            this.currentTabId = null;
            this.currentUrl = 'Unknown URL';
        }
    }

    // Setup port communication with background script - optimized for pre-loading
    setupPortCommunication() {
        // Listen for messages from background (including immediate pre-loaded data)
        this.port.onMessage.addListener((msg) => {
            console.log("FancyTracker: message received:", msg);
            this.handleBackgroundMessage(msg);
        });
        
        // Handle port disconnection
        this.port.onDisconnect.addListener(() => {
            console.log('FancyTracker: Port disconnected');
            if (chrome.runtime.lastError) {
                console.error('FancyTracker: Port error:', chrome.runtime.lastError);
            }
        });

        // Request data (background script will respond immediately with cached data)
        this.port.postMessage("get-stuff");
    }

    // Handle messages from background script - optimized for pre-loaded data
    async handleBackgroundMessage(msg) {
        if (!msg.listeners && !msg.currentUrl) {
            console.warn('FancyTracker: Received message without listeners data:', msg);
            return;
        }

        // Update current URL from background script if available
        if (msg.currentUrl && msg.currentUrl !== 'Loading...') {
            this.currentUrl = msg.currentUrl;
        }

        // Update current tab info if we don't have it
        if (!this.currentTabId) {
            await this.updateCurrentTab();
        }

        // Get listeners for current tab
        if (this.currentTabId !== null) {
            const newListeners = msg.listeners[this.currentTabId] || [];
            
            // For the first load or manual refreshes, always update
            // For subsequent automatic updates, only update if data actually changed
            const dataChanged = JSON.stringify(newListeners) !== JSON.stringify(this.currentListeners);
            const isFirstLoad = !this.dataLoaded;
            
            if (isFirstLoad || this.isManualRefresh || dataChanged) {
                if (isFirstLoad) {
                    console.log(`FancyTracker: Initial data loaded for tab ${this.currentTabId}:`, 
                               `${newListeners.length} listeners`, msg.cached ? '(cached)' : '(fresh)');
                    this.dataLoaded = true;
                } else if (dataChanged) {
                    console.log(`FancyTracker: Listeners updated for tab ${this.currentTabId}:`, 
                               `${this.currentListeners.length} -> ${newListeners.length}`);
                } else {
                    console.log('FancyTracker: Manual refresh triggered (blocking/unblocking action)');
                }
                
                this.currentListeners = newListeners;
                
                // For first load, don't preserve scroll. For updates, preserve unless manual
                const preserveScroll = this.dataLoaded && !this.isManualRefresh;
                this.refreshDisplay(preserveScroll);
                
                // Reset the manual refresh flag
                this.isManualRefresh = false;
            }
        } else {
            // Fallback: show empty state
            console.warn('FancyTracker: No current tab ID available');
            this.currentListeners = [];
            this.refreshDisplay(!this.isManualRefresh);
            this.isManualRefresh = false;
            this.dataLoaded = true;
        }
    }

    // Debounced refresh to avoid excessive updates - optimized timing
    refreshDisplay(preserveScroll = false) {
        // Prevent cascading updates
        if (this.isUpdating) {
            return;
        }
        
        // Clear existing timer
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }
        
        // Set new timer with reduced delay for faster response
        this.updateDebounceTimer = setTimeout(() => {
            this.isUpdating = true;
            this.ui.displayListeners(this.currentListeners, this.currentUrl, () => {
                // Mark this as a manual refresh when onRefresh is called
                this.isManualRefresh = true;
                this.port.postMessage("get-stuff");
            }, preserveScroll);
            this.updateDebounceTimer = null;
            this.isUpdating = false;
        }, this.updateDebounceDelay);
    }

    // Setup main event listeners with cached DOM elements
    setupEventListeners() {
        // Show blocked toggle
        if (this.domCache.showBlockedBtn) {
            this.domCache.showBlockedBtn.addEventListener('click', () => {
                this.ui.toggleShowBlocked();
                // Don't preserve scroll for manual actions
                this.refreshDisplay(false);
            });
        }
        
        this.ui.updateShowBlockedButton();

        // Listen for tab changes to update display
        if (chrome.tabs && chrome.tabs.onActivated) {
            chrome.tabs.onActivated.addListener(async (activeInfo) => {
                console.log('FancyTracker: Tab activated:', activeInfo.tabId);
                await this.updateCurrentTab();
                // Background script will send updated data automatically
            });
        }

        // Listen for tab updates to refresh URL display
        if (chrome.tabs && chrome.tabs.onUpdated) {
            chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
                if (tabId === this.currentTabId && changeInfo.url) {
                    console.log('FancyTracker: Tab URL changed:', changeInfo.url);
                    this.currentUrl = changeInfo.url;
                    this.refreshDisplay(false);
                }
            });
        }
    }

    // Setup highlight editor modal with optimized event handling
    setupHighlightEditor() {
        const highlightBtn = document.getElementById('highlight-btn');
        const modal = document.getElementById('highlight-modal');
        const textarea = document.getElementById('highlight-textarea');
        const saveBtn = document.getElementById('highlight-save');
        const cancelBtn = document.getElementById('highlight-cancel');
        
        if (!highlightBtn || !modal || !textarea || !saveBtn || !cancelBtn) {
            console.error('Highlight editor elements not found');
            return;
        }
        
        // Load existing rules into textarea
        chrome.storage.local.get(['highlightRulesText'], (result) => {
            if (result.highlightRulesText) {
                textarea.value = result.highlightRulesText;
            }
        });
        
        // Open modal
        highlightBtn.addEventListener('click', () => {
            modal.classList.add('show');
        });
        
        // Close modal
        cancelBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });
        
        // Save and apply rules
        saveBtn.addEventListener('click', () => {
            const rulesText = textarea.value;
            const parsedRules = this.ui.parseHighlightText(rulesText);
            
            // Save rules to storage
            this.storage.saveHighlightRules(parsedRules, rulesText);
            
            // Re-highlight all code blocks
            this.ui.reHighlightCodeBlocks();
            
            modal.classList.remove('show');
        });
    }

    // Setup settings modal with improved event handling
    setupSettingsModal() {
        const settingsBtn = document.getElementById('settings-btn');
        const modal = document.getElementById('settings-modal');
        const urlInput = document.getElementById('logging-url-input');
        const saveBtn = document.getElementById('settings-save');
        const cancelBtn = document.getElementById('settings-cancel');
        const prettifyToggle = document.getElementById('prettify-toggle');
        const dedupeToggle = document.getElementById('dedupe-toggle');

        if (!settingsBtn || !modal) {
            console.error('Settings elements not found');
            return;
        }

        // Open settings modal
        settingsBtn.addEventListener('click', () => {
            // Reset input to original value when opening modal
            if (urlInput) {
                urlInput.value = this.storage.originalLogUrl;
            }
            
            // Set prettify toggle to current state
            if (prettifyToggle) {
                prettifyToggle.checked = this.storage.prettifyEnabled;
            }
            
            // Set dedupe toggle to current state
            if (dedupeToggle) {
                dedupeToggle.checked = this.storage.dedupeEnabled;
                console.log('FancyTracker: Setting dedupe checkbox to:', this.storage.dedupeEnabled);
            }
            
            modal.classList.add('show');
        });
        
        // Close settings modal
        const closeModal = () => {
            modal.classList.remove('show');
            // Reset input to original value when closing without saving
            if (urlInput) {
                urlInput.value = this.storage.originalLogUrl;
            }
            // Reset prettify toggle to original state
            if (prettifyToggle) {
                prettifyToggle.checked = this.storage.prettifyEnabled;
            }
            // Reset dedupe toggle to original state
            if (dedupeToggle) {
                dedupeToggle.checked = this.storage.dedupeEnabled;
            }
        };
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        
        // Save settings
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const logUrl = urlInput ? urlInput.value.trim() : '';
                await this.storage.saveLogUrl(logUrl);
                
                const prettifyEnabled = prettifyToggle ? prettifyToggle.checked : false;
                const prettifyChanged = prettifyEnabled !== this.storage.prettifyEnabled;
                await this.storage.savePrettifySetting(prettifyEnabled);
                
                // Handle dedupe setting
                const dedupeEnabled = dedupeToggle ? dedupeToggle.checked : true;
                const dedupeChanged = dedupeEnabled !== this.storage.dedupeEnabled;
                if (dedupeChanged) {
                    console.log('FancyTracker: Dedupe setting changed to:', dedupeEnabled);
                    await this.storage.saveDedupeSetting(dedupeEnabled);
                    // Mark as manual refresh since dedupe changes affect display
                    this.isManualRefresh = true;
                }
                
                // Clear prettify cache if setting changed
                if (prettifyChanged) {
                    this.ui.clearPrettifyCache();
                }
                
                // Refresh display to apply changes
                if (prettifyChanged || dedupeChanged) {
                    this.refreshDisplay(false);
                }
                
                modal.classList.remove('show');
            });
        }
        
        // Setup export/import functionality
        this.setupExportImport();
    }

    // Setup export/import functionality with better error handling
    setupExportImport() {
        // Export URLs
        const exportUrlsBtn = document.getElementById('export-urls-btn');
        if (exportUrlsBtn) {
            exportUrlsBtn.addEventListener('click', () => {
                this.storage.exportBlockedUrls();
            });
        }
        
        // Import URLs
        const importUrlsBtn = document.getElementById('import-urls-btn');
        const importUrlsFile = document.getElementById('import-urls-file');
        if (importUrlsBtn && importUrlsFile) {
            importUrlsBtn.addEventListener('click', () => {
                importUrlsFile.click();
            });
            
            importUrlsFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.storage.importBlockedUrls(file, (err, message) => {
                        if (err) {
                            alert('Error reading file: ' + err.message);
                        } else {
                            alert(message);
                            // Mark as manual refresh for import actions
                            this.isManualRefresh = true;
                            this.port.postMessage("get-stuff");
                        }
                    });
                }
                e.target.value = ''; // Reset file input
            });
        }
        
        // Clear URLs
        const clearUrlsBtn = document.getElementById('clear-urls-btn');
        if (clearUrlsBtn) {
            clearUrlsBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all blocked URLs?')) {
                    this.storage.clearBlockedUrls();
                    alert('All blocked URLs cleared');
                    // Mark as manual refresh for clear actions
                    this.isManualRefresh = true;
                    this.port.postMessage("get-stuff");
                }
            });
        }
        
        // Export listeners
        const exportListenersBtn = document.getElementById('export-listeners-btn');
        if (exportListenersBtn) {
            exportListenersBtn.addEventListener('click', () => {
                this.storage.exportBlockedListeners();
            });
        }
        
        // Import listeners
        const importListenersBtn = document.getElementById('import-listeners-btn');
        const importListenersFile = document.getElementById('import-listeners-file');
        if (importListenersBtn && importListenersFile) {
            importListenersBtn.addEventListener('click', () => {
                importListenersFile.click();
            });
            
            importListenersFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.storage.importBlockedListeners(file, (err, message) => {
                        if (err) {
                            alert('Error reading file: ' + err.message);
                        } else {
                            alert(message);
                            // Mark as manual refresh for import actions
                            this.isManualRefresh = true;
                            this.port.postMessage("get-stuff");
                        }
                    });
                }
                e.target.value = ''; // Reset file input
            });
        }
        
        // Clear listeners
        const clearListenersBtn = document.getElementById('clear-listeners-btn');
        if (clearListenersBtn) {
            clearListenersBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all blocked listeners?')) {
                    this.storage.clearBlockedListeners();
                    alert('All blocked listeners cleared');
                    // Mark as manual refresh for clear actions
                    this.isManualRefresh = true;
                    this.port.postMessage("get-stuff");
                }
            });
        }
    }

    // Cleanup method to prevent memory leaks
    destroy() {
        // Clear debounce timer
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
            this.updateDebounceTimer = null;
        }
        
        // Disconnect port
        if (this.port) {
            this.port.disconnect();
            this.port = null;
        }
        
        // Clear DOM cache
        this.domCache = {};
        
        // Clear prettify cache
        if (this.ui && this.ui.clearPrettifyCache) {
            this.ui.clearPrettifyCache();
        }
        
        // Clear other references
        this.currentListeners = [];
        this.storage = null;
        this.ui = null;
    }
}

// Initialize popup when DOM is ready
const popupMain = new PopupMain();

function loaded() {
    popupMain.init();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loaded);
} else {
    loaded();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (popupMain) {
        popupMain.destroy();
    }
});