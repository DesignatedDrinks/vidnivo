import Foundation
import UIKit
import AVFoundation
import CoreVideo
import CoreGraphics

private enum PhotoRenderError: LocalizedError {
  case cannotDecode
  case cannotCreate(String)
  var errorDescription: String? {
    switch self {
    case .cannotDecode: return "The selected photo cannot be decoded. Try JPEG or PNG."
    case .cannotCreate(let message): return "Photo video rendering failed: " + message
    }
  }
}

/** Convert a still photo to real H.264 video frames for an AVMutableComposition.
 * The photo is drawn with contain sizing on an opaque canvas, matching preview.
 * The temporary MOV is deleted by the caller after the final MP4 export.
 */
func rollblinkRenderPhotoClip(_ source: URL, targetSize: CGSize, durationMs: Double) async throws -> URL {
  guard let photo = UIImage(contentsOfFile: source.path), photo.size.width > 0,
        photo.size.height > 0 else {
    throw PhotoRenderError.cannotDecode
  }
  let w = Int(targetSize.width), h = Int(targetSize.height)
  guard w > 0 && h > 0, durationMs >= 250, durationMs <= 120000 else {
    throw PhotoRenderError.cannotCreate("Invalid photo dimensions or duration.")
  }
  let renderer = UIGraphicsImageRenderer(size: targetSize)
  let prepared = renderer.image { render in
    UIColor.black.setFill()
    render.cgContext.fill(CGRect(origin: .zero, size: targetSize))
    let scale = min(targetSize.width / photo.size.width, targetSize.height / photo.size.height)
    let imageWidth = photo.size.width * scale
    let imageHeight = photo.size.height * scale
    photo.draw(in: CGRect(x: (targetSize.width-imageWidth)/2,
                          y: (targetSize.height-imageHeight)/2,
                          width: imageWidth, height: imageHeight))
  }
  guard let cgImage = prepared.cgImage else { throw PhotoRenderError.cannotDecode }
  var optionalBuffer: CVPixelBuffer?
  let attributes: [String: Any] = [
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    kCVPixelBufferIOSurfacePropertiesKey as String: [:]
  ]
  guard CVPixelBufferCreate(kCFAllocatorDefault, w, h, kCVPixelFormatType_32BGRA,
                            attributes as CFDictionary, &optionalBuffer) == kCVReturnSuccess,
        let pixelBuffer = optionalBuffer else {
    throw PhotoRenderError.cannotCreate("Unable to allocate a video frame.")
  }
  CVPixelBufferLockBaseAddress(pixelBuffer, [])
  guard let base = CVPixelBufferGetBaseAddress(pixelBuffer),
        let context = CGContext(data: base, width: w, height: h, bitsPerComponent: 8,
          bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue |
            CGImageAlphaInfo.premultipliedFirst.rawValue) else {
    CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
    throw PhotoRenderError.cannotCreate("Unable to draw the image into a video frame.")
  }
  context.translateBy(x: 0, y: CGFloat(h))
  context.scaleBy(x: 1, y: -1)
  context.draw(cgImage, in: CGRect(x: 0, y: 0, width: w, height: h))
  CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

  let url = FileManager.default.temporaryDirectory
    .appendingPathComponent("rollblink-photo-\(UUID().uuidString).mov")
  do {
    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: w, AVVideoHeightKey: h,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: min(8_000_000, max(500_000, w * h * 3))
      ]
    ]
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    videoInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoInput) else {
      throw PhotoRenderError.cannotCreate("Video encoder refused the photo stream.")
    }
    writer.add(videoInput)
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                                   kCVPixelBufferWidthKey as String: w,
                                   kCVPixelBufferHeightKey as String: h])
    guard writer.startWriting() else {
      throw PhotoRenderError.cannotCreate(writer.error?.localizedDescription ?? "Encoder did not start.")
    }
    writer.startSession(atSourceTime: .zero)
    let numberOfFrames = Int(ceil(durationMs / 1000 * 30))
    for frame in 0..<numberOfFrames {
      try Task.checkCancellation()
      while !videoInput.isReadyForMoreMediaData {
        guard writer.status == .writing else {
          throw PhotoRenderError.cannotCreate(writer.error?.localizedDescription ?? "Encoder stopped.")
        }
        try await Task.sleep(nanoseconds: 5_000_000)
      }
      guard adaptor.append(pixelBuffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)) else {
        throw PhotoRenderError.cannotCreate(writer.error?.localizedDescription ?? "Could not write a frame.")
      }
    }
    videoInput.markAsFinished()
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      writer.finishWriting {
        if writer.status == .completed { continuation.resume() }
        else { continuation.resume(throwing:
          PhotoRenderError.cannotCreate(writer.error?.localizedDescription ?? "Encoding failed.")) }
      }
    }
    return url
  } catch {
    try? FileManager.default.removeItem(at: url)
    throw error
  }
}
