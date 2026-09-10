import { Question, AnsweredQuestion, Difficulty } from "./types.ts";
import { generateQuiz } from "./questionGenerator.ts";

export interface QuizState {
  questions: Question[];
  currentIndex: number;
  answered: AnsweredQuestion[];
}

export class QuizSession {
  private state: QuizState;

  constructor(length: number, difficulty: Difficulty | "mixed" = "mixed") {
    this.state = {
      questions: generateQuiz(length, difficulty),
      currentIndex: 0,
      answered: [],
    };
  }

  get current(): Question | undefined {
    return this.state.questions[this.state.currentIndex];
  }

  get progress() {
    return { current: this.state.currentIndex + 1, total: this.state.questions.length };
  }

  get score() {
    return this.state.answered.filter((a) => a.correct).length;
  }

  get isFinished(): boolean {
    return this.state.currentIndex >= this.state.questions.length;
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
    return answered;
  }

  get history(): AnsweredQuestion[] {
    return this.state.answered;
  }
}
