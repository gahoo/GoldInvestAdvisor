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
    
    // 如果没有传入 symbols，或者传入空数组，给一个默认值
    if (!symbols || symbols.length === 0) {
      symbols = ["COMEX:GC1!"];
    }
    
    // 动态生成 payload，移除极其严格的日期限制，获取所有期权
    const payload = {
      "columns": [
        "ask", "bid", "currency", "delta", "expiration", "gamma", 
        "iv", "option-type", "pricescale", "rho", "root", "strike", 
        "theoPrice", "theta", "vega", "bid_iv", "ask_iv"
      ],
      "ignore_unknown_fields": false,
      "index_filters": [
        {
          "name": "underlying_symbol",
          "values": symbols
        }
      ],
      "filter2": {
        "operator": "and",
        "operands": [
          {
            "expression": {
              "left": "type",
              "operation": "equal",
              "right": "option"
            }
          }
        ]
      }
    };
    
    const payloadString = JSON.stringify(payload);

    try {
      let json;
      if (typeof window.GM_fetchTradingViewOptions === 'function') {
        // 使用 Tampermonkey 脚本桥接，完美解决 CORS 和 TLS 指纹问题
        const responseData = await window.GM_fetchTradingViewOptions(url, payloadString);
        json = responseData;
      } else {
        throw new Error('未检测到 Tampermonkey 桥接脚本。请按照弹窗说明安装油猴脚本，然后刷新页面重试。');
      }

      const dataArray = json.data || json.symbols;
      
      if (json.totalCount === 0 || !dataArray || dataArray.length === 0) {
        return [];
      }

      // "columns":["ask","bid","currency","delta","expiration","gamma","iv","option-type","pricescale","rho","root","strike","theoPrice","theta","vega","bid_iv","ask_iv"]
      const formattedData = dataArray.map(item => {
        // TradingView 的期权 scanner 会把数据数组放在 f 字段里（股票放在 d 字段）
        const values = item.f || item.d || item.v || [];
        return {
          symbol: item.s,
          delta: values[3] || 0,
          expiration: values[4],
          gamma: values[5] || 0,
          iv: values[6] || 0,
          optionType: values[7], // 'C' 或 'P'
          strike: values[11] || 0,
        };
      });

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
