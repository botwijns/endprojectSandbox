import { Question, AnsweredQuestion } from "./types.ts";
import { generateQuestion } from "./questionGenerator.ts";
import { BASE_RATING, updateRating } from "./rating.ts";

export interface QuizState {
  questions: Question[];
  currentIndex: number;
  answered: AnsweredQuestion[];
}

export class QuizSession {
  private state: QuizState;
  private length: number;
  private forcedSongId?: string;
  private recentTraitIds: string[] = [];
  // One Elo rating per trait id, in-memory for this round only - starts
  // neutral and only fills in once a trait has actually been played.
  private playerRatings: Record<string, number> = {};

  constructor(length: number, forcedSongId?: string) {
    this.length = length;
    this.forcedSongId = forcedSongId;
    this.state = { questions: [], currentIndex: 0, answered: [] };
    this.state.questions.push(this.nextQuestion());
  }

  private nextQuestion(): Question {
    const q = generateQuestion({
      playerRatings: this.playerRatings,
      recentTraitIds: this.recentTraitIds,
      forcedSongId: this.forcedSongId,
    });
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

  /** Current Elo rating for a trait - BASE_RATING if it hasn't been played yet this round. */
  ratingFor(traitId: string): number {
    return this.playerRatings[traitId] ?? BASE_RATING;
  }

  submitAnswer(choice: string): AnsweredQuestion {
    const q = this.current;
    if (!q) throw new Error("No current question - quiz already finished.");
    const correct = choice === q.correctAnswer;
    const answered: AnsweredQuestion = { ...q, chosenAnswer: choice, correct };
    this.state.answered.push(answered);

    const current = this.ratingFor(q.traitId);
    this.playerRatings[q.traitId] = updateRating(current, q.songRating, correct ? 1 : 0);

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
