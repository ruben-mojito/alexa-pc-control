'use strict';

const { execSync } = require('child_process');

/**
 * Schedules a system reboot.
 * @param {number} delaySeconds - Seconds before reboot (0 = immediate).
 */
function reboot(delaySeconds = 0) {
  const delay = Math.max(0, Math.floor(delaySeconds));
  console.log(`[agent] Executing reboot in ${delay}s`);

  if (process.platform === 'win32') {
    execSync(`shutdown /r /t ${delay}`);
  } else {
    // Linux / macOS
    const minutes = Math.ceil(delay / 60);
    const time = delay === 0 ? 'now' : `+${minutes}`;
    execSync(`shutdown -r ${time}`);
  }
}

module.exports = { reboot };
