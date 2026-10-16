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
  private lastCategory?: string;
  // One Elo rating per category, in-memory for this round only - starts at
  // BASE_RATING and only fills in once a category has actually been played.
  // The combined/ shell can hand in the ratings a previous quiz part ended on,
  // so a player's level carries over from one quiz part to the next.
  private playerRatings: Record<string, number> = {};
  // where this round started, per category - the baseline for performanceSummary()
  private startRatings: Record<string, number> = {};

  constructor(length: number, forcedSongId?: string, initialRatings?: Record<string, number>) {
    this.length = length;
    this.forcedSongId = forcedSongId;
    if (initialRatings) {
      this.playerRatings = { ...initialRatings };
      this.startRatings = { ...initialRatings };
    }
    this.state = { questions: [], currentIndex: 0, answered: [] };
    this.state.questions.push(this.nextQuestion());
  }

  private nextQuestion(): Question {
    const q = generateQuestion({
      playerRatings: this.playerRatings,
      lastCategory: this.lastCategory,
      forcedSongId: this.forcedSongId,
    });
    this.lastCategory = q.category;
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

  /** Current Elo rating for a category - BASE_RATING if it hasn't been played yet this round. */
  ratingFor(category: string): number {
    return this.playerRatings[category] ?? BASE_RATING;
  }

  submitAnswer(choice: string): AnsweredQuestion {
    const q = this.current;
    if (!q) throw new Error("No current question - quiz already finished.");
    const correct = choice === q.correctAnswer;
    const answered: AnsweredQuestion = { ...q, chosenAnswer: choice, correct };
    this.state.answered.push(answered);

    const current = this.ratingFor(q.category);
    this.playerRatings[q.category] = updateRating(current, q.songRating, correct ? 1 : 0);

    this.state.currentIndex += 1;
    if (this.state.currentIndex < this.length) {
      this.state.questions.push(this.nextQuestion());
    }
    return answered;
  }

  /** A copy of the per-category ratings as they stand now. */
  get ratings(): Record<string, number> {
    return { ...this.playerRatings };
  }

  get history(): AnsweredQuestion[] {
    return this.state.answered;
  }

  /**
   * Per-category performance for this round: for every category actually
   * answered, how far its final rating ended up from where this round started
   * (BASE_RATING, or the rating carried over from a previous quiz part). Sorted best first.
   */
  performanceSummary(): { category: string; avgDelta: number }[] {
    return Array.from(new Set(this.state.answered.map((a) => a.category)))
      .map((category) => ({ category, avgDelta: this.ratingFor(category) - (this.startRatings[category] ?? BASE_RATING) }))
      .sort((a, b) => b.avgDelta - a.avgDelta);
  }
}
