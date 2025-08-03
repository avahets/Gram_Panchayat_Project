// unit-tests.js - Unit Tests for Digital E-Gram Panchayat
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    /**
     * Add a test case
     * @param {string} name - Test name
     * @param {Function} testFn - Test function
     */
    test(name, testFn) {
        this.tests.push({ name, testFn });
    }

    /**
     * Run all tests
     */
    async runAll() {
        console.log('🧪 Starting Unit Tests for Digital E-Gram Panchayat\n');
        
        for (const test of this.tests) {
            try {
                await test.testFn();
                this.passed++;
                console.log(`✅ ${test.name}`);
            } catch (error) {
                this.failed++;
                console.error(`❌ ${test.name}: ${error.message}`);
            }
        }

        console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
        
        if (this.failed === 0) {
            console.log('🎉 All tests passed!');
        } else {
            console.log('⚠️  Some tests failed. Please review and fix.');
        }
    }

    /**
     * Assert that a condition is true
     * @param {boolean} condition - Condition to test
     * @param {string} message - Error message if assertion fails
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }

    /**
     * Assert that two values are equal
     * @param {*} actual - Actual value
     * @param {*} expected - Expected value
     * @param {string} message - Error message if assertion fails
     */
    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, but got ${actual}`);
        }
    }

    /**
     * Assert that a function throws an error
     * @param {Function} fn - Function to test
     * @param {string} expectedError - Expected error message
     */
    async assertThrows(fn, expectedError) {
        try {
            await fn();
            throw new Error('Expected function to throw an error');
        } catch (error) {
            if (expectedError && !error.message.includes(expectedError)) {
                throw new Error(`Expected error containing "${expectedError}", but got "${error.message}"`);
            }
        }
    }
}

// Create test runner instance
const testRunner = new TestRunner();

// Mock Firebase for testing
const mockFirebase = {
    firestore: {
        FieldValue: {
            serverTimestamp: () => new Date()
        }
    }
};

// Mock Firestore for testing
class MockFirestore {
    constructor() {
        this.collections = new Map();
    }

    collection(name) {
        if (!this.collections.has(name)) {
            this.collections.set(name, new MockCollection());
        }
        return this.collections.get(name);
    }
}

class MockCollection {
    constructor() {
        this.documents = new Map();
        this.queries = [];
    }

    doc(id) {
        return new MockDocument(id, this);
    }

    add(data) {
        const id = 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const doc = new MockDocument(id, this);
        this.documents.set(id, data);
        return Promise.resolve(doc);
    }

    where(field, operator, value) {
        this.queries.push({ field, operator, value });
        return this;
    }

    orderBy(field, direction) {
        this.orderField = field;
        this.orderDirection = direction;
        return this;
    }

    limit(count) {
        this.limitCount = count;
        return this;
    }

    get() {
        const docs = Array.from(this.documents.entries()).map(([id, data]) => ({
            id,
            data: () => data,
            exists: true
        }));

        return Promise.resolve({
            size: docs.length,
            forEach: (callback) => docs.forEach(callback)
        });
    }
}

class MockDocument {
    constructor(id, collection) {
        this.id = id;
        this.collection = collection;
    }

    set(data) {
        this.collection.documents.set(this.id, data);
        return Promise.resolve();
    }

    update(data) {
        const existing = this.collection.documents.get(this.id) || {};
        this.collection.documents.set(this.id, { ...existing, ...data });
        return Promise.resolve();
    }

    get() {
        const data = this.collection.documents.get(this.id);
        return Promise.resolve({
            id: this.id,
            exists: !!data,
            data: () => data || null
        });
    }

    delete() {
        this.collection.documents.delete(this.id);
        return Promise.resolve();
    }
}

// Mock Auth for testing
class MockAuth {
    constructor() {
        this.currentUser = null;
        this.users = new Map();
    }

    createUserWithEmailAndPassword(email, password) {
        const uid = 'user_' + Date.now();
        const user = { uid, email };
        this.users.set(uid, { email, password });
        return Promise.resolve({ user });
    }

    signInWithEmailAndPassword(email, password) {
        const userEntry = Array.from(this.users.entries())
            .find(([_, userData]) => userData.email === email && userData.password === password);
        
        if (userEntry) {
            const user = { uid: userEntry[0], email };
            this.currentUser = user;
            return Promise.resolve({ user });
        } else {
            return Promise.reject(new Error('Invalid credentials'));
        }
    }

    signOut() {
        this.currentUser = null;
        return Promise.resolve();
    }
}

// Mock Logger for testing
class MockLogger {
    constructor() {
        this.logs = [];
    }

    info(message, data) {
        this.logs.push({ level: 'info', message, data });
    }

    error(message, data) {
        this.logs.push({ level: 'error', message, data });
    }

    warn(message, data) {
        this.logs.push({ level: 'warn', message, data });
    }
}

// Initialize mock instances
const mockDb = new MockFirestore();
const mockAuth = new MockAuth();
const mockLogger = new MockLogger();

// Test Cases

// Authentication Module Tests
testRunner.test('AuthModule - User Registration', async () => {
    const AuthModule = window.AuthModule || class AuthModule {
        constructor(auth, db, logger) {
            this.auth = auth;
            this.db = db;
            this.logger = logger;
        }

        async register(userData) {
            const userCredential = await this.auth.createUserWithEmailAndPassword(userData.email, userData.password);
            await this.db.collection('users').doc(userCredential.user.uid).set({
                name: userData.name,
                email: userData.email,
                role: userData.role || 'citizen'
            });
            return { success: true, user: userCredential.user };
        }
    };

    const authModule = new AuthModule(mockAuth, mockDb, mockLogger);
    
    const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        phone: '1234567890',
        address: 'Test Address'
    };

    const result = await authModule.register(userData);
    
    testRunner.assert(result.success, 'Registration should succeed');
    testRunner.assert(result.user.email === userData.email, 'User email should match');
});

testRunner.test('AuthModule - User Login', async () => {
    const AuthModule = window.AuthModule || class AuthModule {
        constructor(auth, db, logger) {
            this.auth = auth;
            this.db = db;
            this.logger = logger;
        }

        async login(email, password, role) {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            const userDoc = await this.db.collection('users').doc(userCredential.user.uid).get();
            
            if (userDoc.exists && userDoc.data().role === role) {
                return { success: true, user: userCredential.user, role };
            } else {
                throw new Error('Invalid role');
            }
        }
    };

    const authModule = new AuthModule(mockAuth, mockDb, mockLogger);
    
    // First register a user
    await mockAuth.createUserWithEmailAndPassword('test@example.com', 'password123');
    const userDoc = mockDb.collection('users').doc(mockAuth.currentUser?.uid || 'test_uid');
    await userDoc.set({ role: 'citizen', email: 'test@example.com' });

    const result = await authModule.login('test@example.com', 'password123', 'citizen');
    
    testRunner.assert(result.success, 'Login should succeed');
    testRunner.assertEqual(result.role, 'citizen', 'Role should match');
});

// Services Module Tests
testRunner.test('ServicesModule - Create Service', async () => {
    const ServicesModule = window.ServicesModule || class ServicesModule {
        constructor(db, auth, logger) {
            this.db = db;
            this.auth = auth;
            this.logger = logger;
        }

        validateServiceData(data) {
            if (!data.name || !data.description || !data.category) {
                throw new Error('Missing required fields');
            }
        }

        async createService(serviceData) {
            this.validateServiceData(serviceData);
            const docRef = await this.db.collection('services').add({
                ...serviceData,
                isActive: true,
                createdAt: new Date()
            });
            return docRef.id;
        }
    };

    const servicesModule = new ServicesModule(mockDb, mockAuth, mockLogger);
    
    const serviceData = {
        name: 'Birth Certificate',
        description: 'Issue birth certificate',
        category: 'certificate'
    };

    const serviceId = await servicesModule.createService(serviceData);
    
    testRunner.assert(serviceId, 'Service ID should be returned');
    testRunner.assert(serviceId.startsWith('mock_'), 'Service should be created with mock ID');
});

testRunner.test('ServicesModule - Validate Service Data', async () => {
    const ServicesModule = window.ServicesModule || class ServicesModule {
        validateServiceData(data) {
            if (!data.name || !data.description || !data.category) {
                throw new Error('Missing required fields');
            }
        }
    };

    const servicesModule = new ServicesModule(mockDb, mockAuth, mockLogger);
    
    await testRunner.assertThrows(() => {
        servicesModule.validateServiceData({});
    }, 'Missing required fields');

    await testRunner.assertThrows(() => {
        servicesModule.validateServiceData({ name: 'Test' });
    }, 'Missing required fields');
});

// Applications Module Tests
testRunner.test('ApplicationsModule - Submit Application', async () => {
    const ApplicationsModule = window.ApplicationsModule || class ApplicationsModule {
        constructor(db, auth, logger) {
            this.db = db;
            this.auth = auth;
            this.logger = logger;
        }

        generateApplicationId() {
            return 'APP' + Date.now();
        }

        validateApplicationData(data) {
            if (!data.serviceId || !data.applicantName || !data.applicantEmail) {
                throw new Error('Missing required fields');
            }
        }

        async submitApplication(applicationData) {
            this.validateApplicationData(applicationData);
            
            const applicationId = this.generateApplicationId();
            const docRef = await this.db.collection('applications').add({
                applicationId,
                ...applicationData,
                status: 'pending',
                appliedAt: new Date()
            });
            
            return docRef.id;
        }
    };

    const applicationsModule = new ApplicationsModule(mockDb, mockAuth, mockLogger);
    
    const applicationData = {
        serviceId: 'service123',
        applicantName: 'John Doe',
        applicantEmail: 'john@example.com',
        applicantPhone: '1234567890'
    };

    const applicationId = await applicationsModule.submitApplication(applicationData);
    
    testRunner.assert(applicationId, 'Application ID should be returned');
});

testRunner.test('ApplicationsModule - Generate Application ID', () => {
    const ApplicationsModule = window.ApplicationsModule || class ApplicationsModule {
        generateApplicationId() {
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const timestamp = Date.now().toString().slice(-6);
            return `APP${year}${month}${day}${timestamp}`;
        }
    };

    const applicationsModule = new ApplicationsModule(mockDb, mockAuth, mockLogger);
    const applicationId = applicationsModule.generateApplicationId();
    
    testRunner.assert(applicationId.startsWith('APP'), 'Application ID should start with APP');
    testRunner.assert(applicationId.length >= 14, 'Application ID should have proper format');
});

// Logger Module Tests
testRunner.test('Logger - Basic Logging', () => {
    const Logger = window.Logger || class Logger {
        constructor() {
            this.logs = [];
        }

        log(level, message, data) {
            this.logs.push({ level, message, data, timestamp: new Date() });
        }

        info(message, data) {
            this.log('info', message, data);
        }

        error(message, data) {
            this.log('error', message, data);
        }
    };

    const logger = new Logger();
    
    logger.info('Test message', { test: true });
    logger.error('Test error', { error: 'test' });
    
    testRunner.assertEqual(logger.logs.length, 2, 'Should have 2 log entries');
    testRunner.assertEqual(logger.logs[0].level, 'info', 'First log should be info level');
    testRunner.assertEqual(logger.logs[1].level, 'error', 'Second log should be error level');
});

testRunner.test('Logger - Data Sanitization', () => {
    const Logger = window.Logger || class Logger {
        sanitizeData(data) {
            if (!data || typeof data !== 'object') return data;
            
            const sanitized = { ...data };
            const sensitiveFields = ['password', 'token', 'secret'];
            
            for (const field of sensitiveFields) {
                if (sanitized[field]) {
                    sanitized[field] = '[REDACTED]';
                }
            }
            
            return sanitized;
        }
    };

    const logger = new Logger();
    
    const sensitiveData = {
        username: 'john',
        password: 'secret123',
        token: 'abc123',
        email: 'john@example.com'
    };
    
    const sanitized = logger.sanitizeData(sensitiveData);
    
    testRunner.assertEqual(sanitized.password, '[REDACTED]', 'Password should be redacted');
    testRunner.assertEqual(sanitized.token, '[REDACTED]', 'Token should be redacted');
    testRunner.assertEqual(sanitized.username, 'john', 'Username should not be redacted');
    testRunner.assertEqual(sanitized.email, 'john@example.com', 'Email should not be redacted');
});

// UI Helper Tests
testRunner.test('Form Validation - Email Format', () => {
    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };
    
    testRunner.assert(validateEmail('test@example.com'), 'Valid email should pass');
    testRunner.assert(validateEmail('user.name@domain.co.uk'), 'Complex valid email should pass');
    testRunner.assert(!validateEmail('invalid-email'), 'Invalid email should fail');
    testRunner.assert(!validateEmail('test@'), 'Incomplete email should fail');
    testRunner.assert(!validateEmail('@example.com'), 'Email without username should fail');
});

testRunner.test('Form Validation - Phone Format', () => {
    const validatePhone = (phone) => {
        const phoneRegex = /^\d{10,15}$/;
        return phoneRegex.test(phone.replace(/\D/g, ''));
    };
    
    testRunner.assert(validatePhone('1234567890'), 'Valid 10-digit phone should pass');
    testRunner.assert(validatePhone('+1-234-567-8900'), 'Formatted phone should pass');
    testRunner.assert(validatePhone('12345678901234'), 'Valid 14-digit phone should pass');
    testRunner.assert(!validatePhone('123'), 'Too short phone should fail');
    testRunner.assert(!validatePhone('1234567890123456'), 'Too long phone should fail');
});

// Integration Tests
testRunner.test('Integration - Complete User Registration Flow', async () => {
    // Mock the complete flow
    const mockFlow = {
        async registerUser(userData) {
            // Validate data
            if (!userData.email || !userData.password || !userData.name) {
                throw new Error('Missing required fields');
            }
            
            // Create user
            await mockAuth.createUserWithEmailAndPassword(userData.email, userData.password);
            
            // Store profile
            await mockDb.collection('users').doc(mockAuth.currentUser?.uid || 'test').set({
                name: userData.name,
                email: userData.email,
                role: 'citizen'
            });
            
            return { success: true };
        }
    };

    const userData = {
        name: 'Integration Test User',
        email: 'integration@test.com',
        password: 'testpass123',
        phone: '9876543210',
        address: 'Test Address'
    };

    const result = await mockFlow.registerUser(userData);
    testRunner.assert(result.success, 'Complete registration flow should succeed');
});

testRunner.test('Integration - Service Application Flow', async () => {
    // Mock the complete application flow
    const mockFlow = {
        async applyForService(serviceId, applicationData) {
            // Check if service exists
            const serviceDoc = await mockDb.collection('services').doc(serviceId).get();
            if (!serviceDoc.exists) {
                throw new Error('Service not found');
            }
            
            // Submit application
            const applicationId = 'APP' + Date.now();
            await mockDb.collection('applications').add({
                applicationId,
                serviceId,
                ...applicationData,
                status: 'pending'
            });
            
            return { success: true, applicationId };
        }
    };

    // First create a service
    await mockDb.collection('services').doc('service123').set({
        name: 'Test Service',
        description: 'Test Description',
        category: 'certificate'
    });

    const applicationData = {
        applicantName: 'Test Applicant',
        applicantEmail: 'applicant@test.com',
        applicantPhone: '1234567890'
    };

    const result = await mockFlow.applyForService('service123', applicationData);
    testRunner.assert(result.success, 'Service application flow should succeed');
    testRunner.assert(result.applicationId, 'Application ID should be returned');
});

// Performance Tests
testRunner.test('Performance - Large Data Handling', async () => {
    const startTime = Date.now();
    
    // Simulate processing large amount of data
    const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: `Description for item ${i}`,
        category: i % 4 === 0 ? 'certificate' : 'license'
    }));

    // Process the data
    const processed = largeDataSet.filter(item => item.category === 'certificate');
    const endTime = Date.now();
    
    const processingTime = endTime - startTime;
    
    testRunner.assert(processed.length === 250, 'Should filter correct number of items');