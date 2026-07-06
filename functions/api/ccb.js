export async function onRequest() {
  // Cloudflare Pages Function Proxy for CCB Gold Price API
  // This will handle CORS and clean up the dirty JSON format returned by the bank
  
  // 生成过去 365 天的日期字符串，例如: 2024-01-01;2024-01-02;...
  const dates = [];
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 补偿 UTC 时差
  for (let i = 0; i < 365; i++) {
    const d = new Date(beijingTime.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split('T')[0]);
  }
  const dateRange = dates.join(';') + ';';
  
  const targetUrl = `https://yunchong.ccb.com/mbsmt/ccbmb/MBService?TXCODE=JSH015&imgCode=060003&bondType=1&days=${dateRange}`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
  
  try {
    const response = await fetch(targetUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }
    
    let text = await response.text();
    
    // Clean up dirty JSON (replace single quotes with double quotes)
    text = text.replace(/'/g, '"');
    
    // Optional: Extract just the fieldList we need
    const data = JSON.parse(text);
    const fieldList = data.response?.fieldList || [];
    
    if (!fieldList || fieldList.length === 0) {
      throw new Error('Upstream returned empty data');
    }
    
    return new Response(JSON.stringify({ success: true, data: fieldList }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600' // 缓存1小时
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } finally {
    clearTimeout(timeout);
  }
}
