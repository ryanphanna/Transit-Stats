
import { vi } from 'vitest';

// Mock Firebase
vi.mock('../js/firebase.js', () => {
    return {
        db: {
            collection: vi.fn(() => ({
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                get: vi.fn().mockResolvedValue({ docs: [], empty: true, forEach: vi.fn() }),
                doc: vi.fn(() => ({
                    get: vi.fn().mockResolvedValue({ exists: false }),
                    update: vi.fn().mockResolvedValue({}),
                    delete: vi.fn().mockResolvedValue({})
                })),
                add: vi.fn().mockResolvedValue({ id: 'mock-id' })
            }))
        },
        auth: {
            onAuthStateChanged: vi.fn(),
            signInWithEmailAndPassword: vi.fn(),
            signOut: vi.fn(),
            isSignInWithEmailLink: vi.fn(() => false),
            sendSignInLinkToEmail: vi.fn()
        },
        Timestamp: {
            now: vi.fn(() => ({ toDate: () => new Date() })),
            fromDate: vi.fn((date) => ({ toDate: () => date }))
        },
        default: {
            apps: [],
            initializeApp: vi.fn()
        }
    };
});

// Mock Global window objects
global.window = {
    currentUser: null,
    location: { origin: 'http://localhost', pathname: '/' },
    localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
    }
};

global.document = {
    getElementById: vi.fn(() => ({
        addEventListener: vi.fn(),
        appendChild: vi.fn()
    })),
    body: {
        setAttribute: vi.fn(),
        removeAttribute: vi.fn()
    },
    querySelectorAll: vi.fn(() => [])
};

global.navigator = {
    geolocation: {
        getCurrentPosition: vi.fn()
    }
};

global.firebase = {
    firestore: {
        Timestamp: {
            now: vi.fn(() => ({ toDate: () => new Date() })),
            fromDate: vi.fn((date) => ({ toDate: () => date }))
        }
    }
};
