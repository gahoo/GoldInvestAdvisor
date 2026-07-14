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
  if (!data || data.length < period + 1) return null;

  const trs = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }

  // 计算简单的移动平均 ATR
  let sum = 0;
  for (let i = trs.length - period; i < trs.length; i++) {
    sum += trs[i];
  }
  return sum / period;
}

/**
 * 合成真实的周 K 线，并计算真实的周 ATR
 */
export function calculateWeeklyATR(data, period = 4) {
  if (!data || data.length < period * 5) return 0;
  
  const weeklyCandles = [];
  let currentWeek = { high: -Infinity, low: Infinity, close: null };
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    
    // 如果是一周的开始 (周一) 或者是数组的第一个元素
    if (d.wday === 1 || i === 0 || d.wday < data[i-1].wday) {
      if (i !== 0) {
        weeklyCandles.push({ ...currentWeek });
      }
      currentWeek = { high: d.high, low: d.low, close: d.close, wday: d.wday };
    } else {
      currentWeek.high = Math.max(currentWeek.high, d.high);
      currentWeek.low = Math.min(currentWeek.low, d.low);
      currentWeek.close = d.close; // 不断更新为这周最后一天的收盘价
      currentWeek.wday = d.wday;
    }
  }
  // push the last week, 排除当前未完成周 (如果还没到周五，则不计入 ATR 计算，防止拉低真实波动率)
  if (currentWeek.wday >= 5 || weeklyCandles.length < period) {
    weeklyCandles.push({ ...currentWeek });
  }
  
  return calculateATR(weeklyCandles, Math.min(period, weeklyCandles.length - 1)) || 0;
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
 * 计算历史典型周内回撤预估
 * 取过去 52 周的 (周低点 - 周一收盘) / 周一收盘 的中位数
 */
export function calculateWeeklyDrawdown(data) {
  if (!data || data.length < 10) return 0;
  
  // 仅取过去 52 周（约 260 个交易日）的数据计算回撤
  const slice = data.slice(Math.max(0, data.length - 260));
  
  const drawdowns = [];
  let currentMondayClose = null;
  let currentWeekLow = Infinity;
  
  for (let i = 0; i < slice.length; i++) {
    const d = slice[i];
    
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
 * 计算所有支持的指标
 */
export function calculateAllIndicators(data, options = {}) {
  const atrPeriod = options.atrPeriod || 14;

  if (!data || data.length < 60) return null;
  
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
  
  // 真实的周 ATR
  const weeklyAtr = calculateWeeklyATR(data, atrPeriod);
  
  // 计算本周的基准价格 (用于历史回撤策略)
  let thisWeekMondayClose = null;
  let lastFridayClose = null;
  
  const lookbackLimit = Math.max(0, data.length - 7);
  for (let i = data.length - 1; i >= lookbackLimit; i--) {
    const d = data[i];
    // 假设这是过去一两周内寻找
    if (d.wday === 1 && !thisWeekMondayClose) {
      thisWeekMondayClose = d.close;
    }
    // 只要找到最近的周五收盘价即可，不需要必须在本周一前被找到。如果遇到长假没有本周一，这里的兜底才会生效
    if (d.wday === 5 && !lastFridayClose) { 
      lastFridayClose = d.close;
    }
    if (thisWeekMondayClose && lastFridayClose) break;
  }
  
  const currentWday = data[data.length - 1].wday;
  let referencePrice = currentPrice; // 次选：当前实时现价 (周一盘中)
  
  if (currentWday !== 1 && thisWeekMondayClose) {
    referencePrice = thisWeekMondayClose; // 首选：本周一收盘价
  } else if (currentWday === 1) {
    referencePrice = currentPrice;
  } else if (!thisWeekMondayClose && lastFridayClose) {
    referencePrice = lastFridayClose; // 兜底：上周五收盘价
  }
  
  return {
    currentPrice,
    referencePrice,
    currentWday,
    ma20,
    ma60,
    atr: atr14,
    weeklyAtr,
    bias: bias60,
    rsi: rsi14,
    fib,
    calendar,
    drawdown,
    chartData: data, // 移除数量限制，全量传递，由视图层进行动态裁剪
  };
}
