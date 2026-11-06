import AVFoundation
let video = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let audio = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[2]))
let out = URL(fileURLWithPath: CommandLine.arguments[3])
try? FileManager.default.removeItem(at: out)
let comp = AVMutableComposition()
let dur = video.duration
let vt = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! vt.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: video.tracks(withMediaType: .video)[0], at: .zero)
let at = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let src = audio.tracks(withMediaType: .audio)[0]
try! at.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(dur, audio.duration)), of: src, at: .zero)
let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!
ex.outputURL = out; ex.outputFileType = .mp4; ex.shouldOptimizeForNetworkUse = true
let sem = DispatchSemaphore(value: 0)
ex.exportAsynchronously { sem.signal() }
sem.wait()
print("status", ex.status.rawValue, ex.error?.localizedDescription ?? "ok")
