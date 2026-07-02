export async function onRequest(context) {
  // 代理请求 Yahoo Finance 的宏观数据 (DXY 美元指数, ^TNX 美国十年期国债收益率)
  
  try {
    const fetchYahoo = async (symbol) => {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await res.json();
      const result = data.chart?.result?.[0];
      if (!result) return null;
      
      const price = result.meta?.regularMarketPrice;
      const prev = result.meta?.chartPreviousClose;
      const change = price - prev;
      const changePercent = (change / prev) * 100;
      
      return { price, change, changePercent };
    };

    const [dxy, tnx] = await Promise.all([
      fetchYahoo('DX-Y.NYB'),
      fetchYahoo('^TNX')
    ]);

    return new Response(JSON.stringify({ success: true, data: { dxy, tnx } }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
