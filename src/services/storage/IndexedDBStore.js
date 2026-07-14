import { openDB } from 'idb';

const DB_NAME = 'invest_advisor_db';
const STORE_NAME = 'market_data';
const DB_VERSION = 1;

/**
 * 封装 IndexedDB 操作的本地存储类
 */
export class IndexedDBStore {
  constructor() {
    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // 创建对象仓库，直接不使用 KeyPath，使用出入显式的 key
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }

  /**
   * 保存时间序列数据及其元数据到本地缓存
   * @param {string} cacheKey 复合主键 (如 source:assetType:symbol:interval:adj)
   * @param {Object} metadata 缓存元数据 (如 coverageStart, coverageEnd, lastFullRefreshAt)
   * @param {Array<import('../../models/TimeSeriesPoint').TimeSeriesPoint>} data 要缓存的数据 (仅 isFinal=true)
   */
  async saveSeries(cacheKey, metadata, data) {
    const db = await this.dbPromise;
    const record = {
      cacheKey,
      metadata,
      data,
      updatedAt: Date.now()
    };
    await db.put(STORE_NAME, record, cacheKey);
  }

  /**
   * 从本地缓存获取数据及元数据
   * @param {string} cacheKey 复合主键
   * @returns {Promise<{metadata: Object, data: Array<import('../../models/TimeSeriesPoint').TimeSeriesPoint>} | null>}
   */
  async getSeries(cacheKey) {
    const db = await this.dbPromise;
    const record = await db.get(STORE_NAME, cacheKey);
    if (record) {
      return {
        metadata: record.metadata,
        data: record.data
      };
    }
    return null;
  }

  /**
   * 获取所有缓存的数据项及其元数据 (不包含庞大的 data 数组)
   * @returns {Promise<Array<{cacheKey: string, metadata: Object, updatedAt: number}>>}
   */
  async getAllSeriesMetadata() {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    let cursor = await store.openCursor();
    const results = [];
    
    while (cursor) {
      results.push({
        cacheKey: cursor.value.cacheKey,
        metadata: cursor.value.metadata,
        updatedAt: cursor.value.updatedAt
      });
      cursor = await cursor.continue();
    }
    return results;
  }

  /**
   * 删除某个缓存
   * @param {string} cacheKey 复合主键
   */
  async deleteSeries(cacheKey) {
    const db = await this.dbPromise;
    await db.delete(STORE_NAME, cacheKey);
  }

  /**
   * 清除所有缓存
   */
  async clearAll() {
    const db = await this.dbPromise;
    await db.clear(STORE_NAME);
  }
}

// 导出一个单例
export const dbStore = new IndexedDBStore();
