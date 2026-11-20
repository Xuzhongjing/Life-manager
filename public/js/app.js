/**
 * 蓝助理 - 前端主应用逻辑
 * 原生 JavaScript 实现，数据存储使用 localStorage 模拟后端
 */

// ===== 配置 =====
const API_BASE = '/api'; // 实际部署时替换为真实后端地址
const STORAGE_KEYS = {
    TOKEN: 'life_manager_token',
    USER: 'life_manager_user'
};

// ===== 工具函数 =====
const Utils = {
    // 生成唯一ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // 格式化日期 YYYY-MM-DD
    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    // 计算两个日期之间的天数差
    daysBetween(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = d2 - d1;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    },

    // 计算距离今天的天数
    daysFromToday(dateStr) {
        return this.daysBetween(new Date(), dateStr);
    },

    // 获取今天日期
    today() {
        return this.formatDate(new Date());
    },

    // 获取本月第一天
    firstDayOfMonth() {
        const d = new Date();
        d.setDate(1);
        return this.formatDate(d);
    },

    // 转义HTML，防止XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // 下划线转驼峰（单个字符串）
    snakeToCamel(str) {
        return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    },

    // 驼峰转下划线（单个字符串）
    camelToSnake(str) {
        return str.replace(/([A-Z])/g, '_$1').toLowerCase();
    },

    // 递归转换对象/数组的键：下划线 → 驼峰
    convertKeysToCamel(obj) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) {
            return obj.map(item => this.convertKeysToCamel(item));
        }
        if (typeof obj === 'object') {
            const result = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const camelKey = this.snakeToCamel(key);
                    result[camelKey] = this.convertKeysToCamel(obj[key]);
                }
            }
            return result;
        }
        return obj;
    },

    // 递归转换对象/数组的键：驼峰 → 下划线
    convertKeysToSnake(obj) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) {
            return obj.map(item => this.convertKeysToSnake(item));
        }
        if (typeof obj === 'object') {
            const result = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const snakeKey = this.camelToSnake(key);
                    result[snakeKey] = this.convertKeysToSnake(obj[key]);
                }
            }
            return result;
        }
        return obj;
    }
};

// ===== Toast 提示 =====
const Toast = {
    show(message, type = 'success', duration = 2500) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    },
    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); }
};

// ===== 弹窗管理 =====
const Modal = {
    open(title, contentHtml, onConfirm) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = contentHtml;
        document.getElementById('modal-overlay').classList.remove('hidden');

        // 绑定确认按钮（如果有）
        const confirmBtn = document.getElementById('modal-confirm-btn');
        if (confirmBtn && onConfirm) {
            confirmBtn.addEventListener('click', onConfirm);
        }
    },

    close() {
        document.getElementById('modal-overlay').classList.add('hidden');
        // 停止语音识别（如果正在进行）
        if (typeof VoiceRecognition !== 'undefined' && VoiceRecognition.isListening) {
            VoiceRecognition.stop();
        }
    },

    init() {
        document.getElementById('modal-close').addEventListener('click', () => this.close());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') {
                this.close();
            }
        });
    }
};

// ===== 语音识别 =====
const VoiceRecognition = {
    supported: false,
    recognition: null,
    isListening: false,
    currentInputId: null,
    currentModule: null,
    _firstClick: true,

    init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            this.supported = false;
            return;
        }
        this.supported = true;
        this.recognition = new SR();
        this.recognition.lang = 'zh-CN';
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            if (transcript && this.currentInputId) {
                const inputEl = document.getElementById(this.currentInputId);
                if (inputEl) {
                    const tagName = inputEl.tagName.toLowerCase();
                    const isTextarea = tagName === 'textarea';

                    // textarea 直接填入全文
                    if (isTextarea) {
                        inputEl.value = transcript;
                        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        // 输入框：智能解析
                        const parsed = this.smartParse(transcript, this.currentModule);
                        inputEl.value = parsed.name;
                        inputEl.dispatchEvent(new Event('input', { bubbles: true }));

                        // 填充解析出的数量/单位
                        if (parsed.quantity !== null && this.currentModule) {
                            if (this.currentModule === 'fridge') {
                                const qtyInput = document.getElementById('fr-quantity');
                                if (qtyInput && parsed.quantity) {
                                    qtyInput.value = parsed.quantity + (parsed.unit || '份');
                                }
                            } else if (this.currentModule === 'household') {
                                const qtyInput = document.getElementById('hh-quantity');
                                const unitInput = document.getElementById('hh-unit');
                                if (qtyInput && parsed.quantity) {
                                    qtyInput.value = parsed.quantity;
                                }
                                if (unitInput && parsed.unit) {
                                    unitInput.value = parsed.unit;
                                }
                            }
                        }
                    }
                }
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.updateMicButtonState();
            this.hideHint();
        };

        this.recognition.onerror = (event) => {
            console.warn('语音识别错误:', event.error);
            this.isListening = false;
            this.updateMicButtonState();
            this.hideHint();
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                Toast.warning('请允许麦克风权限后再使用语音输入');
            } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
                Toast.warning('语音识别失败，请重试');
            }
        };
    },

    // 智能解析语音内容
    smartParse(text, module) {
        let result = {
            name: text,
            quantity: null,
            unit: null
        };

        // 中文数字映射
        const cnNums = {
            '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
            '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
            '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
            '廿': 20, '三十': 30, '四十': 40, '五十': 50, '一百': 100,
            '半': 0.5
        };

        // 常见量词
        const commonUnits = ['瓶', '个', '支', '盒', '包', '袋', '斤', '公斤', '克', '件', '条', '片', '罐', '箱', '本', '双', '套', '把', '串', '碗', '杯', '卷', '束', '朵'];

        // 去除"添加"等前缀动词
        let cleanText = text.replace(/^(添加|买|来|要|拿|给我来|给我)[点个份些]?/, '').trim();

        // 尝试匹配各种模式
        let matched = false;

        const tryMatch = (numStr, unit, namePart) => {
            let qty = null;
            // 中文数字
            if (cnNums[numStr] !== undefined) {
                qty = cnNums[numStr];
            }
            // 阿拉伯数字
            else if (/^\d+(\.\d+)?$/.test(numStr)) {
                qty = parseFloat(numStr);
            }
            if (qty !== null) {
                result.quantity = qty;
                result.unit = unit;
                result.name = namePart;
                matched = true;
            }
        };

        for (const unit of commonUnits) {
            if (matched) break;

            // 模式1：数字+量词+名称（如"三瓶洗面奶"、"2盒牛奶"）
            const p1 = new RegExp(`^([零一二两三四五六七八九十廿百半]+|\\d+(?:\\.\\d+)?)${unit}(.+)`);
            const m1 = cleanText.match(p1);
            if (m1) {
                tryMatch(m1[1], unit, m1[2].trim());
                if (matched) break;
            }

            // 模式2：名称+数字+量词（如"苹果两斤"、"牛奶2盒"）
            const p2 = new RegExp(`(.+?)([零一二两三四五六七八九十廿百半]+|\\d+(?:\\.\\d+)?)${unit}$`);
            const m2 = cleanText.match(p2);
            if (m2) {
                tryMatch(m2[2], unit, m2[1].trim());
                if (matched) break;
            }
        }

        // 如果没匹配到量词，尝试只提取数字作为数量（无单位）
        if (!matched) {
            const numOnly = cleanText.match(/^(\d+(?:\.\d+)?)\s+(.+)/);
            if (numOnly) {
                result.quantity = parseFloat(numOnly[1]);
                result.name = numOnly[2].trim();
                matched = true;
            }
        }

        // 去除末尾的句号、感叹号等
        result.name = result.name.replace(/[。！？,.!?]+$/, '').trim();

        // 如果名称为空，回退到原文
        if (!result.name) {
            result.name = text;
            result.quantity = null;
            result.unit = null;
        }

        return result;
    },

    start(inputId, module) {
        if (!this.supported) {
            // 首次点击且不支持时，显示友好提示
            if (this._firstClick) {
                this._firstClick = false;
                Toast.info('当前浏览器不支持语音输入，请使用 Chrome 浏览器');
            }
            return;
        }
        if (this.isListening) {
            this.stop();
            return;
        }

        this.currentInputId = inputId;
        this.currentModule = module;
        this.isListening = true;

        try {
            this.recognition.start();
            this.updateMicButtonState();
            this.showHint(inputId);
        } catch (e) {
            console.warn('启动语音识别失败:', e);
            this.isListening = false;
        }
    },

    stop() {
        if (!this.supported || !this.isListening) return;
        this.recognition.stop();
        this.isListening = false;
        this.updateMicButtonState();
        this.hideHint();
    },

    updateMicButtonState() {
        const btns = document.querySelectorAll('.mic-btn');
        btns.forEach(btn => {
            if (this.isListening) {
                btn.classList.add('listening');
                btn.classList.remove('recording');
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="9" y="3" width="6" height="12" rx="3"/></svg>';
            } else {
                btn.classList.remove('listening');
                btn.classList.remove('recording');
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
            }
        });
    },

    showHint(inputId) {
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;

        const container = inputEl.closest('.input-with-mic, .textarea-with-mic');
        if (!container) return;

        // 移除旧的提示
        const oldHint = container.querySelector('.voice-hint');
        if (oldHint) oldHint.remove();

        const hint = document.createElement('div');
        hint.className = 'voice-hint';
        hint.textContent = '正在聆听...';
        container.appendChild(hint);
    },

    hideHint() {
        const hints = document.querySelectorAll('.voice-hint');
        hints.forEach(h => h.remove());
    },

    // 生成带麦克风按钮的输入框 HTML
    getInputWithMic(inputId, placeholder, value, module, showHint) {
        const escapedValue = Utils.escapeHtml(value || '');
        const micButton = this.supported
            ? `<button type="button" class="mic-btn" onclick="VoiceRecognition.start('${inputId}', '${module}')" title="语音输入">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
               </button>`
            : '';
        const hintText = (showHint && this.supported)
            ? `<div class="voice-hint-text">试试语音输入，如"牛奶 2 盒"</div>`
            : '';
        return `
            <div class="input-with-mic">
                <input type="text" id="${inputId}" value="${escapedValue}" placeholder="${placeholder}" required>
                ${micButton}
            </div>
            ${hintText}
        `;
    },

    // 生成带麦克风按钮的 textarea HTML
    getTextareaWithMic(textareaId, placeholder, value, rows, module, extraClass) {
        const escapedValue = Utils.escapeHtml(value || '');
        const classAttr = extraClass ? ` class="${extraClass}"` : '';
        const micButton = this.supported
            ? `<button type="button" class="mic-btn" onclick="VoiceRecognition.start('${textareaId}', '${module}')" title="语音输入">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
               </button>`
            : '';
        return `
            <div class="textarea-with-mic">
                <textarea id="${textareaId}" rows="${rows || 4}" placeholder="${placeholder}"${classAttr}>${escapedValue}</textarea>
                ${micButton}
            </div>
        `;
    },

    // 生成数量加减器 HTML
    getQuantityStepper(inputId, value, min = 0, step = 1) {
        const val = value || '';
        return `
            <div class="quantity-stepper">
                <button type="button" onclick="VoiceRecognition.adjustQuantity('${inputId}', -${step}, ${min})">−</button>
                <input type="number" id="${inputId}" value="${val}" placeholder="数量" min="${min}" step="${step}">
                <button type="button" onclick="VoiceRecognition.adjustQuantity('${inputId}', ${step}, ${min})">+</button>
            </div>
        `;
    },

    adjustQuantity(inputId, delta, min) {
        const input = document.getElementById(inputId);
        if (!input) return;
        let current = parseFloat(input.value) || 0;
        current = Math.max(min, current + delta);
        input.value = current;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
};

// ===== 常用物品快捷标签数据 =====
const QuickTags = {
    skincare: [
        { name: '洗面奶', category: '洁面' },
        { name: '爽肤水', category: '水' },
        { name: '精华液', category: '精华' },
        { name: '面霜', category: '面霜' },
        { name: '防晒霜', category: '防晒' },
        { name: '面膜', category: '面膜' },
        { name: '眼霜', category: '眼霜' }
    ],
    fridge: [
        { name: '牛奶', category: '乳制品', location: '冷藏', quantity: 1, unit: '盒' },
        { name: '鸡蛋', category: '其他', location: '冷藏', quantity: 1, unit: '盒' },
        { name: '苹果', category: '水果', location: '冷藏', quantity: 1, unit: '斤' },
        { name: '香蕉', category: '水果', location: '保鲜', quantity: 1, unit: '串' },
        { name: '青菜', category: '蔬菜', location: '保鲜', quantity: 1, unit: '把' },
        { name: '西红柿', category: '蔬菜', location: '冷藏', quantity: 1, unit: '斤' },
        { name: '鸡胸肉', category: '肉类', location: '冷冻', quantity: 1, unit: '斤' },
        { name: '酸奶', category: '乳制品', location: '冷藏', quantity: 1, unit: '盒' }
    ],
    household: [
        { name: '纸巾', category: '纸品湿巾', quantity: 1, unit: '包', storageLocation: '储物柜' },
        { name: '洗衣液', category: '衣物清洁', quantity: 1, unit: '瓶', storageLocation: '阳台' },
        { name: '牙膏', category: '个护清洁', quantity: 1, unit: '支', storageLocation: '卫生间' },
        { name: '洗发水', category: '个护清洁', quantity: 1, unit: '瓶', storageLocation: '卫生间' },
        { name: '沐浴露', category: '个护清洁', quantity: 1, unit: '瓶', storageLocation: '卫生间' },
        { name: '垃圾袋', category: '家居清洁', quantity: 1, unit: '卷', storageLocation: '厨房' },
        { name: '保鲜膜', category: '家居清洁', quantity: 1, unit: '盒', storageLocation: '厨房' }
    ],

    // 渲染快捷标签
    render(containerId, items, onTagClick, onQuickAdd) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = items.map((item, index) => `
            <button type="button" class="quick-tag" data-index="${index}" title="点击填写，长按快速添加">
                <span class="quick-tag__plus">+</span>
                <span>${item.name}</span>
            </button>
        `).join('');

        // 绑定点击和长按事件
        container.querySelectorAll('.quick-tag').forEach(btn => {
            const index = parseInt(btn.dataset.index);
            const item = items[index];
            let pressTimer = null;
            let isLongPress = false;

            const startPress = (e) => {
                isLongPress = false;
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    onQuickAdd(item);
                    // 视觉反馈
                    btn.style.transform = 'scale(0.95)';
                    setTimeout(() => { btn.style.transform = ''; }, 150);
                }, 500);
            };

            const endPress = (e) => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
                if (!isLongPress) {
                    onTagClick(item);
                }
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            };

            btn.addEventListener('mousedown', startPress);
            btn.addEventListener('mouseup', endPress);
            btn.addEventListener('mouseleave', cancelPress);
            btn.addEventListener('touchstart', startPress, { passive: true });
            btn.addEventListener('touchend', endPress);
            btn.addEventListener('touchcancel', cancelPress);
        });
    }
};

// ===== API 封装（真实后端）=====
const API = {
    // 路径映射：前端路径 → 后端 API 路径
    pathMap: {
        '/auth/register': '/register',
        '/auth/login': '/login',
        '/skincare': '/skincare',
        '/fridge': '/food',
        '/household': '/household',
        '/diary': '/diary',
        '/health': '/health',
        '/dashboard': '/dashboard',
        '/month-reminder': '/month-reminder',
        '/categories': '/categories'
    },

    // 将前端 endpoint 映射为真实后端 URL
    resolveUrl(endpoint) {
        // 先尝试完整路径匹配
        if (this.pathMap[endpoint]) {
            return API_BASE + this.pathMap[endpoint];
        }

        // 对于带 ID 的路径，如 /skincare/xxx → /api/skincare/xxx
        // 取第一段作为基准路径匹配，剩余部分追加
        const parts = endpoint.split('/').filter(Boolean);
        if (parts.length >= 2) {
            const firstPath = '/' + parts[0]; // 如 /skincare, /fridge
            const remaining = parts.slice(1).join('/'); // 如 123
            if (this.pathMap[firstPath]) {
                return API_BASE + this.pathMap[firstPath] + '/' + remaining;
            }
        }

        // 单段路径直接匹配
        if (this.pathMap[endpoint]) {
            return API_BASE + this.pathMap[endpoint];
        }

        // 无映射，直接使用
        return API_BASE + endpoint;
    },

    // 通用请求方法
    async request(endpoint, options = {}) {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const url = this.resolveUrl(endpoint);
        const method = options.method || 'GET';

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const fetchOptions = {
            method,
            headers
        };

        // 请求体：驼峰 → 下划线
        if (options.body && method !== 'GET') {
            let bodyData;
            try {
                bodyData = JSON.parse(options.body);
            } catch (e) {
                bodyData = options.body;
            }
            const snakeBody = Utils.convertKeysToSnake(bodyData);
            fetchOptions.body = JSON.stringify(snakeBody);
        }

        try {
            const response = await fetch(url, fetchOptions);

            if (!response.ok) {
                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (e) {
                    // 忽略解析错误
                }
                const message = errorData.message || errorData.error || `请求失败 (${response.status})`;
                return { success: false, message };
            }

            // 处理 DELETE 等可能无响应体的情况
            const text = await response.text();
            if (!text) {
                return { success: true, data: null };
            }

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                return { success: false, message: '响应格式错误' };
            }

            // 响应数据：下划线 → 驼峰（递归转换）
            const camelData = Utils.convertKeysToCamel(data);
            return { success: true, data: camelData };

        } catch (err) {
            console.error('API 请求错误:', err);
            return { success: false, message: err.message || '网络错误' };
        }
    },

    // 认证
    async login(username, password) {
        const res = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        return res;
    },

    async register(username, password) {
        const res = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        return res;
    },

    // 看板
    async dashboard() {
        const res = await this.request('/dashboard');
        return res;
    },

    // 本月提醒
    async getMonthReminder() {
        const res = await this.request('/month-reminder');
        return res;
    },

    async saveMonthReminder(content) {
        const res = await this.request('/month-reminder', {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
        return res;
    },

    // 护肤品
    async getSkincare(params = {}) {
        let endpoint = '/skincare';
        const queryParts = [];
        if (params.archived !== undefined && params.archived !== null) {
            queryParts.push(`archived=${params.archived ? 1 : 0}`);
        }
        if (params.search) {
            queryParts.push(`search=${encodeURIComponent(params.search)}`);
        }
        if (queryParts.length > 0) {
            endpoint += '?' + queryParts.join('&');
        }
        const res = await this.request(endpoint);
        return res;
    },

    async getSkincareSummary() {
        const res = await this.request('/skincare/summary');
        return res;
    },

    async addSkincare(data) {
        const res = await this.request('/skincare', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return res;
    },

    async updateSkincare(id, data) {
        const res = await this.request(`/skincare/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return res;
    },

    async deleteSkincare(id) {
        const res = await this.request(`/skincare/${id}`, {
            method: 'DELETE'
        });
        return res;
    },

    // 冰箱食材
    async getFridge(params = {}) {
        let endpoint = '/fridge';
        const queryParts = [];
        if (params.archived !== undefined && params.archived !== null) {
            queryParts.push(`archived=${params.archived ? 1 : 0}`);
        }
        if (params.search) {
            queryParts.push(`search=${encodeURIComponent(params.search)}`);
        }
        if (queryParts.length > 0) {
            endpoint += '?' + queryParts.join('&');
        }
        const res = await this.request(endpoint);
        return res;
    },

    async getFridgeSummary() {
        const res = await this.request('/fridge/summary');
        return res;
    },

    async addFridge(data) {
        const res = await this.request('/fridge', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return res;
    },

    async updateFridge(id, data) {
        const res = await this.request(`/fridge/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return res;
    },

    async deleteFridge(id) {
        const res = await this.request(`/fridge/${id}`, {
            method: 'DELETE'
        });
        return res;
    },

    // 生活用品
    async getHousehold() {
        const res = await this.request('/household');
        return res;
    },

    async addHousehold(data) {
        const res = await this.request('/household', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return res;
    },

    async updateHousehold(id, data) {
        const res = await this.request(`/household/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return res;
    },

    async deleteHousehold(id) {
        const res = await this.request(`/household/${id}`, {
            method: 'DELETE'
        });
        return res;
    },

    // 日记
    async getDiary() {
        const res = await this.request('/diary');
        return res;
    },

    async addDiary(data) {
        const res = await this.request('/diary', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return res;
    },

    async updateDiary(id, data) {
        const res = await this.request(`/diary/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return res;
    },

    async deleteDiary(id) {
        const res = await this.request(`/diary/${id}`, {
            method: 'DELETE'
        });
        return res;
    },

    // 健康管理
    async getHealth(startDate, endDate) {
        let url = '/health';
        const params = [];
        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        if (params.length) url += '?' + params.join('&');
        const res = await this.request(url);
        return res;
    },

    async getHealthByDate(date) {
        const res = await this.request(`/health/date/${encodeURIComponent(date)}`);
        return res;
    },

    async saveHealth(data) {
        const res = await this.request('/health', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return res;
    },

    async deleteHealth(id) {
        const res = await this.request(`/health/${id}`, {
            method: 'DELETE'
        });
        return res;
    },

    async getHealthSummary() {
        const res = await this.request('/health/summary');
        return res;
    },

    // 分类
    async getCategories(module) {
        const res = await this.request(`/categories/${module}`);
        return res;
    },

    async addCategory(moduleType, name) {
        const res = await this.request('/categories', {
            method: 'POST',
            body: JSON.stringify({ moduleType, name })
        });
        return res;
    },

    async deleteCategory(id) {
        const res = await this.request(`/categories/${id}`, {
            method: 'DELETE'
        });
        return res;
    },

    // 示例数据
    async seedDemo() {
        const res = await this.request('/demo/seed', {
            method: 'POST'
        });
        return res;
    }
};

// ===== 认证模块 =====
const Auth = {
    currentUser: null,

    init() {
        this.bindEvents();
        this.checkAuth();
    },

    // 解析 JWT token，提取 payload
    decodeJwt(token) {
        if (!token) return null;
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) return null;
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('JWT 解析失败:', e);
            return null;
        }
    },

    // 从 token 中获取用户信息
    getUserFromToken() {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (!token) return null;
        const payload = this.decodeJwt(token);
        if (!payload) return null;
        // JWT 中通常包含 sub (用户ID) 和 username 等信息
        // 同时也从 localStorage 读取 user 作为补充
        const userStr = localStorage.getItem(STORAGE_KEYS.USER);
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                // 忽略解析错误
            }
        }
        // 从 JWT payload 中构建基本用户信息
        return {
            id: payload.sub || payload.userId || payload.id,
            username: payload.username || payload.sub
        };
    },

    bindEvents() {
        // Tab 切换
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('login-form').classList.toggle('hidden', tabName !== 'login');
                document.getElementById('register-form').classList.toggle('hidden', tabName !== 'register');
                document.getElementById('login-error').textContent = '';
                document.getElementById('register-error').textContent = '';
            });
        });

        // 登录表单
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // 注册表单
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });

        // 退出登录
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.logout();
        });
    },

    async handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        if (!username || !password) {
            errorEl.textContent = '请填写完整信息';
            return;
        }

        const res = await API.login(username, password);
        if (res.success) {
            localStorage.setItem(STORAGE_KEYS.TOKEN, res.data.token);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(res.data.user));
            this.currentUser = res.data.user;
            Toast.success('登录成功');
            this.showApp();
        } else {
            errorEl.textContent = res.message || '登录失败';
        }
    },

    async handleRegister() {
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const password2 = document.getElementById('register-password2').value;
        const errorEl = document.getElementById('register-error');

        // 表单验证
        if (!username || !password || !password2) {
            errorEl.textContent = '请填写完整信息';
            return;
        }
        if (username.length < 3 || username.length > 20) {
            errorEl.textContent = '用户名长度应为3-20位';
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = '密码长度不能少于6位';
            return;
        }
        if (password !== password2) {
            errorEl.textContent = '两次密码输入不一致';
            return;
        }

        const res = await API.register(username, password);
        if (res.success) {
            localStorage.setItem(STORAGE_KEYS.TOKEN, res.data.token);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(res.data.user));
            this.currentUser = res.data.user;
            Toast.success('注册成功');
            this.showApp();
        } else {
            errorEl.textContent = res.message || '注册失败';
        }
    },

    checkAuth() {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (!token) {
            this.showAuth();
            return;
        }

        // 从 JWT 解析用户信息
        const user = this.getUserFromToken();
        if (user && user.id) {
            this.currentUser = user;
            // 同步更新 localStorage 中的 user 信息
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            this.showApp();
            return;
        }

        // token 无效，清除数据
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        this.showAuth();
    },

    isLoggedIn() {
        return !!this.currentUser;
    },

    getCurrentUserId() {
        return this.currentUser ? this.currentUser.id : null;
    },

    showAuth() {
        document.getElementById('auth-page').classList.remove('hidden');
        document.getElementById('app-page').classList.add('hidden');
    },

    showApp() {
        document.getElementById('auth-page').classList.add('hidden');
        document.getElementById('app-page').classList.remove('hidden');
        if (this.currentUser) {
            document.getElementById('nav-username').textContent = this.currentUser.username;
        }
        // 初始化各模块
        Dashboard.loadData();
        Skincare.loadData();
        Skincare.loadSummary();
        Fridge.loadData();
        Fridge.loadSummary();
        Household.loadData();
        Diary.loadData();
    },

    logout() {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        this.currentUser = null;
        // 清空表单
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
        document.getElementById('login-error').textContent = '';
        document.getElementById('register-error').textContent = '';
        this.showAuth();
        Toast.success('已退出登录');
    }
};

// ===== 导航模块 =====
const Nav = {
    currentModule: 'dashboard',

    init() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.switchModule(item.dataset.module);
                // 移动端关闭菜单
                document.querySelector('.nav-menu').classList.remove('open');
            });
        });

        // 移动端导航切换
        document.getElementById('nav-toggle').addEventListener('click', () => {
            document.querySelector('.nav-menu').classList.toggle('open');
        });
    },

    switchModule(moduleName) {
        this.currentModule = moduleName;

        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.module === moduleName);
        });

        // 切换内容模块
        document.querySelectorAll('.module').forEach(mod => {
            mod.classList.add('hidden');
        });
        document.getElementById(`module-${moduleName}`).classList.remove('hidden');

        // 模块特定的刷新
        if (moduleName === 'dashboard') {
            Dashboard.loadData();
        } else if (moduleName === 'health') {
            Health.renderCalendar();
        }
    }
};

// ===== 分类选择组件 =====
const CategorySelect = {
    // 缓存各模块的分类数据
    _cache: {},

    // 获取分类列表（带缓存）
    async getCategories(module) {
        if (this._cache[module]) {
            return this._cache[module];
        }
        const res = await API.getCategories(module);
        if (res.success) {
            this._cache[module] = res.data || [];
            return this._cache[module];
        }
        return [];
    },

    // 清除缓存
    clearCache(module) {
        if (module) {
            delete this._cache[module];
        } else {
            this._cache = {};
        }
    },

    // 渲染分类下拉选项 HTML（用于原生 select，不含删除功能）
    renderOptions(categories, selectedValue) {
        return categories.map(cat =>
            `<option value="${Utils.escapeHtml(cat.name)}" ${selectedValue === cat.name ? 'selected' : ''}>${Utils.escapeHtml(cat.name)}</option>`
        ).join('');
    },

    // 渲染自定义下拉（带新增和删除功能）
    // containerId: 容器ID
    // module: 模块类型
    // selectedValue: 当前选中值
    // onChange: 选中回调
    // options: { showAllOption: 是否显示"全部分类"选项, allOptionLabel: "全部分类"文字 }
    renderCustomSelect(containerId, module, selectedValue, onChange, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const showAllOption = options.showAllOption || false;
        const allOptionLabel = options.allOptionLabel || '全部分类';
        const defaultDisplay = showAllOption ? allOptionLabel : '请选择分类';

        const selectId = `cat-select-${containerId}`;
        const dropdownId = `cat-dropdown-${containerId}`;

        container.innerHTML = `
            <div class="category-select" data-module="${module}">
                <button type="button" class="category-select__trigger" id="${selectId}">
                    <span class="category-select__value">${selectedValue ? (showAllOption && selectedValue === 'all' ? allOptionLabel : Utils.escapeHtml(selectedValue)) : defaultDisplay}</span>
                    <svg class="category-select__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="category-select__dropdown hidden" id="${dropdownId}">
                    <div class="category-select__list">
                        <!-- 选项动态渲染 -->
                    </div>
                    <div class="category-select__add">
                        <button type="button" class="category-select__add-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            <span>新增分类</span>
                        </button>
                        <div class="category-select__add-input hidden">
                            <input type="text" placeholder="输入分类名称" maxlength="20">
                            <button type="button" class="category-select__add-confirm">确定</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const trigger = container.querySelector('.category-select__trigger');
        const dropdown = container.querySelector('.category-select__dropdown');
        const listEl = container.querySelector('.category-select__list');
        const addBtn = container.querySelector('.category-select__add-btn');
        const addInputWrap = container.querySelector('.category-select__add-input');
        const addInput = container.querySelector('.category-select__add-input input');
        const addConfirm = container.querySelector('.category-select__add-confirm');

        // 渲染选项列表
        const renderList = async () => {
            const categories = await this.getCategories(module);
            const allOptionHtml = showAllOption ? `
                <div class="category-select__option ${selectedValue === 'all' ? 'is-selected' : ''}" data-name="all" data-id="" data-custom="0">
                    <span class="category-select__option-name">${allOptionLabel}</span>
                </div>
                <div class="category-select__divider"></div>
            ` : '';

            listEl.innerHTML = allOptionHtml + categories.map(cat => `
                <div class="category-select__option ${cat.isCustom ? 'is-custom' : ''}" data-name="${Utils.escapeHtml(cat.name)}" data-id="${cat.id || ''}" data-custom="${cat.isCustom ? 1 : 0}">
                    <span class="category-select__option-name">${Utils.escapeHtml(cat.name)}</span>
                    ${cat.isCustom ? `
                        <button type="button" class="category-select__delete-btn" title="删除分类">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            // 绑定选项点击
            listEl.querySelectorAll('.category-select__option').forEach(option => {
                option.addEventListener('click', (e) => {
                    if (e.target.closest('.category-select__delete-btn')) return;
                    const name = option.dataset.name;
                    container.querySelector('.category-select__value').textContent = name;
                    this._closeDropdown(dropdown);
                    if (onChange) onChange(name);
                });
            });

            // 绑定删除按钮
            listEl.querySelectorAll('.category-select__delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const option = btn.closest('.category-select__option');
                    const name = option.dataset.name;
                    const id = option.dataset.id;
                    const deleted = await this._handleDelete(module, id, name);
                    if (deleted) {
                        // 如果当前选中的是被删除的分类，改为"其他"
                        const valueEl = container.querySelector('.category-select__value');
                        if (valueEl.textContent === name) {
                            valueEl.textContent = showAllOption ? allOptionLabel : '其他';
                            if (onChange) onChange(showAllOption ? 'all' : '其他');
                        }
                        renderList();
                    }
                });
            });
        };

        // 打开/关闭下拉
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('hidden')) {
                this._closeAllDropdowns();
                this._openDropdown(dropdown);
                renderList();
            } else {
                this._closeDropdown(dropdown);
            }
        });

        // 新增分类按钮
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addBtn.classList.add('hidden');
            addInputWrap.classList.remove('hidden');
            addInput.value = '';
            setTimeout(() => addInput.focus(), 50);
        });

        // 确认新增
        const doAdd = async () => {
            const name = addInput.value.trim();
            if (!name) return;

            const res = await API.addCategory(module, name);
            if (res.success) {
                this.clearCache(module);
                Toast.success('分类添加成功');
                addInputWrap.classList.add('hidden');
                addBtn.classList.remove('hidden');
                // 选中新添加的分类
                container.querySelector('.category-select__value').textContent = name;
                renderList();
                if (onChange) onChange(name);
            } else {
                Toast.error(res.message || '添加失败');
            }
        };

        addConfirm.addEventListener('click', (e) => {
            e.stopPropagation();
            doAdd();
        });

        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doAdd();
            } else if (e.key === 'Escape') {
                addInputWrap.classList.add('hidden');
                addBtn.classList.remove('hidden');
            }
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this._closeDropdown(dropdown);
            }
        });
    },

    _openDropdown(dropdown) {
        dropdown.classList.remove('hidden');
    },

    _closeDropdown(dropdown) {
        dropdown.classList.add('hidden');
        // 收起新增输入框
        const addBtn = dropdown.querySelector('.category-select__add-btn');
        const addInputWrap = dropdown.querySelector('.category-select__add-input');
        if (addBtn) addBtn.classList.remove('hidden');
        if (addInputWrap) addInputWrap.classList.add('hidden');
    },

    _closeAllDropdowns() {
        document.querySelectorAll('.category-select__dropdown').forEach(d => {
            d.classList.add('hidden');
        });
    },

    async _handleDelete(module, id, name) {
        if (!id) return false;

        const confirmed = await this._showConfirm(name);
        if (!confirmed) return false;

        const res = await API.deleteCategory(id);
        if (res.success) {
            this.clearCache(module);
            Toast.success('删除成功');
            return true;
        } else {
            Toast.error(res.message || '删除失败');
            return false;
        }
    },

    _showConfirm(categoryName) {
        return new Promise((resolve) => {
            const content = `
                <p>删除后相关物品将归类为「其他」，确定删除「${Utils.escapeHtml(categoryName)}」分类吗？</p>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cat-del-cancel">取消</button>
                    <button class="btn btn-danger" id="cat-del-confirm">确认删除</button>
                </div>
            `;
            Modal.open('删除分类', content);

            document.getElementById('cat-del-cancel').addEventListener('click', () => {
                Modal.close();
                resolve(false);
            });
            document.getElementById('cat-del-confirm').addEventListener('click', () => {
                Modal.close();
                resolve(true);
            });
        });
    }
};

// ===== 总看板模块 =====
const Dashboard = {
    monthReminder: '',
    _monthReminderTimer: null,

    init() {
        // 示例数据横幅按钮
        const seedBtn = document.getElementById('demo-seed-btn');
        if (seedBtn) {
            seedBtn.addEventListener('click', () => this.importDemoData());
        }
    },

    async loadData() {
        // 并行请求：看板基础数据 + 三个模块 summary + 本月提醒 + 生活用品列表
        const [dashboardRes, healthSummaryRes, fridgeSummaryRes, skincareSummaryRes, monthReminderRes, householdRes] = await Promise.all([
            API.dashboard(),
            API.getHealthSummary(),
            API.getFridgeSummary(),
            API.getSkincareSummary(),
            API.getMonthReminder(),
            API.getHousehold()
        ]);

        if (!dashboardRes.success) {
            console.error('加载看板数据失败:', dashboardRes.message);
            return;
        }

        const data = dashboardRes.data || {};

        // 基础统计
        this.skincareCount = data.skincareCount || 0;
        this.foodCount = data.foodCount || 0;
        this.householdCount = data.householdCount || 0;
        this.expiringSoonCount = data.expiringSoonCount || 0;
        this.diaryMonthCount = data.diaryMonthCount || 0;

        // 临期列表数据
        this.expiringSkincare = data.expiringSkincare || [];
        this.expiringFood = data.expiringFood || [];

        // 生活用品列表（用于前端计算临期和库存不足）
        this.householdList = (householdRes.success && householdRes.data) ? householdRes.data : [];

        // 健康快照
        if (healthSummaryRes.success && healthSummaryRes.data) {
            const hs = healthSummaryRes.data;
            this.healthLatest = hs.latestRecord || hs.latest || data.healthLatest || null;
            this.healthMonthCount = hs.monthCount !== undefined ? hs.monthCount : (data.healthMonthCount || 0);
        } else {
            this.healthLatest = data.healthLatest || null;
            this.healthMonthCount = data.healthMonthCount || 0;
        }

        // 冰箱统计
        if (fridgeSummaryRes.success && fridgeSummaryRes.data) {
            this.fridgeSummary = fridgeSummaryRes.data;
        } else {
            this.fridgeSummary = data.fridgeSummary || { expiring30: 0 };
        }

        // 护肤品统计
        if (skincareSummaryRes.success && skincareSummaryRes.data) {
            this.skincareSummary = skincareSummaryRes.data;
        } else {
            this.skincareSummary = data.skincareSummary || { expiring90: 0 };
        }

        // 本月提醒
        if (monthReminderRes.success && monthReminderRes.data) {
            this.monthReminder = monthReminderRes.data.content || '';
        }

        // 渲染整个看板
        this.renderAll();

        // 检查是否显示示例数据横幅
        this.updateDemoBanner();
    },

    // 渲染全部看板内容
    renderAll() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;

        // 计算临期总览统计
        const expiryStats = this._calcExpiryStats();

        // 今日关注小标题
        const sectionTitle = `<div class="desk-section-title">今日关注</div>
            <div class="desk-section-subtitle">需要你留意的物品到期情况</div>`;
        // 临期总览数字条
        const summaryBar = this.renderExpirySummaryBar(expiryStats);
        // 第一排临期卡片
        const row1 = this.renderExpiringCards();
        // 第二排：健康快照 + 本月提醒
        const row2 = this.renderSecondRow();
        // 第三排：最新日志 + 年度提醒
        const row3 = this.renderThirdRow();
        // 底部：库存概览
        const statsRow = this.renderStatsRow();

        container.innerHTML = sectionTitle + summaryBar + row1 + row2 + row3 + statsRow;

        // 更新今日日期
        this._updateTodayDate();

        // 绑定事件
        this._bindDashboardEvents();
    },

    // 更新今日日期显示
    _updateTodayDate() {
        const dateEl = document.getElementById('dashboard-today-date');
        if (!dateEl) return;
        const now = new Date();
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const weekDay = weekDays[now.getDay()];
        dateEl.textContent = `${month}月${day}日 · ${weekDay}`;
    },

    // ===== 计算临期总览统计 =====
    _calcExpiryStats() {
        const stats = {
            expired: 0,      // 已过期
            expiring30: 0,   // 30天内
            expiring90: 0,   // 90天内
            lowStock: 0      // 库存不足
        };

        // 冰箱统计（来自 summary API）
        const fs = this.fridgeSummary || {};
        stats.expired += (fs.expired || 0);
        stats.expiring30 += (fs.expiring30 || 0);
        stats.expiring90 += (fs.expiring90 || 0);
        stats.lowStock += (fs.lowStock || 0);

        // 护肤品统计（来自 summary API）
        const ss = this.skincareSummary || {};
        // 护肤品没有 expired 单独字段，从临期列表计算已过期
        const skincareExpired = (this.expiringSkincare || []).filter(item => {
            const days = Skincare.getExpiryDays(item);
            return days !== null && days < 0;
        }).length;
        const skincare30 = (this.expiringSkincare || []).filter(item => {
            const days = Skincare.getExpiryDays(item);
            return days !== null && days >= 0 && days <= 30;
        }).length;
        stats.expired += skincareExpired;
        stats.expiring30 += skincare30;
        stats.expiring90 += (ss.expiring90 || 0);
        // 护肤品无库存不足概念，不计入

        // 生活用品统计（前端计算）
        const hhList = this.householdList || [];
        let hhExpired = 0, hh30 = 0, hh90 = 0, hhLowStock = 0;
        hhList.forEach(item => {
            const days = Household.getExpiryDays(item);
            if (days !== null) {
                if (days < 0) {
                    hhExpired++;
                    hh30++;
                    hh90++;
                } else if (days <= 30) {
                    hh30++;
                    hh90++;
                } else if (days <= 90) {
                    hh90++;
                }
            }
            // 库存不足判断
            const qty = parseFloat(item.quantity) || 0;
            const threshold = parseFloat(item.replenishThreshold) || 0;
            if (threshold > 0 && qty <= threshold) {
                hhLowStock++;
            }
        });
        stats.expired += hhExpired;
        stats.expiring30 += hh30;
        stats.expiring90 += hh90;
        stats.lowStock += hhLowStock;

        return stats;
    },

    // ===== 渲染临期总览数字条 =====
    renderExpirySummaryBar(stats) {
        return `
            <div class="expiry-summary-bar">
                <div class="expiry-summary-item expiry-summary-item--expired" data-nav="fridge" data-filter="expired">
                    <div class="expiry-summary__num">${stats.expired}</div>
                    <div class="expiry-summary__label">已过期</div>
                </div>
                <div class="expiry-summary-item expiry-summary-item--urgent" data-nav="fridge" data-filter="expiring30">
                    <div class="expiry-summary__num">${stats.expiring30}</div>
                    <div class="expiry-summary__label">30天内到期</div>
                </div>
                <div class="expiry-summary-item expiry-summary-item--warning" data-nav="skincare" data-filter="expiring90">
                    <div class="expiry-summary__num">${stats.expiring90}</div>
                    <div class="expiry-summary__label">90天内到期</div>
                </div>
                <div class="expiry-summary-item expiry-summary-item--lowstock" data-nav="fridge" data-filter="lowStock">
                    <div class="expiry-summary__num">${stats.lowStock}</div>
                    <div class="expiry-summary__label">库存不足</div>
                </div>
            </div>
        `;
    },

    // ===== 第一排：临期卡片 =====
    renderExpiringCards() {
        // 生成状态标签的辅助函数
        const getExpiryTag = (days) => {
            if (days === null) return '';
            if (days < 0) {
                return `<span class="expiry-tag expiry-tag--expired">已过期 ${Math.abs(days)} 天</span>`;
            } else if (days <= 7) {
                return `<span class="expiry-tag expiry-tag--urgent">还有 ${days} 天</span>`;
            } else if (days <= 30) {
                return `<span class="expiry-tag expiry-tag--warning">还有 ${days} 天</span>`;
            } else {
                return `<span class="expiry-tag expiry-tag--normal">还有 ${days} 天</span>`;
            }
        };

        // 30天内冰箱到期
        const fridgeItems = (this.expiringFood || []).map(item => {
            const days = Fridge.getExpiryDays(item);
            return { name: item.name, category: item.category || '', location: item.location || '', days };
        }).filter(it => it.days !== null && it.days <= 30)
          .sort((a, b) => a.days - b.days);

        const fridgeListHtml = fridgeItems.length === 0
            ? `<div class="desk-empty">30天内无临期食材</div>`
            : fridgeItems.slice(0, 3).map(it => `
                <div class="desk-exp-item" data-nav="fridge">
                    <div class="desk-exp-main">
                        <span class="desk-exp-name">${Utils.escapeHtml(it.name)}</span>
                        <span class="desk-exp-sub">${Utils.escapeHtml(it.category || it.location)}</span>
                    </div>
                    ${getExpiryTag(it.days)}
                </div>
            `).join('') + (fridgeItems.length > 3
                ? `<div class="desk-more-link" data-nav="fridge">查看全部 ${fridgeItems.length} 件 →</div>`
                : '');

        // 90天内护肤品到期
        const skincareItems = (this.expiringSkincare || []).map(item => {
            const days = Skincare.getExpiryDays(item);
            return { name: item.name, brand: item.brand || '', category: item.category || '', days };
        }).filter(it => it.days !== null && it.days <= 90)
          .sort((a, b) => a.days - b.days);

        const skincareListHtml = skincareItems.length === 0
            ? `<div class="desk-empty">90天内无临期护肤品</div>`
            : skincareItems.slice(0, 3).map(it => `
                <div class="desk-exp-item" data-nav="skincare">
                    <div class="desk-exp-main">
                        <span class="desk-exp-name">${Utils.escapeHtml(it.name)}</span>
                        <span class="desk-exp-sub">${Utils.escapeHtml(it.brand || it.category)}</span>
                    </div>
                    ${getExpiryTag(it.days)}
                </div>
            `).join('') + (skincareItems.length > 3
                ? `<div class="desk-more-link" data-nav="skincare">查看全部 ${skincareItems.length} 件 →</div>`
                : '');

        return `
            <div class="desk-row">
                <div class="desk-card">
                    <div class="desk-card-title" data-nav="fridge">
                        <div class="desk-card-title__left">
                            <svg class="desk-card-title__icon"><use href="#icon-fridge"/></svg>
                            <span>30天内冰箱到期</span>
                        </div>
                        <span class="desk-card-more">${fridgeItems.length} 件</span>
                    </div>
                    ${fridgeListHtml}
                </div>
                <div class="desk-card">
                    <div class="desk-card-title" data-nav="skincare">
                        <div class="desk-card-title__left">
                            <svg class="desk-card-title__icon"><use href="#icon-skincare"/></svg>
                            <span>90天内护肤品到期</span>
                        </div>
                        <span class="desk-card-more">${skincareItems.length} 件</span>
                    </div>
                    ${skincareListHtml}
                </div>
            </div>
        `;
    },

    // ===== 第二排：健康快照 + 本月提醒 =====
    renderSecondRow() {
        const latest = this.healthLatest;
        const date = latest ? (latest.recordDate || latest.record_date || '-') : '';
        const weight = latest ? (latest.weight || '') : '';
        const fasting = latest ? (latest.fastingGlucose || latest.fasting_glucose || '') : '';
        const postprandial = latest ? (latest.postprandialGlucose || latest.postprandial_glucose || '') : '';
        const menstrual = latest ? (latest.menstrualStatus || latest.menstrual_status || '非经期') : '';
        const weather = latest ? (latest.weather || '') : '';
        const feeling = latest ? (latest.feeling || '') : '';

        let healthItems = '';
        if (weight) healthItems += `<div class="desk-health-item"><div class="desk-health-label">体重</div><div class="desk-health-val">${weight} <span class="desk-health-unit">斤</span></div></div>`;
        if (fasting) healthItems += `<div class="desk-health-item"><div class="desk-health-label">空腹血糖</div><div class="desk-health-val">${fasting} <span class="desk-health-unit">mmol/L</span></div></div>`;
        if (postprandial) healthItems += `<div class="desk-health-item"><div class="desk-health-label">餐后2h</div><div class="desk-health-val">${postprandial} <span class="desk-health-unit">mmol/L</span></div></div>`;
        if (menstrual && menstrual !== '非经期') healthItems += `<div class="desk-health-item"><div class="desk-health-label">经期</div><div class="desk-health-val">${Utils.escapeHtml(menstrual)}</div></div>`;

        const weatherFeeling = weather || feeling
            ? `<div class="desk-health-note"><span>天气体感：</span>${Utils.escapeHtml((weather ? weather : '') + (weather && feeling ? ' · ' : '') + (feeling ? feeling : ''))}</div>`
            : '';

        const healthHtml = !latest
            ? `<div class="desk-empty">暂无健康记录</div>`
            : `<div class="desk-health-date">${date}</div>
               <div class="desk-health-grid">${healthItems}</div>
               ${weatherFeeling}`;

        return `
            <div class="desk-row">
                <div class="desk-card desk-card--secondary">
                    <div class="desk-card-title">
                        <div class="desk-card-title__left">
                            <svg class="desk-card-title__icon"><use href="#icon-heart"/></svg>
                            <span>健康快照</span>
                        </div>
                        <span class="desk-card-more desk-card-link" data-nav="health">去记录 →</span>
                    </div>
                    ${healthHtml}
                </div>
                <div class="desk-card desk-card--secondary">
                    <div class="desk-card-title">
                        <div class="desk-card-title__left">
                            <svg class="desk-card-title__icon"><use href="#icon-calendar"/></svg>
                            <span>本月提醒</span>
                        </div>
                    </div>
                    ${VoiceRecognition.getTextareaWithMic('monthReminderTextarea', '写下本月想提醒自己的事…', this.monthReminder || '', 6, 'dashboard', 'month-reminder-textarea')}
                </div>
            </div>
        `;
    },

    // ===== 第三排：最新日志 + 年度提醒 =====
    renderThirdRow() {
        const latest = this.healthLatest;
        const date = latest ? (latest.recordDate || latest.record_date || '') : '';
        const weather = latest ? (latest.weather || '') : '';
        const moodNotes = latest ? (latest.moodNotes || latest.mood_notes || '') : '';

        const logHtml = !latest || !moodNotes
            ? `<div class="desk-empty">暂无日志记录</div>`
            : `<div class="desk-log-date">${date}${weather ? ' · ' + Utils.escapeHtml(weather) : ''}</div>
               <div class="desk-log-preview">${Utils.escapeHtml(moodNotes.substring(0, 60))}${moodNotes.length > 60 ? '…' : ''}</div>`;

        const yearReminders = [
            '用完再买，不为囤货买单',
            '定期检查保质期，减少浪费',
            '身体感受认真记，比什么都准',
            '随手记，随时看，生活自然有序'
        ];

        const reminderHtml = yearReminders.map(text => `
            <div class="desk-reminder-item"><span class="desk-reminder-dot"></span>${text}</div>
        `).join('');

        return `
            <div class="desk-row">
                <div class="desk-card desk-card--secondary">
                    <div class="desk-card-title" data-nav="health">
                        <div class="desk-card-title__left">
                            <svg class="desk-card-title__icon"><use href="#icon-diary"/></svg>
                            <span>最新日志</span>
                        </div>
                        <span class="desk-card-more desk-card-link" data-nav="health">去记录 →</span>
                    </div>
                    ${logHtml}
                </div>
                <div class="desk-card desk-card--secondary">
                    <div class="desk-card-title">
                        <div class="desk-card-title__left">
                            <svg class="desk-card-title__icon"><use href="#icon-star"/></svg>
                            <span>年度提醒</span>
                        </div>
                    </div>
                    <div class="desk-reminder-list">${reminderHtml}</div>
                </div>
            </div>
        `;
    },

    // ===== 底部：库存概览统计卡片 =====
    renderStatsRow() {
        return `
            <div class="desk-stats-row">
                <div class="desk-stat-card" data-nav="skincare">
                    <div class="desk-stat-value">${this.skincareCount}</div>
                    <div class="desk-stat-label">护肤品总数</div>
                </div>
                <div class="desk-stat-card" data-nav="fridge">
                    <div class="desk-stat-value">${this.foodCount}</div>
                    <div class="desk-stat-label">冰箱食材总数</div>
                </div>
                <div class="desk-stat-card" data-nav="household">
                    <div class="desk-stat-value">${this.householdCount}</div>
                    <div class="desk-stat-label">生活用品总数</div>
                </div>
                <div class="desk-stat-card" data-nav="health">
                    <div class="desk-stat-value">${this.healthMonthCount}</div>
                    <div class="desk-stat-label">健康记录本月</div>
                </div>
            </div>
        `;
    },

    // 绑定看板内所有交互事件
    _bindDashboardEvents() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;

        // 所有带 data-nav 的元素点击跳转
        container.querySelectorAll('[data-nav]').forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const module = el.dataset.nav;
                if (module) Nav.switchModule(module);
            });
        });

        // 本月提醒 textarea 自动保存（防抖 500ms）
        const textarea = document.getElementById('monthReminderTextarea');
        if (textarea) {
            textarea.addEventListener('input', (e) => {
                const content = e.target.value;
                this.monthReminder = content;
                clearTimeout(this._monthReminderTimer);
                this._monthReminderTimer = setTimeout(() => {
                    API.saveMonthReminder(content);
                }, 500);
            });
        }
    },

    // ===== 示例数据横幅 =====
    updateDemoBanner() {
        const banner = document.getElementById('demo-seed-banner');
        if (!banner) return;

        const skincareEmpty = !Skincare.list || Skincare.list.length === 0;
        const fridgeEmpty = !Fridge.list || Fridge.list.length === 0;
        const householdEmpty = !Household.list || Household.list.length === 0;
        const healthEmpty = !this.healthLatest && this.healthMonthCount === 0;

        const allEmpty = skincareEmpty && fridgeEmpty && householdEmpty && healthEmpty;
        banner.style.display = allEmpty ? 'flex' : 'none';
    },

    async importDemoData() {
        const btn = document.getElementById('demo-seed-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '导入中...';
        }

        const res = await API.seedDemo();
        if (res.success) {
            if (res.data && res.data.seeded) {
                Toast.success('示例数据导入成功');
                await Promise.all([
                    Dashboard.loadData(),
                    Skincare.loadData(),
                    Skincare.loadSummary(),
                    Fridge.loadData(),
                    Fridge.loadSummary(),
                    Household.loadData()
                ]);
                const banner = document.getElementById('demo-seed-banner');
                if (banner) banner.style.display = 'none';
                if (typeof Onboarding !== 'undefined' && Onboarding.checkProgress) {
                    Onboarding.checkProgress();
                }
            } else {
                Toast.info(res.data?.message || '已有数据');
                const banner = document.getElementById('demo-seed-banner');
                if (banner) banner.style.display = 'none';
            }
        } else {
            Toast.error(res.message || '导入失败');
        }

        if (btn) {
            btn.disabled = false;
            btn.textContent = '导入示例';
        }
    }
};

// ===== 护肤品模块 =====
const Skincare = {
    list: [],
    currentFilter: 'all',
    selectedCategory: '',
    currentTab: 'active',
    searchQuery: '',
    summary: null,

    init() {
        // 分类筛选（自定义下拉）
        CategorySelect.renderCustomSelect(
            'skincare-filter',
            'skincare',
            'all',
            (value) => {
                this.currentFilter = value;
                this.renderList();
            },
            { showAllOption: true, allOptionLabel: '全部分类' }
        );

        // 搜索框
        const searchInput = document.getElementById('skincare-search');
        if (searchInput) {
            let searchTimer = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimer);
                const value = e.target.value.trim();
                searchTimer = setTimeout(() => {
                    this.search(value);
                }, 300);
            });
        }

        // Tab 切换
        document.querySelectorAll('.skincare-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // 新增按钮
        document.getElementById('btn-add-skincare').addEventListener('click', () => {
            this.showForm();
        });

        // 快速添加标签
        QuickTags.render(
            'skincare-quick-tags',
            QuickTags.skincare,
            (item) => this.showForm(null, item),  // 点击：打开弹窗并预填
            (item) => this.quickAdd(item)        // 长按：直接添加
        );
    },

    // 快捷添加（直接添加，不弹窗）
    async quickAdd(preset) {
        const data = {
            name: preset.name,
            category: preset.category,
            brand: '',
            price: null,
            volume: '',
            openDate: null,
            shelfLifeMonths: null,
            expiryDate: null,
            repurchase: '',
            season: '',
            skinType: '',
            notes: ''
        };

        const res = await API.addSkincare(data);
        if (res.success) {
            Toast.success('添加成功 ✓');
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '添加失败');
        }
    },

    // 计算到期天数（优先用 expiry_date，其次用 open_date + shelf_life_months）
    getExpiryDays(item) {
        if (item.expiryDate) {
            return Utils.daysFromToday(item.expiryDate);
        }
        if (!item.openDate || !item.shelfLifeMonths) return null;
        const openDate = new Date(item.openDate);
        const expiryDate = new Date(openDate);
        expiryDate.setMonth(expiryDate.getMonth() + parseInt(item.shelfLifeMonths));
        return Utils.daysFromToday(Utils.formatDate(expiryDate));
    },

    // 获取到期日期
    getExpiryDate(item) {
        if (item.expiryDate) {
            return item.expiryDate;
        }
        if (!item.openDate || !item.shelfLifeMonths) return '';
        const openDate = new Date(item.openDate);
        const expiryDate = new Date(openDate);
        expiryDate.setMonth(expiryDate.getMonth() + parseInt(item.shelfLifeMonths));
        return Utils.formatDate(expiryDate);
    },

    // 加载统计数据
    async loadSummary() {
        const res = await API.getSkincareSummary();
        if (res.success) {
            this.summary = res.data || {};
            this.renderSummary();
        } else {
            console.error('加载护肤品统计失败:', res.message);
        }
    },

    // 渲染统计卡片
    renderSummary() {
        const statsEl = document.getElementById('skincare-stats');
        if (!statsEl) return;

        const s = this.summary || {};
        const totalCount = s.totalCount || 0;
        const expiring90 = s.expiring90 || 0;
        const totalValue = s.totalValue || 0;
        const categoryCount = s.categoryCount || 0;

        statsEl.innerHTML = `
            <div class="skincare-stat-card">
                <div class="skincare-stat-num">${totalCount}</div>
                <div class="skincare-stat-label">总数</div>
            </div>
            <div class="skincare-stat-card warn">
                <div class="skincare-stat-num">${expiring90}</div>
                <div class="skincare-stat-label">90天临期</div>
            </div>
            <div class="skincare-stat-card">
                <div class="skincare-stat-num">¥${totalValue.toFixed(0)}</div>
                <div class="skincare-stat-label">总价值</div>
            </div>
            <div class="skincare-stat-card">
                <div class="skincare-stat-num">${categoryCount}</div>
                <div class="skincare-stat-label">分类数</div>
            </div>
        `;
    },

    // 切换 Tab
    switchTab(tab) {
        this.currentTab = tab;
        this.searchQuery = '';
        const searchInput = document.getElementById('skincare-search');
        if (searchInput) searchInput.value = '';

        // 更新 Tab 样式
        document.querySelectorAll('.skincare-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        this.loadData();
    },

    // 搜索
    search(value) {
        this.searchQuery = value;
        this.loadData();
    },

    async loadData() {
        const params = {};
        if (this.currentTab === 'archive') {
            params.archived = true;
        } else {
            params.archived = false;
        }
        if (this.searchQuery) {
            params.search = this.searchQuery;
        }

        const res = await API.getSkincare(params);
        if (res.success) {
            this.list = res.data || [];
            this.renderList();
            if (typeof Onboarding !== 'undefined') Onboarding.checkProgress();
        } else {
            console.error('加载护肤品数据失败:', res.message);
            Toast.error('加载失败');
        }
    },

    renderList() {
        const listEl = document.getElementById('skincare-list');
        let filtered = this.list;

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(item => item.category === this.currentFilter);
        }

        // 按到期时间排序
        filtered = [...filtered].sort((a, b) => {
            const daysA = this.getExpiryDays(a);
            const daysB = this.getExpiryDays(b);
            if (daysA === null && daysB === null) return 0;
            if (daysA === null) return 1;
            if (daysB === null) return -1;
            return daysA - daysB;
        });

        if (filtered.length === 0) {
            const emptyText = this.currentTab === 'archive' ? '暂无归档记录' : '化妆台空空如也 🧴';
            const emptySub = this.currentTab === 'archive' ? '归档的护肤品会在这里显示' : '帮你记录每一件护肤品';
            listEl.innerHTML = `
                <div class="empty-tip">
                    <div class="empty-tip__icon empty-tip__icon--skincare">
                        <svg><use href="#icon-skincare"/></svg>
                    </div>
                    <p class="empty-tip__text">${emptyText}</p>
                    <p class="empty-tip__sub">${emptySub}</p>
                </div>`;
            return;
        }

        listEl.innerHTML = filtered.map(item => {
            const days = this.getExpiryDays(item);
            let expiryClass = 'normal';
            let expiryText = '未开封';
            let cardClass = '';

            if (days !== null) {
                const expiryDate = this.getExpiryDate(item);
                if (days < 0) {
                    expiryClass = 'danger';
                    expiryText = `已过期${Math.abs(days)}天`;
                    cardClass = 'expired';
                } else if (days < 7) {
                    expiryClass = 'danger';
                    expiryText = `剩${days}天 · ${expiryDate}`;
                    cardClass = 'expired';
                } else if (days < 30) {
                    expiryClass = 'warning';
                    expiryText = `剩${days}天 · ${expiryDate}`;
                    cardClass = 'expiring-soon';
                } else {
                    expiryText = `剩${days}天 · ${expiryDate}`;
                }
            }

            // 分类图标和渐变色
            const categoryIcons = {
                '洁面': { emoji: '🧼', gradient: 'var(--gradient-blue)' },
                '水': { emoji: '💧', gradient: 'var(--gradient-ocean)' },
                '精华': { emoji: '✨', gradient: 'var(--gradient-pink)' },
                '乳液': { emoji: '🥛', gradient: 'var(--gradient-green)' },
                '面霜': { emoji: '🧴', gradient: 'var(--gradient-warm)' },
                '眼霜': { emoji: '👁️', gradient: 'var(--gradient-sunset)' },
                '防晒': { emoji: '☀️', gradient: 'var(--gradient-orange)' },
                '面膜': { emoji: '🎭', gradient: 'var(--gradient-forest)' },
                '其他': { emoji: '📦', gradient: 'var(--gradient-primary)' }
            };
            const catInfo = categoryIcons[item.category] || categoryIcons['其他'];

            // 解析剩余余量百分比
            let remainingPercent = null;
            if (item.remainingAmount) {
                const match = String(item.remainingAmount).match(/(\d+)/);
                if (match) {
                    remainingPercent = parseInt(match[1]);
                    if (remainingPercent < 0) remainingPercent = 0;
                    if (remainingPercent > 100) remainingPercent = 100;
                }
            }

            // 开封状态
            const openIconSvg = item.openDate
                ? '<svg class="item-meta-icon"><use href="#icon-open"/></svg>'
                : '<svg class="item-meta-icon"><use href="#icon-package"/></svg>';
            const openText = item.openDate ? '已开封' : '未开封';

            // 价格和容量显示
            const priceDisplay = item.price ? `¥${item.price}` : '';
            const volumeDisplay = item.volume || '';
            const metaDisplay = [priceDisplay, volumeDisplay].filter(Boolean).join(' · ');

            // 操作按钮（在库 vs 归档）
            let actionButtons = '';
            if (this.currentTab === 'archive') {
                actionButtons = `
                    <button class="btn btn-secondary btn-sm" onclick="Skincare.toggleArchive('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-check"/></svg>恢复
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="Skincare.confirmDelete('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-delete"/></svg>删除
                    </button>
                `;
            } else {
                actionButtons = `
                    <button class="btn btn-secondary btn-sm" onclick="Skincare.showForm('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-edit"/></svg>编辑
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="Skincare.toggleArchive('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-list"/></svg>归档
                    </button>
                `;
            }

            return `
                <div class="item-card item-card--skincare ${cardClass}">
                    <div class="item-card-header">
                        <div class="item-icon-circle" style="background: ${catInfo.gradient};">
                            <span class="item-icon-emoji">${catInfo.emoji}</span>
                        </div>
                        <div class="item-card-title">
                            <div class="item-header">
                                <div class="item-name">${Utils.escapeHtml(item.name)}</div>
                                <span class="item-category">${Utils.escapeHtml(item.category)}</span>
                            </div>
                            <div class="item-brand">
                                <svg class="item-brand-icon"><use href="#icon-tag"/></svg>
                                <span>${Utils.escapeHtml(item.brand || '无品牌')}</span>
                            </div>
                        </div>
                    </div>
                    ${remainingPercent !== null ? `
                    <div class="item-progress">
                        <div class="item-progress-label">
                            <span>剩余余量</span>
                            <span>${remainingPercent}%</span>
                        </div>
                        <div class="item-progress-bar">
                            <div class="item-progress-fill" style="width: ${remainingPercent}%;"></div>
                        </div>
                    </div>
                    ` : ''}
                    <div class="item-meta-row">
                        <div class="item-meta">
                            ${openIconSvg}
                            <span>${openText}</span>
                        </div>
                        <span class="item-expiry ${expiryClass}">${expiryText}</span>
                    </div>
                    ${metaDisplay ? `<div class="item-meta-row">
                        <div class="item-meta">
                            <svg class="item-meta-icon"><use href="#icon-dollar"/></svg>
                            <span>${metaDisplay}</span>
                        </div>
                    </div>` : ''}
                    ${item.notes ? `<div class="item-notes">${Utils.escapeHtml(item.notes)}</div>` : ''}
                    <div class="item-actions">
                        ${actionButtons}
                    </div>
                </div>
            `;
        }).join('');
    },

    showForm(id = null, preset = null) {
        const item = id ? this.list.find(i => i.id === id) : null;
        const title = item ? '编辑护肤品' : '新增护肤品';

        // 预填数据：优先编辑数据，其次是快捷预设
        const formData = item || preset || {};
        this._formCategory = formData.category || '洁面';

        const nameInput = VoiceRecognition.getInputWithMic(
            'sc-name',
            '护肤品名称',
            formData.name || '',
            'skincare',
            true
        );

        const escapedBrand = Utils.escapeHtml(formData.brand || '');
        const escapedNotes = Utils.escapeHtml(formData.notes || '');
        const escapedVolume = Utils.escapeHtml(formData.volume || '');
        const priceValue = formData.price || '';
        const expiryDateValue = formData.expiryDate || '';
        const repurchaseValue = formData.repurchase || '';
        const seasonValue = formData.season || '';
        const skinTypeValue = formData.skinType || '';

        const repurchaseOptions = ['强烈推荐', '可以考虑', '一般般', '不会回购'];
        const repurchaseOptionsHtml = repurchaseOptions.map(opt =>
            `<option value="${opt}" ${repurchaseValue === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');

        const seasonOptions = ['全年', '春季', '夏季', '秋季', '冬季'];
        const seasonOptionsHtml = seasonOptions.map(opt =>
            `<option value="${opt}" ${seasonValue === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');

        const skinTypeOptions = ['所有肤质', '干性', '油性', '混合性', '敏感性', '中性'];
        const skinTypeOptionsHtml = skinTypeOptions.map(opt =>
            `<option value="${opt}" ${skinTypeValue === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');

        const content = `
            <form id="skincare-form">
                <div class="form-group">
                    <label>名称 *</label>
                    ${nameInput}
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>分类 *</label>
                        <div id="sc-category-container" class="form-category-container"></div>
                    </div>
                    <div class="form-group">
                        <label>品牌</label>
                        <input type="text" id="sc-brand" value="${escapedBrand}" placeholder="品牌">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>价格</label>
                        <input type="number" id="sc-price" value="${priceValue}" placeholder="价格（元）" min="0" step="0.01">
                    </div>
                    <div class="form-group">
                        <label>容量</label>
                        <input type="text" id="sc-volume" value="${escapedVolume}" placeholder="如：50ml、100g">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>开封日期</label>
                        <input type="date" id="sc-open-date" value="${formData.openDate || ''}">
                    </div>
                    <div class="form-group">
                        <label>开封后保质期（月）</label>
                        <input type="number" id="sc-shelf-life" value="${formData.shelfLifeMonths || ''}" placeholder="如：6、12" min="1" max="120">
                    </div>
                </div>
                <div class="form-group">
                    <label>保质期至</label>
                    <input type="date" id="sc-expiry-date" value="${expiryDateValue}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>适用季节</label>
                        <select id="sc-season">
                            ${seasonOptionsHtml}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>适用肤质</label>
                        <select id="sc-skin-type">
                            ${skinTypeOptionsHtml}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>回购意愿</label>
                    <select id="sc-repurchase">
                        <option value="">请选择</option>
                        ${repurchaseOptionsHtml}
                    </select>
                </div>
                <div class="form-group">
                    <label>使用感受</label>
                    ${VoiceRecognition.getTextareaWithMic('sc-note', '使用感受、购买渠道等', escapedNotes, 4, 'skincare')}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Modal.close()">取消</button>
                    <button type="submit" class="btn btn-primary" id="modal-confirm-btn">${item ? '保存' : '添加'}</button>
                </div>
            </form>
        `;

        Modal.open(title, content);

        // 渲染分类自定义下拉
        CategorySelect.renderCustomSelect(
            'sc-category-container',
            'skincare',
            this._formCategory,
            (value) => {
                this._formCategory = value;
            }
        );

        // 自动聚焦名称输入框
        setTimeout(() => {
            const nameInput = document.getElementById('sc-name');
            if (nameInput) nameInput.focus();
        }, 100);

        document.getElementById('skincare-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveItem(id);
        });
    },

    async saveItem(id) {
        const name = document.getElementById('sc-name').value.trim();
        const category = this._formCategory;
        const brand = document.getElementById('sc-brand').value.trim();
        const price = document.getElementById('sc-price').value;
        const volume = document.getElementById('sc-volume').value.trim();
        const openDate = document.getElementById('sc-open-date').value;
        const shelfLifeMonths = document.getElementById('sc-shelf-life').value;
        const expiryDate = document.getElementById('sc-expiry-date').value;
        const season = document.getElementById('sc-season').value;
        const skinType = document.getElementById('sc-skin-type').value;
        const repurchase = document.getElementById('sc-repurchase').value;
        const notes = document.getElementById('sc-note').value.trim();

        if (!name || !category) {
            Toast.error('请填写必填项');
            return;
        }

        const data = {
            name,
            category,
            brand,
            price: price ? parseFloat(price) : null,
            volume,
            openDate: openDate || null,
            shelfLifeMonths: shelfLifeMonths ? parseInt(shelfLifeMonths) : null,
            expiryDate: expiryDate || null,
            season,
            skinType,
            repurchase,
            notes
        };

        let res;
        if (id) {
            res = await API.updateSkincare(id, data);
        } else {
            res = await API.addSkincare(data);
        }

        if (res.success) {
            Toast.success(id ? '更新成功' : '添加成功 ✓');
            Modal.close();
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '保存失败');
            console.error(res.message);
        }
    },

    confirmDelete(id) {
        const item = this.list.find(i => i.id === id);
        if (!item) return;

        const content = `
            <p>确定要删除「${Utils.escapeHtml(item.name)}」吗？</p>
            <p style="color:var(--text-secondary);font-size:13px;margin-top:8px;">删除后无法恢复</p>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="Modal.close()">取消</button>
                <button class="btn btn-danger" onclick="Skincare.doDelete('${id}')">确认删除</button>
            </div>
        `;
        Modal.open('删除护肤品', content);
    },

    // 归档/取消归档
    async toggleArchive(id) {
        const item = this.list.find(i => i.id === id);
        if (!item) return;

        const isArchived = this.currentTab === 'archive';
        const res = await API.updateSkincare(id, { archived: !isArchived });

        if (res.success) {
            Toast.success(isArchived ? '已恢复' : '已归档');
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '操作失败');
        }
    },

    async doDelete(id) {
        const res = await API.deleteSkincare(id);
        if (res.success) {
            Toast.success('删除成功');
            Modal.close();
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '删除失败');
            console.error(res.message);
        }
    }
};

// ===== 冰箱食材模块 =====
const Fridge = {
    list: [],
    currentCategoryFilter: 'all',
    currentLocationFilter: 'all',
    _formCategory: '',
    currentTab: 'active',
    searchQuery: '',
    summary: null,

    init() {
        // 分类筛选（自定义下拉）
        CategorySelect.renderCustomSelect(
            'fridge-category-filter',
            'food',
            'all',
            (value) => {
                this.currentCategoryFilter = value;
                this.renderList();
            },
            { showAllOption: true, allOptionLabel: '全部分类' }
        );

        // 位置筛选
        document.getElementById('fridge-filter').addEventListener('change', (e) => {
            this.currentLocationFilter = e.target.value;
            this.renderList();
        });

        // 搜索框
        const searchInput = document.getElementById('fridge-search');
        if (searchInput) {
            let searchTimer = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimer);
                const value = e.target.value.trim();
                searchTimer = setTimeout(() => {
                    this.search(value);
                }, 300);
            });
        }

        // Tab 切换
        document.querySelectorAll('.fridge-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // 新增按钮
        document.getElementById('btn-add-fridge').addEventListener('click', () => {
            this.showForm();
        });

        // 快速添加标签
        QuickTags.render(
            'fridge-quick-tags',
            QuickTags.fridge,
            (item) => this.showForm(null, item),  // 点击：打开弹窗并预填
            (item) => this.quickAdd(item)        // 长按：直接添加
        );
    },

    // 快捷添加（直接添加，不弹窗）
    async quickAdd(preset) {
        const data = {
            name: preset.name,
            category: preset.category || '其他',
            location: preset.location || '冷藏',
            quantity: preset.quantity || 1,
            unit: preset.unit || '份',
            purchaseDate: Utils.today(),
            expiryDate: null,
            replenishThreshold: null,
            notes: ''
        };

        const res = await API.addFridge(data);
        if (res.success) {
            Toast.success('添加成功 ✓');
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '添加失败');
        }
    },

    // 计算过期天数
    getExpiryDays(item) {
        if (!item.expiryDate) return null;
        return Utils.daysFromToday(item.expiryDate);
    },

    // 判断是否库存不足
    isLowStock(item) {
        if (!item.replenishThreshold || item.replenishThreshold <= 0) return false;
        const qty = parseFloat(item.quantity) || 0;
        return qty <= item.replenishThreshold;
    },

    // 加载统计数据
    async loadSummary() {
        const res = await API.getFridgeSummary();
        if (res.success) {
            this.summary = res.data || {};
            this.renderSummary();
        } else {
            console.error('加载冰箱统计失败:', res.message);
        }
    },

    // 渲染统计卡片
    renderSummary() {
        const statsEl = document.getElementById('fridge-stats');
        if (!statsEl) return;

        const s = this.summary || {};
        const expired = s.expired || 0;
        const expiring30 = s.expiring30 || 0;
        const warning90 = s.expiring90 || 0;
        const lowStock = s.lowStock || 0;

        statsEl.innerHTML = `
            <div class="fridge-stat-card danger">
                <div class="fridge-stat-value">${expired}</div>
                <div class="fridge-stat-label">已过期</div>
            </div>
            <div class="fridge-stat-card warn">
                <div class="fridge-stat-value">${expiring30}</div>
                <div class="fridge-stat-label">30天临期</div>
            </div>
            <div class="fridge-stat-card">
                <div class="fridge-stat-value">${warning90}</div>
                <div class="fridge-stat-label">90天预警</div>
            </div>
            <div class="fridge-stat-card">
                <div class="fridge-stat-value">${lowStock}</div>
                <div class="fridge-stat-label">库存不足</div>
            </div>
        `;
    },

    // 切换 Tab
    switchTab(tab) {
        this.currentTab = tab;
        this.searchQuery = '';
        const searchInput = document.getElementById('fridge-search');
        if (searchInput) searchInput.value = '';

        // 更新 Tab 样式
        document.querySelectorAll('.fridge-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        this.loadData();
    },

    // 搜索
    search(value) {
        this.searchQuery = value;
        this.loadData();
    },

    async loadData() {
        const params = {};
        if (this.currentTab === 'archive') {
            params.archived = true;
        } else {
            params.archived = false;
        }
        if (this.searchQuery) {
            params.search = this.searchQuery;
        }

        const res = await API.getFridge(params);
        if (res.success) {
            this.list = res.data || [];
            this.renderList();
            if (typeof Onboarding !== 'undefined') Onboarding.checkProgress();
        } else {
            console.error('加载食材数据失败:', res.message);
            Toast.error('加载失败');
        }
    },

    renderList() {
        const listEl = document.getElementById('fridge-list');
        let filtered = this.list;

        if (this.currentCategoryFilter !== 'all') {
            filtered = filtered.filter(item => item.category === this.currentCategoryFilter);
        }

        if (this.currentLocationFilter !== 'all') {
            filtered = filtered.filter(item => item.location === this.currentLocationFilter);
        }

        // 按过期时间排序
        filtered = [...filtered].sort((a, b) => {
            const daysA = this.getExpiryDays(a);
            const daysB = this.getExpiryDays(b);
            if (daysA === null && daysB === null) return 0;
            if (daysA === null) return 1;
            if (daysB === null) return -1;
            return daysA - daysB;
        });

        if (filtered.length === 0) {
            const emptyText = this.currentTab === 'archive' ? '暂无归档记录' : '冰箱有点空哦 🥕';
            const emptySub = this.currentTab === 'archive' ? '归档的食材会在这里显示' : '帮你管好冰箱，减少浪费';
            listEl.innerHTML = `
                <div class="empty-tip">
                    <div class="empty-tip__icon empty-tip__icon--fridge">
                        <svg><use href="#icon-fridge"/></svg>
                    </div>
                    <p class="empty-tip__text">${emptyText}</p>
                    <p class="empty-tip__sub">${emptySub}</p>
                </div>`;
            return;
        }

        listEl.innerHTML = filtered.map(item => {
            const days = this.getExpiryDays(item);
            let expiryClass = 'normal';
            let expiryText = '无保质期';
            let cardClass = '';

            if (days !== null) {
                if (days < 0) {
                    expiryClass = 'danger';
                    expiryText = `已过期${Math.abs(days)}天`;
                    cardClass = 'expired';
                } else if (days < 7) {
                    expiryClass = 'warning';
                    expiryText = `剩${days}天 · ${item.expiryDate}`;
                    cardClass = 'expiring-soon';
                } else {
                    expiryText = `剩${days}天 · ${item.expiryDate}`;
                }
            }

            // 库存不足标记
            const lowStock = this.isLowStock(item);
            const lowStockTag = lowStock
                ? `<span class="low-stock-tag">库存不足</span>`
                : '';

            // 存放位置图标和渐变色
            const locationIcons = {
                '冷藏': { emoji: '🍎', gradient: 'var(--gradient-green)', icon: '❄️' },
                '冷冻': { emoji: '🧊', gradient: 'var(--gradient-blue)', icon: '🧊' },
                '保鲜': { emoji: '🥬', gradient: 'var(--gradient-forest)', icon: '🥬' },
                '门架': { emoji: '🥛', gradient: 'var(--gradient-warm)', icon: '🚪' },
                '橱柜': { emoji: '🥫', gradient: 'var(--gradient-orange)', icon: '🗄️' },
                '其他': { emoji: '📦', gradient: 'var(--gradient-primary)', icon: '📦' }
            };
            const locInfo = locationIcons[item.location] || locationIcons['其他'];

            // 数量显示
            const qtyDisplay = item.quantity !== undefined && item.quantity !== null
                ? `${item.quantity}${item.unit || ''}`
                : '1份';

            // 操作按钮（在库 vs 归档）
            let actionButtons = '';
            if (this.currentTab === 'archive') {
                actionButtons = `
                    <button class="btn btn-secondary btn-sm" onclick="Fridge.toggleArchive('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-check"/></svg>恢复
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="Fridge.confirmDelete('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-delete"/></svg>删除
                    </button>
                `;
            } else {
                const processedBtn = (days !== null && days < 0)
                    ? `<button class="btn btn-secondary btn-sm" onclick="Fridge.markProcessed('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-check"/></svg>已处理
                       </button>`
                    : '';
                actionButtons = `
                    <button class="btn btn-secondary btn-sm" onclick="Fridge.showForm('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-edit"/></svg>编辑
                    </button>
                    ${processedBtn}
                    <button class="btn btn-secondary btn-sm" onclick="Fridge.toggleArchive('${item.id}')">
                        <svg class="btn__icon"><use href="#icon-list"/></svg>归档
                    </button>
                `;
            }

            return `
                <div class="item-card item-card--fridge ${cardClass}">
                    <div class="item-card-header">
                        <div class="item-icon-circle" style="background: ${locInfo.gradient};">
                            <span class="item-icon-emoji">${locInfo.emoji}</span>
                        </div>
                        <div class="item-card-title">
                            <div class="item-header">
                                <div class="item-name">${Utils.escapeHtml(item.name)} ${lowStockTag}</div>
                                <span class="item-category">${locInfo.icon} ${Utils.escapeHtml(item.location)}</span>
                            </div>
                            <div class="item-quantity">
                                <svg class="item-brand-icon"><use href="#icon-package"/></svg>
                                <span>${Utils.escapeHtml(qtyDisplay)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="item-meta-row">
                        <div class="item-meta">
                            <svg class="item-meta-icon"><use href="#icon-calendar"/></svg>
                            <span>购入：${item.purchaseDate || '未知'}</span>
                        </div>
                        <span class="item-expiry ${expiryClass}">${expiryText}</span>
                    </div>
                    ${item.notes ? `<div class="item-notes">${Utils.escapeHtml(item.notes)}</div>` : ''}
                    <div class="item-actions">
                        ${actionButtons}
                    </div>
                </div>
            `;
        }).join('');
    },

    showForm(id = null, preset = null) {
        const item = id ? this.list.find(i => i.id === id) : null;
        const title = item ? '编辑食材' : '新增食材';

        // 预填数据：优先编辑数据，其次是快捷预设
        const formData = item || preset || {};
        this._formCategory = formData.category || '蔬菜';

        const locations = ['冷藏', '冷冻', '保鲜', '门架'];
        const locationOptions = locations.map(l => 
            `<option value="${l}" ${formData.location === l ? 'selected' : ''}>${l}</option>`
        ).join('');

        const nameInput = VoiceRecognition.getInputWithMic(
            'fr-name',
            '食材名称',
            formData.name || '',
            'fridge',
            true
        );

        // 处理数量和单位（兼容旧数据）
        let quantityValue = '';
        let unitValue = '';
        if (formData.quantity !== undefined && formData.quantity !== null) {
            if (typeof formData.quantity === 'number') {
                quantityValue = formData.quantity;
                unitValue = formData.unit || '';
            } else {
                // 旧数据：字符串格式，尝试解析
                const str = String(formData.quantity);
                const numMatch = str.match(/^([\d.]+)/);
                if (numMatch) {
                    quantityValue = numMatch[1];
                    unitValue = str.slice(numMatch[1].length);
                } else {
                    quantityValue = '';
                    unitValue = str;
                }
            }
        }

        const escapedUnit = Utils.escapeHtml(unitValue);
        const escapedNotes = Utils.escapeHtml(formData.notes || '');
        const thresholdValue = formData.replenishThreshold || '';

        const content = `
            <form id="fridge-form">
                <div class="form-group">
                    <label>名称 *</label>
                    ${nameInput}
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>分类 *</label>
                        <div id="fr-category-container" class="form-category-container"></div>
                    </div>
                    <div class="form-group">
                        <label>存放位置 *</label>
                        <select id="fr-location" required>
                            ${locationOptions}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>数量</label>
                        <input type="number" id="fr-quantity" value="${quantityValue}" placeholder="数量" min="0" step="0.1">
                    </div>
                    <div class="form-group">
                        <label>单位</label>
                        <input type="text" id="fr-unit" value="${escapedUnit}" placeholder="如：份、个、斤">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>购入日期</label>
                        <input type="date" id="fr-purchase-date" value="${formData.purchaseDate || Utils.today()}">
                    </div>
                    <div class="form-group">
                        <label>补货阈值</label>
                        <input type="number" id="fr-threshold" value="${thresholdValue}" placeholder="低于此值提醒" min="0" step="0.1">
                    </div>
                </div>
                <div class="form-group">
                    <label>保质期至</label>
                    <input type="date" id="fr-expiry-date" value="${formData.expiryDate || ''}">
                </div>
                <div class="form-group">
                    <label>备注</label>
                    ${VoiceRecognition.getTextareaWithMic('fr-note', '用途、处理方式等', escapedNotes, 3, 'fridge')}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Modal.close()">取消</button>
                    <button type="submit" class="btn btn-primary" id="modal-confirm-btn">${item ? '保存' : '添加'}</button>
                </div>
            </form>
        `;

        Modal.open(title, content);

        // 渲染分类自定义下拉
        CategorySelect.renderCustomSelect(
            'fr-category-container',
            'food',
            this._formCategory,
            (value) => {
                this._formCategory = value;
            }
        );

        // 自动聚焦名称输入框
        setTimeout(() => {
            const nameInput = document.getElementById('fr-name');
            if (nameInput) nameInput.focus();
        }, 100);

        document.getElementById('fridge-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveItem(id);
        });
    },

    async saveItem(id) {
        const name = document.getElementById('fr-name').value.trim();
        const category = this._formCategory;
        const location = document.getElementById('fr-location').value;
        const quantity = document.getElementById('fr-quantity').value;
        const unit = document.getElementById('fr-unit').value.trim();
        const purchaseDate = document.getElementById('fr-purchase-date').value;
        const expiryDate = document.getElementById('fr-expiry-date').value;
        const threshold = document.getElementById('fr-threshold').value;
        const notes = document.getElementById('fr-note').value.trim();

        if (!name || !category || !location) {
            Toast.error('请填写必填项');
            return;
        }

        const data = {
            name,
            category,
            location,
            quantity: quantity ? parseFloat(quantity) : 1,
            unit: unit || '份',
            purchaseDate: purchaseDate || null,
            expiryDate: expiryDate || null,
            replenishThreshold: threshold ? parseFloat(threshold) : null,
            notes
        };

        let res;
        if (id) {
            res = await API.updateFridge(id, data);
        } else {
            res = await API.addFridge(data);
        }

        if (res.success) {
            Toast.success(id ? '更新成功' : '添加成功 ✓');
            Modal.close();
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '保存失败');
            console.error(res.message);
        }
    },

    // 归档/取消归档
    async toggleArchive(id) {
        const item = this.list.find(i => i.id === id);
        if (!item) return;

        const isArchived = this.currentTab === 'archive';
        const res = await API.updateFridge(id, { archived: !isArchived });

        if (res.success) {
            Toast.success(isArchived ? '已恢复' : '已归档');
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '操作失败');
        }
    },

    // 标记为已处理（过期/临期项）
    async markProcessed(id) {
        const res = await API.updateFridge(id, { archived: true, processed: true });
        if (res.success) {
            Toast.success('已标记为处理');
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '操作失败');
        }
    },

    confirmDelete(id) {
        const item = this.list.find(i => i.id === id);
        if (!item) return;

        const content = `
            <p>确定要删除「${Utils.escapeHtml(item.name)}」吗？</p>
            <p style="color:var(--text-secondary);font-size:13px;margin-top:8px;">删除后无法恢复</p>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="Modal.close()">取消</button>
                <button class="btn btn-danger" onclick="Fridge.doDelete('${id}')">确认删除</button>
            </div>
        `;
        Modal.open('删除食材', content);
    },

    async doDelete(id) {
        const res = await API.deleteFridge(id);
        if (res.success) {
            Toast.success('删除成功');
            Modal.close();
            this.loadData();
            this.loadSummary();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '删除失败');
            console.error(res.message);
        }
    }
};

// ===== 生活用品模块 =====
const Household = {
    list: [],
    currentCategoryFilter: 'all',
    currentLocationFilter: 'all',
    _formCategory: '',

    init() {
        // 分类筛选（自定义下拉）
        CategorySelect.renderCustomSelect(
            'household-category-filter',
            'household',
            'all',
            (value) => {
                this.currentCategoryFilter = value;
                this.renderList();
            },
            { showAllOption: true, allOptionLabel: '全部分类' }
        );

        // 位置筛选
        document.getElementById('household-location-filter').addEventListener('change', (e) => {
            this.currentLocationFilter = e.target.value;
            this.renderList();
        });

        // 新增按钮
        document.getElementById('btn-add-household').addEventListener('click', () => {
            this.showForm();
        });

        // 快速添加标签
        QuickTags.render(
            'household-quick-tags',
            QuickTags.household,
            (item) => this.showForm(null, item),  // 点击：打开弹窗并预填
            (item) => this.quickAdd(item)        // 长按：直接添加
        );
    },

    // 快捷添加（直接添加，不弹窗）
    async quickAdd(preset) {
        const data = {
            name: preset.name,
            category: preset.category,
            storageLocation: preset.storageLocation || '储物柜',
            quantity: preset.quantity || 1,
            unit: preset.unit || '个',
            purchaseDate: Utils.today(),
            expiryDate: null,
            price: null,
            notes: ''
        };

        const res = await API.addHousehold(data);
        if (res.success) {
            Toast.success('添加成功 ✓');
            this.loadData();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '添加失败');
        }
    },

    // 计算过期天数
    getExpiryDays(item) {
        if (!item.expiryDate) return null;
        return Utils.daysFromToday(item.expiryDate);
    },

    async loadData() {
        const res = await API.getHousehold();
        if (res.success) {
            this.list = res.data || [];
            this.renderList();
            if (typeof Onboarding !== 'undefined') Onboarding.checkProgress();
        } else {
            console.error('加载生活用品数据失败:', res.message);
            Toast.error('加载失败');
        }
    },

    renderList() {
        const listEl = document.getElementById('household-list');
        let filtered = this.list;

        if (this.currentCategoryFilter !== 'all') {
            filtered = filtered.filter(item => item.category === this.currentCategoryFilter);
        }

        if (this.currentLocationFilter !== 'all') {
            filtered = filtered.filter(item => item.storageLocation === this.currentLocationFilter);
        }

        // 按过期时间排序
        filtered = [...filtered].sort((a, b) => {
            const daysA = this.getExpiryDays(a);
            const daysB = this.getExpiryDays(b);
            if (daysA === null && daysB === null) return 0;
            if (daysA === null) return 1;
            if (daysB === null) return -1;
            return daysA - daysB;
        });

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div class="empty-tip">
                    <div class="empty-tip__icon empty-tip__icon--household">
                        <svg><use href="#icon-house"/></svg>
                    </div>
                    <p class="empty-tip__text">储物柜空空如也 🏠</p>
                    <p class="empty-tip__sub">帮你管理家中日用品库存</p>
                </div>`;
            return;
        }

        // 分类图标和渐变色
        const categoryIcons = {
            '个护清洁': { emoji: '🧴', gradient: 'var(--gradient-pink)' },
            '纸品湿巾': { emoji: '🧻', gradient: 'var(--gradient-sky)' },
            '衣物清洁': { emoji: '🧺', gradient: 'var(--gradient-blue)' },
            '家居清洁': { emoji: '🧹', gradient: 'var(--gradient-green)' },
            '数码配件': { emoji: '🔌', gradient: 'var(--gradient-forest)' },
            '其他': { emoji: '📦', gradient: 'var(--gradient-primary)' }
        };

        listEl.innerHTML = filtered.map(item => {
            const days = this.getExpiryDays(item);
            let expiryClass = 'normal';
            let expiryText = '无保质期';
            let cardClass = '';

            if (days !== null) {
                if (days < 0) {
                    expiryClass = 'danger';
                    expiryText = `已过期${Math.abs(days)}天`;
                    cardClass = 'expired';
                } else if (days < 7) {
                    expiryClass = 'warning';
                    expiryText = `剩${days}天 · ${item.expiryDate}`;
                    cardClass = 'expiring-soon';
                } else if (days < 30) {
                    expiryClass = 'warning';
                    expiryText = `剩${days}天 · ${item.expiryDate}`;
                    cardClass = 'expiring-soon';
                } else {
                    expiryText = `剩${days}天 · ${item.expiryDate}`;
                }
            }

            const catInfo = categoryIcons[item.category] || categoryIcons['其他'];
            const quantityText = item.quantity ? `${item.quantity}${item.unit || ''}` : '1件';
            const priceText = item.price ? `¥${(item.price * (item.quantity || 1)).toFixed(2)}` : '';

            return `
                <div class="item-card item-card--household ${cardClass}">
                    <div class="item-card-header">
                        <div class="item-icon-circle" style="background: ${catInfo.gradient};">
                            <span class="item-icon-emoji">${catInfo.emoji}</span>
                        </div>
                        <div class="item-card-title">
                            <div class="item-header">
                                <div class="item-name">${Utils.escapeHtml(item.name)}</div>
                                <span class="item-category">${Utils.escapeHtml(item.category)}</span>
                            </div>
                            <div class="item-quantity">
                                <svg class="item-brand-icon"><use href="#icon-package"/></svg>
                                <span>${quantityText}</span>
                            </div>
                        </div>
                    </div>
                    <div class="item-meta-row">
                        <div class="item-meta">
                            <svg class="item-meta-icon"><use href="#icon-pin"/></svg>
                            <span>${Utils.escapeHtml(item.storageLocation || '未指定')}</span>
                        </div>
                        <span class="item-expiry ${expiryClass}">${expiryText}</span>
                    </div>
                    <div class="item-meta-row">
                        <div class="item-meta">
                            <svg class="item-meta-icon"><use href="#icon-calendar"/></svg>
                            <span>购入：${item.purchaseDate || '未知'}</span>
                        </div>
                        ${priceText ? `<span class="item-price">${priceText}</span>` : ''}
                    </div>
                    ${item.notes ? `<div class="item-notes">${Utils.escapeHtml(item.notes)}</div>` : ''}
                    <div class="item-actions">
                        <button class="btn btn-secondary btn-sm" onclick="Household.showForm('${item.id}')">
                            <svg class="btn__icon"><use href="#icon-edit"/></svg>编辑
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="Household.confirmDelete('${item.id}')">
                            <svg class="btn__icon"><use href="#icon-delete"/></svg>删除
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    showForm(id = null, preset = null) {
        const item = id ? this.list.find(i => i.id === id) : null;
        const title = item ? '编辑生活用品' : '新增生活用品';

        // 预填数据：优先编辑数据，其次是快捷预设
        const formData = item || preset || {};
        this._formCategory = formData.category || '个护清洁';

        const locations = ['卫生间', '厨房', '阳台', '储物柜', '其他'];
        const locationOptions = locations.map(l => 
            `<option value="${l}" ${formData.storageLocation === l ? 'selected' : ''}>${l}</option>`
        ).join('');

        const nameInput = VoiceRecognition.getInputWithMic(
            'hh-name',
            '生活用品名称',
            formData.name || '',
            'household',
            true
        );

        const quantityStepper = VoiceRecognition.getQuantityStepper(
            'hh-quantity',
            formData.quantity || '',
            0,
            1
        );

        const escapedUnit = Utils.escapeHtml(formData.unit || '');
        const escapedNotes = Utils.escapeHtml(formData.notes || '');

        const content = `
            <form id="household-form">
                <div class="form-group">
                    <label>名称 *</label>
                    ${nameInput}
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>分类 *</label>
                        <div id="hh-category-container" class="form-category-container"></div>
                    </div>
                    <div class="form-group">
                        <label>存放位置</label>
                        <select id="hh-location">
                            ${locationOptions}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>数量</label>
                        ${quantityStepper}
                    </div>
                    <div class="form-group">
                        <label>单位</label>
                        <input type="text" id="hh-unit" value="${escapedUnit}" placeholder="如：个、包、瓶">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>购入日期</label>
                        <input type="date" id="hh-purchase-date" value="${formData.purchaseDate || Utils.today()}">
                    </div>
                    <div class="form-group">
                        <label>保质期至</label>
                        <input type="date" id="hh-expiry-date" value="${formData.expiryDate || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>单价（元）</label>
                    <input type="number" id="hh-price" value="${formData.price || ''}" placeholder="如：29.9" min="0" step="0.01">
                </div>
                <div class="form-group">
                    <label>备注</label>
                    ${VoiceRecognition.getTextareaWithMic('hh-note', '规格、购买渠道等', escapedNotes, 3, 'household')}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Modal.close()">取消</button>
                    <button type="submit" class="btn btn-primary" id="modal-confirm-btn">${item ? '保存' : '添加'}</button>
                </div>
            </form>
        `;

        Modal.open(title, content);

        // 渲染分类自定义下拉
        CategorySelect.renderCustomSelect(
            'hh-category-container',
            'household',
            this._formCategory,
            (value) => {
                this._formCategory = value;
            }
        );

        // 自动聚焦名称输入框
        setTimeout(() => {
            const nameInput = document.getElementById('hh-name');
            if (nameInput) nameInput.focus();
        }, 100);

        document.getElementById('household-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveItem(id);
        });
    },

    async saveItem(id) {
        const name = document.getElementById('hh-name').value.trim();
        const category = this._formCategory;
        const storageLocation = document.getElementById('hh-location').value;
        const quantity = document.getElementById('hh-quantity').value;
        const unit = document.getElementById('hh-unit').value.trim();
        const purchaseDate = document.getElementById('hh-purchase-date').value;
        const expiryDate = document.getElementById('hh-expiry-date').value;
        const price = document.getElementById('hh-price').value;
        const notes = document.getElementById('hh-note').value.trim();

        if (!name || !category) {
            Toast.error('请填写必填项');
            return;
        }

        const data = {
            name,
            category,
            storageLocation,
            quantity: quantity ? parseFloat(quantity) : null,
            unit: unit || null,
            purchaseDate: purchaseDate || null,
            expiryDate: expiryDate || null,
            price: price ? parseFloat(price) : null,
            notes
        };

        let res;
        if (id) {
            res = await API.updateHousehold(id, data);
        } else {
            res = await API.addHousehold(data);
        }

        if (res.success) {
            Toast.success(id ? '更新成功' : '添加成功 ✓');
            Modal.close();
            this.loadData();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '保存失败');
            console.error(res.message);
        }
    },

    confirmDelete(id) {
        const item = this.list.find(i => i.id === id);
        if (!item) return;

        const content = `
            <p>确定要删除「${Utils.escapeHtml(item.name)}」吗？</p>
            <p style="color:var(--text-secondary);font-size:13px;margin-top:8px;">删除后无法恢复</p>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="Modal.close()">取消</button>
                <button class="btn btn-danger" onclick="Household.doDelete('${id}')">确认删除</button>
            </div>
        `;
        Modal.open('删除生活用品', content);
    },

    async doDelete(id) {
        const res = await API.deleteHousehold(id);
        if (res.success) {
            Toast.success('删除成功');
            Modal.close();
            this.loadData();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '删除失败');
            console.error(res.message);
        }
    }
};

// ===== 日常日志模块 =====
const Diary = {
    list: [],
    currentView: 'list',
    currentMonth: new Date(),

    init() {
        // 视图切换
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentView = btn.dataset.view;
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('diary-list-view').classList.toggle('hidden', this.currentView !== 'list');
                document.getElementById('diary-calendar-view').classList.toggle('hidden', this.currentView !== 'calendar');
                if (this.currentView === 'calendar') {
                    this.renderCalendar();
                }
            });
        });

        // 日历导航
        document.getElementById('cal-prev').addEventListener('click', () => {
            this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
            this.renderCalendar();
        });
        document.getElementById('cal-next').addEventListener('click', () => {
            this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
            this.renderCalendar();
        });

        // 新增按钮
        document.getElementById('btn-add-diary').addEventListener('click', () => {
            this.showForm();
        });
    },

    async loadData() {
        const res = await API.getDiary();
        if (res.success) {
            this.list = res.data || [];
            this.renderList();
            if (this.currentView === 'calendar') {
                this.renderCalendar();
            }
        } else {
            console.error('加载日记数据失败:', res.message);
            Toast.error('加载失败');
        }
    },

    renderList() {
        const listEl = document.getElementById('diary-list-view');
        const sorted = [...this.list].sort((a, b) => new Date(b.date) - new Date(a.date));

        if (sorted.length === 0) {
            listEl.innerHTML = `
                <div class="empty-tip">
                    <div class="empty-tip__icon empty-tip__icon--diary">
                        <svg><use href="#icon-diary"/></svg>
                    </div>
                    <p class="empty-tip__text">今天发生了什么？📔</p>
                    <p class="empty-tip__sub">记录每天的心情与故事</p>
                </div>`;
            return;
        }

        const moodEmojis = {
            happy: '😀', '开心': '😀',
            good: '😊', '平静': '😊', '满足': '😊', '充实': '😊', '期待': '😊',
            normal: '😐', '一般': '😐', '慵懒': '😐',
            sad: '😔', '烦躁': '😔',
            cry: '😢'
        };
        const weatherEmojis = {
            sunny: '☀️', '晴': '☀️',
            cloudy: '⛅', '多云': '⛅', '阴': '⛅',
            rainy: '🌧️', '小雨': '🌧️', '雨': '🌧️',
            snow: '❄️', '雪': '❄️',
            storm: '🌪️', '大风': '🌪️'
        };
        const moodColors = {
            happy: 'var(--gradient-warm)',
            good: 'var(--gradient-green)',
            normal: 'var(--gradient-blue)',
            sad: 'var(--gradient-ocean)',
            cry: 'var(--gradient-sunset)',
            '开心': 'var(--gradient-warm)',
            '平静': 'var(--gradient-green)',
            '满足': 'var(--gradient-green)',
            '充实': 'var(--gradient-green)',
            '期待': 'var(--gradient-green)',
            '一般': 'var(--gradient-blue)',
            '慵懒': 'var(--gradient-blue)',
            '烦躁': 'var(--gradient-ocean)'
        };

        listEl.innerHTML = sorted.map(item => {
            const moodGradient = moodColors[item.mood] || 'var(--gradient-primary)';
            return `
            <div class="diary-card" style="--mood-gradient: ${moodGradient};">
                <div class="diary-side-bar"></div>
                <div class="diary-card-inner">
                    <div class="diary-header">
                        <span class="diary-date">${item.date}</span>
                        <div class="diary-mood-weather">
                            <span class="diary-emoji-float">${weatherEmojis[item.weather] || ''}</span>
                            <span class="diary-emoji-float">${moodEmojis[item.mood] || ''}</span>
                        </div>
                    </div>
                    <div class="diary-content">${Utils.escapeHtml(item.notes)}</div>
                    <div class="diary-actions">
                        <button class="btn btn-secondary btn-sm" onclick="Diary.showForm('${item.id}')">
                            <svg class="btn__icon"><use href="#icon-edit"/></svg>编辑
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="Diary.confirmDelete('${item.id}')">
                            <svg class="btn__icon"><use href="#icon-delete"/></svg>删除
                        </button>
                    </div>
                </div>
            </div>
        `;}).join('');
    },

    renderCalendar() {
        const year = this.currentMonth.getFullYear();
        const month = this.currentMonth.getMonth();

        document.getElementById('cal-title').textContent = `${year}年${month + 1}月`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDayOfWeek = firstDay.getDay(); // 0-6, 0是周日
        const daysInMonth = lastDay.getDate();

        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

        // 构建日记日期映射
        const diaryMap = {};
        this.list.forEach(item => {
            diaryMap[item.date] = item;
        });

        const today = Utils.today();
        let html = dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('');

        // 上月日期
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            html += `<div class="cal-day other-month">${day}</div>`;
        }

        // 当月日期
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasDiary = diaryMap[dateStr];
            const isToday = dateStr === today;

            let classes = 'cal-day';
            if (isToday) classes += ' today';
            if (hasDiary) classes += ' has-diary';

            const moodEmojis = {
                happy: '😀', '开心': '😀',
                good: '😊', '平静': '😊', '满足': '😊', '充实': '😊', '期待': '😊',
                normal: '😐', '一般': '😐', '慵懒': '😐',
                sad: '😔', '烦躁': '😔',
                cry: '😢'
            };
            const indicator = hasDiary ? `<span class="diary-indicator">${moodEmojis[hasDiary.mood] || '📝'}</span>` : '';

            html += `<div class="${classes}" onclick="Diary.onDayClick('${dateStr}')">
                ${day}
                ${indicator}
            </div>`;
        }

        // 下月日期补齐
        const totalCells = startDayOfWeek + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let day = 1; day <= remaining; day++) {
            html += `<div class="cal-day other-month">${day}</div>`;
        }

        document.getElementById('calendar-grid').innerHTML = html;
    },

    onDayClick(dateStr) {
        const existing = this.list.find(item => item.date === dateStr);
        if (existing) {
            this.showForm(existing.id);
        } else {
            this.showForm(null, dateStr);
        }
    },

    showForm(id = null, date = null) {
        const item = id ? this.list.find(i => i.id === id) : null;
        const title = item ? '编辑日记' : '写日记';
        const defaultDate = date || (item ? item.date : Utils.today());

        const moods = [
            { value: 'happy', emoji: '😀', label: '开心' },
            { value: 'good', emoji: '😊', label: '不错' },
            { value: 'normal', emoji: '😐', label: '一般' },
            { value: 'sad', emoji: '😔', label: '低落' },
            { value: 'cry', emoji: '😢', label: '难过' }
        ];

        const weathers = [
            { value: 'sunny', emoji: '☀️', label: '晴' },
            { value: 'cloudy', emoji: '⛅', label: '多云' },
            { value: 'rainy', emoji: '🌧️', label: '雨' },
            { value: 'snow', emoji: '❄️', label: '雪' },
            { value: 'storm', emoji: '🌪️', label: '极端' }
        ];

        const currentMood = item ? item.mood : 'good';
        const currentWeather = item ? item.weather : 'sunny';

        const moodOptions = moods.map(m => `
            <div class="mood-option ${currentMood === m.value ? 'selected' : ''}" 
                 data-mood="${m.value}" title="${m.label}">${m.emoji}</div>
        `).join('');

        const weatherOptions = weathers.map(w => `
            <div class="weather-option ${currentWeather === w.value ? 'selected' : ''}" 
                 data-weather="${w.value}" title="${w.label}">${w.emoji}</div>
        `).join('');

        const content = `
            <form id="diary-form">
                <div class="form-group">
                    <label>日期 *</label>
                    <input type="date" id="di-date" value="${defaultDate}" required>
                </div>
                <div class="form-group">
                    <label>心情</label>
                    <div class="mood-selector" id="mood-selector">
                        ${moodOptions}
                    </div>
                </div>
                <div class="form-group">
                    <label>天气</label>
                    <div class="weather-selector" id="weather-selector">
                        ${weatherOptions}
                    </div>
                </div>
                <div class="form-group">
                    <label>内容 *</label>
                    <textarea id="di-content" placeholder="记录今天的点点滴滴..." required>${item ? Utils.escapeHtml(item.notes) : ''}</textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="Modal.close()">取消</button>
                    <button type="submit" class="btn btn-primary" id="modal-confirm-btn">${item ? '保存' : '发布'}</button>
                </div>
            </form>
        `;

        Modal.open(title, content);

        // 心情选择
        let selectedMood = currentMood;
        document.querySelectorAll('.mood-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                selectedMood = opt.dataset.mood;
            });
        });

        // 天气选择
        let selectedWeather = currentWeather;
        document.querySelectorAll('.weather-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.weather-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                selectedWeather = opt.dataset.weather;
            });
        });

        document.getElementById('diary-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveItem(id, selectedMood, selectedWeather);
        });
    },

    async saveItem(id, mood, weather) {
        const date = document.getElementById('di-date').value;
        const notes = document.getElementById('di-content').value.trim();

        if (!date || !notes) {
            Toast.error('请填写日期和内容');
            return;
        }

        const data = {
            date,
            notes,
            mood,
            weather
        };

        let res;
        if (id) {
            res = await API.updateDiary(id, data);
        } else {
            // 检查同一天是否已有日记
            const existing = this.list.find(item => item.date === date);
            if (existing) {
                Toast.warning('当天已有日记，将覆盖原有内容');
                res = await API.updateDiary(existing.id, data);
            } else {
                res = await API.addDiary(data);
            }
        }

        if (res.success) {
            Toast.success(id ? '更新成功' : '发布成功');
            Modal.close();
            this.loadData();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '保存失败');
            console.error(res.message);
        }
    },

    confirmDelete(id) {
        const item = this.list.find(i => i.id === id);
        if (!item) return;

        const content = `
            <p>确定要删除「${item.date}」的日记吗？</p>
            <p style="color:var(--text-secondary);font-size:13px;margin-top:8px;">删除后无法恢复</p>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="Modal.close()">取消</button>
                <button class="btn btn-danger" onclick="Diary.doDelete('${id}')">确认删除</button>
            </div>
        `;
        Modal.open('删除日记', content);
    },

    async doDelete(id) {
        const res = await API.deleteDiary(id);
        if (res.success) {
            Toast.success('删除成功');
            Modal.close();
            this.loadData();
            Dashboard.loadData();
        } else {
            Toast.error(res.message || '删除失败');
            console.error(res.message);
        }
    }
};

// ===== 健康管理模块 =====
const Health = {
    currentDate: Utils.today(),
    calendarMonth: new Date(),
    records: [],
    currentRecordId: null,

    init() {
        // 保存按钮
        document.getElementById('btn-save-health').addEventListener('click', () => {
            this.saveRecord();
        });

        // 查询按钮
        document.getElementById('btn-query-health').addEventListener('click', () => {
            const start = document.getElementById('health-start-date').value;
            const end = document.getElementById('health-end-date').value;
            this.queryHistory(start, end);
        });

        // 日期变化时加载对应记录
        document.getElementById('health-date').addEventListener('change', (e) => {
            this.currentDate = e.target.value;
            this.loadByDate(e.target.value);
        });

        // 日历导航
        document.getElementById('health-cal-prev').addEventListener('click', () => {
            this.prevMonth();
        });
        document.getElementById('health-cal-next').addEventListener('click', () => {
            this.nextMonth();
        });

        // 初始化日期
        document.getElementById('health-date').value = Utils.today();

        // 初始化查询日期（默认近30天）
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        document.getElementById('health-end-date').value = Utils.today();
        document.getElementById('health-start-date').value = Utils.formatDate(thirtyDaysAgo);

        // 加载今日记录
        this.loadByDate(Utils.today());
    },

    async loadByDate(date) {
        const res = await API.getHealthByDate(date);
        if (res.success && res.data) {
            const record = res.data;
            this.currentRecordId = record.id;
            document.getElementById('health-id').value = record.id || '';
            document.getElementById('health-date').value = record.recordDate || date;
            document.getElementById('health-weather').value = record.weather || '晴';
            document.getElementById('health-comfort').value = record.comfort || '舒适';
            document.getElementById('health-weight').value = record.weight || '';
            document.getElementById('health-fasting-glucose').value = record.fastingGlucose || '';
            document.getElementById('health-postprandial-glucose').value = record.postprandialGlucose || '';
            document.getElementById('health-menstrual-status').value = record.menstrualStatus || '非经期';
            document.getElementById('health-mood-log').value = record.moodLog || '';
            document.getElementById('btn-save-health').innerHTML = '<svg class="btn__icon"><use href="#icon-edit"/></svg>更新记录';
        } else {
            this.currentRecordId = null;
            document.getElementById('health-id').value = '';
            document.getElementById('health-weather').value = '晴';
            document.getElementById('health-comfort').value = '舒适';
            document.getElementById('health-weight').value = '';
            document.getElementById('health-fasting-glucose').value = '';
            document.getElementById('health-postprandial-glucose').value = '';
            document.getElementById('health-menstrual-status').value = '非经期';
            document.getElementById('health-mood-log').value = '';
            document.getElementById('btn-save-health').innerHTML = '<svg class="btn__icon"><use href="#icon-plus"/></svg>保存记录';
        }
    },

    async saveRecord() {
        const data = {
            recordDate: document.getElementById('health-date').value,
            weather: document.getElementById('health-weather').value,
            comfort: document.getElementById('health-comfort').value,
            weight: document.getElementById('health-weight').value ? parseFloat(document.getElementById('health-weight').value) : null,
            fastingGlucose: document.getElementById('health-fasting-glucose').value ? parseFloat(document.getElementById('health-fasting-glucose').value) : null,
            postprandialGlucose: document.getElementById('health-postprandial-glucose').value ? parseFloat(document.getElementById('health-postprandial-glucose').value) : null,
            menstrualStatus: document.getElementById('health-menstrual-status').value,
            moodLog: document.getElementById('health-mood-log').value
        };

        if (this.currentRecordId) {
            data.id = this.currentRecordId;
        }

        const res = await API.saveHealth(data);
        if (res.success) {
            Toast.success('保存成功');
            this.currentRecordId = res.data ? res.data.id : null;
            if (this.currentRecordId) {
                document.getElementById('health-id').value = this.currentRecordId;
                document.getElementById('btn-save-health').innerHTML = '<svg class="btn__icon"><use href="#icon-edit"/></svg>更新记录';
            }
            this.renderCalendar();
            // 如果查询区有日期范围，刷新历史列表
            const start = document.getElementById('health-start-date').value;
            const end = document.getElementById('health-end-date').value;
            if (start && end) {
                this.queryHistory(start, end);
            }
            // 更新新手任务进度
            if (typeof Onboarding !== 'undefined') Onboarding.checkProgress();
        } else {
            Toast.error(res.message || '保存失败');
        }
    },

    async deleteRecord(id) {
        const res = await API.deleteHealth(id);
        if (res.success) {
            Toast.success('删除成功');
            Modal.close();
            // 如果删除的是当前日期的记录，重置表单
            if (this.currentRecordId === id) {
                this.currentRecordId = null;
                document.getElementById('health-id').value = '';
                document.getElementById('btn-save-health').innerHTML = '<svg class="btn__icon"><use href="#icon-plus"/></svg>保存记录';
            }
            this.renderCalendar();
            const start = document.getElementById('health-start-date').value;
            const end = document.getElementById('health-end-date').value;
            if (start && end) {
                this.queryHistory(start, end);
            }
        } else {
            Toast.error(res.message || '删除失败');
        }
    },

    confirmDelete(id, date) {
        const content = `
            <p>确定要删除 ${date} 的健康记录吗？</p>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="Modal.close()">取消</button>
                <button class="btn btn-danger" onclick="Health.deleteRecord('${id}')">确认删除</button>
            </div>
        `;
        Modal.open('删除记录', content);
    },

    async queryHistory(startDate, endDate) {
        const res = await API.getHealth(startDate, endDate);
        if (res.success) {
            this.records = res.data || [];
            this.renderHistory(this.records);
        } else {
            Toast.error(res.message || '查询失败');
        }
    },

    renderCalendar() {
        const year = this.calendarMonth.getFullYear();
        const month = this.calendarMonth.getMonth();

        document.getElementById('health-cal-title').textContent = `${year}年${month + 1}月`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const today = Utils.today();

        // 获取当月所有记录
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;

        // 使用已有的 records 数据，如果没有则加载
        this._loadMonthRecords(year, month).then(records => {
            const recordMap = {};
            records.forEach(item => {
                recordMap[item.recordDate] = item;
            });

            let html = dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('');

            // 上月日期
            const prevMonthLastDay = new Date(year, month, 0).getDate();
            for (let i = startDayOfWeek - 1; i >= 0; i--) {
                const day = prevMonthLastDay - i;
                html += `<div class="cal-day other-month">${day}</div>`;
            }

            // 当月日期
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = recordMap[dateStr];
                const isToday = dateStr === today;
                const isMenstrual = record && record.menstrualStatus && record.menstrualStatus !== '非经期';
                const hasRecord = !!record;

                let classes = 'cal-day';
                if (isToday) classes += ' today';
                if (hasRecord) classes += ' cal-day-has-record';
                if (isMenstrual) classes += ' cal-day-menstrual';

                html += `<div class="${classes}" onclick="Health.onDayClick('${dateStr}')">
                    ${day}
                </div>`;
            }

            // 下月日期补齐
            const totalCells = startDayOfWeek + daysInMonth;
            const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
            for (let day = 1; day <= remaining; day++) {
                html += `<div class="cal-day other-month">${day}</div>`;
            }

            document.getElementById('health-calendar-grid').innerHTML = html;
        });
    },

    async _loadMonthRecords(year, month) {
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
        const res = await API.getHealth(monthStart, monthEnd);
        if (res.success) {
            return res.data || [];
        }
        return [];
    },

    prevMonth() {
        this.calendarMonth.setMonth(this.calendarMonth.getMonth() - 1);
        this.renderCalendar();
    },

    nextMonth() {
        this.calendarMonth.setMonth(this.calendarMonth.getMonth() + 1);
        this.renderCalendar();
    },

    onDayClick(dateStr) {
        this.currentDate = dateStr;
        document.getElementById('health-date').value = dateStr;
        this.loadByDate(dateStr);
    },

    renderHistory(records) {
        const listEl = document.getElementById('health-history-list');

        if (!records || records.length === 0) {
            listEl.innerHTML = `
                <div class="empty-tip">
                    <div class="empty-tip__icon">
                        <svg><use href="#icon-heart"/></svg>
                    </div>
                    <p class="empty-tip__text">暂无健康记录</p>
                    <p class="empty-tip__sub">记录每一天的健康状态</p>
                </div>`;
            return;
        }

        // 按日期倒序
        const sorted = [...records].sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));

        listEl.innerHTML = sorted.map(item => {
            const weatherEmojis = {
                '晴': '☀️', '多云': '⛅', '阴': '☁️', '雨': '🌧️', '雪': '❄️', '雾': '🌫️'
            };
            const weatherEmoji = weatherEmojis[item.weather] || '';
            const isMenstrual = item.menstrualStatus && item.menstrualStatus !== '非经期';

            return `
                <div class="health-record-item">
                    <div class="health-record-header">
                        <div class="health-record-date">
                            <svg class="health-record-date__icon"><use href="#icon-calendar"/></svg>
                            <span>${item.recordDate}</span>
                            <span class="health-record-weather">${weatherEmoji}</span>
                            ${isMenstrual ? '<span class="health-record-tag health-record-tag--menstrual">经期</span>' : ''}
                        </div>
                        <div class="health-record-actions">
                            <button class="btn btn-secondary btn-sm" onclick="Health.onDayClick('${item.recordDate}')">
                                <svg class="btn__icon"><use href="#icon-edit"/></svg>编辑
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="Health.confirmDelete('${item.id}', '${item.recordDate}')">
                                <svg class="btn__icon"><use href="#icon-delete"/></svg>删除
                            </button>
                        </div>
                    </div>
                    <div class="health-record-body">
                        <div class="health-record-stats">
                            ${item.weight !== null && item.weight !== undefined ? `<span class="health-stat"><strong>体重:</strong> ${item.weight} 斤</span>` : ''}
                            ${item.fastingGlucose !== null && item.fastingGlucose !== undefined ? `<span class="health-stat"><strong>空腹血糖:</strong> ${item.fastingGlucose} mmol/L</span>` : ''}
                            ${item.postprandialGlucose !== null && item.postprandialGlucose !== undefined ? `<span class="health-stat"><strong>餐后血糖:</strong> ${item.postprandialGlucose} mmol/L</span>` : ''}
                            ${item.comfort ? `<span class="health-stat"><strong>体感:</strong> ${item.comfort}</span>` : ''}
                        </div>
                        ${item.moodLog ? `<div class="health-record-mood">${Utils.escapeHtml(item.moodLog)}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
};

// ===== 新手任务引导 =====
const Onboarding = {
    tasks: [
        { id: 'add-skincare', label: '添加第一件护肤品', module: 'skincare', check: () => Skincare.list.length > 0 },
        { id: 'add-fridge', label: '添加一样冰箱食材', module: 'fridge', check: () => Fridge.list.length > 0 },
        { id: 'add-household', label: '添加一件生活用品', module: 'household', check: () => Household.list.length > 0 },
        { id: 'add-health', label: '记录今天的健康数据', module: 'health', check: () => Onboarding._healthCompleted }
    ],

    isDismissed: false,
    completedCount: 0,
    _healthCompleted: false,
    _prevCompleted: {}, // 记录上一次的完成状态，用于动效

    init() {
        // 从 localStorage 读取是否已关闭
        this.isDismissed = localStorage.getItem('onboarding_dismissed') === '1';
        if (this.isDismissed) return;

        // 计算完成情况
        this.checkProgress();

        // 如果全部完成，自动关闭
        if (this.completedCount === this.tasks.length) {
            this.dismiss();
        } else {
            this.render();
            this.show();
        }
    },

    async checkProgress() {
        if (this.isDismissed) return;

        // 保存上一次完成状态
        const prevCompleted = {};
        this.tasks.forEach(task => {
            prevCompleted[task.id] = this._prevCompleted[task.id] || false;
        });

        // 检查健康记录（需要异步 API 调用）
        try {
            const res = await API.getHealthSummary();
            if (res.success && res.data) {
                // 只要有任意一条健康记录就算完成
                const hs = res.data;
                this._healthCompleted = (hs.monthCount !== undefined ? hs.monthCount > 0 : false) ||
                                        (hs.latest !== undefined && hs.latest !== null) ||
                                        (hs.latestRecord !== undefined && hs.latestRecord !== null);
            }
        } catch (e) {
            console.warn('获取健康摘要失败:', e);
        }

        // 依次检查每个任务是否完成
        let completed = 0;
        const newCompleted = {};
        this.tasks.forEach(task => {
            const done = task.check();
            newCompleted[task.id] = done;
            if (done) completed++;
        });

        this.completedCount = completed;

        // 如果有新完成的任务，重新渲染带动效
        const hasNewlyCompleted = this.tasks.some(task =>
            newCompleted[task.id] && !prevCompleted[task.id]
        );

        this._prevCompleted = newCompleted;

        // 更新进度显示
        this.updateProgress(hasNewlyCompleted);

        // 如果全部完成，延迟后自动关闭
        if (this.completedCount === this.tasks.length) {
            setTimeout(() => this.dismiss(), 2000);
        }
    },

    updateProgress(animate = false) {
        const fillEl = document.getElementById('onboarding-progress-fill');
        const textEl = document.getElementById('onboarding-progress-text');
        if (!fillEl || !textEl) return;

        const percent = this.tasks.length > 0
            ? Math.round((this.completedCount / this.tasks.length) * 100)
            : 0;

        fillEl.style.width = percent + '%';
        textEl.textContent = `${this.completedCount}/${this.tasks.length}`;

        // 更新任务列表项状态
        this.tasks.forEach(task => {
            const itemEl = document.getElementById(`onboarding-task-${task.id}`);
            if (itemEl) {
                const isDone = task.check();
                if (isDone !== itemEl.classList.contains('completed')) {
                    if (isDone) {
                        itemEl.classList.add('completed');
                    } else {
                        itemEl.classList.remove('completed');
                    }
                }
            }
        });
    },

    render() {
        const tasksEl = document.getElementById('onboarding-tasks');
        if (!tasksEl) return;

        tasksEl.innerHTML = this.tasks.map(task => {
            const isDone = task.check();
            return `
                <div id="onboarding-task-${task.id}" class="onboarding-task-item ${isDone ? 'completed' : ''}">
                    <div class="onboarding-task-check">
                        <svg><use href="#icon-check"/></svg>
                    </div>
                    <span class="onboarding-task-label">${task.label}</span>
                    <a href="javascript:;" class="onboarding-task-action" onclick="Onboarding.gotoTask('${task.id}')">去完成</a>
                </div>
            `;
        }).join('');

        // 初始化进度
        this.updateProgress(false);
    },

    show() {
        const card = document.getElementById('onboarding-card');
        if (card) {
            card.style.display = 'block';
        }
    },

    dismiss() {
        this.isDismissed = true;
        localStorage.setItem('onboarding_dismissed', '1');
        const card = document.getElementById('onboarding-card');
        if (card) {
            card.style.display = 'none';
        }
    },

    gotoTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task && task.module) {
            Nav.switchModule(task.module);
        }
    }
};

// ===== 应用初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    VoiceRecognition.init();
    Modal.init();
    Auth.init();
    Nav.init();
    Dashboard.init();
    Skincare.init();
    Fridge.init();
    Household.init();
    Diary.init();
    Health.init();
    Onboarding.init();
});
