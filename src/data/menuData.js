export const menuCategories = [
  { id: 'mee-sua', name: '招牌麵線', icon: '🍜' },
  { id: 'specialties', name: '特色產品', icon: '🔥' }
];

const standardMeeSuaCustomizations = {
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

export const menuItems = [
  {
    id: 'm1',
    category: 'mee-sua',
    name: '綜合麵線',
    description: '豐富的配料一次滿足！包含手作肉羹、大腸、豬肚、花枝羹與貢丸。',
    price: 75,
    image: '/images/mixed_mee_sua.jpg',
    customizations: standardMeeSuaCustomizations
  },
  {
    id: 'm2',
    category: 'mee-sua',
    name: '大腸麵線',
    description: '人氣招牌！嚴選大腸經過慢火特製滷汁細熬，Q彈入味。',
    price: 65,
    image: '/images/intestine_mee_sua.jpg',
    customizations: standardMeeSuaCustomizations
  },
  {
    id: 'm3',
    category: 'mee-sua',
    name: '豬肚麵線',
    description: '獨特美味！精心處理的鮮美豬肚，口感爽脆，香氣十足。',
    price: 65,
    image: '/images/taiwanese_mee_sua.jpg',
    customizations: standardMeeSuaCustomizations
  },
  {
    id: 'm4',
    category: 'mee-sua',
    name: '肉羹麵線',
    description: '手作肉羹口感紮實彈牙，保留豬肉最純粹的鮮甜與精華。',
    price: 65,
    image: '/images/meat_mee_sua.jpg',
    customizations: standardMeeSuaCustomizations
  },
  {
    id: 'm5',
    category: 'mee-sua',
    name: '花枝麵線',
    description: '脆口鮮甜的花枝羹，搭配滑順手工紅麵線，海陸雙重享受。',
    price: 65,
    image: '/images/taiwanese_mee_sua.jpg',
    customizations: standardMeeSuaCustomizations
  },
  {
    id: 'm6',
    category: 'mee-sua',
    name: '貢丸麵線',
    description: '紮實飽滿的貢丸，咬下去湯汁四溢，與紅麵線完美結合。',
    price: 65,
    image: '/images/taiwanese_mee_sua.jpg',
    customizations: standardMeeSuaCustomizations
  },
  {
    id: 'm7',
    category: 'mee-sua',
    name: '清麵線',
    description: '單純的手工紅麵線，搭配溫潤柴魚羹湯，散發經典香氣。',
    price: 40,
    image: '/images/plain_mee_sua.jpg',
    customizations: {
      size: standardMeeSuaCustomizations.size,
      condiments: standardMeeSuaCustomizations.condiments
    }
  },
  {
    id: 'm8',
    category: 'mee-sua',
    name: '大肉包',
    description: '老麵發酵外皮軟Q，肉餡飽滿多汁，咬開爆汁的好吃大肉包。',
    price: 25,
    image: '/images/big_meat_bun.png',
    customizations: {
      sauce: {
        title: '醬料客製',
        type: 'radio',
        options: [
          { label: '原味 (無醬)', priceChange: 0 },
          { label: '加甜辣醬', priceChange: 0 }
        ],
        default: '原味 (無醬)'
      }
    }
  },
  {
    id: 's1',
    category: 'specialties',
    name: '要你命1000',
    description: '挑戰開始！加入秘製鬼椒辣醬的地獄級麻辣大腸麵線，點餐請三思。',
    price: 120,
    image: '/images/handmade_chili.jpg',
    customizations: null
  },
  {
    id: 's2',
    category: 'specialties',
    name: '要你命2000',
    description: '狂暴雙倍辣！多重麻辣風味加上雙倍滿載配料，痛快淋漓。',
    price: 150,
    image: '/images/handmade_chili.jpg',
    customizations: null
  },
  {
    id: 's3',
    category: 'specialties',
    name: '要你命3000',
    description: '終極死神辣！挑戰您的痛覺與感官極限，龍城最辣至尊王牌！',
    price: 180,
    image: '/images/handmade_chili.jpg',
    customizations: null
  },
  {
    id: 's4',
    category: 'specialties',
    name: '辣泡菜',
    description: '店內特製黃金辣泡菜，酸辣爽脆，口感開胃，佐麵線的極佳配菜。',
    price: 210,
    image: '/images/spicy_kimchi.jpg',
    customizations: null
  },
  {
    id: 's5',
    category: 'specialties',
    name: '手工辣醬 (罐裝)',
    description: '龍城獨家秘製手工辣椒醬，香辣帶勁，純手工無防腐劑，送禮自用皆宜。',
    price: 150,
    image: '/images/handmade_chili.jpg',
    customizations: null
  }
];
