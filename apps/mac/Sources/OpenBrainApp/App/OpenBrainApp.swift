import SwiftUI

@main
struct OpenBrainApp: App {
    @State private var state = AppState()

    var body: some Scene {
        MenuBarExtra {
            MenuBarPopover()
                .environment(state)
                .frame(width: 360)
        } label: {
            Label("OpenBrain", systemImage: state.statusIcon)
        }
        .menuBarExtraStyle(.window)

        Window("OpenBrain Settings", id: "settings") {
            SettingsWindow()
                .environment(state)
                .frame(minWidth: 720, minHeight: 480)
        }
        .windowResizability(.contentMinSize)

        Window("OpenBrain Setup", id: "installer") {
            InstallerWindow()
                .environment(state)
                .frame(minWidth: 720, minHeight: 540)
        }
        .windowResizability(.contentMinSize)
    }
}
