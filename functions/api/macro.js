export async function onRequest({ request }) {
  // 代理请求 Yahoo Finance 的宏观数据 (DXY 美元指数, ^TNX 美国十年期国债收益率)
  
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '1d';
  const interval = url.searchParams.get('interval') || '1d';
  
  try {
    const fetchYahoo = async (symbol) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal
        });
        
        if (!res.ok) return null;
        
        const data = await res.json();
        const result = data.chart?.result?.[0];
        if (!result) return null;
        
        if (range === '1d') {
          const price = result.meta?.regularMarketPrice;
          const prev = result.meta?.chartPreviousClose;
          if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;
          
          const change = price - prev;
          const changePercent = (change / prev) * 100;
          
          return { price, change, changePercent };
        } else {
          // 处理历史数据阵列
          const timestamps = result.timestamp || [];
          const closes = result.indicators?.quote?.[0]?.close || [];
          
          if (timestamps.length === 0 || closes.length === 0) return null;
          
          const history = [];
          for (let i = 0; i < timestamps.length; i++) {
            const timestamp = timestamps[i];
            const close = closes[i];
            if (close === null || !Number.isFinite(close)) continue;
            
            // 修复：Yahoo 的时间戳是秒，直接按本地时区构建 YYYY-MM-DD 可能导致时区偏移，
            // 通常使用 UTC 日期或者根据需求格式化。为了保险，我们使用本地 Date，但忽略时分秒差异
            const d = new Date(timestamp * 1000);
            const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            
            let prevClose = close;
            if (history.length > 0) {
              prevClose = history[history.length - 1].close;
            }
            
            const change = close - prevClose;
            const changePercent = prevClose === 0 ? 0 : (change / prevClose) * 100;
            
            history.push({
              date: dateStr,
              close,
              changePercent
            });
          }
          return history;
        }
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    };

    const [dxy, tnx] = await Promise.all([
      fetchYahoo('DX-Y.NYB'),
      fetchYahoo('^TNX')
    ]);

    return new Response(JSON.stringify({ success: true, data: { dxy, tnx } }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
