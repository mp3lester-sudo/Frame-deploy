import WidgetKit
import SwiftUI

struct DailyPickWidget: Widget {
    let kind: String = "DailyPickWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DailyPickProvider()) { entry in
            DailyPickWidgetView(entry: entry)
        }
        .configurationDisplayName("Backlot Daily Pick")
        .description("Your personalized recommendation, refreshed once a day.")
        .supportedFamilies([.systemSmall, .systemMedium])
        // WidgetKit's own dark-mode background handling adds a system
        // material behind the view on some OS versions if this isn't
        // set, which fights the app's own near-black background instead
        // of sitting flush with it.
        .contentMarginsDisabled()
    }
}
