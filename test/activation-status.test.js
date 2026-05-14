const path = require('path');

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockLoadFile = jest.fn();
const mockSetApplicationMenu = jest.fn();
const mockOnHeadersReceived = jest.fn();
const mockWebContentsOn = jest.fn();
const mockIpcHandle = jest.fn();
const mockIpcOn = jest.fn();

jest.mock('fs', () => ({
    promises: {
        readFile: (...args) => mockReadFile(...args),
        writeFile: (...args) => mockWriteFile(...args),
        mkdir: jest.fn(),
    },
}));

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn((name) => {
            if (name === 'appData') {
                return '/tmp/appdata';
            }
            if (name === 'home') {
                return '/tmp/home';
            }
            return '/tmp';
        }),
        getAppPath: jest.fn(() => '/tmp/app'),
        whenReady: jest.fn(() => ({ then: jest.fn() })),
        on: jest.fn(),
        quit: jest.fn(),
        isReady: jest.fn(() => false),
    },
    BrowserWindow: jest.fn(() => ({
        loadFile: mockLoadFile,
        webContents: {
            on: mockWebContentsOn,
            session: {
                webRequest: {
                    onHeadersReceived: mockOnHeadersReceived,
                },
            },
        },
        getBounds: jest.fn(() => ({ width: 1024, height: 768 })),
        setBrowserView: jest.fn(),
        removeBrowserView: jest.fn(),
        on: jest.fn(),
        close: jest.fn(),
        focus: jest.fn(),
        maximize: jest.fn(),
    })),
    BrowserView: jest.fn(),
    shell: {
        openExternal: jest.fn(),
    },
    ipcMain: {
        handle: mockIpcHandle,
        on: mockIpcOn,
    },
    Menu: {
        setApplicationMenu: mockSetApplicationMenu,
    },
}));

jest.mock('../cache', () => ({
    getGlobalCacheManager: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
    })),
}));

jest.mock('../logger', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('../modules/product-name-manager', () => ({
    initialize: jest.fn(),
    getProductNameConfig: jest.fn(),
    setProductNameConfig: jest.fn(),
}));

jest.mock('../modules/logo-handler', () => ({
    initialize: jest.fn(),
    saveLogo: jest.fn(),
    getLogosList: jest.fn(),
    deleteLogo: jest.fn(),
}));

jest.mock('../modules/usage-stats', () => ({
    initialize: jest.fn(),
    closeDatabase: jest.fn(),
    recordUsageStart: jest.fn(),
    recordUsageEnd: jest.fn(),
    getUsageStats: jest.fn(),
    clearUsageStats: jest.fn(),
}));

jest.mock('../modules/permission-manager', () => ({
    initializePermissions: jest.fn(),
    verifyAdminPassword: jest.fn(),
    checkPermission: jest.fn(),
    revokeSession: jest.fn(),
    updateAdminPassword: jest.fn(),
}));

jest.mock('../modules/secret-manager', () => ({
    initialize: jest.fn(),
    getActivationSecretKey: jest.fn(() => 'secret'),
}));

jest.mock('../modules/machine-code-manager', () => ({
    getMachineCodeData: jest.fn(),
}));

jest.mock('../modules/vm-detector', () => ({
    detectVirtualMachine: jest.fn(),
}));

jest.mock('../modules/activation-crypto', () => ({
    decryptActivationData: jest.fn(),
    encryptActivationData: jest.fn(() => 'migrated-encrypted-payload'),
}));

describe('activation status compatibility', () => {
    beforeEach(() => {
        jest.resetModules();
        mockReadFile.mockReset();
        mockWriteFile.mockReset();
        mockLoadFile.mockReset();
        mockSetApplicationMenu.mockReset();
        mockOnHeadersReceived.mockReset();
        mockWebContentsOn.mockReset();
        mockIpcHandle.mockReset();
        mockIpcOn.mockReset();
    });

    test('should accept a legacy machine code from encrypted activation data and migrate it', async () => {
        const config = require('../config');
        const machineCodeManager = require('../modules/machine-code-manager');
        const activationCrypto = require('../modules/activation-crypto');

        const storagePath = config.getActivationStoragePath();
        mockReadFile.mockResolvedValue(JSON.stringify({
            machineCode: 'legacy-machine-code',
            activationCode: 'existing-activation-code',
            activatedDate: '2026-05-01T00:00:00.000Z',
            encrypted: 'encrypted-payload',
        }));
        activationCrypto.decryptActivationData.mockReturnValue({
            machineCode: 'legacy-machine-code',
            activationCode: 'existing-activation-code',
        });
        machineCodeManager.getMachineCodeData.mockResolvedValue({
            machineCode: 'stable-machine-code',
            machineCodeCandidates: ['stable-machine-code', 'legacy-machine-code'],
            hardwareInfo: { stableMac: 'ETH', stableHardDisk: 'DISK' },
        });

        const mainModule = require('../main');

        const isActivated = await mainModule.checkActivationStatus();

        expect(isActivated).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledWith(
            storagePath,
            expect.stringContaining('"machineCode":"stable-machine-code"')
        );
        expect(mockWriteFile).toHaveBeenCalledWith(
            storagePath,
            expect.stringContaining('"encrypted":"migrated-encrypted-payload"')
        );
    });
});
