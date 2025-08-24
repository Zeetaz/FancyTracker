// UI utilities and DOM manipulation for FancyTracker - Optimized Version with Local Highlight.js
class PopupUI {
    constructor(storage) {
        this.storage = storage;
        this.showBlockedOnly = false;
        this.prettifyCache = new Map();
        this.maxPrettifySize = 10000;
        this.maxCacheSize = 100;
        
        this.URL_REGEX = /\(https?:\/\/[^)]+\)/g;
        this.LINE_ENDING_REGEX = /:\d+:\d+$|:\d+$/;
        
        this.initHighlightJs();
    }

    initHighlightJs() {
        if (typeof hljs !== 'undefined') {
            console.log('FancyTracker: Local highlight.js is available');
            this.highlightJsAvailable = true;
            hljs.configure({
                languages: ['javascript', 'js'],
                ignoreUnescapedHTML: true
            });
        } else {
            console.error('FancyTracker: Local highlight.js not found!');
            this.highlightJsAvailable = false;
        }
    }

    applySyntaxHighlighting(codeElement, code) {
        if (!this.highlightJsAvailable || !this.storage.syntaxHighlightEnabled) {
            return false;
        }

        try {
            codeElement.className = codeElement.className.replace(/hljs[^\s]*/g, '').trim();
            codeElement.textContent = code;
            hljs.highlightElement(codeElement);
            return true;
        } catch (error) {
            console.error('FancyTracker: Error applying syntax highlighting:', error);
            return false;
        }
    }


    
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    formatUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + urlObj.pathname;
        } catch (e) {
            return url || 'Unknown URL';
        }
    }

    formatUrlForDisplay(url) {
        try {
            const urlObj = new URL(url);
            const displayUrl = urlObj.hostname + urlObj.pathname;
            return displayUrl.length > 40 ? displayUrl.substring(0, 37) + '...' : displayUrl;
        } catch (e) {
            return url || 'Unknown URL';
        }
    }

    prettifyJavaScript(code) {
        if (!code || typeof code !== 'string') return code;
        
        if (code.length > this.maxPrettifySize) {
            return code;
        }
        
        if (this.prettifyCache.has(code)) {
            return this.prettifyCache.get(code);
        }
        
        if (this.prettifyCache.size >= this.maxCacheSize) {
            const firstKey = this.prettifyCache.keys().next().value;
            this.prettifyCache.delete(firstKey);
        }
        
        const result = this.prettifyJavaScriptCore(code);
        this.prettifyCache.set(code, result);
        return result;
    }
    
    prettifyJavaScriptCore(code) {
        let indentLevel = 0;
        const indentString = '    ';
        let inString = false;
        let stringChar = '';
        let lines = [];
        let currentLine = '';
        
        const chars = Array.from(code);
        const length = chars.length;
        
        for (let i = 0; i < length; i++) {
            const char = chars[i];
            const nextChar = chars[i + 1];
            const prevChar = chars[i - 1];
            
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
            
            if (inString) {
                currentLine += char;
                continue;
            }
            
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
        
        if (currentLine.trim()) {
            lines.push(indentString.repeat(indentLevel) + currentLine.trim());
        }
        
        return lines.filter(line => line.trim() !== '').join('\n');
    }

    clearPrettifyCache() {
        this.prettifyCache.clear();
    }

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

    parseHighlightText(text) {
        const rules = {};
        const lines = text.split('\n');
        let currentColor = null;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            const colorMatch = trimmedLine.match(/^\[(\w+)\]$/);
            if (colorMatch) {
                currentColor = colorMatch[1].toLowerCase();
                if (!rules[currentColor]) {
                    rules[currentColor] = [];
                }
                continue;
            }
            
            if (currentColor && trimmedLine) {
                const terms = trimmedLine.split(',').map(term => term.trim()).filter(term => term);
                rules[currentColor].push(...terms);
            }
        }
        
        console.log('FancyTracker: Parsed highlight rules:', rules);
        return rules;
    }

    applyHighlighting(text, rules) {
        if (!rules || Object.keys(rules).length === 0) {
            return this.htmlEscape(text);
        }
        
        const cleanText = this.htmlDecode(text);
        
        const allTerms = [];
        for (const [color, terms] of Object.entries(rules)) {
            for (const term of terms) {
                if (term && term.trim()) {
                    allTerms.push({ term: term.trim(), color });
                }
            }
        }
        allTerms.sort((a, b) => b.term.length - a.term.length);
        
        let result = cleanText;
        const replacements = [];
        
        allTerms.forEach((item, index) => {
            const placeholder = `__PLACEHOLDER_${index}__`;
            result = result.split(item.term).join(placeholder);
            replacements.push({
                placeholder: placeholder,
                html: `<span class="highlight-${item.color} custom-highlight">${this.htmlEscape(item.term)}</span>`
            });
        });
        
        result = this.htmlEscape(result);
        replacements.forEach(({ placeholder, html }) => {
            result = result.split(this.htmlEscape(placeholder)).join(html);
        });
        
        return result;
    }

    addExpandFunctionality(codeBlock) {
        const existingIndicator = codeBlock.querySelector('.expand-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        codeBlock.onclick = null;
        
        const expandIndicator = document.createElement('div');
        expandIndicator.className = 'expand-indicator';
        expandIndicator.textContent = 'expand';
        codeBlock.appendChild(expandIndicator);
        
        codeBlock.onclick = (e) => {
            const indicator = codeBlock.querySelector('.expand-indicator');
            
            if (e.target === indicator && !codeBlock.classList.contains('truncated')) {
                codeBlock.classList.add('truncated');
                indicator.textContent = 'expand';
            } else if (codeBlock.classList.contains('truncated')) {
                codeBlock.classList.remove('truncated');
                indicator.textContent = 'collapse';
            }
        };
    }

    shouldTruncateCode(originalCode, displayCode) {
        return displayCode.length > this.storage.expandThreshold || 
               displayCode.split('\n').length > this.storage.maxLines;
    }

    createListenerElement(listener, index, onRefresh) {
        const item = document.createElement('div');
        item.className = 'listener-item';

        const header = document.createElement('div');
        header.className = 'listener-header';
        
        const listenerInfo = document.createElement('div');
        listenerInfo.className = 'listener-info';
        
        const indexNumber = document.createElement('div');
        indexNumber.className = 'index-number';
        indexNumber.textContent = index;
        
        const domainName = document.createElement('div');
        domainName.className = 'domain-name';
        const domain = listener.domain || 'unknown';
        domainName.textContent = domain;
        
        if (domain.length > 20) {
            domainName.title = domain;
            domainName.style.cursor = 'help';
        }
        
        const windowInfo = document.createElement('div');
        windowInfo.className = 'window-info';
        
        let windowText = (listener.window ? listener.window + ' ' : '') + 
                        (listener.hops && listener.hops.length ? listener.hops : 'direct');
        
        windowText = windowText.replace(/%7B[^}]*%7D\s*/g, '').trim();
        
        if (!windowText || windowText === '') {
            windowText = 'direct';
        }
        
        windowInfo.textContent = windowText;
        
        if (windowText.length > 25) {
            windowInfo.title = windowText;
            windowInfo.style.cursor = 'help';
        }
        
        listenerInfo.appendChild(indexNumber);
        listenerInfo.appendChild(domainName);
        listenerInfo.appendChild(windowInfo);
        
        const listenerActions = document.createElement('div');
        listenerActions.className = 'listener-actions';
        
        const blockInfo = this.storage.isListenerBlocked(listener);
        
        if (blockInfo && this.showBlockedOnly) {
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
                    await onRefresh();
                };
            }
            listenerActions.appendChild(unblockBtn);
        } else if (!blockInfo && !this.showBlockedOnly) {
            const blockBtn = document.createElement('button');
            blockBtn.className = 'block-btn';
            blockBtn.innerHTML = '&#8856; Block';
            blockBtn.title = 'Block this specific listener';
            blockBtn.onclick = async (e) => {
                e.stopPropagation();
                this.storage.addToBlocklist('listener', listener.listener);
                await onRefresh();
            };
            
            const jsUrl = this.storage.extractJsUrlFromStack(listener.stack, listener.fullstack);
            
            const blockUrlBtn = document.createElement('button');
            blockUrlBtn.className = 'block-btn';
            blockUrlBtn.innerHTML = '&#128279; Block URL';
            
            if (jsUrl && jsUrl.length > 0) {
                blockUrlBtn.title = `Block all listeners from: ${this.formatUrlForDisplay(jsUrl)}`;
                blockUrlBtn.disabled = false;
                blockUrlBtn.style.opacity = '1';
                blockUrlBtn.style.cursor = 'pointer';
                blockUrlBtn.onclick = async (e) => {
                    e.stopPropagation();
                    this.storage.addToBlocklist('url', jsUrl);
                    await onRefresh();
                };
            } else {
                blockUrlBtn.title = 'No JavaScript file detected in stack trace';
                blockUrlBtn.disabled = true;
                blockUrlBtn.style.opacity = '0.5';
                blockUrlBtn.style.cursor = 'not-allowed';
                blockUrlBtn.onclick = (e) => e.stopPropagation();
            }
            
            listenerActions.appendChild(blockBtn);
            listenerActions.appendChild(blockUrlBtn);
        }
        
        header.appendChild(listenerInfo);
        header.appendChild(listenerActions);

        const stackSection = document.createElement('div');
        stackSection.className = 'stack-section';
        
        const stackTrace = document.createElement('div');
        stackTrace.className = 'stack-trace';
        stackTrace.textContent = listener.stack || 'Unknown stack';
        
        if (listener.fullstack) {
            stackTrace.title = listener.fullstack.join('\n\n');
        }
        
        stackSection.appendChild(stackTrace);

        const codeSection = document.createElement('div');
        codeSection.className = 'code-section';
        
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';
        codeBlock.style.fontSize = `${this.storage.codeFontSize}px`;
        
        const originalCode = listener.listener || 'function() { /* code not available */ }';
        let displayCode = originalCode;
        
        if (this.storage.prettifyEnabled) {
            displayCode = this.prettifyJavaScript(originalCode);
        }

        codeBlock.setAttribute('data-original-text', originalCode);
        
        // NEW APPROACH: Apply highlighting in the correct order to prevent interference
        this.applyAllHighlighting(codeBlock, displayCode);
        
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

    // NEW METHOD: Apply all highlighting in the correct order
    applyAllHighlighting(codeBlock, displayCode) {
        const hasCustomRules = this.storage.highlightRules && Object.keys(this.storage.highlightRules).length > 0;
        const hasSyntaxHighlighting = this.storage.syntaxHighlightEnabled && this.highlightJsAvailable;
        
        console.log('FancyTracker: Applying highlighting - Custom rules:', hasCustomRules, 'Syntax highlighting:', hasSyntaxHighlighting);
        
        if (!hasCustomRules && !hasSyntaxHighlighting) {
            // No highlighting at all
            codeBlock.textContent = displayCode;
            return;
        }
        
        if (!hasCustomRules && hasSyntaxHighlighting) {
            // Only syntax highlighting
            this.applySyntaxHighlighting(codeBlock, displayCode);
            return;
        }
        
        if (hasCustomRules && !hasSyntaxHighlighting) {
            // Only custom highlighting
            codeBlock.innerHTML = this.applyHighlighting(displayCode, this.storage.highlightRules);
            return;
        }
        
        // Both custom and syntax highlighting - this is the tricky case
        // Strategy: Apply custom highlighting first with special markers, then syntax highlighting, then convert markers
        console.log('FancyTracker: Applying both custom and syntax highlighting');
        
        // Step 1: Apply custom highlighting with placeholders
        const customHighlighted = this.applyCustomHighlightingWithPlaceholders(displayCode, this.storage.highlightRules);
        
        // Step 2: Apply syntax highlighting (this will process the placeholders as regular text)
        codeBlock.textContent = customHighlighted;
        this.applySyntaxHighlighting(codeBlock, customHighlighted);
        
        // Step 3: Convert placeholders back to actual highlight spans
        const finalHtml = this.convertPlaceholdersToHighlights(codeBlock.innerHTML);
        codeBlock.innerHTML = finalHtml;
    }
    
    // Apply custom highlighting using placeholders that survive syntax highlighting
    applyCustomHighlightingWithPlaceholders(text, rules) {
        if (!rules || Object.keys(rules).length === 0) {
            return text;
        }
        
        const allTerms = [];
        for (const [color, terms] of Object.entries(rules)) {
            for (const term of terms) {
                if (term && term.trim()) {
                    allTerms.push({ term: term.trim(), color });
                }
            }
        }
        
        allTerms.sort((a, b) => b.term.length - a.term.length);
        
        let result = text;
        let placeholderIndex = 0;
        
        allTerms.forEach((item) => {
            const term = item.term;
            const color = item.color;
            const escapedTerm = this.escapeRegex(term);
            const regex = new RegExp(`\\b(${escapedTerm})\\b`, 'gi');
            
            result = result.replace(regex, (match) => {
                const placeholder = `__CUSTOM_HIGHLIGHT_${placeholderIndex}_${color}__${match}__END_CUSTOM_HIGHLIGHT_${placeholderIndex}__`;
                placeholderIndex++;
                return placeholder;
            });
        });
        
        return result;
    }
    
    // Convert placeholders back to actual highlight spans
    convertPlaceholdersToHighlights(html) {
        // Find all placeholders in the syntax-highlighted HTML
        const placeholderRegex = /__CUSTOM_HIGHLIGHT_(\d+)_([^_]+)__(.+?)__END_CUSTOM_HIGHLIGHT_\1__/g;
        
        return html.replace(placeholderRegex, (match, index, color, content) => {
            return `<span class="highlight-${color} custom-highlight">${content}</span>`;
        });
    }

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

    toggleShowBlocked() {
        this.showBlockedOnly = !this.showBlockedOnly;
        this.updateShowBlockedButton();
    }

    // OPTIMIZED: Better re-highlighting that preserves syntax highlighting when possible
    reHighlightCodeBlocks(forceRebuildSyntax = false) {
        console.log('FancyTracker: Re-highlighting all code blocks, force rebuild syntax:', forceRebuildSyntax);
        console.log('FancyTracker: Current highlight rules:', this.storage.highlightRules);
        console.log('FancyTracker: Syntax highlighting enabled:', this.storage.syntaxHighlightEnabled);
        
        document.querySelectorAll('.code-block').forEach((codeBlock, index) => {
            const originalText = codeBlock.getAttribute('data-original-text');
            if (originalText) {
                console.log(`FancyTracker: Re-highlighting code block ${index + 1}`);
                const wasExpanded = !codeBlock.classList.contains('truncated');
                
                let displayCode = originalText;
                if (this.storage.prettifyEnabled) {
                    displayCode = this.prettifyJavaScript(originalText);
                }
                
                if (forceRebuildSyntax) {
                    // Full rebuild needed (syntax highlighting settings changed)
                    console.log('FancyTracker: Full rebuild - clearing existing highlighting');
                    codeBlock.className = codeBlock.className.replace(/hljs[^\s]*/g, '').trim();
                    this.applyAllHighlighting(codeBlock, displayCode);
                } else {
                    // Only custom highlighting changed - preserve syntax highlighting
                    console.log('FancyTracker: Optimized rebuild - preserving syntax highlighting');
                    this.updateCustomHighlightingOnly(codeBlock, displayCode);
                }
                
                // Apply font size and truncation
                codeBlock.style.fontSize = `${this.storage.codeFontSize}px`;
                
                if (this.shouldTruncateCode(originalText, displayCode)) {
                    codeBlock.classList.toggle('truncated', !wasExpanded);
                    this.addExpandFunctionality(codeBlock);
                }
            }
        });
        
        console.log('FancyTracker: Re-highlighting complete');
    }

    // NEW METHOD: Update only custom highlighting without affecting syntax highlighting
    updateCustomHighlightingOnly(codeBlock, displayCode) {
        const hasCustomRules = this.storage.highlightRules && Object.keys(this.storage.highlightRules).length > 0;
        const hasSyntaxHighlighting = this.storage.syntaxHighlightEnabled && this.highlightJsAvailable;
        
        // Remove existing custom highlights while preserving syntax highlighting
        this.removeExistingCustomHighlights(codeBlock);
        
        if (!hasCustomRules) {
            // No custom rules, we're done (syntax highlighting is preserved)
            console.log('FancyTracker: No custom rules, keeping existing content');
            return;
        }
        
        if (hasSyntaxHighlighting && this.hasExistingSyntaxHighlighting(codeBlock)) {
            // Apply custom highlighting on top of existing syntax highlighting
            console.log('FancyTracker: Applying custom highlighting on existing syntax highlighting');
            const currentHtml = codeBlock.innerHTML;
            const withCustomHighlighting = this.applyCustomHighlightingOnExistingHtml(currentHtml, this.storage.highlightRules);
            codeBlock.innerHTML = withCustomHighlighting;
        } else {
            // No existing syntax highlighting, apply custom highlighting on plain text
            console.log('FancyTracker: Applying custom highlighting on plain text');
            codeBlock.innerHTML = this.applyHighlighting(displayCode, this.storage.highlightRules);
        }
    }

    // Remove existing custom highlights while preserving other HTML
    removeExistingCustomHighlights(codeBlock) {
        // Find all existing custom highlight spans and unwrap them
        const customHighlights = codeBlock.querySelectorAll('.custom-highlight');
        customHighlights.forEach(span => {
            // Move the span's contents to its parent and remove the span
            while (span.firstChild) {
                span.parentNode.insertBefore(span.firstChild, span);
            }
            span.parentNode.removeChild(span);
        });
    }

    // Check if the code block has existing syntax highlighting
    hasExistingSyntaxHighlighting(codeBlock) {
        return codeBlock.querySelector('.hljs-keyword, .hljs-string, .hljs-number, .hljs-comment') !== null;
    }

    // Apply custom highlighting on existing HTML (better approach that finds specific terms)
    applyCustomHighlightingOnExistingHtml(htmlContent, rules) {
        if (!rules || Object.keys(rules).length === 0) {
            return htmlContent;
        }
        
        console.log('FancyTracker: Applying custom highlighting on existing HTML');
        
        // Get the plain text to find matches
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';
        
        // Collect all terms with their colors
        const allTerms = [];
        for (const [color, terms] of Object.entries(rules)) {
            for (const term of terms) {
                if (term && term.trim()) {
                    allTerms.push({ term: term.trim(), color });
                }
            }
        }
        
        // Sort by length (longest first) to avoid partial matches
        allTerms.sort((a, b) => b.term.length - a.term.length);
        
        if (allTerms.length === 0) {
            return htmlContent;
        }
        
        let result = htmlContent;
        
        // For each term that exists in the plain text, apply highlighting
        allTerms.forEach((item) => {
            const term = item.term;
            const color = item.color;
            const escapedTerm = this.escapeRegex(term);
            const plainTextRegex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
            
            if (plainTextRegex.test(plainText)) {
                console.log(`FancyTracker: Highlighting term "${term}" in existing HTML`);
                
                // Use a more sophisticated approach for existing HTML
                result = this.wrapTermInExistingHtml(result, term, color);
            }
        });
        
        return result;
    }

    // Wrap a specific term in existing HTML with highlight spans
    wrapTermInExistingHtml(htmlContent, term, color) {
        // Strategy: Use a placeholder approach on the existing HTML
        const placeholder = `___TEMP_HIGHLIGHT_${color}___`;
        const endPlaceholder = `___END_TEMP_HIGHLIGHT_${color}___`;
        
        // First, try simple term replacement
        const escapedTerm = this.escapeRegex(term);
        const simpleRegex = new RegExp(`\\b(${escapedTerm})\\b`, 'gi');
        
        // Replace in text content while preserving HTML structure
        let result = htmlContent;
        
        // Split HTML into segments and only process text segments
        const segments = result.split(/(<[^>]+>)/);
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            
            // Only process text segments (not HTML tags)
            if (!segment.startsWith('<') && segment.trim() !== '') {
                // Apply highlighting to this text segment
                segments[i] = segment.replace(simpleRegex, `${placeholder}$1${endPlaceholder}`);
            }
        }
        
        result = segments.join('');
        
        // Convert placeholders to actual highlight spans
        const finalRegex = new RegExp(`${this.escapeRegex(placeholder)}(.*?)${this.escapeRegex(endPlaceholder)}`, 'gi');
        result = result.replace(finalRegex, `<span class="highlight-${color} custom-highlight">$1</span>`);
        
        return result;
    }

    displayListeners(listeners, currentUrl, onRefresh, preserveScroll = false) {
        try {
            requestAnimationFrame(() => {
                let savedScrollTop = 0;
                const contentElement = document.querySelector('.content');
                if (preserveScroll && contentElement) {
                    savedScrollTop = contentElement.scrollTop;
                }

                const headerElement = document.getElementById('h');
                if (headerElement) {
                    headerElement.textContent = this.formatUrl(currentUrl);
                }

                let filteredListeners = listeners;
                if (listeners) {
                    if (this.showBlockedOnly) {
                        filteredListeners = listeners.filter(listener => this.storage.isListenerBlocked(listener));
                    } else {
                        filteredListeners = listeners.filter(listener => !this.storage.isListenerBlocked(listener));
                    }
                }

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

                const container = document.getElementById('x');
                if (!container) return;
                
                container.innerHTML = '';

                if (filteredListeners && filteredListeners.length > 0) {
                    const fragment = document.createDocumentFragment();
                    
                    for(let i = 0; i < filteredListeners.length; i++) {
                        const listener = filteredListeners[i];
                        const listenerElement = this.createListenerElement(listener, i + 1, onRefresh);
                        fragment.appendChild(listenerElement);
                    }
                    
                    container.appendChild(fragment);
                } else {
                    const emptyState = document.createElement('div');
                    emptyState.className = 'empty-state';
                    
                    if (this.showBlockedOnly) {
                        emptyState.innerHTML = `
                            <div class="empty-title">No blocked listeners</div>
                            <div class="empty-description">
                                You haven't blocked any listeners yet. 
                                Block unwanted listeners to see them here.
                            </div>
                        `;
                    } else {
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

                if (preserveScroll && contentElement && savedScrollTop > 0) {
                    setTimeout(() => {
                        contentElement.scrollTop = savedScrollTop;
                    }, 0);
                }
            });
        } catch (error) {
            console.error('FancyTracker: Error building listener list:', error);
        }
    }
}