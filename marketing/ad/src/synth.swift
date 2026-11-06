// Original soundtrack for the ICN ad, synthesized from scratch (no samples).
// 120 BPM, A minor / C major, scored to the video's scene timings.
// Usage: synth <out.wav>
import Foundation

let SR = 44100.0
let DUR = 25.0
let N = Int(SR * DUR)
var L = [Float](repeating: 0, count: N)
var R = [Float](repeating: 0, count: N)
var rng = SystemRandomNumberGenerator()
func noise() -> Double { Double.random(in: -1...1, using: &rng) }
func mtof(_ m: Double) -> Double { 440 * pow(2, (m - 69) / 12) }
func idx(_ t: Double) -> Int { Int(t * SR) }
@inline(__always) func add(_ i: Int, _ v: Double, pan: Double = 0) {
  guard i >= 0 && i < N else { return }
  L[i] += Float(v * (1 - max(0, pan))); R[i] += Float(v * (1 + min(0, pan)))
}
struct LP { var y = 0.0; mutating func run(_ x: Double, _ fc: Double) -> Double { let a = 1 - exp(-2 * .pi * fc / SR); y += a * (x - y); return y } }
struct HP { var lp = LP(); mutating func run(_ x: Double, _ fc: Double) -> Double { x - lp.run(x, fc) } }

let BEAT = 0.5, BAR = 2.0
let DROP = 4.5          // phone enters, groove starts
let OUTRO = 21.0        // end card
let DOT = 22.25         // red dot pops on the logo

// Sidechain envelope from the kick, applied to bass and pads
var duck = [Double](repeating: 1, count: N)
func kickAt(_ t: Double, gain: Double = 1) {
  let s = idx(t), len = idx(0.42)
  var ph = 0.0
  for k in 0..<len {
    let tt = Double(k) / SR
    let f = 45 + 95 * exp(-tt * 28)
    ph += 2 * .pi * f / SR
    let env = exp(-tt * 9) * min(1, tt * 2000)
    let click = k < 60 ? noise() * 0.25 * (1 - Double(k) / 60) : 0
    add(s + k, (sin(ph) * env + click) * 0.95 * gain)
  }
  for k in 0..<idx(0.3) where s + k < N {
    let tt = Double(k) / SR
    duck[s + k] = min(duck[s + k], 1 - 0.75 * exp(-tt * 14))
  }
}
func clapAt(_ t: Double, gain: Double = 1) {
  var hp = HP(), lp = LP()
  for k in 0..<idx(0.25) {
    let tt = Double(k) / SR
    let burst = [0.0, 0.011, 0.022].map { tt >= $0 ? exp(-(tt - $0) * 70) : 0 }.reduce(0, +) / 2.2
    let env = burst + exp(-tt * 18) * 0.5
    let v = lp.run(hp.run(noise(), 900), 6000) * env
    add(idx(t) + k, v * 0.55 * gain, pan: 0.05)
  }
}
func hatAt(_ t: Double, open: Bool = false, gain: Double = 1, pan: Double = 0.25) {
  var hp = HP()
  let dec = open ? 9.0 : 55.0
  for k in 0..<idx(open ? 0.32 : 0.07) {
    let tt = Double(k) / SR
    add(idx(t) + k, hp.run(noise(), 7500) * exp(-tt * dec) * 0.22 * gain, pan: pan)
  }
}
func crashAt(_ t: Double, gain: Double = 1) {
  var hp = HP(), hp2 = HP()
  for k in 0..<idx(2.4) {
    let tt = Double(k) / SR
    let v = hp.run(noise(), 5000) * exp(-tt * 1.6) * 0.22 * gain
    let v2 = hp2.run(noise(), 5000) * exp(-tt * 1.6) * 0.22 * gain
    let i = idx(t) + k; if i < N { L[i] += Float(v); R[i] += Float(v2) }
  }
}
func sawVoice(_ t0: Double, _ dur: Double, _ midi: Double, gain: Double, cutoff: (Double) -> Double, detune: [Double] = [0], pan: Double = 0, attack: Double = 0.01, release: Double = 0.08, ducked: Bool = false) {
  var lp = LP(), lp2 = LP()
  var phs = detune.map { _ in Double.random(in: 0..<1) }
  let n = idx(dur + release)
  for k in 0..<n {
    let tt = Double(k) / SR
    var v = 0.0
    for (j, d) in detune.enumerated() {
      phs[j] += mtof(midi + d) / SR; if phs[j] >= 1 { phs[j] -= 1 }
      v += 2 * phs[j] - 1
    }
    v /= Double(detune.count)
    let fc = cutoff(t0 + tt)
    v = lp2.run(lp.run(v, fc), fc)
    var env = min(1, tt / attack)
    if tt > dur { env *= max(0, 1 - (tt - dur) / release) }
    let i = idx(t0) + k
    let dk = ducked && i < N && i >= 0 ? duck[i] : 1
    add(i, v * env * gain * dk, pan: pan)
  }
}
func sineVoice(_ t0: Double, _ dur: Double, _ freq: (Double) -> Double, gain: Double, decay: Double, pan: Double = 0, partials: [(Double, Double)] = [(1, 1)]) {
  var ph = partials.map { _ in 0.0 }
  for k in 0..<idx(dur) {
    let tt = Double(k) / SR
    let f = freq(tt)
    var v = 0.0
    for (j, p) in partials.enumerated() { ph[j] += 2 * .pi * f * p.0 / SR; v += sin(ph[j]) * p.1 }
    add(idx(t0) + k, v * exp(-tt * decay) * min(1, tt * 400) * gain, pan: pan)
  }
}
func whoosh(_ t0: Double, _ dur: Double, from f0: Double, to f1: Double, gain: Double, pan: Double = 0) {
  var lp = LP(), hp = HP()
  for k in 0..<idx(dur) {
    let x = Double(k) / Double(idx(dur))
    let fc = f0 * pow(f1 / f0, x)
    let env = sin(.pi * x) * sin(.pi * x)
    add(idx(t0) + k, lp.run(hp.run(noise(), fc * 0.5), fc * 1.6) * env * gain, pan: pan * (2 * x - 1))
  }
}

// MARK: 0–4.5  the boring portal: thin elevator muzak, then a tape stop
do {
  let mel: [(Double, Double, Double)] = [(0.0, 0.45, 72), (0.45, 0.45, 76), (0.9, 0.45, 79), (1.35, 0.9, 76), (2.25, 0.45, 74), (2.7, 0.6, 71)]
  let bass: [(Double, Double, Double)] = [(0.0, 1.35, 48), (1.35, 1.35, 53), (2.7, 0.8, 55)]
  func pitch(_ t: Double) -> Double { // tape-stop from 2.85 s
    let wow = 1 + 0.004 * sin(t * 2 * .pi * 0.9)
    if t < 2.85 { return wow }
    let x = min(1, (t - 2.85) / 0.45); return wow * max(0.02, 1 - x * x)
  }
  for list in [mel, bass] {
    let isBass = list.count == 3
    for (st, d, m) in list {
      var ph = 0.0
      let n = idx(d + 0.15)
      for k in 0..<n {
        let t = st + Double(k) / SR
        if t > 3.35 { break }
        ph += 2 * .pi * mtof(m) * pitch(t) / SR
        let v = sin(ph) + 0.3 * sin(ph * 2) + 0.12 * sin(ph * 3)  // cheap organ
        let tt = Double(k) / SR
        var env = min(1, tt / 0.02) * (tt > d ? max(0, 1 - (tt - d) / 0.15) : 1)
        if t > 2.85 { env *= max(0, 1 - (t - 2.85) / 0.5) }
        add(idx(st) + k, v * env * (isBass ? 0.10 : 0.075), pan: isBass ? 0 : -0.15)
      }
    }
  }
  // vinyl-ish hiss under the muzak
  var hp = HP()
  for k in 0..<idx(3.3) { add(k, hp.run(noise(), 3000) * 0.012 * (1 - Double(k) / Double(idx(3.3)))) }
  // the red strike: a sharp swish
  whoosh(2.7, 0.45, from: 600, to: 9000, gain: 0.5, pan: 0.6)
  // build-up into the drop
  whoosh(3.3, 1.2, from: 300, to: 12000, gain: 0.32)
  var t = 3.75, step = 0.125
  while t < DROP - 0.01 {
    let g = 0.25 + 0.75 * (t - 3.75) / (DROP - 3.75)
    clapAt(t, gain: g * 0.6)
    t += step; if t > 4.25 { step = 0.0625 }
  }
  kickAt(DROP - 0.25, gain: 0.0) // keep the duck curve tidy
}

// MARK: 4.5–21  the groove
let chords: [[Double]] = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]] // Am F C G
let roots: [Double] = [45, 41, 48, 43]
crashAt(DROP, gain: 1.1)
var bar = 0
var tb = DROP
while tb < OUTRO - 0.4 {
  let c = bar % 4
  let section = tb < 10.5 ? 1 : (tb < 16.5 ? 2 : 3)
  for b in 0..<4 {
    let tbeat = tb + Double(b) * BEAT
    if tbeat >= OUTRO - 0.5 { break }
    kickAt(tbeat)
    if b == 1 || b == 3 { clapAt(tbeat) }
    hatAt(tbeat + 0.25, open: section == 3 && b % 2 == 1, gain: section == 1 ? 0.8 : 1)
    if section >= 2 { hatAt(tbeat + 0.125, gain: 0.45, pan: -0.25); hatAt(tbeat + 0.375, gain: 0.45, pan: -0.25) }
  }
  if section >= 2 && tb > 10.4 && tb < 10.6 { crashAt(tb, gain: 0.8) }
  if section == 3 && tb > 16.4 && tb < 16.6 { crashAt(tb, gain: 0.9) }
  // bass: eighth-note pulse, octave jump on the "and" of 4
  for e in 0..<8 {
    let te = tb + Double(e) * 0.25
    if te >= OUTRO - 0.5 { break }
    let m = roots[c] + (e == 7 ? 12 : 0)
    sawVoice(te, 0.2, m, gain: 0.30, cutoff: { _ in 420 }, detune: [0, 0.08], attack: 0.004, release: 0.03, ducked: true)
    sawVoice(te, 0.2, m - 12, gain: 0.22, cutoff: { _ in 160 }, attack: 0.004, release: 0.03, ducked: true)
  }
  // pads: filter opens as the ad goes on
  let padCut: (Double) -> Double = { t in 600 + 2600 * min(1, max(0, (t - DROP) / (OUTRO - DROP))) }
  for (j, m) in chords[c].enumerated() {
    sawVoice(tb, BAR - 0.05, m, gain: 0.05, cutoff: padCut, detune: [-0.12, 0, 0.11], pan: [-0.5, -0.2, 0.2, 0.5][j], attack: 0.08, release: 0.25, ducked: true)
  }
  // pluck arpeggio from Chautari onward
  if section >= 2 {
    let ch: [Double] = chords[c]
    let up: [Double] = [ch[1] + 12.0, ch[2] + 12.0, ch[3] + 12.0, ch[2] + 12.0]
    let arp: [Double] = ch + up
    let pattern: [Int] = [0, 2, 1, 3, 4, 2, 5, 3, 6, 4, 7, 5, 4, 2, 3, 1]
    for s in 0..<16 {
      let ts = tb + Double(s) * 0.125
      if ts >= OUTRO - 0.5 { break }
      let m = arp[pattern[s] % arp.count] + 12
      sawVoice(ts, 0.09, m, gain: section == 3 ? 0.075 : 0.06, cutoff: { t in 1800 + 2000 * exp(-(t - ts) * 25) }, detune: [0, 0.05], pan: s % 2 == 0 ? -0.45 : 0.45, attack: 0.002, release: 0.12)
      // dotted-eighth echo
      sawVoice(ts + 0.375, 0.09, m, gain: 0.025, cutoff: { _ in 1500 }, pan: s % 2 == 0 ? 0.6 : -0.6, attack: 0.002, release: 0.12)
    }
  }
  // the hook, final section: a short bright lead
  if section == 3 {
    let hook: [(Double, Double, Double)] = [(0, 0.25, 76), (0.25, 0.25, 79), (0.5, 0.5, 81), (1.0, 0.25, 79), (1.25, 0.25, 76), (1.5, 0.45, 74)]
    let shifts: [Double] = [0, -3, 0, -2]
    let shift: Double = shifts[c]
    for (st, d, m) in hook where tb + st < OUTRO - 0.5 {
      sawVoice(tb + st, d, m + shift, gain: 0.07, cutoff: { _ in 3200 }, detune: [-0.07, 0.07], attack: 0.006, release: 0.1)
    }
  }
  tb += BAR; bar += 1
}
// fill and riser into the end card
do {
  var t = OUTRO - 0.5
  while t < OUTRO - 0.01 { clapAt(t, gain: 0.35 + (t - (OUTRO - 0.5)) * 1.2); t += 0.0625 }
  whoosh(OUTRO - 0.9, 0.95, from: 400, to: 11000, gain: 0.28)
}

// MARK: scene sound effects
for at in [5.9, 7.15, 8.45] { whoosh(at - 0.05, 0.42, from: 900, to: 5000, gain: 0.16, pan: 0.5) }   // feed swipes
for at in [10.15, 12.95, 16.75] { whoosh(at - 0.1, 0.6, from: 500, to: 7000, gain: 0.2, pan: -0.6) } // screen changes
for at in [12.6, 16.35, 19.9] {                                                                       // taps
  sineVoice(at, 0.05, { _ in 1900 }, gain: 0.12, decay: 90, partials: [(1, 1), (2.01, 0.3)])
}
sineVoice(18.55, 0.7, { tt in 520 + 900 * min(1, tt * 3) }, gain: 0.05, decay: 5)                    // earn sheet rise

// MARK: 21–25  end card: one warm chord, then the logo chime
do {
  kickAt(OUTRO, gain: 1.1); crashAt(OUTRO, gain: 0.9)
  for (j, m) in [48.0, 55, 60, 64, 67, 72].enumerated() {
    sawVoice(OUTRO, 3.6, m, gain: 0.055, cutoff: { t in 2400 * exp(-(t - OUTRO) * 0.6) + 300 }, detune: [-0.1, 0, 0.1], pan: Double(j - 3) * 0.18, attack: 0.02, release: 0.4)
  }
  sawVoice(OUTRO, 3.6, 36, gain: 0.2, cutoff: { _ in 140 }, attack: 0.01, release: 0.4)
  // chime on the red dot: bell partials, with echoes
  for (k, (dt, g)) in [(0.0, 1.0), (0.375, 0.35), (0.75, 0.15)].enumerated() {
    sineVoice(DOT + dt, 2.6, { _ in mtof(84) }, gain: 0.16 * g, decay: 1.6, pan: [0, 0.5, -0.5][k], partials: [(1, 1), (2.0, 0.35), (2.76, 0.18), (5.4, 0.06)])
    sineVoice(DOT + dt + 0.12, 2.4, { _ in mtof(91) }, gain: 0.09 * g, decay: 1.8, pan: [0, -0.5, 0.5][k], partials: [(1, 1), (2.0, 0.3), (3.0, 0.1)])
  }
}

// MARK: master: gentle glue, soft clip, fades, normalise
var peak: Float = 0
for i in 0..<N {
  let fadeIn = min(1.0, Double(i) / (SR * 0.03))
  let fadeOut = min(1.0, (DUR - Double(i) / SR) / 0.9)
  L[i] = Float(tanh(Double(L[i]) * 1.25) * fadeIn * fadeOut)
  R[i] = Float(tanh(Double(R[i]) * 1.25) * fadeIn * fadeOut)
  peak = max(peak, abs(L[i]), abs(R[i]))
}
let gain = 0.89 / max(peak, 0.0001)

// MARK: write 16-bit stereo WAV
var data = Data()
func u32(_ v: UInt32) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 4)) }
func u16(_ v: UInt16) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 2)) }
data.append("RIFF".data(using: .ascii)!); u32(UInt32(36 + N * 4)); data.append("WAVE".data(using: .ascii)!)
data.append("fmt ".data(using: .ascii)!); u32(16); u16(1); u16(2); u32(UInt32(SR)); u32(UInt32(SR) * 4); u16(4); u16(16)
data.append("data".data(using: .ascii)!); u32(UInt32(N * 4))
var pcm = [Int16](repeating: 0, count: N * 2)
for i in 0..<N {
  pcm[2 * i] = Int16(max(-32767, min(32767, L[i] * gain * 32767)))
  pcm[2 * i + 1] = Int16(max(-32767, min(32767, R[i] * gain * 32767)))
}
pcm.withUnsafeBufferPointer { data.append(Data(buffer: $0)) }
try! data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print("peak", peak, "gain", gain)
