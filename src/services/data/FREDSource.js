import { DataSource } from './DataSource.js';
import { TimeSeriesPoint } from '../../models/TimeSeriesPoint.js';

class FREDSource extends DataSource {
  constructor() {
    super('FRED Macro Data', 'fred');
    this.baseUrl = '/api/fred'; // Using our Cloudflare Function proxy
  }

  async fetchHistorical(symbol, startDate, endDate) {
    try {
      // symbol here is the series_id like 'M2SL' or 'DFII10'
      const response = await fetch(`${this.baseUrl}?series_id=${symbol}`);
      
      if (!response.ok) {
        throw new Error(`FRED API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Invalid data from FRED API');
      }
      
      return this._formatFREDData(result.data, symbol, startDate, endDate);
    } catch (error) {
      console.error('Failed to fetch FRED data:', error);
      throw error;
    }
  }

  async fetchDelta(symbol, lastDate) {
    // For macroeconomic data, we typically just re-fetch the recent history 
    // or use the same endpoint since it's lightweight.
    return this.fetchHistorical(symbol, lastDate, null);
  }

  _formatFREDData(data, symbol, startDate, endDate) {
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
        filteredData = filteredData.filter(item => new Date(item.date).getTime() >= start);
      }
    }
    
    if (endDate) {
      const end = new Date(endDate).getTime();
      filteredData = filteredData.filter(item => new Date(item.date).getTime() <= end);
    }
    
    return filteredData.map(item => {
      // FRED provides 'date' as YYYY-MM-DD and 'value' as number
      return new TimeSeriesPoint({
        date: item.date,
        close: parseFloat(item.value) || 0,
        symbol: symbol,
        source: this.id,
        isFinal: true
      });
    });
  }
}

export default new FREDSource();
