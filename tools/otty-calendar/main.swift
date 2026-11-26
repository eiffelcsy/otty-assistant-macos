// Otty's calendar reader (D-54): Apple Calendar and Reminders through EventKit, read-only, as JSON on stdout.

import EventKit
import Foundation

/// Stops a runaway calendar from making a huge answer.
let maxItems = 500

func emit(_ object: [String: Any], _ status: Int32 = 0) -> Never {
  let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{\"error\":\"output\"}".utf8)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
  exit(status)
}

let store = EKEventStore()

/// Asks for access and waits for the answer, so the caller gets one JSON line.
func request(_ ask: (@escaping (Bool, Error?) -> Void) -> Void, timeout: Double) -> Bool {
  let done = DispatchSemaphore(value: 0)
  var granted = false
  ask { ok, _ in
    granted = ok
    done.signal()
  }
  _ = done.wait(timeout: .now() + timeout)
  return granted
}

func eventAccess() -> Bool {
  let status = EKEventStore.authorizationStatus(for: .event)
  if #available(macOS 14.0, *) {
    return status == .fullAccess
  }
  return status == .authorized
}

func reminderAccess() -> Bool {
  let status = EKEventStore.authorizationStatus(for: .reminder)
  if #available(macOS 14.0, *) {
    return status == .fullAccess
  }
  return status == .authorized
}

let isoWithFraction: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()

let isoPlain = ISO8601DateFormatter()

func parseDate(_ text: String) -> Date? {
  isoWithFraction.date(from: text) ?? isoPlain.date(from: text)
}

let arguments = CommandLine.arguments
let command = arguments.count > 1 ? arguments[1] : ""

switch command {
case "access":
  var calendar = false
  var reminders = false
  if #available(macOS 14.0, *) {
    calendar = request({ store.requestFullAccessToEvents(completion: $0) }, timeout: 60)
    reminders = request({ store.requestFullAccessToReminders(completion: $0) }, timeout: 60)
  } else {
    calendar = request({ store.requestAccess(to: .event, completion: $0) }, timeout: 60)
    reminders = request({ store.requestAccess(to: .reminder, completion: $0) }, timeout: 60)
  }
  emit(["calendar": calendar ? "granted" : "denied", "reminders": reminders ? "granted" : "denied"])

case "events":
  guard arguments.count == 4 else { emit(["error": "usage"], 64) }
  guard eventAccess() else { emit(["error": "denied"], 2) }
  guard let from = parseDate(arguments[2]), let to = parseDate(arguments[3]) else { emit(["error": "usage"], 64) }
  let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil)
  let events = store.events(matching: predicate).prefix(maxItems).map { event -> [String: Any] in
    var item: [String: Any] = [
      "title": event.title ?? "",
      "start": isoPlain.string(from: event.startDate),
      "end": isoPlain.string(from: event.endDate),
      "allDay": event.isAllDay,
      "calendar": event.calendar?.title ?? "",
    ]
    if let location = event.location, !location.isEmpty { item["location"] = location }
    return item
  }
  emit(["events": events])

case "reminders":
  guard reminderAccess() else { emit(["error": "denied"], 2) }
  let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
  var found: [EKReminder] = []
  let done = DispatchSemaphore(value: 0)
  store.fetchReminders(matching: predicate) { result in
    found = result ?? []
    done.signal()
  }
  _ = done.wait(timeout: .now() + 30)
  let reminders = found.prefix(maxItems).map { reminder -> [String: Any] in
    var item: [String: Any] = ["title": reminder.title ?? "", "list": reminder.calendar?.title ?? ""]
    if let components = reminder.dueDateComponents, let date = Calendar.current.date(from: components) {
      item["due"] = isoPlain.string(from: date)
    }
    return item
  }
  emit(["reminders": reminders])

default:
  emit(["error": "usage"], 64)
}
