import SwiftUI

struct AboutPane: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("OpenBrain").font(.largeTitle.weight(.bold))
            Text("Local-first AI memory for Apple Silicon Macs").foregroundStyle(.secondary)

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Label("Backend on http://localhost:6277", systemImage: "server.rack")
                Label("Web UI at http://localhost:6279", systemImage: "globe")
                Label("Local LLM (mlx-lm) on http://localhost:8000", systemImage: "cpu")
                Label("Embeddings on http://localhost:6278", systemImage: "circle.grid.cross")
            }
            .font(.callout)

            Divider()

            VStack(alignment: .leading, spacing: 4) {
                Text("Data lives in PostgreSQL `openbrain` database.")
                Text("Models cached in ~/.cache/huggingface/hub/.")
                Text("Logs in repo `logs/` directory.")
            }
            .font(.caption).foregroundStyle(.secondary)

            Spacer()
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
