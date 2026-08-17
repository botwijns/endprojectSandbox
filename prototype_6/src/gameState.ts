export interface Entity {
    id: string;
    x: number;
    y: number;
    soundId: string;
}
export type Direction = "left" | "right" | "wait";
export type Note = {
    direction: Direction;
    time: number;
}
export interface State {
    player: { x: number, y: number };
    sequence: Direction[];
    playerInput: Direction[];
    entities: Entity[];
    phase: "idle"|"throwing"|"waiting"| "reeling" | "success"|"failure";
    currentStep: number;
    score: number;
    running: boolean;
    drawn: boolean;
    randomAngles: number[];
    randomDistances: number[];
    drawnStage: number;
    armed: boolean;
    notes: Note[];
    nextNoteIndex: number;
    songTime: number;
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
        phase: "idle",
        currentStep: 0,
        score: 0,
        running: false,
        drawn: false,
        randomAngles: [],
        randomDistances: [],
        drawnStage: 0,
        armed: false,
        notes: [],
        nextNoteIndex: 0,
        songTime: 0,
    };
}
export function generateNumberSequence(length:number, start: number, end:number): number[] {
    // start is always smaller than end
    const range = Math.abs(end- start);
    return Array.from({ length: length }, () => Math.random()*range+start)
}
export function generateSequence(length: number): Direction[] {
    return Array.from({ length }, () => {
        const r = Math.random();

        if (r < 0.25) {
            return "left";
        } else if (r < 0.75) {
            return "wait";
        } else {
            return "right";
        }
    });
}