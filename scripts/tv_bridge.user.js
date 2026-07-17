// ==UserScript==
// @name         TradingView Options Data Bridge
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Allows local development environment to fetch TradingView options data securely, bypassing CORS and TLS fingerprinting issues.
// @author       You
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      scanner.tradingview.com
// ==/UserScript==

(function() {
    'use strict';

    console.log('[TV Bridge] Injecting TradingView Options Fetch Bridge...');

    // 将抓取方法暴露给前端的真实 window 对象 (unsafeWindow)
    unsafeWindow.GM_fetchTradingViewOptions = function(url, payloadString) {
        return new Promise((resolve, reject) => {
            console.log('[TV Bridge] Sending request to:', url);
            
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                data: payloadString,
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                // 默认情况下 GM_xmlhttpRequest 会携带目标域的 Cookie，这正是我们需要的
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const json = JSON.parse(response.responseText);
                            console.log('[TV Bridge] Fetch Success!');
                            resolve(json);
                        } catch (e) {
                            console.error('[TV Bridge] Failed to parse JSON:', e);
                            reject(new Error('Invalid JSON response from TradingView'));
                        }
                    } else {
                        console.error('[TV Bridge] HTTP Error:', response.status, response.statusText);
                        reject(new Error(`TradingView HTTP Error ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: function(error) {
                    console.error('[TV Bridge] Network Error:', error);
                    reject(new Error('Network error or CORS issue blocked by Tampermonkey'));
                },
                ontimeout: function() {
                    console.error('[TV Bridge] Request Timeout');
                    reject(new Error('Request to TradingView timed out'));
                }
            });
        });
    };
    
    console.log('[TV Bridge] Ready! unsafeWindow.GM_fetchTradingViewOptions is now available.');
})();
