export async function onRequest({ request }) {
  // 通用 Yahoo Finance 数据代理接口
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');
  const range = url.searchParams.get('range') || '10y';
  const interval = url.searchParams.get('interval') || '1d';
  
  if (!symbol) {
    return new Response(JSON.stringify({ success: false, error: 'Missing symbol parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    // Yahoo 的 query2 或 query1 均可
    let yahooUrl;
    if (range === 'max') {
      yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&period1=0&period2=2000000000`;
    } else {
      yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    }
    
    const res = await fetch(yahooUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) {
      throw new Error(`Yahoo API responded with status: ${res.status}`);
    }
    
    const data = await res.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      throw new Error('No data found for this symbol');
    }
    
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];
    
    const history = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const volume = volumes[i];
      
      // 过滤无效数据
      if (close === null || !Number.isFinite(close)) continue;
      
      // 解析日期
      const d = new Date(timestamp * 1000);
      const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      
      history.push({
        date: dateStr,
        open,
        high,
        low,
        close,
        volume
      });
    }
    const name = result.meta?.shortName || result.meta?.longName || symbol;

    return new Response(JSON.stringify({ success: true, name, data: history }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600' // HTTP 层面缓存 1 小时
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
