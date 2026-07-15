import { runBacktest } from '../utils/backtest';
import { setCustomStrategiesCache } from '../utils/strategies';

let cachedData = null;
let cachedBaseGrams = 1;
let cachedParams = null;

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'init') {
    // 缓存数据和不会在穷举中改变的基础参数，避免后续每个任务传递巨量数据
    cachedData = payload.data;
    cachedBaseGrams = payload.baseGrams;
    cachedParams = payload.params;
    
    // 注入前端主线程传来的自定义策略
    setCustomStrategiesCache(payload.customBuyStrategies, payload.customSellStrategies);
    
    self.postMessage({ type: 'init_done' });
  } else if (type === 'run') {
    const { jobId, buyStrat, sellStrats } = payload;
    
    try {
      const result = runBacktest(cachedData, buyStrat, cachedBaseGrams, {
        ...cachedParams,
        allowSell: sellStrats.length > 0,
        sellStrategies: sellStrats
      });

      self.postMessage({
        type: 'result',
        jobId,
        buyStrat,
        sellStrats,
        result
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        jobId,
        error: error.message
      });
    }
  }
};
