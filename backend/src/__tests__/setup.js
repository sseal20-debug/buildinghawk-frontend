/**
 * Jest setup file for backend tests
 * Sets up test environment and global utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3002';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Note: Each test file manages its own mocks to avoid ESM module issues
