import { Question, AnsweredQuestion, Difficulty } from "./types.ts";
import { generateQuestion } from "./questionGenerator.ts";

export interface QuizState {
  questions: Question[];
  currentIndex: number;
  answered: AnsweredQuestion[];
}

// Recomputed from the running score after every answer - only the song's own
// size/instrumentation follows this; question *type* stays fully mixed.
function complexityForAccuracy(score: number, answered: number): Difficulty {
  if (answered === 0) return "medium"; // question 1: no data yet, start in the middle
  const ratio = score / answered;
  if (ratio < 0.4) return "easy";
  if (ratio > 0.7) return "hard";
  return "medium";
}

export class QuizSession {
  private state: QuizState;
  private length: number;
  private forcedSongId?: string;
  private recentTraitIds: string[] = [];

  constructor(length: number, forcedSongId?: string) {
    this.length = length;
    this.forcedSongId = forcedSongId;
    this.state = { questions: [], currentIndex: 0, answered: [] };
    this.state.questions.push(this.nextQuestion());
  }

  private nextQuestion(): Question {
    const complexity = complexityForAccuracy(this.score, this.state.answered.length);
    const q = generateQuestion({ complexity, recentTraitIds: this.recentTraitIds, forcedSongId: this.forcedSongId });
    this.recentTraitIds.push(q.traitId);
    if (this.recentTraitIds.length > 3) this.recentTraitIds.shift();
    return q;
  }

  get current(): Question | undefined {
    return this.state.questions[this.state.currentIndex];
  }

  get progress() {
    return { current: this.state.currentIndex + 1, total: this.length };
  }

  get score() {
    return this.state.answered.filter((a) => a.correct).length;
  }

  get isFinished(): boolean {
    return this.state.currentIndex >= this.length;
  }

  submitAnswer(choice: string): AnsweredQuestion {
    const q = this.current;
    if (!q) throw new Error("No current question - quiz already finished.");
    const answered: AnsweredQuestion = {
      ...q,
      chosenAnswer: choice,
      correct: choice === q.correctAnswer,
    };
    this.state.answered.push(answered);
    this.state.currentIndex += 1;
    if (this.state.currentIndex < this.length) {
      this.state.questions.push(this.nextQuestion());
    }
    return answered;
  }

  get history(): AnsweredQuestion[] {
    return this.state.answered;
  }
}
