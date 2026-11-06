// Mix voiceover lines over the music, ducking the music under the voice.
// Usage: vomix <music.wav> <voDir> <out.wav>
import Foundation
func readWav(_ path: String) -> (ch: Int, samples: [Float]) {
  let d = try! Data(contentsOf: URL(fileURLWithPath: path))
  var off = 12, ch = 1, dataOff = 0, dataLen = 0
  while off + 8 <= d.count {
    let id = String(data: d[off..<off + 4], encoding: .ascii)!
    let len = Int(d[off + 4..<off + 8].withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) })
    if id == "fmt " { ch = Int(d[off + 10..<off + 12].withUnsafeBytes { $0.loadUnaligned(as: UInt16.self) }) }
    if id == "data" { dataOff = off + 8; dataLen = len; break }
    off += 8 + len + (len % 2)
  }
  let n = dataLen / 2
  var out = [Float](repeating: 0, count: n)
  d.withUnsafeBytes { raw in for i in 0..<n { out[i] = Float(raw.loadUnaligned(fromByteOffset: dataOff + 2 * i, as: Int16.self)) / 32768 } }
  return (ch, out)
}
let SR = 44100.0
let music = readWav(CommandLine.arguments[1]).samples
let N = music.count / 2
var L = [Float](repeating: 0, count: N), Rr = [Float](repeating: 0, count: N)
for i in 0..<N { L[i] = music[2 * i]; Rr[i] = music[2 * i + 1] }
let cues: [(String, Double)] = [("l1", 0.35), ("l2", 4.75), ("l3", 7.45), ("l4", 10.25), ("l5", 13.82), ("l6", 16.2), ("l7", 18.6), ("l8", 21.45), ("l9", 22.75)]
var vo = [Float](repeating: 0, count: N)
var active = [Float](repeating: 0, count: N)
for (name, at) in cues {
  let v = readWav("\(CommandLine.arguments[2])/\(name).wav").samples
  let s = Int(at * SR)
  var hpY: Float = 0, hpX: Float = 0
  let a: Float = Float(exp(-2 * Double.pi * 90 / SR))
  for k in 0..<v.count where s + k < N {
    // 90 Hz high-pass to keep the voice clean against the bass
    let y = a * (hpY + v[k] - hpX); hpX = v[k]; hpY = y
    vo[s + k] += y
  }
  for k in max(0, s - Int(0.12 * SR))..<min(N, s + v.count + Int(0.05 * SR)) { active[k] = 1 }
}
// smooth the duck: fast attack, slower release
var env: Float = 0
let att = Float(1 - exp(-1 / (0.05 * SR))), rel = Float(1 - exp(-1 / (0.35 * SR)))
var vpeak: Float = 0
for i in 0..<N { vpeak = max(vpeak, abs(vo[i])) }
let vgain: Float = 0.62 / max(vpeak, 0.0001)
var peak: Float = 0
for i in 0..<N {
  env += (active[i] > env ? att : rel) * (active[i] - env)
  let duck = 1 - 0.58 * env
  let v = vo[i] * vgain
  L[i] = tanhf((L[i] * duck + v) * 1.05)
  Rr[i] = tanhf((Rr[i] * duck + v) * 1.05)
  peak = max(peak, abs(L[i]), abs(Rr[i]))
}
let g = 0.89 / peak
var data = Data()
func u32(_ v: UInt32) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 4)) }
func u16(_ v: UInt16) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 2)) }
data.append("RIFF".data(using: .ascii)!); u32(UInt32(36 + N * 4)); data.append("WAVE".data(using: .ascii)!)
data.append("fmt ".data(using: .ascii)!); u32(16); u16(1); u16(2); u32(44100); u32(44100 * 4); u16(4); u16(16)
data.append("data".data(using: .ascii)!); u32(UInt32(N * 4))
var pcm = [Int16](repeating: 0, count: N * 2)
for i in 0..<N { pcm[2 * i] = Int16(max(-32767, min(32767, L[i] * g * 32767))); pcm[2 * i + 1] = Int16(max(-32767, min(32767, Rr[i] * g * 32767))) }
pcm.withUnsafeBufferPointer { data.append(Data(buffer: $0)) }
try! data.write(to: URL(fileURLWithPath: CommandLine.arguments[3]))
print("ok peak", peak)
