import { unlinkSync } from 'fs';
import { platform } from 'os';
import {
  getDaemonSocketPath,
  getForkedProcessSocketPath,
  getPluginSocketPath,
} from './tmp-dir';
import { createSerializableError } from '../utils/serializable-error';
import { isV8SerializerEnabled } from './is-v8-serializer-enabled';
import { serialize as v8_serialize } from 'v8';

export const isWindows = platform() === 'win32';

/**
 * For IPC with the daemon server we use unix sockets or windows named pipes,
 * depending on the user's operating system.
 *
 * The paths themselves — the directory, the file name, the named-pipe form, and
 * the length budget — are all decided in `native/utils/socket_path.rs`, so that
 * Nx and Nx Console cannot disagree about where a socket lives.
 *
 * See https://nodejs.org/dist/latest-v14.x/docs/api/net.html#net_identifying_paths_for_ipc_connections
 * for a full breakdown of OS differences between Unix domain sockets and named
 * pipes.
 */
export const getFullOsSocketPath = () => getDaemonSocketPath();

export const getForkedProcessOsSocketPath = (id: string) =>
  getForkedProcessSocketPath(id);

export const getPluginOsSocketPath = (id: string) => getPluginSocketPath(id);

export function killSocketOrPath(): void {
  try {
    unlinkSync(getFullOsSocketPath());
  } catch {}
}

// Prepare a serialized project graph result for sending over IPC from the server to the client
export function serializeResult(
  error: Error | null,
  serializedProjectGraph: string | null,
  serializedSourceMaps: string | null
): string | null {
  // We do not want to repeat work `JSON.stringify`ing an object containing the potentially large project graph so merge as strings
  return `{ "error": ${JSON.stringify(
    error ? createSerializableError(error) : error
  )}, "projectGraph": ${serializedProjectGraph}, "sourceMaps": ${serializedSourceMaps} }`;
}

/**
 * Helper to serialize data either using v8 serialization or JSON serialization, based on
 * the user's preference and the success of each method. Should only be used by "client" side
 * connections, daemon or other servers should respond based on the type of serialization used
 * by the client it is communicating with.
 *
 * @param data Data to serialize
 * @param force Forces one serialization method over the other
 * @returns Serialized data as a string
 */
export function serialize(data: any, force?: 'v8' | 'json'): string {
  if (force === 'v8' || isV8SerializerEnabled()) {
    try {
      return v8_serialize(data).toString('binary');
    } catch (e) {
      if (force !== 'v8') {
        console.warn(
          `Data could not be serialized using v8 serialization: ${e}. Falling back to JSON serialization.`
        );
        // Fall back to JSON serialization
        return JSON.stringify(data);
      }
      throw e;
    }
  } else {
    try {
      return JSON.stringify(data);
    } catch (e) {
      if (force !== 'json') {
        // Fall back to v8 serialization
        console.warn(
          `Data could not be serialized using JSON.stringify: ${e}. Falling back to v8 serialization.`
        );
        return v8_serialize(data).toString('binary');
      }
      throw e;
    }
  }
}
