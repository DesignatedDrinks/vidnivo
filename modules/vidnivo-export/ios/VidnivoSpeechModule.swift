import Foundation
import AVFoundation
import Speech
import ExpoModulesCore

private enum SpeechError: LocalizedError {
  case unavailable(String)
  var errorDescription: String? {
    switch self {
    case .unavailable(let reason): return reason
    }
  }
}

public class VidnivoSpeechModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VidnivoSpeech")
    AsyncFunction("transcribeFile") { (uri: String, language: String, promise: Promise) in
      Task {
        do {
          let words = try await self.transcribe(uri: uri, language: language)
          promise.resolve(words)
        } catch {
          promise.reject("VIDNIVO_SPEECH", error.localizedDescription)
        }
      }
    }
  }

  private func transcribe(uri: String, language: String) async throws -> [[String: Any]] {
    guard let url = URL(string: uri), url.isFileURL,
          FileManager.default.fileExists(atPath: url.path) else {
      throw SpeechError.unavailable("The selected video is not stored on this iPhone.")
    }
    let auth = await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
      SFSpeechRecognizer.requestAuthorization { status in continuation.resume(returning: status) }
    }
    guard auth == .authorized else {
      throw SpeechError.unavailable("Speech recognition permission is required to generate captions.")
    }
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)),
          recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
      throw SpeechError.unavailable("Offline speech recognition is not available for this language or device. Import an SRT file instead.")
    }

    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration)
    guard CMTimeGetSeconds(duration) > 0, CMTimeGetSeconds(duration) < 600 else {
      throw SpeechError.unavailable("Automatic captions currently support files shorter than 10 minutes.")
    }
    guard let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first else {
      throw SpeechError.unavailable("This video does not contain a speech audio track.")
    }
    let composition = AVMutableComposition()
    guard let outputTrack = composition.addMutableTrack(withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw SpeechError.unavailable("Unable to isolate the audio track.")
    }
    try outputTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration),
                                     of: sourceAudio, at: .zero)
    guard let extractor = AVAssetExportSession(asset: composition,
      presetName: AVAssetExportPresetAppleM4A) else {
      throw SpeechError.unavailable("Unable to prepare the audio for transcription.")
    }
    let audioURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("vidnivo-speech-\(UUID().uuidString).m4a")
    extractor.outputURL = audioURL
    extractor.outputFileType = .m4a
    defer { try? FileManager.default.removeItem(at: audioURL) }
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      extractor.exportAsynchronously {
        if extractor.status == .completed { continuation.resume() }
        else { continuation.resume(throwing: extractor.error ??
          SpeechError.unavailable("Audio extraction failed.")) }
      }
    }

    let request = SFSpeechURLRecognitionRequest(url: audioURL)
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false
    request.taskHint = .dictation
    let transcript = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<SFTranscription, Error>) in
      var delivered = false
      _ = recognizer.recognitionTask(with: request) { result, error in
        if delivered { return }
        if let error = error {
          delivered = true
          continuation.resume(throwing: error)
        } else if let result = result, result.isFinal {
          delivered = true
          continuation.resume(returning: result.bestTranscription)
        }
      }
    }
    return transcript.segments.map { part in
      ["startMs": Int((part.timestamp * 1000.0).rounded()),
       "endMs": Int(((part.timestamp + part.duration) * 1000.0).rounded()),
       "text": part.substring] as [String: Any]
    }
  }
}
