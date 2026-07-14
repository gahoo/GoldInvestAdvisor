export async function onRequest({ request }) {
  // 通用天天基金 (东方财富) 历史净值代理接口
  const url = new URL(request.url);
  let symbol = url.searchParams.get('symbol'); // 六位基金代码
  if (symbol) {
    symbol = symbol.replace(/\D/g, ''); // 移除非数字字符，防止带有 .SS 等后缀
  }
  const pageSize = url.searchParams.get('pageSize') || '20000'; // 足够大以一次性获取历史，或者按需分页
  
  if (!symbol || symbol.length !== 6) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid fund symbol, must be 6 digits' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const fundUrl = `http://fund.eastmoney.com/pingzhongdata/${symbol}.js`;
    
    const res = await fetch(fundUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) {
      throw new Error(`EastMoney API responded with status: ${res.status}`);
    }
    
    const text = await res.text();
    
    const match = text.match(/var Data_netWorthTrend = (\[.*?\]);/);
    if (!match) {
      throw new Error(`EastMoney API Error: Cannot find Data_netWorthTrend. Raw data: ${text.substring(0, 200)}`);
    }
    
    let dataList;
    try {
      dataList = JSON.parse(match[1]);
    } catch(e) {
      throw new Error(`Failed to parse json array. Raw text: ${match[1].substring(0,100)}`);
    }
    
    const nameMatch = text.match(/var fS_name = "(.*?)";/);
    const name = nameMatch ? nameMatch[1] : symbol;

    const history = [];
    
    for (let i = 0; i < dataList.length; i++) {
      const item = dataList[i];
      if (!item || item.x == null || item.y == null) continue;
      
      // item.x is millisecond timestamp in UTC+8 usually, but Date parsing works fine
      // Since it's midnight Beijing time, creating a local date object and formatting it is safer.
      // But we can just use new Date(item.x) and format it. Note: Cloudflare runs in UTC!
      // To ensure correct date string, we add 8 hours (28800000 ms) before using toISOString
      const dateStr = new Date(item.x + 28800000).toISOString().split('T')[0];
      const nav = parseFloat(item.y);
      
      if (isNaN(nav)) continue;
      
      history.push({
        date: dateStr,
        close: nav 
      });
    }

    return new Response(JSON.stringify({ success: true, name, data: history }), {
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
