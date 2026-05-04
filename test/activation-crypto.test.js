jest.mock('electron', () => ({
    app: {
        isReady: jest.fn(() => false),
        getPath: jest.fn(() => '/tmp'),
    }
}));

jest.mock('../logger', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }))
}));

describe('activation crypto development defaults', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            ...originalEnv,
            NODE_ENV: 'development',
        };
        delete process.env.ACTIVATION_SECRET_KEY;
        delete process.env.ACTIVATION_ENCRYPTION_KEY;
        delete process.env.ACTIVATION_ENCRYPTION_IV;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('should encrypt and decrypt activation data with development defaults', () => {
        const secretManager = require('../modules/secret-manager');
        const activationCrypto = require('../modules/activation-crypto');
        const payload = {
            machineCode: 'machine-code',
            activationCode: 'activation-code',
            activatedDate: '2026-05-04T06:51:18.446Z',
        };

        secretManager.initialize();

        const encrypted = activationCrypto.encryptActivationData(payload);
        const decrypted = activationCrypto.decryptActivationData(encrypted);

        expect(secretManager.getEncryptionKey()).toHaveLength(32);
        expect(secretManager.getEncryptionIV()).toHaveLength(16);
        expect(decrypted).toEqual(payload);
    });
});
