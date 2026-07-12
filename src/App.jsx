import React, { useState, useEffect } from 'react';
import CustomerView from './components/CustomerView';
import KitchenView from './components/KitchenView';
import CashierView from './components/CashierView';
import BookkeepingView from './components/BookkeepingView';
import PinLockScreen from './components/PinLockScreen';

function App() {
  const [role, setRole] = useState(null); // 'customer', 'kitchen', 'pos', 'bookkeeping', or null (demo selection)
  const [tableNumber, setTableNumber] = useState(null);
  
  // Authentication states
  const [isKitchenAuth, setIsKitchenAuth] = useState(() => {
    return localStorage.getItem('is_kitchen_authenticated') === 'true' ||
           sessionStorage.getItem('is_kitchen_authenticated') === 'true';
  });
  const [isCashierAuth, setIsCashierAuth] = useState(() => {
    return localStorage.getItem('is_cashier_authenticated') === 'true' ||
           sessionStorage.getItem('is_cashier_authenticated') === 'true';
  });
  const [isBookkeepingAuth, setIsBookkeepingAuth] = useState(() => {
    return localStorage.getItem('is_bookkeeping_authenticated') === 'true' ||
           sessionStorage.getItem('is_bookkeeping_authenticated') === 'true';
  });

  // Check hostname and URL parameters for immediate routing
  useEffect(() => {
    const hostname = window.location.hostname;
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    const adminParam = params.get('admin');
    const posParam = params.get('pos');
    const bookkeepingParam = params.get('bookkeeping');
    const demoParam = params.get('demo');

    // 1. Subdomain-based routing (pos.* -> POS, admin.* -> Kitchen, bookkeeping.* -> Bookkeeping)
    if (hostname.startsWith('pos.')) {
      setRole('pos');
    } else if (hostname.startsWith('admin.')) {
      setRole('kitchen');
    } else if (hostname.startsWith('bookkeeping.')) {
      setRole('bookkeeping');
    }
    // 2. URL parameter routing
    else if (adminParam === 'true') {
      setRole('kitchen');
    } else if (posParam === 'true') {
      setRole('pos');
    } else if (bookkeepingParam === 'true') {
      setRole('bookkeeping');
    } else if (tableParam) {
      setTableNumber(tableParam);
      setRole('customer');
    } else if (demoParam === 'true') {
      setRole(null);
    } else {
      // Default to customer view for other hostnames
      setRole('customer');
      setTableNumber(null);
    }
  }, []);

  const handleSelectCustomer = (tableNum = null) => {
    setTableNumber(tableNum);
    setRole('customer');
    const newUrl = tableNum 
      ? `${window.location.pathname}?table=${tableNum}` 
      : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  };

  const handleSelectKitchen = () => {
    setRole('kitchen');
    window.history.pushState({}, '', `${window.location.pathname}?admin=true`);
  };

  const handleSelectPos = () => {
    setRole('pos');
    window.history.pushState({}, '', `${window.location.pathname}?pos=true`);
  };

  const handleSelectBookkeeping = () => {
    setRole('bookkeeping');
    window.history.pushState({}, '', `${window.location.pathname}?bookkeeping=true`);
  };

  const handleBackToDemo = () => {
    setRole(null);
    setTableNumber(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  // Auth callbacks
  const handleKitchenAuthSuccess = (remember) => {
    setIsKitchenAuth(true);
    if (remember) {
      localStorage.setItem('is_kitchen_authenticated', 'true');
    } else {
      sessionStorage.setItem('is_kitchen_authenticated', 'true');
    }
  };

  const handleKitchenLogout = () => {
    setIsKitchenAuth(false);
    localStorage.removeItem('is_kitchen_authenticated');
    sessionStorage.removeItem('is_kitchen_authenticated');
  };

  const handleCashierAuthSuccess = (remember) => {
    setIsCashierAuth(true);
    if (remember) {
      localStorage.setItem('is_cashier_authenticated', 'true');
    } else {
      sessionStorage.setItem('is_cashier_authenticated', 'true');
    }
  };

  const handleCashierLogout = () => {
    setIsCashierAuth(false);
    localStorage.removeItem('is_cashier_authenticated');
    sessionStorage.removeItem('is_cashier_authenticated');
  };

  const handleBookkeepingAuthSuccess = (remember) => {
    setIsBookkeepingAuth(true);
    if (remember) {
      localStorage.setItem('is_bookkeeping_authenticated', 'true');
    } else {
      sessionStorage.setItem('is_bookkeeping_authenticated', 'true');
    }
  };

  const handleBookkeepingLogout = () => {
    setIsBookkeepingAuth(false);
    localStorage.removeItem('is_bookkeeping_authenticated');
    sessionStorage.removeItem('is_bookkeeping_authenticated');
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
    if (!isKitchenAuth) {
      return (
        <PinLockScreen 
          expectedPin="8888" 
          onSuccess={handleKitchenAuthSuccess}
          title="商家接單管理後台"
          subtitle="請輸入四位數管理員 PIN 碼進行驗證"
        />
      );
    }
    return (
      <KitchenView 
        onBackToDemo={handleBackToDemo} 
        onLogout={handleKitchenLogout}
      />
    );
  }

  if (role === 'pos') {
    if (!isCashierAuth) {
      return (
        <PinLockScreen 
          expectedPin="6666" 
          onSuccess={handleCashierAuthSuccess}
          title="現場收銀系統 (POS)"
          subtitle="請輸入四位數收銀員 PIN 碼進行驗證"
        />
      );
    }
    return (
      <CashierView 
        onLogout={handleCashierLogout}
      />
    );
  }

  if (role === 'bookkeeping') {
    if (!isBookkeepingAuth) {
      return (
        <PinLockScreen 
          expectedPin="8888" 
          onSuccess={handleBookkeepingAuthSuccess}
          title="營業記帳與報表系統"
          subtitle="請輸入四位數管理員 PIN 碼進行驗證"
        />
      );
    }
    return (
      <BookkeepingView 
        onBackToDemo={handleBackToDemo} 
        onLogout={handleBookkeepingLogout}
      />
    );
  }

  return (
    <div className="demo-shell" style={{ paddingBottom: '50px' }}>
      <span className="demo-logo">🥢</span>
      <h1 className="demo-title">龍城麵線 餐廳點餐與接單系統</h1>
      <p className="demo-subtitle">
        專為麵線店打造的點餐與櫃檯收銀系統。支援內用掃碼、預約外帶自取與現場實體 POS，跨視窗即時接單同步。
      </p>

      <div className="demo-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
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

        {/* Cashier POS view */}
        <div className="demo-card" onClick={handleSelectPos}>
          <span className="demo-card-icon">💵</span>
          <h2 className="demo-card-title">現場收銀系統 (POS)</h2>
          <p className="demo-card-desc">
            櫃檯實體收銀結帳系統。支援選取品項、加料客製、現金找零與自動送單至廚房。
            <br />
            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>(預設 PIN 碼：6666)</span>
          </p>
          <button className="demo-btn" style={{ backgroundColor: '#16a34a' }}>進入收銀系統</button>
        </div>

        {/* Admin/Kitchen view */}
        <div className="demo-card" onClick={handleSelectKitchen}>
          <span className="demo-card-icon">👨‍🍳</span>
          <h2 className="demo-card-title">商家接單與設定</h2>
          <p className="demo-card-desc">
            廚房與櫃檯接單系統。即時接收點餐、出餐，並可於此控制菜單上架與佐料供應。
            <br />
            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>(預設 PIN 碼：8888)</span>
          </p>
          <button className="demo-btn">進入接單後台</button>
        </div>

        {/* Bookkeeping view */}
        <div className="demo-card" onClick={handleSelectBookkeeping}>
          <span className="demo-card-icon">📊</span>
          <h2 className="demo-card-title">營業記帳與報表</h2>
          <p className="demo-card-desc">
            獨立財務對帳系統。登錄固定與進貨變動成本、調取流水明細、匯出月報表與每日收店。
            <br />
            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>(預設 PIN 碼：8888)</span>
          </p>
          <button className="demo-btn" style={{ backgroundColor: '#8b5cf6' }}>進入記帳系統</button>
        </div>
      </div>

      <div 
        style={{ 
          marginTop: '40px', 
          padding: '16px', 
          backgroundColor: 'rgba(255, 107, 53, 0.05)', 
          borderRadius: 'var(--radius-md)',
          maxWidth: '650px',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          lineHeight: '1.6',
          border: '1px dashed var(--primary)',
          textAlign: 'left',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}
      >
        <strong style={{ color: 'var(--primary)' }}>💡 龍城麵線系統測試教學：</strong>
        <ol style={{ paddingLeft: '20px', marginTop: '6px' }}>
          <li>點選 <strong>「進入接單與設定」</strong>，開啟後點選畫面中的「🔊 開啟接單音效」接收訂單。</li>
          <li>在新分頁開啟 <strong>「現場收銀系統 (POS)」</strong> 進行現場實體收銀與出餐模擬。</li>
          <li>在新分頁開啟 <strong>「模擬點餐」</strong> 以顧客視角下單。</li>
          <li>點選 <strong>「進入營業記帳與報表」</strong> 輸入 `8888` 收店驗證，解鎖財務、固定成本與按月利潤報表。</li>
        </ol>
      </div>
    </div>
  );
}

export default App;
