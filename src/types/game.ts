export interface Question {
  id: number;
  spCode: 'SP 4.4.1' | 'SP 4.4.2' | 'SP 4.4.3' | 'SP 4.4.4';
  topic: string;
  question: string;
  options: [string, string, string];
  correctIndex: number; // 0, 1, or 2
  explanation: string;
  hint?: string;
}

export type GameScreen = 'MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY';

export interface GameStats {
  score: number;
  totalTime: number; // in seconds
  correctCount: number;
  wrongCount: number;
  timeoutCount: number;
  bestScore: number;
  bestTime: number;
}

export interface QuestionFeedback {
  type: 'CORRECT' | 'WRONG' | 'TIMEOUT';
  question: Question;
  selectedOption?: string;
  pointsChange: number;
  message: string;
  timestamp: number;
}
