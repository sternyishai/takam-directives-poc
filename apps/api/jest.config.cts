const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  // Jest skips node_modules when it transforms code. sanitize-html's HTML
  // parser (htmlparser2) and the packages it uses ship only as ES modules,
  // which Jest can't load untransformed, so they are the exception.
  transformIgnorePatterns: [
    'node_modules/(?!(htmlparser2|entities|domhandler|domutils|dom-serializer|domelementtype)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
