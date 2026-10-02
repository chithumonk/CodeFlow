/**
 * The Ruby side of the Ruby engine.
 *
 * Ruby ships TracePoint, which reports :line, :call and :return with the
 * binding attached — close enough to CodeFlow's event model that this
 * translates rather than invents, the same way the Python tracer leans on
 * sys.settrace.
 *
 * Two details differ from the Python tracer on purpose:
 *
 *   - Variable changes are emitted *before* the next line_execute. Locals are
 *     only observable once a statement has finished, so attributing them to
 *     the line that follows would blame the wrong line. buildTrace closes a
 *     frame on line_execute, so emitting first lands them on the statement
 *     that actually caused them.
 *   - The source is handed over base64-encoded. A Ruby double-quoted literal
 *     would interpolate any #{...} the user wrote, which turns their string
 *     into code.
 *
 * Kept as a string rather than a .rb file so it travels with the bundle and
 * cannot drift out of sync with the event types it produces.
 */
export const RUBY_TRACER = String.raw`
require 'json'
require 'stringio'

module CodeFlow
  MAX_STEPS = 50_000
  MAX_EVENTS = 250_000
  MAX_MS = 4_000
  # Checking the clock on every line costs more than it saves; a loop tight
  # enough to matter runs far more than 256 lines in the slack this allows.
  CLOCK_EVERY = 256
  VALUE_LIMIT = 80
  USER_FILE = '(codeflow)'

  class Budget < StandardError; end

  # Collects writes and emits one console event per completed line, so output
  # interleaves with the steps that produced it instead of arriving in a lump.
  class Capture < StringIO
    # Positional rather than a block: StringIO.new warns about being handed one.
    def initialize(sink)
      super()
      @sink = sink
      @buf = ''
    end

    def write(*args)
      text = args.map(&:to_s).join
      @buf << text
      while (i = @buf.index("\n"))
        @sink.call(@buf.slice!(0..i).chomp)
      end
      text.length
    end

    def print(*args)
      write(args.map(&:to_s).join)
      nil
    end

    def flush; self; end
    def sync; true; end
    def sync=(value); value; end
    def tty?; false; end
    def leftover; @buf; end
  end

  def self.fmt(value)
    text = value.is_a?(String) ? value : value.inspect
    text.length > VALUE_LIMIT ? text[0, VALUE_LIMIT - 1] + "…" : text
  rescue StandardError
    '<unrepresentable>'
  end

  def self.locals_of(binding)
    binding.local_variables.each_with_object({}) do |name, acc|
      acc[name.to_s] = fmt(binding.local_variable_get(name))
    end
  rescue StandardError
    {}
  end

  def self.run(source)
    events = []
    steps = 0
    truncated = nil
    previous = {}
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    emit = lambda do |event|
      raise Budget, 'too many recorded events' if events.length >= MAX_EVENTS
      events << event
    end

    # Report only what changed, so a long-lived variable is not re-reported on
    # every single line.
    flush_vars = lambda do |current|
      current.each do |name, value|
        next if previous[name] == value
        # Ruby pre-declares every local in the scope's binding as nil before a
        # line runs. Announcing those would fill the panel with variables the
        # reader has not reached yet, all attributed to the first line.
        next if !previous.key?(name) && value == 'nil'
        emit.call({ 'type' => 'variable_update', 'name' => name, 'value' => value })
      end
      previous = current
    end

    # A fresh, empty scope per run. The worker keeps one warm VM for the whole
    # session, so sharing TOPLEVEL_BINDING would leave the previous program's
    # locals in the next one's variables panel.
    #
    # It has to come from a method on a throwaway class, not a block: a block
    # closes over its surroundings, so its binding would report every local in
    # this method as one of the user's variables. A new class each run also
    # means top-level def-s do not survive into the next run.
    scope = Class.new { def __codeflow_scope__; binding; end }.new.__codeflow_scope__

    real_stdout = $stdout
    real_stderr = $stderr
    out = Capture.new(->(line) { emit.call({ 'type' => 'console_output', 'level' => 'log', 'text' => line }) })
    err = Capture.new(->(line) { emit.call({ 'type' => 'console_output', 'level' => 'error', 'text' => line }) })

    tracer = TracePoint.new(:line, :call, :return) do |tp|
      next unless tp.path == USER_FILE

      case tp.event
      when :line
        steps += 1
        raise Budget, 'this looks like an infinite loop' if steps > MAX_STEPS

        if (steps % CLOCK_EVERY).zero? && Process.clock_gettime(Process::CLOCK_MONOTONIC) - started > MAX_MS / 1000.0
          raise Budget, 'the program ran too long'
        end

        flush_vars.call(locals_of(tp.binding))
        emit.call({ 'type' => 'line_execute', 'line' => tp.lineno })
      when :call
        emit.call({ 'type' => 'function_call', 'name' => tp.method_id.to_s })
        # A new frame starts with its own locals; the caller's are not in scope.
        previous = {}
      when :return
        emit.call({ 'type' => 'function_return', 'name' => tp.method_id.to_s,
                    'value' => fmt(tp.return_value) })
        previous = {}
      end
    end

    events << { 'type' => 'program_start' }
    failure = nil

    begin
      $stdout = out
      $stderr = err
      tracer.enable
      eval(source, scope, USER_FILE, 1)
      # The last statement's assignment has no following :line event to reveal
      # it, so the final state is read directly once the program is done.
      flush_vars.call(locals_of(scope))
    rescue Budget => e
      truncated = e.message
    rescue SystemExit
      # A deliberate exit is a normal ending, not a failure.
    rescue ScriptError, StandardError => e
      line = begin
        e.backtrace_locations&.find { |l| l.path == USER_FILE }&.lineno
      rescue StandardError
        nil
      end
      failure = { 'type' => 'error', 'message' => "#{e.class}: #{e.message}" }
      failure['line'] = line if line
    ensure
      tracer.disable
      $stdout = real_stdout
      $stderr = real_stderr
    end

    # Output with no trailing newline would otherwise be lost.
    [[out, 'log'], [err, 'error']].each do |stream, level|
      next if stream.leftover.empty?
      events << { 'type' => 'console_output', 'level' => level, 'text' => stream.leftover }
    end

    if truncated
      events << { 'type' => 'console_output', 'level' => 'warn',
                  'text' => "Stopped: #{truncated}." }
      events << { 'type' => 'error', 'message' => "Stopped: #{truncated}." }
    elsif failure
      events << failure
    else
      events << { 'type' => 'program_end' }
    end

    JSON.generate({ 'events' => events, 'truncated' => !truncated.nil? })
  end

  # Base64 keeps the source out of Ruby's string-literal parser, so #{...} in
  # the user's own strings stays data.
  def self.run_b64(encoded)
    run(encoded.unpack1('m').force_encoding('UTF-8'))
  end
end
`;
