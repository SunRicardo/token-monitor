import Foundation

struct WidgetSnapshot: Codable, Equatable {
    let schemaVersion: Int
    let generatedAt: Date
    let today: WidgetToday
    let tools: [WidgetTool]
    let limits: [WidgetLimit]

    var isEmpty: Bool {
        today.totalTokens == 0 && today.costUsd == 0 && tools.isEmpty && limits.isEmpty
    }

    func isStale(at date: Date, threshold: TimeInterval = 20 * 60) -> Bool {
        date.timeIntervalSince(generatedAt) > threshold
    }

    static func load(appGroup: String) -> WidgetSnapshot? {
        guard !appGroup.isEmpty,
              let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: appGroup
              ) else { return nil }
        return load(from: container.appendingPathComponent("snapshot.json"))
    }

    static func load(from url: URL) -> WidgetSnapshot? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = fractionalDateFormatter.date(from: value)
                ?? basicDateFormatter.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO-8601 timestamp"
            )
        }
        return decoder
    }()

    private static let fractionalDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let basicDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

struct WidgetToday: Codable, Equatable {
    let totalTokens: Int
    let costUsd: Double
}

struct WidgetTool: Codable, Equatable, Identifiable {
    let id: String
    let totalTokens: Int
    let costUsd: Double
}

struct WidgetLimit: Codable, Equatable, Identifiable {
    let provider: String
    let status: String
    let updatedAt: Date?
    let windows: [WidgetLimitWindow]

    var id: String {
        "\(provider)-\(updatedAt?.timeIntervalSince1970 ?? 0)"
    }
}

struct WidgetLimitWindow: Codable, Equatable, Identifiable {
    let kind: String
    let usedPercent: Double?
    let remainingPercent: Double?
    let resetsAt: Date?
    let windowMinutes: Double?

    var id: String { kind }
}
