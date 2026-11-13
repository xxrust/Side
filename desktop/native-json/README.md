# Rust SDK JSON encoder

This helper combines SDK normalization and compact encoding. It does not change
algorithm code, geometry, parameters, classifications or output retention.
PyO3 uses CPython's stable ABI from Python 3.10 onward. Run
`node scripts/build-native-json.mjs` from `desktop`, or use the ordinary desktop
build; generated libraries and build receipts are not tracked in Git.

The runtime loads the library only from its sibling `native-json` directory.
Missing/incompatible libraries use the original Python implementation and report
that backend in node timing; native framework acceptance requires the Rust backend.

Plain dictionaries, sequences, strings and numeric scalars encode directly.
Floats use CPython's own round-trip formatter, preserving exponent spelling,
negative zero and the `.0` suffix. A bounded per-call cache keys float strings by
their exact IEEE bits. Non-finite values remain null. Non-string dictionary keys,
container subclasses, NumPy/custom values and deeply nested containers use the
existing Python normalizer, preserving collisions and custom conversion behavior.
Returned bytes are an independent snapshot with the existing trailing newline.

The sole unsafe block calls CPython's stable float formatting/free functions while
holding the GIL. There is no thread escape or retained Python pointer. Verification:
`python -B qa/native-json-contract.py` and `python -B qa/cv-runtime-memory.py`.
The complete framework runner also verifies source/library receipts, the worker's
actual encoder backend, and exact frozen artifact hashes in the real desktop.
