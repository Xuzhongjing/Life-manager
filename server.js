/**
 * 生活管理后端服务 - server.js
 * 功能：用户认证、护肤品管理、食材管理、日记管理、数据看板
 *
 * 说明：使用 sql.js（SQLite WebAssembly 版本）替代 better-sqlite3
 *       因 better-sqlite3 在 Node 26 上编译失败（V8 API 不兼容）
 *       通过 db.js 封装层提供类 better-sqlite3 的同步 API 风格
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const Database = require('./db');
const { seedDemoData } = require('./demo-seed');

// ==================== 配置 ====================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'life-manager-secret-key-2024';
const TOKEN_EXPIRES_IN = '7d';

// ==================== 初始化 ====================
const app = express();

// 中间件
app.use(cors());
app.use(express.json()); // 解析 JSON 请求体
app.use(express.static(path.join(__dirname, 'public'))); // 静态文件服务

// 数据库实例（稍后异步初始化）
let db;

// ==================== 数据库表初始化 ====================
/**
 * 初始化数据库表结构
 */
function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 护肤品表
  db.exec(`
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
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 食材表
  db.exec(`
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
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 日记表
  db.exec(`
    CREATE TABLE IF NOT EXISTS diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      weather TEXT,
      mood TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 生活用品表
  db.exec(`
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
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 健康记录表
  db.exec(`
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
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, record_date)
    )
  `);

  // 彩妆表
  db.exec(`
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
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 用户自定义分类表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      module_type TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, module_type, name)
    )
  `);

  // 本月提醒表
  db.exec(`
    CREATE TABLE IF NOT EXISTS month_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id)
    )
  `);

  console.log('数据库表初始化完成');

  // 字段迁移：为已存在的旧表补充新字段
  migrateDatabase();
}

/**
 * 数据库字段迁移
 * 为已存在的旧表添加新增字段（ALTER TABLE IF NOT EXISTS 不可用，用 try/catch 兜底）
 */
function migrateDatabase() {
  // skincare 表新增字段
  const skincareColumns = ['price', 'volume', 'expiry_date', 'wear_feel', 'rebuy', 'season', 'skin_type', 'archived', 'empty_date'];
  skincareColumns.forEach(col => {
    try {
      let type = 'TEXT';
      if (col === 'price') type = 'REAL';
      if (col === 'archived') type = 'INTEGER DEFAULT 0';
      db.exec(`ALTER TABLE skincare ADD COLUMN ${col} ${type}`);
    } catch (e) { /* 字段已存在，忽略 */ }
  });

  // food 表新增字段
  const foodColumns = ['replenish_threshold', 'archived', 'processed'];
  foodColumns.forEach(col => {
    try {
      let type = 'REAL';
      if (col === 'archived' || col === 'processed') type = 'INTEGER DEFAULT 0';
      db.exec(`ALTER TABLE food ADD COLUMN ${col} ${type}`);
    } catch (e) { /* 字段已存在，忽略 */ }
  });

  // makeup 表新增字段（用于已存在的旧表补充）
  const makeupColumns = ['color', 'repurchase', 'archived', 'updated_at'];
  makeupColumns.forEach(col => {
    try {
      let type = 'TEXT';
      if (col === 'archived') type = 'INTEGER DEFAULT 0';
      if (col === 'updated_at') type = "TEXT DEFAULT (datetime('now', 'localtime'))";
      db.exec(`ALTER TABLE makeup ADD COLUMN ${col} ${type}`);
    } catch (e) { /* 字段已存在，忽略 */ }
  });

  console.log('数据库字段迁移完成');
}

// ==================== JWT 认证中间件 ====================
/**
 * JWT 认证中间件
 * 验证请求头中的 token，并将用户信息挂载到 req.user
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: '认证令牌无效或已过期' });
  }
}

// ==================== 系统默认分类 ====================
const DEFAULT_CATEGORIES = {
  skincare: [
    { name: '洁面', sort_order: 1 },
    { name: '水', sort_order: 2 },
    { name: '精华', sort_order: 3 },
    { name: '乳液', sort_order: 4 },
    { name: '面霜', sort_order: 5 },
    { name: '眼霜', sort_order: 6 },
    { name: '防晒', sort_order: 7 },
    { name: '面膜', sort_order: 8 },
    { name: '其他', sort_order: 99 }
  ],
  food: [
    { name: '蔬菜', sort_order: 1 },
    { name: '水果', sort_order: 2 },
    { name: '肉类', sort_order: 3 },
    { name: '海鲜', sort_order: 4 },
    { name: '乳制品', sort_order: 5 },
    { name: '主食粮油', sort_order: 6 },
    { name: '调味品', sort_order: 7 },
    { name: '饮料', sort_order: 8 },
    { name: '零食', sort_order: 9 },
    { name: '其他', sort_order: 99 }
  ],
  household: [
    { name: '个护清洁', sort_order: 1 },
    { name: '纸品湿巾', sort_order: 2 },
    { name: '衣物清洁', sort_order: 3 },
    { name: '家居清洁', sort_order: 4 },
    { name: '数码配件', sort_order: 5 },
    { name: '其他', sort_order: 99 }
  ],
  makeup: [
    { name: '口红', sort_order: 1 },
    { name: '粉底', sort_order: 2 },
    { name: '眼影', sort_order: 3 },
    { name: '腮红', sort_order: 4 },
    { name: '睫毛膏', sort_order: 5 },
    { name: '眉笔', sort_order: 6 },
    { name: '高光', sort_order: 7 },
    { name: '遮瑕', sort_order: 8 },
    { name: '散粉', sort_order: 9 },
    { name: '其他', sort_order: 99 }
  ]
};

// 模块类型与表名的映射
const MODULE_TABLE_MAP = {
  skincare: 'skincare',
  food: 'food',
  household: 'household_items',
  makeup: 'makeup'
};

// ==================== 工具函数 ====================
/**
 * 生成 JWT token
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
}

// ==================== 用户认证接口 ====================

/**
 * 用户注册
 * POST /api/register
 * Body: { username, password }
 */
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 参数校验
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: '用户名至少3个字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6个字符' });
    }

    // 检查用户名是否已存在
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 插入用户
    const result = db.prepare(
      'INSERT INTO users (username, password) VALUES (?, ?)'
    ).run(username, hashedPassword);

    // 生成 token
    const token = generateToken({ id: result.lastInsertRowid, username });

    res.status(201).json({
      message: '注册成功',
      token,
      user: { id: result.lastInsertRowid, username }
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 用户登录
 * POST /api/login
 * Body: { username, password }
 */
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 参数校验
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 查询用户
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成 token
    const token = generateToken(user);

    res.json({
      message: '登录成功',
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 护肤品 CRUD 接口 ====================

/**
 * 获取护肤品列表
 * GET /api/skincare
 */
/**
 * 获取护肤品列表
 * GET /api/skincare?archived=0&search=xxx
 */
app.get('/api/skincare', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { archived, search } = req.query;

    let query = 'SELECT * FROM skincare WHERE user_id = ?';
    const params = [userId];

    if (archived !== undefined) {
      query += ' AND archived = ?';
      params.push(archived === '1' ? 1 : 0);
    }

    if (search) {
      query += ' AND (name LIKE ? OR brand LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    console.error('获取护肤品列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取护肤品统计
 * GET /api/skincare/summary
 * 返回：90天临期、总价值、分类统计
 */
app.get('/api/skincare/summary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    const items = db.prepare(
      "SELECT * FROM skincare WHERE user_id = ? AND archived = 0"
    ).all(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiring90 = 0;
    let totalValue = 0;
    const categoryStats = {};

    items.forEach(item => {
      // 临期计算：优先用 expiry_date，其次用 open_date + shelf_life_months
      let expDate = null;
      if (item.expiry_date) {
        expDate = new Date(item.expiry_date + 'T23:59:59');
      } else if (item.open_date && item.shelf_life_months) {
        expDate = new Date(item.open_date);
        expDate.setMonth(expDate.getMonth() + item.shelf_life_months);
      }
      if (expDate) {
        const days = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        if (days >= 0 && days <= 90) expiring90++;
      }

      if (item.price) totalValue += item.price;

      const cat = item.category || '未分类';
      if (!categoryStats[cat]) categoryStats[cat] = 0;
      categoryStats[cat]++;
    });

    res.json({
      total: items.length,
      expiring_90: expiring90,
      total_value: Math.round(totalValue * 100) / 100,
      category_stats: categoryStats
    });
  } catch (err) {
    console.error('获取护肤品统计失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取单条护肤品
 * GET /api/skincare/:id
 */
app.get('/api/skincare/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const item = db.prepare(
      'SELECT * FROM skincare WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!item) {
      return res.status(404).json({ error: '护肤品记录不存在' });
    }
    res.json(item);
  } catch (err) {
    console.error('获取护肤品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 新增护肤品
 * POST /api/skincare
 * Body: { name, brand, category, price, volume, purchase_date, open_date, expiry_date, shelf_life_months, remaining_amount, wear_feel, rebuy, season, skin_type, notes }
 */
app.post('/api/skincare', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { name, brand, category, price, volume, purchase_date, open_date, expiry_date, shelf_life_months, remaining_amount, wear_feel, rebuy, season, skin_type, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: '护肤品名称不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO skincare (user_id, name, brand, category, price, volume, purchase_date, open_date, expiry_date, shelf_life_months, remaining_amount, wear_feel, rebuy, season, skin_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name, brand || null, category || null, price || null, volume || null,
           purchase_date || null, open_date || null, expiry_date || null,
           shelf_life_months || null, remaining_amount || null,
           wear_feel || null, rebuy || null, season || null, skin_type || null, notes || null);

    const newItem = db.prepare(
      'SELECT * FROM skincare WHERE id = ? AND user_id = ?'
    ).get(result.lastInsertRowid, userId);

    res.status(201).json(newItem);
  } catch (err) {
    console.error('新增护肤品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 更新护肤品
 * PUT /api/skincare/:id
 */
app.put('/api/skincare/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { name, brand, category, price, volume, purchase_date, open_date, expiry_date, shelf_life_months, remaining_amount, wear_feel, rebuy, season, skin_type, notes, archived, empty_date } = req.body;

    // 检查记录是否存在且属于当前用户
    const existing = db.prepare(
      'SELECT id FROM skincare WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!existing) {
      return res.status(404).json({ error: '护肤品记录不存在' });
    }

    db.prepare(`
      UPDATE skincare
      SET name = ?, brand = ?, category = ?, price = ?, volume = ?,
          purchase_date = ?, open_date = ?, expiry_date = ?,
          shelf_life_months = ?, remaining_amount = ?, wear_feel = ?,
          rebuy = ?, season = ?, skin_type = ?, notes = ?,
          archived = COALESCE(?, archived), empty_date = COALESCE(?, empty_date)
      WHERE id = ? AND user_id = ?
    `).run(name, brand || null, category || null, price || null, volume || null,
           purchase_date || null, open_date || null, expiry_date || null,
           shelf_life_months || null, remaining_amount || null,
           wear_feel || null, rebuy || null, season || null, skin_type || null, notes || null,
           archived !== undefined ? archived : null, empty_date !== undefined ? empty_date : null,
           itemId, userId);

    const updatedItem = db.prepare(
      'SELECT * FROM skincare WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    res.json(updatedItem);
  } catch (err) {
    console.error('更新护肤品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 删除护肤品
 * DELETE /api/skincare/:id
 */
app.delete('/api/skincare/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    const result = db.prepare(
      'DELETE FROM skincare WHERE id = ? AND user_id = ?'
    ).run(itemId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '护肤品记录不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除护肤品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 食材 CRUD 接口 ====================

/**
 * 获取食材列表
 * GET /api/food?archived=0&search=xxx&category=xxx
 */
app.get('/api/food', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { archived, search, category } = req.query;

    let query = 'SELECT * FROM food WHERE user_id = ?';
    const params = [userId];

    if (archived !== undefined) {
      query += ' AND archived = ?';
      params.push(archived === '1' ? 1 : 0);
    }

    if (search) {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY expiry_date ASC, created_at DESC';

    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    console.error('获取食材列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 切换食材归档状态
 * POST /api/food/:id/archive
 */
app.post('/api/food/:id/archive', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    const existing = db.prepare(
      'SELECT id, archived FROM food WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!existing) {
      return res.status(404).json({ error: '食材记录不存在' });
    }

    const newArchived = existing.archived ? 0 : 1;
    db.prepare('UPDATE food SET archived = ? WHERE id = ? AND user_id = ?').run(newArchived, itemId, userId);

    const updatedItem = db.prepare(
      'SELECT * FROM food WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    res.json(updatedItem);
  } catch (err) {
    console.error('切换食材归档状态失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取冰箱库存统计
 * GET /api/food/summary
 * 返回：已过期、30天临期、90天预警、库存不足数量
 */
app.get('/api/food/summary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    const items = db.prepare(
      "SELECT * FROM food WHERE user_id = ? AND archived = 0 AND processed = 0"
    ).all(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expired = 0, expiring30 = 0, expiring90 = 0, lowStock = 0;

    items.forEach(item => {
      if (item.expiry_date) {
        const expDate = new Date(item.expiry_date + 'T23:59:59');
        const days = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        if (days < 0) expired++;
        else if (days <= 30) expiring30++;
        else if (days <= 90) expiring90++;
      }
      if (item.replenish_threshold && item.quantity !== null && item.quantity <= item.replenish_threshold) {
        lowStock++;
      }
    });

    res.json({ expired, expiring30, expiring90, low_stock: lowStock, total: items.length });
  } catch (err) {
    console.error('获取冰箱库存统计失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取单条食材
 * GET /api/food/:id
 */
app.get('/api/food/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const item = db.prepare(
      'SELECT * FROM food WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!item) {
      return res.status(404).json({ error: '食材记录不存在' });
    }
    res.json(item);
  } catch (err) {
    console.error('获取食材失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 新增食材
 * POST /api/food
 * Body: { name, category, purchase_date, expiry_date, location, quantity, unit, replenish_threshold, notes }
 */
app.post('/api/food', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category, purchase_date, expiry_date, location, quantity, unit, replenish_threshold, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: '食材名称不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO food (user_id, name, category, purchase_date, expiry_date, location, quantity, unit, replenish_threshold, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name, category || null, purchase_date || null, expiry_date || null,
           location || null, quantity || null, unit || null, replenish_threshold || null, notes || null);

    const newItem = db.prepare(
      'SELECT * FROM food WHERE id = ? AND user_id = ?'
    ).get(result.lastInsertRowid, userId);

    res.status(201).json(newItem);
  } catch (err) {
    console.error('新增食材失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 更新食材
 * PUT /api/food/:id
 */
app.put('/api/food/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { name, category, purchase_date, expiry_date, location, quantity, unit, replenish_threshold, notes, archived, processed } = req.body;

    const existing = db.prepare(
      'SELECT id FROM food WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!existing) {
      return res.status(404).json({ error: '食材记录不存在' });
    }

    db.prepare(`
      UPDATE food
      SET name = ?, category = ?, purchase_date = ?, expiry_date = ?,
          location = ?, quantity = ?, unit = ?, replenish_threshold = ?,
          notes = ?, archived = COALESCE(?, archived), processed = COALESCE(?, processed)
      WHERE id = ? AND user_id = ?
    `).run(name, category || null, purchase_date || null, expiry_date || null,
           location || null, quantity || null, unit || null, replenish_threshold || null,
           notes || null, archived !== undefined ? archived : null, processed !== undefined ? processed : null,
           itemId, userId);

    const updatedItem = db.prepare(
      'SELECT * FROM food WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    res.json(updatedItem);
  } catch (err) {
    console.error('更新食材失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 删除食材
 * DELETE /api/food/:id
 */
app.delete('/api/food/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    const result = db.prepare(
      'DELETE FROM food WHERE id = ? AND user_id = ?'
    ).run(itemId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '食材记录不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除食材失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 彩妆 CRUD 接口 ====================

/**
 * 获取彩妆列表
 * GET /api/makeup?archived=0&search=xxx&category=xxx
 */
app.get('/api/makeup', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { archived, search, category } = req.query;

    let query = 'SELECT * FROM makeup WHERE user_id = ?';
    const params = [userId];

    if (archived !== undefined) {
      query += ' AND archived = ?';
      params.push(archived === '1' ? 1 : 0);
    }

    if (search) {
      query += ' AND (name LIKE ? OR brand LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC';

    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    console.error('获取彩妆列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取彩妆统计
 * GET /api/makeup/summary
 * 返回：总数、90天临期、总价值、分类数
 */
app.get('/api/makeup/summary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    const items = db.prepare(
      "SELECT * FROM makeup WHERE user_id = ? AND archived = 0"
    ).all(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiring90 = 0;
    let totalValue = 0;
    const categoryStats = {};

    items.forEach(item => {
      // 临期计算：优先用 expiry_date，其次用 open_date + shelf_life_months
      let expDate = null;
      if (item.expiry_date) {
        expDate = new Date(item.expiry_date + 'T23:59:59');
      } else if (item.open_date && item.shelf_life_months) {
        expDate = new Date(item.open_date);
        expDate.setMonth(expDate.getMonth() + item.shelf_life_months);
      }
      if (expDate) {
        const days = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        if (days >= 0 && days <= 90) expiring90++;
      }

      if (item.price) totalValue += item.price;

      const cat = item.category || '未分类';
      if (!categoryStats[cat]) categoryStats[cat] = 0;
      categoryStats[cat]++;
    });

    const categoryCount = Object.keys(categoryStats).length;

    res.json({
      total: items.length,
      expiring_90: expiring90,
      total_value: Math.round(totalValue * 100) / 100,
      category_count: categoryCount,
      category_stats: categoryStats
    });
  } catch (err) {
    console.error('获取彩妆统计失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取单条彩妆
 * GET /api/makeup/:id
 */
app.get('/api/makeup/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const item = db.prepare(
      'SELECT * FROM makeup WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!item) {
      return res.status(404).json({ error: '彩妆记录不存在' });
    }
    res.json(item);
  } catch (err) {
    console.error('获取彩妆失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 新增彩妆
 * POST /api/makeup
 * Body: { name, category, brand, price, color, open_date, shelf_life_months, expiry_date, remaining_amount, repurchase, season, skin_type, notes }
 */
app.post('/api/makeup', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category, brand, price, color, open_date, shelf_life_months, expiry_date, remaining_amount, repurchase, season, skin_type, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: '彩妆名称不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO makeup (user_id, name, category, brand, price, color, open_date, shelf_life_months, expiry_date, remaining_amount, repurchase, season, skin_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name, category || '口红', brand || null, price || null,
           color || null, open_date || null, shelf_life_months || null,
           expiry_date || null, remaining_amount || null,
           repurchase || null, season || null, skin_type || null, notes || null);

    const newItem = db.prepare(
      'SELECT * FROM makeup WHERE id = ? AND user_id = ?'
    ).get(result.lastInsertRowid, userId);

    res.status(201).json(newItem);
  } catch (err) {
    console.error('新增彩妆失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 更新彩妆
 * PUT /api/makeup/:id
 */
app.put('/api/makeup/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { name, category, brand, price, color, open_date, shelf_life_months, expiry_date, remaining_amount, repurchase, season, skin_type, notes, archived } = req.body;

    const existing = db.prepare(
      'SELECT id FROM makeup WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!existing) {
      return res.status(404).json({ error: '彩妆记录不存在' });
    }

    db.prepare(`
      UPDATE makeup
      SET name = ?, category = ?, brand = ?, price = ?, color = ?,
          open_date = ?, shelf_life_months = ?, expiry_date = ?,
          remaining_amount = ?, repurchase = ?, season = ?,
          skin_type = ?, notes = ?, archived = COALESCE(?, archived),
          updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(name, category || null, brand || null, price || null, color || null,
           open_date || null, shelf_life_months || null, expiry_date || null,
           remaining_amount || null, repurchase || null, season || null,
           skin_type || null, notes || null, archived !== undefined ? archived : null,
           itemId, userId);

    const updatedItem = db.prepare(
      'SELECT * FROM makeup WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    res.json(updatedItem);
  } catch (err) {
    console.error('更新彩妆失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 删除彩妆
 * DELETE /api/makeup/:id
 */
app.delete('/api/makeup/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    const result = db.prepare(
      'DELETE FROM makeup WHERE id = ? AND user_id = ?'
    ).run(itemId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '彩妆记录不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除彩妆失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 切换彩妆归档状态
 * POST /api/makeup/:id/archive
 */
app.post('/api/makeup/:id/archive', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    const existing = db.prepare(
      'SELECT id, archived FROM makeup WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!existing) {
      return res.status(404).json({ error: '彩妆记录不存在' });
    }

    const newArchived = existing.archived ? 0 : 1;
    db.prepare(
      'UPDATE makeup SET archived = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ? AND user_id = ?'
    ).run(newArchived, itemId, userId);

    const updatedItem = db.prepare(
      'SELECT * FROM makeup WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    res.json(updatedItem);
  } catch (err) {
    console.error('切换彩妆归档状态失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 日记 CRUD 接口 ====================

/**
 * 获取日记列表
 * GET /api/diary
 */
app.get('/api/diary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const items = db.prepare(
      'SELECT * FROM diary WHERE user_id = ? ORDER BY date DESC, created_at DESC'
    ).all(userId);
    res.json(items);
  } catch (err) {
    console.error('获取日记列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取单条日记
 * GET /api/diary/:id
 */
app.get('/api/diary/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const item = db.prepare(
      'SELECT * FROM diary WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!item) {
      return res.status(404).json({ error: '日记记录不存在' });
    }
    res.json(item);
  } catch (err) {
    console.error('获取日记失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 新增日记
 * POST /api/diary
 * Body: { date, weather, mood, notes }
 */
app.post('/api/diary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { date, weather, mood, notes } = req.body;

    if (!date) {
      return res.status(400).json({ error: '日记日期不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO diary (user_id, date, weather, mood, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, date, weather || null, mood || null, notes || null);

    const newItem = db.prepare(
      'SELECT * FROM diary WHERE id = ? AND user_id = ?'
    ).get(result.lastInsertRowid, userId);

    res.status(201).json(newItem);
  } catch (err) {
    console.error('新增日记失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 更新日记
 * PUT /api/diary/:id
 */
app.put('/api/diary/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { date, weather, mood, notes } = req.body;

    const existing = db.prepare(
      'SELECT id FROM diary WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!existing) {
      return res.status(404).json({ error: '日记记录不存在' });
    }

    db.prepare(`
      UPDATE diary
      SET date = ?, weather = ?, mood = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `).run(date, weather || null, mood || null, notes || null, itemId, userId);

    const updatedItem = db.prepare(
      'SELECT * FROM diary WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    res.json(updatedItem);
  } catch (err) {
    console.error('更新日记失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 删除日记
 * DELETE /api/diary/:id
 */
app.delete('/api/diary/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    const result = db.prepare(
      'DELETE FROM diary WHERE id = ? AND user_id = ?'
    ).run(itemId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '日记记录不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除日记失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 生活用品 CRUD 接口 ====================

/**
 * 获取生活用品列表
 * GET /api/household
 */
app.get('/api/household', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const items = db.prepare(
      'SELECT * FROM household_items WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
    res.json(items);
  } catch (err) {
    console.error('获取生活用品列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取单条生活用品
 * GET /api/household/:id
 */
app.get('/api/household/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const item = db.prepare(
      'SELECT * FROM household_items WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!item) {
      return res.status(404).json({ error: '生活用品记录不存在' });
    }
    res.json(item);
  } catch (err) {
    console.error('获取生活用品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 新增生活用品
 * POST /api/household
 * Body: { name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes }
 */
app.post('/api/household', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: '生活用品名称不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO household_items (user_id, name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name, category || null, purchase_date || null, expiry_date || null,
           quantity || null, unit || null, storage_location || null, price || null, notes || null);

    const newItem = db.prepare(
      'SELECT * FROM household_items WHERE id = ? AND user_id = ?'
    ).get(result.lastInsertRowid, userId);

    res.status(201).json(newItem);
  } catch (err) {
    console.error('新增生活用品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 更新生活用品
 * PUT /api/household/:id
 */
app.put('/api/household/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes } = req.body;

    const existing = db.prepare(
      'SELECT id FROM household_items WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    if (!existing) {
      return res.status(404).json({ error: '生活用品记录不存在' });
    }

    db.prepare(`
      UPDATE household_items
      SET name = ?, category = ?, purchase_date = ?, expiry_date = ?,
          quantity = ?, unit = ?, storage_location = ?, price = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `).run(name, category || null, purchase_date || null, expiry_date || null,
           quantity || null, unit || null, storage_location || null, price || null, notes || null, itemId, userId);

    const updatedItem = db.prepare(
      'SELECT * FROM household_items WHERE id = ? AND user_id = ?'
    ).get(itemId, userId);

    res.json(updatedItem);
  } catch (err) {
    console.error('更新生活用品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 删除生活用品
 * DELETE /api/household/:id
 */
app.delete('/api/household/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;

    const result = db.prepare(
      'DELETE FROM household_items WHERE id = ? AND user_id = ?'
    ).run(itemId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '生活用品记录不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除生活用品失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 自定义分类接口 ====================

/**
 * 获取某模块的分类列表（系统默认 + 用户自定义合并）
 * GET /api/categories/:module
 * module: skincare | food | household
 */
app.get('/api/categories/:module', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const moduleType = req.params.module;

    // 校验模块类型
    if (!DEFAULT_CATEGORIES[moduleType]) {
      return res.status(400).json({ error: '无效的模块类型' });
    }

    // 获取用户自定义分类
    const userCategories = db.prepare(
      'SELECT id, name, sort_order, 1 as is_custom FROM user_categories WHERE user_id = ? AND module_type = ? ORDER BY sort_order ASC, id ASC'
    ).all(userId, moduleType);

    // 合并系统默认分类和用户自定义分类
    const defaultCats = DEFAULT_CATEGORIES[moduleType].map(cat => ({
      id: null,
      name: cat.name,
      sort_order: cat.sort_order,
      is_custom: 0
    }));

    // 按 sort_order 排序，系统默认在前，自定义在后
    const allCategories = [...defaultCats, ...userCategories].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      // 同 sort_order 时，系统默认（is_custom=0）在前
      return a.is_custom - b.is_custom;
    });

    res.json(allCategories);
  } catch (err) {
    console.error('获取分类列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 新增自定义分类
 * POST /api/categories
 * Body: { module_type, name }
 */
app.post('/api/categories', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { module_type, name } = req.body;

    // 参数校验
    if (!module_type || !name) {
      return res.status(400).json({ error: '模块类型和分类名称不能为空' });
    }
    if (!DEFAULT_CATEGORIES[module_type]) {
      return res.status(400).json({ error: '无效的模块类型' });
    }
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 20) {
      return res.status(400).json({ error: '分类名称不能为空且长度不超过20个字符' });
    }

    // 检查是否与系统默认分类重名
    const defaultNames = DEFAULT_CATEGORIES[module_type].map(c => c.name);
    if (defaultNames.includes(trimmedName)) {
      return res.status(400).json({ error: '该分类名称已存在' });
    }

    // 获取当前用户该模块下自定义分类的最大 sort_order
    const maxOrderRow = db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM user_categories WHERE user_id = ? AND module_type = ?'
    ).get(userId, module_type);
    const nextSortOrder = Math.max(maxOrderRow.max_order, 100) + 1; // 自定义分类从 101 开始

    // 插入自定义分类
    const result = db.prepare(
      'INSERT INTO user_categories (user_id, module_type, name, sort_order) VALUES (?, ?, ?, ?)'
    ).run(userId, module_type, trimmedName, nextSortOrder);

    const newCategory = db.prepare(
      'SELECT id, name, sort_order, 1 as is_custom FROM user_categories WHERE id = ? AND user_id = ?'
    ).get(result.lastInsertRowid, userId);

    res.status(201).json(newCategory);
  } catch (err) {
    // 唯一约束冲突
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '该分类名称已存在' });
    }
    console.error('新增分类失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 删除自定义分类
 * DELETE /api/categories/:id
 * 只能删除自己的分类，删除后已有物品的分类改为"其他"
 */
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const categoryId = req.params.id;

    // 查询分类信息（确认属于当前用户且是自定义分类）
    const category = db.prepare(
      'SELECT * FROM user_categories WHERE id = ? AND user_id = ?'
    ).get(categoryId, userId);

    if (!category) {
      return res.status(404).json({ error: '分类不存在或无权限删除' });
    }

    const moduleType = category.module_type;
    const categoryName = category.name;
    const tableName = MODULE_TABLE_MAP[moduleType];

    if (!tableName) {
      return res.status(400).json({ error: '无效的模块类型' });
    }

    // 将该分类下的物品分类改为"其他"
    db.prepare(
      `UPDATE ${tableName} SET category = '其他' WHERE user_id = ? AND category = ?`
    ).run(userId, categoryName);

    // 删除分类
    const result = db.prepare(
      'DELETE FROM user_categories WHERE id = ? AND user_id = ?'
    ).run(categoryId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除分类失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 健康记录接口 ====================

/**
 * 获取健康记录列表
 * GET /api/health?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 */
app.get('/api/health', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { start_date, end_date } = req.query;

    let query = 'SELECT * FROM health_records WHERE user_id = ?';
    const params = [userId];

    if (start_date) {
      query += ' AND record_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND record_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY record_date DESC';

    const records = db.prepare(query).all(...params);
    res.json(records);
  } catch (err) {
    console.error('获取健康记录失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取单条健康记录（按日期）
 * GET /api/health/date/:date
 */
app.get('/api/health/date/:date', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const recordDate = req.params.date;

    const record = db.prepare(
      'SELECT * FROM health_records WHERE user_id = ? AND record_date = ?'
    ).get(userId, recordDate);

    if (!record) {
      return res.json(null);
    }
    res.json(record);
  } catch (err) {
    console.error('获取健康记录失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 新增/更新健康记录（按日期 upsert）
 * POST /api/health
 * Body: { record_date, weather, feeling, fasting_glucose, postprandial_glucose, weight, menstrual_status, mood_notes }
 */
app.post('/api/health', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const {
      record_date, weather, feeling, fasting_glucose,
      postprandial_glucose, weight, menstrual_status, mood_notes
    } = req.body;

    if (!record_date) {
      return res.status(400).json({ error: '记录日期不能为空' });
    }

    // 检查是否已有该日期的记录
    const existing = db.prepare(
      'SELECT id FROM health_records WHERE user_id = ? AND record_date = ?'
    ).get(userId, record_date);

    if (existing) {
      // 更新
      db.prepare(`
        UPDATE health_records SET
          weather = ?, feeling = ?, fasting_glucose = ?,
          postprandial_glucose = ?, weight = ?, menstrual_status = ?,
          mood_notes = ?, updated_at = datetime('now', 'localtime')
        WHERE user_id = ? AND record_date = ?
      `).run(
        weather || null, feeling || null, fasting_glucose || null,
        postprandial_glucose || null, weight || null, menstrual_status || null,
        mood_notes || null, userId, record_date
      );

      const record = db.prepare(
        'SELECT * FROM health_records WHERE user_id = ? AND record_date = ?'
      ).get(userId, record_date);
      res.json({ message: '更新成功', record });
    } else {
      // 新增
      const result = db.prepare(`
        INSERT INTO health_records
          (user_id, record_date, weather, feeling, fasting_glucose,
           postprandial_glucose, weight, menstrual_status, mood_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, record_date, weather || null, feeling || null, fasting_glucose || null,
        postprandial_glucose || null, weight || null, menstrual_status || null, mood_notes || null
      );

      const record = db.prepare(
        'SELECT * FROM health_records WHERE id = ? AND user_id = ?'
      ).get(result.lastInsertRowid, userId);
      res.json({ message: '保存成功', record });
    }
  } catch (err) {
    console.error('保存健康记录失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 删除健康记录
 * DELETE /api/health/:id
 */
app.delete('/api/health/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const recordId = req.params.id;

    const result = db.prepare(
      'DELETE FROM health_records WHERE id = ? AND user_id = ?'
    ).run(recordId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除健康记录失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取健康统计数据（最近一条记录 + 本月记录数）
 * GET /api/health/summary
 */
app.get('/api/health/summary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

    // 最新一条记录
    const latest = db.prepare(
      'SELECT * FROM health_records WHERE user_id = ? ORDER BY record_date DESC LIMIT 1'
    ).get(userId);

    // 本月记录数
    const monthCount = db.prepare(
      'SELECT COUNT(*) as count FROM health_records WHERE user_id = ? AND record_date >= ?'
    ).get(userId, monthStart).count;

    // 最近30天经期记录（用于日历标记）
    const last30Days = db.prepare(
      "SELECT record_date, menstrual_status FROM health_records WHERE user_id = ? AND record_date >= date('now', '-30 days') ORDER BY record_date"
    ).all(userId);

    res.json({ latest, month_count: monthCount, last_30_days: last30Days });
  } catch (err) {
    console.error('获取健康统计失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 本月提醒接口 ====================

/**
 * 获取本月提醒
 * GET /api/month-reminder
 */
app.get('/api/month-reminder', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const row = db.prepare(
      'SELECT content FROM month_reminders WHERE user_id = ?'
    ).get(userId);
    res.json({ content: row ? row.content : '' });
  } catch (err) {
    console.error('获取本月提醒失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 保存/更新本月提醒（upsert）
 * PUT /api/month-reminder
 * Body: { content }
 */
app.put('/api/month-reminder', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { content } = req.body;

    const existing = db.prepare(
      'SELECT id FROM month_reminders WHERE user_id = ?'
    ).get(userId);

    if (existing) {
      db.prepare(
        `UPDATE month_reminders SET content = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?`
      ).run(content || '', userId);
    } else {
      db.prepare(
        'INSERT INTO month_reminders (user_id, content) VALUES (?, ?)'
      ).run(userId, content || '');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('保存本月提醒失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 看板数据汇总接口 ====================

/**
 * 看板数据汇总
 * GET /api/dashboard
 * 返回：护肤品/食材/生活用品数量、临期预警数、本月日记数、各模块价值、分类统计
 */
app.get('/api/dashboard', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    // 护肤品总数
    const skincareCount = db.prepare(
      'SELECT COUNT(*) as count FROM skincare WHERE user_id = ?'
    ).get(userId).count;

    // 食材总数
    const foodCount = db.prepare(
      'SELECT COUNT(*) as count FROM food WHERE user_id = ?'
    ).get(userId).count;

    // 生活用品总数
    const householdCount = db.prepare(
      'SELECT COUNT(*) as count FROM household_items WHERE user_id = ?'
    ).get(userId).count;

    // 彩妆总数
    const makeupCount = db.prepare(
      'SELECT COUNT(*) as count FROM makeup WHERE user_id = ?'
    ).get(userId).count;

    // 本月日记数
    const diaryMonthCount = db.prepare(`
      SELECT COUNT(*) as count FROM diary
      WHERE user_id = ?
        AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    // 临期护肤品（开封后30天内到期或已过期）
    const expiringSkincare = db.prepare(`
      SELECT *,
        date(open_date, '+' || shelf_life_months || ' months') as open_expiry_date,
        julianday(date(open_date, '+' || shelf_life_months || ' months')) - julianday('now') as days_remaining
      FROM skincare
      WHERE user_id = ?
        AND open_date IS NOT NULL
        AND open_date != ''
        AND shelf_life_months IS NOT NULL
        AND julianday(date(open_date, '+' || shelf_life_months || ' months')) - julianday('now') <= 30
      ORDER BY days_remaining ASC
      LIMIT 10
    `).all(userId);

    // 临期食材（30天内过期或已过期）
    const expiringFood = db.prepare(`
      SELECT *,
        julianday(expiry_date) - julianday('now') as days_remaining
      FROM food
      WHERE user_id = ?
        AND expiry_date IS NOT NULL
        AND expiry_date != ''
        AND julianday(expiry_date) - julianday('now') <= 30
      ORDER BY days_remaining ASC
      LIMIT 10
    `).all(userId);

    // 临期生活用品（30天内过期或已过期）
    const expiringHousehold = db.prepare(`
      SELECT *,
        julianday(expiry_date) - julianday('now') as days_remaining
      FROM household_items
      WHERE user_id = ?
        AND expiry_date IS NOT NULL
        AND expiry_date != ''
        AND julianday(expiry_date) - julianday('now') <= 30
      ORDER BY days_remaining ASC
      LIMIT 10
    `).all(userId);

    // 临期彩妆（90天内过期或已过期）
    const expiringMakeup = db.prepare(`
      SELECT *,
        julianday(expiry_date) - julianday('now') as days_remaining
      FROM makeup
      WHERE user_id = ?
        AND archived = 0
        AND expiry_date IS NOT NULL
        AND expiry_date != ''
        AND julianday(expiry_date) - julianday('now') <= 90
      ORDER BY days_remaining ASC
      LIMIT 10
    `).all(userId);

    // 临期预警总数（护肤品+食材+生活用品+彩妆）
    const expiringSoonCount = expiringSkincare.length + expiringFood.length + expiringHousehold.length + expiringMakeup.length;

    // 护肤品总价值（skincare 没有 price 字段，暂为 0）
    const skincareValue = 0;

    // 食材总价值（food 没有 price 字段，暂为 0）
    const foodValue = 0;

    // 生活用品总价值（price * quantity）
    const householdValueRow = db.prepare(`
      SELECT COALESCE(SUM(price * quantity), 0) as total_value
      FROM household_items
      WHERE user_id = ?
        AND price IS NOT NULL
        AND quantity IS NOT NULL
    `).get(userId);
    const householdValue = householdValueRow.total_value || 0;

    // 彩妆总价值
    const makeupValueRow = db.prepare(`
      SELECT COALESCE(SUM(price), 0) as total_value
      FROM makeup
      WHERE user_id = ?
        AND price IS NOT NULL
    `).get(userId);
    const makeupValue = makeupValueRow.total_value || 0;

    // 所有库存总价值
    const totalValue = skincareValue + foodValue + householdValue + makeupValue;

    // 各分类统计
    // 护肤品分类占比
    const skincareCategoryStats = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM skincare
      WHERE user_id = ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all(userId);

    // 食材分类占比
    const foodCategoryStats = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM food
      WHERE user_id = ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all(userId);

    // 生活用品分类占比
    const householdCategoryStats = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM household_items
      WHERE user_id = ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all(userId);

    // 彩妆分类占比
    const makeupCategoryStats = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM makeup
      WHERE user_id = ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all(userId);

    // 本月新增物品数（护肤品+食材+生活用品）
    const newSkincareMonth = db.prepare(`
      SELECT COUNT(*) as count FROM skincare
      WHERE user_id = ?
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const newFoodMonth = db.prepare(`
      SELECT COUNT(*) as count FROM food
      WHERE user_id = ?
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const newHouseholdMonth = db.prepare(`
      SELECT COUNT(*) as count FROM household_items
      WHERE user_id = ?
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const newMakeupMonth = db.prepare(`
      SELECT COUNT(*) as count FROM makeup
      WHERE user_id = ?
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const newItemsMonth = newSkincareMonth + newFoodMonth + newHouseholdMonth + newMakeupMonth;

    // 本月已过期物品数（作为消耗的近似）
    const expiredSkincareMonth = db.prepare(`
      SELECT COUNT(*) as count FROM skincare
      WHERE user_id = ?
        AND open_date IS NOT NULL AND open_date != ''
        AND shelf_life_months IS NOT NULL
        AND julianday(date(open_date, '+' || shelf_life_months || ' months')) < julianday('now')
        AND strftime('%Y-%m', date(open_date, '+' || shelf_life_months || ' months')) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const expiredFoodMonth = db.prepare(`
      SELECT COUNT(*) as count FROM food
      WHERE user_id = ?
        AND expiry_date IS NOT NULL AND expiry_date != ''
        AND julianday(expiry_date) < julianday('now')
        AND strftime('%Y-%m', expiry_date) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const expiredHouseholdMonth = db.prepare(`
      SELECT COUNT(*) as count FROM household_items
      WHERE user_id = ?
        AND expiry_date IS NOT NULL AND expiry_date != ''
        AND julianday(expiry_date) < julianday('now')
        AND strftime('%Y-%m', expiry_date) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const expiredMakeupMonth = db.prepare(`
      SELECT COUNT(*) as count FROM makeup
      WHERE user_id = ?
        AND expiry_date IS NOT NULL AND expiry_date != ''
        AND julianday(expiry_date) < julianday('now')
        AND strftime('%Y-%m', expiry_date) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    const expiredItemsMonth = expiredSkincareMonth + expiredFoodMonth + expiredHouseholdMonth + expiredMakeupMonth;

    // 最近7天活动记录（日记+新增物品合计，按天统计）
    const sevenDayTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = db.prepare("SELECT date('now', '-' || ? || ' days') as d").get(i).d;

      const diaryCount = db.prepare(`
        SELECT COUNT(*) as count FROM diary
        WHERE user_id = ? AND date = ?
      `).get(userId, dateStr).count;

      const skincareCount = db.prepare(`
        SELECT COUNT(*) as count FROM skincare
        WHERE user_id = ? AND date(created_at) = ?
      `).get(userId, dateStr).count;

      const foodCount = db.prepare(`
        SELECT COUNT(*) as count FROM food
        WHERE user_id = ? AND date(created_at) = ?
      `).get(userId, dateStr).count;

      const householdCount = db.prepare(`
        SELECT COUNT(*) as count FROM household_items
        WHERE user_id = ? AND date(created_at) = ?
      `).get(userId, dateStr).count;

      const makeupCountDaily = db.prepare(`
        SELECT COUNT(*) as count FROM makeup
        WHERE user_id = ? AND date(created_at) = ?
      `).get(userId, dateStr).count;

      sevenDayTrend.push({
        date: dateStr,
        diary: diaryCount,
        new_items: skincareCount + foodCount + householdCount + makeupCountDaily,
        total: diaryCount + skincareCount + foodCount + householdCount + makeupCountDaily
      });
    }

    // ===== 健康快照数据 =====
    // 最近一条健康记录
    const healthLatest = db.prepare(
      'SELECT record_date, weight, fasting_glucose, mood_notes FROM health_records WHERE user_id = ? ORDER BY record_date DESC LIMIT 1'
    ).get(userId);

    // 本月健康记录数
    const healthMonthCount = db.prepare(`
      SELECT COUNT(*) as count FROM health_records
      WHERE user_id = ? AND strftime('%Y-%m', record_date) = strftime('%Y-%m', 'now')
    `).get(userId).count;

    // ===== 冰箱临期汇总（30天内过期/临期数量） =====
    const fridgeExpiring30 = db.prepare(`
      SELECT COUNT(*) as count FROM food
      WHERE user_id = ?
        AND archived = 0 AND processed = 0
        AND expiry_date IS NOT NULL AND expiry_date != ''
        AND julianday(expiry_date) - julianday('now') <= 30
    `).get(userId).count;

    // ===== 护肤品临期汇总（90天内临期数量） =====
    const skincareExpiring90 = db.prepare(`
      SELECT COUNT(*) as count FROM skincare
      WHERE user_id = ? AND archived = 0
        AND (
          (expiry_date IS NOT NULL AND expiry_date != ''
           AND julianday(expiry_date) - julianday('now') <= 90
           AND julianday(expiry_date) - julianday('now') >= 0)
          OR
          (open_date IS NOT NULL AND open_date != ''
           AND shelf_life_months IS NOT NULL
           AND julianday(date(open_date, '+' || shelf_life_months || ' months')) - julianday('now') <= 90
           AND julianday(date(open_date, '+' || shelf_life_months || ' months')) - julianday('now') >= 0)
        )
    `).get(userId).count;

    // ===== 彩妆临期汇总（90天内临期数量） =====
    const makeupExpiring90 = db.prepare(`
      SELECT COUNT(*) as count FROM makeup
      WHERE user_id = ? AND archived = 0
        AND expiry_date IS NOT NULL AND expiry_date != ''
        AND julianday(expiry_date) - julianday('now') <= 90
        AND julianday(expiry_date) - julianday('now') >= 0
    `).get(userId).count;

    res.json({
      skincare_count: skincareCount,
      food_count: foodCount,
      household_count: householdCount,
      makeup_count: makeupCount,
      expiring_soon_count: expiringSoonCount,
      diary_month_count: diaryMonthCount,
      expiring_skincare: expiringSkincare,
      expiring_food: expiringFood,
      expiring_household: expiringHousehold,
      expiring_makeup: expiringMakeup,
      skincare_value: skincareValue,
      food_value: foodValue,
      household_value: householdValue,
      makeup_value: makeupValue,
      total_value: totalValue,
      category_stats: {
        skincare: skincareCategoryStats,
        food: foodCategoryStats,
        household: householdCategoryStats,
        makeup: makeupCategoryStats
      },
      new_items_month: newItemsMonth,
      expired_items_month: expiredItemsMonth,
      seven_day_trend: sevenDayTrend,
      // 健康快照
      health_latest: healthLatest || null,
      health_month_count: healthMonthCount,
      // 临期汇总
      fridge_summary: {
        expiring_30: fridgeExpiring30
      },
      skincare_summary: {
        expiring_90: skincareExpiring90
      },
      makeup_summary: {
        expiring_90: makeupExpiring90
      }
    });
  } catch (err) {
    console.error('获取看板数据失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 示例数据填充接口 ====================

/**
 * 为当前登录用户填充示例数据
 * POST /api/demo/seed
 * 如果用户已有数据（任意模块有记录），则不填充，返回提示"已有数据"
 */
app.post('/api/demo/seed', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    // 检查是否已有数据
    const skincareCount = db.prepare('SELECT COUNT(*) as count FROM skincare WHERE user_id = ?').get(userId).count;
    const foodCount = db.prepare('SELECT COUNT(*) as count FROM food WHERE user_id = ?').get(userId).count;
    const makeupCount = db.prepare('SELECT COUNT(*) as count FROM makeup WHERE user_id = ?').get(userId).count;
    const householdCount = db.prepare('SELECT COUNT(*) as count FROM household_items WHERE user_id = ?').get(userId).count;
    const healthCount = db.prepare('SELECT COUNT(*) as count FROM health_records WHERE user_id = ?').get(userId).count;

    if (skincareCount > 0 || foodCount > 0 || makeupCount > 0 || householdCount > 0 || healthCount > 0) {
      return res.json({ message: '已有数据', seeded: false });
    }

    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];
    const addDays = (days) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return formatDate(d);
    };
    const minusDays = (days) => {
      const d = new Date(today);
      d.setDate(d.getDate() - days);
      return formatDate(d);
    };

    // ===== 护肤品：6件 =====
    const skincareItems = [
      { name: '氨基酸洁面乳', brand: '芙丽芳丝', category: '洁面', price: 99.0, volume: '100g', purchase_date: minusDays(30), open_date: minusDays(15), shelf_life_months: 6, remaining_amount: '80%', wear_feel: '温和不紧绷', rebuy: '会', season: '四季', skin_type: '混合皮', notes: '晨间洁面' },
      { name: '保湿化妆水', brand: '无印良品', category: '水', price: 78.0, volume: '200ml', purchase_date: minusDays(45), open_date: minusDays(20), shelf_life_months: 12, remaining_amount: '60%', wear_feel: '清爽补水', rebuy: '会', season: '四季', skin_type: '混合皮', notes: '敏感肌可用' },
      { name: '烟酰胺精华', brand: 'OLAY', category: '精华', price: 239.0, volume: '30ml', purchase_date: minusDays(60), open_date: minusDays(10), shelf_life_months: 12, remaining_amount: '90%', wear_feel: '提亮肤色', rebuy: '考虑', season: '四季', skin_type: '混合皮', notes: '抗初老' },
      { name: '高保湿面霜', brand: '科颜氏', category: '面霜', price: 315.0, volume: '50ml', purchase_date: minusDays(90), open_date: minusDays(80), shelf_life_months: 6, remaining_amount: '30%', wear_feel: '滋润不油腻', rebuy: '会', season: '秋冬', skin_type: '混合皮', notes: '快用完了' },
      { name: '紧致眼霜', brand: '雅诗兰黛', category: '眼霜', price: 520.0, volume: '15ml', purchase_date: minusDays(120), open_date: minusDays(100), shelf_life_months: 6, remaining_amount: '10%', wear_feel: '滋润好吸收', rebuy: '考虑', season: '四季', skin_type: '混合皮', notes: '临期了' },
      { name: '轻薄防晒霜', brand: '安热沙', category: '防晒', price: 198.0, volume: '60ml', purchase_date: minusDays(10), open_date: null, shelf_life_months: 12, remaining_amount: '100%', wear_feel: '清爽不泛白', rebuy: '会', season: '春夏', skin_type: '混合皮', notes: '未开封' }
    ];

    const skincareStmt = db.prepare(`
      INSERT INTO skincare (user_id, name, brand, category, price, volume, purchase_date, open_date, expiry_date, shelf_life_months, remaining_amount, wear_feel, rebuy, season, skin_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    skincareItems.forEach(item => {
      // 计算 expiry_date：如果有 open_date 和 shelf_life_months，则推算
      let expiryDate = null;
      if (item.open_date && item.shelf_life_months) {
        const expDate = new Date(item.open_date);
        expDate.setMonth(expDate.getMonth() + item.shelf_life_months);
        expiryDate = formatDate(expDate);
      }
      skincareStmt.run(userId, item.name, item.brand, item.category, item.price, item.volume,
        item.purchase_date, item.open_date, expiryDate, item.shelf_life_months,
        item.remaining_amount, item.wear_feel, item.rebuy, item.season, item.skin_type, item.notes);
    });

    // ===== 冰箱食材：8件 =====
    const foodItems = [
      { name: '鲜牛奶', category: '乳制品', purchase_date: minusDays(3), expiry_date: addDays(5), location: '冷藏', quantity: 2, unit: '盒', replenish_threshold: 1, notes: '250ml 盒装' },
      { name: '土鸡蛋', category: '其他', purchase_date: minusDays(7), expiry_date: addDays(20), location: '冷藏', quantity: 12, unit: '个', replenish_threshold: 4, notes: '农家土鸡蛋' },
      { name: '西兰花', category: '蔬菜', purchase_date: minusDays(2), expiry_date: addDays(3), location: '冷藏', quantity: 1, unit: '颗', replenish_threshold: 0, notes: '新鲜蔬菜' },
      { name: '苹果', category: '水果', purchase_date: minusDays(5), expiry_date: addDays(15), location: '冷藏', quantity: 6, unit: '个', replenish_threshold: 2, notes: '红富士' },
      { name: '鸡胸肉', category: '肉类', purchase_date: minusDays(1), expiry_date: addDays(2), location: '冷冻', quantity: 500, unit: 'g', replenish_threshold: 200, notes: '健身食材' },
      { name: '生抽酱油', category: '调味品', purchase_date: minusDays(60), expiry_date: addDays(200), location: '冷藏', quantity: 1, unit: '瓶', replenish_threshold: 0, notes: '500ml' },
      { name: '原味酸奶', category: '乳制品', purchase_date: minusDays(10), expiry_date: addDays(-2), location: '冷藏', quantity: 1, unit: '瓶', replenish_threshold: 0, notes: '已过期！' },
      { name: '三文鱼', category: '海鲜', purchase_date: minusDays(1), expiry_date: addDays(1), location: '冷冻', quantity: 300, unit: 'g', replenish_threshold: 0, notes: '刺身级' }
    ];

    const foodStmt = db.prepare(`
      INSERT INTO food (user_id, name, category, purchase_date, expiry_date, location, quantity, unit, replenish_threshold, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    foodItems.forEach(item => {
      foodStmt.run(userId, item.name, item.category, item.purchase_date, item.expiry_date,
        item.location, item.quantity, item.unit, item.replenish_threshold, item.notes);
    });

    // ===== 生活用品：5件 =====
    const householdItems = [
      { name: '维达抽纸', category: '纸品湿巾', purchase_date: minusDays(5), expiry_date: addDays(540), quantity: 6, unit: '包', storage_location: '储物柜', price: 29.9, notes: 'M码 3层' },
      { name: '蓝月亮洗衣液', category: '衣物清洁', purchase_date: minusDays(20), expiry_date: addDays(720), quantity: 2, unit: '瓶', storage_location: '阳台', price: 45.0, notes: '薰衣草香 3kg' },
      { name: '牙膏', category: '个护清洁', purchase_date: minusDays(2), expiry_date: addDays(300), quantity: 2, unit: '支', storage_location: '卫生间', price: 18.5, notes: '薄荷味' },
      { name: '滴露消毒液', category: '个护清洁', purchase_date: minusDays(45), expiry_date: addDays(200), quantity: 1, unit: '瓶', storage_location: '阳台', price: 55.0, notes: '1.2L 松木味' },
      { name: '绿伞洁厕灵', category: '家居清洁', purchase_date: minusDays(60), expiry_date: addDays(15), quantity: 2, unit: '瓶', storage_location: '卫生间', price: 12.8, notes: '快到期了' }
    ];

    const householdStmt = db.prepare(`
      INSERT INTO household_items (user_id, name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    householdItems.forEach(item => {
      householdStmt.run(userId, item.name, item.category, item.purchase_date, item.expiry_date,
        item.quantity, item.unit, item.storage_location, item.price, item.notes);
    });

    // ===== 彩妆：6件 =====
    const makeupItems = [
      { name: '烈艳蓝金唇膏999', category: '口红', brand: '迪奥', price: 350, color: '正红色', open_date: minusDays(20), shelf_life_months: 12, remaining_amount: '80%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '经典正红' },
      { name: '恒颜无瑕粉底液', category: '粉底', brand: 'YSL', price: 580, color: 'B20', open_date: minusDays(30), shelf_life_months: 12, remaining_amount: '70%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '持妆效果好' },
      { name: '九色眼影盘', category: '眼影', brand: 'MAC', price: 420, color: '大地色', open_date: minusDays(15), shelf_life_months: 12, remaining_amount: '85%', repurchase: '考虑中', season: '秋冬', skin_type: '混合', notes: '日常百搭' },
      { name: '炫色腮红', category: '腮红', brand: 'NARS', price: 300, color: 'Orgasm', open_date: minusDays(45), shelf_life_months: 12, remaining_amount: '60%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '网红色号' },
      { name: '三角眉笔', category: '眉笔', brand: '花西子', price: 79, color: '深棕', open_date: null, shelf_life_months: 18, remaining_amount: '100%', repurchase: null, season: null, skin_type: null, notes: '未开封' },
      { name: '空气蜜粉散粉', category: '散粉', brand: '花西子', price: 169, color: '透明', open_date: minusDays(60), shelf_life_months: 12, remaining_amount: '50%', repurchase: '会回购', season: '四季', skin_type: '混合', notes: '定妆持久' }
    ];

    const makeupStmt = db.prepare(`
      INSERT INTO makeup (user_id, name, category, brand, price, color, open_date, shelf_life_months, expiry_date, remaining_amount, repurchase, season, skin_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    makeupItems.forEach(item => {
      let expiryDate = null;
      if (item.open_date && item.shelf_life_months) {
        const expDate = new Date(item.open_date);
        expDate.setMonth(expDate.getMonth() + item.shelf_life_months);
        expiryDate = formatDate(expDate);
      } else if (item.shelf_life_months) {
        // 未开封，按购买日期+保质期计算（这里用今天+保质期近似）
        const expDate = new Date(today);
        expDate.setMonth(expDate.getMonth() + item.shelf_life_months);
        expiryDate = formatDate(expDate);
      }
      makeupStmt.run(userId, item.name, item.category, item.brand, item.price,
        item.color, item.open_date, item.shelf_life_months, expiryDate,
        item.remaining_amount, item.repurchase, item.season, item.skin_type, item.notes);
    });

    // ===== 健康记录：最近7天 =====
    const healthRecords = [
      { record_date: minusDays(6), weather: '晴', feeling: '良好', fasting_glucose: 5.2, postprandial_glucose: null, weight: 52.5, menstrual_status: null, mood_notes: '精神不错' },
      { record_date: minusDays(5), weather: '多云', feeling: '良好', fasting_glucose: 5.4, postprandial_glucose: null, weight: 52.6, menstrual_status: null, mood_notes: '工作顺利' },
      { record_date: minusDays(4), weather: '阴', feeling: '一般', fasting_glucose: 5.6, postprandial_glucose: 7.2, weight: 52.4, menstrual_status: null, mood_notes: '有点累' },
      { record_date: minusDays(3), weather: '小雨', feeling: '良好', fasting_glucose: 5.3, postprandial_glucose: null, weight: 52.3, menstrual_status: '经期', mood_notes: '来例假了，有点腰酸' },
      { record_date: minusDays(2), weather: '晴', feeling: '疲惫', fasting_glucose: 5.5, postprandial_glucose: null, weight: 52.5, menstrual_status: '经期', mood_notes: '量比较多' },
      { record_date: minusDays(1), weather: '晴', feeling: '良好', fasting_glucose: 5.1, postprandial_glucose: 6.8, weight: 52.4, menstrual_status: '经期', mood_notes: '好转中' },
      { record_date: formatDate(today), weather: '多云', feeling: '良好', fasting_glucose: null, postprandial_glucose: null, weight: 52.3, menstrual_status: null, mood_notes: null }
    ];

    const healthStmt = db.prepare(`
      INSERT INTO health_records (user_id, record_date, weather, feeling, fasting_glucose, postprandial_glucose, weight, menstrual_status, mood_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    healthRecords.forEach(record => {
      healthStmt.run(userId, record.record_date, record.weather, record.feeling,
        record.fasting_glucose, record.postprandial_glucose, record.weight,
        record.menstrual_status, record.mood_notes);
    });

    res.status(201).json({
      message: '示例数据导入成功',
      seeded: true,
      stats: {
        skincare: skincareItems.length,
        food: foodItems.length,
        makeup: makeupItems.length,
        household: householdItems.length,
        health: healthRecords.length
      }
    });
  } catch (err) {
    console.error('填充示例数据失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 健康检查接口 ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '生活管理后端服务运行正常' });
});

// ==================== 启动服务（异步初始化数据库） ====================

/**
 * 填充 demo 用户的测试数据（生活用品）
 */
function seedHouseholdData() {
  const demoUser = db.prepare("SELECT id FROM users WHERE username = 'demo'").get();
  if (!demoUser) return;

  const userId = demoUser.id;
  const existing = db.prepare('SELECT COUNT(*) as count FROM household_items WHERE user_id = ?').get(userId).count;
  if (existing > 0) return; // 已有数据，不再填充

  const today = new Date();
  const formatDate = (d) => d.toISOString().split('T')[0];
  const addDays = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return formatDate(d);
  };
  const minusDays = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return formatDate(d);
  };

  const seedItems = [
    { name: '舒肤佳香皂', category: '个护清洁', purchase_date: minusDays(10), expiry_date: addDays(300), quantity: 3, unit: '块', storage_location: '卫生间', price: 8.5, notes: '柠檬味' },
    { name: '维达抽纸', category: '纸品湿巾', purchase_date: minusDays(5), expiry_date: addDays(540), quantity: 6, unit: '包', storage_location: '储物柜', price: 29.9, notes: 'M码 3层' },
    { name: '蓝月亮洗衣液', category: '衣物清洁', purchase_date: minusDays(20), expiry_date: addDays(720), quantity: 2, unit: '瓶', storage_location: '阳台', price: 45.0, notes: '薰衣草香 3kg' },
    { name: '威猛先生厨房重油污净', category: '家居清洁', purchase_date: minusDays(15), expiry_date: addDays(365), quantity: 1, unit: '瓶', storage_location: '厨房', price: 19.9, notes: '柠檬味' },
    { name: 'Type-C 数据线', category: '数码配件', purchase_date: minusDays(3), expiry_date: null, quantity: 2, unit: '根', storage_location: '储物柜', price: 29.0, notes: '2米 编织线' },
    { name: '心相印卷纸', category: '纸品湿巾', purchase_date: minusDays(30), expiry_date: addDays(700), quantity: 10, unit: '卷', storage_location: '卫生间', price: 35.0, notes: '4层 有芯' },
    { name: '滴露消毒液', category: '个护清洁', purchase_date: minusDays(45), expiry_date: addDays(200), quantity: 1, unit: '瓶', storage_location: '阳台', price: 55.0, notes: '1.2L 松木味' },
    { name: '绿伞洁厕灵', category: '家居清洁', purchase_date: minusDays(60), expiry_date: addDays(15), quantity: 2, unit: '瓶', storage_location: '卫生间', price: 12.8, notes: '快到期了' },
    { name: '洗衣凝珠', category: '衣物清洁', purchase_date: minusDays(7), expiry_date: addDays(400), quantity: 40, unit: '颗', storage_location: '阳台', price: 39.9, notes: '三腔 留香' },
    { name: '充电电池套装', category: '数码配件', purchase_date: minusDays(100), expiry_date: null, quantity: 8, unit: '节', storage_location: '储物柜', price: 79.0, notes: '5号 充电电池+充电器' },
    { name: '垃圾袋加厚', category: '其他', purchase_date: minusDays(25), expiry_date: null, quantity: 100, unit: '只', storage_location: '厨房', price: 15.9, notes: '45*50cm 黑色' },
    { name: '牙膏', category: '个护清洁', purchase_date: minusDays(2), expiry_date: addDays(-5), quantity: 1, unit: '支', storage_location: '卫生间', price: 18.5, notes: '已过期一支' }
  ];

  const stmt = db.prepare(`
    INSERT INTO household_items (user_id, name, category, purchase_date, expiry_date, quantity, unit, storage_location, price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  seedItems.forEach(item => {
    stmt.run(userId, item.name, item.category, item.purchase_date, item.expiry_date, item.quantity, item.unit, item.storage_location, item.price, item.notes);
  });

  console.log(`已为 demo 用户填充 ${seedItems.length} 条生活用品测试数据`);
}

async function startServer() {
  try {
    // 初始化数据库（异步加载 WASM）
    const database = new Database(path.join(__dirname, 'life.db'));
    db = await database.init();
    // db.pragma('journal_mode = WAL'); // sql.js 不支持 WAL 模式

    // 初始化数据表
    initDatabase();

    // 填充 demo 用户完整测试数据（幂等，已有数据则跳过）
    seedDemoData(db);

    // 启动 Express 服务
    app.listen(PORT, () => {
      console.log(`生活管理后端服务已启动`);
      console.log(`服务地址: http://localhost:${PORT}`);
      console.log(`API文档:`);
      console.log(`  POST /api/register  - 用户注册`);
      console.log(`  POST /api/login     - 用户登录`);
      console.log(`  GET  /api/dashboard      - 看板数据（需登录）`);
      console.log(`  GET/PUT /api/month-reminder - 本月提醒（需登录）`);
      console.log(`  GET/POST/PUT/DELETE /api/skincare  - 护肤品管理（需登录）`);
      console.log(`  GET/POST/PUT/DELETE /api/food      - 食材管理（需登录）`);
      console.log(`  GET/POST/PUT/DELETE /api/makeup    - 彩妆管理（需登录）`);
      console.log(`  GET/POST/PUT/DELETE /api/household - 生活用品管理（需登录）`);
      console.log(`  GET/POST/PUT/DELETE /api/diary     - 日记管理（需登录）`);
      console.log(`  GET/POST/DELETE    /api/categories - 自定义分类（需登录）`);
    });
  } catch (err) {
    console.error('服务启动失败:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
