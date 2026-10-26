// Face boxes with Apple Vision (macOS 11+): offline, no model download.
//   swift scripts/ru/fx/face-track.swift <frames-dir> <out.json>
// Reads every *.png in <frames-dir> (frame number = file name), writes
// {"frames": {"00012": [x, y, w, h, confidence] | null}} with the LARGEST face per frame,
// normalised to the frame (origin top-left). fx_picture.py smooths the track per shot.
import Foundation
import ImageIO
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: face-track.swift <frames-dir> <out.json>\n".data(using: .utf8)!)
    exit(1)
}
let inDir = URL(fileURLWithPath: args[1])
let files = try FileManager.default.contentsOfDirectory(atPath: inDir.path).filter { $0.hasSuffix(".png") }.sorted()

var out: [String: Any] = [:]
var found = 0
for name in files {
    let key = String(name.dropLast(4))
    guard let src = CGImageSourceCreateWithURL(inDir.appendingPathComponent(name) as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { out[key] = NSNull(); continue }
    let req = VNDetectFaceRectanglesRequest()
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    let faces = (req.results ?? []).sorted { $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height }
    if let f = faces.first {
        let b = f.boundingBox
        out[key] = [Double(b.minX), Double(1 - b.maxY), Double(b.width), Double(b.height), Double(f.confidence)]
        found += 1
    } else {
        out[key] = NSNull()
    }
}
let data = try JSONSerialization.data(withJSONObject: ["frames": out], options: [.sortedKeys])
try data.write(to: URL(fileURLWithPath: args[2]))
print("faces: \(found)/\(files.count) → \(args[2])")
