import { calculateAllIndicators } from './indicators';
import { evaluateStrategy, evaluateSellStrategy } from './strategies';
import { calculateXIRR, calculateSimpleAnnualized } from './math';

/**
 * 运行回测。
 * @param {Array} data - 历史 K 线数据
 * @param {string} strategy - 策略类型
 * @param {number} baseGrams - 基础定投克数
 * @param {Object} options
 * @param {string} options.returnMethod - 'xirr' | 'simple'
 * @param {string} options.buyMode - 'dynamic' | 'fixed'
 * @param {string} options.tradeFrequency - 'weekly' | 'twice_weekly' | 'biweekly' | 'monthly'
 * @param {number} options.atrPeriod - ATR 周期
 * @returns {Object} 回测结果统计
 */
export function runBacktest(data, strategy, baseGrams, options = {}) {
  const {
    returnMethod = 'xirr',
    buyMode = 'dynamic',
    tradeFrequency = 'weekly',
    atrPeriod = 14,
    allowSell = false,
    sellFee = 0.01,
    sellStrategies = [],
    minTradeVolume = 0
  } = options;

  if (!data || data.length < 60) return null;

  // 宏观策略跳过逻辑已移除，现在使用并入的 historical macro data

  let totalGrams = 0;
  let totalCostBasis = 0;
  let averageCost = 0;
  let realizedProfit = 0;
  let maxCapitalDeployed = 0; // Used for simple return calculation
  let currentCapitalDeployed = 0;
  let totalBuyAmount = 0; // Cumulative absolute money spent
  let totalNetRevenue = 0; // Cumulative cash from selling
  let peakNetProfit = -Infinity;
  let maxDrawdownAmount = 0;
  const cashFlows = [];
  const trades = [];

  // 记录上一次生成买入信号的周/月标识，确保满足频率限制
  let lastSignalWeek = -Infinity;
  let currentWeekSignalCount = 0;
  let lastSignalMonth = -Infinity;

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
    
    const historySlice = data.slice(0, i);
    const indicators = calculateAllIndicators(historySlice, { atrPeriod });
    
    if (!indicators) continue;

    // 1. 优先判定卖出 (如果开启)
    let hasSold = false;
    if (allowSell && totalGrams >= 0.01) {
      const sellAdvice = evaluateSellStrategy(indicators, totalGrams, averageCost, sellStrategies);
      if (sellAdvice.shouldSell) {
        const sellGrams = totalGrams * sellAdvice.sellRatio;
        
        if (sellGrams >= minTradeVolume) {
          // 明确假设：在收到前一日收盘后的卖出信号后，于次日（即 currentData 当日）收盘时执行卖出。
          const sellPrice = currentData.close; 
          const grossRevenue = sellPrice * sellGrams;
          const feeAmount = grossRevenue * sellFee;
        const netRevenue = grossRevenue - feeAmount;

        const costOfSoldGrams = averageCost * sellGrams;
        const profit = netRevenue - costOfSoldGrams;
        const profitRatio = costOfSoldGrams > 0 ? profit / costOfSoldGrams : 0;

        realizedProfit += profit;
        totalNetRevenue += netRevenue;
        totalGrams -= sellGrams;
        totalCostBasis -= costOfSoldGrams;
        averageCost = totalGrams > 0 ? totalCostBasis / totalGrams : 0;
        
        currentCapitalDeployed -= costOfSoldGrams; // 按成本核减，更客观反映资金占用
        
        const date = new Date(currentData.date);
        cashFlows.push({ date, amount: netRevenue }); // 现金流入

        trades.push({
          date: currentData.date,
          type: 'sell',
          price: sellPrice,
          grams: sellGrams,
          fee: feeAmount,
          netRevenue: netRevenue,
          profit: profit,
          profitRatio: profitRatio,
          holdings: totalGrams,
          reason: sellAdvice.reason
        });
        hasSold = true;
        }
      }
    }

    // 如果今天卖出了，就不在同一天买入（防止冲突，简化逻辑）
    if (hasSold) continue;

    // 2. 判定买入
    let canGenerateSignal = true;
    if (tradeFrequency === 'weekly' && currentWeekId <= lastSignalWeek) canGenerateSignal = false;
    if (tradeFrequency === 'twice_weekly' && currentWeekId <= lastSignalWeek && currentWeekSignalCount >= 2) canGenerateSignal = false;
    if (tradeFrequency === 'biweekly' && currentWeekId < lastSignalWeek + 2) canGenerateSignal = false;
    if (tradeFrequency === 'monthly' && currentMonthId <= lastSignalMonth) canGenerateSignal = false;

    let gramsToBuy = 0;
    let targetPrice = null;
    let buyReason = '';

    if (canGenerateSignal) {
      const evaluation = evaluateStrategy(indicators, currentData.macro || null, strategy, baseGrams, currentData.wday);
      targetPrice = evaluation.targetPrice;
      buyReason = evaluation.reason;
      
      gramsToBuy = buyMode === 'fixed' ? baseGrams : baseGrams * evaluation.multiplier;
      if (gramsToBuy > 0 && gramsToBuy < minTradeVolume) {
        gramsToBuy = 0; // 不满足最低交易量，跳过
      }

      if (gramsToBuy > 0) {
        if (currentWeekId === lastSignalWeek) {
          currentWeekSignalCount += 1;
        } else {
          lastSignalWeek = currentWeekId;
          currentWeekSignalCount = 1;
        }
        lastSignalMonth = currentMonthId;
      }
    }

    if (gramsToBuy > 0) {
      // 撮合逻辑
      let executionPrice = null;
      if (currentData.open <= targetPrice) {
        executionPrice = currentData.open;
      } else if (currentData.low <= targetPrice) {
        executionPrice = targetPrice;
      }

      if (executionPrice !== null) {
        const cost = executionPrice * gramsToBuy;
        totalGrams += gramsToBuy;
        totalBuyAmount += cost;
        totalCostBasis += cost;
        averageCost = totalCostBasis / totalGrams;
        
        currentCapitalDeployed += cost;
        if (currentCapitalDeployed > maxCapitalDeployed) {
          maxCapitalDeployed = currentCapitalDeployed;
        }
        
        const date = new Date(currentData.date);
        cashFlows.push({ date, amount: -cost }); // 现金流出
        
        trades.push({
          date: currentData.date,
          type: 'buy',
          price: executionPrice,
          grams: gramsToBuy,
          cost: cost,
          holdings: totalGrams,
          reason: buyReason
        });
      }
    }

    // Daily MTM and Drawdown Tracking
    const dailyTotalValue = totalGrams * currentData.close;
    const dailyNetProfit = dailyTotalValue + totalNetRevenue - totalBuyAmount;
    
    if (dailyNetProfit > peakNetProfit) {
      peakNetProfit = dailyNetProfit;
    }
    const drawdownAmount = peakNetProfit - dailyNetProfit;
    if (drawdownAmount > maxDrawdownAmount) {
      maxDrawdownAmount = drawdownAmount;
    }

  } // end of for loop

  if (trades.length === 0) {
    return {
      maxCapitalDeployed: 0,
      totalCostBasis: 0,
      averageCost: 0,
      totalGrams: 0,
      finalValue: 0,
      realizedProfit: 0,
      netProfit: 0,
      winRate: 0,
      absoluteReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      calmarRatio: 0,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      totalDays: 0,
      trades: []
    };
  }

  const finalDate = new Date(data[data.length - 1].date);
  const finalPrice = data[data.length - 1].close;
  const finalValue = totalGrams * finalPrice;
  
  // 期末作为最后一笔正现金流
  if (totalGrams > 0) {
    cashFlows.push({ date: finalDate, amount: finalValue });
  }

  const startDate = new Date(data[startIndex].date);
  const totalDays = (finalDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

  // For trading strategies, simple return is (finalValue + realizedProfit) / maxCapitalDeployed - 1
  // Or simply net profit / max capital deployed.
  const netProfit = (finalValue - totalCostBasis) + realizedProfit;
  const absoluteReturn = maxCapitalDeployed > 0 ? netProfit / maxCapitalDeployed : 0;
  
  let annualizedReturn = 0;
  if (returnMethod === 'xirr') {
    const xirrResult = calculateXIRR(cashFlows);
    annualizedReturn = xirrResult === null ? null : xirrResult;
  } else {
    annualizedReturn = calculateSimpleAnnualized(maxCapitalDeployed, maxCapitalDeployed + netProfit, totalDays);
  }

  // Calculate win rate
  const sellTrades = trades.filter(t => t.type === 'sell');
  const buyTrades = trades.filter(t => t.type === 'buy');
  const winningSells = sellTrades.filter(t => t.profit > 0);
  const winRate = sellTrades.length > 0 ? winningSells.length / sellTrades.length : 0;

  const maxDrawdown = maxCapitalDeployed > 0 ? maxDrawdownAmount / maxCapitalDeployed : 0;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  return {
    totalInvested: maxCapitalDeployed, // Using maxCapitalDeployed for UI compatibility
    totalBuyAmount,
    totalCostBasis,
    averageCost,
    totalGrams,
    finalValue,
    realizedProfit,
    netProfit,
    winRate,
    absoluteReturn,
    annualizedReturn,
    maxDrawdown,
    calmarRatio,
    tradeCount: trades.length,
    buyCount: buyTrades.length,
    sellCount: sellTrades.length,
    totalDays,
    trades
  };
}
