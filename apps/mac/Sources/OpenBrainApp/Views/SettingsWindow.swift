import SwiftUI

struct SettingsWindow: View {
    @Environment(AppState.self) private var state

    var body: some View {
        TabView {
            SourcesPane()
                .tabItem { Label("Sources", systemImage: "antenna.radiowaves.left.and.right") }

            MailPane()
                .tabItem { Label("Mail", systemImage: "envelope") }

            AgentsPane()
                .tabItem { Label("Agents", systemImage: "wand.and.stars") }

            ServicesPane()
                .tabItem { Label("Services", systemImage: "server.rack") }

            AboutPane()
                .tabItem { Label("About", systemImage: "info.circle") }
        }
        .padding(20)
    }
}
