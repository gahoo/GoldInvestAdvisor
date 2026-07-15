import React from 'react';

const BackgroundTaskToast = ({ tasks }) => {
  if (!tasks || tasks.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      {tasks.map((task) => (
        <div key={task.id} className="card" style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          minWidth: '250px',
          margin: 0,
          opacity: task.removing ? 0 : 1,
          transform: task.removing ? 'translateX(50px)' : 'translateX(0)',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (task.done || task.progress === null) ? '0' : '12px' }}>
            <div>
              <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                {task.done ? task.name : `⏳ ${task.name}...`}
              </span>
              {task.desc && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {task.desc}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BackgroundTaskToast;
