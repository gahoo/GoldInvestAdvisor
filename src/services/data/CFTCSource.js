import { DataSource } from './DataSource.js';
import { TimeSeriesPoint } from '../../models/TimeSeriesPoint.js';

class CFTCSource extends DataSource {
  constructor() {
    super('CFTC COT Data', 'cftc');
    // Ideally this would point to a Cloudflare Function that parses the CFTC COT reports.
    // For demonstration and initial testing, we'll implement a mock fetching mechanism.
    this.baseUrl = '/api/cftc'; 
  }

  async fetchHistorical(symbol, startDate, endDate) {
    try {
      // 通过本地/Cloudflare 代理请求数据，获得边缘缓存
      const url = `/api/cftc?symbol=088691&limit=1000`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CFTC Proxy error: ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Invalid CFTC data');
      }
      
      return this._formatCFTCData(result.data, symbol, startDate, endDate);
    } catch (error) {
      console.error('Failed to fetch CFTC data:', error);
      throw error;
    }
  }

  async fetchDelta(symbol, lastDate) {
    return this.fetchHistorical(symbol, lastDate, null);
  }

  _formatCFTCData(data, symbol, startDate, endDate) {
    let filteredData = data;
    
    if (startDate && startDate !== 'max') {
      let start;
      if (typeof startDate === 'number') {
        // If it's a number, it's a delta days fetch (e.g., 30)
        start = new Date();
        start.setDate(start.getDate() - startDate);
        start = start.getTime();
      } else {
        start = new Date(startDate).getTime();
      }
      
      if (!isNaN(start)) {
        filteredData = filteredData.filter(item => new Date(item.report_date_as_yyyy_mm_dd).getTime() >= start);
      }
    }
    
    if (endDate) {
      const end = new Date(endDate).getTime();
      filteredData = filteredData.filter(item => new Date(item.report_date_as_yyyy_mm_dd).getTime() <= end);
    }
    
    // Sort chronological (oldest to newest) for our charts/models
    filteredData.sort((a, b) => new Date(a.report_date_as_yyyy_mm_dd) - new Date(b.report_date_as_yyyy_mm_dd));
    
    return filteredData.map(item => {
      // Non-commercial positions represent speculators (managed money proxy)
      const longs = parseInt(item.noncomm_positions_long_all, 10) || 0;
      const shorts = parseInt(item.noncomm_positions_short_all, 10) || 0;
      const netLongs = longs - shorts;
      
      return new TimeSeriesPoint({
        date: item.report_date_as_yyyy_mm_dd.split('T')[0],
        close: netLongs, // We store net longs in the 'close' field
        symbol: symbol,
        source: this.id,
        isFinal: true
      });
    });
  }
}

export default new CFTCSource();
