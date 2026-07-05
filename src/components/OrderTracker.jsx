import React from 'react';

export default function OrderTracker({ order, onBackToMenu }) {
  if (!order) return null;

  // Map state to progress percentage and title
  const getStatusDetails = (status) => {
    switch (status) {
      case 'received':
        return {
          percent: 25,
          title: '已接單',
          desc: '廚房已收到您的訂單，準備開始製作。',
          stepClass: ['active', '', '', '']
        };
      case 'preparing':
        return {
          percent: 50,
          title: '製作中',
          desc: '美味的麵線現點現做中，請稍候。',
          stepClass: ['completed', 'active', '', '']
        };
      case 'ready':
        return {
          percent: 75,
          title: order.type === 'dine-in' ? '餐點已送達 / 請自取' : '餐點已完成，請至櫃檯取餐',
          desc: order.type === 'dine-in' 
            ? `餐點已送至 ${order.tableName} 號桌，祝您用餐愉快！` 
            : '請出示下方條碼至櫃檯結帳取餐。',
          stepClass: ['completed', 'completed', 'active', '']
        };
      case 'completed':
        return {
          percent: 100,
          title: '訂單已完成',
          desc: '謝謝您的光臨！歡迎下次再來！',
          stepClass: ['completed', 'completed', 'completed', 'active']
        };
      default:
        return {
          percent: 0,
          title: '處理中',
          desc: '訂單處理中...',
          stepClass: ['', '', '', '']
        };
    }
  };

  const statusDetails = getStatusDetails(order.status);

  return (
    <div className="order-tracker-card">
      <div className="tracker-title">📋 訂單追蹤</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        單號: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{order.id}</span>
      </div>

      <div className="tracker-status-box">
        <div className="status-highlight">{statusDetails.title}</div>
        <div className="status-sub">{statusDetails.desc}</div>
      </div>

      {/* Progress Bar */}
      <div className="progress-stepper">
        <div className="progress-bar-fill" style={{ width: `${statusDetails.percent - 12.5}%` }}></div>
        <div className={`step-node ${statusDetails.stepClass[0]}`}>
          <div className="step-circle">1</div>
          <span className="step-label">已收單</span>
        </div>
        <div className={`step-node ${statusDetails.stepClass[1]}`}>
          <div className="step-circle">2</div>
          <span className="step-label">製作中</span>
        </div>
        <div className={`step-node ${statusDetails.stepClass[2]}`}>
          <div className="step-circle">3</div>
          <span className="step-label">{order.type === 'dine-in' ? '已送餐' : '待取餐'}</span>
        </div>
        <div className={`step-node ${statusDetails.stepClass[3]}`}>
          <div className="step-circle">4</div>
          <span className="step-label">已結案</span>
        </div>
      </div>

      {/* Order Success Message & Serial Number Card */}
      <div style={{
        backgroundColor: 'rgba(34, 197, 94, 0.05)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        margin: '16px 0',
        color: '#16a34a',
        fontWeight: 'bold',
        fontSize: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}>
        🎉 下單成功！餐點製作進度將即時更新
      </div>

      <div style={{
        backgroundColor: 'rgba(255, 107, 53, 0.05)',
        border: '2px dashed var(--primary)',
        borderRadius: 'var(--radius-md)',
        padding: '24px 16px',
        margin: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>您的取餐號碼 (流水號)</span>
        <span style={{ fontSize: '2.8rem', fontWeight: 900, color: 'var(--primary)', letterSpacing: '1px', lineHeight: 1 }}>
          {order.serialNum || 'A-001'}
        </span>
        {order.type === 'takeout' ? (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            預計取餐時間: <strong style={{ color: 'var(--text-main)' }}>{order.pickupTime}</strong>
          </span>
        ) : (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            內用桌位: <strong style={{ color: 'var(--text-main)' }}>{order.tableName} 號桌</strong>
          </span>
        )}
      </div>

      {order.type === 'takeout' && order.status !== 'completed' && (
        <div style={{ margin: '16px 0' }}>
          <div className="barcode-sim" style={{ margin: '8px auto 12px auto' }}>||||| | |||| || ||| {order.id.slice(-6)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            取餐姓名: {order.customerName} | 電話: {order.customerPhone || '無'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            提示: 請於到店時向櫃檯人員出示此畫面以利核對。
          </div>
        </div>
      )}


      {/* Receipt Summary */}
      <div className="tracker-receipt">
        <div className="tracker-receipt-title">明細項目</div>
        {order.items.map((item, idx) => (
          <div key={idx} className="tracker-receipt-item">
            <div>
              <strong>{item.name} x {item.quantity}</strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                {item.specs.join(', ')}
              </div>
            </div>
            <span>NT$ {item.totalPrice}</span>
          </div>
        ))}
        <div className="summary-row total" style={{ paddingBottom: 0, borderBottom: 'none' }}>
          <span>實付總計</span>
          <span>NT$ {order.total}</span>
        </div>
      </div>

      <button 
        className="btn-secondary" 
        style={{ width: '100%', marginTop: '24px', padding: '12px' }}
        onClick={onBackToMenu}
      >
        返回菜單
      </button>
    </div>
  );
}
