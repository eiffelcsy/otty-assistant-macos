// otty-ocr: reads the text in a picture, on the Mac. The picture arrives on stdin, so it never touches disk.
// Prints JSON: { "lines": [{ "text", "box": { "x", "y", "w", "h" } }] }, with boxes from 0 to 1 and a top-left origin.

import CoreGraphics
import Foundation
import ImageIO
import Vision

/// Text near an edge reads better with a margin around it. Enlarging was tried and made results worse: it dropped characters.
let margin: CGFloat = 24

struct Box: Encodable {
  let x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat
}

struct Line: Encodable {
  let text: String
  let box: Box
}

struct Output: Encodable {
  let lines: [Line]
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}

/// The picture on a white canvas with a margin. Also returns where the picture sits on it.
func prepared(_ image: CGImage) -> (CGImage, CGRect)? {
  let inner = CGRect(x: margin, y: margin, width: CGFloat(image.width), height: CGFloat(image.height))
  let size = CGSize(width: inner.width + margin * 2, height: inner.height + margin * 2)
  guard let context = CGContext(
    data: nil, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { return nil }
  context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  context.fill(CGRect(origin: .zero, size: size))
  context.draw(image, in: inner)
  guard let canvas = context.makeImage() else { return nil }
  return (canvas, CGRect(x: inner.minX / size.width, y: inner.minY / size.height, width: inner.width / size.width, height: inner.height / size.height))
}

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
  let (canvas, inner) = prepared(image)
else { fail("Not a picture") }

func reader(_ languages: [String]) -> VNRecognizeTextRequest {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = languages
  return request
}

// Chinese has to come first or it turns into symbols, but then English lines suffer: "due" reads as "aue" and
// "Total:" gets a full-width colon. So read it both ways and use English for lines with no Chinese in them.
let chinese = reader(["zh-Hant", "zh-Hans", "en-US"])
let english = reader(["en-US"])

do {
  try VNImageRequestHandler(cgImage: canvas).perform([chinese, english])
} catch {
  fail("Could not read the picture")
}

func hasHan(_ text: String) -> Bool {
  text.unicodeScalars.contains { (0x3400...0x9FFF).contains($0.value) || (0xF900...0xFAFF).contains($0.value) }
}

func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
  let shared = a.intersection(b)
  if shared.isNull { return 0 }
  return shared.width * shared.height / min(a.width * a.height, b.width * b.height)
}

/// The English reading of the same spot, when there's a clear match.
func englishText(at box: CGRect) -> String? {
  let match = (english.results ?? []).max { overlap($0.boundingBox, box) < overlap($1.boundingBox, box) }
  guard let match, overlap(match.boundingBox, box) > 0.7 else { return nil }
  return match.topCandidates(1).first?.string
}

/// Vision's boxes are for the canvas, with the origin at the bottom left. These are for the picture, from the top left.
func pictureBox(_ b: CGRect) -> Box {
  Box(
    x: (b.minX - inner.minX) / inner.width,
    y: 1 - (b.maxY - inner.minY) / inner.height,
    w: b.width / inner.width,
    h: b.height / inner.height
  )
}

let lines = (chinese.results ?? []).compactMap { observation -> Line? in
  guard let candidate = observation.topCandidates(1).first else { return nil }
  let text = hasHan(candidate.string) ? candidate.string : englishText(at: observation.boundingBox) ?? candidate.string
  return Line(text: text, box: pictureBox(observation.boundingBox))
}

guard let json = try? JSONEncoder().encode(Output(lines: lines)) else { fail("Could not write the result") }
FileHandle.standardOutput.write(json)
