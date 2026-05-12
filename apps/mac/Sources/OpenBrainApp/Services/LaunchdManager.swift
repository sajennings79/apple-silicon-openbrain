import Foundation

/// Thin wrapper around `launchctl` for managing OpenBrain's per-user agents.
/// All four engine services (mcp/embed/llm/ui) plus per-agent jobs.
struct LaunchdManager {
    enum Error: Swift.Error, LocalizedError {
        case launchctlFailed(Int32, String)
        var errorDescription: String? {
            switch self {
            case .launchctlFailed(let code, let stderr):
                return "launchctl exited with \(code): \(stderr)"
            }
        }
    }

    private static var domain: String { "gui/\(getuid())" }

    static func loaded(label: String) async throws -> Bool {
        let (_, _) = try await runLaunchctl(["print", "\(domain)/\(label)"])
        return true
    }

    static func kickstart(label: String) async throws {
        _ = try await runLaunchctl(["kickstart", "-k", "\(domain)/\(label)"])
    }

    static func bootstrap(plistPath: String) async throws {
        _ = try await runLaunchctl(["bootstrap", domain, plistPath])
    }

    static func bootout(label: String) async throws {
        _ = try await runLaunchctl(["bootout", "\(domain)/\(label)"])
    }

    static func enable(label: String) async throws {
        _ = try await runLaunchctl(["enable", "\(domain)/\(label)"])
    }

    static func disable(label: String) async throws {
        _ = try await runLaunchctl(["disable", "\(domain)/\(label)"])
    }

    @discardableResult
    private static func runLaunchctl(_ args: [String]) async throws -> (stdout: String, stderr: String) {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<(String, String), Swift.Error>) in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
            process.arguments = args
            let outPipe = Pipe(), errPipe = Pipe()
            process.standardOutput = outPipe
            process.standardError = errPipe
            process.terminationHandler = { proc in
                let stdout = String(data: outPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let stderr = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                if proc.terminationStatus == 0 {
                    continuation.resume(returning: (stdout, stderr))
                } else {
                    continuation.resume(throwing: Error.launchctlFailed(proc.terminationStatus, stderr))
                }
            }
            do { try process.run() } catch { continuation.resume(throwing: error) }
        }
    }
}
