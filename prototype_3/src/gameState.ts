export interface Entity {
    id: string;
    x: number;
    y: number;
    soundId: string;
}
export type Direction = "left" | "right";

export interface State {
    player: { x: number, y: number };
    sequence: Direction[];
    playerInput: Direction[];
    entities: Entity[];
    phase: "watching" | "repeating" | "success" | "failure";
    currentStep: number;
    score: number;
    running: boolean;
    drawn: boolean;
    randomNumbers: number[];
}
export function createEntity(id: string, x: number, y:number, soundId:string) : Entity {
    return { id, x, y , soundId}
}
export function createInitialState(): State {
    return {
        player: { x: 0, y: 0 },
        sequence: [],
        playerInput: [],
        entities: [],
        phase: "watching",
        currentStep: 0,
        score: 0,
        running: false,
        drawn: false,
        randomNumbers: [Math.floor(Math.random()*10 - 5), Math.floor(Math.random()*10 - 5), Math.floor(Math.random()*10 - 5)],
    };
}

export function generateSequence(length: number): Direction[] {
    return Array.from({ length }, () => Math.random() < 0.5 ? "left" : "right");
}