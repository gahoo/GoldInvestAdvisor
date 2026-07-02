import { calculateAllIndicators } from './indicators';
import { evaluateStrategy } from './strategies';
import { calculateXIRR, calculateSimpleAnnualized } from './math';

/**
 * 运行回测。
 * @param {Array} data - 历史 K 线数据
 * @param {string} strategy - 策略类型
 * @param {number} baseGrams - 基础定投克数
 * @param {Object} options
 * @param {string} options.returnMethod - 'xirr' | 'simple'
 * @param {string} options.buyMode - 'dynamic' | 'fixed'
 * @param {string} options.tradeFrequency - 'weekly' | 'biweekly' | 'monthly'
 * @param {number} options.atrPeriod - ATR 周期
 * @returns {Object} 回测结果统计
 */
export function runBacktest(data, strategy, baseGrams, options = {}) {
  const {
    returnMethod = 'xirr',
    buyMode = 'dynamic',
    tradeFrequency = 'weekly',
    atrPeriod = 14
  } = options;

  if (!data || data.length < 60) return null;

  // 宏观策略跳过回测（由于缺少历史宏观数据）
  if (strategy === 'macro') {
    return null;
  }

  let totalInvested = 0;
  let totalGrams = 0;
  const cashFlows = [];
  const trades = [];

  // 记录上一次交易的周标识，确保满足频率限制
  let lastTradeWeek = -Infinity;
  let lastTradeMonth = -Infinity;

  // 从第60天开始，让 MA60 和 Fib 指标有足够的数据
  const startIndex = 60;
  
  for (let i = startIndex; i < data.length; i++) {
    const currentData = data[i];

    // 获取当前日期的年、周标识
    const currentDateObj = new Date(currentData.date);
    // 简单的周标识：使用 1970 至今的天数除以 7
    // +4 是因为 1970-01-01 是周四，调整偏移量使得周一为每周起始
    const currentWeekId = Math.floor((Math.floor(currentDateObj.getTime() / 86400000) + 3) / 7);
    const currentMonthId = currentDateObj.getFullYear() * 12 + currentDateObj.getMonth();

    if (tradeFrequency === 'weekly' && currentWeekId <= lastTradeWeek) {
      continue;
    }
    if (tradeFrequency === 'biweekly' && currentWeekId < lastTradeWeek + 2) {
      continue;
    }
    if (tradeFrequency === 'monthly' && currentMonthId <= lastTradeMonth) {
      continue;
    }
    
    // 截取到当天的历史数据来计算指标
    const historySlice = data.slice(0, i + 1);
    const indicators = calculateAllIndicators(historySlice, { atrPeriod });
    
    if (!indicators) continue;

    const { targetPrice, multiplier } = evaluateStrategy(indicators, null, strategy, baseGrams);
    
    const gramsToBuy = buyMode === 'fixed' ? baseGrams : baseGrams * multiplier;

    if (gramsToBuy > 0) {
      // 撮合逻辑
      let executionPrice = null;
      if (currentData.open <= targetPrice) {
        // 大幅低开，按开盘价成交
        executionPrice = currentData.open;
      } else if (currentData.low <= targetPrice) {
        // 盘中触及，按挂单价成交
        executionPrice = targetPrice;
      }

      if (executionPrice !== null) {
        const cost = executionPrice * gramsToBuy;
        totalInvested += cost;
        totalGrams += gramsToBuy;
        
        const date = new Date(currentData.date);
        cashFlows.push({ date, amount: -cost }); // 现金流出（买入）
        
        trades.push({
          date: currentData.date,
          price: executionPrice,
          grams: gramsToBuy,
          cost: cost
        });

        lastTradeWeek = currentWeekId;
        lastTradeMonth = currentMonthId;
      }
    }
  }

  if (trades.length === 0) {
    return {
      totalInvested: 0,
      totalGrams: 0,
      finalValue: 0,
      absoluteReturn: 0,
      annualizedReturn: 0,
      tradeCount: 0,
      totalDays: 0,
      trades: []
    };
  }

  const finalDate = new Date(data[data.length - 1].date);
  const finalPrice = data[data.length - 1].close;
  const finalValue = totalGrams * finalPrice;
  
  // 期末作为最后一笔正现金流
  cashFlows.push({ date: finalDate, amount: finalValue });

  const startDate = new Date(data[startIndex].date);
  const totalDays = (finalDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

  const absoluteReturn = (finalValue - totalInvested) / totalInvested;
  
  let annualizedReturn = 0;
  if (returnMethod === 'xirr') {
    annualizedReturn = calculateXIRR(cashFlows) || 0;
  } else {
    annualizedReturn = calculateSimpleAnnualized(totalInvested, finalValue, totalDays);
  }

  return {
    totalInvested,
    totalGrams,
    finalValue,
    absoluteReturn,
    annualizedReturn,
    tradeCount: trades.length,
    totalDays,
    trades
  };
}
