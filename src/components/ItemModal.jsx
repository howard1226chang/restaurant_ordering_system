import React, { useState, useEffect } from 'react';

export default function ItemModal({ item, onClose, onAddToCart, condimentsAvailability }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedRadioOptions, setSelectedRadioOptions] = useState({});
  const [selectedCheckboxes, setSelectedCheckboxes] = useState({});
  const [selectedDropdowns, setSelectedDropdowns] = useState({});
  const [totalPrice, setTotalPrice] = useState(item.price);

  // Initialize selections based on item's customizations
  useEffect(() => {
    if (!item.customizations) return;

    const initialRadio = {};
    const initialCheckbox = {};
    const initialDropdown = {};

    Object.entries(item.customizations).forEach(([key, customGroup]) => {
      if (customGroup.type === 'radio') {
        initialRadio[key] = customGroup.default || customGroup.options[0].label;
      } else if (customGroup.type === 'checkbox') {
        initialCheckbox[key] = {}; // empty object, none selected initially
      } else if (customGroup.type === 'selects') {
        const dropVals = {};
        customGroup.options.forEach(opt => {
          const isAvailable = !condimentsAvailability || condimentsAvailability[opt.name] !== false;
          if (isAvailable) {
            dropVals[opt.name] = opt.default;
          }
        });
        initialDropdown[key] = dropVals;
      }
    });

    setSelectedRadioOptions(initialRadio);
    setSelectedCheckboxes(initialCheckbox);
    setSelectedDropdowns(initialDropdown);
  }, [item, condimentsAvailability]);

  // Recalculate price whenever selections change
  useEffect(() => {
    let price = item.price;

    if (item.customizations) {
      Object.entries(item.customizations).forEach(([key, customGroup]) => {
        if (customGroup.type === 'radio') {
          const selectedLabel = selectedRadioOptions[key];
          const matchedOpt = customGroup.options.find(o => o.label === selectedLabel);
          if (matchedOpt) {
            price += matchedOpt.priceChange || 0;
          }
        } else if (customGroup.type === 'checkbox') {
          const activeChecks = selectedCheckboxes[key] || {};
          customGroup.options.forEach(opt => {
            if (activeChecks[opt.label]) {
              price += opt.priceChange || 0;
            }
          });
        }
        // dropdowns (condiments) have no price change
      });
    }

    setTotalPrice(price * quantity);
  }, [selectedRadioOptions, selectedCheckboxes, selectedDropdowns, quantity, item]);

  const handleRadioChange = (groupKey, optionLabel) => {
    setSelectedRadioOptions(prev => ({
      ...prev,
      [groupKey]: optionLabel
    }));
  };

  const handleCheckboxChange = (groupKey, optionLabel) => {
    setSelectedCheckboxes(prev => {
      const currentGroup = prev[groupKey] || {};
      return {
        ...prev,
        [groupKey]: {
          ...currentGroup,
          [optionLabel]: !currentGroup[optionLabel]
        }
      };
    });
  };

  const handleDropdownChange = (groupKey, selectName, value) => {
    setSelectedDropdowns(prev => {
      const currentGroup = prev[groupKey] || {};
      return {
        ...prev,
        [groupKey]: {
          ...currentGroup,
          [selectName]: value
        }
      };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Compile specification list for display in cart
    const specs = [];
    if (item.customizations) {
      Object.entries(item.customizations).forEach(([key, customGroup]) => {
        if (customGroup.type === 'radio') {
          specs.push(`${customGroup.title}: ${selectedRadioOptions[key]}`);
        } else if (customGroup.type === 'checkbox') {
          const selectedList = Object.entries(selectedCheckboxes[key] || {})
            .filter(([_, isChecked]) => isChecked)
            .map(([label]) => label);
          if (selectedList.length > 0) {
            specs.push(`${customGroup.title}: ${selectedList.join(', ')}`);
          }
        } else if (customGroup.type === 'selects') {
          const dropdownList = Object.entries(selectedDropdowns[key] || {})
            .filter(([name]) => !condimentsAvailability || condimentsAvailability[name] !== false)
            .map(([name, val]) => `${name}(${val})`);
          if (dropdownList.length > 0) {
            specs.push(`${customGroup.title}: ${dropdownList.join(' | ')}`);
          }
        }
      });
    }

    const cartItem = {
      cartId: `${item.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      id: item.id,
      name: item.name,
      basePrice: item.price,
      itemPrice: totalPrice / quantity,
      totalPrice: totalPrice,
      quantity,
      specs,
      image: item.image,
      selections: {
        radios: selectedRadioOptions,
        checkboxes: selectedCheckboxes,
        dropdowns: selectedDropdowns
      }
    };

    onAddToCart(cartItem);
    onClose();
  };

  const renderOptionGroup = (groupKey, customGroup) => {
    if (customGroup.type === 'radio') {
      return (
        <div className="option-group" key={groupKey} style={{ margin: 0 }}>
          <div className="option-group-title" style={{ marginBottom: '6px' }}>
            <span style={{ fontWeight: 'bold' }}>{customGroup.title}</span>
            <span className="option-required-tag">必選</span>
          </div>
          <div className="option-choices" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {customGroup.options.map((opt) => (
              <div
                key={opt.label}
                className={`choice-row ${selectedRadioOptions[groupKey] === opt.label ? 'selected' : ''}`}
                onClick={() => handleRadioChange(groupKey, opt.label)}
                style={{ padding: '8px 12px', borderRadius: '8px' }}
              >
                <div className="choice-input-label">
                  <input
                    type="radio"
                    name={`radio-${groupKey}`}
                    checked={selectedRadioOptions[groupKey] === opt.label}
                    onChange={() => handleRadioChange(groupKey, opt.label)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span>{opt.label}</span>
                </div>
                <span className="choice-price-diff plus" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                  NT$ {item.price + opt.priceChange}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (customGroup.type === 'checkbox') {
      return (
        <div className="option-group" key={groupKey} style={{ margin: 0 }}>
          <div className="option-group-title" style={{ marginBottom: '6px' }}>
            <span style={{ fontWeight: 'bold' }}>{customGroup.title}</span>
          </div>
          <div className="option-choices" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
            {customGroup.options.map((opt) => {
              const isChecked = !!(selectedCheckboxes[groupKey] && selectedCheckboxes[groupKey][opt.label]);
              return (
                <div
                  key={opt.label}
                  className={`choice-row ${isChecked ? 'selected' : ''}`}
                  onClick={() => handleCheckboxChange(groupKey, opt.label)}
                  style={{ padding: '8px 10px', borderRadius: '8px', margin: 0 }}
                >
                  <div className="choice-input-label">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleCheckboxChange(groupKey, opt.label)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{opt.label}</span>
                  </div>
                  {opt.priceChange > 0 && (
                    <span className="choice-price-diff plus" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>+${opt.priceChange}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (customGroup.type === 'selects') {
      const availableOptions = customGroup.options.filter(
        opt => !condimentsAvailability || condimentsAvailability[opt.name] !== false
      );

      if (availableOptions.length === 0) return null;

      return (
        <div className="option-group" key={groupKey} style={{ margin: 0 }}>
          <div className="option-group-title" style={{ marginBottom: '6px' }}>
            <span style={{ fontWeight: 'bold' }}>{customGroup.title}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {availableOptions.map((opt) => {
              const selectedVal = selectedDropdowns[groupKey]?.[opt.name] || opt.default;
              return (
                <div key={opt.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{opt.name}</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {opt.choices.map((choice) => {
                      const isSelected = selectedVal === choice;
                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => handleDropdownChange(groupKey, opt.name, choice)}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            borderRadius: '6px',
                            border: '1px solid',
                            borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                            backgroundColor: isSelected ? 'var(--primary)' : 'var(--bg-card)',
                            color: isSelected ? '#ffffff' : 'var(--text-main)',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease',
                            textAlign: 'center'
                          }}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '760px', maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '20px', borderRadius: '16px', overflow: 'hidden' }}>
        <div className="modal-header" style={{ paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>餐點客製化</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
          <div className="modal-item-info" style={{ marginTop: '0', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--primary)', margin: '0' }}>{item.name}</h2>
          </div>

          {/* Two column grid layout */}
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Left Column: size, addons, etc. (types radio, checkbox) */}
            <div style={{ flex: 1.1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {item.customizations && Object.entries(item.customizations)
                .filter(([_, customGroup]) => customGroup.type === 'radio' || customGroup.type === 'checkbox')
                .map(([groupKey, customGroup]) => renderOptionGroup(groupKey, customGroup))}
            </div>

            {/* Right Column: condiments (type selects) */}
            <div style={{ flex: 0.9, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '14px', borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
              {item.customizations && Object.entries(item.customizations)
                .filter(([_, customGroup]) => customGroup.type === 'selects')
                .map(([groupKey, customGroup]) => renderOptionGroup(groupKey, customGroup))}
            </div>
          </div>
        </form>

        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', paddingBottom: '0' }}>
          {/* Quantity Counter moved to footer next to button for space saving! */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>數量</span>
            <div className="qty-counter" style={{ margin: 0 }}>
              <button
                type="button"
                className="qty-btn"
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
              >
                -
              </button>
              <span className="qty-val" style={{ width: '30px', textAlign: 'center' }}>{quantity}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => setQuantity(q => q + 1)}
              >
                +
              </button>
            </div>
          </div>

          <button className="add-to-cart-btn" onClick={handleSubmit} style={{ flex: 1, maxWidth: '350px', margin: 0 }}>
            <span>加入購物車</span>
            <span>總計 NT$ {totalPrice}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
