import React, { useEffect, useRef } from 'react';

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = '确定', cancelText = '取消', confirmColor = 'var(--color-down)' }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) onCancel();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
    }} onClick={onCancel}>
      <div 
        ref={modalRef}
        style={{
          backgroundColor: 'var(--card-bg)', borderRadius: '12px',
          padding: '24px', width: '90%', maxWidth: '400px',
          boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)',
          transform: 'scale(1)', transition: 'transform 0.2s',
          display: 'flex', flexDirection: 'column', gap: '16px'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <button 
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-color)',
              background: 'var(--bg-color)', color: 'var(--text-secondary)', cursor: 'pointer',
              fontWeight: '500', fontSize: '0.9rem'
            }}
          >
            {cancelText}
          </button>
          <button 
            onClick={() => { onConfirm(); onCancel(); }}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              background: confirmColor, color: '#fff', cursor: 'pointer',
              fontWeight: '500', fontSize: '0.9rem'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
