import { dbStore } from '../storage/IndexedDBStore.js';
import { CCBGoldSource } from './CCBGoldSource.js';
import { YahooFinanceSource } from './YahooFinanceSource.js';
import { EastMoneyFundSource } from './EastMoneyFundSource.js';

// 简单的数据源注册表
const registry = {
  'ccb': new CCBGoldSource(),
  'yahoo': new YahooFinanceSource(),
  'fund': new EastMoneyFundSource()
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

    if (!cachedRecord) {
      // 1. 无缓存，进行全量获取
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
}

export const dataManager = new DataManager();
