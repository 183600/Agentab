// test/setup.js - Test setup and mocks

import { vi } from 'vitest';

// Mock Chrome APIs
const mockChromeStorage = {
  local: {
    data: {},
    QUOTA_BYTES: 5242880,
    get: vi.fn(keys => {
      const result = {};
      if (typeof keys === 'string') {
        result[keys] = mockChromeStorage.local.data[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach(key => {
          result[key] = mockChromeStorage.local.data[key];
        });
      } else if (keys === null || keys === undefined) {
        // Return all data
        return Promise.resolve({ ...mockChromeStorage.local.data });
      }
      return Promise.resolve(result);
    }),
    set: vi.fn(items => {
      Object.assign(mockChromeStorage.local.data, items);
      return Promise.resolve();
    }),
    remove: vi.fn(keys => {
      if (typeof keys === 'string') {
        delete mockChromeStorage.local.data[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach(key => delete mockChromeStorage.local.data[key]);
      }
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      mockChromeStorage.local.data = {};
      return Promise.resolve();
    })
  }
};

const mockChromeRuntime = {
  id: 'test-extension-id-' + Math.random().toString(36).substr(2, 9),
  sendMessage: vi.fn(() => Promise.resolve({ success: true })),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  },
  onInstalled: {
    addListener: vi.fn()
  }
};

const mockChromeTabs = {
  query: vi.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
  get: vi.fn(id => Promise.resolve({ id, url: 'https://example.com' })),
  update: vi.fn(() => Promise.resolve()),
  captureVisibleTab: vi.fn(() => Promise.resolve('data:image/png;base64,mock')),
  onRemoved: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  },
  onUpdated: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  }
};

const mockChromeScripting = {
  executeScript: vi.fn(() => Promise.resolve([{ result: {} }]))
};

const mockChromeAlarms = {
  create: vi.fn(),
  clear: vi.fn(() => Promise.resolve(true)),
  clearAll: vi.fn(() => Promise.resolve(true)),
  get: vi.fn(() => Promise.resolve(null)),
  getAll: vi.fn(() => Promise.resolve([])),
  onAlarm: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  }
};

const mockChromeI18n = {
  getMessage: vi.fn(key => key),
  getAcceptLanguages: vi.fn(() => Promise.resolve(['en', 'zh-CN']))
};

// Setup global chrome mock
global.chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
  tabs: mockChromeTabs,
  scripting: mockChromeScripting,
  alarms: mockChromeAlarms,
  i18n: mockChromeI18n,
  action: {
    onClicked: {
      addListener: vi.fn()
    }
  },
  sidePanel: {
    open: vi.fn(),
    setPanelBehavior: vi.fn()
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn()
    }
  }
};

// Mock performance API
global.performance = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntries: vi.fn(() => []),
  getEntriesByType: vi.fn(() => []),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
  clearResourceTimings: vi.fn(),
  memory: {
    usedJSHeapSize: 10000000,
    totalJSHeapSize: 20000000,
    jsHeapSizeLimit: 50000000
  }
};

// Mock Web Crypto API using vi.stubGlobal to handle Node.js read-only properties
const mockCryptoKey = { type: 'secret', algorithm: { name: 'AES-GCM' } };

// Store for encryption/decryption roundtrip
const encryptedDataStore = new Map();
let encryptionCounter = 0;

const mockCrypto = {
  subtle: {
    digest: vi.fn(async (algorithm, data) => {
      // Simple mock hash
      const hash = new Uint8Array(32);
      const view = new DataView(data.buffer || data);
      for (let i = 0; i < 32 && i < view.byteLength; i++) {
        hash[i] = view.getUint8(i % view.byteLength);
      }
      return hash.buffer;
    }),
    encrypt: vi.fn(async (algorithm, key, data) => {
      // Store original data for later decryption
      const id = ++encryptionCounter;
      const encoder = new TextEncoder();
      const originalData = new Uint8Array(data);
      encryptedDataStore.set(id, originalData);

      // Return encrypted data with id embedded (mock format)
      const result = new Uint8Array(4 + originalData.length);
      const idView = new DataView(result.buffer, 0, 4);
      idView.setUint32(0, id, true);
      result.set(originalData, 4);
      return result.buffer;
    }),
    decrypt: vi.fn(async (algorithm, key, data) => {
      // Retrieve original data using embedded id
      const encryptedArray = new Uint8Array(data);
      if (encryptedArray.length >= 4) {
        const idView = new DataView(encryptedArray.buffer, 0, 4);
        const id = idView.getUint32(0, true);
        const originalData = encryptedDataStore.get(id);
        if (originalData) {
          return originalData.buffer;
        }
      }
      // Fallback: return data as-is (for compatibility)
      return data;
    }),
    generateKey: vi.fn(async () => mockCryptoKey),
    importKey: vi.fn(async () => mockCryptoKey),
    exportKey: vi.fn(async () => new ArrayBuffer(32)),
    deriveKey: vi.fn(async () => mockCryptoKey),
    deriveBits: vi.fn(async () => new ArrayBuffer(32))
  },
  getRandomValues: vi.fn(arr => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  })
};

// Stub crypto for Node.js environment
vi.stubGlobal('crypto', mockCrypto);

// Reset mocks before each test
beforeEach(() => {
  mockChromeStorage.local.data = {};
  vi.clearAllMocks();
});

// Export mocks for use in tests
export {
  mockChromeStorage,
  mockChromeRuntime,
  mockChromeTabs,
  mockChromeScripting,
  mockChromeAlarms
};
