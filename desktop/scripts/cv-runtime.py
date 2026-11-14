#!/usr/bin/env python3
"""Execute a saved CV program against the exact input files of one trial.

This is a normal Python process, not an algorithm allowlist or a security sandbox.
The native host supplies a clean environment and bounds process time/output.
"""
from __future__ import annotations

import base64
import contextlib
from collections import OrderedDict
import functools
import gc
from datetime import datetime, timezone
import hashlib
import importlib
import importlib.metadata
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import platform
import re
import sys
import time
import traceback
import types
import warnings

SCHEMA = "agentcv-python-runtime-1"
MAX_INPUT_BYTES = 64 * 1024 * 1024
MAX_ARTIFACT_BYTES = 24 * 1024 * 1024
MAX_TOTAL_ARTIFACT_BYTES = 64 * 1024 * 1024
MAX_ARTIFACTS = 48
MAX_LOG_CHARS = 512 * 1024
MAX_PROGRAM_CACHE_ENTRIES = 32
MAX_PROGRAM_CACHE_SOURCE_BYTES = 4 * 1024 * 1024

# Load only the helper packaged beside this runtime, never an arbitrary module
# from the selected algorithm's working directory or Python environment.
NATIVE_JSON = None
NATIVE_JSON_ERROR = None
try:
    import importlib.machinery
    extension = Path(__file__).resolve().parent / "native-json" / ("_agentcv_json.pyd" if sys.platform == "win32" else "_agentcv_json.abi3.so")
    if extension.is_file():
        loader = importlib.machinery.ExtensionFileLoader("_agentcv_json", str(extension))
        extension_spec = importlib.util.spec_from_file_location("_agentcv_json", extension, loader=loader)
        NATIVE_JSON = importlib.util.module_from_spec(extension_spec)
        extension_spec.loader.exec_module(NATIVE_JSON)
        if NATIVE_JSON.format_version != 1:
            raise ImportError("Unsupported native SDK JSON format")
except Exception as error:
    NATIVE_JSON, NATIVE_JSON_ERROR = None, str(error)


@contextlib.contextmanager
def program_binding_gc_probe():
    """Observe collections within compilation/rebinding; never change GC policy."""
    generations = [{"count": 0, "ms": 0.0, "collected": 0, "uncollectable": 0} for _ in range(3)]
    starts = [None, None, None]
    def observe(phase, info):
        generation = info["generation"]
        if phase == "start":
            starts[generation] = time.perf_counter()
        elif starts[generation] is not None:
            row = generations[generation]
            row["ms"] += (time.perf_counter() - starts[generation]) * 1000
            row["count"] += 1
            row["collected"] += info["collected"]
            row["uncollectable"] += info["uncollectable"]
            starts[generation] = None
    result = {"generations": generations, "scope": "nested inside program-compilation; diagnostic only, never subtracted"}
    gc.callbacks.append(observe)
    try:
        yield result
    finally:
        gc.callbacks.remove(observe)



@contextlib.contextmanager
def program_execution_gc_probe(ledger, phase="program execution"):
    """Attribute actual collections; never subtract them or change GC policy."""
    rows = []
    starts = [None, None, None]
    def observe(phase, info):
        generation = info["generation"]
        if phase == "start":
            starts[generation] = (time.perf_counter(), ledger.active_service if ledger.depth else None)
        elif starts[generation] is not None:
            started, service = starts[generation]
            starts[generation] = None
            if len(rows) < 256:
                rows.append({"generation": generation, "ms": (time.perf_counter()-started)*1000,
                             "service": service, "collected": info["collected"],
                             "uncollectable": info["uncollectable"]})
    result = {"collections": rows, "scope": f"nested inside {phase}; service is active exclusive SDK service or null outside SDK service; diagnostic only, never subtracted"}
    gc.callbacks.append(observe)
    try:
        yield result
    finally:
        gc.callbacks.remove(observe)


def compiled_program(code, filename, resident=None):
    """Cache immutable bytecode, but bind every nested traceback to this run.

    Only code objects are retained. Globals, defaults, closures and module state
    are created again by exec, exactly as for an uncached invocation.
    """
    if resident is None:
        return compile(code, filename, "exec", dont_inherit=True)
    cache = resident.setdefault("programs", OrderedDict())
    key = code.encode("utf-8")
    cached = cache.pop(key, None)
    if cached is None:
        # Compile with the actual filename so SyntaxError diagnostics are also
        # specific to the current invocation. Failed compilations are not cached.
        cached = compile(code, filename, "exec", dont_inherit=True)
        resident["compileMisses"] = resident.get("compileMisses", 0) + 1
    else:
        resident["compileHits"] = resident.get("compileHits", 0) + 1
    cache[key] = cached
    while len(cache) > MAX_PROGRAM_CACHE_ENTRIES or sum(map(len, cache)) > MAX_PROGRAM_CACHE_SOURCE_BYTES:
        cache.popitem(last=False)

    return bind_program_filename(cached, filename)


def bind_program_filename(program, filename):
    # A recursive local function retains its own closure until cyclic GC.
    # Rebinding runs often; a module function keeps the same code semantics
    # without creating an unreachable function/cell cycle on every call.
    if program.co_filename == filename:
        return program
    constants = tuple(bind_program_filename(value, filename) if isinstance(value, types.CodeType) else value
                      for value in program.co_consts)
    return program.replace(co_filename=filename, co_consts=constants)


def prepare_programs(codes, resident):
    """Compile exact sources only; ordinary execution still binds run filenames.

    This is requested after a user starts a batch, so compilation can overlap
    UI preflight. It must never execute code, read images or create artifacts.
    Syntax errors are not cached: normal execution reports the actual run path.
    """
    if not isinstance(codes, list) or len(codes) > MAX_PROGRAM_CACHE_ENTRIES:
        raise ValueError("Program preparation count exceeds cache bound")
    if any(type(code) is not str for code in codes):
        raise ValueError("Program preparation requires source strings")
    if sum(len(code.encode("utf-8")) for code in codes) > MAX_PROGRAM_CACHE_SOURCE_BYTES:
        raise ValueError("Program preparation source exceeds cache bound")
    prepared = rejected = 0
    started = time.perf_counter()
    for code in codes:
        try:
            # Do not move compile diagnostics out of the actual run's stderr.
            # Sources that emit warnings must compile normally at dispatch.
            with warnings.catch_warnings(record=True) as diagnostics:
                warnings.simplefilter("always")
                compiled_program(code, "<inspection-preparation>", resident)
            if diagnostics:
                resident.get("programs", {}).pop(code.encode("utf-8"), None)
                rejected += 1
            else:
                prepared += 1
        except (SyntaxError, ValueError, OverflowError):
            rejected += 1
    return {"prepared": prepared, "rejected": rejected,
            "compileMs": (time.perf_counter() - started) * 1000}


LAYER_CONTRACT = json.loads(Path(__file__).with_name("structured-layers-contract.json").read_text(encoding="utf-8"))
LAYER_RULES = LAYER_CONTRACT["x-agentcv"]


class StructuredLayerContractError(ValueError):
    def __init__(self, path, message, hint, code="STRUCTURED_LAYER_INVALID", actual_type=None):
        self.details = {"code": code, "path": path, "message": message, "hint": hint,
                        "type": actual_type, "contract": LAYER_CONTRACT["$id"]}
        super().__init__(f"{code} at {path}: {message}; type: {actual_type!r}; hint: {hint}")


def validate_structured_layers(layers, image_records, trace, existing_ids=()):
    """Same canonical contract consumed by JS; defaults never invent geometry."""
    def invalid(path, message, hint, code="STRUCTURED_LAYER_INVALID", actual_type=None):
        raise StructuredLayerContractError(path, message, hint, code, actual_type)
    def identity(value):
        return isinstance(value, str) and 0 < len(value) < 500
    def finite(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    def point(value, path):
        if not isinstance(value, dict) or not finite(value.get("x")) or not finite(value.get("y")):
            invalid(path, "Point needs finite x/y", "Use {'x': float(actual_x), 'y': float(actual_y)} in original-image pixels")
    limits = LAYER_RULES["limits"]
    if not isinstance(layers, list) or len(layers) + len(existing_ids) > limits["layers"]:
        invalid("structuredLayers", "Expected at most 256 layers per run", "Pass a list and split excessive display layers")
    normalized = json_value(layers)
    known = {item["id"] for item in image_records}
    used = set(existing_ids)
    for index, layer in enumerate(normalized):
        path = f"structuredLayers[{index}]"
        if not isinstance(layer, dict):
            invalid(path, "Layer must be an object", "Provide id, imageId, stepId and objects")
        workpiece_ids = [item["id"] for item in image_records if item.get("role") != "reference"]
        if len(workpiece_ids) == 1:
            layer.setdefault("imageId", workpiece_ids[0])
        layer.setdefault("sourceId", layer.get("imageId"))
        if trace.stack:
            layer.setdefault("stepId", trace.stack[-1].node["instanceId"])
        for key in ("id", "sourceId", "imageId", "stepId"):
            if not identity(layer.get(key)):
                invalid(path + "." + key, "Missing stable identity", "Use a nonempty string; call save_layers inside with step(...) for stepId default")
        if layer["id"] in used:
            invalid(path + ".id", "Duplicate layer id", "Choose a unique layer id for this run")
        used.add(layer["id"])
        for key in ("imageId", "sourceId"):
            if layer[key] not in known:
                invalid(path + "." + key, "Layer must identify an actual input image", "Read image_records[i]['id']; do not use a filename, asset id or invented id")
        matches = [node for node in trace.data["nodes"] if layer["stepId"] in (node["id"], node["instanceId"])]
        if len(matches) != 1 or matches[0].get("status") in ("SKIPPED", "BLOCKED"):
            invalid(path + ".stepId", "No unique actually executed step", "Use current step instanceId or an unambiguous executed step id")
        layer["stepId"] = matches[0]["instanceId"]
        objects = layer.get("objects")
        if not isinstance(objects, list) or len(objects) > limits["objectsPerLayer"]:
            invalid(path + ".objects", "Expected at most 20000 objects", "Pass a list of canonical geometry objects")
        object_ids = set()
        for oi, obj in enumerate(objects):
            op = f"{path}.objects[{oi}]"
            if not isinstance(obj, dict) or not identity(obj.get("id")) or obj["id"] in object_ids:
                invalid(op + ".id", "Missing or duplicate object id", "Use a unique nonempty id within this layer")
            object_ids.add(obj["id"])
            kind = obj.get("type")
            if kind not in LAYER_RULES["objectTypes"]:
                invalid(op + ".type", "Unsupported structured object type", "Use roi + geometry.points for polygons; supported: " + ", ".join(LAYER_RULES["objectTypes"]), "STRUCTURED_LAYER_TYPE", kind)
            if not isinstance(obj.get("geometry"), dict):
                invalid(op + ".geometry", "Missing geometry object", "Use the geometry fields declared by the shared contract", actual_type=kind)
            geometry = obj["geometry"]
            obj.setdefault("coordinateSpace", {"imageId": layer["imageId"]})
            coordinates = obj["coordinateSpace"]
            if isinstance(coordinates, dict):
                coordinates.setdefault("imageId", layer["imageId"])
            if not isinstance(coordinates, dict) or coordinates.get("imageId") not in known:
                invalid(op + ".coordinateSpace.imageId", "Unknown original-image coordinate frame", "Use {'imageId': image_records[i]['id']}", actual_type=kind)
            coordinates.setdefault("kind", "original-image-pixels")
            coordinates.setdefault("unit", "px")
            if coordinates["kind"] != "original-image-pixels" or coordinates["unit"] != "px":
                invalid(op + ".coordinateSpace", "Only explicit original-image pixel coordinates are supported", "Keep geometry in original pixels; use affine6 for another input image")
            transform = coordinates.get("transform")
            if "transform" in coordinates and (not isinstance(transform, list) or len(transform) != 6 or not all(finite(v) for v in transform) or abs(transform[0]*transform[3]-transform[1]*transform[2]) < 1e-12):
                invalid(op + ".coordinateSpace.transform", "Transform must be invertible affine6", "Use [a,b,c,d,tx,ty] with x'=a*x+c*y+tx, y'=b*x+d*y+ty")
            if coordinates["imageId"] != layer["imageId"] and transform is None:
                invalid(op + ".coordinateSpace.transform", "Cross-image coordinates require a transform", "Provide measured affine6; do not assume two cameras align")
            for field, specification in LAYER_RULES["geometry"][kind].items():
                value = geometry.get(field)
                gp = op + ".geometry." + field
                if field == "points":
                    if not isinstance(value, list) or not specification["minItems"] <= len(value) <= specification["maxItems"]:
                        invalid(gp, "Invalid point count", f"Provide {specification['minItems']}..{specification['maxItems']} actual x/y points; measurement from/to is not the points format", actual_type=kind)
                    if NATIVE_JSON is None or not NATIVE_JSON.layer_points_valid(value):
                        for pi, value_point in enumerate(value):
                            point(value_point, f"{gp}[{pi}]")
                elif field == "center":
                    point(value, gp)
                elif specification.get("type") == "number":
                    if not finite(value) or field == "radius" and value <= 0:
                        invalid(gp, "Expected finite measured value" + (" > 0" if field == "radius" else ""), "Place value and unit inside geometry, never at the object top level", actual_type=kind)
                elif not isinstance(value, str) or field == "unit" and not value:
                    invalid(gp, "Expected text" + (" unit" if field == "unit" else ""), "Place text/unit inside geometry", actual_type=kind)
            obj["locked"] = True
    return normalized


def probe(import_optional=True):
    modules = {}
    for name in ("numpy", "PIL", "cv2", "scipy", "skimage", "matplotlib", "torch"):
        # Routine execution must not import unused frameworks just to describe
        # the environment. Explicit --probe retains full import validation.
        if not import_optional and name not in ("numpy", "PIL", "cv2"):
            modules[name] = {"importChecked": False, "discoverable": importlib.util.find_spec(name) is not None}
            continue
        try:
            module = importlib.import_module(name)
            modules[name] = {"available": True, "importChecked": True, "version": str(getattr(module, "__version__", "unknown"))}
        except Exception as error:
            modules[name] = {"available": False, "error": f"{type(error).__name__}: {error}"}
    return {
        "schema": SCHEMA, "python": {"executable": sys.executable, "version": platform.python_version()},
        "libraries": modules, "algorithmAllowlist": None,
        "executionModel": "normal-python-process", "hardSandbox": False,
        "canInstallPackages": True,
        "packageInventoryScope": "all-installed" if import_optional else "not-collected; use explicit environment probe",
        "installedPackages": sorted(
            [{"name": item.metadata.get("Name", "unknown"), "version": item.version}
             for item in importlib.metadata.distributions()], key=lambda item: item["name"].lower()) if import_optional else None,
    }


def json_value(value):
    if NATIVE_JSON is not None:
        return NATIVE_JSON.normalize(value, json_value_python)
    return json_value_python(value)


def json_value_python(value):
    """Preserve numeric values; non-finite values become explicit null, never truth."""
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        # Result/geometry dictionaries contain many scalar measurements. Keep
        # normalization (including Python's key spelling) but avoid a recursive
        # call and container/NumPy dispatch for each ordinary scalar leaf.
        result = {}
        for key, item in value.items():
            kind = type(item)
            if item is None or kind is str or kind is bool or kind is int:
                result[str(key)] = item
            elif kind is float:
                result[str(key)] = item if math.isfinite(item) else None
            else:
                result[str(key)] = json_value_python(item)
        return result
    if isinstance(value, (tuple, list)):
        # Geometry and measurement arrays usually contain plain scalar leaves.
        # Handle those in this traversal instead of re-entering the normalizer
        # (and its container/NumPy checks) for every coordinate. Subclasses and
        # custom conversions still take the general path below.
        result = []
        for item in value:
            kind = type(item)
            if item is None or kind is str or kind is bool or kind is int:
                result.append(item)
            elif kind is float:
                result.append(item if math.isfinite(item) else None)
            else:
                result.append(json_value_python(item))
        return result
    if hasattr(value, "tolist"):
        return json_value_python(value.tolist())
    if hasattr(value, "item"):
        return json_value_python(value.item())
    raise TypeError(f"Result contains non-JSON value {type(value).__name__}; save arrays or convert explicitly")


def write_json(path, value):
    settings = {"ensure_ascii": False, "separators": (",", ":"), "allow_nan": False}
    try:
        text = json.dumps(value, **settings)
    except (TypeError, ValueError):
        text = json.dumps(json_value(value), **settings)
    path.write_text(text + "\n", encoding="utf-8")


def compact_json_fallback(value):
    return json.dumps(json_value(value), ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def compact_json_bytes(value, cache=None):
    if NATIVE_JSON is not None:
        if cache is not None:
            return NATIVE_JSON.encode(value, compact_json_fallback, cache)
        return NATIVE_JSON.encode(value, compact_json_fallback)
    return (compact_json_fallback(value) + "\n").encode("utf-8")


def report_json_fallback(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def report_json_bytes(value):
    if NATIVE_JSON is not None:
        return NATIVE_JSON.encode_report(value, report_json_fallback)
    return report_json_fallback(value).encode("utf-8")


def report_transport_bytes(value, transport):
    if transport == "agentcv-typed-report-v1" and NATIVE_JSON is not None:
        try:
            return NATIVE_JSON.encode_report_wire(value, report_json_fallback), transport
        except NATIVE_JSON.ReportWireLimitError:
            # The typed path uses a conservative JSON/allocation size bound.
            # The original strict encoder remains authoritative when it cannot
            # fit, and still rejects invalid values rather than normalizing.
            pass
    return report_json_bytes(value), "json-utf8"


class BoundedLog(io.TextIOBase):
    def __init__(self, path):
        self.path = path
        self.parts = []
        self.length = 0
        self.truncated = False

    def write(self, text):
        text = str(text)
        remaining = MAX_LOG_CHARS - self.length
        if remaining > 0:
            kept = text[:remaining]
            self.parts.append(kept)
            self.length += len(kept)
        if len(text) > max(0, remaining):
            self.truncated = True
        return len(text)

    def flush(self):
        pass

    def save(self, persist=True):
        text = "".join(self.parts)
        if self.truncated:
            text += "\n[output truncated at runtime log limit]\n"
        if persist:
            self.path.write_text(text, encoding="utf-8")
        return text


def apply_resource_limits(request, resident=False):
    applied = {}
    try:
        import resource
        seconds = max(1, min(600, int(request.get("timeoutSeconds", 120))))
        if not resident:
            resource.setrlimit(resource.RLIMIT_CPU, (seconds + 1, seconds + 2))
            applied["cpuSeconds"] = seconds + 1
        else:
            # RLIMIT_CPU accumulates over a process lifetime. A per-node budget
            # would kill a healthy thousand-piece resident process eventually.
            applied["wallTimeoutOwner"] = "Rust supervisor per invocation"
        # Limit each newly written file. This does not limit aggregate disk use.
        maximum = 256 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_FSIZE, (maximum, maximum))
        applied["fileBytes"] = maximum
        # RLIMIT_AS is unreliable on macOS and can reject shared-library mappings.
        # Address-space limits are enforced on Linux only, and accurately reported.
        if sys.platform.startswith("linux"):
            memory = max(256, min(16384, int(request.get("memoryLimitMb", 4096)))) * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
            applied["addressSpaceBytes"] = memory
    except (ImportError, OSError, ValueError) as error:
        applied["note"] = str(error)
    return applied


def trace_value(value):
    if NATIVE_JSON is not None:
        return NATIVE_JSON.normalize_trace(value, trace_value_python)
    return trace_value_python(value)


def trace_value_python(value):
    """Ports describe arrays by exact content hash, shape and dtype, never pixel dumps.

    Arrays themselves remain in ordinary Python and saved image/array artifacts.
    Small JSON geometry and scalar values remain inspectable without conversion.
    """
    value_type = type(value)
    if value is None or value_type in (str, bool, int):
        return value
    if value_type is float:
        return value if math.isfinite(value) else None
    if hasattr(value, "shape") and hasattr(value, "dtype") and hasattr(value, "tobytes"):
        if len(value.shape) == 0:
            return json_value(value.item())
        return {"kind": "array", "shape": list(value.shape), "dtype": str(value.dtype),
                "sha256": hashlib.sha256(value.tobytes(order="C")).hexdigest(),
                "nbytes": int(value.nbytes), "storage": "runtime-value; save_image/save_array for persisted pixels"}
    if isinstance(value, dict):
        return {str(key): trace_value_python(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        if len(value) > 1024:
            normalized = json_value(value)
            raw = json.dumps(normalized, ensure_ascii=False, allow_nan=False).encode("utf-8")
            return {"kind": "sequence", "count": len(value), "sha256": hashlib.sha256(raw).hexdigest(),
                    "preview": [trace_value_python(item) for item in value[:8]],
                    "storage": "runtime-value; save_json for persisted full values"}
        return [trace_value_python(item) for item in value]
    return json_value(value)


class Invocation:
    """An expected negative observation is data, never an execution exception."""
    def __init__(self, valid, value=None, code=None, message=None, execution="COMPLETED", node=None):
        self.valid, self.value, self.code, self.message = bool(valid), value, code, message
        self.execution, self.node = execution, node

    def as_dict(self):
        return {"valid": self.valid, "value": json_value(self.value), "code": self.code,
                "message": self.message, "execution": self.execution}


def found(value=None):
    return Invocation(True, value=value)


def not_found(message="Target not found", code="NOT_FOUND"):
    return Invocation(False, code=code, message=message)


class SDKClock:
    """Exclusive SDK wall time, suspending while an SDK invokes user code."""
    def __init__(self):
        self.depth, self.seconds, self.since = 0, 0.0, 0.0
        self.services, self.active_service = {}, None

    def accrue(self):
        seconds = time.perf_counter() - self.since
        self.seconds += seconds
        name = self.active_service or "other"
        self.services[name] = self.services.get(name, 0.0) + seconds * 1000

    @contextlib.contextmanager
    def service(self, name="other"):
        if not self.depth:
            self.since = time.perf_counter()
            self.active_service = name
        self.depth += 1
        try:
            yield
        finally:
            self.depth -= 1
            if not self.depth:
                self.accrue()
                self.active_service = None

    def wrap(self, fn):
        @functools.wraps(fn)
        def measured(*args, **kwargs):
            with self.service(fn.__name__):
                return fn(*args, **kwargs)
        return measured

    def user(self, fn, *args):
        depth = self.depth
        active_service = self.active_service
        if depth:
            self.accrue()
        self.depth = 0
        try:
            return fn(*args)
        finally:
            self.depth = depth
            self.active_service = active_service
            if depth:
                self.since = time.perf_counter()


def sdk_method(fn):
    @functools.wraps(fn)
    def measured(self, *args, **kwargs):
        clock = getattr(self, 'ledger', None) or getattr(getattr(self, 'trace', None), 'ledger', None)
        if clock is None:
            return fn(self, *args, **kwargs)
        with clock.service(fn.__name__):
            return fn(self, *args, **kwargs)
    return measured


class ProcedureTrace:
    """Explicit execution observations, never an inferred algorithm plan.

    Context-manager conditions are descriptive metadata. Use run_step(when=...)
    to actually gate execution; Python context managers cannot skip their body.
    """
    def __init__(self, capture="full"):
        if capture not in ("full", "essential"):
            raise ValueError("procedureValueCapture must be full or essential")
        self.capture = capture
        self.data = {"schema": "agentcv-procedure-trace-1", "nodes": []}
        if capture == "essential":
            self.data["capture"] = {"mode": capture, "omittedValues": "NOT_CAPTURED",
                                    "recovery": "rerun-selected-workpiece-with-diagnostics",
                                    "scope": "Step status, scalar outputs and boundaryChecks retained; other diagnostic output snapshots not collected"}
        self.stack = []
        self.counts = {}

    @sdk_method
    def unit(self, kind, unit_id, name=None, inputs=None, outputs=None,
             depends_on=None, condition=None, justification=None, parameters=None,
             parameter_sources=None, documentation=None):
        if not isinstance(unit_id, str) or not re.fullmatch(r"[\w.-]{1,120}", unit_id):
            raise ValueError("Procedure/step id must be a stable 1–120 character identifier")
        if outputs is not None and not isinstance(outputs, dict):
            raise ValueError("outputs declares a dictionary of named ports; set_output records actual values")
        if parameters is not None and not isinstance(parameters, dict):
            raise ValueError("parameters must be a dictionary of actual named values")
        if parameter_sources is not None and not isinstance(parameter_sources, dict):
            raise ValueError("parameter_sources must be a dictionary")
        if documentation is not None and (not isinstance(documentation, str) or len(documentation) > 64000):
            raise ValueError("documentation must be text up to 64000 characters")
        dependencies = list(depends_on or [])
        if any(not isinstance(dep, str) for dep in dependencies):
            raise ValueError("depends_on must contain stable procedure/step identifiers")
        resolved = []
        for dep in dependencies:
            match = next((node for node in reversed(self.data["nodes"]) if node["id"] == dep), None)
            if match is None:
                raise ValueError(f"Dependency {dep!r} has no recorded execution; do not invent a data edge")
            resolved.append(match["instanceId"])
        self.counts[unit_id] = self.counts.get(unit_id, 0) + 1
        parent = self.stack[-1].node if self.stack else None
        node = {
            "id": unit_id, "instanceId": f"{unit_id}#{self.counts[unit_id]}",
            "parentId": parent["id"] if parent else None,
            "parentInstanceId": parent["instanceId"] if parent else None,
            "name": name or unit_id, "kind": kind,
            "inputs": trace_value(inputs if inputs is not None else {}),
            "declaredOutputs": trace_value(outputs or {}), "outputs": {},
            "parameters": json_value(parameters or {}),
            "parameterSources": json_value(parameter_sources or {}),
            "dependsOn": dependencies, "dependencyInstances": resolved,
            "condition": json_value(condition), "justification": json_value(justification),
            "documentation": documentation,
            "status": "RUNNING", "judgement": None, "artifactIds": [],
            "startedAt": datetime.now(timezone.utc).isoformat(),
        }
        self.data["nodes"].append(node)
        return ProcedureUnit(self, node)

    @sdk_method
    def bind_artifact(self, artifact):
        if not self.stack:
            return
        current = self.stack[-1].node
        artifact["traceNodeId"] = current["instanceId"]
        for unit in self.stack:
            node = unit.node
            if artifact["id"] not in node["artifactIds"]:
                node["artifactIds"].append(artifact["id"])
            if node["kind"] == "procedure":
                artifact["procedureId"] = node["id"]
                artifact["procedureInstanceId"] = node["instanceId"]
            elif node["kind"] == "step":
                artifact["stepId"] = node["id"]
                artifact["stepInstanceId"] = node["instanceId"]

    @sdk_method
    def skip(self, unit_id, name=None, reason=None, **metadata):
        unit = self.unit("step", unit_id, name=name, **metadata)
        unit.finish("SKIPPED")
        unit.node["skipReason"] = str(reason or "Condition was not selected")
        return unit

    @sdk_method
    def invoke(self, unit_id, callback, name=None, requires=None, any_of=None, when=True, **metadata):
        if not isinstance(when, bool):
            raise TypeError("invoke when must be an evaluated bool")
        required = list(requires or [])
        alternatives = list(any_of or [])
        if any(not isinstance(r, Invocation) for r in required + alternatives):
            raise TypeError("requires/any_of contain actual Invocation values, not invented IDs")
        dependencies = list(metadata.pop("depends_on", []) or [])
        dependencies += [r.node["id"] for r in required + alternatives if r.node]
        unit = self.unit("step", unit_id, name=name, depends_on=list(dict.fromkeys(dependencies)), **metadata)
        alternative_ids = {r.node["instanceId"] for r in alternatives if r.node}
        by_instance = {node["instanceId"]: node for node in self.data["nodes"]}
        unavailable = [key for key in unit.node["dependencyInstances"] if key not in alternative_ids and
                       (by_instance[key]["status"] != "SUCCEEDED" or by_instance[key].get("result", {}).get("valid") is False)]
        if not when or unavailable or any(not r.valid or r.execution != "COMPLETED" for r in required) or (alternatives and not any(r.valid and r.execution == "COMPLETED" for r in alternatives)):
            unit.finish("SKIPPED")
            unit.node["execution"] = {"status": "SKIPPED"}
            unit.node["skipReason"] = "Condition false or required valid output unavailable"
            outcome = Invocation(False, code="SKIPPED", execution="SKIPPED", node=unit.node)
        else:
            # invoke owns exception capture and prerequisite policy. Independent
            # invocations remain executable even after this callback faults.
            self.stack.append(unit)
            try:
                value = self.ledger.user(callback, unit) if getattr(self, 'ledger', None) else callback(unit)
                outcome = value if isinstance(value, Invocation) else found(value)
                outcome.node = unit.node
                unit.node["outputs"]["result"] = trace_value(outcome.as_dict())
                unit.finish("SUCCEEDED")
                unit.node["execution"] = {"status": "COMPLETED"}
            except Exception as error:
                unit.finish("FAILED")
                unit.node["error"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc(), **({"details": error.details} if isinstance(error, StructuredLayerContractError) else {})}
                unit.node["execution"] = {"status": "FAULT", "reason": "OPERATOR_EXCEPTION"}
                outcome = Invocation(False, code="FAULT", message=str(error), execution="FAULT", node=unit.node)
            finally:
                self.stack.pop()
        unit.node["result"] = trace_value(outcome.as_dict())
        return outcome

    @sdk_method
    def run(self, unit_id, callback, name=None, when=True, **metadata):
        if not isinstance(when, bool):
            raise TypeError("run_step when must be an evaluated bool")
        unit = self.unit("step", unit_id, name=name,
                         **{**metadata, "condition": metadata.get("condition", {"selected": when})})
        by_instance = {node["instanceId"]: node for node in self.data["nodes"]}
        unavailable = [key for key in unit.node["dependencyInstances"]
                       if by_instance[key]["status"] != "SUCCEEDED" or by_instance[key].get("result", {}).get("valid") is False]
        if not when or unavailable:
            unit.finish("SKIPPED")
            unit.node["skipReason"] = ("Prerequisite did not complete: " + ", ".join(unavailable)) if unavailable else "Condition evaluated to false"
            return None
        try:
            with unit:
                value = self.ledger.user(callback, unit) if getattr(self, 'ledger', None) else callback(unit)
                if isinstance(value, Invocation):
                    unit.node["result"] = trace_value(value.as_dict())
                return value
        except Exception as error:
            unit.node["execution"] = {"status": "FAULT", "reason": "OPERATOR_EXCEPTION"}
            unit.node["result"] = {"valid": False, "code": "FAULT", "message": str(error)}
            return Invocation(False, code="FAULT", message=str(error), execution="FAULT", node=unit.node)


class ProcedureUnit:
    def __init__(self, trace, node):
        self.trace, self.node = trace, node
        self.started = time.perf_counter()
        self.entered = False

    @sdk_method
    def __enter__(self):
        if self.entered or self.node["status"] != "RUNNING":
            raise RuntimeError("A recorded execution context may only be entered once")
        # A context cannot silently skip Python code. Use run_step for guarded execution.
        by_instance = {node["instanceId"]: node for node in self.trace.data["nodes"]}
        unavailable = [key for key in self.node["dependencyInstances"]
                       if by_instance[key]["status"] != "SUCCEEDED" or by_instance[key].get("result", {}).get("valid") is False]
        if unavailable:
            self.finish("FAILED")
            self.node["error"] = {"type": "PrerequisiteUnavailable", "message": ", ".join(unavailable)}
            raise RuntimeError("Prerequisite did not complete; use run_step for an explicit skipped branch: " + ", ".join(unavailable))
        self.entered = True
        self.trace.stack.append(self)
        return self

    @sdk_method
    def __exit__(self, error_type, error, tb):
        self.trace.stack.pop()
        self.finish("FAILED" if error is not None else "SUCCEEDED")
        if error is not None:
            self.node["error"] = {"type": error_type.__name__, "message": str(error)}
        return False

    @sdk_method
    def finish(self, status):
        self.node["status"] = status
        self.node["finishedAt"] = datetime.now(timezone.utc).isoformat()
        self.node["durationMs"] = (time.perf_counter() - self.started) * 1000
        self.node.setdefault("execution", {"status": "COMPLETED" if status == "SUCCEEDED" else "FAULT" if status == "FAILED" else status})

    @sdk_method
    def set_judgement(self, judgement):
        if judgement not in ("OK", "NG", "UNKNOWN"):
            raise ValueError("Judgement must be OK, NG or UNKNOWN; execution errors use status FAILED")
        self.node["judgement"] = judgement
        return judgement

    @sdk_method
    def set_output(self, name, value):
        if not isinstance(name, str) or not name:
            raise ValueError("An output requires a nonempty port name")
        # Routine inspection does not create bulk diagnostic snapshots. The
        # algorithm keeps its original value and return value; only the recorded
        # port is marked unavailable. Full diagnostic runs use the old snapshot.
        scalar = value is None or type(value) in (bool, int, float) or type(value) is str and len(value) <= 1024
        if self.trace.capture == "essential" and name != "boundaryChecks" and not scalar:
            self.node["outputs"][name] = {"schema": "agentcv-uncaptured-procedure-value-1",
                "status": "NOT_CAPTURED", "reason": "routine-inspection", "valueType": type(value).__name__,
                "recovery": "rerun-selected-workpiece-with-diagnostics"}
        else:
            self.node["outputs"][name] = trace_value(value)
        return value


def execute(request_path: Path, run_directory: Path, resident=None, *, request_data=None):
    started = time.perf_counter()
    binding_gc = None
    execution_gc = None
    validation_gc = None
    phases = []
    phase_started, phase_name = started, "request"
    def phase(name):
        nonlocal phase_started, phase_name
        now = time.perf_counter()
        phases.append({"key": phase_name, "ms": (now - phase_started) * 1000})
        phase_started, phase_name = now, name
    request = request_data if request_data is not None else json.loads(request_path.read_text(encoding="utf-8"))
    memory_transport = request_data is not None and request.get("artifactMode") == "inspection" and resident is not None
    memory_artifacts = {}
    inspection = request.get("artifactMode") == "inspection"
    raster_outputs = set(request.get("inspectionRasterOutputs", [])) if inspection else set()
    declared_images = [o for o in request.get("expectedOutputs", []) if o.get("type") == "image"]
    live_outputs = {o["id"] for o in declared_images if o.get("role") in ("result","final","output")} or {o["id"] for o in declared_images}
    live_images = {}
    live_bytes = 0
    code = request["code"]
    if not memory_transport:
        (run_directory / "algorithm.py").write_text(code, encoding="utf-8", newline="")
    source = request.get("sourceBinding", {})
    result_path = run_directory / "result.json"
    outputs = run_directory / "outputs"
    inputs = run_directory / "inputs"
    outputs.mkdir(exist_ok=True)
    if not inspection:
        inputs.mkdir(exist_ok=True)
    stdout = BoundedLog(run_directory / "stdout.log")
    stderr = BoundedLog(run_directory / "stderr.log")
    report = {
        "schema": SCHEMA, "runId": request["runId"], "status": "FAILED",
        "title": request.get("title", "Python CV trial"), "sourceBinding": source, "source": source,
        "code": code, "codeSha256": hashlib.sha256(code.encode()).hexdigest(),
        "parameters": request.get("parameters", {}), "justification": request.get("justification"),
        "upstreamBindings": {slot: {"nodeId": value.get("nodeId"), "runId": value.get("runId"), "artifactId": value.get("artifact", {}).get("id")} for slot, value in (request.get("upstream") or {}).items()},
        "runDirectory": str(run_directory), "environment": {}, "artifacts": [], "result": None,
        "stage": "TRIAL", "humanConfirmed": False, "delivered": False,
        "mode": request.get("mode", "draft"), "isDraft": request.get("mode", "draft") != "scheme",
        "resourceLimits": apply_resource_limits(request, resident is not None),
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }
    trace = ProcedureTrace(request.get("procedureValueCapture", "full"))
    ledger = SDKClock()
    trace.ledger = ledger
    program_seconds = 0.0
    report["procedureTrace"] = trace.data
    total_artifact_bytes = 0
    used_names = set()
    try:
        phase("imports-and-environment")
        # Imports are deliberately normal Python imports. These convenient globals
        # are not a catalogue restricting the user's program.
        import numpy as np
        from PIL import Image, ImageOps
        try:
            import cv2
        except ImportError:
            cv2 = None
        # Small repeated primitives otherwise oversubscribe all machine cores.
        # Reset per invocation to avoid leaking a previous node's thread policy;
        # user code may still choose its own policy with normal OpenCV APIs.
        if cv2 is not None:
            cv2.setNumThreads(1)
        if resident is not None:
            if resident.get("environment") is None:
                resident["environment"] = probe(import_optional=False)
            report["environment"] = resident["environment"]
        else:
            report["environment"] = probe(import_optional=False)
        phase("inputs-and-decode")
        image_records = []
        decoded_images = []
        raw_images = []
        original_bytes = []
        total_input_bytes = 0
        for index, entry in enumerate(request.get("images", [])):
            data_url = entry.get("dataUrl", entry.get("dataURL", ""))
            host_asset = entry.get("hostAsset") if resident is not None else None
            host_original = entry.get("hostOriginal") if resident is not None else None
            if host_original:
                saved = resident.get("originalInputs", {}).get(host_original.get("token"))
                if saved is None or saved[0] != host_original:
                    raise ValueError("Original memory resource is missing or inconsistent")
                raw = saved[1]
                raw_hash = host_original["sha256"]
            elif host_asset:
                path = Path(host_asset["path"])
                if path.stat().st_size>MAX_INPUT_BYTES:
                    raise ValueError("Original asset exceeds input size bound")
                raw = path.read_bytes()
            else:
                if not isinstance(data_url, str) or not re.match(r"^data:image/[a-zA-Z0-9.+-]+;base64,", data_url):
                    raise ValueError(f"Input image {index} must contain original base64 image bytes")
                raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
            if not host_original:
                raw_hash = hashlib.sha256(raw).hexdigest()
            if host_asset and raw_hash != host_asset["sha256"]:
                raise ValueError("Original asset content hash mismatch")
            declared_hash = (entry.get("source") or {}).get("contentSha256")
            if declared_hash and declared_hash != raw_hash:
                raise ValueError("Input original bytes do not match declared contentSha256")
            total_input_bytes += len(raw)
            if total_input_bytes > MAX_INPUT_BYTES:
                raise ValueError("Input images exceed 64 MB in this execution")
            input_path = inputs / f"image-{index:03d}.original"
            # Ordinary inspection exposes arrays and identities, not automatic
            # per-node files. Explicit input_file() below materializes on demand.
            original_bytes.append(raw)
            if not inspection:
                input_path.write_bytes(raw)
            cache = resident["decoded"] if resident is not None else {}
            if raw_hash in cache:
                decoded, orientation = cache.pop(raw_hash)
                cache[raw_hash] = (decoded, orientation)
                decoded = decoded.copy()
                resident["decodeHits"] += 1
            else:
                with Image.open(io.BytesIO(raw)) as opened:
                    if opened.width * opened.height > 64_000_000:
                        raise ValueError("Input image exceeds 64 megapixel resource bound")
                    orientation = opened.getexif().get(274, 1)
                    if cv2 is None:
                        native = np.asarray(ImageOps.exif_transpose(opened)).copy()
                        if native.ndim == 2 and opened.mode not in ("P", "1"):
                            decoded = native
                        else:
                            rgb = np.asarray(ImageOps.exif_transpose(opened).convert("RGB")).copy()
                            decoded = rgb[:, :, ::-1].copy()
                    else:
                        # IMREAD_UNCHANGED preserves 16-bit samples, grayscale and
                        # alpha; orientation is applied explicitly to match the
                        # platform's original-image coordinate system.
                        decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
                        if decoded is None:
                            raise ValueError(f"OpenCV could not decode original image {index}")
                        transforms = {
                            2: lambda a: np.fliplr(a), 3: lambda a: np.rot90(a, 2),
                            4: lambda a: np.flipud(a), 5: lambda a: np.swapaxes(a, 0, 1),
                            6: lambda a: np.rot90(a, -1),
                            7: lambda a: np.flip(np.swapaxes(a, 0, 1), axis=(0, 1)),
                            8: lambda a: np.rot90(a, 1),
                        }
                        decoded = transforms.get(orientation, lambda a: a)(decoded).copy()
                if resident is not None:
                    cache[raw_hash] = (decoded.copy(), orientation)
                    resident["decodeMisses"] += 1
                    while len(cache)>8 or sum(value[0].nbytes for value in cache.values())>128*1024*1024:
                        cache.popitem(last=False)
            height, width = decoded.shape[:2]
            if entry.get("width", width) != width or entry.get("height", height) != height:
                raise ValueError(f"Input image {entry.get('id', index)} decoded dimensions do not match current source")
            raw_images.append(decoded)
            if decoded.ndim == 2:
                # OpenCV expands native-depth gray samples in one pass. The
                # result is still a separate writable BGR array, as required
                # by the SDK; raw_images and the decode cache cannot alias it.
                bgr = cv2.cvtColor(decoded, cv2.COLOR_GRAY2BGR) if cv2 is not None else np.repeat(decoded[:, :, np.newaxis], 3, axis=2)
            elif decoded.shape[2] == 4:
                bgr = decoded[:, :, :3].copy()
            else:
                bgr = decoded.copy()
            decoded_images.append(bgr)
            image_records.append({
                "id": entry.get("id", str(index)), "name": entry.get("name", str(index)),
                "width": width, "height": height, "path": None if inspection else str(input_path),
                "fileStatus": "NOT_MATERIALIZED" if inspection else "LEGACY_TEMPORARY_COPY",
                "sha256": raw_hash, "source": entry.get("source"),
                "colorOrder": "BGR", "rawColorOrder": "GRAY" if decoded.ndim == 2 else "BGRA" if decoded.shape[2] == 4 else "BGR",
                "dtype": str(decoded.dtype), "rawChannels": 1 if decoded.ndim == 2 else int(decoded.shape[2]),
                "exifOrientationApplied": orientation != 1,
            })
        if not decoded_images:
            raise ValueError("At least one original image is required")
        report["inputs"] = image_records

        def output_name(name, suffix):
            if not isinstance(name, str) or not name.strip() or len(name) > 120:
                raise ValueError("Artifact name must contain 1–120 characters")
            if Path(name).name != name or name in (".", "..") or any(ord(c) < 32 for c in name):
                raise ValueError("Artifact name must be a file name inside this run's outputs folder")
            safe = name if name.lower().endswith(suffix) else name + suffix
            if safe in used_names:
                raise ValueError(f"Artifact {safe!r} already exists; choose a distinct name")
            if len(report["artifacts"]) >= MAX_ARTIFACTS:
                raise ValueError(f"At most {MAX_ARTIFACTS} returned artifacts per run")
            return safe

        def register(name, raw, kind, details=None, artifact_id=None):
            nonlocal total_artifact_bytes
            if len(raw) > MAX_ARTIFACT_BYTES or total_artifact_bytes + len(raw) > MAX_TOTAL_ARTIFACT_BYTES:
                raise ValueError("Returned artifact bytes exceed the run's output bound; save a smaller diagnostic view")
            # Interactive workpiece runs keep image pixels in the supervised
            # process result only.  The temporary run directory still holds
            # the JSON envelope, but no PNG artifact file is created for the
            # current sample.  Non-image files keep the normal verified path
            # contract because they are structured records, not live pixels.
            memory_image = request.get("artifactMode") == "memory" and kind == "image"
            path = outputs / name
            if memory_transport:
                # Freeze bytes now: arbitrary later user mutation must not alter
                # a returned artifact or another node's input.
                memory_artifacts[artifact_id or name] = bytes(raw)
            elif not memory_image:
                path.write_bytes(raw)
            used_names.add(name)
            total_artifact_bytes += len(raw)
            artifact = {"id": artifact_id or name, "name": name, "type": kind,
                        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                        "source": source, **(details or {})}
            if memory_transport and kind == "json":
                artifact["residentJson"] = True
            if memory_transport:
                artifact["storage"] = "resident-memory"
                if kind == "image":
                    artifact["residentRaster"] = True
            elif memory_image:
                artifact.update({"storage": "process-memory", "pixelRetention": "current-workpiece-memory"})
            else:
                artifact["path"] = str(path)
            trace.bind_artifact(artifact)
            report["artifacts"].append(artifact)
            return artifact["id"]

        def save_image(name, array, color_order="BGR", label=None, section="tool"):
            nonlocal live_bytes
            array = np.asarray(array)
            if array.dtype == np.bool_:
                array = array.astype(np.uint8) * 255
            if array.dtype not in (np.uint8, np.uint16):
                raise ValueError("save_image requires uint8/uint16 or bool; explicitly scale floating point diagnostic images")
            color = color_order.upper() if array.ndim == 3 else "GRAY"
            if array.ndim != 2 and (array.ndim != 3 or array.shape[2] not in (3, 4) or color not in ("BGR", "RGB")):
                raise ValueError("save_image expects grayscale, BGR/RGB or BGRA/RGBA image")
            details = {
                "width": int(array.shape[1]), "height": int(array.shape[0]), "label": label or name,
                "section": section, "channels": 1 if array.ndim == 2 else int(array.shape[2]), "dtype": str(array.dtype),
                **({"binary": bool(np.all((array == 0) | (array == 1)) or np.all((array == 0) | (array == np.iinfo(array.dtype).max)))}
                   if array.ndim == 2 and any(o.get("id") == name and o.get("dataContract", {}).get("kind") == "mask" for o in request.get("expectedOutputs", [])) else {}),
            }
            if inspection:
                # Only graph consumers need pixel bytes. Retain the other
                # images as descriptors so data contracts can check dimensions.
                if array.size == 0:
                    raise ValueError("save_image expects non-empty pixels")
                if color == "RGB":
                    array = array[:, :, [2, 1, 0, 3] if array.shape[2] == 4 else [2, 1, 0]]
                pixels = np.ascontiguousarray(array, dtype="<u2" if array.dtype == np.uint16 else np.uint8)
                filename = output_name(name, ".raster")
                details.update({"mime": "application/octet-stream", "pixelRetention": "metadata-only",
                                "pixelAvailable": False, "rasterEncoding": "raw-le"})
                raw = memoryview(pixels).cast("B")
                if resident is not None and name in live_outputs:
                    if NATIVE_JSON is not None:
                        # Freeze once for preview conversion and graph retention.
                        # Rust writes BGR/gray BMP directly, including native
                        # 16-bit downshift and opaque BGRA presentation.
                        raw = bytes(raw)
                        preview = NATIVE_JSON.preview_bmp(raw, details["width"], details["height"], details["channels"], pixels.dtype.itemsize)
                    elif cv2 is not None:
                        display = pixels if pixels.dtype == np.uint8 else (pixels >> 8).astype(np.uint8)
                        # BMP stores BGR bytes already. Avoid converting the
                        # whole frame to RGB and copying it through Pillow.
                        # The display stays opaque; downstream rasters retain
                        # all their original channels and native sample depth.
                        if display.ndim == 3 and display.shape[2] == 4:
                            display = cv2.cvtColor(display, cv2.COLOR_BGRA2BGR)
                        ok, encoded = cv2.imencode(".bmp", display)
                        if not ok:
                            raise ValueError("OpenCV could not encode live BMP")
                        preview = encoded.tobytes()
                    else:
                        display = pixels if pixels.dtype == np.uint8 else (pixels >> 8).astype(np.uint8)
                        if display.ndim == 3:
                            display = display[:, :, [2, 1, 0]]
                        buffer = io.BytesIO()
                        Image.fromarray(display).save(buffer, format="BMP")
                        preview = buffer.getvalue()
                    if len(preview) > MAX_ARTIFACT_BYTES or live_bytes + len(preview) > MAX_TOTAL_ARTIFACT_BYTES:
                        raise ValueError("Live image bytes exceed the run's output bound")
                    live_images[name] = preview
                    live_bytes += len(preview)
                if name in raster_outputs:
                    return register(filename, raw, "image", details, artifact_id=name)
                artifact = {"id": name, "name": filename, "type": "image", "source": source,
                            "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), **details}
                used_names.add(filename)
                trace.bind_artifact(artifact)
                report["artifacts"].append(artifact)
                return name
            if array.ndim == 2:
                pixels = array
            elif array.ndim == 3 and array.shape[2] in (3, 4):
                if color_order.upper() == "BGR":
                    pixels = array[:, :, [2, 1, 0, 3] if array.shape[2] == 4 else [2, 1, 0]]
                elif color_order.upper() == "RGB":
                    pixels = array
                else:
                    raise ValueError("color_order must be BGR or RGB")
            else:
                raise ValueError("save_image expects grayscale, BGR/RGB or BGRA/RGBA image")
            if array.dtype == np.uint16 and array.ndim == 3:
                if cv2 is None:
                    raise ImportError("16-bit color PNG encoding requires cv2; install opencv-python-headless")
                encoded_input = array if color_order.upper() == "BGR" else array[:, :, [2, 1, 0, 3] if array.shape[2] == 4 else [2, 1, 0]]
                ok, encoded = cv2.imencode(".png", encoded_input)
                if not ok:
                    raise ValueError("OpenCV could not encode PNG")
                raw = encoded.tobytes()
            else:
                buffer = io.BytesIO()
                Image.fromarray(pixels).save(buffer, format="PNG")
                raw = buffer.getvalue()
            url = None if request.get("artifactMode") == "references" else "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
            return register(output_name(name, ".png"), raw, "image", {
                **({"dataUrl": url} if request.get("artifactMode") == "memory" else
                   {"dataUrl": url, "dataURL": url} if url is not None else {}), "mime": "image/png", **details,
            }, artifact_id=name)

        # One operator invocation owns a bounded float-spelling cache. Original
        # immutable artifact bytes and independent normalized trees are retained.
        cache_type = getattr(NATIVE_JSON, "EncodingCache", None)
        json_encoding_cache = cache_type() if cache_type is not None and (inspection or request.get("artifactMode") == "memory") else None

        def save_json(name, data, section="parameters"):
            if (memory_transport and request.get("procedureValueCapture") == "essential"
                    and name in request.get("optionalJsonArtifactIds", []) and section != "boundary"):
                filename = output_name(name, ".json")
                artifact = {"id": name, "name": filename, "type": "json", "source": source,
                    "mime": "application/json", "section": section, "storage": "not-captured",
                    "collection": {"schema": "agentcv-artifact-capture-1", "status": "NOT_CAPTURED",
                        "reason": "routine-inspection", "recovery": "rerun-selected-workpiece-with-diagnostics"}}
                used_names.add(filename)
                trace.bind_artifact(artifact)
                report["artifacts"].append(artifact)
                return name
            if inspection or request.get("artifactMode") == "memory":
                return register(output_name(name, ".json"), compact_json_bytes(data, json_encoding_cache), "json",
                                {"section": section}, artifact_id=name)
            return save_normalized_json(name, json_value(data), section)

        def save_normalized_json(name, data, section):
            compact = inspection or request.get("artifactMode") == "memory"
            # Validation has already produced a JSON tree. Use the strict
            # encoder (not SDK normalization) so invalid values still fail,
            # preserving the exact compact bytes and trailing newline.
            raw = (report_json_bytes(data) + b"\n" if compact else
                   (json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode("utf-8"))
            # The native host reads and verifies the saved JSON bytes and adds
            # their parsed value to its response. Avoid sending the same tree twice.
            return register(output_name(name, ".json"), raw, "json",
                            {"section": section} if compact else {"data": data, "section": section}, artifact_id=name)

        def save_array(name, array):
            buffer = io.BytesIO()
            np.save(buffer, np.asarray(array), allow_pickle=False)
            return register(output_name(name, ".npy"), buffer.getvalue(), "file", {"format": "numpy-npy"}, artifact_id=name)

        def save_file(name, path, section="tool"):
            source_path = Path(path).resolve()
            if not source_path.is_relative_to(run_directory.resolve()) or not source_path.is_file():
                raise ValueError("Returned files must be generated inside this run directory")
            raw = source_path.read_bytes()
            filename = output_name(name, source_path.suffix or ".bin")
            return register(filename, raw, "file", {"section": section, "format": source_path.suffix.lstrip(".")}, artifact_id=name)

        structured_layers = []
        def save_layers(name, layers, section="tool"):
            normalized = validate_structured_layers(layers, image_records, trace, [layer["id"] for layer in structured_layers])
            # Validation already produced a fresh normalized JSON tree. Encode
            # those exact values once; public save_json still normalizes arbitrary
            # user values, including NumPy and non-finite scalars.
            artifact_id = save_normalized_json(name, normalized, section)
            structured_layers.extend(normalized)
            return artifact_id

        upstream_values = request.get("upstream") or {}
        for slot, upstream_value in upstream_values.items():
            artifact = upstream_value.get("artifact", {})
            if memory_transport and artifact.get("residentJson"):
                key = (upstream_value.get("runId"), artifact.get("id"))
                raw = resident.get("artifacts", {}).get(key)
                if raw is None:
                    raise ValueError(f"Upstream JSON {slot!r} is not retained in this workpiece session")
                if len(raw) != artifact.get("bytes") or hashlib.sha256(raw).hexdigest() != artifact.get("sha256"):
                    raise ValueError(f"Upstream JSON {slot!r} content hash changed")
                # A fresh tree per consumer preserves the writable SDK contract.
                # The verified immutable bytes never make a round trip via Rust.
                artifact["data"] = json.loads(raw)
            if artifact.get("type") == "image":
                if memory_transport and artifact.get("residentRaster"):
                    key = (upstream_value.get("runId"), artifact.get("id"))
                    raw = resident.get("artifacts", {}).get(key)
                    if raw is None:
                        raise ValueError(f"Upstream image {slot!r} is not retained in this workpiece session")
                elif artifact.get("path"):
                    raw = Path(artifact["path"]).read_bytes()
                else:
                    data_url = artifact.get("dataUrl", artifact.get("dataURL", ""))
                    prefix = "data:image/png;base64,"
                    if not isinstance(data_url, str) or not data_url.startswith(prefix):
                        raise ValueError(f"Upstream image {slot!r} has no readable path or PNG data URL")
                    try:
                        raw = base64.b64decode(data_url[len(prefix):], validate=True)
                    except (ValueError, base64.binascii.Error) as error:
                        raise ValueError(f"Upstream image {slot!r} data URL is invalid") from error
                if hashlib.sha256(raw).hexdigest() != artifact.get("sha256"):
                    raise ValueError(f"Upstream image {slot!r} content hash changed")
                if inspection and artifact.get("rasterEncoding") == "raw-le":
                    shape = (artifact["height"], artifact["width"])
                    if artifact["channels"] != 1:
                        shape += (artifact["channels"],)
                    dtype = {"uint8": np.uint8, "uint16": "<u2"}[artifact["dtype"]]
                    upstream_value["image"] = np.frombuffer(raw, dtype=dtype).reshape(shape).copy()
                    continue
                if cv2 is None:
                    raise ImportError("Reading upstream images requires cv2")
                upstream_value["image"] = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
                if upstream_value["image"] is None:
                    raise ValueError(f"Upstream image {slot!r} could not be decoded")

        reference_inputs = request.get("referenceInputs") or {}
        index_by_id = {entry["id"]: i for i, entry in enumerate(image_records)}
        for slot, image_id in reference_inputs.items():
            if image_id not in index_by_id:
                raise ValueError(f"Fixed reference {slot!r} does not belong to this invocation's actual input bytes")
        references = {slot: decoded_images[index_by_id[image_id]] for slot, image_id in reference_inputs.items()}
        reference_records = {slot: image_records[index_by_id[image_id]] for slot, image_id in reference_inputs.items()}
        for entry in image_records:
            entry["role"] = "reference" if entry["id"] in reference_inputs.values() else "workpiece"
            entry["referenceSlots"] = [slot for slot, image_id in reference_inputs.items() if image_id == entry["id"]]
        report["referenceInputs"] = reference_inputs
        query_ids = (request.get("workpieceUnit") or {}).get("imageIds")
        query_indexes = [index_by_id[image_id] for image_id in query_ids] if query_ids is not None else [i for i, entry in enumerate(image_records) if entry["id"] not in reference_inputs.values()]
        if not query_indexes:
            raise ValueError("At least one actual workpiece image is required apart from fixed references")
        workpiece_images = [decoded_images[i] for i in query_indexes]
        workpiece_raw_images = [raw_images[i] for i in query_indexes]
        workpiece_records = [image_records[i] for i in query_indexes]
        def input_file(index=0):
            if isinstance(index,bool) or not isinstance(index,int) or index<0 or index>=len(query_indexes):
                raise ValueError("INPUT_FILE_INDEX_INVALID: choose an actual workpiece input index")
            actual=query_indexes[index]
            record=image_records[actual]
            if record["path"] is None:
                # Only an explicit algorithm request creates a private copy.
                # Never link a writable path to cached or source originals.
                inputs.mkdir(exist_ok=True)
                path=inputs / f"image-{actual:03d}.original"
                path.write_bytes(original_bytes[actual])
                record["path"]=str(path)
                record["fileStatus"]="EXPLICIT_TEMPORARY_COPY"
            return Path(record["path"])
        input_file=ledger.wrap(input_file)
        first = workpiece_images[0]
        gray = workpiece_raw_images[0].copy() if workpiece_raw_images[0].ndim == 2 else cv2.cvtColor(first, cv2.COLOR_BGR2GRAY) if cv2 is not None else np.rint(first[:, :, 0] * .114 + first[:, :, 1] * .587 + first[:, :, 2] * .299).astype(first.dtype)
        save_image, save_json, save_array, save_file, save_layers = [ledger.wrap(fn) for fn in
            (save_image, save_json, save_array, save_file, save_layers)]
        namespace = {
            "__name__": "__agentcv_algorithm__", "__file__": str(run_directory / "algorithm.py"),
            "np": np, "cv2": cv2, "Image": Image, "image": first, "images": workpiece_images,
            "raw_images": workpiece_raw_images,
            "references": references, "reference_records": reference_records,
            "procedure": lambda unit_id, name=None, **metadata: trace.unit("procedure", unit_id, name=name, **metadata),
            "step": lambda unit_id, name=None, **metadata: trace.unit("step", unit_id, name=name, **metadata),
            "skip_step": trace.skip, "run_step": trace.run,
            "invoke": trace.invoke, "found": found, "not_found": not_found,
            "save_layers": save_layers, "structuredLayers": structured_layers,
            "gray": gray, "image_records": workpiece_records, "input_file": input_file, "source": source,
            "parameters": request.get("parameters", {}), "params": request.get("parameters", {}),
            "upstream": upstream_values,
            "capture_stage_diagnostics": not inspection,
            "workpiece_unit": request.get("workpieceUnit") or {},
            "views": {slot: decoded_images[index_by_id[image_id]] for slot, image_id in ((request.get("workpieceUnit") or {}).get("views") or {}).items()},
            "run_directory": run_directory, "output_directory": outputs,
            "save_image": save_image, "save_json": save_json, "save_array": save_array, "save_file": save_file, "result": {},
        }
        module = types.ModuleType("__agentcv_algorithm__")
        module.__dict__.update(namespace)
        sys.modules[module.__name__] = module
        namespace = module.__dict__
        phase("program-compilation")
        with program_binding_gc_probe() as binding_gc:
            program = compiled_program(code, str(run_directory / "algorithm.py"), resident)
        phase("algorithm-including-artifacts")
        with program_execution_gc_probe(ledger) as execution_gc:
            program_started = time.perf_counter()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                try:
                    exec(program, namespace, namespace)
                finally:
                    program_seconds = time.perf_counter() - program_started
        phase("result-validation")
        with program_execution_gc_probe(ledger, "result-validation") as validation_gc:
            returned = namespace.get("result")
            report["result"] = json_value(returned.as_dict() if isinstance(returned, Invocation) else returned)
            report["structuredLayers"] = validate_structured_layers(namespace.get("structuredLayers", (returned or {}).get("structuredLayers", []) if isinstance(returned, dict) else []), image_records, trace)
            faults = [n for n in trace.data["nodes"] if n.get("execution", {}).get("status") == "FAULT"]
            report["status"] = "FAILED" if faults else "SUCCEEDED"
            report["execution"] = {"status": "FAULT" if faults else "COMPLETED", "faults": [{"instanceId": n["instanceId"], "error": n.get("error")} for n in faults]}
    except BaseException as error:
        report["status"] = "FAILED"
        report["execution"] = {"status": "FAULT", "reason": "UNHANDLED_EXCEPTION"}
        report["error"] = {"type": type(error).__name__, "message": str(error), **({"details": error.details} if isinstance(error, StructuredLayerContractError) else {})}
        report["traceback"] = traceback.format_exc()
        if not memory_transport:
            (run_directory / "traceback.txt").write_text(report["traceback"], encoding="utf-8", newline="")
    report["stdout"] = stdout.save(persist=not memory_transport)
    report["stderr"] = stderr.save(persist=not memory_transport)
    phase("done")
    report["durationMs"] = (time.perf_counter() - started) * 1000
    report.setdefault("execution", {"status": "FAULT"})["durationMs"] = report["durationMs"]
    artifact_phase = "inspection-raster-and-metadata" if inspection else "artifact-encode-and-memory-retain" if request.get("artifactMode") == "memory" else "artifact-write"
    report["timing"] = {"clock": "monotonic", "totalMs": report["durationMs"], "includes": ["imports", "image-decode", "algorithm", artifact_phase], "excludes": ["host-dispatch", "host-verification", "UI-render"]}
    report["timing"]["phases"] = phases
    if binding_gc is not None:
        report["timing"]["programBindingGc"] = binding_gc
    if execution_gc is not None:
        report["timing"]["programGc"] = execution_gc
    if validation_gc is not None:
        report["timing"]["resultValidationGc"] = validation_gc
    report["timing"]["program"] = {"inclusiveMs": program_seconds * 1000,
        "sdkMs": ledger.seconds * 1000, "algorithmMs": max(0.0, program_seconds - ledger.seconds) * 1000,
        "sdkServices": ledger.services,
        "scope": "user exec interval minus exclusive SDK output/tracing services; SDK callbacks count as user code; compilation excluded"}
    report["timing"]["opencvThreads"] = cv2.getNumThreads() if "cv2" in locals() and cv2 is not None else None
    report["timing"]["jsonEncoder"] = {"backend": "rust-cpython-abi3" if NATIVE_JSON is not None else "python-json", "formatVersion": 1, "loadError": NATIVE_JSON_ERROR}
    if resident is not None:
        originals = resident.get("originalInputs", {})
        report["timing"]["originalCache"] = {"entries":len(originals), "bytes":sum(len(v[1]) for v in originals.values()),
            "maxEntries":16, "maxBytes":128*1024*1024,
            "hits":resident.get("originalHits", 0), "misses":resident.get("originalMisses", 0)}
        report["timing"]["imageCache"] = {"entries":len(resident["decoded"]), "bytes":sum(v[0].nbytes for v in resident["decoded"].values()), "hits":resident["decodeHits"], "misses":resident["decodeMisses"], "scope":"process-resident immutable original decode cache; arrays copied for each program"}
        report["timing"]["programCache"] = {"entries":len(resident.get("programs", {})),
            "sourceBytes":sum(map(len, resident.get("programs", {}))),
            "hits":resident.get("compileHits", 0), "misses":resident.get("compileMisses", 0),
            "maxEntries":MAX_PROGRAM_CACHE_ENTRIES, "maxSourceBytes":MAX_PROGRAM_CACHE_SOURCE_BYTES}
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    report["limits"] = {
        "algorithmTypes": "not-restricted", "imports": "normal Python imports from selected environment",
        "hardSandbox": False, "outputArtifactBytes": MAX_TOTAL_ARTIFACT_BYTES,
        "meaning": "Execution and saved evidence do not establish accuracy, human acceptance or formal delivery",
    }
    if not memory_transport:
        write_json(result_path, report)
    if resident is not None:
        resident["liveImages"] = live_images
    if memory_transport:
        cache = resident.setdefault("artifacts", {})
        for artifact in report["artifacts"]:
            if artifact.get("residentRaster") or artifact.get("residentJson"):
                cache[(request["runId"], artifact["id"])] = memory_artifacts[artifact["id"]]
        if sum(map(len, cache.values())) > 128 * 1024 * 1024 or len(cache) > 256:
            raise ValueError("Workpiece resident raster retention exceeds limit")
        return {"report": report, "artifacts": memory_artifacts}
    return {"status": report["status"], "resultFile": str(result_path), "runId": request["runId"]}


def receive_originals(channel, frames, resident):
    from collections import OrderedDict
    if not isinstance(frames, list) or len(frames) > 16:
        raise ValueError("Original resource frame count exceeds limit")
    cache = resident.setdefault("originalInputs", OrderedDict())
    total, seen = 0, set()
    for frame in frames:
        reference, size = frame["reference"], frame["bytes"]
        token = reference.get("token")
        if reference.get("kind") != "runtime-original" or not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token) or token in seen:
            raise ValueError("Original resource identity is invalid")
        seen.add(token)
        length = reference.get("bytes")
        if type(length) is not int or not 0 < length <= MAX_INPUT_BYTES or type(size) is not int or size not in (0, length):
            raise ValueError("Original resource frame length is invalid")
        total += length
        if total > MAX_INPUT_BYTES:
            raise ValueError("Original resources exceed input size bound")
        if size:
            raw = channel.read(size)
            if len(raw) != size:
                raise EOFError("Truncated original resource frame")
            if hashlib.sha256(raw).hexdigest() != reference.get("sha256"):
                raise ValueError("Original resource content hash mismatch")
            if token in cache and cache[token] != (reference, raw):
                raise ValueError("Original resource token was redefined")
            resident["originalMisses"] = resident.get("originalMisses", 0) + 1
        else:
            if token not in cache or cache[token][0] != reference:
                raise ValueError("Original resource has expired or changed")
            raw = cache[token][1]
            resident["originalHits"] = resident.get("originalHits", 0) + 1
        cache.pop(token, None)
        cache[token] = (reference, raw)
        while len(cache) > 16 or sum(len(v[1]) for v in cache.values()) > 128*1024*1024:
            cache.popitem(last=False)


def send_resident_result(channel, message, resident, payload, reply, shared_previews, exchange_started):
    """Send owned frames without keeping transport temporaries across requests."""
    images = resident.pop("liveImages", {})
    reply["liveImages"] = [[name,len(data)] for name,data in images.items()]
    shared_copy_started = time.perf_counter()
    if message.get("sharedImageTransport") == "windows-pagefile-v1":
        if os.name != "nt":
            raise ValueError("Windows shared preview transport requested on another platform")
        import mmap
        frames = []
        for name, data in images.items():
            mapping_name = "Local\\AgentCV-preview-" + hashlib.sha256(os.urandom(32)).hexdigest()
            mapping = mmap.mmap(-1, len(data), tagname=mapping_name, access=mmap.ACCESS_WRITE)
            shared_previews.append(mapping)
            mapping[:] = data
            frames.append([name,len(data),{"kind":"windows-pagefile-v1","name":mapping_name,"bytes":len(data)}])
        reply["liveImages"] = frames
    shared_copy_ms = (time.perf_counter()-shared_copy_started)*1000
    reply["originalTokens"] = list(resident.get("originalInputs", {}))
    artifacts = payload["artifacts"] if payload else {}
    serialization_started = time.perf_counter()
    report, report_encoding = report_transport_bytes(payload["report"], message.get("reportTransport")) if payload else (b"", "json-utf8")
    reply["reportEncoding"] = report_encoding
    reply["transportTiming"] = {"clock":"monotonic", "serializationMs":(time.perf_counter()-serialization_started)*1000,
                                "reportEncoder":"rust-cpython-abi3" if NATIVE_JSON is not None else "python-json",
                                "reportEncoding":report_encoding,
                                "sharedImageCopyMs":shared_copy_ms,"sharedImageBytes":sum(len(data) for data in images.values()) if shared_previews else 0,
                                "beforeReplyMs":(time.perf_counter()-exchange_started)*1000}
    if len(report) > 32 * 1024 * 1024:
        raise ValueError("Resident report frame exceeds limit")
    reply["reportBytes"] = len(report)
    reply["artifacts"] = [[name,len(data)] for name,data in artifacts.items()]
    channel.write((json.dumps(reply)+"\n").encode())
    channel.write(report)
    for data in artifacts.values():
        channel.write(data)
    if not shared_previews:
        for data in images.values():
            channel.write(data)
    channel.flush()


def serve(address, token):
    import socket
    from collections import OrderedDict
    host, port = address.rsplit(":", 1)
    if host != "127.0.0.1":
        raise ValueError("Resident control must be loopback")
    with socket.create_connection((host, int(port)), timeout=60) as connection:
        connection.settimeout(None)
        connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        channel = connection.makefile("rwb")
        channel.write((json.dumps({"protocol":"agentcv-resident-3","token":token})+"\n").encode())
        channel.flush()
        resident = {"decoded":OrderedDict(),"decodeHits":0,"decodeMisses":0,"environment":None}
        shared_previews = []
        last_run_call = None
        while True:
            raw = channel.readline(32769)
            if not raw:
                return
            if len(raw)>32768:
                raise ValueError("Resident request envelope exceeds limit")
            # Requests are serial: the next request acknowledges that Rust has
            # copied the preceding frames into its immutable resource registry.
            # Pagefile mappings never create image files or durable references.
            for mapping in shared_previews:
                mapping.close()
            shared_previews = []
            exchange_started = time.perf_counter()
            message = json.loads(raw)
            if message.get("operation") == "collect-garbage":
                reply = {"operation":"collect-garbage", "id":message.get("id"), "pid":os.getpid(), "call":last_run_call}
                if message.get("pid") != os.getpid() or message.get("call") != last_run_call or last_run_call is None or not isinstance(message.get("id"), str) or not 0 < len(message["id"]) <= 400:
                    reply.update(ok=False, error="MAINTENANCE_IDENTITY_MISMATCH")
                else:
                    collecting = time.perf_counter()
                    collected = gc.collect(2)
                    reply.update(ok=True, collected=collected, gcMs=(time.perf_counter()-collecting)*1000)
                channel.write((json.dumps(reply)+"\n").encode());channel.flush()
                continue
            if message.get("operation") == "prepare":
                # Standard environment initialization, never user program exec.
                try:
                    import numpy
                    from PIL import Image, ImageOps
                    # Register Pillow's basic codecs, without opening an image or
                    # running user code. Full Image.init() imports optional codecs.
                    Image.preinit()
                    try:
                        import cv2
                        cv2.setNumThreads(1)
                    except ImportError:
                        pass
                    if resident.get("environment") is None:
                        resident["environment"] = probe(import_optional=False)
                    reply = {"operation":"prepare", "ok":True}
                except Exception as error:
                    reply = {"operation":"prepare", "ok":False, "error":str(error)}
                channel.write((json.dumps(reply)+"\n").encode())
                channel.flush()
                continue
            if message.get("operation") == "prepare-programs":
                size = message.get("sourceBytes")
                # The frame has a separate small envelope, just like execution.
                if type(size) is not int or not 0 < size <= 8 * 1024 * 1024:
                    raise ValueError("Program preparation frame exceeds limit")
                encoded = channel.read(size)
                if len(encoded) != size:
                    raise EOFError("Truncated program preparation frame")
                try:
                    counts = prepare_programs(json.loads(encoded), resident)
                    reply = {"operation":"prepare-programs", "ok":True, **counts}
                except Exception as error:
                    reply = {"operation":"prepare-programs", "ok":False, "error":str(error)[:1000]}
                channel.write((json.dumps(reply)+"\n").encode())
                channel.flush()
                continue
            directory = Path(message["directory"]).resolve()
            resident["root"] = Path(message["cacheRoot"]).resolve() / "originals"
            resident["root"].mkdir(parents=True,exist_ok=True)
            cwd = Path.cwd()
            resident["liveImages"] = {}
            payload = None
            try:
                os.chdir(directory)
                if "requestBytes" in message:
                    size = message["requestBytes"]
                    if not isinstance(size, int) or not 0 < size <= 100 * 1024 * 1024:
                        raise ValueError("Resident request frame exceeds limit")
                    encoded = channel.read(size)
                    if len(encoded) != size:
                        raise EOFError("Truncated resident request frame")
                    request = json.loads(encoded)
                    receive_originals(channel, message.get("originals", []), resident)
                    scope = request["runtimeMemoryScope"]
                    if not isinstance(scope, str) or len(scope) != 64:
                        raise ValueError("Invalid workpiece memory scope")
                    if resident.get("scope") != scope:
                        resident["artifacts"] = {}
                        resident["scope"] = scope
                    payload = execute(None, directory, resident=resident, request_data=request)
                else:
                    receive_originals(channel, message.get("originals", []), resident)
                    execute(Path(message["request"]), directory, resident=resident)
                reply = {"call":message["call"],"ok":True}
            except BaseException as error:
                reply = {"call":message.get("call"),"ok":False,"error":str(error)[:1000]}
            finally:
                os.chdir(cwd)
            last_run_call = message.get("call")
            send_resident_result(channel, message, resident, payload, reply, shared_previews, exchange_started)
            # The immutable resident artifact cache remains available to graph
            # consumers. Transport report/preview bytes need no extra loop-local
            # owner after flush; never mutate user globals or saved artifacts.
            payload = None
            request = None
            encoded = None



if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--probe":
        print(json.dumps(probe(), ensure_ascii=False))
    elif len(sys.argv) == 4 and sys.argv[1] == "--serve":
        serve(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 4 and sys.argv[1] == "--run":
        print(json.dumps(execute(Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()), ensure_ascii=False))
    else:
        raise SystemExit("Usage: cv-runtime.py --probe | --run REQUEST.json RUN_DIRECTORY")
