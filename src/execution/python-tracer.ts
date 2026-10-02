/**
 * The Python side of the Python engine.
 *
 * `sys.settrace` gives line, call and return events with the frame attached,
 * which is almost exactly the event model CodeFlow already uses — so this
 * translates rather than invents. Everything is filtered to the user's own
 * file so the standard library does not flood the trace.
 *
 * Kept as a string rather than a .py file so it travels with the bundle and
 * cannot drift out of sync with the event types it produces.
 */
export const PYTHON_TRACER = String.raw`
import sys, json

_events = []
_steps = [0]
_prev = {}

MAX_STEPS = 50000
MAX_EVENTS = 250000
USER_FILE = "<codeflow>"

class _Budget(Exception):
    pass

def _fmt(value):
    try:
        if isinstance(value, str):
            return value
        text = repr(value)
    except Exception:
        return "<unrepresentable>"
    return text if len(text) <= 80 else text[:79] + "…"

def _emit(event):
    if len(_events) >= MAX_EVENTS:
        raise _Budget("too many recorded events")
    _events.append(event)

def _locals_of(frame):
    out = {}
    try:
        items = list(frame.f_locals.items())
    except Exception:
        return out
    for key, value in items:
        # Dunders and callables are noise in a variables panel.
        if key.startswith("__") or callable(value):
            continue
        out[key] = _fmt(value)
    return out

def _tracer(frame, event, arg):
    if frame.f_code.co_filename != USER_FILE:
        return None

    _steps[0] += 1
    if _steps[0] > MAX_STEPS:
        raise _Budget("step budget exceeded")

    if event == "line":
        _emit({"type": "line_execute", "line": frame.f_lineno})
        snapshot = _locals_of(frame)
        key = id(frame)
        previous = _prev.get(key, {})
        for name, value in snapshot.items():
            if previous.get(name) != value:
                _emit({"type": "variable_update", "name": name, "value": value})
        _prev[key] = snapshot

    elif event == "call":
        name = frame.f_code.co_name
        if name != "<module>":
            _emit({"type": "function_call", "name": name})

    elif event == "return":
        name = frame.f_code.co_name
        if name != "<module>":
            _emit({"type": "function_return", "name": name, "value": _fmt(arg)})
        _prev.pop(id(frame), None)

    return _tracer

class _Stream:
    """Collects print() output line by line as console events."""
    def __init__(self, level):
        self.level = level
        self.buffer = ""

    def write(self, text):
        self.buffer += text
        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            _emit({"type": "console_output", "level": self.level, "text": line})

    def flush(self):
        if self.buffer:
            _emit({"type": "console_output", "level": self.level, "text": self.buffer})
            self.buffer = ""

def _user_line(traceback):
    line = None
    while traceback:
        if traceback.tb_frame.f_code.co_filename == USER_FILE:
            line = traceback.tb_lineno
        traceback = traceback.tb_next
    return line

def codeflow_run(source):
    _events.clear()
    _prev.clear()
    _steps[0] = 0
    truncated = [False]

    _events.append({"type": "program_start"})

    out, err = _Stream("log"), _Stream("error")
    saved_out, saved_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err

    try:
        code = compile(source, USER_FILE, "exec")
    except SyntaxError as e:
        sys.stdout, sys.stderr = saved_out, saved_err
        _events.append({
            "type": "error",
            "message": "SyntaxError: " + (e.msg or "invalid syntax"),
            "line": e.lineno,
        })
        return json.dumps({"events": _events, "truncated": False})

    try:
        sys.settrace(_tracer)
        exec(code, {"__name__": "__main__"})
        sys.settrace(None)
        out.flush()
        err.flush()
        _events.append({"type": "program_end"})
    except _Budget as e:
        sys.settrace(None)
        truncated[0] = True
        _events.append({
            "type": "error",
            "message": "Stopped: " + str(e) + " — this looks like an infinite loop.",
        })
    except RecursionError as e:
        sys.settrace(None)
        truncated[0] = True
        _events.append({
            "type": "error",
            "message": "RecursionError: " + str(e),
            "line": _user_line(sys.exc_info()[2]),
        })
    except BaseException as e:
        sys.settrace(None)
        out.flush()
        _events.append({
            "type": "error",
            "message": type(e).__name__ + ": " + str(e),
            "line": _user_line(sys.exc_info()[2]),
        })
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = saved_out, saved_err

    return json.dumps({"events": _events, "truncated": truncated[0]})
`;
