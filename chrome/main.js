// Main World Content Script - Enhanced PostMessage Tracker
(function() {
    'use strict';
    
    var loaded = false;
    var originalFunctionToString = Function.prototype.toString;
    
    // Store original APIs
    var originalAddEventListener = Window.prototype.addEventListener;
    var originalPushState = History.prototype.pushState;
    var originalMessagePortAddEventListener = MessagePort.prototype.addEventListener;
    
    // Extension identifier for our own listeners
    var EXTENSION_MARKER = '__FANCYTRACKER_INTERNAL__';
    
    // Extension blacklist - known extension patterns
    var extension_blacklist = [
        'wappalyzer',
        'react-devtools',
        'vue-devtools',
        'domlogger',
        'bitwarden-webauthn',
        'POSTMESSAGE_TRACKER_DATA',
        'FancyTracker:',
        '__postmessagetrackername__'
    ];
    
    // Check if listener or stack contains extension patterns
    function isFromExtension(listener, stack) {
        try {
            var listenerStr = listener.toString();
            var stackStr = stack || '';
            var combined = listenerStr + ' ' + stackStr;
            
            for (var i = 0; i < extension_blacklist.length; i++) {
                if (combined.includes(extension_blacklist[i])) {
                    return true;
                }
            }
        } catch(e) {
            // Ignore
        }
        return false;
    }
    // Check if the message contains data from ignored extensions
    function isFromIgnoredExtension(data) {
        if (!data) return false;

        // Skip our own tracking messages
        if (data.type === 'POSTMESSAGE_TRACKER_DATA') {
            return true;
        }

        if (typeof data === 'object') {
            if (typeof data.ext === 'string') {
                var extLower = data.ext.toLowerCase();
                // Check against all items in extension_blacklist
                for (var i = 0; i < extension_blacklist.length; i++) {
                    if (extLower.includes(extension_blacklist[i].toLowerCase())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    // Send message to bridge
    var m = function(detail) {
        window.postMessage({
            type: 'POSTMESSAGE_TRACKER_DATA',
            detail: detail
        }, '*');
    };
    
    // Get frame hops info
    var h = function(p) {
        var hops = "";
        try {
            if (!p) p = window;
            if (p.top != p && p.top == window.top) {
                var w = p;
                while (top != w) { 
                    var x = 0; 
                    for (var i = 0; i < w.parent.frames.length; i++) { 
                        if (w == w.parent.frames[i]) x = i; 
                    }
                    hops = "frames[" + x + "]" + (hops.length ? '.' : '') + hops; 
                    w = w.parent; 
                }
                hops = "top" + (hops.length ? '.' + hops : '');
            } else {
                hops = p.top == window.top ? "top" : "diffwin";
            }
        } catch(e) {
            hops = "unknown";
        }
        return hops;
    };
    
    // Handle jQuery listeners
    var jq = function(instance) {
        if (!instance || !instance.message || !instance.message.length) return;
        var j = 0; 
        var e;
        while (e = instance.message[j++]) {
            var listener = e.handler; 
            if (!listener) continue;
            
            // Check if this is from an extension
            if (isFromExtension(listener, '')) {
                continue;
            }
            
            m({
                window: window.top == window ? 'top' : window.name,
                hops: h(),
                domain: document.domain,
                stack: 'jQuery',
                listener: listener.toString()
            });
        }
    };
    
    // Log listener with stack trace
    var l = function(listener, pattern_before, additional_offset) {
        var offset = 3 + (additional_offset || 0);
        var stack, fullstack;
        try { 
            throw new Error(''); 
        } catch (error) { 
            stack = error.stack || ''; 
        }
        stack = stack.split('\n').map(function (line) { return line.trim(); });
        fullstack = stack.slice();
        
        // Check if this is from an extension using blacklist
        if (isFromExtension(listener, fullstack.join(' '))) {
            return; // Ignore extension listeners
        }
        
        if (pattern_before) {
            var nextitem = false;
            stack = stack.filter(function(e) {
                if (nextitem) { 
                    nextitem = false; 
                    return true; 
                }
                if (e.match && e.match(pattern_before)) {
                    nextitem = true;
                }
                return false;
            });
            stack = stack[0];
        } else {
            stack = stack[offset];
        }
        
        var listener_str = listener.__postmessagetrackername__ || listener.toString();
        m({
            window: window.top == window ? 'top' : window.name,
            hops: h(),
            domain: document.domain,
            stack: stack,
            fullstack: fullstack,
            listener: listener_str
        });
    };
    
    // Check jQuery instances
    var jqc = function(key) {
        if (typeof window[key] == 'function' && typeof window[key]._data == 'function') {
            var ev = window[key]._data(window, 'events');
            if (ev) jq(ev);
        } else if (window[key] && window[key].expando) {
            var expando = window[key].expando;
            var i = 1;
            var instance;
            while (instance = window[expando + i++]) {
                if (instance.events) jq(instance.events);
            }
        } else if (window[key] && window[key].events) {
            jq(window[key].events);
        }
    };
    
    // Find all jQuery instances
    var j = function() {
        var all = Object.getOwnPropertyNames(window);
        var len = all.length;
        for (var i = 0; i < len; i++) {
            var key = all[i];
            if (key.indexOf('jQuery') !== -1) {
                jqc(key);
            }
        }
        loaded = true;
    };
    
    // Hook History.pushState
    History.prototype.pushState = function(state, title, url) {
        m({pushState: true});
        return originalPushState.apply(this, arguments);
    };
    
    // Hook onmessage setter
    try {
        var original_setter = window.__lookupSetter__('onmessage');
        if (original_setter) {
            window.__defineSetter__('onmessage', function(listener) {
                if (listener && !isFromExtension(listener, '')) {
                    l(listener, null, 0);
                }
                original_setter(listener);
            });
        }
    } catch(e) {
        // Ignore if can't hook onmessage setter
    }
    
    // Wrapper detection function - enhanced from original
    var c = function(listener) {
        try {
            var listener_str = originalFunctionToString.apply(listener);
            
            // Enhanced wrapper detection
            if (listener_str.match(/\.deep.*apply.*captureException/s)) return 'raven';
            else if (listener_str.match(/arguments.*(start|typeof).*err.*finally.*end/s) && listener["nr@original"]) return 'newrelic';
            else if (listener_str.match(/rollbarContext.*rollbarWrappedError/s) && listener._isWrap) return 'rollbar';
            else if (listener_str.match(/autoNotify.*(unhandledException|notifyException)/s) && typeof listener.bugsnag == "function") return 'bugsnag';
            else if (listener_str.match(/call.*arguments.*typeof.*apply/s) && typeof listener.__sentry_original__ == "function") return 'sentry';
            else if (listener_str.match(/function.*function.*\.apply.*arguments/s) && typeof listener.__trace__ == "function") return 'bugsnag2';
            
            return false;
        } catch(error) {
            return false;
        }
    };

    // Console logging functions
    var onmsgport = function(e) {
        try {
            // Skip messages from ignored extensions
            if (isFromIgnoredExtension(e.data)) {
                return;
            }

            var p = (e.ports && e.ports.length ? '%cport' + e.ports.length + '%c ' : '');
            var msg = '%cport%c→%c' + h(e.source) + '%c ' + p + (typeof e.data == 'string' ? e.data : 'j ' + JSON.stringify(e.data));
            if (p.length) {
                console.log(msg, "color: blue", '', "color: red", '', "color: blue", '');
            } else {
                console.log(msg, "color: blue", '', "color: red", '');
            }
        } catch(error) {
            // Ignore console errors
        }
    };
    
    var onmsg = function(e) {
        try {
            // Skip messages from ignored extensions
            if (isFromIgnoredExtension(e.data)) {
                return;
            }
            
            var p = (e.ports && e.ports.length ? '%cport' + e.ports.length + '%c ' : '');
            var msg = '%c' + h(e.source) + '%c→%c' + h() + '%c ' + p + (typeof e.data == 'string' ? e.data : 'j ' + JSON.stringify(e.data));
            if (p.length) {
                console.log(msg, "color: red", '', "color: green", '', "color: blue", '');
            } else {
                console.log(msg, "color: red", '', "color: green", '');
            }
        } catch(error) {
            // Ignore console errors
        }
    };
    
    // Mark our own listeners
    onmsg[EXTENSION_MARKER] = true;
    onmsgport[EXTENSION_MARKER] = true;
    
    // Hook MessagePort
    MessagePort.prototype.addEventListener = function(type, listener, useCapture) {
        if (!this.__postmessagetrackername__) {
            this.__postmessagetrackername__ = true;
            onmsgport[EXTENSION_MARKER] = true;
            this.addEventListener('message', onmsgport);
        }
        return originalMessagePortAddEventListener.apply(this, arguments);
    };

    // Check if listener is our own extension
    function isExtensionListener(listener) {
        if (listener && listener[EXTENSION_MARKER]) return true;
        return isFromExtension(listener, '');
    }

    // Main hook - Window.addEventListener
    Window.prototype.addEventListener = function(type, listener, useCapture) {
        if (type == 'message') {
            // Skip our own extension listeners
            if (isExtensionListener(listener)) {
                return originalAddEventListener.apply(this, arguments);
            }
            
            var pattern_before = false, offset = 0;
            if (listener && listener.toString().indexOf('event.dispatch.apply') !== -1) {
                pattern_before = /init\.on|init\..*on\]/;
                if (loaded) { 
                    setTimeout(j, 100); 
                }
            }

            // Enhanced unwrap function
            var unwrap = function(listener) {
                var found = c(listener);
                if (found) {
                    m({log: 'Unwrapping ' + found + ' wrapper'});
                }
                
                if (found == 'raven') {
                    var ff = 0, f = null;
                    for (var key in listener) {
                        var v = listener[key];
                        if (typeof v == "function") { 
                            ff++; 
                            f = v; 
                        }
                    }
                    if (ff == 1 && f) {
                        offset++;
                        listener = unwrap(f);
                    }
                } else if (found == 'newrelic') {
                    offset++;
                    listener = unwrap(listener["nr@original"]);
                } else if (found == 'sentry') {
                    offset++;
                    listener = unwrap(listener["__sentry_original__"]);
                } else if (found == 'rollbar') {
                    offset += 2;
                    if (listener._wrapped) {
                        listener = unwrap(listener._wrapped);
                    } else if (listener._rollbar_wrapped) {
                        listener = unwrap(listener._rollbar_wrapped);
                    }
                } else if (found == 'bugsnag') {
                    offset++;
                    try { 
                        var clr = arguments.callee.caller.caller.caller; 
                        if (clr && !c(clr)) {
                            listener.__postmessagetrackername__ = clr.toString();
                        }
                    } catch(e) { 
                        // Ignore
                    }
                } else if (found == 'bugsnag2') {
                    offset++;
                    try { 
                        var clr = arguments.callee.caller.caller.arguments[1]; 
                        if (clr && !c(clr)) {
                            listener = unwrap(clr);
                            listener.__postmessagetrackername__ = clr.toString();
                        }
                    } catch(e) { 
                        // Ignore
                    }
                }
                
                if (listener && listener.name && listener.name.indexOf('bound ') === 0) {
                    listener.__postmessagetrackername__ = listener.name;
                }
                return listener;
            };

            if (typeof listener == "function") {
                listener = unwrap(listener);
                l(listener, pattern_before, offset);
            }
        }
        return originalAddEventListener.apply(this, arguments);
    };
    
    // Event listeners
    window.addEventListener('load', j);
    window.addEventListener('postMessageTrackerUpdate', j);
    
    // Add message logger
    onmsg[EXTENSION_MARKER] = true;
    window.addEventListener('message', onmsg);
    
    console.log('FancyTracker: Initialized in', h());
    
})();