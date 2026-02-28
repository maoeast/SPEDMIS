/**
 * 缓存管理模块单元测试
 */

const { CacheManager, CacheEntry } = require('../cache');

describe('CacheEntry', () => {
    test('should create cache entry with correct properties', () => {
        const entry = new CacheEntry('key1', 'value1', 5000);

        expect(entry.key).toBe('key1');
        expect(entry.value).toBe('value1');
        expect(entry.ttl).toBe(5000);
        expect(entry.accessCount).toBe(0);
        expect(entry.lastAccessTime).toBeDefined();
    });

    test('should check expiration correctly', (done) => {
        const entry = new CacheEntry('key1', 'value1', 100); // 100ms TTL

        expect(entry.isExpired()).toBe(false);

        setTimeout(() => {
            expect(entry.isExpired()).toBe(true);
            done();
        }, 150);
    });

    test('should handle null TTL as never expires', () => {
        const entry = new CacheEntry('key1', 'value1', null);

        expect(entry.isExpired()).toBe(false);
    });

    test('should update access time and count', () => {
        const entry = new CacheEntry('key1', 'value1');
        const initialAccessCount = entry.accessCount;
        const initialTime = entry.lastAccessTime;

        entry.updateAccessTime();

        expect(entry.accessCount).toBe(initialAccessCount + 1);
        expect(entry.lastAccessTime).toBeGreaterThanOrEqual(initialTime);
    });
});

describe('CacheManager', () => {
    let cache;

    beforeEach(() => {
        cache = new CacheManager({ maxSize: 3 });
    });

    afterEach(() => {
        cache.destroy();
    });

    test('should set and get cache values', () => {
        cache.set('key1', 'value1');

        expect(cache.get('key1')).toBe('value1');
    });

    test('should return undefined for missing keys', () => {
        expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should check if key exists', () => {
        cache.set('key1', 'value1');

        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key2')).toBe(false);
    });

    test('should delete cache items', () => {
        cache.set('key1', 'value1');

        expect(cache.delete('key1')).toBe(true);
        expect(cache.get('key1')).toBeUndefined();
    });

    test('should clear all cache items', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        cache.clear();

        expect(cache.size()).toBe(0);
    });

    test('should handle TTL expiration', (done) => {
        cache.set('key1', 'value1', 100); // 100ms TTL

        expect(cache.get('key1')).toBe('value1');

        setTimeout(() => {
            expect(cache.get('key1')).toBeUndefined();
            done();
        }, 150);
    });

    test('should evict LRU item when max size exceeded', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        // Access key1 to increase its usage
        cache.get('key1');

        // Add fourth item, should evict key2 (least recently used)
        cache.set('key4', 'value4');

        expect(cache.size()).toBe(3);
        expect(cache.get('key1')).toBe('value1');
        expect(cache.get('key3')).toBe('value3');
        expect(cache.get('key4')).toBe('value4');
        expect(cache.get('key2')).toBeUndefined();
    });

    test('should provide cache statistics', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        const stats = cache.getStats();

        expect(stats.totalItems).toBe(2);
        expect(stats.maxSize).toBe(3);
        expect(stats.items).toHaveLength(2);
    });

    test('should cleanup expired items automatically', (done) => {
        const quickCache = new CacheManager({
            maxSize: 10,
            cleanupInterval: 100
        });

        quickCache.set('key1', 'value1', 50);
        quickCache.set('key2', 'value2'); // No TTL

        setTimeout(() => {
            expect(quickCache.get('key1')).toBeUndefined();
            expect(quickCache.get('key2')).toBe('value2');
            quickCache.destroy();
            done();
        }, 150);
    });

    test('should handle different data types', () => {
        const testCache = new CacheManager({ maxSize: 10 });

        testCache.set('string', 'value');
        testCache.set('number', 123);
        testCache.set('boolean', true);
        testCache.set('object', { a: 1, b: 2 });
        testCache.set('array', [1, 2, 3]);

        expect(testCache.get('string')).toBe('value');
        expect(testCache.get('number')).toBe(123);
        expect(testCache.get('boolean')).toBe(true);
        expect(testCache.get('object')).toEqual({ a: 1, b: 2 });
        expect(testCache.get('array')).toEqual([1, 2, 3]);

        testCache.destroy();
    });

    test('should update value when key already exists', () => {
        cache.set('key1', 'value1');
        cache.set('key1', 'value2');

        expect(cache.get('key1')).toBe('value2');
        expect(cache.size()).toBe(1);
    });
});
