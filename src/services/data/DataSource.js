/**
 * 数据源基础接口 (抽象类)
 * 规范了所有子类需要实现的方法
 */
export class DataSource {
  /**
   * @param {string} sourceId 数据源唯一标识 (如 'ccb', 'yahoo')
   */
  constructor(sourceId) {
    this.sourceId = sourceId;
  }

  /**
   * 获取历史数据
   * @param {string} symbol 标的代码
   * @param {string} range 时间范围 (如 '10y', '1mo')
   * @returns {Promise<Array<import('../../models/TimeSeriesPoint').TimeSeriesPoint>>}
   */
  async fetchHistorical(symbol, range) {
    throw new Error('fetchHistorical() must be implemented by subclass');
  }

  /**
   * 获取最近更新的增量数据 (包含回溯以处理除权等修正)
   * 默认实现可以调用 fetchHistorical 获取一个较短的时间段
   * @param {string} symbol 标的代码
   * @param {number} backfillDays 回溯天数
   * @returns {Promise<Array<import('../../models/TimeSeriesPoint').TimeSeriesPoint>>}
   */
  async fetchDelta(symbol, backfillDays = 30) {
    // 默认可以请求最近几个月的数据，子类可以针对性优化
    return this.fetchHistorical(symbol, '1y'); 
  }
}
