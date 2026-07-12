import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { formatSupabaseOrder } from './CustomerView';

export default function BookkeepingView({ onBackToDemo, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [fixedCosts, setFixedCosts] = useState([]);
  
  const [isPurchasesOnCloud, setIsPurchasesOnCloud] = useState(false);
  const [isFixedCostsOnCloud, setIsFixedCostsOnCloud] = useState(false);
  
  // Date Selection
  const [selectedBookkeepingDate, setSelectedBookkeepingDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('sales'); // 'sales', 'variable', 'fixed', 'monthly'
  
  // Daily Closing State
  const [closedDates, setClosedDates] = useState(() => {
    return JSON.parse(localStorage.getItem('restaurant_closed_dates') || '[]');
  });

  // Form states for adding purchases (Variable Costs)
  const [purchaseDate, setPurchaseDate] = useState(selectedBookkeepingDate || '');
  const [purchaseVendor, setPurchaseVendor] = useState('');
  const [purchaseItemName, setPurchaseItemName] = useState('滷大腸');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('paid');

  // Form states for adding fixed costs
  const [fcName, setFcName] = useState('');
  const [fcCost, setFcCost] = useState('');
  const [fcExpiry, setFcExpiry] = useState('');

  // Fetch orders from Supabase
  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        setOrders(data.map(formatSupabaseOrder).filter(Boolean));
      }
    } catch (err) {
      console.error("Failed to load orders in BookkeepingView:", err);
      setOrders(JSON.parse(localStorage.getItem('restaurant_orders') || '[]'));
    }
  };

  // Fetch purchases from Supabase
  const fetchPurchases = async () => {
    try {
      const { data, error } = await supabase.from('purchases').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped = data.map(p => ({
          id: String(p.id),
          date: p.date,
          time: p.time,
          vendor: p.vendor,
          itemName: p.item_name,
          quantity: p.quantity,
          cost: Number(p.cost),
          status: p.status
        }));
        setPurchases(mapped);
        setIsPurchasesOnCloud(true);
      }
    } catch (err) {
      console.warn("Supabase purchases fallback to localStorage in BookkeepingView:", err.message);
      setPurchases(JSON.parse(localStorage.getItem('restaurant_purchases') || '[]'));
      setIsPurchasesOnCloud(false);
    }
  };

  // Fetch fixed costs from Supabase
  const fetchFixedCosts = async () => {
    try {
      const { data, error } = await supabase.from('fixed_costs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped = data.map(fc => ({
          id: String(fc.id),
          name: fc.name,
          cost: Number(fc.cost),
          expiryDate: fc.expiry_date
        }));
        setFixedCosts(mapped);
        setIsFixedCostsOnCloud(true);
      }
    } catch (err) {
      console.warn("Supabase fixed_costs fallback to localStorage in BookkeepingView:", err.message);
      setFixedCosts(JSON.parse(localStorage.getItem('restaurant_fixed_costs') || '[]'));
      setIsFixedCostsOnCloud(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchPurchases();
    fetchFixedCosts();
  }, []);

  // Sync closedDates across storage updates (e.g. from cashier closing shop)
  useEffect(() => {
    const handleStorageChange = () => {
      setClosedDates(JSON.parse(localStorage.getItem('restaurant_closed_dates') || '[]'));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Sync form purchase date with selected viewing date
  useEffect(() => {
    setPurchaseDate(selectedBookkeepingDate);
  }, [selectedBookkeepingDate]);

  // Listen for PostgreSQL database changes in real-time
  useEffect(() => {
    const ordersChannel = supabase.channel('bookkeeping-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    const purchasesChannel = supabase.channel('bookkeeping-purchases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
        fetchPurchases();
      })
      .subscribe();

    const fixedCostsChannel = supabase.channel('bookkeeping-fixed-costs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_costs' }, () => {
        fetchFixedCosts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(purchasesChannel);
      supabase.removeChannel(fixedCostsChannel);
    };
  }, []);

  // Soft-delete sales bookkeeping record
  const handleDeleteBookkeepingOrder = async (orderId, currentRemarks) => {
    if (!window.confirm("警告：您確定要刪除此筆已完成的營業流水帳紀錄嗎？\n此操作將從當日營收中扣除，且刪除歷程將被存檔記錄！")) {
      return;
    }

    const reason = window.prompt("請輸入刪除此帳目紀錄的緣由 (必要)：");
    if (!reason || !reason.trim()) {
      alert("必須輸入刪除緣由才能進行刪除！");
      return;
    }

    try {
      const updatedRemarks = `${currentRemarks || ''} [已刪除 - 原因: ${reason.trim()}]`;
      const { error } = await supabase.from('orders').update({
        status: 'deleted',
        remarks: updatedRemarks
      }).eq('id', orderId);
      
      if (error) throw error;
      alert("已成功刪除該筆帳目紀錄！");
      fetchOrders();
    } catch (err) {
      console.error("Failed to soft-delete order in BookkeepingView:", err);
      // LocalStorage fallback
      const savedOrders = JSON.parse(localStorage.getItem('restaurant_orders') || '[]');
      const updated = savedOrders.map(o => {
        if (o.id === orderId) {
          return { ...o, status: 'deleted', remarks: `${o.remarks || ''} [已刪除 - 原因: ${reason.trim()}]` };
        }
        return o;
      });
      localStorage.setItem('restaurant_orders', JSON.stringify(updated));
      fetchOrders();
      alert("已由本機存檔執行軟刪除！");
    }
  };

  // Add Purchase (Variable Cost)
  const handleAddPurchase = async (e) => {
    e.preventDefault();
    if (!purchaseVendor.trim() || !purchaseQty.trim() || !purchaseCost) return;

    const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const costNum = Number(purchaseCost);

    if (isPurchasesOnCloud) {
      try {
        const { error } = await supabase.from('purchases').insert([{
          purchase_id: `PUR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
          date: purchaseDate,
          time,
          vendor: purchaseVendor.trim(),
          item_name: purchaseItemName,
          quantity: purchaseQty.trim(),
          cost: costNum,
          status: purchaseStatus
        }]);
        if (error) throw error;
        fetchPurchases();
      } catch (err) {
        console.error("Failed to add purchase in BookkeepingView:", err);
        alert("新增變動支出失敗！");
      }
    } else {
      const newPurchase = {
        id: `PUR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
        date: purchaseDate,
        time,
        vendor: purchaseVendor.trim(),
        itemName: purchaseItemName,
        quantity: purchaseQty.trim(),
        cost: costNum,
        status: purchaseStatus
      };
      const updated = [newPurchase, ...purchases];
      setPurchases(updated);
      localStorage.setItem('restaurant_purchases', JSON.stringify(updated));
      fetchPurchases();
    }

    setPurchaseVendor('');
    setPurchaseQty('');
    setPurchaseCost('');
  };

  // Delete Purchase (Variable Cost)
  const handleDeletePurchase = async (id) => {
    if (!window.confirm('確定要刪除這筆變動成本支出嗎？')) return;

    if (isPurchasesOnCloud) {
      try {
        const { error } = await supabase.from('purchases').delete().eq('id', id);
        if (error) throw error;
        fetchPurchases();
      } catch (err) {
        console.error("Failed to delete purchase in BookkeepingView:", err);
        alert("刪除變動支出失敗！");
      }
    } else {
      const updated = purchases.filter(p => p.id !== id);
      setPurchases(updated);
      localStorage.setItem('restaurant_purchases', JSON.stringify(updated));
      fetchPurchases();
    }
  };

  // Add Fixed Cost
  const handleAddFixedCost = async (e) => {
    e.preventDefault();
    if (!fcName.trim() || !fcCost || !fcExpiry) return;

    const costNum = Number(fcCost);

    if (isFixedCostsOnCloud) {
      try {
        const { error } = await supabase.from('fixed_costs').insert([{
          name: fcName.trim(),
          cost: costNum,
          expiry_date: fcExpiry
        }]);
        if (error) throw error;
        fetchFixedCosts();
      } catch (err) {
        console.error("Failed to add fixed cost in BookkeepingView:", err);
        alert("新增固定成本失敗！");
      }
    } else {
      const newFC = {
        id: `FC-${Date.now()}`,
        name: fcName.trim(),
        cost: costNum,
        expiryDate: fcExpiry
      };
      const updated = [newFC, ...fixedCosts];
      setFixedCosts(updated);
      localStorage.setItem('restaurant_fixed_costs', JSON.stringify(updated));
      fetchFixedCosts();
    }

    setFcName('');
    setFcCost('');
    setFcExpiry('');
  };

  // Delete Fixed Cost
  const handleDeleteFixedCost = async (id) => {
    if (!window.confirm('確定要刪除這筆固定成本項目嗎？')) return;

    if (isFixedCostsOnCloud) {
      try {
        const { error } = await supabase.from('fixed_costs').delete().eq('id', id);
        if (error) throw error;
        fetchFixedCosts();
      } catch (err) {
        console.error("Failed to delete fixed cost in BookkeepingView:", err);
        alert("刪除固定成本失敗！");
      }
    } else {
      const updated = fixedCosts.filter(fc => fc.id !== id);
      setFixedCosts(updated);
      localStorage.setItem('restaurant_fixed_costs', JSON.stringify(updated));
      fetchFixedCosts();
    }
  };

  // Re-open store for editing (requires admin code)
  const handleReopenShop = () => {
    if (window.confirm("警告：您確定要重開此日期的帳目嗎？\n重開帳目後，該日流水明細將再次鎖定。")) {
      const pwd = window.prompt("請輸入管理員對帳密碼以重開：");
      if (pwd === '8888') {
        const updated = closedDates.filter(d => d !== selectedBookkeepingDate);
        setClosedDates(updated);
        localStorage.setItem('restaurant_closed_dates', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
        alert("帳目已成功重開，流水已被鎖定。");
      } else if (pwd !== null) {
        alert("密碼錯誤，重開失敗！");
      }
    }
  };

  // Export Daily Ledger CSV
  const handleExportCSV = () => {
    if (completedOrders.length === 0) {
      alert('該日無交易明細可供匯出！');
      return;
    }
    
    let csvContent = "\uFEFF";
    csvContent += "時間,流水號,類型,顧客姓名/桌號,實收金額(NT$),付款方式,購買明細\n";
    
    completedOrders.forEach(order => {
      const time = order.time;
      const serial = order.serialNum || order.id.slice(-6);
      const type = order.type === 'dine-in' ? '內用' : '外帶';
      const name = order.customerName.replace(/,/g, ' ');
      const total = order.total;
      const payment = order.paymentMethod === 'online' ? '線上付' : '現金付';
      const itemsStr = order.items.map(item => `${item.name}x${item.quantity}`).join(' | ');
      
      csvContent += `${time},${serial},${type},${name},${total},${payment},"${itemsStr}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `龍城麵線_對帳明細_${selectedBookkeepingDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bookkeeping Computations for Selected Date
  const completedOrders = orders.filter(o => {
    const orderDate = new Date(o.timestamp).toISOString().split('T')[0];
    return o.status === 'completed' && orderDate === selectedBookkeepingDate;
  });

  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const onlineRevenue = completedOrders
    .filter(o => o.paymentMethod === 'online')
    .reduce((sum, o) => sum + o.total, 0);
  const cashRevenue = totalRevenue - onlineRevenue;

  const totalDineIn = completedOrders.filter(o => o.type === 'dine-in').length;
  const totalTakeout = completedOrders.length - totalDineIn;

  // Purchases (Variable Costs)
  const purchasesForDate = purchases.filter(p => p.date === selectedBookkeepingDate);
  const totalPurchasesCost = purchasesForDate.reduce((sum, p) => sum + p.cost, 0);

  // Active Fixed Costs for selected month
  const selectedYearMonth = selectedBookkeepingDate.slice(0, 7); // YYYY-MM
  const activeFixedCostsForMonth = fixedCosts.filter(fc => {
    return fc.expiryDate.slice(0, 7) >= selectedYearMonth;
  });
  const totalFixedCostsForMonth = activeFixedCostsForMonth.reduce((sum, fc) => sum + fc.cost, 0);
  const dailyFixedCostShare = Math.round(totalFixedCostsForMonth / 30);

  // Estimated profit
  const estimatedNetProfit = totalRevenue - totalPurchasesCost - dailyFixedCostShare;

  // Top Sellers
  const itemCounts = {};
  completedOrders.forEach(o => {
    o.items.forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
    });
  });
  const sortedItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  // Settle Closing check
  const isClosedToday = closedDates.includes(selectedBookkeepingDate);

  // Generate Monthly report
  const getMonthlyReports = () => {
    const reports = {};
    
    // Group Revenue (only from closed dates)
    orders.forEach(o => {
      if (o.status !== 'completed') return;
      const orderDate = new Date(o.timestamp).toISOString().split('T')[0];
      if (!closedDates.includes(orderDate)) return;
      
      const month = orderDate.slice(0, 7);
      if (!reports[month]) {
        reports[month] = { month, revenue: 0, variableCosts: 0, fixedCosts: 0 };
      }
      reports[month].revenue += o.total;
    });

    // Group Purchases (only from closed dates)
    purchases.forEach(p => {
      if (!closedDates.includes(p.date)) return;
      
      const month = p.date.slice(0, 7);
      if (!reports[month]) {
        reports[month] = { month, revenue: 0, variableCosts: 0, fixedCosts: 0 };
      }
      reports[month].variableCosts += p.cost;
    });

    // Populate Fixed Costs
    Object.keys(reports).forEach(month => {
      const activeFC = fixedCosts.filter(fc => fc.expiryDate.slice(0, 7) >= month);
      reports[month].fixedCosts = activeFC.reduce((sum, fc) => sum + fc.cost, 0);
    });

    return Object.values(reports).sort((a, b) => b.month.localeCompare(a.month));
  };

  const monthlyReports = getMonthlyReports();

  const handleHomeClick = () => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (demo === 'true') {
      onBackToDemo();
    } else {
      window.location.href = '/?bookkeeping=true';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-body)',
      color: 'var(--text-main)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={handleHomeClick} style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer' }}>🏡</button>
          <span style={{ fontSize: '1.4rem' }}>📊</span>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: '900', margin: 0 }}>龍城麵線 營業記帳與財務系統</h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>財務支出、營業流水與對帳管理面板</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Global Date Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>對帳日期:</span>
            <input 
              type="date" 
              value={selectedBookkeepingDate} 
              onChange={(e) => setSelectedBookkeepingDate(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-body)',
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            />
          </div>
          <button 
            onClick={onLogout} 
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-body)',
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🚪 登出
          </button>
        </div>
      </header>

      {/* Store status lock bar */}
      <div style={{
        margin: '16px 24px 0 24px',
        padding: '10px 16px',
        borderRadius: '8px',
        backgroundColor: isClosedToday ? 'rgba(22, 163, 74, 0.05)' : 'rgba(239, 68, 68, 0.05)',
        border: '1px solid',
        borderColor: isClosedToday ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.8rem'
      }}>
        <div>
          {isClosedToday ? (
            <span style={{ color: '#16a34a', fontWeight: 'bold' }}>🔴 本日已對帳封存 (已在收銀機完成收店結帳)</span>
          ) : (
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🟢 本日營業中 (請至收銀系統進行「今日收店結帳」以在此對帳)</span>
          )}
        </div>
        <div>
          {isClosedToday && (
            <button 
              onClick={handleReopenShop}
              style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🔓 重開帳目
            </button>
          )}
        </div>
      </div>

      {!isClosedToday ? (
        /* LOCK SCREEN FOR LEDGER */
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px 20px'
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '40px 30px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <span style={{ fontSize: '3rem' }}>🔒</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '900', margin: '15px 0 8px 0', color: 'var(--text-main)' }}>
              營業流水明細鎖定中
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '12px' }}>
              為保護現場收銀財務安全，請在現場收銀系統 (POS) 點擊「今日收店結帳」並輸入關店密碼以關閉今日營業。
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '0' }}>
              收店成功後，此頁面將自動解鎖並彙整今日流水對帳單與更新月報表。
            </p>
          </div>
        </div>
      ) : (
        /* UNLOCKED FULL FINANCIAL PAGE */
        <main style={{
          flex: 1,
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* Unlocked Financial Metrics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px'
          }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-sm)' }}>
              <h5 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px' }}>📈 財務管道統計</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>💵 現金實收:</span>
                  <strong style={{ marginLeft: 'auto' }}>NT$ {cashRevenue}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>💳 線上已付:</span>
                  <strong style={{ marginLeft: 'auto' }}>NT$ {onlineRevenue}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                  <span>當日營業額:</span>
                  <strong style={{ marginLeft: 'auto', color: 'var(--primary)' }}>NT$ {totalRevenue}</strong>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-sm)' }}>
              <h5 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px' }}>🛍️ 點餐管道比例</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🍽️ 內用就座:</span>
                  <strong style={{ marginLeft: 'auto' }}>{totalDineIn} 筆 ({completedOrders.length ? Math.round(totalDineIn/completedOrders.length*100) : 0}%)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🛍️ 線上外帶:</span>
                  <strong style={{ marginLeft: 'auto' }}>{totalTakeout} 筆 ({completedOrders.length ? Math.round(totalTakeout/completedOrders.length*100) : 0}%)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                  <span>結案總訂單:</span>
                  <strong style={{ marginLeft: 'auto' }}>{completedOrders.length} 筆</strong>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-sm)' }}>
              <h5 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px' }}>🔥 當日銷售排行</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', maxHeight: '72px', overflowY: 'auto' }}>
                {sortedItems.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>暫無銷售數據</span>
                ) : (
                  sortedItems.map(([name, qty]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{name}:</span>
                      <strong style={{ marginLeft: 'auto' }}>{qty} 份</strong>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-sm)' }}>
              <h5 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px' }}>💰 營業損益淨利試算</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>📈 當日營業額:</span>
                  <strong style={{ marginLeft: 'auto' }}>NT$ {totalRevenue}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>📉 進貨變動成本:</span>
                  <strong style={{ marginLeft: 'auto', color: '#ef4444' }}>-NT$ {totalPurchasesCost}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🏢 當日分攤固定成本:</span>
                  <strong style={{ marginLeft: 'auto', color: '#ef4444' }} title={`當月累計固定成本 $${totalFixedCostsForMonth} / 30天`}>-NT$ {dailyFixedCostShare}</strong>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  borderTop: '1px dashed var(--border)', 
                  paddingTop: '6px', 
                  marginTop: '4px',
                  color: estimatedNetProfit >= 0 ? '#16a34a' : '#dc2626'
                }}>
                  <span>試算當日淨利:</span>
                  <strong style={{ marginLeft: 'auto', fontSize: '1rem', fontWeight: '800' }}>
                    NT$ {estimatedNetProfit}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-view navigation tabs */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', gap: '8px' }}>
            <button 
              onClick={() => setActiveTab('sales')} 
              style={{
                padding: '10px 20px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                border: 'none',
                borderBottom: activeTab === 'sales' ? '3px solid var(--primary)' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'sales' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              📋 當日交易流水
            </button>
            <button 
              onClick={() => setActiveTab('variable')} 
              style={{
                padding: '10px 20px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                border: 'none',
                borderBottom: activeTab === 'variable' ? '3px solid var(--primary)' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'variable' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              🛒 變動成本 (進貨採購)
            </button>
            <button 
              onClick={() => setActiveTab('fixed')} 
              style={{
                padding: '10px 20px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                border: 'none',
                borderBottom: activeTab === 'fixed' ? '3px solid var(--primary)' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'fixed' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              🏢 固定成本 (月租折舊)
            </button>
            <button 
              onClick={() => setActiveTab('monthly')} 
              style={{
                padding: '10px 20px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                border: 'none',
                borderBottom: activeTab === 'monthly' ? '3px solid var(--primary)' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'monthly' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              📅 按月財務報表
            </button>
          </div>

          {/* TAB CONTENTS */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            
            {/* 1. SALES TAB */}
            {activeTab === 'sales' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0 }}>📝 當日已結交易流水帳明細</h4>
                  <button onClick={handleExportCSV} style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #16a34a', color: '#16a34a', backgroundColor: 'rgba(22,163,74,0.05)', cursor: 'pointer', fontWeight: 'bold' }}>
                    📥 匯出當日帳目 CSV
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-input)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 12px' }}>時間</th>
                        <th style={{ padding: '10px 12px' }}>流水號</th>
                        <th style={{ padding: '10px 12px' }}>類型</th>
                        <th style={{ padding: '10px 12px' }}>顧客/桌號</th>
                        <th style={{ padding: '10px 12px' }}>實收金額</th>
                        <th style={{ padding: '10px 12px' }}>付款方式</th>
                        <th style={{ padding: '10px 12px' }}>明細/備註</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedOrders.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>該日無已結交易流水記錄</td>
                        </tr>
                      ) : (
                        completedOrders.map(order => (
                          <tr key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px' }}>{order.time}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 'bold', color: 'var(--primary)' }}>{order.serialNum || order.id.slice(-6)}</td>
                            <td style={{ padding: '10px 12px' }}>{order.type === 'dine-in' ? '🍽️ 內用' : '🛍️ 外帶'}</td>
                            <td style={{ padding: '10px 12px' }}>{order.customerName}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>NT$ {order.total}</td>
                            <td style={{ padding: '10px 12px' }}>{order.paymentMethod === 'online' ? '💳 線上付' : '💵 現金付'}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              <div>{order.items.map(item => `${item.name}x${item.quantity}`).join(', ')}</div>
                              {order.remarks && <div style={{ color: 'var(--primary)', fontStyle: 'italic', marginTop: '2px' }}>※ {order.remarks}</div>}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button 
                                onClick={() => handleDeleteBookkeepingOrder(order.id, order.remarks)}
                                style={{ padding: '4px 8px', fontSize: '0.7rem', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                🗑️ 刪除紀錄
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. VARIABLE COSTS (PURCHASES) */}
            {activeTab === 'variable' && (
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '14px' }}>🛒 變動成本 - 食材與採購支出流水帳</h4>
                
                {/* Add Purchase Form */}
                <form onSubmit={handleAddPurchase} style={{
                  backgroundColor: 'var(--bg-body)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '20px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'flex-end'
                }}>
                  <div style={{ flex: '1 1 130px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>支出日期</label>
                    <input 
                      type="date" 
                      required
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    />
                  </div>

                  <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>進貨廠商</label>
                    <input 
                      type="text" 
                      placeholder="例如: 批發菜市場" 
                      required
                      value={purchaseVendor}
                      onChange={(e) => setPurchaseVendor(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    />
                  </div>

                  <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>進貨品項</label>
                    <select 
                      value={purchaseItemName} 
                      onChange={(e) => setPurchaseItemName(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', height: '33px', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    >
                      <option value="紅麵線">🍜 紅麵線</option>
                      <option value="新鮮蚵仔">🦪 新鮮蚵仔</option>
                      <option value="滷大腸">🐷 滷大腸</option>
                      <option value="新鮮香菜">🌿 新鮮香菜</option>
                      <option value="特製辣醬">🌶️ 特製辣醬</option>
                      <option value="大蒜/辛香料">🧄 大蒜/辛香料</option>
                      <option value="桶裝瓦斯">🔥 桶裝瓦斯</option>
                      <option value="水電雜支">💡 水電雜支</option>
                      <option value="其他雜物">📦 其他雜支</option>
                    </select>
                  </div>

                  <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>數量 / 重量</label>
                    <input 
                      type="text" 
                      placeholder="例如: 10斤" 
                      required
                      value={purchaseQty}
                      onChange={(e) => setPurchaseQty(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    />
                  </div>

                  <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>支出金額 (NT$)</label>
                    <input 
                      type="number" 
                      placeholder="金額" 
                      required
                      min="0"
                      value={purchaseCost}
                      onChange={(e) => setPurchaseCost(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    />
                  </div>

                  <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>付款狀態</label>
                    <select 
                      value={purchaseStatus} 
                      onChange={(e) => setPurchaseStatus(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', height: '33px', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    >
                      <option value="paid">🟢 已付款</option>
                      <option value="unpaid">🔴 賒帳/未付</option>
                    </select>
                  </div>

                  <button type="submit" style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '4px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 'bold', height: '33px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ➕ 登錄支出
                  </button>
                </form>

                {/* Purchase List Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-input)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 12px' }}>時間</th>
                        <th style={{ padding: '10px 12px' }}>進貨廠商</th>
                        <th style={{ padding: '10px 12px' }}>品項</th>
                        <th style={{ padding: '10px 12px' }}>數量/重量</th>
                        <th style={{ padding: '10px 12px' }}>金額</th>
                        <th style={{ padding: '10px 12px' }}>付款狀態</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasesForDate.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>該日無變動進貨支出紀錄</td>
                        </tr>
                      ) : (
                        purchasesForDate.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px' }}>{p.time}</td>
                            <td style={{ padding: '10px 12px' }}>{p.vendor}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{p.itemName}</td>
                            <td style={{ padding: '10px 12px' }}>{p.quantity}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#ef4444' }}>NT$ {p.cost}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                backgroundColor: p.status === 'paid' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                color: p.status === 'paid' ? '#16a34a' : '#ef4444'
                              }}>
                                {p.status === 'paid' ? '已付款' : '未付款'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button 
                                onClick={() => handleDeletePurchase(p.id)}
                                style={{ padding: '4px 8px', fontSize: '0.7rem', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                🗑️ 刪除
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. FIXED COSTS TAB */}
            {activeTab === 'fixed' && (
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '14px' }}>🏢 固定成本 - 店面租金與固定開銷維護</h4>
                
                {/* Add Fixed Cost Form */}
                <form onSubmit={handleAddFixedCost} style={{
                  backgroundColor: 'var(--bg-body)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '20px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'flex-end'
                }}>
                  <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>固定項目名稱</label>
                    <input 
                      type="text" 
                      placeholder="例如: 店面月租金、員工固定底薪" 
                      required
                      value={fcName}
                      onChange={(e) => setFcName(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    />
                  </div>

                  <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>每月固定額度 (NT$)</label>
                    <input 
                      type="number" 
                      placeholder="金額" 
                      required
                      min="0"
                      value={fcCost}
                      onChange={(e) => setFcCost(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                    />
                  </div>

                  <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>有效到期期限</label>
                    <input 
                      type="date" 
                      required
                      value={fcExpiry}
                      onChange={(e) => setFcExpiry(e.target.value)}
                      style={{ padding: '5px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)', height: '33px' }}
                    />
                  </div>

                  <button type="submit" style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '4px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 'bold', height: '33px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ➕ 登錄項目
                  </button>
                </form>

                {/* Fixed Costs List */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-input)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 12px' }}>項目</th>
                        <th style={{ padding: '10px 12px' }}>每月固定支出</th>
                        <th style={{ padding: '10px 12px' }}>折合每日攤銷 (30天)</th>
                        <th style={{ padding: '10px 12px' }}>有效期限截止日</th>
                        <th style={{ padding: '10px 12px' }}>狀態</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixedCosts.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>目前無登錄的固定成本項目</td>
                        </tr>
                      ) : (
                        fixedCosts.map(fc => {
                          const expiryYM = fc.expiryDate.slice(0, 7);
                          const isExpired = expiryYM < selectedYearMonth;
                          return (
                            <tr key={fc.id} style={{ borderBottom: '1px solid var(--border)', opacity: isExpired ? 0.5 : 1 }}>
                              <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{fc.name}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#ef4444' }}>NT$ {fc.cost}</td>
                              <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>NT$ {Math.round(fc.cost / 30)} / 天</td>
                              <td style={{ padding: '10px 12px' }}>{fc.expiryDate}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '0.7rem',
                                  fontWeight: '600',
                                  backgroundColor: isExpired ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                                  color: isExpired ? '#ef4444' : '#16a34a'
                                }}>
                                  {isExpired ? '已過期 (不計入)' : '生效中'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <button 
                                  onClick={() => handleDeleteFixedCost(fc.id)}
                                  style={{ padding: '4px 8px', fontSize: '0.7rem', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  🗑️ 刪除
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. MONTHLY FINANCIAL REPORTS */}
            {activeTab === 'monthly' && (
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '14px' }}>📅 龍城麵線 - 按月彙整財務損益報表</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>根據資料庫中訂單交易額與支出流，每月進行自動化對帳與結算淨利。</p>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-input)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 12px' }}>月份</th>
                        <th style={{ padding: '10px 12px' }}>營業總收入</th>
                        <th style={{ padding: '10px 12px' }}>固定成本支出</th>
                        <th style={{ padding: '10px 12px' }}>進貨變動成本</th>
                        <th style={{ padding: '10px 12px' }}>合計總成本</th>
                        <th style={{ padding: '10px 12px' }}>預估月份淨利</th>
                        <th style={{ padding: '10px 12px' }}>財務健康狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyReports.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>無歷史交易與支出數據可供彙整</td>
                        </tr>
                      ) : (
                        monthlyReports.map(report => {
                          const totalCost = report.fixedCosts + report.variableCosts;
                          const monthlyProfit = report.revenue - totalCost;
                          const isProfit = monthlyProfit >= 0;
                          return (
                            <tr key={report.month} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary)' }}>{report.month}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#16a34a' }}>NT$ {report.revenue}</td>
                              <td style={{ padding: '10px 12px', color: '#ef4444' }}>NT$ {report.fixedCosts}</td>
                              <td style={{ padding: '10px 12px', color: '#ef4444' }}>NT$ {report.variableCosts}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#ef4444' }}>NT$ {totalCost}</td>
                              <td style={{ padding: '10px 12px', fontWeight: '900', fontSize: '0.85rem', color: isProfit ? '#16a34a' : '#dc2626' }}>
                                NT$ {monthlyProfit}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '0.7rem',
                                  fontWeight: '600',
                                  backgroundColor: isProfit ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                  color: isProfit ? '#16a34a' : '#ef4444'
                                }}>
                                  {isProfit ? '🟢 盈餘利潤' : '🔴 營運虧損'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
