import SwiftUI
import WidgetKit

// Hand-ported from the web app's design tokens (src/app/globals.css) --
// a widget extension can't import the Next.js app's CSS custom
// properties, so these are just the same hex values copied over by hand.
// Keep in sync if the palette changes there.
private extension Color {
    static let backlotBackground = Color(red: 10 / 255, green: 9 / 255, blue: 8 / 255)
    static let backlotForeground = Color(red: 242 / 255, green: 233 / 255, blue: 223 / 255)
    static let backlotAccent = Color(red: 217 / 255, green: 184 / 255, blue: 118 / 255)
    static let backlotForegroundMuted = Color(red: 168 / 255, green: 158 / 255, blue: 148 / 255)
}

struct DailyPickWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: DailyPickEntry

    var body: some View {
        switch entry.state {
        case .notSignedIn:
            MessageView(title: "Open Backlot", subtitle: "Sign in to see your daily pick")
        case .noPickYet:
            MessageView(title: "Rate a few movies", subtitle: "Your daily pick unlocks after that")
        case .error:
            MessageView(title: "Backlot", subtitle: "Couldn't load your pick")
        case .loaded(let pick, let posterImage):
            switch family {
            case .systemMedium:
                MediumPickView(pick: pick, posterImage: posterImage)
            default:
                SmallPickView(pick: pick, posterImage: posterImage)
            }
        }
    }
}

private struct MessageView: View {
    let title: String
    let subtitle: String

    var body: some View {
        ZStack {
            Color.backlotBackground
            VStack(spacing: 4) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.backlotForeground)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundColor(.backlotForegroundMuted)
                    .multilineTextAlignment(.center)
            }
            .padding(12)
        }
    }
}

/// Full-bleed poster, bottom gradient scrim, title + match% pill --
/// deliberately the same "poster is the whole card" language every
/// poster tile in the app itself uses (Discover grid, watchlist, etc.)
/// rather than inventing a new widget-specific layout.
private struct SmallPickView: View {
    let pick: DailyPick
    let posterImage: UIImage?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            posterBackground

            LinearGradient(
                colors: [.clear, .backlotBackground.opacity(0.55), .backlotBackground.opacity(0.95)],
                startPoint: .center,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 3) {
                if let match = pick.matchPercent {
                    Text("\(match)% MATCH")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.backlotAccent)
                        .tracking(0.5)
                }
                Text(pick.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.backlotForeground)
                    .lineLimit(2)
            }
            .padding(10)
        }
        .widgetURL(URL(string: "https://taste-green-tau.vercel.app/movie/\(pick.titleId)"))
    }

    @ViewBuilder
    private var posterBackground: some View {
        if let posterImage {
            Image(uiImage: posterImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            Color.backlotBackground
        }
    }
}

/// Poster on the left (fixed 2:3, matching every poster box elsewhere in
/// the app -- see backdrop-hero.tsx's comment on why a mismatched
/// aspect ratio crops badly), title/reason/match on the right.
private struct MediumPickView: View {
    let pick: DailyPick
    let posterImage: UIImage?

    var body: some View {
        ZStack {
            Color.backlotBackground
            HStack(alignment: .top, spacing: 12) {
                posterBackground
                    .aspectRatio(2 / 3, contentMode: .fill)
                    .frame(width: 74)
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                VStack(alignment: .leading, spacing: 5) {
                    Text("TODAY'S PICK")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.backlotForegroundMuted)
                        .tracking(0.8)
                    Text(pick.name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.backlotForeground)
                        .lineLimit(2)
                    if let match = pick.matchPercent {
                        Text("\(match)% match")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.backlotAccent)
                    }
                    Text(pick.reason)
                        .font(.system(size: 11))
                        .foregroundColor(.backlotForegroundMuted)
                        .lineLimit(3)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
        }
        .widgetURL(URL(string: "https://taste-green-tau.vercel.app/movie/\(pick.titleId)"))
    }

    @ViewBuilder
    private var posterBackground: some View {
        if let posterImage {
            Image(uiImage: posterImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            Rectangle().fill(Color.backlotForegroundMuted.opacity(0.15))
        }
    }
}
