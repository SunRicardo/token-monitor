import SwiftUI
import WidgetKit

enum TokenMonitorWidgetConfiguration {
    static let kind = Bundle.main.object(forInfoDictionaryKey: "TMWidgetKind") as? String ?? "com.tokenmonitor.dashboard"
    static let appGroup = Bundle.main.object(forInfoDictionaryKey: "TokenMonitorAppGroup") as? String ?? ""
    static let urlScheme = Bundle.main.object(forInfoDictionaryKey: "TokenMonitorURLScheme") as? String ?? "token-monitor"

    static func url(for page: WidgetPage) -> URL {
        URL(string: "\(urlScheme)://\(page.rawValue)")!
    }

    static let settingsURL = URL(string: "\(urlScheme)://widget-settings")!
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
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
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

private enum WidgetLayoutRegion: String {
    case header
    case content
    case footer
}

#if DEBUG
private struct WidgetLayoutRegionFrame: Equatable {
    let region: WidgetLayoutRegion
    let frame: CGRect
}

private struct WidgetLayoutRegionPreferenceKey: PreferenceKey {
    static var defaultValue: [WidgetLayoutRegionFrame] = []

    static func reduce(value: inout [WidgetLayoutRegionFrame], nextValue: () -> [WidgetLayoutRegionFrame]) {
        value.append(contentsOf: nextValue())
    }
}
#endif

private extension View {
    @ViewBuilder
    func measureWidgetLayoutRegion(_ region: WidgetLayoutRegion) -> some View {
        #if DEBUG
        background(
            GeometryReader { proxy in
                Color.clear.preference(
                    key: WidgetLayoutRegionPreferenceKey.self,
                    value: [WidgetLayoutRegionFrame(region: region, frame: proxy.frame(in: .local))]
                )
            }
        )
        #else
        self
        #endif
    }
}

private enum WidgetContentDensity {
    case regular
    case compact
    case summary
}

private struct WidgetContentContext {
    let layout: WidgetLayout
    let metrics: WidgetLayoutMetrics
    let size: CGSize
}

private struct WidgetActivitySpec {
    let days: [WidgetActivityDay]
    let columns: Int
    let cellSize: CGFloat
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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var metrics: WidgetLayoutMetrics {
        WidgetLayoutMetrics.metrics(for: family)
    }

    @ViewBuilder
    private func content(_ snapshot: WidgetSnapshot) -> some View {
        if snapshot.isEmpty {
            statusState(title: "No usage yet", detail: "Open Token Monitor to collect data")
        } else if snapshot.isStale(at: entry.date) {
            statusState(title: "Data may be stale", detail: "Updated \(snapshot.generatedAt.formatted(.relative(presentation: .named)))")
        } else {
            switch family {
            case .systemLarge: large(snapshot)
            case .systemMedium: medium(snapshot)
            default: small(snapshot)
            }
        }
    }

    private func small(_ snapshot: WidgetSnapshot) -> some View {
        scaffold(
            header: header(snapshot: snapshot, page: entry.page),
            content: pageBody(snapshot: snapshot, page: entry.page, layout: .small),
            footer: footer(page: entry.page, familyScope: familyScope),
            metrics: metrics
        )
    }

    private func medium(_ snapshot: WidgetSnapshot) -> some View {
        scaffold(
            header: mediumHeader(snapshot: snapshot),
            content: pageBody(snapshot: snapshot, page: entry.page, layout: .medium),
            footer: footer(page: entry.page, familyScope: familyScope),
            metrics: metrics
        )
    }

    private func large(_ snapshot: WidgetSnapshot) -> some View {
        scaffold(
            header: mediumHeader(snapshot: snapshot),
            content: pageBody(snapshot: snapshot, page: entry.page, layout: .large),
            footer: footer(page: entry.page, familyScope: familyScope),
            metrics: metrics
        )
    }

    private func scaffold<Header: View, Content: View, Footer: View>(
        header: Header,
        content: Content,
        footer: Footer,
        metrics: WidgetLayoutMetrics
    ) -> some View {
        VStack(spacing: metrics.contentGap) {
            header
                .frame(height: metrics.headerHeight)
                .frame(maxWidth: .infinity, alignment: .leading)
                .measureWidgetLayoutRegion(.header)

            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .measureWidgetLayoutRegion(.content)

            footer
                .frame(height: metrics.footerHeight)
                .frame(maxWidth: .infinity, alignment: .leading)
                .measureWidgetLayoutRegion(.footer)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(metrics.outerInsets)
    }

    private var familyScope: WidgetFamilyScope? {
        WidgetFamilyScope(widgetFamily: family)
    }

    private func header(snapshot: WidgetSnapshot, page: WidgetPage) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            brand
            Spacer(minLength: 4)
            WidgetPeriodControl(selection: entry.period, style: .compact)
        }
        .frame(height: metrics.headerHeight, alignment: .center)
    }

    private func mediumHeader(snapshot: WidgetSnapshot) -> some View {
        HStack(spacing: 12) {
            brand
            Spacer(minLength: 6)
            WidgetPeriodControl(selection: entry.period, style: .segmented)
        }
        .frame(height: metrics.headerHeight, alignment: .center)
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
        GeometryReader { proxy in
            let context = WidgetContentContext(layout: layout, metrics: metrics, size: proxy.size)
            Group {
                switch page {
                case .overview: overview(snapshot, context: context)
                case .quota: quota(snapshot, context: context)
                case .models: models(snapshot, context: context)
                case .activity: activity(snapshot, context: context)
                case .trend: trend(snapshot, context: context)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func overview(_ snapshot: WidgetSnapshot, context: WidgetContentContext) -> some View {
        let model = WidgetViewModel.make(snapshot: snapshot, page: .overview, layout: context.layout)
        return adaptiveContent {
            if context.layout == .small {
                VStack(alignment: .leading, spacing: 6) {
                    primary(model.primaryValue, size: WidgetDesignTokens.smallPrimarySize)
                    secondary(model.secondaryValue)
                    summaryRow("Quota", quotaSummary(snapshot))
                    Text(snapshot.overview.updatedAt, style: .time)
                        .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
            } else if context.layout == .medium {
                HStack(alignment: .top, spacing: WidgetDesignTokens.mediumGap) {
                    Link(destination: TokenMonitorWidgetConfiguration.url(for: .overview)) {
                        panel {
                            VStack(alignment: .leading, spacing: 4) {
                                sectionLabel("TOTAL TOKENS")
                                primary(model.primaryValue, size: WidgetDesignTokens.mediumPrimarySize)
                                secondary(model.secondaryValue)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    VStack(spacing: 6) {
                        summaryLinkRow(title: "Quota", value: quotaSummary(snapshot), page: .quota)
                        summaryLinkRow(title: "Top model", value: snapshot.models.first?.displayName ?? "—", page: .models)
                        summaryLinkRow(title: "Active days", value: "\(snapshot.activity.activeDays)", page: .activity)
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Link(destination: TokenMonitorWidgetConfiguration.url(for: .overview)) {
                        panel {
                            VStack(alignment: .leading, spacing: 4) {
                                sectionLabel("TOTAL TOKENS")
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    primary(snapshot.overview.totalTokens.formatted(.number.grouping(.automatic)), size: WidgetDesignTokens.largePrimarySize)
                                    Text("≈ \(model.primaryValue)")
                                        .font(.system(size: WidgetDesignTokens.secondarySize, weight: .medium, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                }
                                secondary(model.secondaryValue)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    HStack(spacing: 8) {
                        summaryLinkRow(title: "额度", value: quotaSummary(snapshot), page: .quota)
                        summaryLinkRow(title: "活跃天数", value: "\(snapshot.activity.activeDays)", page: .activity)
                    }
                    summaryLinkSection(
                        title: "模型",
                        rows: modelOverviewRows(snapshot, limit: 3),
                        page: .models
                    )
                    summaryLinkRow(
                        title: "当前趋势",
                        value: WidgetFormat.tokens(snapshot.trend.currentTokens, style: snapshot.presentation.numberStyle),
                        page: .trend
                    )
                }
            }
        } compact: {
            if context.layout == .small {
                VStack(alignment: .leading, spacing: 4) {
                    primary(model.primaryValue, size: WidgetDesignTokens.smallPrimarySize)
                    secondary(model.secondaryValue)
                    Text(snapshot.overview.updatedAt, style: .time)
                        .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
            } else if context.layout == .medium {
                HStack(alignment: .top, spacing: 8) {
                    Link(destination: TokenMonitorWidgetConfiguration.url(for: .overview)) {
                        panel {
                            VStack(alignment: .leading, spacing: 3) {
                                sectionLabel("TOTAL TOKENS")
                                primary(model.primaryValue, size: WidgetDesignTokens.mediumPrimarySize)
                                secondary(model.secondaryValue)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    VStack(spacing: 6) {
                        summaryLinkRow(title: "Quota", value: quotaSummary(snapshot), page: .quota)
                        summaryLinkRow(title: "Top model", value: snapshot.models.first?.displayName ?? "—", page: .models)
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                }
            } else {
                VStack(alignment: .leading, spacing: 7) {
                    Link(destination: TokenMonitorWidgetConfiguration.url(for: .overview)) {
                        panel {
                            VStack(alignment: .leading, spacing: 3) {
                                sectionLabel("TOTAL TOKENS")
                                primary(model.primaryValue, size: 30)
                                secondary(model.secondaryValue)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    summaryLinkRow(title: "Quota", value: quotaSummary(snapshot), page: .quota)
                    summaryLinkSection(
                        title: "模型",
                        rows: modelOverviewRows(snapshot, limit: 2),
                        page: .models
                    )
                }
            }
        } summary: {
            VStack(alignment: .leading, spacing: 4) {
                primary(model.primaryValue, size: context.layout == .large ? 28 : 24)
                secondary(model.secondaryValue)
                if context.layout != .small {
                    summaryLinkRow(title: "Quota", value: quotaSummary(snapshot), page: .quota)
                }
            }
        }
    }

    private func quota(_ snapshot: WidgetSnapshot, context: WidgetContentContext) -> some View {
        adaptiveContent {
            quotaList(snapshot, context: context, limit: quotaLimit(for: context.layout, density: .regular), showsBars: true, showsReset: true)
        } compact: {
            quotaList(snapshot, context: context, limit: quotaLimit(for: context.layout, density: .compact), showsBars: true, showsReset: false)
        } summary: {
            quotaList(snapshot, context: context, limit: quotaLimit(for: context.layout, density: .summary), showsBars: false, showsReset: false)
        }
    }

    private func models(_ snapshot: WidgetSnapshot, context: WidgetContentContext) -> some View {
        adaptiveContent {
            modelList(snapshot, context: context, limit: modelLimit(for: context.layout, density: .regular), showsBars: context.layout != .small, showsTokens: true)
        } compact: {
            modelList(snapshot, context: context, limit: modelLimit(for: context.layout, density: .compact), showsBars: context.layout == .large, showsTokens: true)
        } summary: {
            modelList(snapshot, context: context, limit: modelLimit(for: context.layout, density: .summary), showsBars: false, showsTokens: false)
        }
    }

    private func activity(_ snapshot: WidgetSnapshot, context: WidgetContentContext) -> some View {
        adaptiveContent {
            activityView(snapshot, context: context, density: .regular)
        } compact: {
            activityView(snapshot, context: context, density: .compact)
        } summary: {
            activityView(snapshot, context: context, density: .summary)
        }
    }

    private func trend(_ snapshot: WidgetSnapshot, context: WidgetContentContext) -> some View {
        adaptiveContent {
            trendView(snapshot, context: context, density: .regular)
        } compact: {
            trendView(snapshot, context: context, density: .compact)
        } summary: {
            trendView(snapshot, context: context, density: .summary)
        }
    }

    private func footer(page: WidgetPage, familyScope: WidgetFamilyScope?) -> some View {
        HStack(spacing: 6) {
            if let familyScope {
                WidgetPageControl(page: page, family: familyScope)
                    .frame(width: metrics.pageControlWidth, height: WidgetDesignTokens.pageControlHeight, alignment: .leading)
            } else {
                pageLabel(page: page)
                    .frame(width: metrics.pageControlWidth, height: WidgetDesignTokens.pageControlHeight, alignment: .leading)
            }
            Spacer(minLength: 4)
            Link(destination: TokenMonitorWidgetConfiguration.url(for: page)) {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: WidgetDesignTokens.secondarySize, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: WidgetDesignTokens.openButtonSize, height: WidgetDesignTokens.openButtonSize)
            }
            .buttonStyle(.plain)
        }
        .frame(height: metrics.footerHeight)
    }

    private func statusState(title: String, detail: String) -> some View {
        scaffold(
            header: brand,
            content: VStack(alignment: .leading, spacing: 6) {
                Spacer(minLength: 0)
                Text(title).font(.system(size: 13, weight: .semibold))
                Text(detail)
                    .font(.system(size: WidgetDesignTokens.secondarySize))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Spacer(minLength: 0)
            },
            footer: footer(page: entry.page, familyScope: familyScope),
            metrics: metrics
        )
    }

    private func pageLabel(page: WidgetPage, showsNextIndicator: Bool = false) -> some View {
        HStack(spacing: 4) {
            Image(systemName: page.systemImage)
            Text(LocalizedStringKey(page.title))
                .lineLimit(1)
            if showsNextIndicator {
                Image(systemName: "chevron.right")
                    .font(.system(size: WidgetDesignTokens.microSize - 1, weight: .semibold))
            }
        }
        .font(.system(size: WidgetDesignTokens.microSize, weight: .medium))
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .frame(height: WidgetDesignTokens.pageControlHeight, alignment: .center)
        .background(.primary.opacity(WidgetDesignTokens.panelOpacity), in: Capsule())
        .overlay(Capsule().stroke(.primary.opacity(WidgetDesignTokens.dividerOpacity), lineWidth: 0.6))
    }

    private func panel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
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

    private func largeSummarySection(title: String, rows: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionLabel(title)
            if rows.isEmpty {
                emptyMessage("暂无数据")
            } else {
                ForEach(Array(rows.prefix(5).enumerated()), id: \.offset) { _, row in
                    Text(row)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .truncationMode(.tail)
                }
            }
        }
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

    private func adaptiveContent<Regular: View, Compact: View, Summary: View>(
        @ViewBuilder regular: () -> Regular,
        @ViewBuilder compact: () -> Compact,
        @ViewBuilder summary: () -> Summary
    ) -> some View {
        ViewThatFits(in: .vertical) {
            regular()
            compact()
            summary()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func quotaSummary(_ snapshot: WidgetSnapshot) -> String {
        guard let provider = snapshot.quota.first else { return "未配置" }
        let label = WidgetFormat.provider(provider.provider)
        let status = provider.windows.first?.remainingPercent.map { "\(Int($0.rounded()))% left" } ?? provider.displayStatus
        return "\(label) \(status)"
    }

    private func modelOverviewRows(_ snapshot: WidgetSnapshot, limit: Int) -> [String] {
        let rows = Array(snapshot.models.prefix(limit)).map {
            "\($0.displayName) · \(WidgetFormat.tokens($0.totalTokens, style: snapshot.presentation.numberStyle))"
        }
        if snapshot.models.count > limit {
            return rows + ["另有 \(snapshot.models.count - limit) 项"]
        }
        return rows
    }

    private func summaryLinkRow(title: String, value: String, page: WidgetPage) -> some View {
        Link(destination: TokenMonitorWidgetConfiguration.url(for: page)) {
            summaryRow(title, value)
        }
        .buttonStyle(.plain)
    }

    private func summaryLinkSection(title: String, rows: [String], page: WidgetPage) -> some View {
        Link(destination: TokenMonitorWidgetConfiguration.url(for: page)) {
            panel {
                VStack(alignment: .leading, spacing: 5) {
                    sectionLabel(title)
                    if rows.isEmpty {
                        emptyMessage("暂无数据")
                    } else {
                        ForEach(Array(rows.prefix(3).enumerated()), id: \.offset) { _, row in
                            Text(row)
                                .font(.system(size: 11, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                                .truncationMode(.tail)
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func quotaLimit(for layout: WidgetLayout, density: WidgetContentDensity) -> Int {
        switch (layout, density) {
        case (.small, .regular): 2
        case (.small, .compact), (.small, .summary): 1
        case (.medium, .regular): 3
        case (.medium, .compact): 2
        case (.medium, .summary): 1
        case (.large, .regular): 5
        case (.large, .compact): 4
        case (.large, .summary): 2
        }
    }

    private func modelLimit(for layout: WidgetLayout, density: WidgetContentDensity) -> Int {
        switch (layout, density) {
        case (.small, .regular): 2
        case (.small, .compact), (.small, .summary): 1
        case (.medium, .regular): 3
        case (.medium, .compact): 2
        case (.medium, .summary): 1
        case (.large, .regular): 5
        case (.large, .compact): 4
        case (.large, .summary): 2
        }
    }

    private func quotaList(
        _ snapshot: WidgetSnapshot,
        context: WidgetContentContext,
        limit: Int,
        showsBars: Bool,
        showsReset: Bool
    ) -> some View {
        let providers = Array(snapshot.quota.prefix(limit))
        let hiddenCount = max(0, snapshot.quota.count - providers.count)

        return VStack(alignment: .leading, spacing: context.layout == .small ? 6 : 5) {
            if providers.isEmpty {
                emptyMessage("未配置额度来源")
                if context.layout != .small {
                    secondary("在桌面端完成 Provider 登录后显示")
                }
            } else {
                ForEach(providers) { provider in
                    quotaProviderRow(provider, layout: context.layout, showsBars: showsBars, showsReset: showsReset)
                    if provider.id != providers.last?.id { Divider().opacity(WidgetDesignTokens.dividerOpacity) }
                }
                if hiddenCount > 0 {
                    secondary("另有 \(hiddenCount) 项")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func quotaProviderRow(
        _ provider: WidgetQuotaProvider,
        layout: WidgetLayout,
        showsBars: Bool,
        showsReset: Bool
    ) -> some View {
        let remaining = provider.windows.first?.remainingPercent
        let providerFontSize: CGFloat = layout == .small ? 13 : 12

        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(WidgetFormat.provider(provider.provider))
                    .font(.system(size: providerFontSize, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Spacer(minLength: 3)
                Text(remaining.map { "\(Int($0.rounded()))% left" } ?? provider.displayStatus)
                    .font(.system(size: WidgetDesignTokens.secondarySize, weight: .medium, design: .monospaced))
                    .foregroundStyle(provider.status == "ok" ? .primary : .secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }
            if showsBars, let remaining {
                quotaBar(remaining)
            }
            if showsReset, let reset = provider.windows.first?.resetsAt {
                Text(WidgetFormat.reset(reset))
                    .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func modelList(
        _ snapshot: WidgetSnapshot,
        context: WidgetContentContext,
        limit: Int,
        showsBars: Bool,
        showsTokens: Bool
    ) -> some View {
        let rows = Array(snapshot.models.prefix(limit))
        let hiddenCount = max(0, snapshot.models.count - rows.count)

        return VStack(alignment: .leading, spacing: context.layout == .small ? 7 : 5) {
            if rows.isEmpty {
                emptyMessage("模型排行为空")
            } else {
                ForEach(rows) { model in
                    modelRow(model, layout: context.layout, showsBars: showsBars, showsTokens: showsTokens, style: snapshot.presentation.numberStyle)
                }
                if hiddenCount > 0 {
                    secondary("另有 \(hiddenCount) 项")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func modelRow(
        _ model: WidgetModel,
        layout: WidgetLayout,
        showsBars: Bool,
        showsTokens: Bool,
        style: String
    ) -> some View {
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
            if showsBars {
                modelBar(model.sharePercent)
            }
            if showsTokens {
                Text(WidgetFormat.tokens(model.totalTokens, style: style))
                    .font(.system(size: WidgetDesignTokens.microSize, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func activityView(
        _ snapshot: WidgetSnapshot,
        context: WidgetContentContext,
        density: WidgetContentDensity
    ) -> some View {
        let spec = activitySpec(snapshot, context: context, density: density)

        return VStack(alignment: .leading, spacing: density == .summary ? 4 : 6) {
            if context.layout == .small {
                HStack(spacing: 4) {
                    Text("活跃")
                        .font(.system(size: WidgetDesignTokens.secondarySize, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text("\(snapshot.activity.activeDays) 天")
                        .font(.system(size: WidgetDesignTokens.secondarySize, weight: .semibold, design: .monospaced))
                }
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    primary("\(snapshot.activity.activeDays)", size: density == .summary ? 22 : 26)
                    secondary("活跃天数")
                }
            }

            if spec.days.isEmpty {
                emptyMessage("暂无活动数据")
            } else {
                ActivityHeatmap(
                    days: spec.days,
                    columns: spec.columns,
                    cellSize: spec.cellSize,
                    spacing: metrics.activityCellSpacing
                )
                .frame(maxWidth: .infinity, alignment: .center)

                if density == .regular {
                    secondary(activityDateRangeText(spec.days))
                } else if density == .compact {
                    secondary("近 \(spec.days.count) 天")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func activitySpec(
        _ snapshot: WidgetSnapshot,
        context: WidgetContentContext,
        density: WidgetContentDensity
    ) -> WidgetActivitySpec {
        let maxDays: Int
        let columns: Int
        let labelReserve: CGFloat

        switch (context.layout, density) {
        case (.small, .regular):
            maxDays = 14
            columns = 7
            labelReserve = 14
        case (.small, .compact):
            maxDays = 7
            columns = 7
            labelReserve = 0
        case (.small, .summary):
            maxDays = 7
            columns = 7
            labelReserve = 0
        case (.medium, .regular):
            maxDays = 28
            columns = 14
            labelReserve = 14
        case (.medium, .compact):
            maxDays = 21
            columns = 14
            labelReserve = 12
        case (.medium, .summary):
            maxDays = 14
            columns = 14
            labelReserve = 0
        case (.large, .regular):
            maxDays = 42
            columns = 14
            labelReserve = 14
        case (.large, .compact):
            maxDays = 28
            columns = 14
            labelReserve = 12
        case (.large, .summary):
            maxDays = 14
            columns = 14
            labelReserve = 0
        }

        let days = Array(snapshot.activity.days.suffix(maxDays))
        let rowCount = max(1, Int(ceil(Double(max(days.count, 1)) / Double(columns))))
        let gridWidth = max(0, context.size.width)
        let gridHeight = max(0, context.size.height - labelReserve - 24)
        let spacing = metrics.activityCellSpacing
        let widthFit = (gridWidth - CGFloat(max(0, columns - 1)) * spacing) / CGFloat(columns)
        let heightFit = (gridHeight - CGFloat(max(0, rowCount - 1)) * spacing) / CGFloat(rowCount)
        let cellSize = min(metrics.activityMaxCellSize, max(metrics.activityMinCellSize, min(widthFit, heightFit)))

        return WidgetActivitySpec(days: days, columns: columns, cellSize: cellSize)
    }

    private func activityDateRangeText(_ days: [WidgetActivityDay]) -> String {
        guard let first = days.first?.date, let last = days.last?.date else { return "暂无活动数据" }
        return "\(first) — \(last)"
    }

    private func trendView(
        _ snapshot: WidgetSnapshot,
        context: WidgetContentContext,
        density: WidgetContentDensity
    ) -> some View {
        let sparkHeight = sparklineHeight(for: context.layout, density: density)

        return VStack(alignment: .leading, spacing: density == .summary ? 4 : 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                primary(
                    WidgetFormat.tokens(snapshot.trend.currentTokens, style: snapshot.presentation.numberStyle),
                    size: context.layout == .small ? 22 : 25
                )
                Spacer(minLength: 4)
                if density == .regular {
                    secondary("峰值 \(WidgetFormat.tokens(snapshot.trend.peakTokens, style: snapshot.presentation.numberStyle))")
                } else {
                    secondary(trendDeltaText(snapshot.trend))
                }
            }
            sparkline(snapshot.trend.points)
                .frame(height: sparkHeight)
            if density != .summary {
                secondary(trendDateRange(snapshot.trend))
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func sparklineHeight(for layout: WidgetLayout, density: WidgetContentDensity) -> CGFloat {
        switch (layout, density) {
        case (.small, .regular): 40
        case (.small, .compact): 32
        case (.small, .summary): 24
        case (.medium, .regular): 48
        case (.medium, .compact): 38
        case (.medium, .summary): 28
        case (.large, .regular): 96
        case (.large, .compact): 68
        case (.large, .summary): 36
        }
    }

    private func trendDateRange(_ trend: WidgetTrend) -> String {
        let values = [trend.startDate, trend.endDate].compactMap { $0 }
        return values.isEmpty ? "暂无趋势数据" : values.joined(separator: " — ")
    }

    private func trendDeltaText(_ trend: WidgetTrend) -> String {
        guard let first = trend.points.first?.totalTokens, let last = trend.points.last?.totalTokens else {
            return "暂无变化"
        }
        let delta = last - first
        if first > 0 {
            let percent = Int((Double(delta) / Double(first) * 100).rounded())
            if percent == 0 { return "较首日持平" }
            return percent > 0 ? "较首日 ↑\(percent)%" : "较首日 ↓\(abs(percent))%"
        }
        if delta == 0 { return "较首日持平" }
        let prefix = delta > 0 ? "+" : "−"
        return "\(prefix)\(WidgetFormat.tokens(abs(delta)))"
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

}

struct ActivityHeatmap: View {
    let days: [WidgetActivityDay]
    let columns: Int
    let cellSize: CGFloat
    let spacing: CGFloat

    var body: some View {
        if days.isEmpty {
            EmptyView()
        } else {
            LazyVGrid(columns: gridColumns, spacing: spacing) {
                ForEach(days) { day in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(activityColor(day.intensity))
                        .frame(width: cellSize, height: cellSize)
                }
            }
            .frame(width: gridWidth, alignment: .center)
            .accessibilityLabel("活动热力图")
        }
    }

    private var gridColumns: [GridItem] {
        Array(repeating: GridItem(.fixed(cellSize), spacing: spacing), count: columns)
    }

    private var gridWidth: CGFloat {
        CGFloat(columns) * cellSize + CGFloat(max(0, columns - 1)) * spacing
    }

    private func activityColor(_ intensity: Int) -> Color {
        intensity <= 0 ? .primary.opacity(0.06) : WidgetDesignTokens.accent.opacity(0.18 + Double(min(4, intensity)) * 0.17)
    }
}

enum WidgetPeriodControlStyle {
    case compact
    case segmented
}

struct WidgetPeriodControl: View {
    let selection: WidgetPeriod
    let style: WidgetPeriodControlStyle

    var body: some View {
        switch style {
        case .compact:
            Button(intent: CycleWidgetPeriodIntent()) {
                periodLabel(selection, selected: true)
            }
            .buttonStyle(.plain)
            .frame(height: WidgetDesignTokens.periodControlHeight, alignment: .center)
            .accessibilityLabel("\(selection.accessibilityName)，已选择")
            .accessibilityHint("切换到\(selection.next.accessibilityName)")
        case .segmented:
            HStack(spacing: 5) {
                ForEach(WidgetPeriod.allCases, id: \.self) { period in
                    Button(intent: SetWidgetPeriodIntent(period: period)) {
                        periodLabel(period, selected: period == selection)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(period == selection ? "\(period.accessibilityName)，已选择" : "切换到\(period.accessibilityName)")
                }
            }
            .frame(height: WidgetDesignTokens.periodControlHeight, alignment: .center)
        }
    }

    private func periodLabel(_ period: WidgetPeriod, selected: Bool) -> some View {
        Text(period.title)
            .font(.system(size: WidgetDesignTokens.microSize, weight: selected ? .bold : .medium, design: .monospaced))
            .foregroundStyle(selected ? .primary : .tertiary)
            .padding(.horizontal, selected ? 6 : 3)
            .padding(.vertical, 3)
            .frame(height: WidgetDesignTokens.periodControlHeight, alignment: .center)
            .background(Color.primary.opacity(selected ? WidgetDesignTokens.panelOpacity * 1.8 : 0), in: Capsule())
            .overlay(Capsule().stroke(.primary.opacity(selected ? WidgetDesignTokens.dividerOpacity : 0), lineWidth: 0.6))
            .lineLimit(1)
    }
}

struct WidgetPageControl: View {
    let page: WidgetPage
    let family: WidgetFamilyScope

    var body: some View {
        Button(intent: CycleWidgetPageIntent(family: family, currentPage: page)) {
            HStack(spacing: 4) {
                Image(systemName: page.systemImage)
                Text(LocalizedStringKey(page.title))
                    .lineLimit(1)
                Image(systemName: "chevron.right")
                    .font(.system(size: WidgetDesignTokens.microSize - 1, weight: .semibold))
            }
            .font(.system(size: WidgetDesignTokens.microSize, weight: .medium))
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .frame(height: WidgetDesignTokens.pageControlHeight, alignment: .center)
            .background(.primary.opacity(WidgetDesignTokens.panelOpacity), in: Capsule())
            .overlay(Capsule().stroke(.primary.opacity(WidgetDesignTokens.dividerOpacity), lineWidth: 0.6))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("当前页面：\(page.title)")
        .accessibilityHint("切换到\(page.next.title)")
    }
}
