import React from 'react';

export default function CartPanel({ cart, onClose, onUpdateQty, onRemoveItem, onCheckout }) {
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const serviceCharge = 0; // vermicelli shops usually don't charge service fees! Let's keep it simple.
  const total = subtotal + serviceCharge;

  return (
    <div className="modal-backdrop cart-panel-backdrop" onClick={onClose}>
      <div className="cart-panel-content" onClick={(e) => e.stopPropagation()}>
        <div className="cart-panel-header">
          <h3>我的購物籃 ({cart.reduce((sum, item) => sum + item.quantity, 0)})</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="cart-items-list">
          {cart.length === 0 ? (
            <div className="cart-empty-state">
              <span className="cart-empty-icon">🛒</span>
              <p>購物籃是空的</p>
              <p style={{ fontSize: '0.85rem' }}>快去選購好吃的麵線吧！</p>
            </div>
          ) : (
            cart.map((item) => (
              <div className="cart-item-card" key={item.cartId}>
                <div className="cart-item-details">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-specs">
                    {item.specs.map((spec, idx) => (
                      <span key={idx} className="cart-item-spec-item">{spec}</span>
                    ))}
                  </div>
                  <div className="cart-item-bottom">
                    <span className="cart-item-price">NT$ {item.totalPrice}</span>
                    <div className="qty-counter">
                      <button
                        className="qty-btn"
                        style={{ width: '28px', height: '28px', fontSize: '0.9rem' }}
                        onClick={() => onUpdateQty(item.cartId, item.quantity - 1)}
                      >
                        -
                      </button>
                      <span className="qty-val" style={{ fontSize: '0.95rem' }}>{item.quantity}</span>
                      <button
                        className="qty-btn"
                        style={{ width: '28px', height: '28px', fontSize: '0.9rem' }}
                        onClick={() => onUpdateQty(item.cartId, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-summary-section">
            <div className="summary-row">
              <span>小計</span>
              <span>NT$ {subtotal}</span>
            </div>
            <div className="summary-row">
              <span>清潔服務費</span>
              <span>NT$ {serviceCharge}</span>
            </div>
            <div className="summary-row total">
              <span>總金額</span>
              <span>NT$ {total}</span>
            </div>
            <button className="cart-checkout-btn" onClick={onCheckout}>
              前往結帳 (共 NT$ {total})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
