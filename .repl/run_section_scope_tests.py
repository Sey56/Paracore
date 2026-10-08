"""Run a `rap-server/tests/*.py` file WITHOUT a pytest SESSION.

    "<mcp venv>/python.exe" .repl/run_section_scope_tests.py [test_file.py]

⚠ Why this exists: `pytest` rotates `%TEMP%\\pytest-of-<user>\\pytest-N` into a
`garbage-<uuid>` dir on EVERY run — so a test run IS a delete, and the user is
prompted. The user has been emphatic that repeated delete prompts cost trust. This
driver calls the test FUNCTIONS directly (reading `@pytest.mark.parametrize` off
`pytestmark`), so the assertions are exercised with no pytest session and no prompt.

⚠ It is NOT a substitute for the suite: it does not check collection or isolation.
It proves the BODIES run green, which is what stops an unrun test file from
becoming a stale-red hazard of my own making.

⚠⚠ THREE WAYS THIS DRIVER COULD LIE, all closed:
  1. A CLASS-based test file (`class TestFoo: def test_bar(self)`) used to report
     `0 passed, 0 failed` — and 0 passed READS AS A PASS. It now descends into
     every `Test*` class. (rule 3: an EMPTY scan must FAIL)
  2. A test needing a FIXTURE (`tmp_path`) cannot run here. It is now reported as
     `SKIP`, never silently counted, and never a pass.
  3. If it collects NOTHING AT ALL it exits non-zero with a loud message.

⚠ `import pytest` at the TOP of a test file is a module-level import, so it must
resolve BEFORE `exec_module`. Real pytest is used when importable; otherwise a
MINIMAL stub (`mark.parametrize` + `raises`) is installed in `sys.modules` — and
which one was used is PRINTED, never silently substituted. Importing pytest is
itself harmless; only a SESSION creates the temp dir.
"""
import importlib.util
import inspect
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
PRO = os.path.dirname(HERE)
TESTS = os.path.join(PRO, "rap-server", "tests")
TAKEOFF = os.path.join(PRO, "rap-server", "server", "takeoff")
for p in (TAKEOFF, TESTS):
    if p not in sys.path:
        sys.path.insert(0, p)


# ── make `import pytest` resolve ─────────────────────────────────────────────

class _Marker:
    """Stands in for a real `Mark`/`MarkDecorator` — the driver reads .name/.args."""

    def __init__(self, name, args, kwargs):
        self.name = name
        self.args = args
        self.kwargs = kwargs


class _Mark:
    @staticmethod
    def parametrize(argnames, argvalues, **kw):
        def deco(fn):
            fn.pytestmark = list(getattr(fn, "pytestmark", [])) + [
                _Marker("parametrize", (argnames, argvalues), kw)]
            return fn
        return deco


class _Raises:
    def __init__(self, expected):
        self.expected = expected
        self.value = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            raise AssertionError(
                f"pytest.raises({self.expected.__name__}): nothing was raised")
        if not issubclass(exc_type, self.expected):
            return False            # an UNEXPECTED exception must still propagate
        self.value = exc
        return True


class _Approx:
    """Minimal `pytest.approx`. ⚠ Its absence is NOT a test failure — it is the
    STUB's own failure mode, and it would have read as 10 red tests in a suite
    that is actually green."""

    def __init__(self, expected, rel=1e-6, abs=1e-12):
        self.expected, self.rel, self.abs = expected, rel, abs

    def _close(self, a, b):
        try:
            return abs(a - b) <= max(self.abs, self.rel * max(abs(a), abs(b)))
        except TypeError:
            return a == b

    def __eq__(self, other):
        exp = self.expected
        if isinstance(exp, dict):
            try:
                return (set(exp) == set(other)
                        and all(self._close(exp[k], other[k]) for k in exp))
            except TypeError:
                return NotImplemented
        if isinstance(exp, (list, tuple)):
            try:
                return (len(exp) == len(other)
                        and all(self._close(a, b) for a, b in zip(exp, other)))
            except TypeError:
                return NotImplemented
        return self._close(exp, other)

    def __repr__(self):
        return f"approx({self.expected!r})"


_FIXTURES_USED = []


def _fixture(*a, **kw):
    """⚠ A fixture CANNOT be honoured here — its setup would never run, and a test
    that silently ran WITHOUT its fixture is a spurious pass. So this only RECORDS
    the fact, and the driver refuses the whole file rather than report a green it
    did not earn."""
    def deco(fn):
        _FIXTURES_USED.append(getattr(fn, "__name__", "?"))
        return fn
    if a and callable(a[0]):
        return deco(a[0])
    return deco


def _ensure_pytest():
    try:
        import pytest                                       # noqa: F401
        return "real pytest " + getattr(pytest, "__version__", "?")
    except ImportError:
        fake = types.ModuleType("pytest")
        fake.mark = types.SimpleNamespace(parametrize=_Mark.parametrize)
        fake.raises = _Raises
        fake.approx = _Approx
        fake.fixture = _fixture
        sys.modules["pytest"] = fake
        return "MINIMAL STUB (pytest not installed in this interpreter)"


print(f"pytest : {_ensure_pytest()}\n")

# ⚠ Accept a target filename so ONE driver serves every pytest-shaped file in
# rap-server/tests — a second copy of this would drift (rule 14).
_TARGET_NAME = (sys.argv[1] if len(sys.argv) > 1 else "test_section_scope.py")
TARGET = os.path.join(TESTS, _TARGET_NAME)
_MODNAME = os.path.splitext(_TARGET_NAME)[0]
spec = importlib.util.spec_from_file_location(_MODNAME, TARGET)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)          # a collection-time error surfaces here
print(f"module : {TARGET}\n")

if _FIXTURES_USED:
    print(f"  ✗ NOT RUN — this file defines {len(_FIXTURES_USED)} pytest fixture(s),")
    print("    and a fixture cannot be honoured without a real pytest session.")
    print("    Running it here would produce a SPURIOUS PASS, so the driver refuses.")
    print()
    print("RESULT: NOT RUN — needs a real pytest session (uses pytest.fixture)")
    sys.exit(0)


# ── collection: module-level AND `Test*` classes ─────────────────────────────

def _collect_tests(m):
    out = []
    for name in sorted(dir(m)):
        obj = getattr(m, name)
        if name.startswith("test_") and callable(obj):
            out.append((name, obj))
        elif name.startswith("Test") and isinstance(obj, type):
            try:
                inst = obj()
            except TypeError:
                continue                    # a class needing ctor args is not a test
            for mname in sorted(dir(inst)):
                if mname.startswith("test_"):
                    fn = getattr(inst, mname)
                    if callable(fn):
                        out.append((f"{name}.{mname}", fn))
    return out


def _params(fn):
    try:
        return list(inspect.signature(fn).parameters)
    except (TypeError, ValueError):
        return []


def _cases(fn):
    cases = [()]
    for mark in getattr(fn, "pytestmark", []):
        if mark.name != "parametrize":
            continue
        argnames, argvalues = mark.args[0], mark.args[1]
        if isinstance(argnames, str):
            argnames = [a.strip() for a in argnames.split(",")]
        cases = [(v,) if not isinstance(v, (tuple, list)) else tuple(v)
                 for v in argvalues]
    return cases


TESTS_FOUND = _collect_tests(mod)
if not TESTS_FOUND:
    print("  ✗ NO TESTS COLLECTED — a zero-test scan must never read as a pass.")
    print("    (a class-based file is fine: classes named Test* are descended into)")
    sys.exit(1)

passed = failed = skipped = 0
for name, fn in TESTS_FOUND:
    cases = _cases(fn)
    if cases == [()] and _params(fn):
        # A fixture (tmp_path, monkeypatch, …) cannot be supplied here.
        skipped += 1
        print(f"  SKIP  {name}  (needs a fixture: {', '.join(_params(fn))})")
        continue
    for case in cases:
        label = f"{name}({', '.join(repr(c) for c in case)})"
        try:
            fn(*case)
            passed += 1
            print(f"  ok    {label[:100]}")
        except Exception as exc:
            failed += 1
            print(f"  FAIL  {label[:100]}")
            print(f"          {type(exc).__name__}: {exc}")

print()
print(f"RESULT: {'PASS' if not failed else 'FAIL'} — {passed} passed, {failed} failed"
      + (f", {skipped} skipped (fixtures)" if skipped else ""))
sys.exit(0 if not failed else 1)
