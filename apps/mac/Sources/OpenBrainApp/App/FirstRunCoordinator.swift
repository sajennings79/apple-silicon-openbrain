import Foundation
import Observation

/// Tracks first-run installer wizard progress. The actual UI lives in
/// InstallerWindow.swift; this coordinator exposes step state and runs
/// installer/bootstrap.sh via ProcessRunner.
@Observable
@MainActor
final class FirstRunCoordinator {
    enum Phase: String, CaseIterable, Identifiable {
        case prereqs = "Installing prerequisites (brew, Bun, Node, Python)"
        case env = "Setting up .env"
        case schema = "Initializing PostgreSQL schema"
        case services = "Installing launchd services"
        case models = "Downloading models (~5GB on first run)"
        case verify = "Verifying health"
        case done = "Done"
        var id: String { rawValue }
    }

    var current: Phase = .prereqs
    var logLines: [String] = []
    var failure: String?
    var running: Bool = false
    var completed: Bool = false

    private let repoPath: String

    init(repoPath: String = "\(NSHomeDirectory())/Developer/openbrain") {
        self.repoPath = repoPath
    }

    func appendLine(_ line: String) {
        logLines.append(line)
        if logLines.count > 500 { logLines.removeFirst(logLines.count - 500) }
        if let phase = Self.phaseFromLine(line) { current = phase }
    }

    func runBootstrap() async {
        running = true
        failure = nil
        defer { running = false }

        let bootstrap = "\(repoPath)/installer/bootstrap.sh"
        guard FileManager.default.fileExists(atPath: bootstrap) else {
            failure = "installer/bootstrap.sh not found at \(bootstrap)"
            return
        }

        do {
            let exit = try await ProcessRunner.run(
                executable: "/bin/bash",
                arguments: [bootstrap],
                cwd: URL(fileURLWithPath: repoPath),
                onLine: { [weak self] line in
                    Task { @MainActor in self?.appendLine(line) }
                }
            )
            if exit == 0 {
                current = .verify
                _ = try await ProcessRunner.run(
                    executable: "/bin/bash",
                    arguments: ["\(repoPath)/installer/verify.sh"],
                    cwd: URL(fileURLWithPath: repoPath),
                    onLine: { [weak self] line in
                        Task { @MainActor in self?.appendLine(line) }
                    }
                )
                current = .done
                completed = true
            } else {
                failure = "bootstrap.sh exited with \(exit)"
            }
        } catch {
            failure = error.localizedDescription
        }
    }

    private static func phaseFromLine(_ line: String) -> Phase? {
        if line.contains("step=prereqs") || line.contains("[prereqs]") { return .prereqs }
        if line.contains("step=env") { return .env }
        if line.contains("step=setup") || line.contains("Schema applied") { return .schema }
        if line.contains("step=services") { return .services }
        if line.contains("Models will download") { return .models }
        if line.contains("step=health") || line.contains("[verify]") { return .verify }
        return nil
    }
}
