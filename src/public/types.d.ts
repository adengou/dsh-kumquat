/**
 * Kumquat public contract — version 1.
 * Frozen. Only the lead may change this file; every module codes against it.
 */

export type StreamType = 'video' | 'audio' | 'subtitle'

export interface StreamInfo {
  index: number
  type: StreamType
  codec: string
  width?: number
  height?: number
  fps?: number
  /** True when r_frame_rate and avg_frame_rate disagree (variable frame rate). */
  vfr?: boolean
  sampleRate?: number
  channels?: number
}

export interface MediaFacts {
  path: string
  bytes: number
  container: string
  formatName: string
  durationSec: number
  streams: StreamInfo[]
  video?: StreamInfo
  audio?: StreamInfo
  ffmpegVersion: string
}

export interface Capabilities {
  ffmpeg: string
  ffprobe: string
  version: string
  filters: string[]
  encoders: string[]
  muxers: string[]
  /** 本机是否找到可用的 FFmpeg；为 false 时上面的列表为空。 */
  available?: boolean
}

export type ConvertTask = {
  kind: 'convert'
  input: string
  /** Target extension or container name, e.g. "mkv", "mp3". */
  to: string
  /** Try stream copy first. Defaults to true; the engine downgrades with a reason. */
  copy?: boolean
  /** Optional segment to convert; forces a re-encode for an accurate cut. */
  trim?: TrimRange
}

export type GifTask = {
  kind: 'gif'
  input: string
  /** Segment start in seconds. */
  from: number
  /** Segment end in seconds. */
  to: number
  fps?: number
  width?: number
  maxBytes?: number
}

export type Task = ConvertTask | GifTask

export interface MediaSpec {
  container?: string
  video?: { codec?: string; width?: number; height?: number; fps?: number }
  audio?: {
    codec?: string
    sampleRate?: number
    channels?: number
    loudnessLufs?: [number, number]
    truePeakDbMax?: number
  }
  durationSec?: { expect: number; toleranceSec?: number }
  maxBytes?: number
  gif?: { from: number; to: number; fps: number; width: number; loop: true }
  decodable?: 'sample' | 'full' | 'none'
}

export type CheckOutcome = 'pass' | 'warn' | 'fail' | 'skipped'

export type RepairAction =
  | { kind: 'gain'; db: number }
  | { kind: 'reencode'; width?: number; bitrateKbps?: number }
  | { kind: 'rerun'; reason: string }
  | { kind: 'manual'; reason: string }

export interface Check {
  id: string
  tier: 'L0' | 'L1' | 'L2'
  outcome: CheckOutcome
  expected?: string
  actual?: string
  delta?: string
  hint?: string
  repair?: RepairAction
}

export interface RepairRecord {
  action: RepairAction
  ok: boolean
  before: string
  after: string
}

export interface Verdict {
  ok: boolean
  task?: Task
  spec: MediaSpec
  facts: MediaFacts
  checks: Check[]
  repairs: RepairRecord[]
  evidencePath?: string
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'verifying'
  | 'repairing'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface MediaQcErrorShape {
  code: MediaQcErrorCode
  message: string
  hint: string
}

export interface JobProgress {
  phase?: 'probing' | 'encoding' | 'verifying' | 'repairing'
  /** 0..100 when the encoder reports a duration. */
  percent?: number
  outTimeSec?: number
  speed?: string
  etaSec?: number
}

export interface JobSummary {
  id: string
  task: Task
  status: JobStatus
  output?: string
  /** Human-readable note, e.g. the output directory was changed. */
  note?: string
  startedAt: number
  endedAt?: number
  progress?: JobProgress
  /** Present on terminal jobs; the list endpoint carries it too. */
  verdict?: Verdict
}

export interface JobDetail extends JobSummary {
  verdict?: Verdict
  argv?: string[]
  error?: MediaQcErrorShape
}

export interface MediaQcService {
  readonly apiVersion: 1
  probe(input: string): Promise<MediaFacts>
  capabilities(): Promise<Capabilities>
  run(task: Task, opts?: { overwrite?: boolean }): Promise<JobSummary>
  verify(path: string, spec: MediaSpec): Promise<Verdict>
  cancel(jobId: string): Promise<void>
  jobs: {
    list(): Promise<JobSummary[]>
    get(id: string): Promise<JobDetail>
  }
}

export type MediaQcErrorCode =
  | 'E_INPUT'
  | 'E_CAPABILITY'
  | 'E_ENCODE'
  | 'E_VERIFY'
  | 'E_REPAIR_EXHAUSTED'
  | 'E_COMMIT'
  | 'E_CANCEL'

/** Optional DeepSeek balance widget. Server-side only; the key never reaches the client. */
export interface BalanceInfo {
  ok: boolean
  currency?: string
  total?: string
  granted?: string
  toppedUp?: string
  available?: boolean
  at?: number
  error?: string
}
