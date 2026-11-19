/**
 * 数据库封装模块 - db.js
 * 使用 sql.js（SQLite WebAssembly 版本）封装类 better-sqlite3 的 API
 * 原因：better-sqlite3 在 Node 26 上编译失败（V8 API 不兼容）
 *
 * 提供的 API：
 *  - db.prepare(sql) -> statement
 *    - stmt.run(...params) 执行，返回 { changes, lastInsertRowid }
 *    - stmt.get(...params) 查询单行，返回对象
 *    - stmt.all(...params) 查询所有行，返回对象数组
 *  - db.exec(sql) 执行 SQL 语句
 *  - db.pragma(statement) 执行 PRAGMA
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this._sql = null;
  }

  /**
   * 初始化数据库（异步加载 WASM）
   */
  async init() {
    this._sql = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this._sql.Database(fileBuffer);
    } else {
      this.db = new this._sql.Database();
      this._save();
    }
    return this;
  }

  /**
   * 保存数据库到文件
   */
  _save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /**
   * 执行 PRAGMA 语句
   */
  pragma(statement) {
    this.db.exec(`PRAGMA ${statement}`);
  }

  /**
   * 执行 SQL（多条语句用分号分隔）
   */
  exec(sql) {
    this.db.exec(sql);
    this._save();
  }

  /**
   * 准备预编译语句
   */
  prepare(sql) {
    return new Statement(this, sql);
  }
}

class Statement {
  constructor(dbWrapper, sql) {
    this.dbWrapper = dbWrapper;
    this.sql = sql;
    this.stmt = null;
  }

  /**
   * 获取内部 statement 对象（懒加载）
   */
  _getStmt() {
    if (!this.stmt) {
      this.stmt = this.dbWrapper.db.prepare(this.sql);
    }
    return this.stmt;
  }

  /**
   * 规范化参数（支持数组形式或多参数形式）
   */
  _normalizeParams(params) {
    if (params.length === 1 && Array.isArray(params[0])) {
      return params[0];
    }
    // 将 undefined 转为 null
    return params.map(p => p === undefined ? null : p);
  }

  /**
   * 执行语句（INSERT/UPDATE/DELETE 等）
   */
  run(...params) {
    const stmt = this._getStmt();
    const normalizedParams = this._normalizeParams(params);

    stmt.bind(normalizedParams);
    stmt.step();
    stmt.free();
    this.stmt = null; // 重置，下次重新 prepare

    const changes = this.dbWrapper.db.getRowsModified();
    const lastInsertRowid = this.dbWrapper.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];

    this.dbWrapper._save();

    return { changes, lastInsertRowid };
  }

  /**
   * 查询单行，返回对象
   */
  get(...params) {
    const stmt = this._getStmt();
    const normalizedParams = this._normalizeParams(params);

    stmt.bind(normalizedParams);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    this.stmt = null;

    return result;
  }

  /**
   * 查询所有行，返回对象数组
   */
  all(...params) {
    const stmt = this._getStmt();
    const normalizedParams = this._normalizeParams(params);

    stmt.bind(normalizedParams);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    this.stmt = null;

    return results;
  }
}

module.exports = Database;
