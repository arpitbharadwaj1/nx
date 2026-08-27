import type { Mock } from 'vitest';
import {
  getForkedProcessOsSocketPath,
  getFullOsSocketPath,
  getPluginOsSocketPath,
} from './socket-utils';
import {
  getDaemonSocketPath,
  getForkedProcessSocketPath,
  getPluginSocketPath,
} from './tmp-dir';

// Where a socket lives, what it is called, and whether it fits the platform's
// budget are all decided in native/utils/socket_path.rs and reported by
// tmp-dir.ts. What is left here is that each entry point asks for its own kind.
vi.mock('./tmp-dir', () => ({
  getDaemonSocketPath: vi.fn(() => '/tmp/.nx/501/sockets/abc/d.sock'),
  getForkedProcessSocketPath: vi.fn((id: string) => `/fp/${id}`),
  getPluginSocketPath: vi.fn((id: string) => `/p/${id}`),
}));

describe('socket paths', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should ask for the daemon socket', () => {
    expect(getFullOsSocketPath()).toBe('/tmp/.nx/501/sockets/abc/d.sock');
    expect(getDaemonSocketPath).toHaveBeenCalled();
  });

  it('should pass the worker id through for the per-worker sockets', () => {
    // The id is what keeps two plugin workers, or two forked tasks, off each
    // other's socket.
    expect(getPluginOsSocketPath('123-0-12345678')).toBe('/p/123-0-12345678');
    expect(getForkedProcessOsSocketPath('7')).toBe('/fp/7');

    expect(getPluginSocketPath as Mock).toHaveBeenCalledWith('123-0-12345678');
    expect(getForkedProcessSocketPath as Mock).toHaveBeenCalledWith('7');
  });
});
