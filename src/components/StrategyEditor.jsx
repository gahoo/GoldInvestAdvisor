import React, { useState, useEffect, useRef } from 'react';
import { parse } from 'mathjs';
import { alertService } from './AlertModal';

export function StrategyEditor({ type, strategy, isBuiltIn, readOnly, onSave, onCancel, onEdit, onDelete }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [script, setScript] = useState('');
  const [error, setError] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isScriptFocused, setIsScriptFocused] = useState(false);

  const descRef = useRef(null);
  const scriptRef = useRef(null);

  useEffect(() => {
    if (strategy) {
      setName(strategy.name || '');
      setDescription(strategy.description || '');
      setScript(strategy.script || '');
    } else {
      setName('');
      setDescription('');
      setScript('');
    }
  }, [strategy]);

  // Auto-resize textareas to fit content when readOnly
  useEffect(() => {
    if (readOnly) {
      if (descRef.current) {
        descRef.current.style.height = 'auto';
        descRef.current.style.height = `${descRef.current.scrollHeight}px`;
      }
      if (scriptRef.current) {
        scriptRef.current.style.height = 'auto';
        scriptRef.current.style.height = `${scriptRef.current.scrollHeight}px`;
      }
    } else {
      // Restore default heights for editing
      if (descRef.current) descRef.current.style.height = '60px';
      if (scriptRef.current) scriptRef.current.style.height = '140px';
    }
  }, [description, script, readOnly]);

  useEffect(() => {
    if (script && !readOnly) {
      try {
        parse(script);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    } else {
      setError(null);
    }
  }, [script, readOnly]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleSave = () => {
    if (!name.trim()) {
      alertService.alert("请输入策略名称", "验证失败");
      return;
    }
    if (!script.trim()) {
      alertService.alert("请输入策略脚本", "验证失败");
      return;
    }
    if (error) {
      alertService.alert("代码存在语法错误，请检查后再保存。", "保存失败");
      return;
    }

    const newStrategy = {
      id: strategy && strategy.id ? strategy.id : `custom_${type}_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      script: script.trim()
    };
    onSave(newStrategy);
  };

  const handleImportConfirm = () => {
    if (importJson.trim()) {
      try {
        const parsed = JSON.parse(importJson);
        if (parsed.name && parsed.script) {
          setName(parsed.name);
          setDescription(parsed.description || '');
          setScript(parsed.script);
          setShowImportModal(false);
          setToastMessage("导入成功！");
        } else {
          alertService.alert("JSON 格式不正确，缺少 name 或 script 字段。", "导入失败");
        }
      } catch (e) {
        alertService.alert("JSON 解析失败，请检查格式。", "导入失败");
      }
    }
  };

  const exportStrategy = () => {
    const exportObj = { name, description, script };
    const jsonStr = JSON.stringify(exportObj);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setToastMessage("策略配置已复制到剪贴板！");
    }).catch(err => {
      alertService.alert("复制失败，请手动复制以下代码：\n\n" + jsonStr, "复制失败");
    });
  };

  return (
    <div className="strategy-description" style={{ marginTop: '16px', padding: '16px', backgroundColor: 'var(--bg-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: '12px' }}>
          <span style={{ fontWeight: '600', marginRight: '8px', fontSize: '1rem' }}>
            {isBuiltIn ? '🧠' : '🛠️'}
          </span>
          <input 
            type="text" 
            placeholder="策略名称 (例: 激进抄底法)" 
            value={name}
            onChange={e => setName(e.target.value)}
            readOnly={readOnly}
            style={{ 
              flex: 1, 
              padding: readOnly ? '0' : '4px 8px', 
              borderRadius: '4px', 
              border: readOnly ? '1px solid transparent' : '1px solid var(--border-color)', 
              fontSize: '1rem', 
              fontWeight: '600', 
              background: readOnly ? 'transparent' : 'var(--bg-color)', 
              color: 'var(--text-primary)',
              outline: 'none',
              pointerEvents: readOnly ? 'none' : 'auto',
              transition: 'all 0.2s'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
          {readOnly && !isBuiltIn && onEdit && (
            <button onClick={onEdit} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>编辑</button>
          )}
          {readOnly && !isBuiltIn && onDelete && (
            <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--color-down)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>删除</button>
          )}
          {!readOnly && (
            <>
              <button onClick={() => setShowImportModal(true)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>导入</button>
            </>
          )}
          {strategy && strategy.id && (
            <button onClick={exportStrategy} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>导出</button>
          )}
        </div>
      </div>
      
      <textarea 
        ref={descRef}
        placeholder="策略说明 (选填，介绍这个策略的逻辑)" 
        value={description}
        onChange={e => setDescription(e.target.value)}
        readOnly={readOnly}
        style={{ 
          padding: readOnly ? '0' : '8px', 
          marginBottom: '12px', 
          borderRadius: '4px', 
          border: readOnly ? '1px solid transparent' : '1px solid var(--border-color)', 
          width: '100%', 
          resize: readOnly ? 'none' : 'vertical', 
          fontSize: '0.9rem',
          background: readOnly ? 'transparent' : 'var(--bg-color)', 
          color: 'var(--text-secondary)', 
          lineHeight: '1.6',
          outline: 'none',
          overflow: readOnly ? 'hidden' : 'auto',
          transition: 'all 0.2s'
        }}
      />

      <div style={{ position: 'relative' }}>
        <textarea 
          ref={scriptRef}
          value={script}
          onChange={e => setScript(e.target.value)}
          onFocus={() => setIsScriptFocused(true)}
          onBlur={() => setIsScriptFocused(false)}
          readOnly={readOnly}
          style={{ 
            width: '100%', 
            fontFamily: 'monospace', 
            padding: '12px', 
            borderRadius: '4px', 
            border: readOnly ? '1px solid #333' : '1px solid var(--border-color)', 
            backgroundColor: '#1e1e1e', 
            color: '#d4d4d4', 
            lineHeight: '1.5', 
            resize: readOnly ? 'none' : 'vertical',
            outline: 'none',
            overflow: readOnly ? 'hidden' : 'auto',
            fontSize: '0.85rem'
          }}
          placeholder={type === 'buy' ? 
            `// 示例代码:\ntargetPrice = currentPrice - (weeklyAtr * 0.5);\nmultiplier = max(0.1, min(3.0, 1.0 - (bias * 15)));\nreason = concat("自定义网格，倍率为 ", round(multiplier, 2));` : 
            `// 示例代码:\npnlRatio = averageCost > 0 ? (currentPrice - averageCost) / averageCost : 0;\nsellRatio = (rsi > 70 and pnlRatio > 0) ? 0.3 : 0;`
          }
        />

        {isScriptFocused && (
          <div style={{ 
            position: 'absolute', 
            top: 0, 
            left: 'calc(100% + 12px)', 
            width: '450px', 
            backgroundColor: 'var(--card-bg)', 
            border: '1px solid var(--accent-gold)', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', 
            zIndex: 100
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--accent-gold)', marginBottom: '8px' }}>
              📖 可用变量及输出要求
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              <strong>【全局可用变量】</strong>
              <ul style={{ paddingLeft: '20px', marginBottom: '8px', marginTop: '4px' }}>
                <li><code>currentPrice</code>: 当前金价</li>
                <li><code>weeklyAtr</code>: 周波动率</li>
                <li><code>bias</code>: MA60 乖离率</li>
                <li><code>rsi</code>: RSI(14) 指标</li>
                <li><code>fib_level382</code> / <code>fib_level618</code>: 斐波那契支撑位</li>
                <li><code>macro_dxy_changePercent</code>: 美元指数涨跌幅</li>
                <li><code>macro_tnx_changePercent</code>: 美债收益率涨跌幅</li>
                <li><code>macro_prob3m</code> / <code>macro_prob6m</code>: 3/6个月宏观看涨概率 (0-100)</li>
                <li><code>macro_m2_residual</code>: 央行购金溢价残差 (中美M2差值)</li>
                <li><code>macro_cftc_delta</code>: CFTC管理资金净多头变化</li>
                <li><code>is_ladder_enabled</code>: 界面是否勾选了"启用多档阶梯挂单"</li>
              </ul>

              <strong>【高级辅助函数】</strong>
              <ul style={{ paddingLeft: '20px', marginBottom: '8px', marginTop: '4px' }}>
                <li><code>cond(条件1, 结果1, 条件2, 结果2, ..., 默认结果)</code>: 类似 if-else 分支</li>
                <li><code>match(变量, 值1, 结果1, 值2, 结果2, ..., 默认结果)</code>: 类似 switch 分支</li>
                <li><code>singleOrder(价格, 倍率)</code>: 生成单笔挂单记录</li>
                <li><code>gridOrders(基准价, 总倍率, 档位数, 跌幅比例)</code>: 快速生成均分网格挂单</li>
                <li><code>weightedLadder(基准价, 跌幅数组, 倍率数组)</code>: 快速生成非对称加权阶梯。例如 <code>weightedLadder(550, [0.01, 0.05], [0.3, 0.7])</code> 将在跌1%处买0.3倍，跌5%处买0.7倍</li>
              </ul>
              
              {type === 'buy' ? (
                <>
                  <strong>【买入策略专属参数】</strong>
                  <ul style={{ paddingLeft: '20px', marginBottom: '8px', marginTop: '4px' }}>
                    <li><code>wday</code>: 当前星期几 (1-7)</li>
                    <li><code>calendar_bestBuyDay</code>: 历史统计最佳买入日</li>
                  </ul>
                  <strong>【需计算赋值的变量 (基础/高级二选一)】</strong>
                  <ul style={{ paddingLeft: '20px', marginBottom: '0', marginTop: '4px' }}>
                    <li><strong>基础模式：</strong> 赋值 <code>targetPrice</code> (挂单价) 与 <code>multiplier</code> (倍率, 默认1)</li>
                    <li><strong>高级模式 (阶梯挂单)：</strong> 赋值 <code>orders</code> 数组。可使用 <code>orders = gridOrders(...)</code> 生成</li>
                    <li><code>reason</code>: (可选) 决策说明，用 <code>concat()</code> 拼接</li>
                  </ul>
                </>
              ) : (
                <>
                  <strong>【卖出策略专属参数】</strong>
                  <ul style={{ paddingLeft: '20px', marginBottom: '8px', marginTop: '4px' }}>
                    <li><code>currentHoldings</code>: 当前持仓克数</li>
                    <li><code>averageCost</code>: 当前持仓平均成本</li>
                  </ul>
                  <strong>【必须计算赋值的变量】</strong>
                  <ul style={{ paddingLeft: '20px', marginBottom: '0', marginTop: '4px' }}>
                    <li><code>sellRatio</code>: (必选) 卖出比例 0~1</li>
                    <li><code>reason</code>: (可选) 决策说明，用 <code>concat()</code> 拼接</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {error && !readOnly && <div style={{ color: 'var(--color-down)', marginTop: '8px', fontSize: '0.9rem' }}>Syntax Error: {error}</div>}

      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button onClick={onCancel} style={{ padding: '6px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>取消</button>
          <button onClick={handleSave} className="btn-primary" style={{ padding: '6px 16px' }}>保存</button>
        </div>
      )}

      {showImportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '24px', borderRadius: '8px', width: '90%', maxWidth: '500px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>导入策略</h3>
            <textarea 
              placeholder="请粘贴导出的策略 JSON 代码..." 
              value={importJson}
              onChange={e => setImportJson(e.target.value)}
              style={{ width: '100%', height: '120px', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'monospace' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setShowImportModal(false)} style={{ padding: '6px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>取消</button>
              <button onClick={handleImportConfirm} className="btn-primary" style={{ padding: '6px 16px' }}>确认导入</button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'var(--accent-gold)', color: '#000', padding: '10px 24px', borderRadius: '24px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 1100 }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
