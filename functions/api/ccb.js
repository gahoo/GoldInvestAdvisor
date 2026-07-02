export async function onRequest(context) {
  // Cloudflare Pages Function Proxy for CCB Gold Price API
  // This will handle CORS and clean up the dirty JSON format returned by the bank
  
  // 生成过去 365 天的日期字符串，例如: 2024-01-01;2024-01-02;...
  const dates = [];
  const now = new Date();
  for (let i = 1; i <= 365; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split('T')[0]);
  }
  const dateRange = dates.join(';') + ';';
  
  const targetUrl = `http://yunchong.ccb.com/mbsmt/ccbmb/MBService?TXCODE=JSH015&imgCode=060003&bondType=1&days=${dateRange}`;
  
  try {
    const response = await fetch(targetUrl);
    let text = await response.text();
    
    // Clean up dirty JSON (replace single quotes with double quotes)
    text = text.replace(/'/g, '"');
    
    // Optional: Extract just the fieldList we need
    const data = JSON.parse(text);
    const fieldList = data.response?.fieldList || [];
    
    return new Response(JSON.stringify({ success: true, data: fieldList }), {
      headers: {
        'Content-Type': 'application/json',
        // Allow CORS for local development
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
