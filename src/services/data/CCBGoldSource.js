import { DataSource } from './DataSource.js';
import { TimeSeriesPoint } from '../../models/TimeSeriesPoint.js';

/**
 * 建行纸黄金数据源
 */
export class CCBGoldSource extends DataSource {
  constructor() {
    super('ccb');
  }

  async fetchHistorical(symbol = 'gold', range = 'max') {
    try {
      const response = await fetch('/api/ccb');
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data && result.data.length > 0) {
        return this._formatCCBData(result.data);
      } else {
        throw new Error('获取不到有效的黄金数据。请检查网络或稍后重试。');
      }
    } catch (error) {
      console.error('CCBGoldSource Error:', error);
      throw new Error('数据接口加载失败，请检查网络或重新刷新页面。');
    }
  }

  async fetchDelta(symbol = 'gold', backfillDays = 30) {
    // 现有的 /api/ccb 接口是一次性返回全部数据，不支持按日期请求增量
    // 因此这里直接复用 fetchHistorical，后续交由 DataManager 去重和覆盖
    return this.fetchHistorical(symbol, 'max');
  }

  _formatCCBData(fieldList) {
    const formattedData = [];
    
    // 获取当天的日期字符串 (本地时区)，用于判断 isFinal
    const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' 格式

    fieldList.forEach(item => {
      if (!item.date || !item.close) return;
      
      const parts = item.date.split('-');
      if (parts.length !== 3) return;
      
      const open = parseFloat(item.open);
      const high = parseFloat(item.high);
      const low = parseFloat(item.low);
      const close = parseFloat(item.close);
      
      // 剔除脏数据
      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) return;
      if (high < low || high < open || high < close || low > open || low > close) return;
      
      // 判断是否固化：如果数据的日期小于今天，则视为已收盘固化
      // 字符串比较在格式一致（YYYY-MM-DD）时是安全的
      const isFinal = item.date < todayStr;

      formattedData.push(new TimeSeriesPoint({
        date: item.date,
        assetType: 'commodity',
        isFinal: isFinal,
        close,
        open,
        high,
        low
      }));
    });
    
    // 确保数据按日期升序排列
    formattedData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return formattedData;
  }
}
