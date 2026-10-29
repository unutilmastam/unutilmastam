// Deterministic test configuration; never real credentials.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'mysql://test:test@127.0.0.1:3306/hq_test_unused';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.APP_SECRET_KEY = 'test-only-key-0123456789abcdefghijklmnop';
process.env.SETUP_TOKEN = 'setup-token-for-tests-0123456789';
process.env.LOG_LEVEL = 'warn';
delete process.env.TOTP_REQUIRED;
