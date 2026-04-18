'use strict';

const { execSync } = require('child_process');

/**
 * Schedules a system shutdown.
 * @param {number} delaySeconds - Seconds before shutdown (0 = immediate).
 */
function shutdown(delaySeconds = 0) {
  const delay = Math.max(0, Math.floor(delaySeconds));
  console.log(`[agent] Executing shutdown in ${delay}s`);

  if (process.platform === 'win32') {
    execSync(`shutdown /s /t ${delay}`);
  } else {
    // Linux / macOS
    const minutes = Math.ceil(delay / 60);
    const time = delay === 0 ? 'now' : `+${minutes}`;
    execSync(`shutdown -h ${time}`);
  }
}

module.exports = { shutdown };
