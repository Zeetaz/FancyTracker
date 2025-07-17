// Bridge Content Script - Handles communication between MAIN world and background
if (typeof window.FancyTrackerBridgeLoaded === 'undefined') {
    window.FancyTrackerBridgeLoaded = true;

    (function() {
        'use strict';
        
        // Safe message sending
        function sendMessageSafely(message) {
            if (!chrome.runtime || !chrome.runtime.id) return;
            
            try {
                chrome.runtime.sendMessage(message, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('FancyTracker: Bridge runtime error:', chrome.runtime.lastError.message);
                    }
                });
            } catch (error) {
                console.error('FancyTracker: Bridge exception:', error);
            }
        }

        // Listen for messages from the MAIN world content script
        window.addEventListener('message', function(event) {
            if (event.source === window && 
                event.data && 
                event.data.type === 'POSTMESSAGE_TRACKER_DATA') {
                
                sendMessageSafely(event.data.detail);
            }
        });

        // Track page changes
        window.addEventListener('beforeunload', function() {
            sendMessageSafely({changePage: true});
        });
        
        console.log('FancyTracker: Bridge initialized');
    })();
}