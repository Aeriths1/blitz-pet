// The sentence under a point of the screen, read through the Accessibility API instead of from
// pixels: the element under the point is asked which character is there, the sentence round it is
// cut out (NaturalLanguage's sentence tokenizer, or the web engine's own sentence range), and its
// box is asked for one line at a time. Coordinates are global screen points, top-left origin.
//
// Two ways in, tried in this order:
//   marker  web content (Safari, Chrome, Electron): AXTextMarkerForPosition → AXSentenceTextMarkerRange…
//   range   ordinary text views (TextEdit, Notes, Pages…): AXRangeForPosition → AXStringForRange…
// Electron apps only build their tree once asked: AXManualAccessibility is set on the app first.
//
// Usage: ax-at <x> <y> [pid to skip] [paragraph|dump]       prints one JSON object
//   paragraph: the whole paragraph under the point instead of the sentence
import AppKit
import ApplicationServices
import NaturalLanguage

let t0 = Date()
let PARA = CommandLine.arguments.dropFirst(3).contains("paragraph")
/** The engine's names for the unit asked for: sentence or paragraph. */
let UNIT = PARA ? "Paragraph" : "Sentence"
func out(_ o: [String: Any]) -> Never {
  var o = o
  o["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
  FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: o))
  exit(0)
}

guard CommandLine.arguments.count >= 3, let x = Double(CommandLine.arguments[1]), let y = Double(CommandLine.arguments[2]) else {
  out(["error": "usage: ax-at x y"])
}
guard AXIsProcessTrusted() else { out(["error": "no-permission"]) }
let point = CGPoint(x: x, y: y)

/* ---------- small AX helpers ---------- */
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func param(_ e: AXUIElement, _ name: String, _ arg: CFTypeRef) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyParameterizedAttributeValue(e, name as CFString, arg, &v) == .success ? v : nil
}
func params(_ e: AXUIElement) -> Set<String> {
  var names: CFArray?
  guard AXUIElementCopyParameterizedAttributeNames(e, &names) == .success, let n = names as? [String] else { return [] }
  return Set(n)
}
func axValue<T>(_ v: CFTypeRef?, _ type: AXValueType, _ empty: T) -> T? {
  guard let v, CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
  var r = empty
  return AXValueGetValue(v as! AXValue, type, &r) ? r : nil
}
func rect(_ v: CFTypeRef?) -> [Double]? {
  guard let r = axValue(v, .cgRect, CGRect.zero), r.width > 0, r.height > 0 else { return nil }
  return [r.minX, r.minY, r.width, r.height].map { (Double($0) * 10).rounded() / 10 }
}
func cfRange(_ loc: Int, _ len: Int) -> AXValue {
  var r = CFRange(location: loc, length: len)
  return AXValueCreate(.cfRange, &r)!
}
func ancestors(_ e: AXUIElement) -> [AXUIElement] {
  var chain = [e]
  var cur = e
  while chain.count < 30, let p = attr(cur, kAXParentAttribute) {
    cur = p as! AXUIElement
    chain.append(cur)
  }
  return chain
}

/* ---------- the element under the point ---------- */
// The pet's own window lies over the whole screen: skip it (its pid is the third argument) and ask
// the app whose window is under the point, found front to back in the window list.
let skip = CommandLine.arguments.count > 3 ? pid_t(CommandLine.arguments[3]) ?? -1 : -1
let system = AXUIElementCreateSystemWide()
var hit: AXUIElement?
var pid: pid_t = 0
// For testing: BLITZ_AX_PID asks one app directly, whatever window is in front.
if let forced = ProcessInfo.processInfo.environment["BLITZ_AX_PID"].flatMap({ pid_t($0) }) {
  AXUIElementCopyElementAtPosition(AXUIElementCreateApplication(forced), Float(x), Float(y), &hit)
  pid = forced
} else {
  AXUIElementCopyElementAtPosition(system, Float(x), Float(y), &hit)
  if let hit { AXUIElementGetPid(hit, &pid) }
}
if hit == nil || pid == skip {
  hit = nil
  let wins = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
  for w in wins {
    guard let owner = w[kCGWindowOwnerPID as String] as? pid_t, owner != skip,
          (w[kCGWindowLayer as String] as? Int) == 0,
          let bd = w[kCGWindowBounds as String] as? [String: Double] else { continue }
    let r = CGRect(x: bd["X"] ?? 0, y: bd["Y"] ?? 0, width: bd["Width"] ?? 0, height: bd["Height"] ?? 0)
    guard r.contains(point) else { continue }
    var h: AXUIElement?
    if AXUIElementCopyElementAtPosition(AXUIElementCreateApplication(owner), Float(x), Float(y), &h) == .success, let h {
      hit = h
      pid = owner
    }
    break
  }
}
guard var el = hit else { out(["error": "nothing-here"]) }
let app = NSRunningApplication(processIdentifier: pid)
let appName = app?.localizedName ?? "?"
let bundle = app?.bundleIdentifier ?? "?"

// Chromium-based apps (Electron, Chrome) keep their web content out of the tree until asked.
let appEl = AXUIElementCreateApplication(pid)
var woke = false
if (attr(el, kAXRoleAttribute) as? String) != "AXWebArea", ancestors(el).allSatisfy({ (attr($0, kAXRoleAttribute) as? String) != "AXWebArea" }) {
  // Electron answers to AXManualAccessibility; Chrome to AXEnhancedUserInterface (what VoiceOver sets).
  let manual = AXUIElementSetAttributeValue(appEl, "AXManualAccessibility" as CFString, kCFBooleanTrue) == .success
  let enhanced = !manual && AXUIElementSetAttributeValue(appEl, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue) == .success
  if manual || enhanced {
    woke = true
    usleep(250_000)
    var again: AXUIElement?
    AXUIElementCopyElementAtPosition(appEl, Float(x), Float(y), &again)
    if let again { el = again }
  }
}
let role = attr(el, kAXRoleAttribute) as? String ?? "?"
let chain = ancestors(el)
// The window it is in: its title and frame go out with every answer, so the OCR fallback can keep
// to the same window for its context.
let window = chain.first(where: { (attr($0, kAXRoleAttribute) as? String) == "AXWindow" })
let winTitle = window.flatMap { attr($0, kAXTitleAttribute) as? String } ?? ""
var winFrame: Any = NSNull()
if let w = window, let pos = axValue(attr(w, kAXPositionAttribute), .cgPoint, CGPoint.zero), let size = axValue(attr(w, kAXSizeAttribute), .cgSize, CGSize.zero) {
  winFrame = [Double(pos.x), Double(pos.y), Double(size.width), Double(size.height)]
}
// Where the text comes from: a web page's address (AXURL on its web area), or a document's file.
func urlString(_ v: CFTypeRef?) -> String? {
  guard let v else { return nil }
  if CFGetTypeID(v) == CFURLGetTypeID() { return (v as! URL).absoluteString }
  return v as? String
}
let pageURL = chain.lazy.compactMap { e -> String? in
  guard (attr(e, kAXRoleAttribute) as? String) == "AXWebArea" else { return nil }
  return urlString(attr(e, kAXURLAttribute))
}.first
let docURL = window.flatMap { urlString(attr($0, kAXDocumentAttribute)) }
let base: [String: Any] = ["app": appName, "bundle": bundle, "role": role, "woke": woke, "title": winTitle, "window": winFrame,
                           "url": pageURL ?? NSNull(), "doc": docURL ?? NSNull()]
if CommandLine.arguments.count > 4 && CommandLine.arguments[4] == "dump" {
  out(base.merging(["chain": chain.map { e -> [String: Any] in
    ["role": attr(e, kAXRoleAttribute) as? String ?? "?", "params": Array(params(e)).sorted()]
  }]) { $1 })
}

/* ---------- context: the window's title and the text round the sentence ---------- */
/** The whole page's text, for web content (Safari, Chrome, Electron). */
func pageText() -> String? {
  guard let web = chain.first(where: { (attr($0, kAXRoleAttribute) as? String) == "AXWebArea" }),
        let r = param(web, "AXTextMarkerRangeForUIElement", web) else { return nil }
  return param(web, "AXStringForTextMarkerRange", r) as? String
}
/** Up to `n` characters of `text` round where `sentence` sits in it. */
func around(_ text: String, _ sentence: String, _ n: Int = 6000) -> String {
  let t = text as NSString
  guard t.length > n else { return text }
  let r = t.range(of: String(sentence.prefix(40)))
  let mid = r.location == NSNotFound ? 0 : r.location
  let from = max(0, min(mid - n / 2, t.length - n))
  return t.substring(with: NSRange(location: from, length: n))
}
func done(_ method: String, _ sentence: String, _ rects: [[Double]], _ local: String) -> Never {
  let ctx = pageText() ?? local
  out(base.merging(["method": method, "text": sentence, "rects": rects, "context": around(ctx, sentence)]) { $1 })
}

/* ---------- way 1: web text markers ---------- */
if let web = chain.first(where: { params($0).contains("AXTextMarkerForPosition") }) {
  var p = point
  let pv = AXValueCreate(.cgPoint, &p)!
  if let m = param(web, "AXTextMarkerForPosition", pv),
     let sr = param(web, "AX\(UNIT)TextMarkerRangeForTextMarker", m),
     let text = param(web, "AXStringForTextMarkerRange", sr) as? String,
     !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
    // Its box a line at a time: walk the lines from the sentence's start to its end.
    var rects: [[Double]] = []
    // WebKit will not open a range up into its ends; go to the sentence's end, then back to its start.
    var sEnd = param(web, "AXEndTextMarkerForTextMarkerRange", sr)
    var sStart = param(web, "AXStartTextMarkerForTextMarkerRange", sr)
    if sStart == nil || sEnd == nil {
      sEnd = param(web, "AXNext\(UNIT)EndTextMarkerForTextMarker", m)
      sStart = sEnd.flatMap { param(web, "AXPrevious\(UNIT)StartTextMarkerForTextMarker", $0) }
    }
    let len = { (a: CFTypeRef, b: CFTypeRef) -> Int in
      guard let r = param(web, "AXTextMarkerRangeForUnorderedTextMarkers", [a, b] as CFArray) else { return 0 }
      // WebKit has no AXLengthForTextMarkerRange; the string's length does as well.
      if let n = param(web, "AXLengthForTextMarkerRange", r) as? Int { return n }
      return ((param(web, "AXStringForTextMarkerRange", r) as? String) as NSString?)?.length ?? 0
    }
    if let sStart, let sEnd {
      var segStart: CFTypeRef = sStart
      let total = len(sStart, sEnd)
      for _ in 0..<40 {
        guard let lineEnd = param(web, "AXLineTextMarkerRangeForTextMarker", segStart).flatMap({ param(web, "AXEndTextMarkerForTextMarkerRange", $0) })
                ?? param(web, "AXNextLineEndTextMarkerForTextMarker", segStart) else { break }
        let toLineEnd = len(sStart, lineEnd)
        let last = toLineEnd >= total || toLineEnd == 0
        let segEnd = last ? sEnd : lineEnd
        if let seg = param(web, "AXTextMarkerRangeForUnorderedTextMarkers", [segStart, segEnd] as CFArray),
           let r = rect(param(web, "AXBoundsForTextMarkerRange", seg)) { rects.append(r) }
        if last { break }
        guard let next = param(web, "AXNextTextMarkerForTextMarker", lineEnd) else { break }
        segStart = next
      }
    }
    // No line ranges to be had (WebKit, often): walk the sentence a character at a time and start a
    // new box wherever the line changes.
    if rects.count <= 1, let sStart, let sEnd, (text as NSString).length < (PARA ? 4000 : 1500) {
      var walked: [[Double]] = []
      var cur: CGRect? = nil
      var m: CFTypeRef = sStart
      let total = (text as NSString).length
      for _ in 0..<(total + 40) {
        guard let next = param(web, "AXNextTextMarkerForTextMarker", m),
              let one = param(web, "AXTextMarkerRangeForUnorderedTextMarkers", [m, next] as CFArray) else { break }
        if let r = axValue(param(web, "AXBoundsForTextMarkerRange", one), .cgRect, CGRect.zero), r.width > 0, r.height > 0 {
          if let c = cur, abs(r.midY - c.midY) < min(r.height, c.height) * 0.5 { cur = c.union(r) }
          else {
            if let c = cur { walked.append([c.minX, c.minY, c.width, c.height]) }
            cur = r
          }
        }
        m = next
        if let rest = param(web, "AXTextMarkerRangeForUnorderedTextMarkers", [m, sEnd] as CFArray),
           ((param(web, "AXStringForTextMarkerRange", rest) as? String) ?? "").isEmpty { break }
      }
      if let c = cur { walked.append([c.minX, c.minY, c.width, c.height]) }
      if walked.count > 1 { rects = walked.map { $0.map { (Double($0) * 10).rounded() / 10 } } }
    }
    if rects.isEmpty, let r = rect(param(web, "AXBoundsForTextMarkerRange", sr)) { rects = [r] }
    done("marker", text.trimmingCharacters(in: .whitespacesAndNewlines), rects, "")
  }
}

/* ---------- way 2: plain text ranges ---------- */
if let tv = chain.first(where: { params($0).contains(kAXRangeForPositionParameterizedAttribute) }) {
  var p = point
  let pv = AXValueCreate(.cgPoint, &p)!
  let n = attr(tv, kAXNumberOfCharactersAttribute) as? Int ?? ((attr(tv, kAXValueAttribute) as? String).map { ($0 as NSString).length } ?? 0)
  if let r = axValue(param(tv, kAXRangeForPositionParameterizedAttribute, pv), .cfRange, CFRange()), n > 0 {
  // The text round the point (a window of it, for long documents), cut into sentences.
  let from = max(0, r.location - 2000), to = min(n, r.location + 2000)
  guard let text = param(tv, kAXStringForRangeParameterizedAttribute, cfRange(from, to - from)) as? String else {
    out(base.merging(["error": "no-string"]) { $1 })
  }
  let ns = text as NSString
  let at = min(max(0, r.location - from), max(0, ns.length - 1))
  let tok = NLTokenizer(unit: PARA ? .paragraph : .sentence)
  tok.string = text
  let idx = text.index(text.startIndex, offsetBy: min(at, text.count - 1), limitedBy: text.endIndex) ?? text.startIndex
  let sr = tok.tokenRange(at: idx)
  let sentence = String(text[sr]).trimmingCharacters(in: .whitespacesAndNewlines)
  let sLoc = from + text.distance(from: text.startIndex, to: sr.lowerBound)
  let sLen = text.distance(from: sr.lowerBound, to: sr.upperBound)
  // A box per line.
  var rects: [[Double]] = []
  if let l0 = param(tv, kAXLineForIndexParameterizedAttribute, sLoc as CFNumber) as? Int,
     let l1 = param(tv, kAXLineForIndexParameterizedAttribute, max(sLoc, sLoc + sLen - 1) as CFNumber) as? Int, l1 - l0 < 60 {
    for l in l0...l1 {
      guard let lr = axValue(param(tv, kAXRangeForLineParameterizedAttribute, l as CFNumber), .cfRange, CFRange()) else { continue }
      let a = max(lr.location, sLoc), b = min(lr.location + lr.length, sLoc + sLen)
      if b > a, let rc = rect(param(tv, kAXBoundsForRangeParameterizedAttribute, cfRange(a, b - a))) { rects.append(rc) }
    }
  }
  if rects.isEmpty, let rc = rect(param(tv, kAXBoundsForRangeParameterizedAttribute, cfRange(sLoc, sLen))) { rects = [rc] }
  done("range", sentence, rects, text)
  }
}

/* ---------- way 3: the element's own text, found character by character ---------- */
// Chromium will not say which character is at a point, but it will say where each character is:
// take the text under the point and binary-search its characters' boxes (they run in reading order).
if let te = chain.prefix(4).first(where: { params($0).contains(kAXBoundsForRangeParameterizedAttribute) && !((attr($0, kAXValueAttribute) as? String) ?? "").isEmpty }),
   let text = attr(te, kAXValueAttribute) as? String {
  let ns = text as NSString
  let box = { (i: Int) -> CGRect? in axValue(param(te, kAXBoundsForRangeParameterizedAttribute, cfRange(i, 1)), .cgRect, CGRect.zero) }
  var lo = 0, hi = ns.length - 1, found = -1
  while lo <= hi {
    let mid = (lo + hi) / 2
    guard let r = box(mid), r.height > 0 else { break }
    if point.y < r.minY { hi = mid - 1 }
    else if point.y > r.maxY { lo = mid + 1 }
    else if point.x < r.minX { hi = mid - 1 }
    else if point.x > r.maxX { lo = mid + 1 }
    else { found = mid; break }
  }
  if found < 0 { found = min(max(0, lo), ns.length - 1) }
  let tok = NLTokenizer(unit: PARA ? .paragraph : .sentence)
  tok.string = text
  let idx = text.index(text.startIndex, offsetBy: min(found, text.count - 1))
  let sr = tok.tokenRange(at: idx)
  let sentence = String(text[sr]).trimmingCharacters(in: .whitespacesAndNewlines)
  let sLoc = text.distance(from: text.startIndex, to: sr.lowerBound)
  let sLen = text.distance(from: sr.lowerBound, to: sr.upperBound)
  // A box per line: run along the sentence's characters and start a new box when the line changes.
  var rects: [[Double]] = []
  var cur: CGRect? = nil
  for i in sLoc..<(sLoc + sLen) {
    guard let r = box(i), r.width > 0 else { continue }
    if let c = cur, abs(r.midY - c.midY) < c.height * 0.5 { cur = c.union(r) }
    else {
      if let c = cur { rects.append([c.minX, c.minY, c.width, c.height]) }
      cur = r
    }
  }
  if let c = cur { rects.append([c.minX, c.minY, c.width, c.height]) }
  if !sentence.isEmpty { done("chars", sentence, rects.map { $0.map { (Double($0) * 10).rounded() / 10 } }, text) }
}

/* ---------- neither: what there is to say about it ---------- */
let value = attr(el, kAXValueAttribute) as? String ?? attr(el, kAXTitleAttribute) as? String ?? attr(el, kAXDescriptionAttribute) as? String
out(base.merging(["error": "no-text-api", "value": value ?? NSNull()]) { $1 })
