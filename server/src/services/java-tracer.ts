/**
 * The Java side of Java step-through.
 *
 * Appended to the user's file as a second top-level class — legal Java, since
 * only one class in a file may be public.
 *
 * The call stack comes from the JVM's own getStackTrace() rather than from
 * tracking entry and exit by hand: that way a stack is correct even through
 * exceptions, early returns and recursion, and the instrumenter only has to
 * inject one kind of call.
 *
 * The trace is printed by a shutdown hook, so a program that throws or calls
 * System.exit still reports everything up to that point.
 */
export const JAVA_TRACER_CLASS = "__CF";

/** Marks the trace line in stdout, so the user's own output stays separable. */
export const JAVA_TRACE_SENTINEL = "\u0001CF\u0001";

export const JAVA_TRACER = String.raw`
/* --- CodeFlow tracer. Appended automatically; not part of your file. --- */
final class __CF {
    static final int MAX_EVENTS = 200000;
    static final long MAX_MS = 4000;
    static final int VALUE_LIMIT = 80;
    static final java.util.List<String> OUT = new java.util.ArrayList<String>();
    static final long START = System.currentTimeMillis();
    static boolean truncated = false;
    static String stopReason = null;

    static final class Budget extends RuntimeException {
        Budget(String m) { super(m); }
    }

    static String esc(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c == '\n') b.append("\\n");
            else if (c == '\r') b.append("\\r");
            else if (c == '\t') b.append("\\t");
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.toString();
    }

    static String fmt(Object v) {
        String s;
        try {
            if (v == null) s = "null";
            else if (v instanceof String) s = "\"" + v + "\"";
            else if (v.getClass().isArray()) s = arrayToString(v);
            else s = String.valueOf(v);
        } catch (Throwable t) {
            s = "<unprintable>";
        }
        if (s.length() > VALUE_LIMIT) s = s.substring(0, VALUE_LIMIT - 1) + "…";
        return s;
    }

    static String arrayToString(Object a) {
        int n = java.lang.reflect.Array.getLength(a);
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < n && i < 20; i++) {
            if (i > 0) b.append(", ");
            b.append(String.valueOf(java.lang.reflect.Array.get(a, i)));
        }
        if (n > 20) b.append(", …");
        return b.append("]").toString();
    }

    static void emit(String json) {
        if (OUT.size() >= MAX_EVENTS) {
            truncated = true;
            stopReason = "the trace grew too large to record in full";
            throw new Budget(stopReason);
        }
        if (System.currentTimeMillis() - START > MAX_MS) {
            truncated = true;
            stopReason = "the program ran too long";
            throw new Budget(stopReason);
        }
        OUT.add(json);
    }

    /** Only the user's own frames, outermost first. */
    static String stack() {
        StackTraceElement[] st = Thread.currentThread().getStackTrace();
        StringBuilder b = new StringBuilder("[");
        boolean first = true;
        for (int i = st.length - 1; i >= 0; i--) {
            String cls = st[i].getClassName();
            if (cls.equals("__CF") || cls.startsWith("java.") || cls.startsWith("jdk."))
                continue;
            if (!first) b.append(",");
            b.append('"').append(esc(st[i].getMethodName())).append('"');
            first = false;
        }
        return b.append("]").toString();
    }

    /** A statement is about to run. */
    static void l(int line) {
        emit("{\"t\":\"l\",\"n\":" + line + ",\"s\":" + stack() + "}");
    }

    /** A local changed. */
    static void v(String name, Object value) {
        emit("{\"t\":\"v\",\"k\":\"" + esc(name) + "\",\"val\":\"" + esc(fmt(value)) + "\"}");
    }

    /** Wraps a returned expression so its value is recorded, then returns it. */
    static <T> T r(T value) {
        emit("{\"t\":\"r\",\"val\":\"" + esc(fmt(value)) + "\"}");
        return value;
    }

    /**
     * Captures printing so output lands between the steps that produced it,
     * instead of arriving in one lump at the end. The real stream is kept for
     * the trace itself.
     */
    static final class Capture extends java.io.OutputStream {
        private final StringBuilder buf = new StringBuilder();
        private final String level;
        Capture(String level) { this.level = level; }

        public void write(int b) {
            if (b == '\n') { flushLine(); return; }
            if (b != '\r') buf.append((char) (b & 0xFF));
        }

        void flushLine() {
            emit("{\"t\":\"o\",\"lvl\":\"" + level + "\",\"text\":\"" + esc(buf.toString()) + "\"}");
            buf.setLength(0);
        }

        void drain() { if (buf.length() > 0) flushLine(); }
    }

    static final java.io.PrintStream REAL_OUT = System.out;
    static final Capture CAP_OUT = new Capture("log");
    static final Capture CAP_ERR = new Capture("error");

    static void dump() {
        // Output with no trailing newline would otherwise be lost.
        CAP_OUT.drain();
        CAP_ERR.drain();

        StringBuilder b = new StringBuilder();
        b.append("\u0001CF\u0001{\"truncated\":").append(truncated);
        if (stopReason != null) b.append(",\"stopReason\":\"").append(esc(stopReason)).append('"');
        b.append(",\"events\":[");
        for (int i = 0; i < OUT.size(); i++) {
            if (i > 0) b.append(",");
            b.append(OUT.get(i));
        }
        b.append("]}");
        REAL_OUT.println(b.toString());
        REAL_OUT.flush();
    }

    static {
        try {
            System.setOut(new java.io.PrintStream(CAP_OUT, true, "UTF-8"));
            System.setErr(new java.io.PrintStream(CAP_ERR, true, "UTF-8"));
        } catch (java.io.UnsupportedEncodingException e) {
            // Cannot happen for UTF-8; printing simply stays uncaptured.
        }
        Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
            public void run() { dump(); }
        }));
    }
}
`;
