import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: unknown };

export const VERSION = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
