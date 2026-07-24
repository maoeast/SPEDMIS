const {
    SAFE_SECRET_PREFIX,
    AISecretError,
    createAISecretStore,
} = require('../modules/ai-secret-store');

describe('AI secret store', () => {
    test('encrypts and decrypts API keys without returning plaintext payloads', () => {
        const adapter = {
            isEncryptionAvailable: jest.fn(() => true),
            encryptString: jest.fn((value) => Buffer.from(`encrypted:${value}`, 'utf8')),
            decryptString: jest.fn((value) => value.toString('utf8').replace('encrypted:', '')),
        };
        const store = createAISecretStore(adapter);
        const protectedKey = store.protectApiKey('  secret-key  ');

        expect(protectedKey).toMatch(new RegExp(`^${SAFE_SECRET_PREFIX}`));
        expect(protectedKey).not.toContain('secret-key');
        expect(store.hasProtectedKey(protectedKey)).toBe(true);
        expect(store.revealApiKey(protectedKey)).toBe('secret-key');
    });

    test('refuses plaintext fallback when safeStorage is unavailable', () => {
        const store = createAISecretStore({ isEncryptionAvailable: () => false });

        expect(() => store.protectApiKey('must-not-leak')).toThrow(AISecretError);
        expect(() => store.protectApiKey('must-not-leak')).toThrow(
            expect.objectContaining({ kind: 'safe_storage_unavailable' })
        );
    });

    test('uses a generic error when encryption or decryption fails', () => {
        const store = createAISecretStore({
            isEncryptionAvailable: () => true,
            encryptString: () => {
                throw new Error('provider leaked secret-key');
            },
            decryptString: () => {
                throw new Error('decrypt internals');
            },
        });

        expect(() => store.protectApiKey('secret-key')).toThrow('API Key 安全加密失败');
        expect(() => store.protectApiKey('secret-key')).not.toThrow('secret-key');
        expect(() => store.revealApiKey(`${SAFE_SECRET_PREFIX}YWJj`)).toThrow('API Key 解密失败');
    });
});
