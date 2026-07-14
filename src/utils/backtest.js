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
 * @param {string} options.orderValidity - 订单有效期（天数）
 * @returns {Object} 回测结果统计
 */
export function runBacktest(data, strategy, baseGrams, options = {}) {
  const {
    buyMode = 'dynamic',
    tradeFrequency = 'weekly',
    atrPeriod = 14,
    allowSell = false,
    sellFee = 0.0,
    sellStrategies = [],
    minTradeVolume = 0,
    lotSize = 0.01,
    enableLadderOrders = false,
    orderValidity = 5
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
  let activeOrders = []; // 跨日持久化的有效挂单
  let previousWeekId = -1;


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

    if (previousWeekId !== -1 && currentWeekId !== previousWeekId) {
      activeOrders = []; // Bank limit orders expire on Saturday night (cross week)
    }
    previousWeekId = currentWeekId;
    
    const historySlice = data.slice(0, i);
    const indicators = calculateAllIndicators(historySlice, { atrPeriod });
    
    if (!indicators) continue;

    // 1. 优先判定卖出 (如果开启)
    let hasSold = false;
    if (allowSell && totalGrams >= 0.01) {
      const sellAdvice = evaluateSellStrategy(indicators, totalGrams, averageCost, sellStrategies);
      if (sellAdvice.shouldSell) {
        let sellGrams = totalGrams * sellAdvice.sellRatio;
        
        // 当不是 100% 清仓且有步进限制时，按步进单位向下取整
        if (lotSize > 0 && sellAdvice.sellRatio < 1) {
          sellGrams = Math.floor(sellGrams / lotSize) * lotSize;
          sellGrams = Number(sellGrams.toFixed(6));
        }

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

    if (canGenerateSignal) {
      const evaluation = evaluateStrategy(indicators, currentData.macro || null, strategy, baseGrams, currentData.wday, enableLadderOrders);
      let newOrders = evaluation.orders || [];
      
      // Remove any 0 gram orders before doing anything else
      newOrders = newOrders.filter(o => o.grams > 0);
      
      if (buyMode === 'fixed') {
        const totalMulti = newOrders.reduce((sum, o) => sum + o.multiplier, 0) || 1;
        newOrders = newOrders.map(o => ({
           ...o,
           grams: baseGrams * (o.multiplier / totalMulti)
        }));
      }

      // 应用 lotSize 取整
      if (lotSize > 0) {
        newOrders = newOrders.map(o => ({
          ...o,
          grams: Number((Math.floor(o.grams / lotSize) * lotSize).toFixed(6))
        }));
      }
      
      const totalGrams = newOrders.reduce((sum, o) => sum + o.grams, 0);
      if (totalGrams > 0 && totalGrams < minTradeVolume) {
        newOrders = []; // Total volume is too small
      }

      if (newOrders.length > 0) {
        activeOrders = newOrders.map(o => ({ ...o, reason: evaluation.reason, daysActive: 0 }));
        if (currentWeekId === lastSignalWeek) {
          currentWeekSignalCount += 1;
        } else {
          lastSignalWeek = currentWeekId;
          currentWeekSignalCount = 1;
        }
        lastSignalMonth = currentMonthId;
      }
    }

    if (activeOrders.length > 0) {
      const remainingOrders = [];
      activeOrders.forEach(order => {
        let executionPrice = null;
        if (currentData.open <= order.price) {
          executionPrice = currentData.open;
        } else if (currentData.low <= order.price) {
          executionPrice = order.price;
        }

        if (executionPrice !== null) {
          const cost = executionPrice * order.grams;
          totalGrams += order.grams;
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
            grams: order.grams,
            cost: cost,
            holdings: totalGrams,
            reason: (order.label ? `[${order.label}] ` : '') + order.reason
          });
        } else {
          remainingOrders.push(order);
        }
      });
      
      const nextOrders = [];
      remainingOrders.forEach(order => {
        order.daysActive = (order.daysActive || 0) + 1;
        const maxDays = parseInt(orderValidity, 10) || 6;
        if (order.daysActive < maxDays) {
          nextOrders.push(order);
        }
      });
      activeOrders = nextOrders;
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
      xirr: 0,
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
  
  const xirr = calculateXIRR(cashFlows);
  const annualizedReturn = calculateSimpleAnnualized(maxCapitalDeployed, maxCapitalDeployed + netProfit, totalDays);

  // Calculate win rate
  const sellTrades = trades.filter(t => t.type === 'sell');
  const buyTrades = trades.filter(t => t.type === 'buy');
  const winningSells = sellTrades.filter(t => t.profit > 0);
  const winRate = sellTrades.length > 0 ? winningSells.length / sellTrades.length : 0;

  const maxDrawdown = maxCapitalDeployed > 0 ? maxDrawdownAmount / maxCapitalDeployed : 0;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  return {
    maxCapitalDeployed,
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
    xirr,
    maxDrawdown,
    calmarRatio,
    tradeCount: trades.length,
    buyCount: buyTrades.length,
    sellCount: sellTrades.length,
    totalDays,
    trades
  };
}
