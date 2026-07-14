import { TimeSeriesPoint } from '../models/TimeSeriesPoint.js';

/**
 * 严格校验的 CSV 导入模块
 */
export async function importCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const data = parseCSVText(text);
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

function parseCSVText(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV 文件为空或没有数据行');
  }

  // 解析表头并小写化以兼容各种命名
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  // 必须存在的列
  const requiredCols = ['date', 'close'];
  for (const col of requiredCols) {
    if (!headers.includes(col)) {
      throw new Error(`CSV 缺失必填列: ${col}`);
    }
  }

  const parsedData = [];
  const dateSet = new Set();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',');
    const record = {};
    
    headers.forEach((header, index) => {
      record[header] = values[index] ? values[index].trim() : null;
    });

    // 校验日期格式 (尝试转换为标准 YYYY-MM-DD)
    const dateStr = record['date'];
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      throw new Error(`第 ${i + 1} 行日期格式错误: ${dateStr}`);
    }
    const isoDate = d.toLocaleDateString('en-CA'); // 统一格式

    if (dateSet.has(isoDate)) {
      throw new Error(`发现重复的日期数据: ${isoDate}`);
    }
    dateSet.add(isoDate);

    const close = parseFloat(record['close']);
    if (isNaN(close)) {
      throw new Error(`第 ${i + 1} 行收盘价无效: ${record['close']}`);
    }

    const open = record['open'] ? parseFloat(record['open']) : null;
    const high = record['high'] ? parseFloat(record['high']) : null;
    const low = record['low'] ? parseFloat(record['low']) : null;
    const volume = record['volume'] ? parseFloat(record['volume']) : null;

    parsedData.push(new TimeSeriesPoint({
      date: isoDate,
      assetType: 'unknown',
      isFinal: true, // 导入的历史数据默认均视为已固化
      close,
      open: !isNaN(open) ? open : null,
      high: !isNaN(high) ? high : null,
      low: !isNaN(low) ? low : null,
      volume: !isNaN(volume) ? volume : null,
    }));
  }

  // 强制升序排列
  parsedData.sort((a, b) => a.date.localeCompare(b.date));
  
  return parsedData;
}

/**
 * 将数据导出为 CSV
 */
export function exportToCSV(data, filename = 'market_data.csv') {
  if (!data || data.length === 0) return;
  
  const headers = ['date', 'open', 'high', 'low', 'close', 'volume'];
  const rows = [headers.join(',')];
  
  data.forEach(point => {
    const row = [
      point.date,
      point.open || '',
      point.high || '',
      point.low || '',
      point.close,
      point.volume || ''
    ];
    rows.push(row.join(','));
  });
  
  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
