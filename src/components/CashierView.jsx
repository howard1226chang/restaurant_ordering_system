import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { formatSupabaseOrder } from './CustomerView';
import ItemModal from './ItemModal';

export default function CashierView({ onLogout }) {
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState('mee-sua');
  const [cart, setCart] = useState([]);
  
  // Checkout details
  const [orderType, setOrderType] = useState('dine-in'); // 'dine-in' or 'takeout'
  const [tableNumber, setTableNumber] = useState('1');
  const [custName, setCustName] = useState('');
  const [remarks, setRemarks] = useState('');
  
  // Cash Register Calculations
  const [cashReceived, setCashReceived] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);

  // Success view details
  const [viewState, setViewState] = useState('pos'); // 'pos' or 'success'
  const [latestOrder, setLatestOrder] = useState(null);

  // Modal active item
  const [activeItemForModal, setActiveItemForModal] = useState(null);

  // Discount states
  const [discountType, setDiscountType] = useState('none'); // 'none', 'percent', 'amount'
  const [discountValue, setDiscountValue] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Menu Items from Supabase
  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      if (data) setMenuItems(data);
    } catch (err) {
      console.error("Failed to load menu items in CashierView:", err);
      // Fallback from localStorage or default
      const saved = localStorage.getItem('restaurant_menu_items');
      if (saved) setMenuItems(JSON.parse(saved));
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, []);

  // Calculate total price in cart
  const cartTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  // Calculate discount amount and final total
  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = Math.round(cartTotal * (discountValue / 100));
  } else if (discountType === 'amount') {
    discountAmount = discountValue;
  }
  const finalTotal = Math.max(0, cartTotal - discountAmount);

  // Calculate change
  useEffect(() => {
    const received = parseFloat(cashReceived) || 0;
    if (received >= finalTotal) {
      setChangeAmount(received - finalTotal);
    } else {
      setChangeAmount(0);
    }
  }, [cashReceived, finalTotal]);

  // Handle adding product to cart
  const handleProductClick = (item) => {
    if (item.customizations) {
      // Open customization modal
      setActiveItemForModal(item);
    } else {
      // Add straight to cart (no customizations)
      const existing = cart.find(c => c.id === item.id && (!c.specs || c.specs.length === 0));
      if (existing) {
        setCart(cart.map(c => 
          c.cartId === existing.cartId 
            ? { ...c, quantity: c.quantity + 1, totalPrice: c.totalPrice + item.price }
            : c
        ));
      } else {
        const cartItem = {
          cartId: `${item.id}-${Date.now()}`,
          id: item.id,
          name: item.name,
          basePrice: item.price,
          itemPrice: item.price,
          totalPrice: item.price,
          quantity: 1,
          specs: [],
          image: item.image
        };
        setCart([...cart, cartItem]);
      }
    }
  };

  const handleAddToCartFromModal = (cartItem) => {
    setCart([...cart, cartItem]);
  };

  // Modify item quantity in POS cart
  const handleUpdateQty = (cartId, delta) => {
    setCart(cart.map(c => {
      if (c.cartId === cartId) {
        const nextQty = Math.max(1, c.quantity + delta);
        return {
          ...c,
          quantity: nextQty,
          totalPrice: c.itemPrice * nextQty
        };
      }
      return c;
    }));
  };

  // Remove item from POS cart
  const handleRemoveFromCart = (cartId) => {
    setCart(cart.filter(c => c.cartId !== cartId));
  };

  // Quick cash keypad actions
  const handleQuickCash = (amount) => {
    const current = parseFloat(cashReceived) || 0;
    setCashReceived(String(current + amount));
  };

  const handleClearCash = () => {
    setCashReceived('');
  };

  // Submit POS Order to Supabase
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert("收銀購物車內尚無餐點項目！");
      return;
    }

    const received = parseFloat(cashReceived) || 0;
    if (received < finalTotal) {
      alert(`實收現金金額不足！還缺 NT$ ${finalTotal - received}`);
      return;
    }

    // Generate serial number (A-001 daily format)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    let count = 0;
    try {
      const { count: dbCount, error } = await supabase.from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());
      if (!error && dbCount !== null) {
        count = dbCount;
      }
    } catch (err) {
      console.warn("Failed to get today count, using fallback:", err);
    }
    const serialNum = `A-${String(count + 1).padStart(3, '0')}`;

    // Format discount remarks
    let discountDetail = '';
    if (discountType === 'percent') {
      discountDetail = ` [折價: ${(10 - discountValue/10)}折, 折抵 $${discountAmount}]`;
    } else if (discountType === 'amount') {
      discountDetail = ` [折抵 $${discountValue}]`;
    }

    try {
      const { data: dbOrders, error: insertError } = await supabase.from('orders').insert([{
        order_number: serialNum,
        items: {
          cart: cart.map(c => ({
            id: c.id,
            name: c.name,
            quantity: c.quantity,
            totalPrice: c.totalPrice,
            specs: c.specs
          })),
          customerName: orderType === 'dine-in' ? `內用 ${tableNumber} 號桌 (POS)` : (custName.trim() || '現場外帶'),
          customerPhone: '',
          pickupTime: '',
          paymentMethod: 'cash',
          remarks: `${remarks.trim()}${discountDetail} [櫃檯現場收銀]`
        },
        total: finalTotal,
        type: orderType,
        table_number: orderType === 'dine-in' ? tableNumber : null,
        status: 'received',
        payment_status: 'paid'
      }]).select();

      if (insertError) throw insertError;

      const createdOrder = dbOrders[0];
      setLatestOrder({
        ...createdOrder,
        cashReceived: received,
        changeAmount: received - finalTotal
      });
      setViewState('success');
    } catch (err) {
      console.error("Failed to submit POS order to Supabase:", err);
      alert("提交收銀訂單失敗，請確認資料庫連線！");
    }
  };

  // Reset screen for next customer
  const handleResetPos = () => {
    setCart([]);
    setCashReceived('');
    setRemarks('');
    setCustName('');
    setViewState('pos');
    setLatestOrder(null);
    setDiscountType('none');
    setDiscountValue(0);
    setSearchQuery('');
  };

  // Filter items by category and search query
  const filteredMenuItems = menuItems.filter(item => {
    const matchesCategory = item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchesCategory && matchesSearch;
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-body)',
      color: 'var(--text-main)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.5rem' }}>💵</span>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>龍城麵線 現場收銀系統 (POS)</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={onLogout}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🔒 登出鎖定
          </button>
        </div>
      </header>

      {viewState === 'pos' ? (
        /* POS Main Workspace */
        <div style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          height: 'calc(100vh - 57px)'
        }}>
          {/* Left Panel: Menu Item Grid with Giant Switch Tabs */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'hidden',
            padding: '20px 24px',
            borderRight: '1px solid var(--border)',
            gap: '20px'
          }}>
            {/* Giant Category switcher tabs */}
            <div style={{
              display: 'flex',
              gap: '16px'
            }}>
              <button
                type="button"
                onClick={() => setActiveCategory('mee-sua')}
                style={{
                  flex: 1,
                  height: '55px',
                  fontSize: '1.1rem',
                  fontWeight: '900',
                  borderRadius: '10px',
                  border: '2px solid',
                  borderColor: activeCategory === 'mee-sua' ? 'var(--primary)' : 'var(--border)',
                  backgroundColor: activeCategory === 'mee-sua' ? 'var(--primary)' : 'var(--bg-card)',
                  color: activeCategory === 'mee-sua' ? 'white' : 'var(--text-main)',
                  cursor: 'pointer',
                  boxShadow: activeCategory === 'mee-sua' ? 'var(--shadow-md)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                🍜 招牌麵線 / 主食 ({menuItems.filter(i => i.category === 'mee-sua').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('specialties')}
                style={{
                  flex: 1,
                  height: '55px',
                  fontSize: '1.1rem',
                  fontWeight: '900',
                  borderRadius: '10px',
                  border: '2px solid',
                  borderColor: activeCategory === 'specialties' ? '#dc2626' : 'var(--border)',
                  backgroundColor: activeCategory === 'specialties' ? '#dc2626' : 'var(--bg-card)',
                  color: activeCategory === 'specialties' ? 'white' : 'var(--text-main)',
                  cursor: 'pointer',
                  boxShadow: activeCategory === 'specialties' ? 'var(--shadow-md)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                🔥 特色小吃 / 辣系列 ({menuItems.filter(i => i.category === 'specialties').length})
              </button>
            </div>

            {/* Giant Grid Container - filling height */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              paddingBottom: '10px'
            }}>
              {activeCategory === 'mee-sua' ? (
                /* Mee-sua: 8 items, 2 columns x 4 rows */
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '16px',
                  height: '100%'
                }}>
                  {menuItems.filter(item => item.category === 'mee-sua').map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleProductClick(item)}
                      style={{
                        backgroundColor: 'rgba(255, 107, 53, 0.05)',
                        border: '3px solid rgba(255, 107, 53, 0.3)',
                        borderRadius: '16px',
                        padding: '24px 16px',
                        height: '145px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                        boxShadow: 'var(--shadow-md)',
                        transition: 'all 0.1s ease',
                        textAlign: 'center',
                        position: 'relative'
                      }}
                      onPointerDown={(e) => {
                        e.currentTarget.style.transform = 'scale(0.96)';
                        e.currentTarget.style.backgroundColor = 'var(--primary)';
                        e.currentTarget.style.color = '#ffffff';
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        const priceSpan = e.currentTarget.querySelector('.price-tag');
                        if (priceSpan) priceSpan.style.color = '#ffffff';
                      }}
                      onPointerUp={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = 'rgba(255, 107, 53, 0.05)';
                        e.currentTarget.style.color = 'var(--text-main)';
                        e.currentTarget.style.borderColor = 'rgba(255, 107, 53, 0.3)';
                        const priceSpan = e.currentTarget.querySelector('.price-tag');
                        if (priceSpan) priceSpan.style.color = 'var(--primary)';
                      }}
                      onPointerLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = 'rgba(255, 107, 53, 0.05)';
                        e.currentTarget.style.color = 'var(--text-main)';
                        e.currentTarget.style.borderColor = 'rgba(255, 107, 53, 0.3)';
                        const priceSpan = e.currentTarget.querySelector('.price-tag');
                        if (priceSpan) priceSpan.style.color = 'var(--primary)';
                      }}
                    >
                      <div style={{ fontSize: '1.25rem', fontWeight: '900', lineHeight: '1.3' }}>
                        {item.name}
                      </div>
                      <span className="price-tag" style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--primary)', transition: 'color 0.1s ease' }}>
                        NT$ {item.price}
                      </span>
                      {item.customizations && (
                        <span style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          fontSize: '0.65rem',
                          fontWeight: 'bold',
                          backgroundColor: 'rgba(255, 107, 53, 0.15)',
                          color: 'var(--primary)',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}>
                          ⚙️ 可客製
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Specialties: 4 items, 2 columns x 2 rows (Extra Giant Buttons!) */
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '20px',
                  height: '100%'
                }}>
                  {menuItems.filter(item => item.category === 'specialties').map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleProductClick(item)}
                      style={{
                        backgroundColor: 'rgba(220, 38, 38, 0.05)',
                        border: '3px solid rgba(220, 38, 38, 0.3)',
                        borderRadius: '18px',
                        padding: '40px 24px',
                        height: '290px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                        boxShadow: 'var(--shadow-lg)',
                        transition: 'all 0.1s ease',
                        textAlign: 'center'
                      }}
                      onPointerDown={(e) => {
                        e.currentTarget.style.transform = 'scale(0.96)';
                        e.currentTarget.style.backgroundColor = '#dc2626';
                        e.currentTarget.style.color = '#ffffff';
                        e.currentTarget.style.borderColor = '#dc2626';
                        const priceSpan = e.currentTarget.querySelector('.price-tag');
                        if (priceSpan) priceSpan.style.color = '#ffffff';
                      }}
                      onPointerUp={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.05)';
                        e.currentTarget.style.color = 'var(--text-main)';
                        e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.3)';
                        const priceSpan = e.currentTarget.querySelector('.price-tag');
                        if (priceSpan) priceSpan.style.color = '#dc2626';
                      }}
                      onPointerLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.05)';
                        e.currentTarget.style.color = 'var(--text-main)';
                        e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.3)';
                        const priceSpan = e.currentTarget.querySelector('.price-tag');
                        if (priceSpan) priceSpan.style.color = '#dc2626';
                      }}
                    >
                      <div style={{ fontSize: '1.5rem', fontWeight: '900', lineHeight: '1.4' }}>
                        {item.name}
                      </div>
                      <span className="price-tag" style={{ fontSize: '1.5rem', fontWeight: '900', color: '#dc2626', transition: 'color 0.1s ease' }}>
                        NT$ {item.price}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Transaction Cart & Checkout */}
          <div style={{
            width: '360px',
            backgroundColor: 'var(--bg-card)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Cart Items List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              borderBottom: '1px solid var(--border)'
            }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '10px', margin: '0 0 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🛒 點餐清單</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{cart.length} 項</span>
                  {cart.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => { if(confirm("確定要清空點餐清單嗎？")) setCart([]); }}
                      style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
                    >
                      🧹 清空
                    </button>
                  )}
                </div>
              </h2>

              {cart.length === 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '200px',
                  color: 'var(--text-muted)',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '2.5rem' }}>🛒</span>
                  <span style={{ fontSize: '0.8rem' }}>櫃檯購物車為空，請點選左側餐點</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {cart.map((cartItem) => (
                    <div 
                      key={cartItem.cartId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        borderBottom: '1px dashed var(--border)',
                        paddingBottom: '12px'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{cartItem.name}</div>
                        {cartItem.specs && cartItem.specs.map((spec, sIdx) => (
                          <div key={sIdx} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            • {spec}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>NT$ {cartItem.totalPrice}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/* Qty edit */}
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                            <button 
                              onClick={() => handleUpdateQty(cartItem.cartId, -1)}
                              style={{ border: 'none', background: 'var(--bg-input)', width: '22px', height: '22px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                            >-</button>
                            <span style={{ width: '28px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>{cartItem.quantity}</span>
                            <button 
                              onClick={() => handleUpdateQty(cartItem.cartId, 1)}
                              style={{ border: 'none', background: 'var(--bg-input)', width: '22px', height: '22px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                            >+</button>
                          </div>
                          {/* Delete item */}
                          <button 
                            onClick={() => handleRemoveFromCart(cartItem.cartId)}
                            style={{
                              border: 'none',
                              backgroundColor: 'transparent',
                              color: '#ef4444',
                              fontSize: '1rem',
                              cursor: 'pointer',
                              padding: '2px'
                            }}
                            title="刪除"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Checkout Form & Register Panel */}
            <form onSubmit={handleCheckoutSubmit} style={{
              padding: '20px',
              backgroundColor: 'var(--bg-body)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {/* Order Type Select */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setOrderType('dine-in')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: orderType === 'dine-in' ? 'var(--primary)' : 'var(--border)',
                    backgroundColor: orderType === 'dine-in' ? 'var(--primary)' : 'var(--bg-card)',
                    color: orderType === 'dine-in' ? 'white' : 'var(--text-main)',
                    cursor: 'pointer'
                  }}
                >
                  🍽️ 現場內用
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('takeout')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: orderType === 'takeout' ? 'var(--primary)' : 'var(--border)',
                    backgroundColor: orderType === 'takeout' ? 'var(--primary)' : 'var(--bg-card)',
                    color: orderType === 'takeout' ? 'white' : 'var(--text-main)',
                    cursor: 'pointer'
                  }}
                >
                  🛍️ 現場外帶
                </button>
              </div>

              {/* Table / Customer Details Inputs */}
              {orderType === 'dine-in' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>內用桌號 *</label>
                  <select
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.8rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <option key={n} value={String(n)}>{n} 號桌</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>顧客名稱 (選填)</label>
                    <input 
                      type="text" 
                      placeholder="如：林先生" 
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.8rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                  </div>
                </div>
              )}

              {/* Remarks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>訂單備註 (選填)</label>
                <input 
                  type="text" 
                  placeholder="如：不要辣、香菜多" 
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.8rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                />
              </div>

              {/* Total & Discount display */}
              <div style={{
                borderTop: '1px dashed var(--border)',
                paddingTop: '10px',
                marginTop: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                {/* Discount Select */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>折扣折讓</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" onClick={() => { setDiscountType('percent'); setDiscountValue(5); }} style={{ flex: 1, padding: '5px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: discountType === 'percent' && discountValue === 5 ? 'var(--primary)' : 'var(--bg-card)', color: discountType === 'percent' && discountValue === 5 ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold' }}>95折</button>
                    <button type="button" onClick={() => { setDiscountType('percent'); setDiscountValue(10); }} style={{ flex: 1, padding: '5px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: discountType === 'percent' && discountValue === 10 ? 'var(--primary)' : 'var(--bg-card)', color: discountType === 'percent' && discountValue === 10 ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold' }}>9折</button>
                    <button type="button" onClick={() => { setDiscountType('percent'); setDiscountValue(15); }} style={{ flex: 1, padding: '5px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: discountType === 'percent' && discountValue === 15 ? 'var(--primary)' : 'var(--bg-card)', color: discountType === 'percent' && discountValue === 15 ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold' }}>85折</button>
                    <button type="button" onClick={() => {
                      const amt = prompt("請輸入折讓金額 (元)：");
                      if (amt !== null && amt !== '') {
                        setDiscountType('amount');
                        setDiscountValue(parseInt(amt) || 0);
                      }
                    }} style={{ flex: 1, padding: '5px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: discountType === 'amount' ? 'var(--primary)' : 'var(--bg-card)', color: discountType === 'amount' ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold' }}>折抵 $</button>
                    <button type="button" onClick={() => { setDiscountType('none'); setDiscountValue(0); }} style={{ padding: '5px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', cursor: 'pointer', fontWeight: 'bold' }}>清除</button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>商品小計:</span>
                  <span>NT$ {cartTotal}</span>
                </div>
                {discountType !== 'none' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#ef4444' }}>
                    <span>折扣折讓:</span>
                    <span>- NT$ {discountAmount}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: '800', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                  <span>應收金額:</span>
                  <span style={{ color: 'var(--primary)' }}>NT$ {finalTotal}</span>
                </div>
              </div>

              {/* Cash input and Change calculations */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>實收現金 (NT$) *</label>
                  <input 
                    type="number" 
                    placeholder="輸入實收金額"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.9rem', fontWeight: 'bold', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    required
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>找零金額</label>
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: '0.9rem',
                    fontWeight: '800',
                    color: changeAmount > 0 ? '#16a34a' : 'var(--text-main)',
                    backgroundColor: 'var(--bg-input)'
                  }}>
                    NT$ {changeAmount}
                  </div>
                </div>
              </div>

              {/* Quick Cash Buttons */}
              <div style={{
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap'
              }}>
                <button type="button" onClick={() => setCashReceived(String(finalTotal))} style={{ flex: 2, padding: '6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #16a34a', color: '#16a34a', backgroundColor: 'rgba(22,163,74,0.05)', cursor: 'pointer', fontWeight: 'bold' }}>剛好收 $ {finalTotal}</button>
                <button type="button" onClick={() => handleQuickCash(100)} style={{ flex: 1, padding: '6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', cursor: 'pointer' }}>+$100</button>
                <button type="button" onClick={() => handleQuickCash(500)} style={{ flex: 1, padding: '6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', cursor: 'pointer' }}>+$500</button>
                <button type="button" onClick={() => handleQuickCash(1000)} style={{ flex: 1, padding: '6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', cursor: 'pointer' }}>+$1000</button>
                <button type="button" onClick={handleClearCash} style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', cursor: 'pointer' }}>清除</button>
              </div>

              {/* Submit transaction */}
              <button
                type="submit"
                disabled={cart.length === 0}
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: cart.length === 0 ? 'var(--border)' : '#16a34a',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.95rem',
                  border: 'none',
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                  marginTop: '4px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                💸 確認收銀結帳送單
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* POS Receipt Success view */
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
          padding: '40px 20px',
          backgroundColor: 'var(--bg-body)'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '400px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '30px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <span style={{ fontSize: '3rem' }}>✅</span>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '0 0 4px 0', color: 'var(--text-main)' }}>結帳送單成功！</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>訂單已寫入雲端並通知廚房製作</p>
            </div>

            {/* Receipt Summary */}
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              backgroundColor: 'var(--bg-body)',
              textAlign: 'left',
              fontSize: '0.8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px', fontWeight: 'bold' }}>
                <span>流水單號: {latestOrder?.order_number}</span>
                <span>現金支付</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>交易類型:</span>
                <strong>{latestOrder?.type === 'dine-in' ? `內用 (${latestOrder?.table_number} 號桌)` : '現場外帶'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>應收總額:</span>
                <strong>NT$ {latestOrder?.total}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>實收現金:</span>
                <strong>NT$ {latestOrder?.cashReceived}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: 'bold', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                <span>找零金額:</span>
                <strong>NT$ {latestOrder?.changeAmount}</strong>
              </div>
            </div>

            {/* Print Simulation */}
            <button
              onClick={() => alert("模擬收據列印中...\n列印機指令已發送。")}
              style={{
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              🖨️ 列印收執聯收據 (模擬)
            </button>

            {/* Continue to next order */}
            <button
              onClick={handleResetPos}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: 'var(--primary)',
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              繼續下一筆收銀 ➔
            </button>
          </div>
        </div>
      )}

      {/* Item Customization Modal */}
      {activeItemForModal && (
        <ItemModal 
          item={activeItemForModal}
          onClose={() => setActiveItemForModal(null)}
          onAddToCart={handleAddToCartFromModal}
          condimentsAvailability={null} // POS cashier has full options
        />
      )}
    </div>
  );
}
