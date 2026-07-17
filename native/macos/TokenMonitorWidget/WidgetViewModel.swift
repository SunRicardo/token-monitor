import Foundation
import SwiftUI
import WidgetKit

enum WidgetDesignTokens {
    static let sectionPadding: CGFloat = 9
    static let cornerRadius: CGFloat = 12
    static let smallGap: CGFloat = 5
    static let mediumGap: CGFloat = 10
    static let largeGap: CGFloat = 8
    static let titleSize: CGFloat = 15
    static let smallPrimarySize: CGFloat = 27
    static let mediumPrimarySize: CGFloat = 31
    static let largePrimarySize: CGFloat = 34
    static let secondarySize: CGFloat = 10
    static let microSize: CGFloat = 9
    static let dividerOpacity = 0.14
    static let panelOpacity = 0.065
    static let accent = Color.accentColor
    static let periodControlHeight: CGFloat = 17
    static let pageControlHeight: CGFloat = 18
    static let openButtonSize: CGFloat = 20
}

struct WidgetScaffoldGeometry: Equatable {
    let headerHeight: CGFloat
    let footerHeight: CGFloat
    let contentGap: CGFloat

    var contentTopReserved: CGFloat {
        headerHeight + contentGap
    }

    var contentBottomReserved: CGFloat {
        footerHeight + contentGap
    }

    func contentHeight(for availableHeight: CGFloat) -> CGFloat {
        max(0, availableHeight - contentTopReserved - contentBottomReserved)
    }
}

struct WidgetLayoutMetrics: Equatable {
    let outerTopInset: CGFloat
    let outerBottomInset: CGFloat
    let horizontalInset: CGFloat
    let headerHeight: CGFloat
    let footerHeight: CGFloat
    let contentGap: CGFloat
    let pageControlWidth: CGFloat
    let activityMinCellSize: CGFloat
    let activityMaxCellSize: CGFloat
    let activityCellSpacing: CGFloat

    var outerInsets: EdgeInsets {
        EdgeInsets(
            top: outerTopInset,
            leading: horizontalInset,
            bottom: outerBottomInset,
            trailing: horizontalInset
        )
    }

    var scaffoldGeometry: WidgetScaffoldGeometry {
        WidgetScaffoldGeometry(
            headerHeight: headerHeight,
            footerHeight: footerHeight,
            contentGap: contentGap
        )
    }

    static let small = WidgetLayoutMetrics(
        outerTopInset: 0,
        outerBottomInset: 0,
        horizontalInset: 13,
        headerHeight: 20,
        footerHeight: 25,
        contentGap: WidgetDesignTokens.smallGap,
        pageControlWidth: 108,
        activityMinCellSize: 5,
        activityMaxCellSize: 7,
        activityCellSpacing: 3
    )

    static let medium = WidgetLayoutMetrics(
        outerTopInset: 1,
        outerBottomInset: 1,
        horizontalInset: 14,
        headerHeight: 22,
        footerHeight: 26,
        contentGap: WidgetDesignTokens.mediumGap,
        pageControlWidth: 112,
        activityMinCellSize: 4,
        activityMaxCellSize: 6,
        activityCellSpacing: 3
    )

    static let large = WidgetLayoutMetrics(
        outerTopInset: 1,
        outerBottomInset: 1,
        horizontalInset: 18,
        headerHeight: 24,
        footerHeight: 28,
        contentGap: WidgetDesignTokens.largeGap,
        pageControlWidth: 112,
        activityMinCellSize: 5,
        activityMaxCellSize: 8,
        activityCellSpacing: 3
    )

    static func metrics(for family: WidgetFamily) -> WidgetLayoutMetrics {
        switch family {
        case .systemLarge: .large
        case .systemMedium: .medium
        default: .small
        }
    }
}

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
