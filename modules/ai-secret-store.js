const SAFE_SECRET_PREFIX = 'safe:v1:';

class AISecretError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = 'AISecretError';
        this.kind = kind;
    }
}

function createAISecretStore(safeStorageAdapter) {
    function isEncryptionAvailable() {
        try {
            return Boolean(safeStorageAdapter?.isEncryptionAvailable?.());
        } catch {
            return false;
        }
    }

    function protectApiKey(plainKey) {
        const normalized = typeof plainKey === 'string' ? plainKey.trim() : '';
        if (!normalized) {
            throw new AISecretError('invalid_api_key', 'API Key 不能为空。');
        }

        if (!isEncryptionAvailable()) {
            throw new AISecretError(
                'safe_storage_unavailable',
                '当前系统不可用安全存储，无法保存 API Key。请检查操作系统凭据服务后重试。'
            );
        }

        try {
            const encrypted = safeStorageAdapter.encryptString(normalized);
            if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
                throw new Error('safeStorage returned an empty payload');
            }
            return `${SAFE_SECRET_PREFIX}${encrypted.toString('base64')}`;
        } catch (error) {
            if (error instanceof AISecretError) {
                throw error;
            }
            throw new AISecretError('safe_storage_encrypt_failed', 'API Key 安全加密失败，请重试。');
        }
    }

    function revealApiKey(protectedKey) {
        if (typeof protectedKey !== 'string' || !protectedKey.startsWith(SAFE_SECRET_PREFIX)) {
            throw new AISecretError('api_key_unavailable', '尚未配置 API Key，请先完成 Provider 设置。');
        }

        if (!isEncryptionAvailable()) {
            throw new AISecretError(
                'safe_storage_unavailable',
                '当前系统不可用安全存储，无法读取 API Key。请重新配置后再试。'
            );
        }

        try {
            const encoded = protectedKey.slice(SAFE_SECRET_PREFIX.length);
            const encrypted = Buffer.from(encoded, 'base64');
            if (!encoded || encrypted.length === 0) {
                throw new Error('empty encrypted payload');
            }
            const decrypted = safeStorageAdapter.decryptString(encrypted);
            const normalized = typeof decrypted === 'string' ? decrypted.trim() : '';
            if (!normalized) {
                throw new Error('empty decrypted value');
            }
            return normalized;
        } catch {
            throw new AISecretError('safe_storage_decrypt_failed', 'API Key 解密失败，请清除后重新配置。');
        }
    }

    function hasProtectedKey(value) {
        return typeof value === 'string'
            && value.startsWith(SAFE_SECRET_PREFIX)
            && value.length > SAFE_SECRET_PREFIX.length;
    }

    return {
        isEncryptionAvailable,
        protectApiKey,
        revealApiKey,
        hasProtectedKey,
    };
}

module.exports = {
    SAFE_SECRET_PREFIX,
    AISecretError,
    createAISecretStore,
};
