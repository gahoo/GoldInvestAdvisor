/**
 * 计算简单移动平均线 (SMA)
 */
export function calculateSMA(data, period, key = 'close') {
  if (data.length < period) return null;
  const slice = data.slice(data.length - period);
  const sum = slice.reduce((acc, val) => acc + val[key], 0);
  return sum / period;
}

/**
 * 计算真实波动幅度 (ATR)
 */
export function calculateATR(data, period = 14) {
  if (data.length <= period) return null;
  
  let trSum = 0;
  // 计算过去 period 天的 TR
  for (let i = data.length - period; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i-1].close;
    
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    
    const tr = Math.max(tr1, tr2, tr3);
    trSum += tr;
  }
  
  return trSum / period;
}

/**
 * 计算乖离率 (BIAS)
 */
export function calculateBIAS(currentPrice, maPrice) {
  if (!maPrice) return null;
  return (currentPrice - maPrice) / maPrice;
}

/**
 * 计算相对强弱指数 (RSI)
 */
export function calculateRSI(data, period = 14, key = 'close') {
  if (data.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i][key] - data[i - 1][key];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change; // 取绝对值
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * 计算斐波那契回调线 (Fibonacci)
 * 寻找近期的高点和低点
 */
export function calculateFibonacci(data, period = 60) {
  if (data.length < 2) return null;
  
  const slice = data.slice(Math.max(0, data.length - period));
  let high = -Infinity;
  let low = Infinity;
  let highIdx = -1;
  let lowIdx = -1;
  
  slice.forEach((d, i) => {
    if (d.high > high) { high = d.high; highIdx = i; }
    if (d.low < low) { low = d.low; lowIdx = i; }
  });
  
  // 判断是上涨趋势回调还是下跌趋势反弹
  const isUptrend = highIdx > lowIdx;
  const diff = high - low;
  
  return {
    high,
    low,
    isUptrend,
    level382: isUptrend ? high - diff * 0.382 : low + diff * 0.382,
    level500: isUptrend ? high - diff * 0.5 : low + diff * 0.5,
    level618: isUptrend ? high - diff * 0.618 : low + diff * 0.618,
  };
}

/**
 * 计算日历效应 (各星期收益率或平均价格)
 */
export function calculateCalendarEffect(data) {
  if (!data || data.length < 10) return null;
  const wdayStats = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  
  for (let i = 1; i < data.length; i++) {
    const d = data[i];
    const prev = data[i-1];
    if (d.wday >= 1 && d.wday <= 5) {
      const returnRate = (d.close - prev.close) / prev.close;
      wdayStats[d.wday].push(returnRate);
    }
  }
  
  const result = {};
  let bestBuyDay = 1;
  let minReturn = Infinity;
  
  [1, 2, 3, 4, 5].forEach(day => {
    if (wdayStats[day].length > 0) {
      const avg = wdayStats[day].reduce((a, b) => a + b, 0) / wdayStats[day].length;
      result[day] = avg;
      // 收益率最低的一天最适合左侧定投买入
      if (avg < minReturn) {
        minReturn = avg;
        bestBuyDay = day;
      }
    }
  });
  
  return {
    averages: result,
    bestBuyDay, // 1=Mon, 2=Tue, etc.
  };
}

/**
 * 计算历史周内最大回撤预估
 * 取历史所有周的 (周低点 - 周一收盘) / 周一收盘 的中位数
 */
export function calculateWeeklyDrawdown(data) {
  if (!data || data.length < 10) return 0;
  const drawdowns = [];
  let currentMondayClose = null;
  let currentWeekLow = Infinity;
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    
    // 假设 wday=1 是周一
    if (d.wday === 1) {
      if (currentMondayClose !== null && currentWeekLow !== Infinity) {
        drawdowns.push((currentWeekLow - currentMondayClose) / currentMondayClose);
      }
      currentMondayClose = d.close;
      currentWeekLow = d.low;
    } else {
      if (d.low < currentWeekLow) currentWeekLow = d.low;
      // 周五结束
      if (d.wday === 5 || d.wday === 7) {
        if (currentMondayClose !== null && currentWeekLow !== Infinity) {
          drawdowns.push((currentWeekLow - currentMondayClose) / currentMondayClose);
          currentMondayClose = null;
          currentWeekLow = Infinity;
        }
      }
    }
  }
  
  if (drawdowns.length === 0) return 0;
  drawdowns.sort((a, b) => a - b);
  // 返回中位数（典型回撤）
  return drawdowns[Math.floor(drawdowns.length / 2)];
}

/**
 * 汇总计算当前所有指标
 */
export function calculateAllIndicators(data) {
  if (!data || data.length === 0) return null;
  
  const current = data[data.length - 1];
  const currentPrice = current.close;
  
  const ma20 = calculateSMA(data, 20);
  const ma60 = calculateSMA(data, 60);
  const atr14 = calculateATR(data, 14);
  const bias60 = calculateBIAS(currentPrice, ma60);
  const rsi14 = calculateRSI(data, 14);
  const fib = calculateFibonacci(data, 60);
  const calendar = calculateCalendarEffect(data);
  const drawdown = calculateWeeklyDrawdown(data);
  
  // 预估周 ATR (日 ATR * sqrt(5))
  const weeklyAtr = atr14 ? atr14 * Math.sqrt(5) : 0;
  
  return {
    currentPrice,
    ma20,
    ma60,
    atr: atr14,
    weeklyAtr,
    bias: bias60,
    rsi: rsi14,
    fib,
    calendar,
    drawdown,
  };
}
