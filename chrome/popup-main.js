// Main popup script for FancyTracker - Optimized with Pre-loading and Port Reconnection Fix
class PopupMain {
    constructor() {
        this.storage = new PopupStorage();
        this.ui = new PopupUI(this.storage);
        this.port = null;
        this.isPortConnected = false;
        
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
        
        // Track pending message requests
        this.pendingRequests = 0;
        this.maxRetries = 3;
    }

    // Initialize the popup with DOM caching and immediate data loading
    async init() {
        try {
            // Cache frequently accessed DOM elements early
            this.cacheDOMElements();
            
            // Clear initial loading state - we'll get real data immediately
            this.clearLoadingState();
            
            // Setup port communication FIRST for immediate data
            await this.connectPort();
            
            // Load storage settings in parallel
            const storagePromise = this.storage.init();
            
            // Get initial tab info in parallel
            const tabPromise = this.updateCurrentTab();
            
            // Setup UI components while data loads
            this.setupEventListeners();
            this.setupHighlightEditor();
            this.setupRegexEditor();
            this.setupSettingsModal();
            
            // Wait for storage and tab info
            await Promise.all([storagePromise, tabPromise]);
            
            console.log('FancyTracker popup initialized with pre-loading optimization and port reconnection');
        } catch (error) {
            console.error('FancyTracker: Popup initialization error:', error);
            this.ui.displayListeners([], 'Error loading', () => {});
        }
    }

    // Connect or reconnect the port with retry logic
    async connectPort() {
        try {
            if (this.port) {
                this.port.disconnect();
            }
            
            this.port = chrome.runtime.connect({
                name: "FancyTracker Communication"
            });
            
            this.isPortConnected = true;
            this.setupPortCommunication();
            console.log('FancyTracker: Port connected successfully');
            
            // Request initial data immediately after connection
            this.requestData();
            
        } catch (error) {
            console.error('FancyTracker: Failed to connect port:', error);
            this.isPortConnected = false;
            throw error;
        }
    }

    // Setup port communication with automatic reconnection handling
    setupPortCommunication() {
        if (!this.port) return;
        
        // Listen for messages from background (including immediate pre-loaded data)
        this.port.onMessage.addListener((msg) => {
            console.log("FancyTracker: message received:", msg);
            this.pendingRequests = Math.max(0, this.pendingRequests - 1);
            this.handleBackgroundMessage(msg);
        });
        
        // Handle port disconnection with automatic reconnection
        this.port.onDisconnect.addListener(() => {
            console.log('FancyTracker: Port disconnected');
            this.isPortConnected = false;
            
            if (chrome.runtime.lastError) {
                console.error('FancyTracker: Port error:', chrome.runtime.lastError);
            }
            
            // Don't attempt reconnection if popup is being closed
            if (!document.hidden) {
                console.log('FancyTracker: Attempting to reconnect port...');
                setTimeout(() => {
                    this.connectPort().catch(err => {
                        console.error('FancyTracker: Port reconnection failed:', err);
                    });
                }, 100); // Small delay before reconnection
            }
        });
    }

    // Safe method to send messages with automatic reconnection
    async sendMessage(message, retryCount = 0) {
        if (retryCount >= this.maxRetries) {
            console.error('FancyTracker: Max retries reached for message:', message);
            return false;
        }
        
        try {
            // Check if port is connected
            if (!this.isPortConnected || !this.port) {
                console.log('FancyTracker: Port not connected, attempting to reconnect...');
                await this.connectPort();
            }
            
            this.pendingRequests++;
            this.port.postMessage(message);
            return true;
            
        } catch (error) {
            console.error('FancyTracker: Error sending message, attempt', retryCount + 1, ':', error);
            this.isPortConnected = false;
            
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 200 * (retryCount + 1)));
            return this.sendMessage(message, retryCount + 1);
        }
    }

    // Request data from background script
    async requestData() {
        const success = await this.sendMessage("get-stuff");
        if (!success) {
            console.error('FancyTracker: Failed to request data from background script');
            // Show error state or retry later
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
            this.ui.displayListeners(this.currentListeners, this.currentUrl, async () => {
                // Mark this as a manual refresh when onRefresh is called
                this.isManualRefresh = true;
                // Request fresh data from background, which will trigger badge update
                await this.requestData();
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

    // Setup regex editor modal with robust DOM ready checking
    setupRegexEditor() {
        console.log('FancyTracker: Setting up regex editor...');
        
        // Use a retry mechanism to ensure DOM is ready
        const setupWithRetry = (retryCount = 0) => {
            const maxRetries = 10;
            
            const regexBtn = document.getElementById('regex-btn');
            const modal = document.getElementById('regex-modal');
            const textarea = document.getElementById('regex-textarea');
            const saveBtn = document.getElementById('regex-save');
            const cancelBtn = document.getElementById('regex-cancel');
            
            console.log(`FancyTracker: Regex setup attempt ${retryCount + 1}, elements found:`, {
                regexBtn: !!regexBtn,
                modal: !!modal,
                textarea: !!textarea,
                saveBtn: !!saveBtn,
                cancelBtn: !!cancelBtn
            });
            
            if (!regexBtn && retryCount < maxRetries) {
                console.log('FancyTracker: Regex button not found, retrying in 100ms...');
                setTimeout(() => setupWithRetry(retryCount + 1), 100);
                return;
            }
            
            if (!regexBtn) {
                console.error('FancyTracker: Regex button not found after max retries');
                return;
            }
            
            if (!modal || !textarea || !saveBtn || !cancelBtn) {
                console.error('FancyTracker: Some regex modal elements not found:', {
                    modal: !!modal,
                    textarea: !!textarea,
                    saveBtn: !!saveBtn,
                    cancelBtn: !!cancelBtn
                });
                return;
            }
            
            // Load existing regex patterns into textarea
            chrome.storage.local.get(['blockedRegex'], (result) => {
                if (result.blockedRegex && result.blockedRegex.length > 0) {
                    textarea.value = result.blockedRegex.join('\n');
                    console.log('FancyTracker: Loaded existing regex patterns:', result.blockedRegex);
                }
            });
            
            // Remove any existing event listeners to avoid duplicates
            const newRegexBtn = regexBtn.cloneNode(true);
            regexBtn.parentNode.replaceChild(newRegexBtn, regexBtn);
            
            // Open modal - using the cloned button
            newRegexBtn.addEventListener('click', (e) => {
                console.log('FancyTracker: Regex button clicked!');
                e.preventDefault();
                e.stopPropagation();
                
                // Test modal visibility
                console.log('FancyTracker: Modal display before:', window.getComputedStyle(modal).display);
                
                // Reload patterns in case they changed
                chrome.storage.local.get(['blockedRegex'], (result) => {
                    if (result.blockedRegex && result.blockedRegex.length > 0) {
                        textarea.value = result.blockedRegex.join('\n');
                    } else {
                        textarea.value = '';
                    }
                    console.log('FancyTracker: Reloaded regex patterns');
                });
                
                // Force show the modal with multiple methods
                modal.style.display = 'flex';
                modal.classList.add('show');
                modal.style.zIndex = '9999';
                modal.style.position = 'fixed';
                modal.style.top = '0';
                modal.style.left = '0';
                modal.style.right = '0';
                modal.style.bottom = '0';
                modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                modal.style.alignItems = 'center';
                modal.style.justifyContent = 'center';
                
                console.log('FancyTracker: Modal display after:', window.getComputedStyle(modal).display);
                console.log('FancyTracker: Modal classList:', modal.classList.toString());
                console.log('FancyTracker: Regex modal should be visible now');
            });
            
            // Close modal
            cancelBtn.addEventListener('click', (e) => {
                console.log('FancyTracker: Regex cancel clicked');
                e.preventDefault();
                e.stopPropagation();
                modal.style.display = 'none';
                modal.classList.remove('show');
            });
            
            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    console.log('FancyTracker: Clicked outside regex modal, closing');
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                }
            });
            
            // Save and apply regex patterns
            saveBtn.addEventListener('click', async (e) => {
                console.log('FancyTracker: Regex save clicked');
                e.preventDefault();
                e.stopPropagation();
                
                const regexText = textarea.value;
                const patterns = this.storage.parseRegexText(regexText);
                
                console.log('FancyTracker: Parsed regex patterns:', patterns);
                
                // Save patterns to storage
                this.storage.saveRegexPatterns(patterns);
                
                console.log('FancyTracker: Saved regex patterns:', patterns);
                
                // Mark as manual refresh to update display
                this.isManualRefresh = true;
                await this.requestData();
                
                modal.style.display = 'none';
                modal.classList.remove('show');
            });
            
            console.log('FancyTracker: Regex editor setup complete');
        };
        
        // Start the setup process
        setupWithRetry();
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
            // Reload rules text in case it changed
            chrome.storage.local.get(['highlightRulesText'], (result) => {
                if (result.highlightRulesText) {
                    textarea.value = result.highlightRulesText;
                } else {
                    textarea.value = '';
                }
            });
            modal.classList.add('show');
        });
        
        // Close modal
        cancelBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
        
        // Save and apply rules
        saveBtn.addEventListener('click', () => {
            const rulesText = textarea.value;
            const parsedRules = this.ui.parseHighlightText(rulesText);
            
            console.log('FancyTracker: Saving highlight rules:', parsedRules);
            
            // Save rules to storage
            this.storage.saveHighlightRules(parsedRules, rulesText);
            
            // Re-highlight all code blocks (preserve syntax highlighting since only custom rules changed)
            this.ui.reHighlightCodeBlocks(false);
            
            modal.classList.remove('show');
        });
    }

    // Setup settings modal with improved event handling and code display settings
    setupSettingsModal() {
        const settingsBtn = document.getElementById('settings-btn');
        const modal = document.getElementById('settings-modal');
        const urlInput = document.getElementById('logging-url-input');
        const saveBtn = document.getElementById('settings-save');
        const cancelBtn = document.getElementById('settings-cancel');
        const prettifyToggle = document.getElementById('prettify-toggle');
        const dedupeToggle = document.getElementById('dedupe-toggle');
        const syntaxHighlightToggle = document.getElementById('syntax-highlight-toggle');
        
        // Code display settings
        const expandThresholdInput = document.getElementById('expand-threshold-input');
        const maxLinesInput = document.getElementById('max-lines-input');
        const fontSizeInput = document.getElementById('font-size-input');

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
            
            // Set syntax highlight toggle to current state (now defaults to true)
            if (syntaxHighlightToggle) {
                syntaxHighlightToggle.checked = this.storage.syntaxHighlightEnabled;
                console.log('FancyTracker: Setting syntax highlight checkbox to:', this.storage.syntaxHighlightEnabled);
            }
            
            // Set code display settings
            if (expandThresholdInput) {
                expandThresholdInput.value = this.storage.expandThreshold;
            }
            if (maxLinesInput) {
                maxLinesInput.value = this.storage.maxLines;
            }
            if (fontSizeInput) {
                fontSizeInput.value = this.storage.codeFontSize;
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
            // Reset syntax highlight toggle to original state (now defaults to true)
            if (syntaxHighlightToggle) {
                syntaxHighlightToggle.checked = this.storage.syntaxHighlightEnabled;
            }
            // Reset code display settings
            if (expandThresholdInput) {
                expandThresholdInput.value = this.storage.expandThreshold;
            }
            if (maxLinesInput) {
                maxLinesInput.value = this.storage.maxLines;
            }
            if (fontSizeInput) {
                fontSizeInput.value = this.storage.codeFontSize;
            }
        };
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Save settings
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const logUrl = urlInput ? urlInput.value.trim() : '';
                await this.storage.saveLogUrl(logUrl);
                
                const prettifyEnabled = prettifyToggle ? prettifyToggle.checked : false;
                const prettifyChanged = prettifyEnabled !== this.storage.prettifyEnabled;
                await this.storage.savePrettifySetting(prettifyEnabled);
                
                // Handle syntax highlighting setting (now defaults to true)
                const syntaxHighlightEnabled = syntaxHighlightToggle ? syntaxHighlightToggle.checked : true;
                const syntaxHighlightChanged = syntaxHighlightEnabled !== this.storage.syntaxHighlightEnabled;
                if (syntaxHighlightChanged) {
                    console.log('FancyTracker: Syntax highlight setting changed to:', syntaxHighlightEnabled);
                    await this.storage.saveSyntaxHighlightSetting(syntaxHighlightEnabled);
                }
                
                // Handle dedupe setting
                const dedupeEnabled = dedupeToggle ? dedupeToggle.checked : true;
                const dedupeChanged = dedupeEnabled !== this.storage.dedupeEnabled;
                if (dedupeChanged) {
                    console.log('FancyTracker: Dedupe setting changed to:', dedupeEnabled);
                    await this.storage.saveDedupeSetting(dedupeEnabled);
                    // Mark as manual refresh since dedupe changes affect display
                    this.isManualRefresh = true;
                }
                
                // Handle code display settings
                let codeSettingsChanged = false;
                if (expandThresholdInput) {
                    const newThreshold = parseInt(expandThresholdInput.value) || 4000;
                    if (newThreshold !== this.storage.expandThreshold) {
                        this.storage.expandThreshold = newThreshold;
                        codeSettingsChanged = true;
                    }
                }
                if (maxLinesInput) {
                    const newMaxLines = parseInt(maxLinesInput.value) || 40;
                    if (newMaxLines !== this.storage.maxLines) {
                        this.storage.maxLines = newMaxLines;
                        codeSettingsChanged = true;
                    }
                }
                if (fontSizeInput) {
                    const newFontSize = parseInt(fontSizeInput.value) || 12;
                    if (newFontSize !== this.storage.codeFontSize) {
                        this.storage.codeFontSize = newFontSize;
                        codeSettingsChanged = true;
                    }
                }
                
                if (codeSettingsChanged) {
                    this.storage.saveCodeSettings();
                }
                
                // Clear prettify cache if setting changed
                if (prettifyChanged) {
                    this.ui.clearPrettifyCache();
                }
                
                // Refresh display to apply changes
                if (prettifyChanged || syntaxHighlightChanged || dedupeChanged || codeSettingsChanged) {
                    // Determine if we need to force a full rebuild
                    const needsFullRebuild = prettifyChanged || syntaxHighlightChanged;
                    
                    if (needsFullRebuild) {
                        console.log('FancyTracker: Settings changed that affect syntax highlighting, doing full rebuild');
                        // Re-highlight code blocks with full rebuild (syntax highlighting settings changed)
                        this.ui.reHighlightCodeBlocks(true);
                    } else {
                        console.log('FancyTracker: Only non-highlighting settings changed, preserving existing highlighting');
                        // Just update custom highlighting (preserve syntax highlighting)
                        this.ui.reHighlightCodeBlocks(false);
                    }
                    
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
            
            importUrlsFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.storage.importBlockedUrls(file, async (err, message) => {
                        if (err) {
                            alert('Error reading file: ' + err.message);
                        } else {
                            alert(message);
                            // Mark as manual refresh for import actions
                            this.isManualRefresh = true;
                            await this.requestData();
                        }
                    });
                }
                e.target.value = ''; // Reset file input
            });
        }
        
        // Clear URLs
        const clearUrlsBtn = document.getElementById('clear-urls-btn');
        if (clearUrlsBtn) {
            clearUrlsBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to clear all blocked URLs?')) {
                    this.storage.clearBlockedUrls();
                    alert('All blocked URLs cleared');
                    // Mark as manual refresh for clear actions
                    this.isManualRefresh = true;
                    await this.requestData();
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
            
            importListenersFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.storage.importBlockedListeners(file, async (err, message) => {
                        if (err) {
                            alert('Error reading file: ' + err.message);
                        } else {
                            alert(message);
                            // Mark as manual refresh for import actions
                            this.isManualRefresh = true;
                            await this.requestData();
                        }
                    });
                }
                e.target.value = ''; // Reset file input
            });
        }
        
        // Clear listeners
        const clearListenersBtn = document.getElementById('clear-listeners-btn');
        if (clearListenersBtn) {
            clearListenersBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to clear all blocked listeners?')) {
                    this.storage.clearBlockedListeners();
                    alert('All blocked listeners cleared');
                    // Mark as manual refresh for clear actions
                    this.isManualRefresh = true;
                    await this.requestData();
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
        this.isPortConnected = false;
        
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