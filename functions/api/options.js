export async function onRequest({ request }) {
  const url = new URL(request.url);
  // Default to GC=F (Gold Futures) or GLD
  const symbol = url.searchParams.get('symbol') || 'GC=F';

  try {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2 second strict timeout

    const baseApiUrl = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;

    // 1. Fetch the default options chain to get the list of expiration dates
    const res = await fetch(baseApiUrl, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) {
      throw new Error(`Yahoo Options API error: ${res.status}`);
    }
    
    const data = await res.json();
    const result = data.optionChain?.result?.[0];
    
    if (!result) {
      throw new Error('No options data found for symbol');
    }
    
    const expirationDates = result.expirationDates || [];
    // We'll analyze up to the first 2 expiration dates (near term) to find the Gamma wall, sequentially to avoid 429
    const targetExpirations = expirationDates.slice(0, 2);
    
    let allCalls = [];
    
    // Add the calls from the first request
    if (result.options && result.options.length > 0 && result.options[0].calls) {
      allCalls.push(...result.options[0].calls);
    }
    
    // Fetch the rest sequentially
    if (targetExpirations.length > 1) {
      for (const date of targetExpirations.slice(1)) {
        try {
          const r = await fetch(`${baseApiUrl}?date=${date}`, { headers: { 'User-Agent': userAgent } });
          if (!r.ok) continue;
          const json = await r.json();
          const repResult = json.optionChain?.result?.[0];
          if (repResult && repResult.options && repResult.options.length > 0 && repResult.options[0].calls) {
            allCalls.push(...repResult.options[0].calls);
          }
        } catch (e) {
          console.warn('Failed to fetch additional options date', date, e);
        }
      }
    }
    
    // Aggregate Open Interest by Strike
    const oiByStrike = {};
    for (const call of allCalls) {
      const strike = call.strike;
      const oi = call.openInterest || 0;
      if (!oiByStrike[strike]) {
        oiByStrike[strike] = 0;
      }
      oiByStrike[strike] += oi;
    }
    
    // Sort to find the highest Open Interest strikes
    const sortedStrikes = Object.keys(oiByStrike)
      .map(strike => ({
        strike: parseFloat(strike),
        openInterest: oiByStrike[strike]
      }))
      .sort((a, b) => b.openInterest - a.openInterest);
      
    // Return the top 10 strikes to identify the Gamma Wall range
    const topStrikes = sortedStrikes.slice(0, 10);
    
    // Calculate Put/Call ratio for sentiment (optional, here we mainly focus on Call OI for Gamma Wall)
    // For a complete sentiment, we would also aggregate Puts. For simplicity, we just return the Call walls.

    return new Response(JSON.stringify({ 
      success: true, 
      symbol: symbol,
      gammaWalls: topStrikes,
      allAggregated: sortedStrikes.length
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    // Return 200 instead of 500 to avoid red console errors in the browser. 
    // The frontend gracefully degrades the UI when success is false.
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
