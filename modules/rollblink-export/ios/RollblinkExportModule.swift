import Foundation
import AVFoundation
import QuartzCore
import UIKit
import ExpoModulesCore

private struct RenderClip: Decodable {
  let uri: String
  let track: String
  let kind: String?
  let startMs: Double
  let inMs: Double
  let outMs: Double
  let speed: Double
  let volume: Double
  let muted: Bool
}
private struct RenderText: Decodable {
  let id: String
  let text: String
  let startMs: Double
  let endMs: Double
  let x: Double
  let y: Double
  let fontSize: Double
  let color: String
}
private struct RenderRequest: Decodable {
  let width: Int
  let height: Int
  let durationMs: Double
  let clips: [RenderClip]
  let texts: [RenderText]
  let look: RenderLook?
}
private struct RenderLook: Decodable {
  let preset: String
  let intensity: Int
}
private func tintForLook(_ look: RenderLook?) -> (CGColor, CGFloat)? {
  guard let look = look else { return nil }
  let colors: [String:(UInt64,CGFloat)] = [
    "warm":(0xFFBA74,0.16), "cool":(0x4C9CE5,0.16),
    "cinema":(0x375E66,0.20), "sunset":(0xE97D42,0.22),
    "vintage":(0xC3AD77,0.21), "rose":(0xDB789C,0.19),
    "night":(0x364D7B,0.22)
  ]
  guard let (rgb,strength) = colors[look.preset] else { return nil }
  let alpha = strength * CGFloat(max(0,min(100,look.intensity))) / 100.0
  guard alpha > 0 else { return nil }
  let hex = String(format:"#%06X",rgb)
  return (color(hex),alpha)
}
private enum RenderError: LocalizedError {
  case invalidInput(String)
  case missingVideo(String)
  case unsupportedFile(String)
  case exportFailed(String)
  var errorDescription: String? {
    switch self {
    case .invalidInput(let text), .missingVideo(let text),
         .unsupportedFile(let text), .exportFailed(let text): return text
    }
  }
}
private func milliseconds(_ value: Double) -> CMTime {
  CMTime(seconds: value / 1000.0, preferredTimescale: 60000)
}
private func sourceURL(_ input: String) throws -> URL {
  guard let url = URL(string: input), url.isFileURL,
        FileManager.default.fileExists(atPath: url.path) else {
    throw RenderError.unsupportedFile("Video or audio file is missing from this phone.")
  }
  return url
}
private func exportSize(_ request: RenderRequest) throws -> CGSize {
  guard request.width > 0, request.height > 0,
        request.width <= 4096, request.height <= 4096,
        request.durationMs > 0, request.durationMs <= 900000 else {
    throw RenderError.invalidInput("Invalid export dimensions or duration.")
  }
  return CGSize(width: request.width, height: request.height)
}
private func color(_ hex: String) -> CGColor {
  let clean = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
  let value = UInt64(clean, radix: 16) ?? 0xFFFFFF
  return UIColor(
    red: CGFloat((value >> 16) & 0xFF) / 255.0,
    green: CGFloat((value >> 8) & 0xFF) / 255.0,
    blue: CGFloat(value & 0xFF) / 255.0,
    alpha: 1
  ).cgColor
}
private func makeTextLayer(_ text: RenderText, size: CGSize, duration: Double) -> CALayer {
  let layer = CATextLayer()
  layer.contentsScale = 2.0
  layer.string = text.text
  layer.alignmentMode = .center
  layer.isWrapped = true
  layer.foregroundColor = color(text.color)
  // Font sizes are authored against a ~355pt phone preview. Scale relative to
  // the longest export edge so typography matches the editing preview.
  let exportScale = max(size.width, size.height) / 355.0
  let finalFont = CGFloat(max(14.0, text.fontSize)) * exportScale
  layer.font = UIFont.systemFont(ofSize: finalFont, weight: .bold)
  layer.fontSize = finalFont
  let w = size.width * 0.9
  let h = max(60.0, min(300.0, Double(size.height) * 0.18))
  layer.frame = CGRect(x: size.width * max(0, min(1, text.x)) - w / 2.0,
                       y: size.height * (1 - min(1, max(0, text.y))) - h / 2,
                       width: w, height: h)
  let start = max(0, min(1, text.startMs / duration))
  let end = max(start, min(1, text.endMs / duration))
  let epsilon = 0.000001
  let animation = CAKeyframeAnimation(keyPath: "opacity")
  animation.keyTimes = [0, NSNumber(value: start), NSNumber(value: min(1, start + epsilon)),
                        NSNumber(value: max(start, end - epsilon)), NSNumber(value: end), 1]
  animation.values = [0, 0, 1, 1, 0, 0]
  animation.calculationMode = .discrete
  animation.beginTime = AVCoreAnimationBeginTimeAtZero
  animation.duration = duration / 1000.0
  animation.isRemovedOnCompletion = false
  animation.fillMode = .both
  layer.add(animation, forKey: "rollblink-timeline-opacity")
  return layer
}
private func fitTransform(_ source: AVAssetTrack, naturalSize: CGSize,
                          preferred: CGAffineTransform, destination: CGSize) -> CGAffineTransform {
  let upright = CGRect(origin: .zero, size: naturalSize).applying(preferred).standardized
  let width = max(1, upright.width), height = max(1, upright.height)
  let scale = min(destination.width / width, destination.height / height)
  let dx = (destination.width - width * scale) / 2.0
  let dy = (destination.height - height * scale) / 2.0
  return preferred
    .concatenating(CGAffineTransform(translationX: -upright.minX, y: -upright.minY))
    .concatenating(CGAffineTransform(scaleX: scale, y: scale))
    .concatenating(CGAffineTransform(translationX: dx, y: dy))
}

public class RollblinkExportModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RollblinkExport")
    AsyncFunction("exportProject") { (json: String, promise: Promise) in
      Task {
        do {
          let data = Data(json.utf8)
          let request = try JSONDecoder().decode(RenderRequest.self, from: data)
          let output = try await self.createMovie(request)
          promise.resolve(output.absoluteString)
        } catch {
          promise.reject("ROLLBLINK_EXPORT", error.localizedDescription)
        }
      }
    }
  }

  private func createMovie(_ request: RenderRequest) async throws -> URL {
    let size = try exportSize(request)
    let total = milliseconds(request.durationMs)
    let videoClips = request.clips.filter { $0.track == "video" }.sorted { $0.startMs < $1.startMs }
    guard !videoClips.isEmpty else { throw RenderError.missingVideo("Add a video or photo before exporting.") }

    let composition = AVMutableComposition()
    guard let videoOutput = composition.addMutableTrack(withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw RenderError.exportFailed("Could not create the video composition track.")
    }
    var layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoOutput)
    // Temporary H.264 photo frames must remain available until the final
    // AVFoundation composition finishes reading every source frame.
    var temporaryStills: [URL] = []
    defer {
      for url in temporaryStills { try? FileManager.default.removeItem(at: url) }
    }
    var mixParameters: [AVMutableAudioMixInputParameters] = []
    var lastMs: Double = 0
    for clip in videoClips {
      guard clip.speed > 0, clip.outMs > clip.inMs, abs(clip.startMs - lastMs) < 40 else {
        throw RenderError.invalidInput("Video clips must be consecutive without overlaps.")
      }
      let isPhoto = clip.kind == "image"
      let displayedMs = (clip.outMs - clip.inMs) / clip.speed
      let inputURL = try sourceURL(clip.uri)
      let mediaURL: URL
      if isPhoto {
        mediaURL = try await rollblinkRenderPhotoClip(
          inputURL, targetSize: size, durationMs: displayedMs)
        temporaryStills.append(mediaURL)
      } else {
        mediaURL = inputURL
      }
      let asset = AVURLAsset(url: mediaURL)
      guard let video = try await asset.loadTracks(withMediaType: .video).first else {
        throw RenderError.missingVideo("One of the imported files cannot be decoded as video.")
      }
      let assetDuration = try await asset.load(.duration)
      guard isPhoto || CMTimeCompare(milliseconds(clip.outMs), assetDuration) <= 0 else {
        throw RenderError.invalidInput("A clip trim goes beyond the source file duration.")
      }
      let sourceRange = isPhoto
        ? CMTimeRange(start: .zero, duration: milliseconds(displayedMs))
        : CMTimeRange(start: milliseconds(clip.inMs),
                      duration: milliseconds(clip.outMs - clip.inMs))
      let position = milliseconds(clip.startMs)
      try videoOutput.insertTimeRange(sourceRange, of: video, at: position)
      let finalRange = CMTimeRange(start: position, duration: milliseconds(displayedMs))
      if !isPhoto {
        videoOutput.scaleTimeRange(CMTimeRange(start: position, duration: sourceRange.duration),
                                   toDuration: finalRange.duration)
      }
      let preferred = try await video.load(.preferredTransform)
      let natural = try await video.load(.naturalSize)
      layerInstruction.setTransform(fitTransform(video, naturalSize: natural,
                                  preferred: preferred, destination: size), at: position)
      if !isPhoto, !clip.muted, clip.volume > 0,
         let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first,
         let audioOutput = composition.addMutableTrack(withMediaType: .audio,
                       preferredTrackID: kCMPersistentTrackID_Invalid) {
        try audioOutput.insertTimeRange(sourceRange, of: sourceAudio, at: position)
        audioOutput.scaleTimeRange(CMTimeRange(start: position, duration: sourceRange.duration),
                                  toDuration: finalRange.duration)
        let param = AVMutableAudioMixInputParameters(track: audioOutput)
        param.setVolume(Float(min(1, max(0, clip.volume))), at: position)
        mixParameters.append(param)
      }
      lastMs += (clip.outMs - clip.inMs) / clip.speed
    }

    for clip in request.clips.filter({ $0.track == "audio" && !$0.muted && $0.volume > 0 }) {
      guard clip.speed > 0, clip.outMs > clip.inMs, clip.startMs < request.durationMs else { continue }
      let asset = AVURLAsset(url: try sourceURL(clip.uri))
      guard let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first,
            let audioOutput = composition.addMutableTrack(withMediaType: .audio,
              preferredTrackID: kCMPersistentTrackID_Invalid) else { continue }
      let assetDuration = try await asset.load(.duration)
      let available = max(0, CMTimeGetSeconds(assetDuration) * 1000.0 - clip.inMs)
      let playable = min(clip.outMs - clip.inMs,
                         (request.durationMs - clip.startMs) * clip.speed, available)
      if playable < 10 { continue }
      let sourceRange = CMTimeRange(start: milliseconds(clip.inMs), duration: milliseconds(playable))
      let start = milliseconds(clip.startMs)
      try audioOutput.insertTimeRange(sourceRange, of: sourceAudio, at: start)
      audioOutput.scaleTimeRange(CMTimeRange(start: start, duration: sourceRange.duration),
                                 toDuration: milliseconds(playable / clip.speed))
      let param = AVMutableAudioMixInputParameters(track: audioOutput)
      param.setVolume(Float(min(1, max(0, clip.volume))), at: start)
      mixParameters.append(param)
    }

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: total)
    instruction.layerInstructions = [layerInstruction]
    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = size
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = [instruction]

    if !request.texts.isEmpty || tintForLook(request.look) != nil {
      let root = CALayer()
      let videoLayer = CALayer()
      root.frame = CGRect(origin: .zero, size: size)
      videoLayer.frame = root.bounds
      root.addSublayer(videoLayer)
      if let (tintColor,alpha) = tintForLook(request.look) {
        let tintLayer = CALayer()
        tintLayer.frame = root.bounds
        tintLayer.backgroundColor = tintColor
        tintLayer.opacity = Float(alpha)
        root.addSublayer(tintLayer)
      }
      request.texts.forEach { root.addSublayer(makeTextLayer($0, size: size, duration: request.durationMs)) }
      videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
        postProcessingAsVideoLayer: videoLayer, in: root)
    }

    let mix = AVMutableAudioMix()
    mix.inputParameters = mixParameters
    guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw RenderError.exportFailed("Unable to initialize the iOS video exporter.")
    }
    let destination = FileManager.default.temporaryDirectory
      .appendingPathComponent("rollblink-\(UUID().uuidString)").appendingPathExtension("mp4")
    export.outputURL = destination
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = true
    export.videoComposition = videoComposition
    export.audioMix = mix

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
      export.exportAsynchronously {
        switch export.status {
        case .completed:
          continuation.resume(returning: destination)
        case .failed:
          continuation.resume(throwing: RenderError.exportFailed(
            export.error?.localizedDescription ?? "MP4 export failed."))
        case .cancelled:
          continuation.resume(throwing: RenderError.exportFailed("MP4 export was cancelled."))
        default:
          continuation.resume(throwing: RenderError.exportFailed("MP4 export stopped unexpectedly."))
        }
      }
    }
  }
}
