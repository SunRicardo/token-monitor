import SwiftUI
import WidgetKit

enum TokenMonitorWidgetConfiguration {
    static let kind = "TokenMonitorWidget"
    static let appGroup = Bundle.main.object(forInfoDictionaryKey: "TokenMonitorAppGroup") as? String ?? ""
    static let urlScheme = Bundle.main.object(forInfoDictionaryKey: "TokenMonitorURLScheme") as? String ?? "token-monitor"

    static func url(for page: WidgetPage) -> URL {
        URL(string: "\(urlScheme)://\(page.rawValue)")!
    }

    static let settingsURL = URL(string: "\(urlScheme)://widget-settings")!
}

enum WidgetDesignTokens {
    static let outerPadding: CGFloat = 13
    static let sectionPadding: CGFloat = 9
    static let cornerRadius: CGFloat = 12
    static let smallGap: CGFloat = 5
    static let mediumGap: CGFloat = 10
    static let titleSize: CGFloat = 15
    static let smallPrimarySize: CGFloat = 27
    static let mediumPrimarySize: CGFloat = 31
    static let secondarySize: CGFloat = 10
    static let microSize: CGFloat = 9
    static let dividerOpacity = 0.14
    static let panelOpacity = 0.065
    static let accent = Color.accentColor
}

struct TokenMonitorWidget: Widget {
    let kind = TokenMonitorWidgetConfiguration.kind

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: TokenMonitorWidgetConfigurationIntent.self,
            provider: TokenMonitorTimelineProvider()
        ) { entry in
            TokenMonitorWidgetView(entry: entry)
                .widgetURL(TokenMonitorWidgetConfiguration.url(for: entry.page))
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("Token Monitor")
        .description("Choose Overview, Quota, Models, Activity, or Trend for each widget.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WidgetBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor)
            LinearGradient(
                colors: [
                    Color.primary.opacity(colorScheme == .dark ? 0.07 : 0.035),
                    WidgetDesignTokens.accent.opacity(colorScheme == .dark ? 0.08 : 0.045)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

struct TokenMonitorWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TokenMonitorEntry

    var body: some View {
        Group {
            if let snapshot = entry.snapshot {
                content(snapshot)
            } else {
                statusState(title: "Waiting for data", detail: "Open Token Monitor once")
            }
        }
        .padding(WidgetDesignTokens.outerPadding)
    }

    @ViewBuilder
    private func content(_ snapshot: WidgetSnapshot) -> some View {
        if snapshot.isEmpty {
            statusState(title: "No usage yet", detail: "Open Token Monitor to collect data")
        } else if snapshot.isStale(at: entry.date) {
            statusState(title: "Data may be stale", detail: "Updated \(snapshot.generatedAt.formatted(.relative(presentation: .named)))")
        } else if family == .systemMedium {
            medium(snapshot)
        } else {
            small(snapshot)
        }
    }

    private func small(_ snapshot: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: WidgetDesignTokens.smallGap) {
            header(snapshot: snapshot, page: entry.page)
            pageBody(snapshot: snapshot, page: entry.page, layout: .small)
            Spacer(minLength: 1)
            footer(page: entry.page)
        }
    }

    private func medium(_ snapshot: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: WidgetDesignTokens.mediumGap) {
            mediumHeader(snapshot: snapshot)
            pageBody(snapshot: snapshot, page: entry.page, layout: .medium)
            Spacer(minLength: 0)
            footer(page: entry.page)
        }
    }

    private func header(snapshot: WidgetSnapshot, page: WidgetPage) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            brand
            Spacer(minLength: 4)
            Text(page == .overview ? snapshot.overview.currentPeriod.uppercased() : page.title.uppercased())
                .font(.system(size: WidgetDesignTokens.microSize, weight: .semibold, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private func mediumHeader(snapshot: WidgetSnapshot) -> some View {
        HStack(spacing: 12) {
            brand
            Spacer(minLength: 6)
            ForEach(["DAY", "MONTH", "TOTAL"], id: \.self) { period in
                Text(period)
                    .font(.system(size: WidgetDesignTokens.microSize, weight: period == periodLabel(snapshot.overview.currentPeriod) ? .bold : .medium, design: .monospaced))
                    .foregroundStyle(period == periodLabel(snapshot.overview.currentPeriod) ? .primary : .tertiary)
            }
        }
    }

    private var brand: some View {
        HStack(spacing: 2) {
            Text("Σ")
                .font(.system(size: WidgetDesignTokens.titleSize, weight: .bold, design: .monospaced))
            Circle()
                .fill(WidgetDesignTokens.accent)
                .frame(width: 4, height: 4)
        }
        .accessibilityLabel("Token Monitor")
    }

    @ViewBuilder
    private func pageBody(snapshot: WidgetSnapshot, page: WidgetPage, layout: WidgetLayout) -> some View {
        switch page {
        case .overview: overview(snapshot, layout: layout)
        case .quota: quota(snapshot, layout: layout)
        case .models: models(snapshot, layout: layout)
        case .activity: activity(snapshot, layout: layout)
        case .trend: trend(snapshot, layout: layout)
        }
    }

    private func overview(_ snapshot: WidgetSnapshot, layout: WidgetLayout) -> some View {
        let model = WidgetViewModel.make(snapshot: snapshot, page: .overview, layout: layout)
        return Group {
            if layout == .small {
                VStack(alignment: .leading, spacing: 2) {
                    primary(model.primaryValue, size: WidgetDesignTokens.smallPrimarySize)
                    secondary(model.secondaryValue)
                    Text(snapshot.overview.updatedAt, style: .time)
                        .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else {
                HStack(spacing: WidgetDesignTokens.mediumGap) {
                    panel {
                        VStack(alignment: .leading, spacing: 3) {
                            sectionLabel("TOTAL TOKENS")
                            primary(model.primaryValue, size: WidgetDesignTokens.mediumPrimarySize)
                            secondary(model.secondaryValue)
                        }
                    }
                    VStack(spacing: 6) {
                        summaryRow("Quota", quotaSummary(snapshot))
                        summaryRow("Top model", snapshot.models.first?.displayName ?? "—")
                        summaryRow("Active days", "\(snapshot.activity.activeDays)")
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func quota(_ snapshot: WidgetSnapshot, layout: WidgetLayout) -> some View {
        let providers = Array(snapshot.quota.prefix(layout == .small ? 1 : 3))
        return VStack(alignment: .leading, spacing: layout == .small ? 6 : 5) {
            if providers.isEmpty {
                emptyMessage("Not configured")
            } else {
                ForEach(providers) { provider in
                    let remaining = provider.windows.first?.remainingPercent
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(WidgetFormat.provider(provider.provider))
                                .font(.system(size: layout == .small ? 14 : 12, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                            Spacer(minLength: 3)
                            Text(remaining.map { "\(Int($0.rounded()))% left" } ?? provider.displayStatus)
                                .font(.system(size: WidgetDesignTokens.secondarySize, weight: .medium, design: .monospaced))
                                .foregroundStyle(provider.status == "ok" ? .primary : .secondary)
                                .lineLimit(1)
                        }
                        if let remaining {
                            quotaBar(remaining)
                        }
                        if let reset = provider.windows.first?.resetsAt {
                            Text(WidgetFormat.reset(reset))
                                .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                    }
                    if provider.id != providers.last?.id { Divider().opacity(WidgetDesignTokens.dividerOpacity) }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func models(_ snapshot: WidgetSnapshot, layout: WidgetLayout) -> some View {
        let rows = Array(snapshot.models.prefix(layout == .small ? 2 : 3))
        return VStack(alignment: .leading, spacing: layout == .small ? 7 : 5) {
            if rows.isEmpty {
                emptyMessage("No model data")
            } else {
                ForEach(rows) { model in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(model.displayName)
                                .font(.system(size: layout == .small ? 12 : 11, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                                .truncationMode(.tail)
                            Spacer(minLength: 2)
                            Text("\(Int(model.sharePercent.rounded()))%")
                                .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        if layout == .medium { modelBar(model.sharePercent) }
                        Text(WidgetFormat.tokens(model.totalTokens, style: snapshot.presentation.numberStyle))
                            .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                            .foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func activity(_ snapshot: WidgetSnapshot, layout: WidgetLayout) -> some View {
        let days = Array(snapshot.activity.days.suffix(layout == .small ? 21 : 28))
        let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: layout == .small ? 7 : 14)
        return HStack(spacing: WidgetDesignTokens.mediumGap) {
            VStack(alignment: .leading, spacing: 0) {
                primary("\(snapshot.activity.activeDays)", size: layout == .small ? WidgetDesignTokens.smallPrimarySize : 26)
                secondary("Active days")
            }
            if !days.isEmpty {
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(days) { day in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(activityColor(day.intensity))
                            .aspectRatio(1, contentMode: .fit)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func trend(_ snapshot: WidgetSnapshot, layout: WidgetLayout) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                primary(WidgetFormat.tokens(snapshot.trend.currentTokens, style: snapshot.presentation.numberStyle), size: layout == .small ? 22 : 25)
                Spacer()
                if layout == .medium { secondary("Peak \(WidgetFormat.tokens(snapshot.trend.peakTokens, style: snapshot.presentation.numberStyle))") }
            }
            sparkline(snapshot.trend.points)
                .frame(height: layout == .small ? 34 : 42)
            secondary([snapshot.trend.startDate, snapshot.trend.endDate].compactMap { $0 }.joined(separator: " — "))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func footer(page: WidgetPage) -> some View {
        HStack(spacing: 6) {
            Link(destination: TokenMonitorWidgetConfiguration.settingsURL) {
                HStack(spacing: 4) {
                    Image(systemName: page.systemImage)
                    Text(LocalizedStringKey(page.title))
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 7, weight: .bold))
                }
                .font(.system(size: WidgetDesignTokens.microSize, weight: .medium))
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(.primary.opacity(WidgetDesignTokens.panelOpacity), in: Capsule())
                .overlay(Capsule().stroke(.primary.opacity(WidgetDesignTokens.dividerOpacity), lineWidth: 0.6))
            }
            .buttonStyle(.plain)
            Spacer(minLength: 4)
            Link(destination: TokenMonitorWidgetConfiguration.url(for: page)) {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: WidgetDesignTokens.secondarySize, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
    }

    private func statusState(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            brand
            Spacer()
            Text(title).font(.system(size: 13, weight: .semibold))
            Text(detail)
                .font(.system(size: WidgetDesignTokens.secondarySize))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            footer(page: entry.page)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func panel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding(WidgetDesignTokens.sectionPadding)
            .background(.primary.opacity(WidgetDesignTokens.panelOpacity), in: RoundedRectangle(cornerRadius: WidgetDesignTokens.cornerRadius))
    }

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack(spacing: 6) {
            Text(label).foregroundStyle(.secondary)
            Spacer(minLength: 4)
            Text(value)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .font(.system(size: WidgetDesignTokens.secondarySize, weight: .medium))
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(.primary.opacity(WidgetDesignTokens.panelOpacity), in: RoundedRectangle(cornerRadius: 7))
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text).font(.system(size: WidgetDesignTokens.microSize, weight: .semibold, design: .monospaced)).foregroundStyle(.secondary)
    }

    private func primary(_ text: String, size: CGFloat) -> some View {
        Text(text)
            .font(.system(size: size, weight: .semibold, design: .monospaced))
            .lineLimit(1)
            .minimumScaleFactor(0.62)
            .contentTransition(.numericText())
    }

    private func secondary(_ text: String) -> some View {
        Text(text)
            .font(.system(size: WidgetDesignTokens.secondarySize, design: .monospaced))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    private func emptyMessage(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
    }

    private func quotaSummary(_ snapshot: WidgetSnapshot) -> String {
        guard let provider = snapshot.quota.first else { return "Not configured" }
        return provider.windows.first?.remainingPercent.map { "\(Int($0.rounded()))%" } ?? provider.displayStatus
    }

    private func quotaBar(_ remaining: Double) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.primary.opacity(0.08))
                Capsule().fill(WidgetDesignTokens.accent.opacity(0.7)).frame(width: proxy.size.width * max(0, min(1, remaining / 100)))
            }
        }
        .frame(height: 4)
    }

    private func modelBar(_ share: Double) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.primary.opacity(0.07))
                Capsule().fill(.primary.opacity(0.34)).frame(width: proxy.size.width * max(0, min(1, share / 100)))
            }
        }
        .frame(height: 3)
    }

    private func sparkline(_ points: [WidgetTrendPoint]) -> some View {
        GeometryReader { proxy in
            let values = points.map { Double($0.totalTokens) }
            let peak = max(values.max() ?? 1, 1)
            Path { path in
                for (index, value) in values.enumerated() {
                    let x = values.count <= 1 ? 0 : proxy.size.width * CGFloat(index) / CGFloat(values.count - 1)
                    let y = proxy.size.height * (1 - CGFloat(value / peak))
                    if index == 0 { path.move(to: CGPoint(x: x, y: y)) }
                    else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(WidgetDesignTokens.accent, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
        }
    }

    private func activityColor(_ intensity: Int) -> Color {
        intensity <= 0 ? .primary.opacity(0.06) : WidgetDesignTokens.accent.opacity(0.18 + Double(min(4, intensity)) * 0.17)
    }

    private func periodLabel(_ period: String) -> String {
        switch period { case "month": "MONTH"; case "allTime": "TOTAL"; default: "DAY" }
    }
}
