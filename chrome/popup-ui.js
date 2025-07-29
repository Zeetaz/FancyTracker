// UI utilities and DOM manipulation for FancyTracker - Optimized Version
class PopupUI {
    constructor(storage) {
        this.storage = storage;
        this.showBlockedOnly = false;
        this.prettifyCache = new Map(); // Cache prettified results
        this.maxPrettifySize = 10000; // Don't prettify code larger than 10KB
        this.maxCacheSize = 100; // Limit cache size to prevent memory bloat
        
        // Pre-compiled regexes for better performance
        this.URL_REGEX = /\(https?:\/\/[^)]+\)/g;
        this.LINE_ENDING_REGEX = /:\d+:\d+$|:\d+$/;
    }

    // Format URL for display
    formatUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + urlObj.pathname;
        } catch (e) {
            return url || 'Unknown URL';
        }
    }

    // Format URL for display with truncation
    formatUrlForDisplay(url) {
        try {
            const urlObj = new URL(url);
            const displayUrl = urlObj.hostname + urlObj.pathname;
            return displayUrl.length > 40 ? displayUrl.substring(0, 37) + '...' : displayUrl;
        } catch (e) {
            return url || 'Unknown URL';
        }
    }

    // Optimized prettify with caching and size limits
    prettifyJavaScript(code) {
        if (!code || typeof code !== 'string') return code;
        
        // Skip prettification for very large code blocks
        if (code.length > this.maxPrettifySize) {
            console.log('FancyTracker: Skipping prettification for large code block:', code.length, 'chars');
            return code;
        }
        
        // Check cache first
        if (this.prettifyCache.has(code)) {
            return this.prettifyCache.get(code);
        }
        
        // Limit cache size to prevent memory bloat
        if (this.prettifyCache.size >= this.maxCacheSize) {
            // Remove oldest entries (FIFO)
            const firstKey = this.prettifyCache.keys().next().value;
            this.prettifyCache.delete(firstKey);
        }
        
        const result = this.prettifyJavaScriptCore(code);
        
        // Cache the result
        this.prettifyCache.set(code, result);
        return result;
    }
    
    // Core prettification logic (separated for clarity)
    prettifyJavaScriptCore(code) {
        let indentLevel = 0;
        const indentString = '    '; // 4 spaces
        let inString = false;
        let stringChar = '';
        let lines = [];
        let currentLine = '';
        
        // Use a more efficient approach for large strings
        const chars = Array.from(code); // Handle unicode correctly
        const length = chars.length;
        
        for (let i = 0; i < length; i++) {
            const char = chars[i];
            const nextChar = chars[i + 1];
            const prevChar = chars[i - 1];
            
            // Handle string literals
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
                currentLine += char;
                continue;
            }
            
            // Skip formatting inside strings
            if (inString) {
                currentLine += char;
                continue;
            }
            
            // Handle different characters
            switch (char) {
                case '{':
                    currentLine += char;
                    if (nextChar !== '}') {
                        lines.push(indentString.repeat(indentLevel) + currentLine.trim());
                        currentLine = '';
                        indentLevel++;
                    }
                    break;
                    
                case '}':
                    if (currentLine.trim()) {
                        lines.push(indentString.repeat(indentLevel) + currentLine.trim());
                        currentLine = '';
                    }
                    indentLevel = Math.max(0, indentLevel - 1);
                    currentLine += char;
                    if (nextChar && nextChar !== ',' && nextChar !== ';' && nextChar !== ')' && nextChar !== '}') {
                        lines.push(indentString.repeat(indentLevel) + currentLine.trim());
                        currentLine = '';
                    }
                    break;
                    
                case ';':
                    currentLine += char;
                    if (nextChar && nextChar !== ' ' && nextChar !== '\n' && nextChar !== '\r') {
                        lines.push(indentString.repeat(indentLevel) + currentLine.trim());
                        currentLine = '';
                    }
                    break;
                    
                case '\n':
                case '\r':
                    if (currentLine.trim()) {
                        lines.push(indentString.repeat(indentLevel) + currentLine.trim());
                        currentLine = '';
                    }
                    break;
                    
                default:
                    currentLine += char;
                    break;
            }
        }
        
        // Add any remaining content
        if (currentLine.trim()) {
            lines.push(indentString.repeat(indentLevel) + currentLine.trim());
        }
        
        // Clean up empty lines and join
        return lines
            .filter(line => line.trim() !== '')
            .join('\n');
    }

    // Clear cache when needed (call this when switching prettify on/off)
    clearPrettifyCache() {
        this.prettifyCache.clear();
    }

    // HTML utility functions
    htmlDecode(text) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    }

    htmlEscape(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Parse highlight rules text
    parseHighlightText(text) {
        const rules = {};
        const lines = text.split('\n');
        let currentColor = null;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            // Check for color definition [colorname]
            const colorMatch = trimmedLine.match(/^\[(\w+)\]$/);
            if (colorMatch) {
                currentColor = colorMatch[1].toLowerCase();
                if (!rules[currentColor]) {
                    rules[currentColor] = [];
                }
                continue;
            }
            
            // Add terms to current color
            if (currentColor && trimmedLine) {
                const terms = trimmedLine.split(',').map(term => term.trim()).filter(term => term);
                rules[currentColor].push(...terms);
            }
        }
        
        return rules;
    }

    // Apply syntax highlighting to code
    applyHighlighting(text, rules) {
        if (!rules || Object.keys(rules).length === 0) {
            return this.htmlEscape(text);
        }
        
        // Step 1: Decode HTML entities to get clean text
        const cleanText = this.htmlDecode(text);
        
        // Step 2: Collect all terms and sort by length (longest first)
        const allTerms = [];
        for (const [color, terms] of Object.entries(rules)) {
            for (const term of terms) {
                if (term && term.trim()) {
                    allTerms.push({ term: term.trim(), color });
                }
            }
        }
        allTerms.sort((a, b) => b.term.length - a.term.length);
        
        // Step 3: Replace terms with unique placeholders
        let result = cleanText;
        const replacements = [];
        
        allTerms.forEach((item, index) => {
            const placeholder = `__PLACEHOLDER_${index}__`;
            result = result.split(item.term).join(placeholder);
            replacements.push({
                placeholder: placeholder,
                html: `<span class="highlight-${item.color}">${this.htmlEscape(item.term)}</span>`
            });
        });
        
        // Step 4: HTML escape everything, then replace placeholders with HTML
        result = this.htmlEscape(result);
        replacements.forEach(({ placeholder, html }) => {
            result = result.split(this.htmlEscape(placeholder)).join(html);
        });
        
        return result;
    }

    // Add expand/collapse functionality to code blocks
    addExpandFunctionality(codeBlock) {
        // Remove existing indicator and click handler
        const existingIndicator = codeBlock.querySelector('.expand-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        codeBlock.onclick = null;
        
        // Add new expand indicator
        const expandIndicator = document.createElement('div');
        expandIndicator.className = 'expand-indicator';
        expandIndicator.textContent = 'expand';
        codeBlock.appendChild(expandIndicator);
        
        // Add click handler for the entire code block (expand only)
        codeBlock.onclick = (e) => {
            const indicator = codeBlock.querySelector('.expand-indicator');
            
            // If clicking the indicator when expanded, collapse
            if (e.target === indicator && !codeBlock.classList.contains('truncated')) {
                codeBlock.classList.add('truncated');
                indicator.textContent = 'expand';
            }
            // If clicking anywhere when collapsed, expand
            else if (codeBlock.classList.contains('truncated')) {
                codeBlock.classList.remove('truncated');
                indicator.textContent = 'collapse';
            }
        };
    }

    // FIXED: Increased thresholds for expand functionality
    shouldTruncateCode(originalCode, displayCode) {
        // Use storage settings for thresholds
        return displayCode.length > this.storage.expandThreshold || 
               displayCode.split('\n').length > this.storage.maxLines;
    }

    // Create listener DOM element with optimized rendering
    createListenerElement(listener, index, onRefresh) {
        const item = document.createElement('div');
        item.className = 'listener-item';

        // Header section with info and actions
        const header = document.createElement('div');
        header.className = 'listener-header';
        
        // Left side - listener info
        const listenerInfo = document.createElement('div');
        listenerInfo.className = 'listener-info';
        
        const indexNumber = document.createElement('div');
        indexNumber.className = 'index-number';
        indexNumber.textContent = index;
        
        const domainName = document.createElement('div');
        domainName.className = 'domain-name';
        const domain = listener.domain || 'unknown';
        domainName.textContent = domain;
        
        // Only add tooltip and help cursor if text is actually truncated
        if (domain.length > 20) { // Approximate truncation threshold
            domainName.title = domain;
            domainName.style.cursor = 'help';
        }
        
        const windowInfo = document.createElement('div');
        windowInfo.className = 'window-info';
        
        // Clean up window text - extract just the frame path, filter out JSON data
        let windowText = (listener.window ? listener.window + ' ' : '') + 
                        (listener.hops && listener.hops.length ? listener.hops : 'direct');
        
        // Remove URL-encoded JSON data (starts with %7B and contains frame path after)
        windowText = windowText.replace(/%7B[^}]*%7D\s*/g, '').trim();
        
        // If nothing left after cleanup, default to 'direct'
        if (!windowText || windowText === '') {
            windowText = 'direct';
        }
        
        windowInfo.textContent = windowText;
        
        // Only add tooltip if text might be truncated
        if (windowText.length > 25) { // Approximate truncation threshold
            windowInfo.title = windowText;
            windowInfo.style.cursor = 'help';
        }
        
        listenerInfo.appendChild(indexNumber);
        listenerInfo.appendChild(domainName);
        listenerInfo.appendChild(windowInfo);
        
        // Right side - action buttons
        const listenerActions = document.createElement('div');
        listenerActions.className = 'listener-actions';
        
        const blockInfo = this.storage.isListenerBlocked(listener);
        
        if (blockInfo && this.showBlockedOnly) {
            // Show unblock button when viewing blocked items
            const unblockBtn = document.createElement('button');
            unblockBtn.className = 'unblock-btn';
            
            if (blockInfo.type === 'listener') {
                unblockBtn.innerHTML = '&#10003; Unblock';
                unblockBtn.title = 'Unblock this listener';
            } else if (blockInfo.type === 'url') {
                unblockBtn.innerHTML = '&#128279; Unblock URL';
                unblockBtn.title = 'Unblock this URL';
            } else if (blockInfo.type === 'regex') {
                unblockBtn.innerHTML = '&#9881; Regex Blocked';
                unblockBtn.title = `Blocked by regex: ${blockInfo.value}`;
                unblockBtn.disabled = true;
                unblockBtn.style.opacity = '0.6';
                unblockBtn.style.cursor = 'help';
            }
            
            if (blockInfo.type !== 'regex') {
                unblockBtn.onclick = async (e) => {
                    e.stopPropagation();
                    this.storage.removeFromBlocklist(blockInfo.type, blockInfo.value);
                    // Trigger refresh with badge update - now async
                    await onRefresh();
                };
            }
            listenerActions.appendChild(unblockBtn);
        } else if (!blockInfo && !this.showBlockedOnly) {
            // Show block buttons when item is not blocked
            const blockBtn = document.createElement('button');
            blockBtn.className = 'block-btn';
            blockBtn.innerHTML = '&#8856; Block';
            blockBtn.title = 'Block this specific listener';
            blockBtn.onclick = async (e) => {
                e.stopPropagation();
                this.storage.addToBlocklist('listener', listener.listener);
                // Trigger refresh with badge update - now async
                await onRefresh();
            };
            
            // FIXED: Allow blocking of any URL - removed HTTP/HTTPS restriction
            const jsUrl = this.storage.extractJsUrlFromStack(listener.stack, listener.fullstack);
            
            const blockUrlBtn = document.createElement('button');
            blockUrlBtn.className = 'block-btn';
            blockUrlBtn.innerHTML = '&#128279; Block URL';
            
            // Debug logging to help diagnose URL detection issues
            console.log('FancyTracker: URL detection debug:', {
                stack: listener.stack,
                fullstack: listener.fullstack,
                extractedUrl: jsUrl
            });
            
            if (jsUrl && jsUrl.length > 0) {
                // We found a URL to block (any protocol is allowed)
                blockUrlBtn.title = `Block all listeners from: ${this.formatUrlForDisplay(jsUrl)}`;
                blockUrlBtn.disabled = false;
                blockUrlBtn.style.opacity = '1';
                blockUrlBtn.style.cursor = 'pointer';
                blockUrlBtn.onclick = async (e) => {
                    e.stopPropagation();
                    console.log('Blocking URL:', jsUrl);
                    this.storage.addToBlocklist('url', jsUrl);
                    // Trigger refresh with badge update - now async
                    await onRefresh();
                };
            } else {
                // No URL found, disable the button
                blockUrlBtn.title = 'No JavaScript file detected in stack trace';
                blockUrlBtn.disabled = true;
                blockUrlBtn.style.opacity = '0.5';
                blockUrlBtn.style.cursor = 'not-allowed';
                blockUrlBtn.onclick = (e) => {
                    e.stopPropagation();
                    // Do nothing
                };
            }
            
            listenerActions.appendChild(blockBtn);
            listenerActions.appendChild(blockUrlBtn);
        }
        
        header.appendChild(listenerInfo);
        header.appendChild(listenerActions);

        // Stack section
        const stackSection = document.createElement('div');
        stackSection.className = 'stack-section';
        
        const stackTrace = document.createElement('div');
        stackTrace.className = 'stack-trace';
        stackTrace.textContent = listener.stack || 'Unknown stack';
        
        if (listener.fullstack) {
            stackTrace.title = listener.fullstack.join('\n\n');
        }
        
        stackSection.appendChild(stackTrace);

        // Code section - with configurable font size
        const codeSection = document.createElement('div');
        codeSection.className = 'code-section';
        
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';
        
        // Apply configurable font size
        codeBlock.style.fontSize = `${this.storage.codeFontSize}px`;
        
        const originalCode = listener.listener || 'function() { /* code not available */ }';
        let displayCode = originalCode;
        
        // Apply prettification if enabled
        if (this.storage.prettifyEnabled) {
            displayCode = this.prettifyJavaScript(originalCode);
        }

        // Store ORIGINAL text (not processed) for later re-processing
        codeBlock.setAttribute('data-original-text', originalCode);
        
        // Apply highlighting to display code
        codeBlock.innerHTML = this.applyHighlighting(displayCode, this.storage.highlightRules);
        
        // Add expand functionality based on display code
        if (this.shouldTruncateCode(originalCode, displayCode)) {
            codeBlock.classList.add('truncated');
            this.addExpandFunctionality(codeBlock);
        }
        
        codeSection.appendChild(codeBlock);
        item.appendChild(header);
        item.appendChild(stackSection);
        item.appendChild(codeSection);

        return item;
    }

    // Update show blocked button state
    updateShowBlockedButton() {
        const showBlockedBtn = document.getElementById('show-blocked-btn');
        if (showBlockedBtn) {
            if (this.showBlockedOnly) {
                showBlockedBtn.classList.add('active');
                showBlockedBtn.textContent = 'Show Active';
            } else {
                showBlockedBtn.classList.remove('active');
                showBlockedBtn.textContent = 'Show Blocked';
            }
        }
    }

    // Toggle show blocked mode
    toggleShowBlocked() {
        this.showBlockedOnly = !this.showBlockedOnly;
        this.updateShowBlockedButton();
    }

    // Re-highlight all code blocks with current rules
    reHighlightCodeBlocks() {
        document.querySelectorAll('.code-block').forEach(codeBlock => {
            const originalText = codeBlock.getAttribute('data-original-text');
            if (originalText) {
                const wasExpanded = !codeBlock.classList.contains('truncated');
                
                // Apply prettification if enabled
                let displayCode = originalText;
                if (this.storage.prettifyEnabled) {
                    displayCode = this.prettifyJavaScript(originalText);
                }
                
                // Apply highlighting to the processed code
                codeBlock.innerHTML = this.applyHighlighting(displayCode, this.storage.highlightRules);
                
                // Update font size
                codeBlock.style.fontSize = `${this.storage.codeFontSize}px`;
                
                // Restore expand state and functionality based on display code
                if (this.shouldTruncateCode(originalText, displayCode)) {
                    codeBlock.classList.toggle('truncated', !wasExpanded);
                    this.addExpandFunctionality(codeBlock);
                }
            }
        });
    }

    // Optimized display listeners method with better DOM manipulation
    displayListeners(listeners, currentUrl, onRefresh, preserveScroll = false) {
        try {
            // Use requestAnimationFrame for smooth updates
            requestAnimationFrame(() => {
                // Save scroll position if preserving
                let savedScrollTop = 0;
                const contentElement = document.querySelector('.content');
                if (preserveScroll && contentElement) {
                    savedScrollTop = contentElement.scrollTop;
                    console.log('FancyTracker: Saving scroll position:', savedScrollTop);
                }

                // Update header URL
                const headerElement = document.getElementById('h');
                if (headerElement) {
                    headerElement.textContent = this.formatUrl(currentUrl);
                }

                // Filter listeners based on showBlockedOnly setting
                let filteredListeners = listeners;
                if (listeners) {
                    if (this.showBlockedOnly) {
                        // Show only blocked listeners
                        filteredListeners = listeners.filter(listener => this.storage.isListenerBlocked(listener));
                    } else {
                        // Show only unblocked listeners (default behavior)
                        filteredListeners = listeners.filter(listener => !this.storage.isListenerBlocked(listener));
                    }
                }

                // Update listener count and status
                const countElement = document.getElementById('listener-count');
                const statusElement = document.getElementById('status-badge');
                
                if (countElement) {
                    const totalCount = listeners ? listeners.length : 0;
                    const blockedCount = listeners ? listeners.filter(listener => this.storage.isListenerBlocked(listener)).length : 0;
                    
                    if (this.showBlockedOnly) {
                        countElement.textContent = `${blockedCount} blocked listener${blockedCount !== 1 ? 's' : ''}`;
                    } else {
                        const activeCount = totalCount - blockedCount;
                        countElement.textContent = `${activeCount} active listener${activeCount !== 1 ? 's' : ''} (${blockedCount} blocked)`;
                    }
                }
                
                if (statusElement) {
                    if (this.showBlockedOnly) {
                        statusElement.textContent = 'Blocked';
                        statusElement.className = 'status-badge inactive';
                    } else {
                        if (filteredListeners && filteredListeners.length > 0) {
                            statusElement.textContent = 'Active';
                            statusElement.className = 'status-badge';
                        } else {
                            statusElement.textContent = 'Idle';
                            statusElement.className = 'status-badge inactive';
                        }
                    }
                }

                // Clear existing content and rebuild efficiently
                const container = document.getElementById('x');
                if (!container) return;
                
                // Use innerHTML = '' for faster clearing of large content
                container.innerHTML = '';

                // Show listeners or empty state
                if (filteredListeners && filteredListeners.length > 0) {
                    // Create elements in memory first using DocumentFragment, then append all at once
                    const fragment = document.createDocumentFragment();
                    
                    for(let i = 0; i < filteredListeners.length; i++) {
                        const listener = filteredListeners[i];
                        const listenerElement = this.createListenerElement(listener, i + 1, onRefresh);
                        fragment.appendChild(listenerElement);
                    }
                    
                    // Single DOM append for better performance
                    container.appendChild(fragment);
                } else {
                    // Show empty state
                    const emptyState = document.createElement('div');
                    emptyState.className = 'empty-state';
                    
                    if (this.showBlockedOnly) {
                        // No blocked listeners
                        emptyState.innerHTML = `
                            <div class="empty-title">No blocked listeners</div>
                            <div class="empty-description">
                                You haven't blocked any listeners yet. 
                                Block unwanted listeners to see them here.
                            </div>
                        `;
                    } else {
                        // No active listeners
                        const totalCount = listeners ? listeners.length : 0;
                        const blockedCount = listeners ? listeners.filter(listener => this.storage.isListenerBlocked(listener)).length : 0;
                        
                        if (totalCount > 0 && blockedCount === totalCount) {
                            emptyState.innerHTML = `
                                <div class="empty-title">All listeners blocked</div>
                                <div class="empty-description">
                                    All listeners on this page have been blocked. 
                                    Click "Show Blocked" to view them.
                                </div>
                            `;
                        } else {
                            emptyState.innerHTML = `
                                <div class="empty-title">No listeners detected</div>
                                <div class="empty-description">
                                    No postMessage listeners found on this page. 
                                    Try refreshing or navigating to a different site.
                                </div>
                            `;
                        }
                    }
                    container.appendChild(emptyState);
                }

                // Restore scroll position if preserving
                if (preserveScroll && contentElement && savedScrollTop > 0) {
                    // Use setTimeout to ensure DOM is fully updated
                    setTimeout(() => {
                        contentElement.scrollTop = savedScrollTop;
                        console.log('FancyTracker: Restored scroll position:', savedScrollTop);
                    }, 0);
                }
            });
        } catch (error) {
            console.error('FancyTracker: Error building listener list:', error);
        }
    }
}