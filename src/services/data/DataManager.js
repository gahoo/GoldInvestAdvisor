import { dbStore } from '../storage/IndexedDBStore.js';
import { CCBGoldSource } from './CCBGoldSource.js';
import { YahooFinanceSource } from './YahooFinanceSource.js';
import { EastMoneyFundSource } from './EastMoneyFundSource.js';
import FREDSource from './FREDSource.js';
import CFTCSource from './CFTCSource.js';
import { TradingViewSource } from './TradingViewSource.js';

// 简单的数据源注册表
const registry = {
  'ccb': new CCBGoldSource(),
  'yahoo': new YahooFinanceSource(),
  'fund': new EastMoneyFundSource(),
  'fred': FREDSource,
  'cftc': CFTCSource,
  'tradingview': new TradingViewSource()
};

/**
 * 核心数据调度引擎
 */
class DataManager {
  
  /**
   * 生成统一的缓存复合主键
   */
  _generateCacheKey(source, assetType, symbol, interval, adj) {
    return `${source}:${assetType}:${symbol}:${interval}:${adj}`;
  }

  /**
   * 将两组升序的时间序列数据按日期合并去重，以 newData 优先
   */
  _mergeData(oldData, newData) {
    const dataMap = new Map();
    // 先写入旧数据
    for (const point of oldData) {
      dataMap.set(point.date, point);
    }
    // 写入新数据，如果日期冲突，则覆盖旧数据（以应对修正和除权）
    for (const point of newData) {
      dataMap.set(point.date, point);
    }
    
    // 转回数组并按日期升序
    const merged = Array.from(dataMap.values());
    merged.sort((a, b) => a.date.localeCompare(b.date));
    return merged;
  }

  /**
   * 核心数据获取逻辑
   * @param {Object} params
   * @param {string} params.source 数据源 ID ('ccb', 'yahoo' 等)
   * @param {string} params.symbol 标的代码 ('gold', 'AAPL')
   * @param {string} params.assetType 资产类型 ('commodity', 'stock')
   * @param {string} params.interval 周期 ('1d', '1wk')
   * @param {string} params.adj 复权方式 ('unadj', 'adj')
   * @param {string} params.range 数据范围 ('max', '10y', '5y' 等)
   */
  async fetchData({ source, symbol, assetType = 'stock', interval = '1d', adj = 'unadj', range = 'max' }) {
    const dataSource = registry[source];
    if (!dataSource) {
      throw new Error(`未找到名为 ${source} 的数据源实现`);
    }

    const cacheKey = this._generateCacheKey(source, assetType, symbol, interval, adj);
    let cachedRecord = await dbStore.getSeries(cacheKey);

    let finalData = [];
    let memoryData = []; // 存放非固化（今日盘中）数据
    
    let finalName = symbol;

    if (!cachedRecord || !cachedRecord.data || cachedRecord.data.length === 0) {
      // 1. 无缓存或缓存为空，进行全量获取
      console.log(`[DataManager] 无 ${cacheKey} 缓存，执行全量拉取...`);
      const apiData = await dataSource.fetchHistorical(symbol, range);
      if (apiData.name) finalName = apiData.name;
      
      // 分离固化与非固化数据
      finalData = apiData.filter(d => d.isFinal);
      memoryData = apiData.filter(d => !d.isFinal);

      // 将固化数据存入本地
      if (finalData.length > 0) {
        const metadata = {
          coverageStart: finalData[0].date,
          coverageEnd: finalData[finalData.length - 1].date,
          lastFullRefreshAt: Date.now(),
          name: finalName
        };
        await dbStore.saveSeries(cacheKey, metadata, finalData);
      }
    } else {
      // 2. 有缓存，进行增量更新 (Delta Fetch)
      console.log(`[DataManager] 命中 ${cacheKey} 缓存，执行增量拉取以补齐数据...`);
      if (cachedRecord.metadata?.name) finalName = cachedRecord.metadata.name;
      
      // 默认回溯 30 天，确保除权修正能被覆盖
      const deltaData = await dataSource.fetchDelta(symbol, 30);
      if (deltaData.name) finalName = deltaData.name;
      
      const newFinalData = deltaData.filter(d => d.isFinal);
      memoryData = deltaData.filter(d => !d.isFinal);

      // 合并本地旧缓存和新拉取的增量固化数据
      finalData = this._mergeData(cachedRecord.data, newFinalData);

      if (finalData.length > 0) {
        const metadata = {
          ...cachedRecord.metadata,
          coverageEnd: finalData[finalData.length - 1].date,
          name: finalName
        };
        await dbStore.saveSeries(cacheKey, metadata, finalData);
      }
    }

    // 最终返回给业务层的数据，是 固化历史 + 当日盘中内存数据 的拼接
    const result = this._mergeData(finalData, memoryData);
    result.name = finalName;
    return result;
  }

  /**
   * 专门给回测引擎调用的获取方法，严格剔除未固化的盘中数据，确保回测一致性
   */
  async getBacktestData(params) {
    const fullData = await this.fetchData(params);
    return fullData.filter(d => d.isFinal);
  }

  /**
   * 获取期权横截面数据，专门给 TradingView 数据源使用
   * 带有带过期时间的 IndexedDB 缓存机制（设为 12 小时）
   */
  async fetchOptionsChain(symbols, forceRefresh = false) {
    const cacheKey = `tradingview:options:${symbols.join('_')}`;
    const CACHE_EXPIRE_MS = 12 * 60 * 60 * 1000; // 12小时过期
    
    // 如果不强制刷新，优先尝试从缓存获取
    if (!forceRefresh) {
      const cached = await dbStore.getSeries(cacheKey);
      if (cached && cached.data && cached.data.length > 0) {
        const age = Date.now() - (cached.metadata.updatedAt || 0);
        if (age < CACHE_EXPIRE_MS) {
          console.log(`[DataManager] 加载期权缓存数据 (距上次更新 ${Math.round(age/1000/60)} 分钟): ${cacheKey}`);
          return cached.data;
        } else {
          console.log(`[DataManager] 期权缓存已过期 (${Math.round(age/1000/60)} 分钟)，准备重新拉取...`);
        }
      }
    }

    const dataSource = registry['tradingview'];
    const data = await dataSource.fetchOptionsData(symbols);
    
    // 抓取成功后存入 IndexedDB 缓存
    if (data && data.length > 0) {
      await dbStore.saveSeries(cacheKey, { updatedAt: Date.now() }, data);
    }
    
    return data;
  }
}

export const dataManager = new DataManager();
