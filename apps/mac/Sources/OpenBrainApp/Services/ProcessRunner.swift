import Foundation

/// Runs a subprocess and streams its stdout+stderr line-by-line via the given
/// closure. Used by the installer wizard to surface live progress from
/// `installer/bootstrap.sh`. Returns the exit code.
struct ProcessRunner {
    static func run(
        executable: String,
        arguments: [String],
        cwd: URL? = nil,
        env: [String: String] = [:],
        onLine: @Sendable @escaping (String) -> Void
    ) async throws -> Int32 {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Int32, Error>) in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            if let cwd { process.currentDirectoryURL = cwd }

            var environment = ProcessInfo.processInfo.environment
            for (k, v) in env { environment[k] = v }
            process.environment = environment

            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe

            // Box the line buffer so it can be referenced from the
            // readability handler and the termination handler without
            // running afoul of Swift 6's captured-var rules.
            let buffer = LineBuffer()
            pipe.fileHandleForReading.readabilityHandler = { handle in
                let chunk = handle.availableData
                if chunk.isEmpty { return }
                for line in buffer.append(chunk) { onLine(line) }
            }

            process.terminationHandler = { proc in
                pipe.fileHandleForReading.readabilityHandler = nil
                if let trailing = buffer.flush() { onLine(trailing) }
                continuation.resume(returning: proc.terminationStatus)
            }

            do {
                try process.run()
            } catch {
                pipe.fileHandleForReading.readabilityHandler = nil
                continuation.resume(throwing: error)
            }
        }
    }
}

private final class LineBuffer: @unchecked Sendable {
    private var data = Data()
    private let lock = NSLock()

    func append(_ chunk: Data) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        data.append(chunk)
        var lines: [String] = []
        while let nl = data.firstIndex(of: 0x0A) {
            let lineData = data.subdata(in: data.startIndex..<nl)
            data.removeSubrange(data.startIndex...nl)
            if let line = String(data: lineData, encoding: .utf8) {
                lines.append(line)
            }
        }
        return lines
    }

    func flush() -> String? {
        lock.lock()
        defer { lock.unlock() }
        guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return nil }
        data.removeAll()
        return line
    }
}
