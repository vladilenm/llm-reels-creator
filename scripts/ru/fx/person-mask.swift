// Person masks with Apple Vision (macOS 12+): offline, no model download.
//   swift scripts/ru/fx/person-mask.swift <frames-dir> <masks-dir>
// Reads every *.png in <frames-dir>, writes a same-named 8-bit grey PNG (white = person)
// at the frame's size into <masks-dir>. Per-frame results; fx-picture.py smooths them over time.
import CoreImage
import Foundation
import ImageIO
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: person-mask.swift <frames-dir> <masks-dir>\n".data(using: .utf8)!)
    exit(1)
}
let inDir = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let files = try FileManager.default.contentsOfDirectory(atPath: inDir.path).filter { $0.hasSuffix(".png") }.sorted()

let ctx = CIContext()
let gray = CGColorSpaceCreateDeviceGray()
let req = VNGeneratePersonSegmentationRequest()
req.qualityLevel = .accurate
req.outputPixelFormat = kCVPixelFormatType_OneComponent8

var done = 0
for name in files {
    let url = inDir.appendingPathComponent(name)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    guard let buf = req.results?.first?.pixelBuffer else { continue }
    var mask = CIImage(cvPixelBuffer: buf)
    mask = mask.transformed(by: CGAffineTransform(scaleX: CGFloat(cg.width) / mask.extent.width,
                                                  y: CGFloat(cg.height) / mask.extent.height))
    try ctx.writePNGRepresentation(of: mask, to: outDir.appendingPathComponent(name), format: .L8, colorSpace: gray)
    done += 1
    if done % 25 == 0 { print("  \(done)/\(files.count)") }
}
print("masks: \(done) → \(outDir.path)")
