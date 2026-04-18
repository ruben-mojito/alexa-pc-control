'use strict';

const { execSync } = require('child_process');
jest.mock('child_process', () => ({ execSync: jest.fn() }));

const { shutdown } = require('../src/commands/shutdown');
const { reboot } = require('../src/commands/reboot');

describe('shutdown command', () => {
  beforeEach(() => execSync.mockClear());

  it('calls shutdown with delay 0 on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    shutdown(0);
    expect(execSync).toHaveBeenCalledWith('shutdown -h now');
  });

  it('calls shutdown with a delay on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    shutdown(120);
    expect(execSync).toHaveBeenCalledWith('shutdown -h +2');
  });

  it('calls shutdown on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    shutdown(30);
    expect(execSync).toHaveBeenCalledWith('shutdown /s /t 30');
  });
});

describe('reboot command', () => {
  beforeEach(() => execSync.mockClear());

  it('calls reboot with delay 0 on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    reboot(0);
    expect(execSync).toHaveBeenCalledWith('shutdown -r now');
  });

  it('calls reboot with a delay on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    reboot(60);
    expect(execSync).toHaveBeenCalledWith('shutdown -r +1');
  });

  it('calls reboot on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    reboot(0);
    expect(execSync).toHaveBeenCalledWith('shutdown /r /t 0');
  });
});
