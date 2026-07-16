import XCTest

final class WidgetSnapshotDecodingTests: XCTestCase {
    func testDecodesJavaScriptSnapshotSchema() throws {
        let json = """
        {
          "schemaVersion": 1,
          "generatedAt": "2026-07-16T09:00:00.000Z",
          "today": { "totalTokens": 42, "costUsd": 0.5 },
          "tools": [{ "id": "codex", "totalTokens": 42, "costUsd": 0.5 }],
          "limits": [{
            "provider": "codex",
            "status": "ok",
            "updatedAt": "2026-07-16T08:59:00.000Z",
            "windows": [{
              "kind": "weekly",
              "usedPercent": 25,
              "remainingPercent": 75,
              "resetsAt": null,
              "windowMinutes": 10080
            }]
          }]
        }
        """

        let snapshot = try WidgetSnapshot.decoder.decode(
            WidgetSnapshot.self,
            from: XCTUnwrap(json.data(using: .utf8))
        )

        XCTAssertEqual(snapshot.schemaVersion, 1)
        XCTAssertEqual(snapshot.today.totalTokens, 42)
        XCTAssertEqual(snapshot.tools.first?.id, "codex")
        XCTAssertEqual(snapshot.limits.first?.windows.first?.remainingPercent, 75)
    }

    func testRejectsInvalidTimestamp() throws {
        let json = """
        {
          "schemaVersion": 1,
          "generatedAt": "not-a-date",
          "today": { "totalTokens": 0, "costUsd": 0 },
          "tools": [],
          "limits": []
        }
        """

        XCTAssertThrowsError(
            try WidgetSnapshot.decoder.decode(
                WidgetSnapshot.self,
                from: XCTUnwrap(json.data(using: .utf8))
            )
        )
    }

    func testStaleAndEmptyStates() {
        let generatedAt = Date(timeIntervalSince1970: 1_000)
        let snapshot = WidgetSnapshot(
            schemaVersion: 1,
            generatedAt: generatedAt,
            today: WidgetToday(totalTokens: 0, costUsd: 0),
            tools: [],
            limits: []
        )

        XCTAssertTrue(snapshot.isEmpty)
        XCTAssertFalse(snapshot.isStale(at: generatedAt.addingTimeInterval(60)))
        XCTAssertTrue(snapshot.isStale(at: generatedAt.addingTimeInterval(21 * 60)))
    }
}
