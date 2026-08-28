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
    phase: "idle"|"throwing"|"listening"| "reeling" | "success"|"failure";
    currentStep: number;
    score: number;
    running: boolean;
    drawn: boolean;
    randomAngles: number[];
    randomDistances: number[];
    drawnStage: number;
    armed: boolean;
    // catch-by-ear mechanic
    collectedInstruments: string[];   // ids of instruments unlocked this round (award a point once)
    activeInstrument: string | null;  // instrument whose melody is currently audible (the catch window)
    pendingInstrument: string | null; // instrument hooked and currently being reeled in
    strikes: number;                  // wrong taps on the drums
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
        collectedInstruments: [],
        activeInstrument: null,
        pendingInstrument: null,
        strikes: 0,
    };
}
export function generateNumberSequence(length:number, start: number, end:number): number[] {
    // start is always smaller than end
    const range = Math.abs(end- start);
    return Array.from({ length: length }, () => Math.random()*range+start)
}
export function generateSequence(length: number): Direction[] {
    return Array.from({ length }, () => Math.random() < 0.5 ? "left" : "right");
}