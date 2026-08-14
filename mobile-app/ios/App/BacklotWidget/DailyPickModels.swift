import Foundation

// Mirrors the JSON shape returned by GET /api/widget/daily-pick
// (src/app/api/widget/daily-pick/route.ts). Kept as its own file since
// both the TimelineProvider and (eventually) any widget configuration UI
// need it.
struct DailyPickResponse: Decodable {
    let pick: DailyPick?
    let error: String?
}

struct DailyPick: Decodable {
    let titleId: String
    let name: String
    let posterUrl: String?
    let matchPercent: Int?
    let reason: String
}

enum WidgetConstants {
    // Must match APP_GROUP in
    // src/components/native/widget-token-bootstrap.tsx exactly -- this is
    // how the two processes (main app, widget extension) agree on which
    // shared UserDefaults suite the token lives in.
    static let appGroup = "group.app.backlot.ios"
    static let tokenKey = "widget_token"

    // Same production origin capacitor.config.ts's remote-mode `server.url`
    // points the main WebView at (see src/lib/seo/site.ts's siteOrigin()
    // for the web app's own source of truth for this value) -- kept in
    // sync by hand since a widget extension has no build-time access to
    // the Next.js app's env vars or TS constants.
    static let apiOrigin = "https://taste-green-tau.vercel.app"
}
