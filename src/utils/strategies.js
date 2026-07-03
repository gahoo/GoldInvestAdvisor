export function evaluateStrategy(indicators, macro, strategy, baseGrams, wday) {
  if (!indicators) return null;
  
  let targetPrice = indicators.currentPrice;
  let multiplier = 1.0;
  let reason = '';

  if (strategy === 'grid') {
    targetPrice = indicators.currentPrice - (indicators.weeklyAtr * 0.5);
    // 连续倍率算法：以 1.0 为基准，反向放大 BIAS 的偏离 (斜率设置为 15)
    multiplier = Math.max(0.1, Math.min(3.0, 1.0 - (indicators.bias * 15)));
    reason = `当前偏离均线 ${(indicators.bias * 100).toFixed(2)}%，通过线性函数自动调节定投倍率为 ${multiplier.toFixed(2)}x。`;
  } else if (strategy === 'grid_drawdown') {
    targetPrice = indicators.referencePrice * (1 + (indicators.drawdown || 0));
    multiplier = Math.max(0.5, Math.min(3.0, 1.0 - (indicators.bias * 10)));
    reason = `结合回撤锚点与当前乖离率动态量化，测算参考购入倍率为 ${multiplier.toFixed(2)}x。`;
  } else if (strategy === 'grid_fib') {
    if (indicators.currentPrice > indicators.fib?.level382) {
      targetPrice = indicators.currentPrice - (indicators.weeklyAtr * 0.382);
      multiplier = Math.max(0.5, Math.min(2.0, 1.0 - (indicators.bias * 10)));
      reason = '处于强趋势上方，防守挂单偏浅，依据当前偏离度平滑调整倍数。';
    } else {
      targetPrice = indicators.currentPrice - (indicators.weeklyAtr * 0.618);
      multiplier = Math.max(1.0, Math.min(3.0, 1.2 - (indicators.bias * 15)));
      reason = '处于趋势下方，防守挂单较深，适当放大左侧参考的倍率倾斜。';
    }
  } else if (strategy === 'mean_reversion') {
    targetPrice = Math.min(indicators.fib?.level618 || indicators.currentPrice, indicators.currentPrice);
    // 连续倍率算法：RSI 50 为中轴 (1x)，向 30 靠近放大至 2x，向 70 靠近缩小至 0x
    multiplier = Math.max(0.0, Math.min(3.0, 1.0 + (50 - indicators.rsi) / 20));
    reason = `RSI 为 ${indicators.rsi?.toFixed(1)}，基于 RSI 中轴偏离度映射为 ${multiplier.toFixed(2)}x 连续倍率。`;
  } else if (strategy === 'calendar') {
    targetPrice = indicators.currentPrice * 0.998;
    const today = wday || (new Date().getDay() || 7);
    if (indicators.calendar?.bestBuyDay === today) {
      multiplier = 1.0;
      reason = '今天是历史统计的当周最低日，可略微打折挂单。';
    } else {
      multiplier = 0.0;
      reason = '今天不是历史最佳买入日，建议观望或大幅打折挂单。';
    }
  } else if (strategy === 'macro') {
    if (macro && macro.dxy?.changePercent !== undefined && macro.tnx?.changePercent !== undefined) {
      // 连续倍率算法：美元和美债双涨时，按两者的涨幅共振强度计算购买倍数和打折力度
      const pressure = macro.dxy.changePercent + macro.tnx.changePercent;
      if (pressure > 0) {
        multiplier = Math.min(3.0, 1.0 + (pressure * 0.5));
        targetPrice = indicators.currentPrice * (1 - (pressure * 0.005));
        reason = `美债和美元产生 ${pressure.toFixed(2)}% 的联合共振压制，动态向下打折接针，加码 ${multiplier.toFixed(2)}x。`;
      } else {
        targetPrice = indicators.currentPrice;
        multiplier = 1.0;
        reason = '宏观因子未形成共振上行压制，维持现价 1.00x 正常定投。';
      }
    } else {
      targetPrice = indicators.currentPrice;
      multiplier = 1.0;
      reason = '加载宏观因子中，维持默认定投。';
    }
  }

  const grams = baseGrams * multiplier;

  return { targetPrice, grams, multiplier, reason };
}

export function evaluateSellStrategy(indicators, currentHoldings, averageCost, activeSellStrategies) {
  if (!indicators || currentHoldings <= 0 || !activeSellStrategies || activeSellStrategies.length === 0) {
    return { shouldSell: false, sellRatio: 0, reason: '' };
  }

  const pnlRatio = averageCost > 0 ? (indicators.currentPrice - averageCost) / averageCost : 0;
  let maxSellRatio = 0;
  let reasons = [];

  if (activeSellStrategies.includes('rsi_scale_out')) {
    if (indicators.rsi > 70 && pnlRatio > 0) {
      maxSellRatio = Math.max(maxSellRatio, 0.3);
      reasons.push('RSI超买且有浮盈，触发均值回归高抛，卖出30%留底仓');
    }
  }

  if (activeSellStrategies.includes('profit_scale_out')) {
    if (pnlRatio > 0.10) { // 10% 目标
      maxSellRatio = Math.max(maxSellRatio, 0.5);
      reasons.push('浮盈超过10%，触发目标收益减仓，卖出50%锁定利润');
    }
  }

  if (activeSellStrategies.includes('trend_break_clear')) {
    if (indicators.ma60 && indicators.currentPrice < indicators.ma60 && pnlRatio > 0) {
      maxSellRatio = Math.max(maxSellRatio, 1.0);
      reasons.push('跌破MA60中期趋势线且有浮盈，触发防守性清仓止盈');
    }
  }

  if (maxSellRatio > 0) {
    return {
      shouldSell: true,
      sellRatio: maxSellRatio,
      reason: reasons.join('；')
    };
  }

  return { shouldSell: false, sellRatio: 0, reason: '' };
}
