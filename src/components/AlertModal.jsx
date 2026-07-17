import React, { useState, useEffect, useRef } from 'react';

export const alertService = {
  listeners: [],
  alert: (message, title = '提示') => {
    alertService.listeners.forEach(l => l(message, title));
  },
  subscribe: (listener) => {
    alertService.listeners.push(listener);
    return () => {
      alertService.listeners = alertService.listeners.filter(l => l !== listener);
    };
  }
};

export function GlobalAlertModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [alertContent, setAlertContent] = useState({ title: '', message: '' });
  const modalRef = useRef(null);

  useEffect(() => {
    const unsubscribe = alertService.subscribe((message, title) => {
      setAlertContent({ title, message });
      setIsOpen(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
    }} onClick={() => setIsOpen(false)}>
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
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{alertContent.title}</h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
          {alertContent.message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button 
            onClick={() => setIsOpen(false)}
            style={{
              padding: '8px 24px', borderRadius: '6px', border: 'none',
              background: 'var(--accent-gold)', color: '#000', cursor: 'pointer',
              fontWeight: '600', fontSize: '0.9rem'
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
