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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>餐點客製化</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-item-info" style={{ marginTop: '0' }}>
            <h2>{item.name}</h2>
            <p>{item.description}</p>
          </div>

          {item.customizations && Object.entries(item.customizations).map(([groupKey, customGroup]) => {
            if (customGroup.type === 'radio') {
              return (
                <div className="option-group" key={groupKey}>
                  <div className="option-group-title">
                    <span>{customGroup.title}</span>
                    <span className="option-required-tag">必選</span>
                  </div>
                  <div className="option-choices">
                    {customGroup.options.map((opt) => (
                      <div
                        key={opt.label}
                        className={`choice-row ${selectedRadioOptions[groupKey] === opt.label ? 'selected' : ''}`}
                        onClick={() => handleRadioChange(groupKey, opt.label)}
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
                <div className="option-group" key={groupKey}>
                  <div className="option-group-title">
                    <span>{customGroup.title}</span>
                  </div>
                  <div className="option-choices">
                    {customGroup.options.map((opt) => {
                      const isChecked = !!(selectedCheckboxes[groupKey] && selectedCheckboxes[groupKey][opt.label]);
                      return (
                        <div
                          key={opt.label}
                          className={`choice-row ${isChecked ? 'selected' : ''}`}
                          onClick={() => handleCheckboxChange(groupKey, opt.label)}
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
                            <span className="choice-price-diff plus">+${opt.priceChange}</span>
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
                <div className="option-group" key={groupKey}>
                  <div className="option-group-title" style={{ marginBottom: '8px' }}>
                    <span>{customGroup.title}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                    padding: '8px 10px',
                                    fontSize: '0.8rem',
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
          })}

          <div className="qty-row">
            <span className="qty-label">選購數量</span>
            <div className="qty-counter">
              <button
                type="button"
                className="qty-btn"
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
              >
                -
              </button>
              <span className="qty-val">{quantity}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => setQuantity(q => q + 1)}
              >
                +
              </button>
            </div>
          </div>
        </form>

        <div className="modal-footer">
          <button className="add-to-cart-btn" onClick={handleSubmit}>
            <span>加入購物車</span>
            <span>總計 NT$ {totalPrice}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
