export const dimensions = [
  ['岗位匹配度', 23],
  ['专业能力 / 技术深度', 27],
  ['逻辑思维与问题解决', 17],
  ['沟通协作与推动力', 13],
  ['学习成长潜力', 13],
  ['价值观与文化契合', 7],
] as const

export type Mode = 'success' | 'slow' | 'fail'
export type Answer = {
  question: string
  audio: boolean
  status: 'empty' | 'pending' | 'ready' | 'failed'
  transcript: string
}
export type Report = {
  total: number
  rows: { score: number; answerIndex: number | null; quote: string; tip: string }[]
}
export type Session = { id: string; finished: boolean; reportStale?: boolean; answers: Answer[]; report: Report | null }
