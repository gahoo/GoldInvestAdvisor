import { DataSource } from './DataSource.js';
import { TimeSeriesPoint } from '../../models/TimeSeriesPoint.js';

/**
 * 东方财富/天天基金 场外基金净值数据源
 */
export class EastMoneyFundSource extends DataSource {
  constructor() {
    super('fund');
  }

  /**
   * 判定该日期是否已经固化。
   * 基金净值通常在交易日晚间（T+1凌晨前）公布。
   * 为安全起见，只要日期小于今天，就视为固化。当天的净值在盘中绝对不会公布。
   */
  _isFinal(dateStr) {
    const todayStr = new Date().toLocaleDateString('en-CA');
    return dateStr < todayStr;
  }

  async fetchHistorical(symbol, range = 'max') {
    // 基金 API 目前默认返回大量历史，可以通过 pageSize 控制
    // 为简化，直接取极大值获取全量
    try {
      const response = await fetch(`/api/fund?symbol=${encodeURIComponent(symbol)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Fund API status: ${response.status}, message: ${text}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data && result.data.length > 0) {
        const formatted = this._formatFundData(result.data, symbol);
        if (result.name) {
          formatted.name = result.name;
        }
        return formatted;
      } else {
        throw new Error(`获取不到基金 ${symbol} 的有效数据: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('EastMoneyFundSource Error:', error);
      throw new Error(`基金数据加载失败，请检查网络或重新刷新页面: ${error.message}`);
    }
  }

  async fetchDelta(symbol, backfillDays = 30) {
    // API 支持分页，为了拉取最近增量，可以设置 pageSize=100
    try {
      const response = await fetch(`/api/fund?symbol=${encodeURIComponent(symbol)}&pageSize=100`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Fund API status: ${response.status}, message: ${text}`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        return this._formatFundData(result.data, symbol);
      }
      throw new Error(result.error);
    } catch (error) {
       console.error('EastMoneyFundSource fetchDelta Error:', error);
       throw error;
    }
  }

  _formatFundData(apiData, symbol) {
    const formattedData = [];
    
    apiData.forEach(item => {
      if (!item.date || item.close == null) return;
      
      formattedData.push(new TimeSeriesPoint({
        date: item.date,
        assetType: 'fund',
        isFinal: this._isFinal(item.date),
        close: item.close,
        // 基金没有 OHLC，全部使用净值 (close) 占位
        open: item.close,
        high: item.close,
        low: item.close,
        volume: 0
      }));
    });
    
    formattedData.sort((a, b) => a.date.localeCompare(b.date));
    return formattedData;
  }
}
