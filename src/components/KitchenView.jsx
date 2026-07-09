import React, { useState, useEffect, useRef } from 'react';
import { menuItems as defaultMenuItems } from '../data/menuData';
import { supabase } from '../supabaseClient';
import { formatSupabaseOrder } from './CustomerView';

export default function KitchenView({ onBackToDemo, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const prevOrdersCountRef = useRef(0);

  const [condimentsAvailability, setCondimentsAvailability] = useState({
    '香菜': true,
    '蒜末': true,
    '烏醋': true,
    '辣醬': true
  });

  const [menuItemsAvailability, setMenuItemsAvailability] = useState({});
  const [menuItems, setMenuItems] = useState([]);

  // Product add/edit form states
  const [editingItemId, setEditingItemId] = useState(null); // null if adding
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('mee-sua');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodImage, setProdImage] = useState('');
  const [prodCustomization, setProdCustomization] = useState('mee-sua-standard'); // 'mee-sua-standard', 'none'

  // Purchase Ledger & Date Selection States
  const [purchases, setPurchases] = useState([]);
  const [isPurchasesOnCloud, setIsPurchasesOnCloud] = useState(false);
  const [selectedBookkeepingDate, setSelectedBookkeepingDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states for adding purchases
  const [purchaseVendor, setPurchaseVendor] = useState('');
  const [purchaseItemName, setPurchaseItemName] = useState('滷大腸');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('paid');

  // Fetch Menu Items from Supabase
  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase.from('menu_items').select('*').order('id', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        setMenuItems(data);
      } else {
        // Seed if empty
        const defaultWithNullCustomizations = defaultMenuItems.map(item => ({
          ...item,
          customizations: item.customizations || null
        }));
        await supabase.from('menu_items').insert(defaultWithNullCustomizations);
        const { data: seeded } = await supabase.from('menu_items').select('*').order('id', { ascending: true });
        if (seeded) setMenuItems(seeded);
      }
    } catch (err) {
      console.error("Failed to load from Supabase menu_items in KitchenView:", err);
      const savedMenuItems = localStorage.getItem('restaurant_menu_items');
      if (savedMenuItems) {
        setMenuItems(JSON.parse(savedMenuItems));
      } else {
        setMenuItems(defaultMenuItems);
      }
    }
  };

  // Fetch Orders from Supabase
  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped = data.map(formatSupabaseOrder).filter(Boolean);
        setOrders(mapped);
        prevOrdersCountRef.current = mapped.length;
      }
    } catch (err) {
      console.error("Failed to load orders from Supabase:", err);
      // Fallback
      const loadedOrders = JSON.parse(localStorage.getItem('restaurant_orders') || '[]');
      setOrders(loadedOrders);
      prevOrdersCountRef.current = loadedOrders.length;
    }
  };

  // Fetch Purchases from Supabase (with fallback to LocalStorage if table doesn't exist)
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
      console.warn("Supabase purchases table query failed or table not found (falling back to LocalStorage):", err.message);
      const savedPurchases = JSON.parse(localStorage.getItem('restaurant_purchases') || '[]');
      setPurchases(savedPurchases);
      setIsPurchasesOnCloud(false);
    }
  };

  // Load orders, purchases, settings on mount
  useEffect(() => {
    fetchMenuItems();
    fetchOrders();
    fetchPurchases();

    const savedCondiments = localStorage.getItem('condiments_availability');
    if (savedCondiments) {
      setCondimentsAvailability(JSON.parse(savedCondiments));
    }

    const savedMenuItemsAvail = localStorage.getItem('menu_items_availability');
    if (savedMenuItemsAvail) {
      setMenuItemsAvailability(JSON.parse(savedMenuItemsAvail));
    }
  }, []);

  // Listen to Supabase postgres changes in Realtime for live order notifications
  useEffect(() => {
    const ordersChannel = supabase.channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        fetchOrders();
        // If a new order is received, trigger chime sound
        if (payload.eventType === 'INSERT') {
          triggerNotification();
        }
      })
      .subscribe();

    const menuChannel = supabase.channel('kitchen-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchMenuItems();
      })
      .subscribe();

    const purchasesChannel = supabase.channel('kitchen-purchases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
        fetchPurchases();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(purchasesChannel);
    };
  }, []);

  // Listen for local changes to availability state
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'condiments_availability') {
        setCondimentsAvailability(JSON.parse(e.newValue || '{}'));
      } else if (e.key === 'menu_items_availability') {
        setMenuItemsAvailability(JSON.parse(e.newValue || '{}'));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Product CRUD Handlers
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!prodName.trim() || !prodPrice) {
      alert('請填寫商品名稱與單價！');
      return;
    }

    const priceNum = parseFloat(prodPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      alert('請輸入有效的商品單價！');
      return;
    }

    // Determine customization object
    let customizations = null;
    if (prodCustomization === 'mee-sua-standard') {
      customizations = {
        size: {
          title: '份量',
          type: 'radio',
          options: [
            { label: '小碗', priceChange: 0 },
            { label: '大碗', priceChange: 15 }
          ],
          default: '小碗'
        },
        addons: {
          title: '加料選項 (可多選)',
          type: 'checkbox',
          options: [
            { label: '大腸', priceChange: 20 },
            { label: '豬肚', priceChange: 20 },
            { label: '肉羹', priceChange: 15 },
            { label: '花枝羹', priceChange: 20 },
            { label: '貢丸', priceChange: 15 }
          ]
        },
        condiments: {
          title: '調料客製 (免加錢)',
          type: 'selects',
          options: [
            { name: '香菜', choices: ['正常', '多一點', '不要香菜'], default: '正常' },
            { name: '蒜末', choices: ['正常', '多一點', '不要蒜頭'], default: '正常' },
            { name: '烏醋', choices: ['正常', '多一點', '不要烏醋'], default: '正常' },
            { name: '辣醬', choices: ['不辣', '微辣', '中辣', '大辣'], default: '不辣' }
          ]
        }
      };
    }

    let imgUrl = prodImage.trim();
    if (!imgUrl) {
      imgUrl = prodCategory === 'mee-sua' ? '/images/taiwanese_mee_sua.jpg' : '/images/spicy_kimchi.jpg';
    }

    try {
      if (editingItemId) {
        // Edit mode
        const { error } = await supabase.from('menu_items').update({
          name: prodName.trim(),
          category: prodCategory,
          price: priceNum,
          description: prodDescription.trim(),
          image: imgUrl,
          customizations: customizations
        }).eq('id', editingItemId);
        if (error) throw error;
        setEditingItemId(null);
      } else {
        // Add mode
        const { error } = await supabase.from('menu_items').insert([{
          category: prodCategory,
          name: prodName.trim(),
          description: prodDescription.trim(),
          price: priceNum,
          image: imgUrl,
          customizations: customizations
        }]);
        if (error) throw error;
      }
      fetchMenuItems();
    } catch (err) {
      console.error("Failed to save product in Supabase:", err);
      alert("儲存商品失敗！");
    }

    // Reset form fields
    setProdName('');
    setProdPrice('');
    setProdDescription('');
    setProdImage('');
    setProdCustomization('mee-sua-standard');
  };

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setProdName(item.name);
    setProdPrice(item.price.toString());
    setProdCategory(item.category);
    setProdDescription(item.description || '');
    setProdImage(item.image || '');
    setProdCustomization(item.customizations ? 'mee-sua-standard' : 'none');
    
    // Scroll to the product form
    const formEl = document.getElementById('product-edit-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setProdName('');
    setProdPrice('');
    setProdDescription('');
    setProdImage('');
    setProdCustomization('mee-sua-standard');
  };

  const handleDeleteProduct = async (itemId, itemName) => {
    if (window.confirm(`確定要將商品「${itemName}」從菜單中永久刪除嗎？`)) {
      try {
        const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
        if (error) throw error;
        fetchMenuItems();
        if (editingItemId === itemId) {
          handleCancelEdit();
        }
      } catch (err) {
        console.error("Failed to delete product from Supabase:", err);
        alert("刪除商品失敗！");
      }
    }
  };

  // Synthetic beep notification using Web Audio API
  const triggerNotification = () => {
    if (!audioEnabled) return;
    
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // First beep (pitch 587.33Hz - D5)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.frequency.value = 587.33;
      gain1.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc1.start(audioCtx.currentTime);
      osc1.stop(audioCtx.currentTime + 0.15);

      // Second beep (pitch 880Hz - A5) slightly delayed
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.value = 880;
        gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc2.start(audioCtx.currentTime);
        osc2.stop(audioCtx.currentTime + 0.3);
      }, 120);
    } catch (e) {
      console.warn("Failed to play synthetic audio notification:", e);
    }
  };

  // Helper to update order status
  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const { error } = await supabase.from('orders').update({
        status: newStatus
      }).eq('id', orderId);
      if (error) throw error;
      fetchOrders();
    } catch (err) {
      console.error("Failed to update order status in Supabase:", err);
      alert("更新訂單狀態失敗！");
    }
  };

  const handleClearOrders = async () => {
    if (window.confirm('確定要清空所有訂單記錄嗎？這將會清除雲端資料庫上所有歷史與進行中的訂單。')) {
      try {
        const { error } = await supabase.from('orders').delete().neq('id', 0); // deletes all rows
        if (error) throw error;
        localStorage.removeItem('active_customer_order_id');
        fetchOrders();
      } catch (err) {
        console.error("Failed to clear orders in Supabase:", err);
        alert("清空訂單失敗！");
      }
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (window.confirm('確定要取消並刪除這筆訂單嗎？')) {
      try {
        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        if (error) throw error;
        fetchOrders();
      } catch (err) {
        console.error("Failed to delete order from Supabase:", err);
        alert("刪除訂單失敗！");
      }
    }
  };

  const handleCondimentToggle = (name) => {
    const updated = {
      ...condimentsAvailability,
      [name]: !condimentsAvailability[name]
    };
    setCondimentsAvailability(updated);
    localStorage.setItem('condiments_availability', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  const handleMenuItemToggle = (itemId) => {
    const currentStatus = menuItemsAvailability[itemId] !== false;
    const updated = {
      ...menuItemsAvailability,
      [itemId]: !currentStatus
    };
    setMenuItemsAvailability(updated);
    localStorage.setItem('menu_items_availability', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  const handleAddPurchase = async (e) => {
    e.preventDefault();
    if (!purchaseVendor.trim() || !purchaseQty.trim() || !purchaseCost) return;

    const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const costNum = Number(purchaseCost);

    if (isPurchasesOnCloud) {
      try {
        const { error } = await supabase.from('purchases').insert([{
          purchase_id: `PUR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
          date: selectedBookkeepingDate,
          time,
          vendor: purchaseVendor,
          item_name: purchaseItemName,
          quantity: purchaseQty,
          cost: costNum,
          status: purchaseStatus
        }]);
        if (error) throw error;
        fetchPurchases();
      } catch (err) {
        console.error("Failed to add purchase to Supabase:", err);
        alert("登錄進貨資料至雲端失敗！");
      }
    } else {
      const newPurchase = {
        id: `PUR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
        date: selectedBookkeepingDate,
        time,
        vendor: purchaseVendor,
        itemName: purchaseItemName,
        quantity: purchaseQty,
        cost: costNum,
        status: purchaseStatus
      };
      const updated = [newPurchase, ...purchases];
      setPurchases(updated);
      localStorage.setItem('restaurant_purchases', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    }

    // Clear form inputs
    setPurchaseVendor('');
    setPurchaseQty('');
    setPurchaseCost('');
  };

  const handleDeletePurchase = async (id) => {
    if (window.confirm('確定要刪除這筆進貨支出嗎？')) {
      if (isPurchasesOnCloud) {
        try {
          const { error } = await supabase.from('purchases').delete().eq('id', id);
          if (error) throw error;
          fetchPurchases();
        } catch (err) {
          console.error("Failed to delete purchase from Supabase:", err);
          alert("刪除進貨資料失敗！");
        }
      } else {
        const updated = purchases.filter(p => p.id !== id);
        setPurchases(updated);
        localStorage.setItem('restaurant_purchases', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
      }
    }
  };

  const handleExportCSV = () => {
    if (completedOrders.length === 0) {
      alert('該日尚無已結案的交易明細可供匯出！');
      return;
    }
    
    // Add UTF-8 BOM for correct Chinese display in Excel
    let csvContent = "\uFEFF";
    csvContent += "時間,流水號,類型,顧客姓名/桌號,實收金額(NT$),付款方式,購買明細\n";
    
    completedOrders.forEach(order => {
      const time = order.time;
      const serial = order.serialNum || order.id.slice(-6);
      const type = order.type === 'dine-in' ? '內用' : '外帶';
      const name = order.customerName.replace(/,/g, ' '); // Avoid CSV column shifting
      const total = order.total;
      const payment = order.paymentMethod === 'online' ? '線上已付' : '現金付款';
      const itemsStr = order.items.map(item => `${item.name}x${item.quantity}`).join(' | ');
      
      csvContent += `${time},${serial},${type},${name},${total},${payment},"${itemsStr}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `龍城麵線_帳目明細_${selectedBookkeepingDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter orders by status
  const pendingOrders = orders.filter(o => o.status === 'received');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready' || o.status === 'completed');

  // Format order customize specification display
  const getElapsedMinutes = (timestamp) => {
    const elapsed = Date.now() - timestamp;
    const mins = Math.floor(elapsed / 60000);
    if (mins < 1) return '剛剛';
    return `${mins} 分鐘前`;
  };

  // Force tick state update every 30s to refresh elapsed minutes
  const [, setTick] = useState(0);
  const [showBookkeeping, setShowBookkeeping] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Calculate Bookkeeping data for the selected date
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

  // Calculate purchases for the selected date
  const purchasesForDate = purchases.filter(p => p.date === selectedBookkeepingDate);
  const totalPurchasesCost = purchasesForDate.reduce((sum, p) => sum + p.cost, 0);
  const estimatedNetProfit = totalRevenue - totalPurchasesCost;

  // Item counts for the selected date
  const itemCounts = {};
  const addonCounts = {};
  completedOrders.forEach(o => {
    o.items.forEach(item => {
      // count main items
      itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      // count add-ons if any
      if (item.selections && item.selections.checkboxes) {
        Object.entries(item.selections.checkboxes).forEach(([groupKey, checks]) => {
          Object.entries(checks).forEach(([addonName, isChecked]) => {
            if (isChecked) {
              addonCounts[addonName] = (addonCounts[addonName] || 0) + item.quantity;
            }
          });
        });
      }
    });
  });

  const sortedItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);
  const sortedAddons = Object.entries(addonCounts).sort((a, b) => b[1] - a[1]);

  const handleHomeClick = () => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (demo === 'true') {
      onBackToDemo();
    } else {
      window.location.href = '/?admin=true';
    }
  };

  return (
    <div className="staff-view">
      <header className="staff-header">
        <div className="staff-title-area">
          <button onClick={handleHomeClick} style={{ fontSize: '1.4rem' }}>🏡</button>
          <span className="staff-logo">👨‍🍳</span>
          <div>
            <h1 style={{ fontSize: '1.25rem' }}>龍城麵線 接單與廚房系統</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              即時狀態同步中・請開啟音效以接收接單鈴聲
            </p>
          </div>
        </div>

        <div className="staff-controls-top" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 客戶端快速通道 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <a 
              href="/" 
              target="_blank" 
              rel="noreferrer" 
              className="btn-secondary" 
              style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', height: '33px' }}
            >
              🛍️ 開啟外帶點餐
            </a>
            <select 
              onChange={(e) => {
                if (e.target.value) {
                  window.open(`/?table=${e.target.value}`, '_blank');
                  e.target.value = ''; // reset
                }
              }}
              style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', height: '33px' }}
            >
              <option value="">🍽️ 開啟桌號點餐...</option>
              {[1, 2, 3, 5, 6, 8, 10].map(tbl => (
                <option key={tbl} value={tbl}>{tbl} 號桌</option>
              ))}
            </select>
          </div>

          <button 
            className={`btn-secondary ${audioEnabled ? 'active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            style={{ 
              backgroundColor: audioEnabled ? 'rgba(34, 197, 94, 0.1)' : '', 
              borderColor: audioEnabled ? '#22c55e' : '',
              color: audioEnabled ? '#16a34a' : '',
              height: '33px'
            }}
          >
            {audioEnabled ? '🔊 接單音效已開啟' : '🔇 點此開啟接單音效'}
          </button>
          <button className="btn-danger" onClick={handleClearOrders} style={{ height: '33px' }}>
            🧹 清除所有模擬資料
          </button>
          
          <a 
            href="/?pos=true" 
            target="_blank"
            rel="noreferrer"
            className="btn-secondary" 
            style={{ 
              textDecoration: 'none', 
              fontSize: '0.8rem', 
              padding: '6px 12px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '4px', 
              height: '33px', 
              backgroundColor: 'rgba(22, 163, 74, 0.05)', 
              borderColor: '#16a34a', 
              color: '#16a34a',
              fontWeight: 'bold'
            }}
          >
            💵 開啟收銀 POS
          </a>

          {onLogout && (
            <button 
              onClick={onLogout}
              className="btn-secondary"
              style={{ height: '33px', fontWeight: 'bold' }}
            >
              🔒 登出鎖定
            </button>
          )}
        </div>
      </header>

      {/* Condiment Supply Settings Panel */}
      <div style={{
        margin: '20px 24px 0 24px',
        padding: '14px 20px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>⚙️</span>
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>佐料供應管理 (前台勾選控制)</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>取消勾選的佐料將會立即在客戶端點餐介面中隱藏。</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {Object.entries(condimentsAvailability).map(([name, isAvailable]) => (
            <label 
              key={name} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-full)',
                backgroundColor: isAvailable ? 'rgba(255, 107, 53, 0.05)' : 'var(--bg-input)',
                borderColor: isAvailable ? 'var(--primary)' : 'var(--border)',
                fontWeight: isAvailable ? '600' : 'normal',
                cursor: 'pointer',
                transition: 'var(--transition)',
                fontSize: '0.8rem',
                userSelect: 'none'
              }}
            >
              <input 
                type="checkbox" 
                checked={isAvailable} 
                onChange={() => handleCondimentToggle(name)}
                style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: 'var(--primary)' }}
              />
              <span>{name} {isAvailable ? '🟢 供應中' : '🔴 已售罄'}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 📦 菜單與單品供應管理 看板 */}
      <div style={{
        margin: '16px 24px 0 24px',
        padding: '16px 20px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>📦</span>
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>菜單與單品供應管理 (動態新增、編輯與下架)</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>管理店內上架之所有商品。今日下架或刪除之品項，將即時同步於顧客點餐網頁。</p>
          </div>
        </div>

        {/* 商品表格清單 */}
        <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px 12px' }}>品項名稱</th>
                <th style={{ padding: '8px 12px' }}>分類</th>
                <th style={{ padding: '8px 12px' }}>價格 (NT$)</th>
                <th style={{ padding: '8px 12px' }}>客製規格</th>
                <th style={{ padding: '8px 12px' }}>今日供應狀態</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>操作管理</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map(item => {
                const isAvailable = menuItemsAvailability[item.id] !== false;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '8px 12px', fontWeight: '600' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img 
                          src={item.image} 
                          alt="" 
                          style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--border)' }} 
                          onError={(e) => { e.target.src = '/images/taiwanese_mee_sua.jpg'; }}
                        />
                        <span>{item.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {item.category === 'mee-sua' ? '🍜 招牌麵線' : '🔥 特色產品'}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>
                      ${item.price}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                      {item.customizations ? '📋 標準麵線客製' : '🚫 僅選數量'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                        <input 
                          type="checkbox" 
                          checked={isAvailable} 
                          onChange={() => handleMenuItemToggle(item.id)}
                          style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.75rem', fontWeight: isAvailable ? '600' : 'normal', color: isAvailable ? '#16a34a' : 'var(--text-muted)' }}>
                          {isAvailable ? '🟢 上架供應' : '🔴 完售下架'}
                        </span>
                      </label>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        <button 
                          onClick={() => handleStartEdit(item)}
                          style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer' }}
                        >
                          📝 編輯
                        </button>
                        <button 
                          onClick={() => handleDeleteProduct(item.id, item.name)}
                          style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', cursor: 'pointer' }}
                        >
                          🗑️ 刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 新增 / 編輯商品表單 */}
        <div id="product-edit-form" style={{ marginTop: '16px', padding: '20px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(0,0,0,0.015)' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {editingItemId ? '📝 編輯商品內容' : '➕ 新增自訂商品上架'}
            {editingItemId && <span style={{ fontSize: '0.7rem', color: 'var(--primary)', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,107,53,0.1)' }}>編輯中</span>}
          </h4>
          
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* 左側表單輸入欄位 */}
            <form onSubmit={handleSaveProduct} style={{ flex: 1, minWidth: '300px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>商品名稱 *</label>
                <input 
                  type="text" 
                  placeholder="例如：古早味滷肉飯" 
                  value={prodName} 
                  onChange={(e) => setProdName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>商品分類 *</label>
                <select 
                  value={prodCategory} 
                  onChange={(e) => setProdCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', cursor: 'pointer' }}
                >
                  <option value="mee-sua">🍜 招牌麵線</option>
                  <option value="specialties">🔥 特色產品</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>商品單價 (NT$) *</label>
                <input 
                  type="number" 
                  placeholder="例如：45" 
                  value={prodPrice} 
                  onChange={(e) => setProdPrice(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                  min="0"
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>客製規格選項 *</label>
                <select 
                  value={prodCustomization} 
                  onChange={(e) => setProdCustomization(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', cursor: 'pointer' }}
                >
                  <option value="mee-sua-standard">📋 標準麵線客製 (可選大小碗、加料與調味)</option>
                  <option value="none">🚫 無客製規格 (前台僅可選擇選購數量)</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>商品圖片網址 (選填，留空將套用預設圖片)</label>
                <input 
                  type="text" 
                  placeholder="例如：/images/mixed_mee_sua.jpg 或網路圖片網址" 
                  value={prodImage} 
                  onChange={(e) => setProdImage(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>商品說明 (選填)</label>
                <textarea 
                  placeholder="例如：秘製陳年滷汁，手工慢火細熬，香味四溢..." 
                  value={prodDescription} 
                  onChange={(e) => setProdDescription(e.target.value)}
                  rows="2"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                {editingItemId && (
                  <button 
                    type="button" 
                    onClick={handleCancelEdit}
                    style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer' }}
                  >
                    ❌ 取消編輯
                  </button>
                )}
                <button 
                  type="submit" 
                  style={{ padding: '8px 20px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {editingItemId ? '💾 保存商品修改' : '➕ 新增商品上架'}
                </button>
              </div>
            </form>

            {/* 右側商品卡片即時預覽 (加大、顯眼、對應前台卡片) */}
            <div style={{
              width: '240px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              backgroundColor: 'var(--bg-card)',
              boxShadow: 'var(--shadow-md)',
              alignSelf: 'flex-start'
            }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '6px', display: 'block' }}>
                👁️ 客戶端卡片即時預覽
              </span>
              <div style={{ position: 'relative', width: '100%', height: '150px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img 
                  src={prodImage.trim() || (prodCategory === 'mee-sua' ? '/images/taiwanese_mee_sua.jpg' : '/images/spicy_kimchi.jpg')} 
                  alt="預覽" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&auto=format&fit=crop&q=60';
                  }}
                />
                <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.65rem', fontWeight: 'bold' }}>
                  {prodCategory === 'mee-sua' ? '招牌麵線' : '特色產品'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                  {prodName.trim() || '商品名稱'}
                </h5>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '36px', lineHeight: '1.25' }}>
                  {prodDescription.trim() || '在此輸入商品說明描述...'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--primary)' }}>
                    NT$ {prodPrice || '0'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                    {prodCustomization === 'mee-sua-standard' ? '📋 有客製' : '🚫 僅選數量'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 📊 營業記帳與數據統計 看板 */}
      <div style={{
        margin: '16px 24px 0 24px',
        padding: '16px 20px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none'
        }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            onClick={() => setShowBookkeeping(!showBookkeeping)}
          >
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>營業記帳與歷史數據統計</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                選擇對帳日期以自動彙整該日的營收明細與進貨支出
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Date Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>日期:</span>
              <input 
                type="date" 
                value={selectedBookkeepingDate} 
                onChange={(e) => setSelectedBookkeepingDate(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-body)',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              />
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>累計營收：</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--primary)', fontWeight: '800' }}>
                NT$ {totalRevenue}
              </strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '12px' }}>
                已結案：<strong>{completedOrders.length}</strong> 筆
              </span>
            </div>
            <span 
              style={{ fontSize: '1rem', color: 'var(--text-muted)', cursor: 'pointer' }}
              onClick={() => setShowBookkeeping(!showBookkeeping)}
            >
              {showBookkeeping ? '▲ 收合' : '▼ 展開記帳明細'}
            </span>
          </div>
        </div>

        {showBookkeeping && (
          <div style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '16px',
            marginTop: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Grid of stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px'
            }}>
              {/* Financial Card */}
              <div style={{
                padding: '14px 16px',
                backgroundColor: 'var(--bg-body)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-muted)' }}>
                  📈 財務管道統計
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>💵 現金實收:</span>
                    <strong>NT$ {cashRevenue}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>💳 線上已付:</span>
                    <strong>NT$ {onlineRevenue}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                    <span>總營業額:</span>
                    <strong style={{ color: 'var(--primary)' }}>NT$ {totalRevenue}</strong>
                  </div>
                </div>
              </div>

              {/* Order channels Card */}
              <div style={{
                padding: '14px 16px',
                backgroundColor: 'var(--bg-body)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-muted)' }}>
                  🛍️ 點餐管道比例
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>🍽️ 內用就座:</span>
                    <strong>{totalDineIn} 筆 ({completedOrders.length ? Math.round(totalDineIn/completedOrders.length*100) : 0}%)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>🛍️ 預約外帶:</span>
                    <strong>{totalTakeout} 筆 ({completedOrders.length ? Math.round(totalTakeout/completedOrders.length*100) : 0}%)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                    <span>總交易訂單:</span>
                    <strong>{completedOrders.length} 筆</strong>
                  </div>
                </div>
              </div>

              {/* Top sellers Card */}
              <div style={{
                padding: '14px 16px',
                backgroundColor: 'var(--bg-body)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  🔥 今日熱銷統計
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', maxHeight: '100px', overflowY: 'auto' }}>
                  {sortedItems.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>暫無餐點售出數據</span>
                  ) : (
                    sortedItems.map(([name, qty]) => (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{name}:</span>
                        <strong>{qty} 份</strong>
                      </div>
                    ))
                  )}
                  {sortedAddons.length > 0 && (
                    <div style={{ borderTop: '1px dotted var(--border)', marginTop: '4px', paddingTop: '4px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>加料累計：</span>
                      {sortedAddons.map(([name, qty]) => (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                          <span>+{name}:</span>
                          <span>{qty} 次</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Profit Card */}
              <div style={{
                padding: '14px 16px',
                backgroundColor: 'var(--bg-body)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-muted)' }}>
                  💰 營業淨利試算
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>📈 當日總營收:</span>
                    <strong>NT$ {totalRevenue}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>📉 進貨採購支出:</span>
                    <strong style={{ color: '#ef4444' }}>-NT$ {totalPurchasesCost}</strong>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    borderTop: '1px dashed var(--border)', 
                    paddingTop: '6px', 
                    marginTop: '4px',
                    color: estimatedNetProfit >= 0 ? '#16a34a' : '#dc2626'
                  }}>
                    <span>預估淨利潤:</span>
                    <strong style={{ fontSize: '1rem', fontWeight: '800' }}>
                      NT$ {estimatedNetProfit}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Sales ledger table */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', margin: 0 }}>
                  📝 已結交易流水帳明細
                </h5>
                <button 
                  onClick={handleExportCSV}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: 'rgba(34, 197, 94, 0.05)',
                    borderColor: '#22c55e',
                    color: '#16a34a',
                    fontWeight: 'bold'
                  }}
                >
                  📥 匯出當日帳目 CSV
                </button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.8rem',
                  textAlign: 'left'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px' }}>時間</th>
                      <th style={{ padding: '8px 12px' }}>流水號</th>
                      <th style={{ padding: '8px 12px' }}>類型</th>
                      <th style={{ padding: '8px 12px' }}>顧客/桌號</th>
                      <th style={{ padding: '8px 12px' }}>實收金額</th>
                      <th style={{ padding: '8px 12px' }}>付款方式</th>
                      <th style={{ padding: '8px 12px' }}>購買明細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedOrders.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          該日尚無已結案的記帳資料
                        </td>
                      </tr>
                    ) : (
                      completedOrders.map(order => (
                        <tr key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px' }}>{order.time}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {order.serialNum || order.id.slice(-6)}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {order.type === 'dine-in' ? '🍽️ 內用' : '🛍️ 外帶'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>{order.customerName}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>NT$ {order.total}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {order.paymentMethod === 'online' ? '💳 線上付' : '💵 現金付'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {order.items.map(item => `${item.name}x${item.quantity}`).join(', ')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchase Ledger (食材進貨與採購記帳) */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '10px' }}>
              <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '12px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🛒 食材進貨與廠商採購流水帳 ({selectedBookkeepingDate} 記錄)
                <span style={{
                  fontSize: '0.65rem',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: '600',
                  marginLeft: '8px',
                  backgroundColor: isPurchasesOnCloud ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                  color: isPurchasesOnCloud ? '#16a34a' : '#d97706'
                }}>
                  {isPurchasesOnCloud ? '☁️ 雲端同步' : '💾 本機暫存 (請於 Supabase 執行 purchases 建表以啟動雲端記帳)'}
                </span>
              </h5>

              {/* Add Purchase Form */}
              <form onSubmit={handleAddPurchase} style={{
                backgroundColor: 'var(--bg-body)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px',
                marginBottom: '16px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                alignItems: 'flex-end'
              }}>
                <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>廠商名稱</label>
                  <input 
                    type="text" 
                    placeholder="例如: 萬華批發市場" 
                    required
                    value={purchaseVendor}
                    onChange={(e) => setPurchaseVendor(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                  />
                </div>

                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>進貨品項</label>
                  <select 
                    value={purchaseItemName} 
                    onChange={(e) => setPurchaseItemName(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', height: '33px', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                  >
                    <option value="紅麵線">🍜 紅麵線</option>
                    <option value="新鮮蚵仔">🦪 新鮮蚵仔</option>
                    <option value="滷大腸">🐷 滷大腸</option>
                    <option value="新鮮香菜">🌿 新鮮香菜</option>
                    <option value="特製辣醬">🌶️ 特製辣醬</option>
                    <option value="大蒜/辛香料">🧄 大蒜/辛香料</option>
                    <option value="桶裝瓦斯">🔥 桶裝瓦斯</option>
                    <option value="水電雜支">💡 水電雜支</option>
                    <option value="其他食材">📦 其他進貨</option>
                  </select>
                </div>

                <div style={{ flex: '1 1 80px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>進貨數量/重量</label>
                  <input 
                    type="text" 
                    placeholder="例如: 10 斤" 
                    required
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                  />
                </div>

                <div style={{ flex: '1 1 90px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>金額 (NT$)</label>
                  <input 
                    type="number" 
                    placeholder="1200" 
                    required
                    min="0"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                  />
                </div>

                <div style={{ flex: '1 1 90px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>付款狀態</label>
                  <select 
                    value={purchaseStatus} 
                    onChange={(e) => setPurchaseStatus(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', height: '33px', color: 'var(--text-main)', backgroundColor: 'var(--bg-card)' }}
                  >
                    <option value="paid">🟢 已付現/已結</option>
                    <option value="unpaid">🔴 賒帳/未結</option>
                  </select>
                </div>

                <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', height: '33px', whiteSpace: 'nowrap' }}>
                  ➕ 登錄進貨
                </button>
              </form>

              {/* Purchase History Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.8rem',
                  textAlign: 'left'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px' }}>時間</th>
                      <th style={{ padding: '8px 12px' }}>廠商名稱</th>
                      <th style={{ padding: '8px 12px' }}>進貨品項</th>
                      <th style={{ padding: '8px 12px' }}>數量/重量</th>
                      <th style={{ padding: '8px 12px' }}>進貨金額</th>
                      <th style={{ padding: '8px 12px' }}>付款狀態</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasesForDate.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          該日尚無進貨採購的記帳資料
                        </td>
                      </tr>
                    ) : (
                      purchasesForDate.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px' }}>{p.time}</td>
                          <td style={{ padding: '8px 12px' }}>{p.vendor}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>{p.itemName}</td>
                          <td style={{ padding: '8px 12px' }}>{p.quantity}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#ef4444' }}>NT$ {p.cost}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              backgroundColor: p.status === 'paid' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                              color: p.status === 'paid' ? '#16a34a' : '#ef4444'
                            }}>
                              {p.status === 'paid' ? '已付款' : '未付款'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button 
                              onClick={() => handleDeletePurchase(p.id)}
                              style={{
                                border: 'none',
                                backgroundColor: 'transparent',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
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
          </div>
        )}
      </div>

      {/* Main dashboard columns */}
      <main className="staff-dashboard" style={{ paddingTop: '10px' }}>
        {/* Column 1: Received / Pending */}
        <div className="staff-column">
          <div className="column-header">
            <h3 className="column-title">
              <span>📥 新訂單 / 待處理</span>
            </h3>
            <span className="column-count">{pendingOrders.length}</span>
          </div>

          {pendingOrders.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '40px 0', fontSize: '0.85rem' }}>
              目前沒有新訂單
            </p>
          ) : (
            pendingOrders.map(order => (
              <div 
                key={order.id} 
                className={`staff-order-card ${order.isNew ? 'new-pulse' : ''}`}
              >
                <div className="card-top-row">
                  <div className="order-num-type">
                    <span className="order-num" style={{ color: 'var(--primary)', fontSize: '1.2rem', fontWeight: '800' }}>
                      {order.serialNum || `ORD-${order.id.slice(-6)}`}
                    </span>
                    <span className="order-type-lbl">
                      {order.type === 'dine-in' ? `🍽️ 內用 - ${order.tableName}桌` : `🛍️ 外帶自取`}
                    </span>
                  </div>
                  <span className="time-passed">{getElapsedMinutes(order.timestamp)}</span>
                </div>

                {order.type === 'takeout' && (
                  <div className="customer-detail-box">
                    <strong>取餐人:</strong> {order.customerName} <br />
                    <strong>電話:</strong> {order.customerPhone} &nbsp;
                    {order.phoneVerified ? (
                      <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '0.75rem' }}>✓ 手機已驗證</span>
                    ) : (
                      <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.75rem' }}>⚠️ 手機未驗證</span>
                    )} <br />
                    <strong>預約時間:</strong> <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{order.pickupTime}</span>
                  </div>
                )}

                <div className="card-item-list">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="card-item">
                      <div className="card-item-title-row">
                        <span>{item.name}</span>
                        <span>x{item.quantity}</span>
                      </div>
                      {item.specs.length > 0 && (
                        <div className="card-item-options">
                          {item.specs.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {order.remarks && (
                  <div className="card-order-remarks">
                    備註: {order.remarks}
                  </div>
                )}

                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>付款: {order.paymentMethod === 'online' ? '✅ 已線上付款' : '💵 到店付/未付'}</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>共 NT$ {order.total}</span>
                </div>

                <div className="card-actions">
                  <button 
                    className="btn-card-primary" 
                    onClick={() => updateOrderStatus(order.id, 'preparing')}
                  >
                    開始製作 ➔
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '8px', flexGrow: 0 }}
                    onClick={() => handleDeleteOrder(order.id)}
                    title="取消訂單"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Column 2: Preparing */}
        <div className="staff-column">
          <div className="column-header">
            <h3 className="column-title">
              <span>🍳 廚房製作中</span>
            </h3>
            <span className="column-count">{preparingOrders.length}</span>
          </div>

          {preparingOrders.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '40px 0', fontSize: '0.85rem' }}>
              沒有正在製作的餐點
            </p>
          ) : (
            preparingOrders.map(order => (
              <div key={order.id} className="staff-order-card">
                <div className="card-top-row">
                  <div className="order-num-type">
                    <span className="order-num" style={{ color: 'var(--primary)', fontSize: '1.2rem', fontWeight: '800' }}>
                      {order.serialNum || `ORD-${order.id.slice(-6)}`}
                    </span>
                    <span className="order-type-lbl">
                      {order.type === 'dine-in' ? `🍽️ 內用 - ${order.tableName}桌` : `🛍️ 外帶自取`}
                    </span>
                  </div>
                  <span className="time-passed">{getElapsedMinutes(order.timestamp)}</span>
                </div>

                {order.type === 'takeout' && (
                  <div className="customer-detail-box">
                    <strong>取餐人:</strong> {order.customerName} &nbsp;
                    {order.phoneVerified ? (
                      <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '0.75rem' }}>✓ 已驗證</span>
                    ) : (
                      <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.75rem' }}>⚠️ 未驗證</span>
                    )} <br />
                    <strong>預約時間:</strong> <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{order.pickupTime}</span>
                  </div>
                )}

                <div className="card-item-list">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="card-item">
                      <div className="card-item-title-row">
                        <span>{item.name}</span>
                        <span>x{item.quantity}</span>
                      </div>
                      {item.specs.length > 0 && (
                        <div className="card-item-options">
                          {item.specs.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {order.remarks && (
                  <div className="card-order-remarks">
                    備註: {order.remarks}
                  </div>
                )}

                <div className="card-actions">
                  <button 
                    className="btn-card-success" 
                    onClick={() => updateOrderStatus(order.id, 'ready')}
                  >
                    製作完成 / 通知取餐 ➔
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Column 3: Ready / Completed */}
        <div className="staff-column">
          <div className="column-header">
            <h3 className="column-title">
              <span>🔔 待取餐 / 已完成</span>
            </h3>
            <span className="column-count">{readyOrders.length}</span>
          </div>

          {readyOrders.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '40px 0', fontSize: '0.85rem' }}>
              沒有等待取餐的訂單
            </p>
          ) : (
            readyOrders.map(order => (
              <div 
                key={order.id} 
                className="staff-order-card"
                style={{ opacity: order.status === 'completed' ? 0.7 : 1 }}
              >
                <div className="card-top-row">
                  <div className="order-num-type">
                    <span className="order-num" style={{ color: 'var(--primary)', fontSize: '1.2rem', fontWeight: '800' }}>
                      {order.serialNum || `ORD-${order.id.slice(-6)}`}
                    </span>
                    <span className="order-type-lbl">
                      {order.type === 'dine-in' ? `🍽️ 內用 - ${order.tableName}桌` : `🛍️ 外帶自取`}
                    </span>
                  </div>
                  <span className="time-passed">{getElapsedMinutes(order.timestamp)}</span>
                </div>

                <div className="customer-detail-box" style={{ backgroundColor: order.status === 'completed' ? 'rgba(0,0,0,0.02)' : 'rgba(34,197,94,0.05)' }}>
                  <strong>狀態:</strong> {order.status === 'completed' ? '✅ 已結案完成' : '📢 等待顧客取餐/已送餐'} <br />
                  {order.type === 'takeout' && (
                    <>
                      <strong>取餐人:</strong> {order.customerName} <br />
                      <strong>手機:</strong> {order.customerPhone} &nbsp;
                      {order.phoneVerified ? (
                        <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '0.75rem' }}>✓ 已驗證</span>
                      ) : (
                        <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.75rem' }}>⚠️ 未驗證</span>
                      )}
                    </>
                  )}
                </div>

                <div className="card-item-list">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="card-item" key={idx}>
                      <div className="card-item-title-row">
                        <span>{item.name}</span>
                        <span>x{item.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>付款: {order.paymentStatus === 'paid' ? '✅ 已付款' : '💵 現場未付款'}</span>
                  <strong>NT$ {order.total}</strong>
                </div>

                {order.status !== 'completed' ? (
                  <div className="card-actions">
                    <button 
                      className="btn-card-primary" 
                      style={{ backgroundColor: '#475569' }}
                      onClick={() => {
                        // Mark order as paid & completed
                        const updated = orders.map(o => {
                          if (o.id === order.id) {
                            return { ...o, status: 'completed', paymentStatus: 'paid' };
                          }
                          return o;
                        });
                        setOrders(updated);
                        prevOrdersCountRef.current = updated.length;
                        localStorage.setItem('restaurant_orders', JSON.stringify(updated));
                        window.dispatchEvent(new Event('storage'));
                      }}
                    >
                      💳 完成結帳與取餐結案
                    </button>
                  </div>
                ) : (
                  <div className="card-status-done">
                    ✓ 訂單已結案
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
