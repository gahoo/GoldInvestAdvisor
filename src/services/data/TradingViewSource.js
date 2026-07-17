import { DataSource } from './DataSource.js';

export class CORSError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CORSError';
  }
}

export class TradingViewSource extends DataSource {
  constructor() {
    super('tradingview');
  }

  /**
   * 覆盖 fetchHistorical，因为 TradingView 期权是截面数据
   */
  async fetchHistorical(symbol, range) {
    throw new Error('TradingViewSource不支持标准的时间序列历史数据拉取，请调用 fetchOptionsData');
  }

  /**
   * 获取横截面的期权数据 (Gamma, Delta, Strike, IV)
   * @param {Array<string>} symbols 例如 ["COMEX:GCQ2026", "COMEX:GCV2026"]
   * @returns {Promise<Array>}
   */
  async fetchOptionsData(symbols) {
    const url = "https://scanner.tradingview.com/options/scan2?label-product=symbols-options";
    
    const payloadString = `{"columns":["ask","bid","currency","delta","expiration","gamma","iv","option-type","pricescale","rho","root","strike","theoPrice","theta","vega","bid_iv","ask_iv"],"ignore_unknown_fields":false,"index_filters":[{"name":"underlying_symbol","values":["COMEX:GCQ2026","COMEX:GCV2026"]}],"filter2":{"operator":"and","operands":[{"expression":{"left":"type","operation":"equal","right":"option"}},{"operation":{"operator":"or","operands":[{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260717}},{"expression":{"left":"root","operation":"equal","right":"OG3"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260720}},{"expression":{"left":"root","operation":"equal","right":"G3M"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260721}},{"expression":{"left":"root","operation":"equal","right":"G3T"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260722}},{"expression":{"left":"root","operation":"equal","right":"G4W"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260723}},{"expression":{"left":"root","operation":"equal","right":"G4R"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260724}},{"expression":{"left":"root","operation":"equal","right":"OG4"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260727}},{"expression":{"left":"root","operation":"equal","right":"G4M"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260728}},{"expression":{"left":"root","operation":"equal","right":"OG"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260729}},{"expression":{"left":"root","operation":"equal","right":"G5W"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260730}},{"expression":{"left":"root","operation":"equal","right":"G5R"}}]}},{"operation":{"operator":"and","operands":[{"expression":{"left":"expiration","operation":"equal","right":20260731}},{"expression":{"left":"root","operation":"equal","right":"OG5"}}]}}]}}]}}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include", // <--- 关键：发送当前 TradingView 登录状态下的 Cookie 权限凭证
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: payloadString
      });

      if (!response.ok) {
        throw new Error(`TradingView API HTTP Error: ${response.status}`);
      }

      const json = await response.json();
      
      // 格式化数据，提取我们需要的字段
      if (!json.data || !Array.isArray(json.data)) {
        return [];
      }

      // "columns":["ask","bid","currency","delta","expiration","gamma","iv","option-type","pricescale","rho","root","strike","theoPrice","theta","vega","bid_iv","ask_iv"]
      const formattedData = json.data.map(item => ({
        symbol: item.s,
        delta: item.d[3] || 0,
        expiration: item.d[4],
        gamma: item.d[5] || 0,
        iv: item.d[6] || 0,
        optionType: item.d[7], // 'C' 或 'P'
        strike: item.d[11] || 0,
      }));

      // 按 strike 排序
      return formattedData.sort((a, b) => a.strike - b.strike);

    } catch (error) {
      console.error('[TradingViewSource] Fetch Error:', error);
      // 识别是否是网络层面的跨域拦截 (Failed to fetch)
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new CORSError('请求被浏览器跨域安全策略(CORS)拦截，请检查是否已安装并开启 CORS 插件。');
      }
      throw error;
    }
  }
}
