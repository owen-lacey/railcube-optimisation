# /// script
# requires-python = ">=3.11"
# dependencies = ["ortools==9.12.4544"]
# ///
"""Native CP-SAT for src/solver/native.js: protobuf bytes in, protobuf bytes out.

Pinned to 9.12, the OR-Tools cpsat-js is built from, so the two engines run the
same solver and differ only in WASM against native code. 9.12 is also the last
release whose Python wrapper holds a plain protobuf, so the model bytes load as
they are; from 9.13 they would need a text-format round trip.

stdin:  u32 length + CpModelProto, u32 length + SatParameters (big-endian)
stdout: frames of one tag byte + u32 length + CpSolverResponse —
        b"S" for each solution as it is found (only with --observe), then one b"R"
"""

import struct
import sys

from ortools.sat import cp_model_pb2, sat_parameters_pb2
from ortools.sat.python import cp_model


def read_message(stream, message):
    (length,) = struct.unpack(">I", stream.read(4))
    message.ParseFromString(stream.read(length))
    return message


def write_frame(tag, message):
    data = message.SerializeToString()
    sys.stdout.buffer.write(tag + struct.pack(">I", len(data)) + data)
    sys.stdout.buffer.flush()


class Observer(cp_model.CpSolverSolutionCallback):
    def on_solution_callback(self):
        write_frame(b"S", self.response_proto)


model = cp_model.CpModel()
model.proto.CopyFrom(read_message(sys.stdin.buffer, cp_model_pb2.CpModelProto()))
solver = cp_model.CpSolver()
solver.parameters.CopyFrom(read_message(sys.stdin.buffer, sat_parameters_pb2.SatParameters()))

solver.solve(model, Observer() if "--observe" in sys.argv else None)
write_frame(b"R", solver.response_proto)
