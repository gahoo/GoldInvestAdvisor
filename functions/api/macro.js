export async function onRequest() {
  // 代理请求 Yahoo Finance 的宏观数据 (DXY 美元指数, ^TNX 美国十年期国债收益率)
  
  try {
    const fetchYahoo = async (symbol) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal
        });
        
        if (!res.ok) return null;
        
        const data = await res.json();
        const result = data.chart?.result?.[0];
        if (!result) return null;
        
        const price = result.meta?.regularMarketPrice;
        const prev = result.meta?.chartPreviousClose;
        if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;
        
        const change = price - prev;
        const changePercent = (change / prev) * 100;
        
        return { price, change, changePercent };
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
