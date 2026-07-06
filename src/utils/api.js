
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
  
  const formattedData = [];
  
  fieldList.forEach(item => {
    if (!item.date || !item.close) return;
    
    // 修复 1: 避免 new Date('YYYY-MM-DD') 按 UTC 0点解析导致东八区前移一天的问题
    // 将其拆解按本地时区构建 Date 对象
    const parts = item.date.split('-');
    if (parts.length !== 3) return;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    
    const wday = d.getDay() === 0 ? 7 : d.getDay();
    
    const open = parseFloat(item.open);
    const high = parseFloat(item.high);
    const low = parseFloat(item.low);
    const close = parseFloat(item.close);
    
    // 修复 2: 剔除脏数据 (NaN 或 逻辑错误)
    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) return;
    if (high < low || high < open || high < close || low > open || low > close) return;
    
    formattedData.push({
      date: item.date,
      open,
      high,
      low,
      close,
      wday,
    });
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

/**
 * 从 API 获取历史宏观因子数据
 * @param {string} range - 数据范围，默认 '10y'
 */
export async function fetchHistoricalMacroData(range = '10y') {
  try {
    const response = await fetch(`/api/macro?range=${range}`);
    if (!response.ok) throw new Error('Macro History API error');
    const result = await response.json();
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch historical macro data', error);
    return null;
  }
}

/**
 * 将历史宏观数据合并到黄金历史日线数据中 (Left Join + Forward Fill)
 * @param {Array} goldData - 格式化后的黄金历史数据数组
 * @param {Object} macroData - 包含 { dxy: [...], tnx: [...] } 的宏观历史数据对象
 */
export function mergeMacroIntoGoldData(goldData, macroData) {
  if (!macroData || !macroData.dxy || !macroData.tnx || !goldData || goldData.length === 0) {
    return goldData;
  }

  // 构建哈希表加速查找
  const dxyMap = {};
  const tnxMap = {};
  
  macroData.dxy.forEach(item => {
    dxyMap[item.date] = item;
  });
  macroData.tnx.forEach(item => {
    tnxMap[item.date] = item;
  });

  let lastDxy = null;
  let lastTnx = null;

  // 遍历黄金数据，由于 goldData 是按日期从旧到新排序的，我们可以进行向前填充
  const mergedData = goldData.map(item => {
    // 遇到新的宏观数据则更新，否则保持上一次的有效数据 (Forward Fill)
    if (dxyMap[item.date]) {
      lastDxy = dxyMap[item.date];
    }
    if (tnxMap[item.date]) {
      lastTnx = tnxMap[item.date];
    }

    return {
      ...item,
      macro: {
        dxy: lastDxy,
        tnx: lastTnx
      }
    };
  });

  return mergedData;
}
