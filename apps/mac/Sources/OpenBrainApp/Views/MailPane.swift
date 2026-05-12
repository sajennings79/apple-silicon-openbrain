import SwiftUI

struct MailPane: View {
    @Environment(AppState.self) private var state
    @State private var newAccount = ""
    @State private var gogInstalled = GogShell.isInstalled()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Mail").font(.title2.weight(.semibold))

            if !gogInstalled {
                gogMissingBanner
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Add a Gmail account").font(.headline)
                Text("OpenBrain shells out to gog (https://github.com/steipete/gogcli) for Gmail. Adding an account opens a Terminal window so you can complete Google's OAuth flow in your browser.")
                    .font(.caption).foregroundStyle(.secondary)
                HStack {
                    TextField("you@example.com", text: $newAccount)
                        .textFieldStyle(.roundedBorder)
                    Button("Add account") {
                        GogShell.openAuthAdd(account: newAccount)
                    }
                    .disabled(newAccount.isEmpty || !gogInstalled)
                }
            }
            .padding(.vertical, 8)

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text("Keyring password").font(.headline)
                Text("launchd-managed services have no TTY, so gog needs the keyring password from an env var. Add `GOG_KEYRING_PASSWORD=...` to your `.env` (gitignored), then restart the MCP service. Without this, mail syncs fail with `no TTY available for keyring file backend password prompt`.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Open .env in default editor") { openEnv() }
            }

            Spacer()
        }
        .padding(.vertical, 8)
    }

    private var gogMissingBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("gog is not installed", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.orange)
                .font(.headline)
            Text("Install with: `brew install gogcli`")
                .font(.system(.caption, design: .monospaced))
                .padding(6)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))
            Button("Re-check") { gogInstalled = GogShell.isInstalled() }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }

    private func openEnv() {
        // Default repo location; v2 will resolve from a saved preference.
        let path = ("~/Developer/openbrain/.env" as NSString).expandingTildeInPath
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }
}
