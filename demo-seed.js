/**
 * Demo 数据自动初始化模块
 * 服务器启动时自动创建 demo 用户并填充测试数据
 * 适用于 Railway 等文件系统易失的部署环境
 */

const bcrypt = require('bcryptjs');

/**
 * 初始化 demo 数据（幂等：已有数据则跳过）
 */
function seedDemoData(db) {
  // 1. 创建 demo 用户
  const userId = createDemoUser(db);
  if (!userId) return;

  // 检查是否已填充过数据（用护肤品表判断）
  const skincareCount = db.prepare('SELECT COUNT(*) as c FROM skincare WHERE user_id = ?').get(userId).c;
  if (skincareCount > 0) {
    console.log('Demo 数据已存在，跳过填充');
    return;
  }

  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };
  const minusDays = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };
  const addMonths = (n) => { const d = new Date(today); d.setMonth(d.getMonth() + n); return fmt(d); };

  // 2. 护肤品（15条）
  seedSkincare(db, userId, minusDays, addMonths);

  // 3. 食材（15条）
  seedFood(db, userId, minusDays, addDays);

  // 4. 彩妆（15条）
  seedMakeup(db, userId, minusDays, addDays, addMonths);

  // 5. 生活用品（12条）
  seedHousehold(db, userId, minusDays, addDays, addMonths);

  // 6. 健康记录（15条，最近30天）
  seedHealthRecords(db, userId, minusDays);

  // 7. 日记（10条，最近10天）
  seedDiary(db, userId, minusDays);

  // 8. 本月提醒
  seedMonthReminder(db, userId);

  console.log('Demo 数据填充完成（用户：demo / demo123456）');
}

function createDemoUser(db) {
  const username = 'demo';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return existing.id;

  const hashedPassword = bcrypt.hashSync('demo123456', 10);
  const info = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
  console.log(`创建 demo 用户成功，ID: ${info.lastInsertRowid}`);
  return info.lastInsertRowid;
}

function seedSkincare(db, userId, minusDays, addMonths) {
  const items = [
    { name: '小棕瓶精华', brand: '雅诗兰黛', category: '精华', price: 680, volume: '50ml', openDaysAgo: 79, shelf: 12, remaining: '60%', feel: '滋润好吸收', rebuy: '会回购', season: '四季', skin: '干性', notes: '夜间修护精华' },
    { name: '神仙水', brand: 'SK-II', category: '化妆水', price: 1580, volume: '230ml', openDaysAgo: 30, shelf: 6, remaining: '40%', feel: '清爽', rebuy: '会回购', season: '四季', skin: '混合', notes: '230ml大瓶装，用得很快' },
    { name: '大红瓶面霜', brand: 'SK-II', category: '面霜', price: 1280, volume: '80g', openDaysAgo: 45, shelf: 12, remaining: '70%', feel: '滋润型', rebuy: '会回购', season: '秋冬', skin: '干性', notes: '滋润型，冬天用合适' },
    { name: '氨基酸洁面', brand: '芙丽芳丝', category: '洁面', price: 99, volume: '100g', openDaysAgo: 18, shelf: 6, remaining: '80%', feel: '温和', rebuy: '会回购', season: '四季', skin: '敏感肌', notes: '温和不刺激' },
    { name: '金胶', brand: '伊丽莎白雅顿', category: '精华', price: 580, volume: '60粒', openDaysAgo: 162, shelf: 24, remaining: '90%', feel: '油润', rebuy: '考虑中', season: '秋冬', skin: '干性', notes: '约60粒，每次1粒' },
    { name: '粉胶', brand: '伊丽莎白雅顿', category: '精华', price: 580, volume: '60粒', unopened: true, shelf: 24, remaining: '100%', notes: '未开封，囤货' },
    { name: '牛油果眼霜', brand: '科颜氏', category: '眼霜', price: 320, volume: '28g', openDaysAgo: 181, shelf: 6, remaining: '30%', feel: '滋润', rebuy: '会回购', season: '秋冬', skin: '干性', notes: '快用完了，快到期' },
    { name: '高保湿面霜', brand: '科颜氏', category: '面霜', price: 380, volume: '125ml', openDaysAgo: 49, shelf: 12, remaining: '50%', feel: '保湿好', rebuy: '会回购', season: '秋冬', skin: '干性', notes: '125ml大容量' },
    { name: '紫熨斗眼霜', brand: '欧莱雅', category: '眼霜', price: 280, volume: '30ml', openDaysAgo: 178, shelf: 6, remaining: '85%', feel: '轻薄', rebuy: '考虑中', season: '四季', skin: '混合', notes: '玻色因成分，即将到期' },
    { name: '黑绷带面霜', brand: '赫莲娜', category: '面霜', price: 3680, volume: '50ml', openDaysAgo: 374, shelf: 12, remaining: '45%', feel: '修复好', rebuy: '会回购', season: '四季', skin: '敏感肌', notes: '已过期，修复效果好但要扔掉了' },
    { name: '绿宝瓶精华', brand: '赫莲娜', category: '精华', price: 1680, volume: '50ml', openDaysAgo: 14, shelf: 12, remaining: '65%', feel: '维稳', rebuy: '会回购', season: '四季', skin: '混合', notes: '维稳精华，刚开封' },
    { name: '紫苏水', brand: '黛珂', category: '化妆水', price: 380, volume: '150ml', unopened: true, shelf: 12, remaining: '100%', notes: '未开封，囤货中' },
    { name: '牛油果乳液', brand: '黛珂', category: '乳液', price: 380, volume: '150ml', unopened: true, shelf: 12, remaining: '100%', notes: '和紫苏水一套' },
    { name: '蓝胖子防晒', brand: '资生堂', category: '防晒', price: 298, volume: '50ml', openDaysAgo: 223, shelf: 6, remaining: '50%', feel: '清爽不油腻', rebuy: '会回购', season: '春夏', skin: '混合', notes: '已过期，记得扔掉' },
    { name: '安耐晒金瓶', brand: '资生堂', category: '防晒', price: 258, volume: '60ml', unopened: true, shelf: 12, remaining: '100%', notes: '户外用，未开封' },
  ];

  const stmt = db.prepare(`
    INSERT INTO skincare (user_id, name, brand, category, price, volume, purchase_date, open_date, expiry_date, shelf_life_months, remaining_amount, wear_feel, rebuy, season, skin_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  items.forEach(item => {
    const purchaseDate = minusDays(item.openDaysAgo ? item.openDaysAgo + 15 : 70);
    const openDate = item.unopened ? null : minusDays(item.openDaysAgo);
    const expiryDate = item.unopened
      ? addMonths(item.shelf)
      : (() => {
          const d = new Date(openDate);
          d.setMonth(d.getMonth() + item.shelf);
          return d.toISOString().split('T')[0];
        })();

    stmt.run(userId, item.name, item.brand, item.category, item.price, item.volume,
      purchaseDate, openDate, expiryDate, item.shelf, item.remaining,
      item.feel || null, item.rebuy || null, item.season || null, item.skin || null, item.notes);
  });

  console.log(`已填充 ${items.length} 条护肤品数据`);
}

function seedFood(db, userId, minusDays, addDays) {
  const items = [
    { name: '有机鸡蛋', category: '蛋奶', buyAgo: 4, expDays: 11, location: '冰箱冷藏', qty: 3, unit: '个', threshold: 4, notes: '快吃完了，记得补货' },
    { name: '全脂牛奶', category: '蛋奶', buyAgo: 3, expDays: 4, location: '冰箱冷藏', qty: 1, unit: '升', threshold: 2, notes: '只剩1盒，库存不足' },
    { name: '鸡胸肉', category: '肉类', buyAgo: 7, expDays: 1, location: '冰箱冷冻', qty: 1.5, unit: 'kg', threshold: 0.5, notes: '分装好的，快到期了' },
    { name: '三文鱼', category: '肉类', buyAgo: 2, expDays: 2, location: '冰箱冷藏', qty: 0.5, unit: 'kg', threshold: 0, notes: '刺身级，2天内吃完' },
    { name: '西兰花', category: '蔬菜', buyAgo: 4, expDays: 3, location: '冰箱冷藏', qty: 1, unit: '颗', threshold: 2, notes: '只剩1颗，该买了' },
    { name: '胡萝卜', category: '蔬菜', buyAgo: 9, expDays: 21, location: '冰箱冷藏', qty: 5, unit: '根', threshold: 2, notes: '比较耐放' },
    { name: '苹果', category: '水果', buyAgo: 6, expDays: 16, location: '冰箱冷藏', qty: 8, unit: '个', threshold: 3, notes: '红富士，脆甜' },
    { name: '蓝莓', category: '水果', buyAgo: 3, expDays: 5, location: '冰箱冷藏', qty: 2, unit: '盒', threshold: 1, notes: '125g每盒' },
    { name: '燕麦片', category: '主食', buyAgo: 96, expDays: 88, location: '橱柜', qty: 0.2, unit: 'kg', threshold: 0.3, notes: '快吃完了，要补货' },
    { name: '糙米', category: '主食', buyAgo: 132, expDays: 52, location: '橱柜', qty: 2, unit: 'kg', threshold: 0.5, notes: '杂粮，健康饮食' },
    { name: '橄榄油', category: '调料', buyAgo: 244, expDays: 121, location: '橱柜', qty: 1, unit: '升', threshold: 0, notes: '初榨橄榄油' },
    { name: '蜂蜜', category: '调料', buyAgo: 202, expDays: 529, location: '橱柜', qty: 0.5, unit: 'kg', threshold: 0, notes: '洋槐蜜，泡水喝' },
    { name: '老酸奶', category: '蛋奶', buyAgo: 18, expDays: -11, location: '冰箱冷藏', qty: 4, unit: '杯', threshold: 0, notes: '已过期，请勿食用' },
    { name: '速冻虾仁', category: '肉类', buyAgo: 25, expDays: 67, location: '冰箱冷冻', qty: 1, unit: 'kg', threshold: 0.3, notes: '速冻虾仁，方便快捷' },
    { name: '西红柿', category: '蔬菜', buyAgo: 5, expDays: 7, location: '冰箱冷藏', qty: 6, unit: '个', threshold: 2, notes: '做番茄炒蛋' },
  ];

  const stmt = db.prepare(`
    INSERT INTO food (user_id, name, category, purchase_date, expiry_date, location, quantity, unit, replenish_threshold, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  items.forEach(item => {
    stmt.run(userId, item.name, item.category, minusDays(item.buyAgo), addDays(item.expDays),
      item.location, item.qty, item.unit, item.threshold, item.notes);
  });

  console.log(`已填充 ${items.length} 条食材数据`);
}

function seedMakeup(db, userId, minusDays, addDays, addMonths) {
  const items = [
    // 2个已过期
    { name: '烈艳蓝金唇膏999', category: '口红', brand: '迪奥', price: 350, color: '正红色', openDaysAgo: 374, shelf: 12, remaining: '40%', repurchase: '会回购', season: '四季', skin: '混合', notes: '经典正红，已过期' },
    { name: '恒颜无瑕粉底液', category: '粉底', brand: 'YSL', price: 580, color: 'B20自然色', openDaysAgo: 390, shelf: 12, remaining: '30%', repurchase: '会回购', season: '四季', skin: '混合', notes: '持妆效果好，已过期' },
    // 3个30天内
    { name: '九色眼影盘', category: '眼影', brand: 'MAC', price: 420, color: '大地色系', openDaysAgo: 349, shelf: 12, remaining: '70%', repurchase: '考虑中', season: '秋冬', skin: '混合', notes: '大地色很实用' },
    { name: '炫色腮红', category: '腮红', brand: 'NARS', price: 300, color: 'Orgasm高潮色', openDaysAgo: 339, shelf: 12, remaining: '50%', repurchase: '会回购', season: '四季', skin: '混合', notes: '网红色号' },
    { name: '炫密睫毛膏', category: '睫毛膏', brand: '香奈儿', price: 380, color: '黑色', openDaysAgo: 344, shelf: 12, remaining: '60%', repurchase: '会回购', season: '四季', skin: '混合', notes: '纤长效果好' },
    // 4个90天内
    { name: '三角眉笔', category: '眉笔', brand: '花西子', price: 79, color: '深棕色', openDaysAgo: 272, shelf: 12, remaining: '50%', repurchase: '会回购', season: '四季', skin: '混合', notes: '国货好品' },
    { name: '高光粉饼', category: '高光', brand: '完美日记', price: 99, color: '香槟色', openDaysAgo: 256, shelf: 12, remaining: '70%', repurchase: '考虑中', season: '四季', skin: '混合', notes: '日常百搭' },
    { name: '遮瑕膏', category: '遮瑕', brand: '迪奥', price: 320, color: '自然色', openDaysAgo: 246, shelf: 12, remaining: '40%', repurchase: '会回购', season: '四季', skin: '干性', notes: '遮盖力强' },
    { name: '空气蜜粉散粉', category: '散粉', brand: '花西子', price: 169, color: '透明色', openDaysAgo: 282, shelf: 12, remaining: '55%', repurchase: '会回购', season: '四季', skin: '混合', notes: '定妆持久' },
    // 6个正常
    { name: '小金条口红21', category: '口红', brand: 'YSL', price: 380, color: '复古红', openDaysAgo: 182, shelf: 12, remaining: '70%', repurchase: '会回购', season: '秋冬', skin: '混合', notes: '复古显白' },
    { name: '定制无瑕粉底液', category: '粉底', brand: 'MAC', price: 450, color: 'N18', openDaysAgo: 95, shelf: 12, remaining: '80%', repurchase: '考虑中', season: '四季', skin: '混合', notes: '持妆666' },
    { name: '四色眼影盘', category: '眼影', brand: '香奈儿', price: 580, color: '暖棕调', openDaysAgo: 141, shelf: 12, remaining: '75%', repurchase: '会回购', season: '秋冬', skin: '混合', notes: '高级质感' },
    { name: '微醺腮红', category: '腮红', brand: '完美日记', price: 89, color: '蜜桃色', unopened: true, shelf: 18, remaining: '100%', notes: '未开封' },
    { name: '纵欲惹火唇膏', category: '口红', brand: 'NARS', price: 280, color: 'Mona红棕', openDaysAgo: 79, shelf: 12, remaining: '85%', repurchase: '考虑中', season: '秋冬', skin: '混合', notes: '红棕气质' },
    { name: '凝脂轻透亮高光', category: '高光', brand: '迪奥', price: 420, color: '珍珠白', unopened: true, shelf: 24, remaining: '100%', notes: '未开封囤货' },
  ];

  const stmt = db.prepare(`
    INSERT INTO makeup (user_id, name, category, brand, price, color, open_date, shelf_life_months, expiry_date, remaining_amount, repurchase, season, skin_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  items.forEach(item => {
    const openDate = item.unopened ? null : minusDays(item.openDaysAgo);
    let expiryDate;
    if (item.unopened) {
      expiryDate = addMonths(item.shelf);
    } else {
      const d = new Date(openDate);
      d.setMonth(d.getMonth() + item.shelf);
      expiryDate = d.toISOString().split('T')[0];
    }

    stmt.run(userId, item.name, item.category, item.brand, item.price,
      item.color, openDate, item.shelf, expiryDate, item.remaining,
      item.repurchase || null, item.season || null, item.skin || null, item.notes);
  });

  console.log(`已填充 ${items.length} 条彩妆数据`);
}

function seedHousehold(db, userId, minusDays, addDays, addMonths) {
  const items = [
    { name: '抽纸', category: '纸品湿巾', buyAgo: 25, expMonths: 24, qty: 6, unit: '包', location: '储物柜', price: 29.9, notes: '三层加厚，日常必备' },
    { name: '卷纸', category: '纸品湿巾', buyAgo: 60, expMonths: 24, qty: 2, unit: '提', location: '储物柜', price: 45.0, notes: '10卷每提，囤货' },
    { name: '洗衣液', category: '衣物清洁', buyAgo: 14, expMonths: 12, qty: 1, unit: '瓶', location: '阳台', price: 39.9, notes: '3L大瓶装，薰衣草香' },
    { name: '柔顺剂', category: '衣物清洁', buyAgo: 40, expMonths: 12, qty: 1, unit: '瓶', location: '阳台', price: 25.0, notes: '衣物柔软防静电' },
    { name: '牙膏', category: '个护清洁', buyAgo: 4, expMonths: 24, qty: 3, unit: '支', location: '卫生间', price: 15.9, notes: '薄荷味，囤了3支' },
    { name: '洗发水', category: '个护清洁', buyAgo: 86, expMonths: 24, qty: 1, unit: '瓶', location: '卫生间', price: 68.0, notes: '750ml，去屑型' },
    { name: '沐浴露', category: '个护清洁', buyAgo: 75, expMonths: 12, qty: 1, unit: '瓶', location: '卫生间', price: 42.0, notes: '500ml，柑橘香' },
    { name: '垃圾袋', category: '家居清洁', buyAgo: 9, expMonths: 36, qty: 3, unit: '卷', location: '厨房', price: 19.9, notes: '加厚大号，每卷50只' },
    { name: '保鲜膜', category: '家居清洁', buyAgo: 30, expMonths: 24, qty: 2, unit: '盒', location: '厨房', price: 18.0, notes: '食品级，30cm宽' },
    { name: '洗洁精', category: '家居清洁', buyAgo: 14, expMonths: 12, qty: 2, unit: '瓶', location: '厨房', price: 22.0, notes: '食品用，柠檬味' },
    { name: '充电线', category: '数码配件', buyAgo: 157, noExpiry: true, qty: 3, unit: '根', location: '抽屉', price: 29.9, notes: 'Type-C快充线' },
    { name: '充电宝', category: '数码配件', buyAgo: 178, noExpiry: true, qty: 1, unit: '个', location: '抽屉', price: 129.0, notes: '20000mAh，双向快充' },
  ];

  const stmt = db.prepare(`
    INSERT INTO household_items (user_id, name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  items.forEach(item => {
    const purchaseDate = minusDays(item.buyAgo);
    const expiryDate = item.noExpiry ? null : addMonths(item.expMonths);
    stmt.run(userId, item.name, item.category, purchaseDate, expiryDate, item.qty, item.unit, item.location, item.price, item.notes);
  });

  console.log(`已填充 ${items.length} 条生活用品数据`);
}

function seedHealthRecords(db, userId, minusDays) {
  const records = [
    { daysAgo: 29, weather: '晴', feeling: '良好', weight: 51.2, notes: '早起跑步了，状态不错' },
    { daysAgo: 27, weather: '多云', feeling: '良好', fasting: 5.0, weight: 51.0, notes: '血糖正常，继续保持' },
    { daysAgo: 24, weather: '小雨', feeling: '一般', weight: 50.8, notes: '下雨天有点懒' },
    { daysAgo: 21, weather: '晴', feeling: '充实', postprandial: 6.5, weight: 51.5, notes: '今天工作效率很高' },
    { daysAgo: 19, weather: '晴', feeling: '良好', fasting: 5.2, weight: 51.3, notes: '周末了，心情好' },
    { daysAgo: 16, weather: '阴', feeling: '平静', weight: 51.1, notes: '新的一周开始了' },
    { daysAgo: 14, weather: '晴', feeling: '开心', weight: 50.9, notes: '和朋友聚餐了' },
    { daysAgo: 12, weather: '多云', feeling: '良好', fasting: 4.8, weight: 50.7, notes: '血糖偏低，最近吃得清淡' },
    { daysAgo: 10, weather: '晴', feeling: '疲惫', weight: 51.8, menstrual: '经期', notes: '来例假了，腰酸背痛' },
    { daysAgo: 9, weather: '多云', feeling: '一般', weight: 52.0, menstrual: '经期', notes: '量比较多，肚子胀' },
    { daysAgo: 8, weather: '小雨', feeling: '慵懒', weight: 51.9, menstrual: '经期', notes: '下雨天想睡觉' },
    { daysAgo: 6, weather: '晴', feeling: '良好', fasting: 5.1, weight: 51.5, menstrual: '经期', notes: '快结束了，状态好转' },
    { daysAgo: 4, weather: '晴', feeling: '充实', postprandial: 7.0, weight: 51.3, notes: '精力恢复了，去健身房了' },
    { daysAgo: 2, weather: '多云', feeling: '良好', weight: 51.0, notes: '这周状态不错' },
    { daysAgo: 0, weather: '晴', feeling: '开心', fasting: 4.9, weight: 50.8, notes: '体重终于回到51以下了！' },
  ];

  const stmt = db.prepare(`
    INSERT INTO health_records (user_id, record_date, weather, feeling, fasting_glucose, postprandial_glucose, weight, menstrual_status, mood_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  records.forEach(r => {
    stmt.run(userId, minusDays(r.daysAgo), r.weather, r.feeling,
      r.fasting || null, r.postprandial || null, r.weight,
      r.menstrual || null, r.notes);
  });

  console.log(`已填充 ${records.length} 条健康记录`);
}

function seedDiary(db, userId, minusDays) {
  const entries = [
    { daysAgo: 0, weather: '晴', mood: '开心', notes: '今天天气很好，早上去公园跑步了，整个人都神清气爽。下午和朋友喝了下午茶，聊了很多近况。晚上在家做了瑜伽，一天过得很充实。' },
    { daysAgo: 1, weather: '多云', mood: '平静', notes: '工作日的一天，按时完成了工作任务。中午吃了轻食沙拉，感觉身体轻盈了一些。晚上看了一部电影，很治愈。' },
    { daysAgo: 2, weather: '小雨', mood: '慵懒', notes: '下雨的一天，赖床到很晚。下午窝在沙发上看书，很有启发。晚上煮了一碗热腾腾的面，下雨天和汤面最配了。' },
    { daysAgo: 3, weather: '晴', mood: '充实', notes: '今天安排了很多事情。早上打扫卫生，把家里收拾得干干净净。下午去超市采购了下周的食材，列了清单没有乱买。晚上做了一顿丰盛的晚餐奖励自己。' },
    { daysAgo: 4, weather: '阴', mood: '一般', notes: '工作特别忙，加班到很晚。回到家已经很累了，简单洗漱就睡了。希望明天能轻松一点。' },
    { daysAgo: 5, weather: '晴', mood: '期待', notes: '今天工作效率很高，完成了一个重要项目。晚上和同事一起吃了饭，庆祝项目顺利交付。周末快到了，计划去爬山。' },
    { daysAgo: 6, weather: '大风', mood: '烦躁', notes: '今天风特别大，出门头发都吹乱了。工作上也遇到了一些不顺心的事情，有点烦躁。晚上去跑了步，出了一身汗，心情好多了。' },
    { daysAgo: 7, weather: '晴', mood: '开心', notes: '今天收到了网购的护肤品，拆快递的快乐！买了黛珂的紫苏水和牛油果乳液，之前用过试用装觉得不错。等手上的用完就开封试试。' },
    { daysAgo: 8, weather: '多云', mood: '平静', notes: '新的一周开始了。早上起得比较早，做了一顿丰盛的早餐：燕麦粥配鸡蛋和水果。好好吃早饭真的会让一上午都很有精神。继续保持这个好习惯！' },
    { daysAgo: 9, weather: '晴', mood: '满足', notes: '周日的悠闲时光。早上睡了个懒觉，然后慢悠悠地做了brunch。下午去逛了书店，买了两本想看很久的书。晚上在家追了剧，完美的周末ending。' },
  ];

  const stmt = db.prepare(`
    INSERT INTO diary (user_id, date, weather, mood, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  entries.forEach(e => {
    stmt.run(userId, minusDays(e.daysAgo), e.weather, e.mood, e.notes);
  });

  console.log(`已填充 ${entries.length} 条日记`);
}

function seedMonthReminder(db, userId) {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  
  const content = `${month}月${day + 6}日 朋友生日，记得准备礼物
${month}月底 交房租
本周要买：牛奶、鸡蛋、洗衣液
月底前体检预约`;

  db.prepare('INSERT OR REPLACE INTO month_reminders (user_id, content) VALUES (?, ?)').run(userId, content);
  console.log('已填充本月提醒');
}

module.exports = { seedDemoData };
