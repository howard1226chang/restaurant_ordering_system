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

  // Calculate change
  useEffect(() => {
    const received = parseFloat(cashReceived) || 0;
    if (received >= cartTotal) {
      setChangeAmount(received - cartTotal);
    } else {
      setChangeAmount(0);
    }
  }, [cashReceived, cartTotal]);

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
    if (received < cartTotal) {
      alert(`實收現金金額不足！還缺 NT$ ${cartTotal - received}`);
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
          remarks: `${remarks.trim()} [櫃檯現場收銀]`
        },
        total: cartTotal,
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
        changeAmount: received - cartTotal
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
  };

  // Filter items by category
  const filteredMenuItems = menuItems.filter(item => item.category === activeCategory);

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
          {/* Left Panel: Menu Item Grid */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '20px 24px',
            borderRight: '1px solid var(--border)'
          }}>
            {/* Category selection tabs */}
            <div style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <button
                onClick={() => setActiveCategory('mee-sua')}
                style={{
                  padding: '10px 20px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: activeCategory === 'mee-sua' ? 'var(--primary)' : 'var(--border)',
                  backgroundColor: activeCategory === 'mee-sua' ? 'var(--primary)' : 'var(--bg-card)',
                  color: activeCategory === 'mee-sua' ? 'white' : 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                🍜 招牌麵線
              </button>
              <button
                onClick={() => setActiveCategory('specialties')}
                style={{
                  padding: '10px 20px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: activeCategory === 'specialties' ? 'var(--primary)' : 'var(--border)',
                  backgroundColor: activeCategory === 'specialties' ? 'var(--primary)' : 'var(--bg-card)',
                  color: activeCategory === 'specialties' ? 'white' : 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                🔥 特色小吃
              </button>
            </div>

            {/* Menu Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: '16px'
            }}>
              {filteredMenuItems.map(item => (
                <div 
                  key={item.id}
                  onClick={() => handleProductClick(item)}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }}
                >
                  <div style={{ height: '110px', width: '100%', overflow: 'hidden', borderBottom: '1px solid var(--border)', position: 'relative' }}>
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.target.src = '/images/taiwanese_mee_sua.jpg';
                      }}
                    />
                    {item.customizations && (
                      <span style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        fontSize: '0.6rem',
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(255, 107, 53, 0.9)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        可客製
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)' }}>{item.name}</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--primary)' }}>NT$ {item.price}</span>
                      <span style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 107, 53, 0.1)',
                        color: 'var(--primary)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: '0.9rem',
                        fontWeight: 'bold'
                      }}>+</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Transaction Cart & Checkout */}
          <div style={{
            width: '420px',
            backgroundColor: 'var(--bg-card)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Cart Items List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              borderBottom: '1px solid var(--border)'
            }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '10px', margin: '0 0 12px 0', display: 'flex', justifyContent: 'space-between' }}>
                <span>🛒 點餐清單</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{cart.length} 項商品</span>
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

              {/* Total display */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.05rem',
                fontWeight: '800',
                borderTop: '1px dashed var(--border)',
                paddingTop: '10px',
                marginTop: '4px'
              }}>
                <span>應收金額:</span>
                <span style={{ color: 'var(--primary)' }}>NT$ {cartTotal}</span>
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
                gap: '8px',
                flexWrap: 'wrap'
              }}>
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
