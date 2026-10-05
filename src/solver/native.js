/**
 * The model on native CP-SAT, for Node: `solveNative(model, params)` is
 * `CpSolver.solve` with the search run by OR-Tools in a child process.
 *
 * There is no second model. The model `buildModel` made is sent as the very
 * CpModelProto bytes cpsat-js hands its WASM, and the response comes back as a
 * CpSolverResponse, read into the same shape `CpSolver.solve` returns — so
 * everything after the solve (selectors, `report`, the `chainTrack` recount) is
 * the same code on either engine. native.py is pinned to the OR-Tools cpsat-js
 * is built from, so what differs is WASM against native code, and nothing else.
 * Measured on one model file: 1.6–2.4× at the median, and a far shorter tail.
 *
 * Unlike the WASM, the search runs outside this thread, so `onSolution` is live
 * at any worker count: each solution is delivered as it is found. A throw from
 * it kills the search and rejects the solve, as a live WASM callback's throw
 * abandons the search.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  create, toBinary, fromBinary,
  CpModelProtoSchema, CpSolverResponseSchema, SatParametersSchema,
} from 'cpsat-js/proto';

const SCRIPT = fileURLToPath(new URL('./native.py', import.meta.url));

/** A length-prefixed message, as native.py reads one. */
function framed(bytes) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  return Buffer.concat([header, bytes]);
}

/** A response, read as cpsat-js reads one — the shape `CpSolver.solve` returns. */
function readResponse(bytes) {
  const response = fromBinary(CpSolverResponseSchema, bytes);
  return {
    status: response.status,
    objectiveValue: response.objectiveValue,
    bestObjectiveBound: response.bestObjectiveBound,
    wallTime: response.wallTime,
    value: variable => Number(response.solution[variable.index]),
    response,
  };
}

/** The parameters `CpSolver.solve` would set, with its default of 8 workers. */
function parametersOf({ maxTimeInSeconds, numWorkers = 8, enumerateAllSolutions }) {
  return create(SatParametersSchema, {
    numWorkers,
    ...(maxTimeInSeconds !== undefined ? { maxTimeInSeconds } : {}),
    ...(enumerateAllSolutions !== undefined ? { enumerateAllSolutions } : {}),
  });
}

/**
 * Pull whole frames off the front of `buffer`: a tag byte, a u32 length, the
 * bytes. Returns the frames and whatever partial frame is left over.
 */
function framesIn(buffer) {
  const frames = [];
  let at = 0;
  while (buffer.length - at >= 5 && buffer.length - at >= 5 + buffer.readUInt32BE(at + 1)) {
    const length = buffer.readUInt32BE(at + 1);
    frames.push({ tag: String.fromCharCode(buffer[at]), bytes: buffer.subarray(at + 5, at + 5 + length) });
    at += 5 + length;
  }
  return { frames, rest: buffer.subarray(at) };
}

export function solveNative(model, { onSolution, ...params } = {}) {
  const input = Buffer.concat([
    framed(toBinary(CpModelProtoSchema, model.toProto())),
    framed(toBinary(SatParametersSchema, parametersOf(params))),
  ]);
  const child = spawn('uv', ['run', '--quiet', SCRIPT, ...(onSolution ? ['--observe'] : [])], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);
    let result = null;
    let failure = null;
    const stderr = [];

    child.stdout.on('data', chunk => {
      const { frames, rest } = framesIn(Buffer.concat([pending, chunk]));
      pending = rest;
      for (const { tag, bytes } of frames) {
        if (tag === 'R') {
          result = readResponse(bytes);
        } else if (failure === null) {
          try {
            onSolution({ ...readResponse(bytes), live: true });
          } catch (error) {
            failure = error;
            child.kill();
          }
        }
      }
    });
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (failure !== null) reject(failure);
      else if (code !== 0 || result === null || pending.length) {
        reject(new Error(`native CP-SAT exited ${code}: ${Buffer.concat(stderr).toString()}`));
      } else resolve(result);
    });
    child.stdin.end(input);
  });
}
