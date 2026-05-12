import AppKit
import Foundation

/// gog (https://github.com/steipete/gogcli) handoff helpers. The actual
/// `gog auth add` flow opens a browser for OAuth, so we launch it in
/// Terminal.app to give the user a real TTY.
struct GogShell {
    /// Opens Terminal.app and runs `gog auth add <account>` so the user can
    /// complete the Google OAuth flow.
    static func openAuthAdd(account: String) {
        let script = """
        tell application "Terminal"
            activate
            do script "gog auth add \(account.replacingOccurrences(of: "\"", with: "\\\""))"
        end tell
        """
        guard let appleScript = NSAppleScript(source: script) else { return }
        var err: NSDictionary?
        appleScript.executeAndReturnError(&err)
    }

    /// Quick non-interactive probe to see if `gog` is on PATH.
    static func isInstalled() -> Bool {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        task.arguments = ["gog"]
        task.standardOutput = Pipe()
        task.standardError = Pipe()
        do {
            try task.run()
            task.waitUntilExit()
            return task.terminationStatus == 0
        } catch {
            return false
        }
    }
}
