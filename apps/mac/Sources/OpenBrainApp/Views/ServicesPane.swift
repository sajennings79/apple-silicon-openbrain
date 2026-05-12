import SwiftUI

struct ServicesPane: View {
    @Environment(AppState.self) private var state

    private static let services: [(label: String, port: Int, key: String)] = [
        ("MCP Server", 6277, "mcp"),
        ("Embedding", 6278, "embed"),
        ("LLM (mlx-lm)", 8000, "llm"),
        ("Web UI", 6279, "ui"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Services").font(.title2.weight(.semibold))

            ForEach(Self.services, id: \.label) { svc in
                row(label: svc.label, port: svc.port, up: isUp(svc.key))
            }

            Divider()

            HStack {
                Button("Re-check") {
                    Task { state.healthMonitor?.start() }
                }
                Button("Open Web UI") {
                    if let url = URL(string: "http://localhost:6279") {
                        NSWorkspace.shared.open(url)
                    }
                }
            }

            Spacer()
        }
        .padding(.vertical, 8)
    }

    private func isUp(_ key: String) -> Bool {
        switch key {
        case "mcp": return state.serviceHealth.mcp
        case "embed": return state.serviceHealth.embed
        case "llm": return state.serviceHealth.llm
        case "ui": return state.serviceHealth.ui
        default: return false
        }
    }

    private func row(label: String, port: Int, up: Bool) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(up ? .green : .red)
                .frame(width: 10, height: 10)
            VStack(alignment: .leading) {
                Text(label).fontWeight(.medium)
                Text("port \(port)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(up ? "Restart" : "Start") {
                Task { try? await LaunchdManager.kickstart(label: launchdLabel(for: label)) }
            }
            .controlSize(.small)
        }
    }

    private func launchdLabel(for service: String) -> String {
        switch service {
        case "MCP Server": return "com.openbrain.mcp"
        case "Embedding": return "com.openbrain.embed"
        case "LLM (mlx-lm)": return "com.openbrain.llm"
        case "Web UI": return "com.openbrain.ui"
        default: return ""
        }
    }
}
