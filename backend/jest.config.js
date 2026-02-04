module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/services/**/*.ts', '!src/**/*.d.ts'],
};
