import AppKit

var sessionId = "unknown"
var wsUrl = "ws://localhost:9200"

let args = CommandLine.arguments
var i = 1
while i < args.count {
    switch args[i] {
    case "--session":
        if i + 1 < args.count {
            sessionId = args[i + 1]
            i += 1
        }
    case "--ws":
        if i + 1 < args.count {
            wsUrl = args[i + 1]
            i += 1
        }
    default:
        break
    }
    i += 1
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate(sessionId: sessionId, wsUrl: wsUrl)
app.delegate = delegate
app.run()
