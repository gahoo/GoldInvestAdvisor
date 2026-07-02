/**
 * 生成高质量的模拟 K 线数据 (近 70 个交易日)
 * 包含 OHLC (开盘、最高、最低、收盘) 以及对应的日期
 */
export function generateMockData() {
  const data = [];
  let currentPrice = 520; // 初始基准价
  let currentDate = new Date();
  
  // 回溯 70 天，避开周末
  for (let i = 0; i < 70; i++) {
    // 简单的随机游走，带有微小的向上趋势
    const trend = 0.1;
    const volatility = 4;
    const change = (Math.random() - 0.5) * volatility * 2 + trend;
    
    const open = currentPrice;
    const close = currentPrice + change;
    
    // 生成合理的高低点
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    
    // 日期处理
    let dateStr = currentDate.toISOString().split('T')[0];
    const wday = currentDate.getDay();
    
    // 将生成的数据推入数组头部 (使得最旧的数据在最前面)
    data.unshift({
      date: dateStr,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 10000) + 5000,
      wday: wday === 0 ? 7 : wday, // 1-7
    });
    
    // 更新上一天的收盘价
    currentPrice = close;
    
    // 往前推一天
    currentDate.setDate(currentDate.getDate() - 1);
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate.setDate(currentDate.getDate() - 1);
    }
  }
  
  // 人为制造一个最近的回调，用于演示不同的 BIAS 和 RSI 状态
  const lastIdx = data.length - 1;
  data[lastIdx].close -= 8; 
  data[lastIdx].low -= 10;
  
  return data;
}
