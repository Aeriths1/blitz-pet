// Reads the text on a screenshot with Apple's Vision framework and prints it as JSON: one entry per
// line of text, with its box and where each of its characters starts and ends, so a sentence can be
// picked out under the pointer and lit up exactly. Boxes are in the image's pixels, top-left origin.
// Usage: ocr <image.png>
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("cannot read image\n".data(using: .utf8)!)
  exit(1)
}
let W = Double(cg.width), H = Double(cg.height)

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
request.usesLanguageCorrection = true
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])

func px(_ r: CGRect) -> [Double] {
  [r.minX * W, (1 - r.maxY) * H, r.width * W, r.height * H].map { ($0 * 10).rounded() / 10 }
}

var out: [[String: Any]] = []
for obs in request.results ?? [] {
  guard let top = obs.topCandidates(1).first else { continue }
  let text = top.string
  // Each character's left and right edge along the line.
  var edges: [[Double]] = []
  var i = text.startIndex
  while i < text.endIndex {
    let j = text.index(after: i)
    if let b = try? top.boundingBox(for: i..<j)?.boundingBox {
      edges.append([((b.minX * W) * 10).rounded() / 10, ((b.maxX * W) * 10).rounded() / 10])
    } else {
      edges.append([])
    }
    i = j
  }
  out.append(["t": text, "b": px(obs.boundingBox), "c": edges])
}
let data = try JSONSerialization.data(withJSONObject: ["w": W, "h": H, "lines": out])
FileHandle.standardOutput.write(data)
