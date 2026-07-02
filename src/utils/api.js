
/**
 * 从 API 获取历史黄金 K 线数据
 * 生产环境下，请求通过 Cloudflare Functions 代理 (/api/ccb)
 */
export async function fetchGoldData() {
  try {
    // 优先尝试调用我们自己的代理 API
    const response = await fetch('/api/ccb');
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data && result.data.length > 0) {
      return formatCCBData(result.data);
    } else {
      throw new Error('获取不到有效的黄金数据。请检查网络或稍后重试。');
    }
  } catch (error) {
    console.error('API Error:', error);
    throw new Error('数据接口加载失败，请检查网络或重新刷新页面。');
  }
}

/**
 * 清洗和格式化建行 API 返回的数据
 */
function formatCCBData(fieldList) {
  // 建行数据可能是按倒序排列的，且属性名需要映射
  // 假设格式为 { date: "2024-01-01", open: "500.1", close: "502.2", high: "505", low: "499" }
  
  const formattedData = fieldList.map(item => {
    const d = new Date(item.date);
    const wday = d.getDay();
    return {
      date: item.date,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      wday: wday === 0 ? 7 : wday,
    };
  });
  
  
  // 确保数据按日期从旧到新排序
  formattedData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return formattedData;
}

/**
 * 从 API 获取宏观因子数据 (DXY 和 US10Y)
 */
export async function fetchMacroData() {
  try {
    const response = await fetch('/api/macro');
    if (!response.ok) throw new Error('Macro API error');
    const result = await response.json();
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch macro data', error);
    return null;
  }
}
