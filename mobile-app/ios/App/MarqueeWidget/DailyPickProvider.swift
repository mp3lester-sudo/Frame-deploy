import WidgetKit
import SwiftUI

// What the SwiftUI view actually renders. `image` is pre-downloaded data,
// not a URL -- widgets render as static snapshots on WidgetKit's own
// schedule, so image loading has to happen here in the provider (where
// async work is allowed) rather than lazily inside the view the way a
// normal SwiftUI screen would with AsyncImage.
struct DailyPickEntry: TimelineEntry {
    let date: Date
    let state: DailyPickState
}

enum DailyPickState {
    /// No widget_token in the shared App Group yet -- the person has
    /// added the widget but either hasn't opened/logged into the app on
    /// this device yet, or WidgetTokenBootstrap's write hasn't landed.
    case notSignedIn
    /// Signed in, but the account doesn't have enough rating history for
    /// a real recommendation yet -- mirrors getOrCreateDailyPick
    /// returning null (see daily-pick.ts's "don't fake it" comment).
    case noPickYet
    case loaded(pick: DailyPick, posterImage: UIImage?)
    case error
}

struct DailyPickProvider: TimelineProvider {
    // Placeholder shown in the widget gallery / while the very first
    // real snapshot loads -- deliberately looks like real content (not a
    // gray box) so the gallery preview reads as "here's what this looks
    // like," standard WidgetKit guidance.
    func placeholder(in context: Context) -> DailyPickEntry {
        DailyPickEntry(
            date: Date(),
            state: .loaded(
                pick: DailyPick(titleId: "", name: "The Godfather", posterUrl: nil, matchPercent: 97, reason: ""),
                posterImage: nil
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (DailyPickEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        fetchEntry { entry in completion(entry) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DailyPickEntry>) -> Void) {
        fetchEntry { entry in
            // The backend already caches today's pick (daily_picks table,
            // see migration 0067) so this refresh cadence isn't about
            // protecting the recommendation engine from load -- it's just
            // "how often is it worth waking the widget up at all" for
            // content that only actually changes once a day. 4 hours
            // balances staleness against iOS's own limited widget-refresh
            // budget (asking for every 15 minutes would just get
            // throttled/ignored).
            let nextRefresh = Calendar.current.date(byAdding: .hour, value: 4, to: Date()) ?? Date().addingTimeInterval(4 * 3600)
            completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
        }
    }

    private func fetchEntry(completion: @escaping (DailyPickEntry) -> Void) {
        guard let defaults = UserDefaults(suiteName: WidgetConstants.appGroup),
            let token = defaults.string(forKey: WidgetConstants.tokenKey),
            !token.isEmpty
        else {
            completion(DailyPickEntry(date: Date(), state: .notSignedIn))
            return
        }

        guard var components = URLComponents(string: "\(WidgetConstants.apiOrigin)/api/widget/daily-pick") else {
            completion(DailyPickEntry(date: Date(), state: .error))
            return
        }
        components.queryItems = [URLQueryItem(name: "token", value: token)]

        guard let url = components.url else {
            completion(DailyPickEntry(date: Date(), state: .error))
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, error in
            guard error == nil, let data = data,
                let decoded = try? JSONDecoder().decode(DailyPickResponse.self, from: data)
            else {
                completion(DailyPickEntry(date: Date(), state: .error))
                return
            }

            guard let pick = decoded.pick else {
                completion(DailyPickEntry(date: Date(), state: .noPickYet))
                return
            }

            guard let posterUrlString = pick.posterUrl, let posterUrl = URL(string: posterUrlString) else {
                completion(DailyPickEntry(date: Date(), state: .loaded(pick: pick, posterImage: nil)))
                return
            }

            URLSession.shared.dataTask(with: posterUrl) { imageData, _, _ in
                let image = imageData.flatMap { UIImage(data: $0) }
                completion(DailyPickEntry(date: Date(), state: .loaded(pick: pick, posterImage: image)))
            }.resume()
        }.resume()
    }
}
