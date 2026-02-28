/**
 * 缓存管理模块
 * 实现应用级缓存机制，支持LRU淘汰策略和TTL过期机制
 */

/**
 * 缓存条目类
 */
class CacheEntry {
    constructor(key, value, ttl = null) {
        this.key = key;
        this.value = value;
        this.ttl = ttl;
        this.createdAt = Date.now();
        this.accessCount = 0;
        this.lastAccessTime = Date.now();
    }

    /**
     * 检查缓存是否已过期
     * @returns {boolean}
     */
    isExpired() {
        if (this.ttl === null) return false;
        return Date.now() - this.createdAt > this.ttl;
    }

    /**
     * 更新最后访问时间
     */
    updateAccessTime() {
        this.lastAccessTime = Date.now();
        this.accessCount++;
    }
}

/**
 * 缓存管理器类
 * 支持TTL过期和LRU淘汰策略
 */
class CacheManager {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 100;
        this.defaultTTL = options.defaultTTL || null; // null表示永不过期
        this.cache = new Map();
        this.accessLog = []; // 用于LRU实现

        // 自动清理过期缓存的定时器
        this.cleanupInterval = options.cleanupInterval || 60000; // 默认60秒
        this.startAutoCleanup();
    }

    /**
     * 设置缓存值
     * @param {string} key - 缓存键
     * @param {*} value - 缓存值
     * @param {number} ttl - TTL（毫秒），null表示永不过期
     */
    set(key, value, ttl = this.defaultTTL) {
        // 删除旧的条目
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // 检查容量
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        // 创建新的缓存条目
        const entry = new CacheEntry(key, value, ttl);
        this.cache.set(key, entry);
    }

    /**
     * 获取缓存值
     * @param {string} key - 缓存键
     * @returns {*} 缓存值，如果不存在或已过期则返回undefined
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        // 检查是否过期
        if (entry.isExpired()) {
            this.cache.delete(key);
            return undefined;
        }

        // 更新访问信息
        entry.updateAccessTime();
        return entry.value;
    }

    /**
     * 检查键是否存在且有效
     * @param {string} key - 缓存键
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== undefined;
    }

    /**
     * 删除缓存项
     * @param {string} key - 缓存键
     * @returns {boolean} 是否删除成功
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * 清空所有缓存
     */
    clear() {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     * @returns {number}
     */
    size() {
        return this.cache.size;
    }

    /**
     * 获取缓存统计信息
     * @returns {Object}
     */
    getStats() {
        const stats = {
            totalItems: this.cache.size,
            maxSize: this.maxSize,
            items: [],
        };

        this.cache.forEach((entry, key) => {
            stats.items.push({
                key,
                expired: entry.isExpired(),
                accessCount: entry.accessCount,
                lastAccessTime: new Date(entry.lastAccessTime).toISOString(),
                createdAt: new Date(entry.createdAt).toISOString(),
                ttl: entry.ttl,
            });
        });

        return stats;
    }

    /**
     * LRU淘汰：删除最少使用的条目
     * @private
     */
    evictLRU() {
        let lruKey = null;
        let minAccessCount = Infinity;
        let oldestTime = Infinity;

        this.cache.forEach((entry, key) => {
            // 优先淘汰访问次数最少的
            // 如果访问次数相同，则淘汰最久未访问的
            if (entry.accessCount < minAccessCount ||
                (entry.accessCount === minAccessCount && entry.lastAccessTime < oldestTime)) {
                minAccessCount = entry.accessCount;
                oldestTime = entry.lastAccessTime;
                lruKey = key;
            }
        });

        if (lruKey) {
            this.cache.delete(lruKey);
        }
    }

    /**
     * 清理过期缓存项
     * @private
     */
    cleanupExpired() {
        const keysToDelete = [];
        this.cache.forEach((entry, key) => {
            if (entry.isExpired()) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => this.cache.delete(key));
        return keysToDelete.length;
    }

    /**
     * 启动自动清理定时器
     * @private
     */
    startAutoCleanup() {
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, this.cleanupInterval);
    }

    /**
     * 停止自动清理定时器
     */
    stopAutoCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
    }

    /**
     * 销毁缓存管理器
     */
    destroy() {
        this.stopAutoCleanup();
        this.clear();
    }
}

/**
 * 全局缓存管理器实例
 * 用于应用级别的数据缓存
 */
let globalCacheManager = null;

/**
 * 获取全局缓存管理器实例
 * @param {Object} options - 配置选项
 * @returns {CacheManager}
 */
function getGlobalCacheManager(options = {}) {
    if (!globalCacheManager) {
        globalCacheManager = new CacheManager(options);
    }
    return globalCacheManager;
}

module.exports = {
    CacheManager,
    CacheEntry,
    getGlobalCacheManager,
};
