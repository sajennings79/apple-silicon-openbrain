import SwiftUI

struct AgentsPane: View {
    @State private var shipped: [AgentPrompt] = []
    @State private var user: [AgentPrompt] = []
    @State private var running: Set<String> = []
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Recurring Agents").font(.title2.weight(.semibold))
                Spacer()
                Button("Refresh") { rescan() }
            }

            section(title: "Shipped (read-only)", agents: shipped, isShipped: true)
            section(title: "Your prompts", agents: user, isShipped: false)

            if let error = error {
                Text(error).font(.caption).foregroundStyle(.red)
            }
            Spacer()
        }
        .padding(.vertical, 8)
        .onAppear { rescan() }
    }

    private func section(title: String, agents: [AgentPrompt], isShipped: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            if agents.isEmpty {
                Text(isShipped
                    ? "(no shipped prompts found — install missing files)"
                    : "(no user prompts in ~/Developer/claude-cron/prompts/)")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(agents) { agent in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(agent.name).fontWeight(.medium)
                            Text(agent.description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Spacer()
                        Button(running.contains(agent.path) ? "Running…" : "Run now") {
                            Task { await runAgent(agent) }
                        }
                        .disabled(running.contains(agent.path))
                        Button("Edit") {
                            NSWorkspace.shared.open(URL(fileURLWithPath: agent.path))
                        }
                        .disabled(isShipped)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private func rescan() {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser

        let shippedDir = home.appendingPathComponent("Developer/openbrain/agents/prompts")
        let userDir = home.appendingPathComponent("Developer/claude-cron/prompts")

        shipped = AgentPrompt.scan(directory: shippedDir).filter { $0.name != "README" }
        user = AgentPrompt.scan(directory: userDir).filter { $0.name != "README" }
    }

    private func runAgent(_ agent: AgentPrompt) async {
        running.insert(agent.path)
        defer { running.remove(agent.path) }
        do {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let runner = home.appendingPathComponent("Developer/openbrain/agents/run-agent.sh").path
            _ = try await ProcessRunner.run(
                executable: "/bin/bash",
                arguments: [runner, agent.path],
                cwd: home.appendingPathComponent("Developer/openbrain"),
                onLine: { _ in /* TODO: surface in a log popover */ }
            )
        } catch {
            self.error = "Run failed: \(error.localizedDescription)"
        }
    }
}

struct AgentPrompt: Identifiable, Hashable {
    var id: String { path }
    let path: String
    let name: String
    let description: String

    static func scan(directory: URL) -> [AgentPrompt] {
        let fm = FileManager.default
        guard let contents = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            return []
        }
        return contents
            .filter { $0.pathExtension == "md" }
            .compactMap { url in
                guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                let (name, description) = parseFrontmatter(raw)
                return AgentPrompt(
                    path: url.path,
                    name: name ?? url.deletingPathExtension().lastPathComponent,
                    description: description ?? "",
                )
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Best-effort parse of JSON frontmatter for `name` and `description`.
    private static func parseFrontmatter(_ raw: String) -> (name: String?, description: String?) {
        guard let openRange = raw.range(of: "---\n"),
              let closeRange = raw.range(of: "\n---\n", range: openRange.upperBound..<raw.endIndex) else {
            return (nil, nil)
        }
        let json = String(raw[openRange.upperBound..<closeRange.lowerBound])
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (nil, nil)
        }
        return (obj["name"] as? String, obj["description"] as? String)
    }
}
