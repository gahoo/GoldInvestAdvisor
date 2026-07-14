import { DataSource } from './DataSource.js';
import { TimeSeriesPoint } from '../../models/TimeSeriesPoint.js';

/**
 * Yahoo Finance 数据源
 * 支持全球股票、指数 (如 AAPL, 000001.SS)
 */
export class YahooFinanceSource extends DataSource {
  constructor() {
    super('yahoo');
  }

  /**
   * 判定该日期是否已经收盘固化
   * 这是一个简化的通用逻辑：如果日期小于今天（本地时间），则认为是固化的。
   * 对于严格的系统，可能需要根据具体交易所的时区进行判断。
   */
  _isFinal(dateStr) {
    const todayStr = new Date().toLocaleDateString('en-CA');
    return dateStr < todayStr;
  }

  async fetchHistorical(symbol, range = '10y') {
    try {
      const response = await fetch(`/api/yahoo?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`);
      if (!response.ok) {
        throw new Error(`Yahoo API responded with status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data && result.data.length > 0) {
        const formatted = this._formatYahooData(result.data, symbol);
        if (result.name) {
          formatted.name = result.name;
        }
        return formatted;
      } else {
        throw new Error(`获取不到 ${symbol} 的有效数据: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('YahooFinanceSource Error:', error);
      throw new Error(`数据接口加载失败，请检查网络或重新刷新页面: ${error.message}`);
    }
  }

  async fetchDelta(symbol, backfillDays = 30) {
    // 拉取最近的 3 个月数据以确保包含过去 30 天，且能覆盖除权除息导致的修正
    return this.fetchHistorical(symbol, '3mo');
  }

  _formatYahooData(apiData, symbol) {
    const formattedData = [];
    
    // 粗略判断资产类型（指数还是股票），只是为了做标记
    const assetType = (symbol.startsWith('^') || symbol.includes('=')) ? 'macro' : 'stock';

    apiData.forEach(item => {
      if (!item.date || item.close == null) return;
      
      formattedData.push(new TimeSeriesPoint({
        date: item.date,
        assetType,
        isFinal: this._isFinal(item.date),
        close: item.close,
        open: item.open,
        high: item.high,
        low: item.low,
        volume: item.volume
      }));
    });
    
    formattedData.sort((a, b) => a.date.localeCompare(b.date));
    return formattedData;
  }
}
