#!/usr/bin/env node
setTimeout(() => {
  console.error('Warning: missing optional config, continuing with defaults');
}, 25);

setTimeout(() => process.exit(1), 100);
