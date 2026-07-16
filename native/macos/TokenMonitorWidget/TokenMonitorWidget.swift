import SwiftUI
import WidgetKit

enum TokenMonitorWidgetConfiguration {
    static let kind = "TokenMonitorWidget"
    static let appGroup = Bundle.main.object(
        forInfoDictionaryKey: "TokenMonitorAppGroup"
    ) as? String ?? ""
}

struct TokenMonitorWidget: Widget {
    let kind = TokenMonitorWidgetConfiguration.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TokenMonitorTimelineProvider()) { entry in
            TokenMonitorWidgetView(entry: entry)
                .widgetURL(URL(string: "token-monitor://widget"))
                .containerBackground(for: .widget) {
                    Color(nsColor: .windowBackgroundColor)
                }
        }
        .configurationDisplayName("Token Monitor")
        .description("Today’s AI token usage, cost, and quota windows.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TokenMonitorWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TokenMonitorEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            content(snapshot)
        } else {
            unavailableState
        }
    }

    @ViewBuilder
    private func content(_ snapshot: WidgetSnapshot) -> some View {
        if snapshot.isEmpty {
            statusState(title: "No usage yet", detail: "Open Token Monitor to collect data")
        } else if snapshot.isStale(at: entry.date) {
            statusState(title: "Data is stale", detail: relativeUpdate(snapshot.generatedAt))
        } else if family == .systemMedium {
            mediumContent(snapshot)
        } else {
            smallContent(snapshot)
        }
    }

    private func smallContent(_ snapshot: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            header(snapshot)
            Spacer(minLength: 0)
            Text(formatTokens(snapshot.today.totalTokens))
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .minimumScaleFactor(0.7)
            Text(formatCost(snapshot.today.costUsd))
                .font(.caption)
                .foregroundStyle(.secondary)
            if let limit = firstLimit(snapshot) {
                limitRow(limit)
            }
        }
        .padding()
    }

    private func mediumContent(_ snapshot: WidgetSnapshot) -> some View {
        HStack(alignment: .top, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                header(snapshot)
                Text(formatTokens(snapshot.today.totalTokens))
                    .font(.system(size: 30, weight: .semibold, design: .rounded))
                Text("\(formatCost(snapshot.today.costUsd)) today")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 9) {
                ForEach(Array(snapshot.tools.prefix(2))) { tool in
                    HStack {
                        Text(tool.id.capitalized)
                        Spacer()
                        Text(formatTokens(tool.totalTokens))
                            .foregroundStyle(.secondary)
                    }
                    .font(.caption)
                }
                ForEach(Array(snapshot.limits.prefix(2))) { limit in
                    limitRow(limit)
                }
            }
            .frame(maxWidth: 170)
        }
        .padding()
    }

    private func header(_ snapshot: WidgetSnapshot) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "gauge.with.dots.needle.67percent")
            Text("Today")
                .font(.caption.weight(.semibold))
            Spacer()
            Text(snapshot.generatedAt, style: .time)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var unavailableState: some View {
        statusState(title: "Waiting for data", detail: "Open Token Monitor once")
    }

    private func statusState(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "gauge.with.dots.needle.67percent")
                .font(.title2)
            Spacer()
            Text(title).font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
    }

    private func firstLimit(_ snapshot: WidgetSnapshot) -> WidgetLimit? {
        snapshot.limits.first { $0.status == "ok" && !$0.windows.isEmpty }
    }

    private func limitRow(_ limit: WidgetLimit) -> some View {
        let remaining = limit.windows.first?.remainingPercent
        return HStack(spacing: 6) {
            Text(limit.provider.capitalized)
            Spacer()
            Text(remaining.map { "\(Int($0.rounded()))% left" } ?? limit.status)
                .foregroundStyle(.secondary)
        }
        .font(.caption2)
    }

    private func relativeUpdate(_ date: Date) -> String {
        "Updated " + date.formatted(.relative(presentation: .named))
    }

    private func formatTokens(_ value: Int) -> String {
        switch value {
        case 1_000_000...: return String(format: "%.1fM", Double(value) / 1_000_000)
        case 1_000...: return String(format: "%.1fK", Double(value) / 1_000)
        default: return value.formatted()
        }
    }

    private func formatCost(_ value: Double) -> String {
        String(format: "$%.2f", value)
    }
}
