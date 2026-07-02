/**
 * 使用牛顿迭代法计算 XIRR 年化收益率。
 * @param {Array<{date: Date, amount: number}>} cashFlows
 *   负值为投入，正值为回收（最后一笔为期末市值）
 * @returns {number|null} 年化收益率，如 0.12 表示 12%。如果计算失败返回 null。
 */
export function calculateXIRR(cashFlows) {
  if (!cashFlows || cashFlows.length === 0) return null;

  // XIRR 需要至少一个正现金流和一个负现金流
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashFlows) {
    if (cf.amount > 0) hasPositive = true;
    if (cf.amount < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) return null;

  // 将日期转换为相对于第一天的天数
  const d0 = cashFlows[0].date.getTime();
  const flows = cashFlows.map(cf => ({
    amount: cf.amount,
    days: (cf.date.getTime() - d0) / (1000 * 60 * 60 * 24)
  }));

  // 净现值函数 (NPV)
  const npv = (rate) => {
    return flows.reduce((acc, cf) => {
      return acc + cf.amount / Math.pow(1 + rate, cf.days / 365);
    }, 0);
  };

  // 净现值函数的导数
  const npvDerivative = (rate) => {
    return flows.reduce((acc, cf) => {
      if (cf.days === 0) return acc;
      return acc - (cf.days / 365) * cf.amount / Math.pow(1 + rate, (cf.days / 365) + 1);
    }, 0);
  };

  // 牛顿迭代法
  let rate = 0.1; // 初始猜测值 10%
  let iter = 0;
  const maxIter = 100;
  const tol = 1e-6;

  while (iter < maxIter) {
    const value = npv(rate);
    if (Math.abs(value) < tol) {
      return rate;
    }
    const derivative = npvDerivative(rate);
    if (Math.abs(derivative) < 1e-10) {
      break; // 导数过小，迭代失败
    }
    const newRate = rate - value / derivative;
    if (Math.abs(newRate - rate) < tol) {
      return newRate;
    }
    rate = newRate;
    iter++;
  }

  return null; // 无法收敛
}

/**
 * 简单年化收益率计算。
 * @param {number} totalInvested - 累计投入本金
 * @param {number} finalValue - 期末总市值
 * @param {number} totalDays - 回测总天数
 * @returns {number} 年化收益率
 */
export function calculateSimpleAnnualized(totalInvested, finalValue, totalDays) {
  if (totalInvested <= 0 || totalDays <= 0) return 0;
  const absoluteReturn = (finalValue - totalInvested) / totalInvested;
  // 避免 totalDays 极小时计算溢出
  if (totalDays < 1) return absoluteReturn;
  return Math.pow(1 + absoluteReturn, 365 / totalDays) - 1;
}
