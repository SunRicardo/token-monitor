import Foundation

enum WidgetLayout {
    case small
    case medium
    case large
}

struct WidgetViewModel: Equatable {
    let page: WidgetPage
    let title: String
    let primaryValue: String
    let secondaryValue: String
    let rows: [String]

    static func make(snapshot: WidgetSnapshot, page: WidgetPage, layout: WidgetLayout) -> WidgetViewModel {
        let rowLimit: Int
        switch layout {
        case .small: rowLimit = 2
        case .medium: rowLimit = 3
        case .large: rowLimit = 5
        }
        switch page {
        case .overview:
            return WidgetViewModel(
                page: page,
                title: snapshot.overview.currentPeriod.uppercased(),
                primaryValue: WidgetFormat.tokens(snapshot.overview.totalTokens, style: snapshot.presentation.numberStyle),
                secondaryValue: snapshot.presentation.showCost ? WidgetFormat.cost(snapshot.overview.costUsd, presentation: snapshot.presentation) : "",
                rows: []
            )
        case .quota:
            let provider = snapshot.quota.first
            let remaining = provider?.windows.first?.remainingPercent
            return WidgetViewModel(
                page: page,
                title: provider.map { WidgetFormat.provider($0.provider) } ?? "额度",
                primaryValue: remaining.map { "\(Int($0.rounded()))% left" } ?? provider?.displayStatus ?? "未配置",
                secondaryValue: provider?.windows.first?.resetsAt.map(WidgetFormat.reset) ?? "",
                rows: Array(snapshot.quota.dropFirst().prefix(max(0, rowLimit - 1))).map {
                    "\(WidgetFormat.provider($0.provider)) · \($0.windows.first?.remainingPercent.map { "\(Int($0.rounded()))%" } ?? $0.displayStatus)"
                }
            )
        case .models:
            let models = Array(snapshot.models.prefix(rowLimit))
            return WidgetViewModel(
                page: page,
                title: "模型",
                primaryValue: models.first?.displayName ?? "暂无模型数据",
                secondaryValue: models.first.map { "\(WidgetFormat.tokens($0.totalTokens, style: snapshot.presentation.numberStyle)) · \(Int($0.sharePercent.rounded()))%" } ?? "",
                rows: models.dropFirst().map { "\($0.displayName) · \(Int($0.sharePercent.rounded()))%" }
            )
        case .activity:
            return WidgetViewModel(
                page: page,
                title: snapshot.activity.currentPeriod.uppercased(),
                primaryValue: "\(snapshot.activity.activeDays)",
                secondaryValue: "活跃天数",
                rows: []
            )
        case .trend:
            return WidgetViewModel(
                page: page,
                title: "趋势",
                primaryValue: WidgetFormat.tokens(snapshot.trend.currentTokens, style: snapshot.presentation.numberStyle),
                secondaryValue: snapshot.trend.startDate.flatMap { start in snapshot.trend.endDate.map { "\(start) – \($0)" } } ?? "暂无趋势数据",
                rows: ["峰值 · \(WidgetFormat.tokens(snapshot.trend.peakTokens, style: snapshot.presentation.numberStyle))"]
            )
        }
    }
}

enum WidgetFormat {
    static func tokens(_ value: Int, style: String = "compact") -> String {
        guard style == "compact" else { return value.formatted(.number.grouping(.automatic)) }
        switch value {
        case 1_000_000_000...: return String(format: "%.1fB", Double(value) / 1_000_000_000)
        case 1_000_000...: return String(format: "%.1fM", Double(value) / 1_000_000)
        case 1_000...: return String(format: "%.1fK", Double(value) / 1_000)
        default: return value.formatted()
        }
    }

    static func cost(_ usd: Double, presentation: WidgetPresentation) -> String {
        let converted = usd * presentation.currencyRate
        return "\(presentation.currencySymbol)\(String(format: "%.2f", converted))"
    }

    static func provider(_ value: String) -> String {
        switch value.lowercased() {
        case "codex": "Codex"
        case "claude": "Claude"
        case "antigravity": "Antigravity"
        case "opencode": "OpenCode"
        case "deepseek": "DeepSeek"
        case "minimax": "MiniMax"
        case "mimo": "MiMo"
        case "copilot": "Copilot"
        case "zai", "zaiteam": "Z.ai"
        case "volcengine": "Volcengine"
        case "qoder": "Qoder"
        case "kimi": "Kimi"
        case "ollama": "Ollama"
        default: value.capitalized
        }
    }

    static func reset(_ date: Date) -> String {
        let seconds = max(0, date.timeIntervalSinceNow)
        let days = Int(seconds / 86_400)
        let hours = Int(seconds.truncatingRemainder(dividingBy: 86_400) / 3_600)
        return days > 0 ? "Reset \(days)d \(hours)h" : "Reset \(hours)h"
    }
}
