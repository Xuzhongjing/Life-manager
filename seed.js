/**
 * 测试数据填充脚本 - seed.js
 * 功能：创建 demo 用户并插入模拟数据
 * 运行方式：node seed.js
 *
 * 说明：使用 sql.js（SQLite WebAssembly 版本）替代 better-sqlite3
 *       因 better-sqlite3 在 Node 26 上编译失败（V8 API 不兼容）
 *
 * 基准日期：2026-11-19
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const Database = require('./db');

// ==================== 模拟数据 ====================

// 护肤品数据（15条）- 基于当前日期 2026-11-19
const skincareData = [
  { name: '小棕瓶精华', brand: '雅诗兰黛', category: '精华', price: 680, volume: '50ml', purchase_date: '2026-08-15', open_date: '2026-09-01', shelf_life_months: 12, remaining_amount: '60%', wear_feel: '滋润好吸收', rebuy: '会回购', season: '四季', skin_type: '干性', notes: '夜间修护精华，用着还不错' },
  { name: '神仙水', brand: 'SK-II', category: '化妆水', price: 1580, volume: '230ml', purchase_date: '2026-10-10', open_date: '2026-10-20', shelf_life_months: 6, remaining_amount: '40%', wear_feel: '清爽', rebuy: '会回购', season: '四季', skin_type: '混合', notes: '230ml大瓶装，用得很快' },
  { name: '大红瓶面霜', brand: 'SK-II', category: '面霜', price: 1280, volume: '80g', purchase_date: '2026-09-20', open_date: '2026-10-05', shelf_life_months: 12, remaining_amount: '70%', wear_feel: '滋润型', rebuy: '会回购', season: '秋冬', skin_type: '干性', notes: '滋润型，冬天用合适' },
  { name: '氨基酸洁面', brand: '芙丽芳丝', category: '洁面', price: 99, volume: '100g', purchase_date: '2026-10-25', open_date: '2026-11-01', shelf_life_months: 6, remaining_amount: '80%', wear_feel: '温和', rebuy: '会回购', season: '四季', skin_type: '敏感肌', notes: '温和不刺激' },
  { name: '金胶', brand: '伊丽莎白雅顿', category: '精华', price: 580, volume: '60粒', purchase_date: '2026-05-28', open_date: '2026-06-10', shelf_life_months: 24, remaining_amount: '90%', wear_feel: '油润', rebuy: '考虑中', season: '秋冬', skin_type: '干性', notes: '约60粒，每次1粒' },
  { name: '粉胶', brand: '伊丽莎白雅顿', category: '精华', price: 580, volume: '60粒', purchase_date: '2026-09-15', open_date: null, shelf_life_months: 24, remaining_amount: '100%', wear_feel: null, rebuy: null, season: null, skin_type: null, notes: '未开封，囤货' },
  { name: '牛油果眼霜', brand: '科颜氏', category: '眼霜', price: 320, volume: '28g', purchase_date: '2026-05-10', open_date: '2026-05-22', shelf_life_months: 6, remaining_amount: '30%', wear_feel: '滋润', rebuy: '会回购', season: '秋冬', skin_type: '干性', notes: '快用完了，还有3天到期' },
  { name: '高保湿面霜', brand: '科颜氏', category: '面霜', price: 380, volume: '125ml', purchase_date: '2026-09-15', open_date: '2026-10-01', shelf_life_months: 12, remaining_amount: '50%', wear_feel: '保湿好', rebuy: '会回购', season: '秋冬', skin_type: '干性', notes: '125ml大容量' },
  { name: '紫熨斗眼霜', brand: '欧莱雅', category: '眼霜', price: 280, volume: '30ml', purchase_date: '2026-05-20', open_date: '2026-05-25', shelf_life_months: 6, remaining_amount: '85%', wear_feel: '轻薄', rebuy: '考虑中', season: '四季', skin_type: '混合', notes: '玻色因成分，还有6天到期' },
  { name: '黑绷带面霜', brand: '赫莲娜', category: '面霜', price: 3680, volume: '50ml', purchase_date: '2025-10-20', open_date: '2025-11-10', shelf_life_months: 12, remaining_amount: '45%', wear_feel: '修复好', rebuy: '会回购', season: '四季', skin_type: '敏感肌', notes: '已过期9天，修复效果好但要扔掉了' },
  { name: '绿宝瓶精华', brand: '赫莲娜', category: '精华', price: 1680, volume: '50ml', purchase_date: '2026-10-25', open_date: '2026-11-05', shelf_life_months: 12, remaining_amount: '65%', wear_feel: '维稳', rebuy: '会回购', season: '四季', skin_type: '混合', notes: '维稳精华，刚开封' },
  { name: '紫苏水', brand: '黛珂', category: '化妆水', price: 380, volume: '150ml', purchase_date: '2026-09-10', open_date: null, shelf_life_months: 12, remaining_amount: '100%', wear_feel: null, rebuy: null, season: null, skin_type: null, notes: '未开封，囤货中' },
  { name: '牛油果乳液', brand: '黛珂', category: '乳液', price: 380, volume: '150ml', purchase_date: '2026-09-10', open_date: null, shelf_life_months: 12, remaining_amount: '100%', wear_feel: null, rebuy: null, season: null, skin_type: null, notes: '和紫苏水一套' },
  { name: '蓝胖子防晒', brand: '资生堂', category: '防晒', price: 298, volume: '50ml', purchase_date: '2026-04-01', open_date: '2026-04-10', shelf_life_months: 6, remaining_amount: '50%', wear_feel: '清爽不油腻', rebuy: '会回购', season: '春夏', skin_type: '混合', notes: '已过期40天，记得扔掉' },
  { name: '安耐晒金瓶', brand: '资生堂', category: '防晒', price: 258, volume: '60ml', purchase_date: '2026-05-15', open_date: null, shelf_life_months: 12, remaining_amount: '100%', wear_feel: null, rebuy: null, season: null, skin_type: null, notes: '户外用，未开封' },
];

// 食材数据（15条）- 基于当前日期 2026-11-19
// 库存不足判定：quantity <= replenish_threshold
const foodData = [
  { name: '有机鸡蛋', category: '蛋奶', purchase_date: '2026-11-15', expiry_date: '2026-11-30', location: '冰箱冷藏', quantity: 3, unit: '个', replenish_threshold: 4, notes: '快吃完了，记得补货' },
  { name: '全脂牛奶', category: '蛋奶', purchase_date: '2026-11-16', expiry_date: '2026-11-23', location: '冰箱冷藏', quantity: 1, unit: '升', replenish_threshold: 2, notes: '只剩1盒了，库存不足' },
  { name: '鸡胸肉', category: '肉类', purchase_date: '2026-11-12', expiry_date: '2026-11-20', location: '冰箱冷冻', quantity: 1.5, unit: 'kg', replenish_threshold: 0.5, notes: '分装好的，明天就到期了' },
  { name: '三文鱼', category: '肉类', purchase_date: '2026-11-17', expiry_date: '2026-11-21', location: '冰箱冷藏', quantity: 0.5, unit: 'kg', replenish_threshold: 0, notes: '刺身级，新鲜的，2天内吃完' },
  { name: '西兰花', category: '蔬菜', purchase_date: '2026-11-15', expiry_date: '2026-11-22', location: '冰箱冷藏', quantity: 1, unit: '颗', replenish_threshold: 2, notes: '只剩1颗，该买了' },
  { name: '胡萝卜', category: '蔬菜', purchase_date: '2026-11-10', expiry_date: '2026-12-10', location: '冰箱冷藏', quantity: 5, unit: '根', replenish_threshold: 2, notes: '比较耐放' },
  { name: '苹果', category: '水果', purchase_date: '2026-11-13', expiry_date: '2026-12-05', location: '冰箱冷藏', quantity: 8, unit: '个', replenish_threshold: 3, notes: '红富士，脆甜' },
  { name: '蓝莓', category: '水果', purchase_date: '2026-11-16', expiry_date: '2026-11-24', location: '冰箱冷藏', quantity: 2, unit: '盒', replenish_threshold: 1, notes: '125g每盒，还有5天' },
  { name: '燕麦片', category: '主食', purchase_date: '2026-08-15', expiry_date: '2027-02-15', location: '橱柜', quantity: 0.2, unit: 'kg', replenish_threshold: 0.3, notes: '快吃完了，要补货了' },
  { name: '糙米', category: '主食', purchase_date: '2026-07-10', expiry_date: '2027-01-10', location: '橱柜', quantity: 2, unit: 'kg', replenish_threshold: 0.5, notes: '杂粮，健康饮食' },
  { name: '橄榄油', category: '调料', purchase_date: '2026-03-20', expiry_date: '2027-03-20', location: '橱柜', quantity: 1, unit: '升', replenish_threshold: 0, notes: '初榨橄榄油' },
  { name: '蜂蜜', category: '调料', purchase_date: '2026-05-01', expiry_date: '2028-05-01', location: '橱柜', quantity: 0.5, unit: 'kg', replenish_threshold: 0, notes: '洋槐蜜，泡水喝' },
  { name: '老酸奶', category: '蛋奶', purchase_date: '2026-11-01', expiry_date: '2026-11-08', location: '冰箱冷藏', quantity: 4, unit: '杯', replenish_threshold: 0, notes: '已过期11天，请勿食用' },
  { name: '速冻虾仁', category: '肉类', purchase_date: '2026-10-25', expiry_date: '2027-01-25', location: '冰箱冷冻', quantity: 1, unit: 'kg', replenish_threshold: 0.3, notes: '速冻虾仁，方便快捷' },
  { name: '西红柿', category: '蔬菜', purchase_date: '2026-11-14', expiry_date: '2026-11-26', location: '冰箱冷藏', quantity: 6, unit: '个', replenish_threshold: 2, notes: '做番茄炒蛋，还有7天' },
];

// 生活用品数据（12条）- 基于当前日期 2026-11-19
const householdData = [
  { name: '抽纸', category: '纸品湿巾', purchase_date: '2026-10-25', expiry_date: '2028-10-25', quantity: 6, unit: '包', storage_location: '储物柜', price: 29.9, notes: '三层加厚，日常必备' },
  { name: '卷纸', category: '纸品湿巾', purchase_date: '2026-09-20', expiry_date: '2028-09-20', quantity: 2, unit: '提', storage_location: '储物柜', price: 45.0, notes: '10卷每提，囤货' },
  { name: '洗衣液', category: '衣物清洁', purchase_date: '2026-11-05', expiry_date: '2027-11-05', quantity: 1, unit: '瓶', storage_location: '阳台', price: 39.9, notes: '3L大瓶装，薰衣草香' },
  { name: '柔顺剂', category: '衣物清洁', purchase_date: '2026-10-10', expiry_date: '2027-10-10', quantity: 1, unit: '瓶', storage_location: '阳台', price: 25.0, notes: '衣物柔软防静电' },
  { name: '牙膏', category: '个护清洁', purchase_date: '2026-11-15', expiry_date: '2028-11-15', quantity: 3, unit: '支', storage_location: '卫生间', price: 15.9, notes: '薄荷味，囤了3支' },
  { name: '洗发水', category: '个护清洁', purchase_date: '2026-08-25', expiry_date: '2028-08-25', quantity: 1, unit: '瓶', storage_location: '卫生间', price: 68.0, notes: '750ml，去屑型' },
  { name: '沐浴露', category: '个护清洁', purchase_date: '2026-09-05', expiry_date: '2027-09-05', quantity: 1, unit: '瓶', storage_location: '卫生间', price: 42.0, notes: '500ml，柑橘香' },
  { name: '垃圾袋', category: '家居清洁', purchase_date: '2026-11-10', expiry_date: '2029-11-10', quantity: 3, unit: '卷', storage_location: '厨房', price: 19.9, notes: '加厚大号，每卷50只' },
  { name: '保鲜膜', category: '家居清洁', purchase_date: '2026-10-20', expiry_date: '2028-10-20', quantity: 2, unit: '盒', storage_location: '厨房', price: 18.0, notes: '食品级，30cm宽' },
  { name: '洗洁精', category: '家居清洁', purchase_date: '2026-11-05', expiry_date: '2027-11-05', quantity: 2, unit: '瓶', storage_location: '厨房', price: 22.0, notes: '食品用，柠檬味' },
  { name: '充电线', category: '数码配件', purchase_date: '2026-06-15', expiry_date: null, quantity: 3, unit: '根', storage_location: '抽屉', price: 29.9, notes: 'Type-C快充线' },
  { name: '充电宝', category: '数码配件', purchase_date: '2026-05-25', expiry_date: null, quantity: 1, unit: '个', storage_location: '抽屉', price: 129.0, notes: '20000mAh，双向快充' },
];

// 彩妆数据（15条）- 基于当前日期 2026-11-19
// 到期分布：2个过期、3个30天内、4个90天内、6个正常
const makeupData = [
  // 2个已过期
  { name: '烈艳蓝金唇膏999', category: '口红', brand: '迪奥', price: 350, color: '正红色', open_date: '2025-11-10', shelf_life_months: 12, expiry_date: '2026-11-10', remaining_amount: '40%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '已过期9天，经典正红' },
  { name: '恒颜无瑕粉底液', category: '粉底', brand: 'YSL', price: 580, color: 'B20自然色', open_date: '2025-10-20', shelf_life_months: 12, expiry_date: '2026-10-25', remaining_amount: '30%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '已过期25天，持妆效果好' },
  // 3个30天内
  { name: '九色眼影盘', category: '眼影', brand: 'MAC', price: 420, color: '大地色系', open_date: '2025-12-05', shelf_life_months: 12, expiry_date: '2026-12-05', remaining_amount: '70%', repurchase: '考虑中', season: '秋冬', skin_type: '混合', notes: '还有16天到期，大地色很实用' },
  { name: '炫色腮红', category: '腮红', brand: 'NARS', price: 300, color: 'Orgasm高潮色', open_date: '2025-12-15', shelf_life_months: 12, expiry_date: '2026-12-15', remaining_amount: '50%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '还有26天到期，网红色号' },
  { name: '炫密睫毛膏', category: '睫毛膏', brand: '香奈儿', price: 380, color: '黑色', open_date: '2025-12-10', shelf_life_months: 12, expiry_date: '2026-12-10', remaining_amount: '60%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '还有21天到期，纤长效果好' },
  // 4个90天内
  { name: '三角眉笔', category: '眉笔', brand: '花西子', price: 79, color: '深棕色', open_date: '2026-02-20', shelf_life_months: 12, expiry_date: '2027-01-20', remaining_amount: '50%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '还有62天到期，国货好品' },
  { name: '高光粉饼', category: '高光', brand: '完美日记', price: 99, color: '香槟色', open_date: '2026-02-05', shelf_life_months: 12, expiry_date: '2027-02-05', remaining_amount: '70%', repurchase: '考虑中', season: '四季', skin_type: '混合', notes: '还有78天到期，日常百搭' },
  { name: '遮瑕膏', category: '遮瑕', brand: '迪奥', price: 320, color: '自然色', open_date: '2026-02-15', shelf_life_months: 12, expiry_date: '2027-02-15', remaining_amount: '40%', repurchase: '会回购', season: '四季', skin_type: '干性', notes: '还有88天到期，遮盖力强' },
  { name: '空气蜜粉散粉', category: '散粉', brand: '花西子', price: 169, color: '透明色', open_date: '2026-01-10', shelf_life_months: 12, expiry_date: '2027-01-10', remaining_amount: '55%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '还有52天到期，定妆持久' },
  // 6个正常
  { name: '小金条口红21', category: '口红', brand: 'YSL', price: 380, color: '复古红', open_date: '2026-05-20', shelf_life_months: 12, expiry_date: '2027-05-20', remaining_amount: '70%', repurchase: '会回购', season: '秋冬', skin_type: '混合', notes: '还有182天到期，复古显白' },
  { name: '定制无瑕粉底液', category: '粉底', brand: 'MAC', price: 450, color: 'N18', open_date: '2026-08-15', shelf_life_months: 12, expiry_date: '2027-08-15', remaining_amount: '80%', repurchase: '考虑中', season: '四季', skin_type: '混合', notes: '还有269天到期，持妆666' },
  { name: '四色眼影盘', category: '眼影', brand: '香奈儿', price: 580, color: '暖棕调', open_date: '2026-06-30', shelf_life_months: 12, expiry_date: '2027-06-30', remaining_amount: '75%', repurchase: '会回购', season: '秋冬', skin_type: '混合', notes: '还有223天到期，高级质感' },
  { name: '微醺腮红', category: '腮红', brand: '完美日记', price: 89, color: '蜜桃色', open_date: null, shelf_life_months: 18, expiry_date: '2027-04-10', remaining_amount: '100%', repurchase: null, season: null, skin_type: null, notes: '还有142天到期，未开封' },
  { name: '纵欲惹火唇膏', category: '口红', brand: 'NARS', price: 280, color: 'Mona红棕', open_date: '2026-09-01', shelf_life_months: 12, expiry_date: '2027-09-01', remaining_amount: '85%', repurchase: '考虑中', season: '秋冬', skin_type: '混合', notes: '还有286天到期，红棕气质' },
  { name: '凝脂轻透亮高光', category: '高光', brand: '迪奥', price: 420, color: '珍珠白', open_date: null, shelf_life_months: 24, expiry_date: '2028-01-15', remaining_amount: '100%', repurchase: null, season: null, skin_type: null, notes: '还有422天到期，未开封囤货' },
];

// 日记数据（10条）- 最近10天，基于当前日期 2026-11-19
const diaryData = [
  { date: '2026-11-19', weather: '晴', mood: '开心', notes: '今天天气很好，早上去公园跑步了，整个人都神清气爽。下午和朋友喝了下午茶，聊了很多近况，心情很好。晚上在家做了瑜伽，一天过得很充实。' },
  { date: '2026-11-18', weather: '多云', mood: '平静', notes: '工作日的一天，按时完成了工作任务。中午吃了轻食沙拉，感觉身体轻盈了一些。晚上看了一部电影，《海街日记》，很治愈。' },
  { date: '2026-11-17', weather: '小雨', mood: '慵懒', notes: '下雨的一天，赖床到很晚。下午窝在沙发上看书，是之前买的《蛤蟆先生去看心理医生》，很有启发。晚上煮了一碗热腾腾的面，下雨天和汤面最配了。' },
  { date: '2026-11-16', weather: '晴', mood: '充实', notes: '今天安排了很多事情。早上打扫卫生，把家里收拾得干干净净。下午去超市采购了下周的食材，列了清单没有乱买。晚上做了一顿丰盛的晚餐奖励自己。' },
  { date: '2026-11-15', weather: '阴', mood: '一般', notes: '工作特别忙，加班到很晚。回到家已经很累了，简单洗漱就睡了。希望明天能轻松一点。' },
  { date: '2026-11-14', weather: '晴', mood: '期待', notes: '今天工作效率很高，完成了一个重要项目。晚上和同事一起吃了饭，庆祝项目顺利交付。周末快到了，计划去爬山。' },
  { date: '2026-11-13', weather: '大风', mood: '烦躁', notes: '今天风特别大，出门头发都吹乱了。工作上也遇到了一些不顺心的事情，有点烦躁。晚上去跑了步，出了一身汗，心情好多了。运动果然是最好的解压方式。' },
  { date: '2026-11-12', weather: '晴', mood: '开心', notes: '今天收到了网购的护肤品，拆快递的快乐！买了黛珂的紫苏水和牛油果乳液，之前用过试用装觉得不错。等手上的用完就开封试试。' },
  { date: '2026-11-11', weather: '多云', mood: '平静', notes: '新的一周开始了。早上起得比较早，做了一顿丰盛的早餐：燕麦粥配鸡蛋和水果。好好吃早饭真的会让一上午都很有精神。继续保持这个好习惯！' },
  { date: '2026-11-10', weather: '晴', mood: '满足', notes: '周日的悠闲时光。早上睡了个懒觉，然后慢悠悠地做了brunch。下午去逛了书店，买了两本想看很久的书。晚上在家追了剧，完美的周末ending。' },
];

// 健康记录数据（15条）- 覆盖最近30天，基于当前日期 2026-11-19
const healthRecordsData = [
  { record_date: '2026-10-21', weather: '晴', feeling: '良好', fasting_glucose: null, postprandial_glucose: null, weight: 51.2, menstrual_status: null, mood_notes: '早起跑步了，状态不错' },
  { record_date: '2026-10-23', weather: '多云', feeling: '良好', fasting_glucose: 5.0, postprandial_glucose: null, weight: 51.0, menstrual_status: null, mood_notes: '血糖正常，继续保持' },
  { record_date: '2026-10-26', weather: '小雨', feeling: '一般', fasting_glucose: null, postprandial_glucose: null, weight: 50.8, menstrual_status: null, mood_notes: '下雨天有点懒，不想动' },
  { record_date: '2026-10-29', weather: '晴', feeling: '充实', fasting_glucose: null, postprandial_glucose: 6.5, weight: 51.5, menstrual_status: null, mood_notes: '今天工作效率很高' },
  { record_date: '2026-10-31', weather: '晴', feeling: '良好', fasting_glucose: 5.2, postprandial_glucose: null, weight: 51.3, menstrual_status: null, mood_notes: '周末了，心情好' },
  { record_date: '2026-11-03', weather: '阴', feeling: '平静', fasting_glucose: null, postprandial_glucose: null, weight: 51.1, menstrual_status: null, mood_notes: '新的一周开始了' },
  { record_date: '2026-11-05', weather: '晴', feeling: '开心', fasting_glucose: null, postprandial_glucose: null, weight: 50.9, menstrual_status: null, mood_notes: '和朋友聚餐了，吃得有点多' },
  { record_date: '2026-11-07', weather: '多云', feeling: '良好', fasting_glucose: 4.8, postprandial_glucose: null, weight: 50.7, menstrual_status: null, mood_notes: '血糖偏低一点，可能是最近吃得清淡' },
  { record_date: '2026-11-09', weather: '晴', feeling: '疲惫', fasting_glucose: null, postprandial_glucose: null, weight: 51.8, menstrual_status: '经期', mood_notes: '来例假了，腰酸背痛' },
  { record_date: '2026-11-10', weather: '多云', feeling: '一般', fasting_glucose: null, postprandial_glucose: null, weight: 52.0, menstrual_status: '经期', mood_notes: '量比较多，肚子胀，体重涨了' },
  { record_date: '2026-11-11', weather: '小雨', feeling: '慵懒', fasting_glucose: null, postprandial_glucose: null, weight: 51.9, menstrual_status: '经期', mood_notes: '下雨天想睡觉，什么都不想干' },
  { record_date: '2026-11-13', weather: '晴', feeling: '良好', fasting_glucose: 5.1, postprandial_glucose: null, weight: 51.5, menstrual_status: '经期', mood_notes: '快结束了，状态在好转' },
  { record_date: '2026-11-15', weather: '晴', feeling: '充实', fasting_glucose: null, postprandial_glucose: 7.0, weight: 51.3, menstrual_status: null, mood_notes: '精力恢复了，去健身房练了腿' },
  { record_date: '2026-11-17', weather: '多云', feeling: '良好', fasting_glucose: null, postprandial_glucose: null, weight: 51.0, menstrual_status: null, mood_notes: '这周状态不错，体重慢慢下来了' },
  { record_date: '2026-11-19', weather: '晴', feeling: '开心', fasting_glucose: 4.9, postprandial_glucose: null, weight: 50.8, menstrual_status: null, mood_notes: '体重终于回到51以下了，开心！' },
];

// 本月提醒内容
const monthReminderContent = `11月25日 朋友生日，记得准备礼物
11月30日 交房租
本周要买：牛奶、鸡蛋、洗衣液
月底前体检预约`;

// ==================== 数据填充函数 ====================

/**
 * 创建 demo 用户
 */
async function createDemoUser(db) {
  const username = 'demo';
  const password = 'demo123456';

  // 检查用户是否已存在
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    console.log(`用户 "${username}" 已存在，跳过创建`);
    return existingUser.id;
  }

  // 加密密码
  const hashedPassword = await bcrypt.hash(password, 10);

  // 插入用户
  const result = db.prepare(
    'INSERT INTO users (username, password) VALUES (?, ?)'
  ).run(username, hashedPassword);

  console.log(`✓ 创建用户成功: ${username} / ${password}`);
  return result.lastInsertRowid;
}

/**
 * 插入护肤品数据
 */
function insertSkincareData(db, userId) {
  // 先清空该用户的护肤品数据
  db.prepare('DELETE FROM skincare WHERE user_id = ?').run(userId);

  let count = 0;
  for (const item of skincareData) {
    // 计算过期日期（如果有开封日期和保质期）
    let expiryDate = null;
    if (item.open_date && item.shelf_life_months) {
      const d = new Date(item.open_date);
      d.setMonth(d.getMonth() + item.shelf_life_months);
      expiryDate = d.toISOString().split('T')[0];
    }

    db.prepare(`
      INSERT INTO skincare (user_id, name, brand, category, price, volume, purchase_date, open_date, expiry_date, shelf_life_months, remaining_amount, wear_feel, rebuy, season, skin_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      item.name,
      item.brand,
      item.category,
      item.price,
      item.volume,
      item.purchase_date,
      item.open_date,
      expiryDate,
      item.shelf_life_months,
      item.remaining_amount,
      item.wear_feel,
      item.rebuy,
      item.season,
      item.skin_type,
      item.notes
    );
    count++;
  }

  console.log(`✓ 插入护肤品数据: ${count} 条`);
}

/**
 * 插入食材数据
 */
function insertFoodData(db, userId) {
  // 先清空该用户的食材数据
  db.prepare('DELETE FROM food WHERE user_id = ?').run(userId);

  let count = 0;
  for (const item of foodData) {
    db.prepare(`
      INSERT INTO food (user_id, name, category, purchase_date, expiry_date, location, quantity, unit, replenish_threshold, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      item.name,
      item.category,
      item.purchase_date,
      item.expiry_date,
      item.location,
      item.quantity,
      item.unit,
      item.replenish_threshold,
      item.notes
    );
    count++;
  }

  console.log(`✓ 插入食材数据: ${count} 条`);
}

/**
 * 插入日记数据
 */
function insertDiaryData(db, userId) {
  // 先清空该用户的日记数据
  db.prepare('DELETE FROM diary WHERE user_id = ?').run(userId);

  let count = 0;
  for (const item of diaryData) {
    db.prepare(`
      INSERT INTO diary (user_id, date, weather, mood, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId,
      item.date,
      item.weather,
      item.mood,
      item.notes
    );
    count++;
  }

  console.log(`✓ 插入日记数据: ${count} 条`);
}

/**
 * 插入生活用品数据
 */
function insertHouseholdData(db, userId) {
  // 先清空该用户的生活用品数据
  db.prepare('DELETE FROM household_items WHERE user_id = ?').run(userId);

  let count = 0;
  for (const item of householdData) {
    db.prepare(`
      INSERT INTO household_items (user_id, name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      item.name,
      item.category,
      item.purchase_date,
      item.expiry_date,
      item.quantity,
      item.unit,
      item.storage_location,
      item.price,
      item.notes
    );
    count++;
  }

  console.log(`✓ 插入生活用品数据: ${count} 条`);
}

/**
 * 插入彩妆数据
 */
function insertMakeupData(db, userId) {
  // 先清空该用户的彩妆数据
  db.prepare('DELETE FROM makeup WHERE user_id = ?').run(userId);

  let count = 0;
  for (const item of makeupData) {
    db.prepare(`
      INSERT INTO makeup (user_id, name, category, brand, price, color, open_date, shelf_life_months, expiry_date, remaining_amount, repurchase, season, skin_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      item.name,
      item.category,
      item.brand,
      item.price,
      item.color,
      item.open_date,
      item.shelf_life_months,
      item.expiry_date,
      item.remaining_amount,
      item.repurchase,
      item.season,
      item.skin_type,
      item.notes
    );
    count++;
  }

  console.log(`✓ 插入彩妆数据: ${count} 条`);
}

/**
 * 插入健康记录数据
 */
function insertHealthRecordsData(db, userId) {
  // 先清空该用户的健康记录数据
  db.prepare('DELETE FROM health_records WHERE user_id = ?').run(userId);

  let count = 0;
  for (const item of healthRecordsData) {
    db.prepare(`
      INSERT INTO health_records (user_id, record_date, weather, feeling, fasting_glucose, postprandial_glucose, weight, menstrual_status, mood_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      item.record_date,
      item.weather,
      item.feeling,
      item.fasting_glucose,
      item.postprandial_glucose,
      item.weight,
      item.menstrual_status,
      item.mood_notes
    );
    count++;
  }

  console.log(`✓ 插入健康记录数据: ${count} 条`);
}

/**
 * 插入本月提醒数据
 */
function insertMonthReminder(db, userId) {
  // 先清空该用户的本月提醒
  db.prepare('DELETE FROM month_reminders WHERE user_id = ?').run(userId);

  db.prepare(
    'INSERT INTO month_reminders (user_id, content) VALUES (?, ?)'
  ).run(userId, monthReminderContent);

  console.log(`✓ 插入本月提醒: 1 条`);
}

// ==================== 主函数 ====================

async function main() {
  console.log('========================================');
  console.log('  生活管理系统 - 测试数据填充脚本');
  console.log('========================================');
  console.log('');

  let db;
  try {
    // 初始化数据库
    const database = new Database(path.join(__dirname, 'life.db'));
    db = await database.init();

    // 确保表存在
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS skincare (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        brand TEXT,
        category TEXT,
        price REAL,
        volume TEXT,
        purchase_date TEXT,
        open_date TEXT,
        expiry_date TEXT,
        shelf_life_months INTEGER,
        remaining_amount TEXT,
        wear_feel TEXT,
        rebuy TEXT,
        season TEXT,
        skin_type TEXT,
        notes TEXT,
        archived INTEGER DEFAULT 0,
        empty_date TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS food (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        purchase_date TEXT,
        expiry_date TEXT,
        location TEXT,
        quantity REAL,
        unit TEXT,
        replenish_threshold REAL,
        notes TEXT,
        archived INTEGER DEFAULT 0,
        processed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS diary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        weather TEXT,
        mood TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS household_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        purchase_date TEXT,
        expiry_date TEXT,
        quantity REAL,
        unit TEXT,
        storage_location TEXT,
        price REAL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS makeup (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT DEFAULT '口红',
        brand TEXT,
        price REAL,
        color TEXT,
        open_date TEXT,
        shelf_life_months INTEGER,
        expiry_date TEXT,
        remaining_amount TEXT,
        repurchase TEXT,
        season TEXT,
        skin_type TEXT,
        notes TEXT,
        archived INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        record_date TEXT NOT NULL,
        weather TEXT,
        feeling TEXT,
        fasting_glucose REAL,
        postprandial_glucose REAL,
        weight REAL,
        menstrual_status TEXT,
        mood_notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(user_id, record_date)
      );
      CREATE TABLE IF NOT EXISTS user_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        module_type TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(user_id, module_type, name)
      );
      CREATE TABLE IF NOT EXISTS month_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT,
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(user_id)
      );
    `);

    // 1. 创建 demo 用户
    const userId = await createDemoUser(db);
    console.log('');

    // 2. 插入护肤品数据
    insertSkincareData(db, userId);

    // 3. 插入食材数据
    insertFoodData(db, userId);

    // 4. 插入日记数据
    insertDiaryData(db, userId);

    // 5. 插入生活用品数据
    insertHouseholdData(db, userId);

    // 6. 插入彩妆数据
    insertMakeupData(db, userId);

    // 7. 插入健康记录数据
    insertHealthRecordsData(db, userId);

    // 7. 插入本月提醒
    insertMonthReminder(db, userId);

    console.log('');
    console.log('========================================');
    console.log('  数据填充完成！');
    console.log('========================================');
    console.log('');
    console.log('测试账号信息：');
    console.log('  用户名: demo');
    console.log('  密码:   demo123456');
    console.log('');
    console.log('数据统计：');
    const skincareCount = db.prepare('SELECT COUNT(*) as c FROM skincare WHERE user_id = ?').get(userId).c;
    const foodCount = db.prepare('SELECT COUNT(*) as c FROM food WHERE user_id = ?').get(userId).c;
    const makeupCount = db.prepare('SELECT COUNT(*) as c FROM makeup WHERE user_id = ?').get(userId).c;
    const diaryCount = db.prepare('SELECT COUNT(*) as c FROM diary WHERE user_id = ?').get(userId).c;
    const householdCount = db.prepare('SELECT COUNT(*) as c FROM household_items WHERE user_id = ?').get(userId).c;
    const healthCount = db.prepare('SELECT COUNT(*) as c FROM health_records WHERE user_id = ?').get(userId).c;
    const reminderRow = db.prepare('SELECT content FROM month_reminders WHERE user_id = ?').get(userId);
    console.log(`  护肤品:   ${skincareCount} 条`);
    console.log(`  食材:     ${foodCount} 条`);
    console.log(`  彩妆:     ${makeupCount} 条`);
    console.log(`  生活用品: ${householdCount} 条`);
    console.log(`  日记:     ${diaryCount} 条`);
    console.log(`  健康记录: ${healthCount} 条`);
    console.log(`  本月提醒: ${reminderRow && reminderRow.content ? '已设置' : '未设置'}`);

    // 临期数据统计
    const expiredFood = db.prepare(`
      SELECT COUNT(*) as c FROM food
      WHERE user_id = ? AND julianday(expiry_date) < julianday('now')
    `).get(userId).c;
    const expiring30Food = db.prepare(`
      SELECT COUNT(*) as c FROM food
      WHERE user_id = ?
        AND julianday(expiry_date) - julianday('now') >= 0
        AND julianday(expiry_date) - julianday('now') <= 30
    `).get(userId).c;
    const lowStockFood = db.prepare(`
      SELECT COUNT(*) as c FROM food
      WHERE user_id = ?
        AND replenish_threshold IS NOT NULL
        AND quantity IS NOT NULL
        AND quantity <= replenish_threshold
    `).get(userId).c;
    console.log('');
    console.log('临期概览（食材）：');
    console.log(`  已过期:   ${expiredFood} 件`);
    console.log(`  30天内:   ${expiring30Food} 件`);
    console.log(`  库存不足: ${lowStockFood} 件`);

  } catch (err) {
    console.error('数据填充失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
