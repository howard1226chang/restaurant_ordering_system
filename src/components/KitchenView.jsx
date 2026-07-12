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

  // UI management dropdown states
  const [selectedManageType, setSelectedManageType] = useState('menu-item'); // 'menu-item', 'condiment', 'add-new'
  const [selectedItemIdToManage, setSelectedItemIdToManage] = useState('');

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

  // Load orders, settings on mount
  useEffect(() => {
    fetchMenuItems();
    fetchOrders();

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

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(menuChannel);
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
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

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

      {/* ⚙️ 後台設定與供應管理 (下拉選單緊湊版) */}
      <div style={{
        margin: '20px 24px 0 24px',
        padding: '16px 20px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚙️</span>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0 }}>後台系統設定與供應控制</h4>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>菜單單品上架、佐料供應開關與餐點管理</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select 
              value={selectedManageType} 
              onChange={(e) => {
                setSelectedManageType(e.target.value);
                setSelectedItemIdToManage('');
                handleCancelEdit();
              }}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-body)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                fontWeight: 'bold',
                height: '34px'
              }}
            >
              <option value="menu-item">📋 單品供應與編輯管理</option>
              <option value="condiment">🌿 前台佐料供應管理</option>
              <option value="add-new">➕ 新增自訂單品上架</option>
            </select>

            {selectedManageType === 'menu-item' && (
              <select
                value={selectedItemIdToManage}
                onChange={(e) => {
                  setSelectedItemIdToManage(e.target.value);
                  handleCancelEdit();
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-body)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  height: '34px',
                  maxWidth: '200px'
                }}
              >
                <option value="">-- 選擇要管理的品項 --</option>
                {menuItems.map(item => (
                  <option key={item.id} value={item.id}>{item.name} (${item.price})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          {selectedManageType === 'menu-item' && (
            selectedItemIdToManage ? (
              (() => {
                const item = menuItems.find(i => String(i.id) === selectedItemIdToManage);
                if (!item) return <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>品項載入錯誤</p>;
                const isAvailable = menuItemsAvailability[item.id] !== false;
                
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', backgroundColor: 'var(--bg-body)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img 
                        src={item.image} 
                        alt="" 
                        style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border)' }}
                        onError={(e) => { e.target.src = '/images/taiwanese_mee_sua.jpg'; }}
                      />
                      <div>
                        <h5 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: '0 0 4px 0' }}>{item.name}</h5>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>分類: {item.category === 'mee-sua' ? '🍜 招牌麵線' : '🔥 特色產品'}</span>
                          <span>單價: <strong>NT$ {item.price}</strong></span>
                          <span>客製: {item.customizations ? '📋 標準規格' : '🚫 僅選數量'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border)' }}>
                        <input 
                          type="checkbox" 
                          checked={isAvailable} 
                          onChange={() => handleMenuItemToggle(item.id)}
                          style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isAvailable ? '#16a34a' : 'var(--text-muted)' }}>
                          {isAvailable ? '🟢 上架供應中' : '🔴 完售下架中'}
                        </span>
                      </label>

                      <button 
                        onClick={() => {
                          handleStartEdit(item);
                          setSelectedManageType('add-new');
                        }}
                        style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--primary)', color: 'var(--primary)', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        📝 編輯修改
                      </button>

                      <button 
                        onClick={() => {
                          handleDeleteProduct(item.id, item.name);
                          setSelectedItemIdToManage('');
                        }}
                        style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        🗑️ 刪除單品
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
                💡 請點擊上方右側下拉選單，選取要管理供應狀態或編輯的單品項目。
              </p>
            )
          )}

          {selectedManageType === 'condiment' && (
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', marginTop: 0 }}>
                提示：在此切換的佐料狀態會即時生效，前台顧客點單或櫃檯 POS 點餐時將不顯示已下架的佐料按鈕。
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {Object.entries(condimentsAvailability).map(([name, isAvailable]) => (
                  <label 
                    key={name} 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
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
                    <span>{name} {isAvailable ? '🟢 正常供應' : '🔴 暫停供應'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedManageType === 'add-new' && (
            <div style={{ padding: '4px' }}>
              <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {editingItemId ? '📝 編輯商品內容' : '➕ 新增自訂商品上架'}
                {editingItemId && <span style={{ fontSize: '0.7rem', color: 'var(--primary)', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,107,53,0.1)' }}>編輯狀態</span>}
              </h5>
              
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <form onSubmit={async (e) => {
                  await handleSaveProduct(e);
                  setSelectedManageType('menu-item');
                }} style={{ flex: 1, minWidth: '300px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>商品名稱 *</label>
                    <input 
                      type="text" 
                      placeholder="例如：古早味大腸飯" 
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
                      <option value="mee-sua-standard">📋 標準麵線客製 (加料、調味與大/小碗)</option>
                      <option value="none">🚫 無客製規格 (僅選購數量)</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>商品圖片網址 (留空將套用分類預設圖)</label>
                    <input 
                      type="text" 
                      placeholder="例如：/images/mixed_mee_sua.jpg" 
                      value={prodImage} 
                      onChange={(e) => setProdImage(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button 
                      type="button" 
                      onClick={() => {
                        handleCancelEdit();
                        setSelectedManageType('menu-item');
                      }}
                      style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer' }}
                    >
                      ❌ {editingItemId ? '取消編輯' : '取消返回'}
                    </button>
                    <button 
                      type="submit" 
                      style={{ padding: '8px 20px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {editingItemId ? '💾 保存商品修改' : '➕ 上架商品'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
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
