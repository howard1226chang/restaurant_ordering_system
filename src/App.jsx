import React, { useState, useEffect } from 'react';
import CustomerView from './components/CustomerView';
import KitchenView from './components/KitchenView';

function App() {
  const [role, setRole] = useState(null); // 'customer', 'kitchen', or null (demo selection)
  const [tableNumber, setTableNumber] = useState(null);

  // Check URL parameters for immediate routing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    const adminParam = params.get('admin');
    const demoParam = params.get('demo');

    if (adminParam === 'true') {
      setRole('kitchen');
    } else if (tableParam) {
      setTableNumber(tableParam);
      setRole('customer');
    } else if (demoParam === 'true') {
      setRole(null);
    } else {
      setRole('customer');
      setTableNumber(null);
    }
  }, []);

  const handleSelectCustomer = (tableNum = null) => {
    setTableNumber(tableNum);
    setRole('customer');
    // Update URL query parameters without page reload
    const newUrl = tableNum 
      ? `${window.location.pathname}?table=${tableNum}` 
      : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  };

  const handleSelectKitchen = () => {
    setRole('kitchen');
    window.history.pushState({}, '', `${window.location.pathname}?admin=true`);
  };

  const handleBackToDemo = () => {
    setRole(null);
    setTableNumber(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  // Render view based on active role
  if (role === 'customer') {
    return (
      <CustomerView 
        tableNumber={tableNumber} 
        onBackToDemo={handleBackToDemo} 
      />
    );
  }

  if (role === 'kitchen') {
    return (
      <KitchenView 
        onBackToDemo={handleBackToDemo} 
      />
    );
  }

  return (
    <div className="demo-shell">
      <span className="demo-logo">🥢</span>
      <h1 className="demo-title">龍城麵線 餐廳點餐與接單系統</h1>
      <p className="demo-subtitle">
        專為麵線店打造的點餐展示系統。支援內用掃碼與預約外帶自取，跨視窗即時接單同步。
      </p>

      <div className="demo-card-grid">
        {/* Dine-in customer mock */}
        <div className="demo-card" onClick={() => handleSelectCustomer('5')}>
          <span className="demo-card-icon">📱</span>
          <h2 className="demo-card-title">模擬內用點餐</h2>
          <p className="demo-card-desc">
            模擬顧客掃描「5號桌」QR Code。系統會自動鎖定為內用並帶入桌號，下單後免排隊。
          </p>
          <button className="demo-btn">以 5 號桌進入</button>
        </div>

        {/* Takeout customer mock */}
        <div className="demo-card" onClick={() => handleSelectCustomer(null)}>
          <span className="demo-card-icon">🛍️</span>
          <h2 className="demo-card-title">模擬外帶點餐</h2>
          <p className="demo-card-desc">
            模擬線上點餐。顧客可輸入姓名、手機與選擇取餐時間，到店後快速結帳取餐。
          </p>
          <button className="demo-btn">以 外帶模式進入</button>
        </div>

        {/* Admin/Kitchen view */}
        <div className="demo-card" onClick={handleSelectKitchen}>
          <span className="demo-card-icon">👨‍🍳</span>
          <h2 className="demo-card-title">商家接單後台</h2>
          <p className="demo-card-desc">
            廚房與櫃檯接單系統。即時接收顧客點餐，更新製作狀態，並同步通知顧客端。
          </p>
          <button className="demo-btn">進入接單後台</button>
        </div>
      </div>

      <div 
        style={{ 
          marginTop: '40px', 
          padding: '16px', 
          backgroundColor: 'rgba(255, 107, 53, 0.05)', 
          borderRadius: 'var(--radius-md)',
          maxWidth: '600px',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          lineHeight: '1.6',
          border: '1px dashed var(--primary)',
          textAlign: 'left'
        }}
      >
        <strong style={{ color: 'var(--primary)' }}>💡 完美雙視窗測試教學：</strong>
        <ol style={{ paddingLeft: '20px', marginTop: '6px' }}>
          <li>點選 <strong>「進入接單後台」</strong>，開啟後點選畫面中的「🔊 開啟接單音效」。</li>
          <li>複製目前的網址，在<strong>新無痕視窗或另一個瀏覽器分頁</strong>開啟。</li>
          <li>在新視窗中選擇 <strong>「模擬內用」</strong> 或 <strong>「模擬外帶」</strong> 並送出訂單。</li>
          <li>您會聽到接單後台傳來<strong>鈴聲通知</strong>，且新訂單會即時閃爍出現在待處理區！</li>
          <li>在後台點擊「開始製作」與「製作完成」，顧客視窗的<strong>進度條會自動同步跳轉</strong>！</li>
        </ol>
      </div>
    </div>
  );
}

export default App;
