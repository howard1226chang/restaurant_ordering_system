import React, { useState, useEffect } from 'react';

export default function PinLockScreen({ expectedPin, onSuccess, title, subtitle }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Handle number click
  const handleNumClick = (num) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(false);
    }
  };

  // Handle backspace
  const handleBackspace = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError(false);
    }
  };

  // Handle clear all
  const handleClear = () => {
    setPin('');
    setError(false);
  };

  // Check pin when it reaches 4 digits
  useEffect(() => {
    if (pin.length === 4) {
      if (pin === expectedPin) {
        // Success!
        onSuccess(rememberMe);
      } else {
        // Fail: trigger shake animation
        setError(true);
        const timer = setTimeout(() => {
          setPin('');
          setError(false);
        }, 800); // clear after animation completes
        return () => clearTimeout(timer);
      }
    }
  }, [pin, expectedPin, onSuccess, rememberMe]);

  // Support physical keyboard inputs
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleNumClick(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-body)',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Styles for shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
        .shake-element {
          animation: shake 0.5s ease-in-out;
        }
        .pin-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid var(--primary);
          transition: all 0.15s ease;
        }
        .pin-dot.filled {
          background-color: var(--primary);
          transform: scale(1.15);
        }
        .pin-dot.error {
          border-color: #ef4444;
          background-color: #ef4444;
        }
        .keypad-btn {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background-color: var(--bg-card);
          color: var(--text-main);
          font-size: 1.5rem;
          font-weight: 600;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .keypad-btn:active {
          background-color: var(--primary);
          color: white;
          border-color: var(--primary);
          transform: scale(0.92);
        }
        .keypad-btn.special {
          font-size: 0.9rem;
          font-weight: normal;
          border-color: transparent;
          background-color: transparent;
        }
        .keypad-btn.special:active {
          background-color: rgba(255, 107, 53, 0.1);
          color: var(--primary);
          border-color: transparent;
        }
      `}</style>

      <div className={error ? 'shake-element' : ''} style={{
        width: '100%',
        maxWidth: '360px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: '30px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px'
      }}>
        {/* Header */}
        <div>
          <span style={{ fontSize: '2.5rem' }}>🔒</span>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: '10px 0 4px 0', color: 'var(--text-main)' }}>
            {title || '安全存取鎖定中'}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            {subtitle || '請輸入四位數 PIN 碼進行驗證'}
          </p>
        </div>

        {/* PIN Indicators */}
        <div style={{ display: 'flex', gap: '16px', margin: '10px 0' }}>
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div 
                key={index} 
                className={`pin-dot ${isFilled ? 'filled' : ''} ${error ? 'error' : ''}`} 
              />
            );
          })}
        </div>

        {/* Error message */}
        <div style={{ height: '18px', fontSize: '0.75rem', color: '#ef4444', fontWeight: 'bold' }}>
          {error ? '密碼錯誤，請重新輸入' : ''}
        </div>

        {/* Virtual Keypad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px 20px',
          margin: '10px 0'
        }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button key={num} className="keypad-btn" onClick={() => handleNumClick(num)}>
              {num}
            </button>
          ))}
          <button className="keypad-btn special" onClick={handleClear}>
            C
          </button>
          <button className="keypad-btn" onClick={() => handleNumClick('0')}>
            0
          </button>
          <button className="keypad-btn special" onClick={handleBackspace} style={{ fontSize: '1.2rem' }}>
            ⌫
          </button>
        </div>

        {/* Remember Me Checkbox */}
        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          marginTop: '6px',
          userSelect: 'none'
        }}>
          <input 
            type="checkbox" 
            checked={rememberMe} 
            onChange={(e) => setRememberMe(e.target.checked)}
            style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
          />
          記住登入狀態（一週內免輸入）
        </label>
      </div>
    </div>
  );
}
