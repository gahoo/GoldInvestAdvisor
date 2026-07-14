/**
 * 通用的时间序列数据点模型
 * 不再局限于 OHLC，可兼容股票、黄金、公募基金等不同的数据。
 */
export class TimeSeriesPoint {
  constructor({
    date,
    assetType = 'unknown',
    isFinal = false,
    close = null,
    open = null,
    high = null,
    low = null,
    volume = null,
    wday = null
  }) {
    if (!date) {
      throw new Error("TimeSeriesPoint: 'date' is required.");
    }
    this.date = date;             // 日期 (e.g. YYYY-MM-DD)
    this.assetType = assetType;   // 'stock', 'fund', 'commodity', 'macro'
    this.isFinal = isFinal;       // 是否收盘固化，回测只会采用 true 的数据

    // 核心价格（基金为单位净值，股票为收盘价）
    this.close = close;
    
    // 以下为可选字段，非 OHLC 资产可能为空
    this.open = open;
    this.high = high;
    this.low = low;
    this.volume = volume;
    
    // 星期几 (1-7)，用于计算特定指标，保留向后兼容
    if (wday !== null) {
      this.wday = wday;
    } else {
      const d = new Date(date);
      this.wday = d.getDay() === 0 ? 7 : d.getDay();
    }
    
    // 兼容原有的代码
    this.effectiveHigh = high !== null && !isNaN(high) ? high : close;
    this.effectiveLow = low !== null && !isNaN(low) ? low : close;
  }
}
