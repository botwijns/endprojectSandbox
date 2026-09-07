declare const WebAudioFontPlayer: any;

declare const _tone_0000_GeneralUserGS_sf2_file: any;
declare const _drum_36_1_Chaos_sf2_file: any;
declare const _drum_38_1_Chaos_sf2_file: any;
declare const _drum_42_1_Chaos_sf2_file: any;
declare const _tone_0241_GeneralUserGS_sf2_file: any;
declare const _tone_0321_GeneralUserGS_sf2_file: any;
declare const _tone_0282_GeneralUserGS_sf2_file: any;
declare const _tone_0331_GeneralUserGS_sf2_file: any;
declare const _tone_0882_GeneralUserGS_sf2_file: any;
declare const _tone_0851_GeneralUserGS_sf2_file: any;
declare const _tone_0650_GeneralUserGS_sf2_file: any;
declare const _tone_0430_GeneralUserGS_sf2_file: any;
declare const _tone_0560_GeneralUserGS_sf2_file: any;
declare const _tone_0421_GeneralUserGS_sf2_file: any;
declare const _tone_0340_GeneralUserGS_sf2_file: any;
declare const _tone_0382_GeneralUserGS_sf2_file: any;
declare const _tone_0271_GeneralUserGS_sf2_file: any;
declare const _tone_0401_GeneralUserGS_sf2_file: any;


// -----------------------------------------------------------------------------
// Instruments
// -----------------------------------------------------------------------------

const instruments = {
    piano: _tone_0000_GeneralUserGS_sf2_file,

    kick: _drum_36_1_Chaos_sf2_file,
    snare: _drum_38_1_Chaos_sf2_file,
    highHat: _drum_42_1_Chaos_sf2_file,

    guitar: _tone_0241_GeneralUserGS_sf2_file,
    bass: _tone_0321_GeneralUserGS_sf2_file,
    slapBass: _tone_0282_GeneralUserGS_sf2_file,
    disGuitar: _tone_0331_GeneralUserGS_sf2_file,

    synthPad: _tone_0882_GeneralUserGS_sf2_file,
    synthLead: _tone_0851_GeneralUserGS_sf2_file,
    synthBass: _tone_0382_GeneralUserGS_sf2_file,

    elGuitar: _tone_0271_GeneralUserGS_sf2_file,
    elBass: _tone_0340_GeneralUserGS_sf2_file,

    sax: _tone_0650_GeneralUserGS_sf2_file,
    uprightBass: _tone_0430_GeneralUserGS_sf2_file,
    trumpet: _tone_0560_GeneralUserGS_sf2_file,
    cello: _tone_0421_GeneralUserGS_sf2_file,
    violin: _tone_0401_GeneralUserGS_sf2_file,
} as const;

type Instrument = keyof typeof instruments;


// -----------------------------------------------------------------------------
// Transport types
// -----------------------------------------------------------------------------

export interface Note {
    /**
     * Position in beats.
     *
     * Example:
     * 0   = beat 1
     * 1   = beat 2
     * 2   = beat 3
     * 4   = next bar in 4/4
     */
    time: number;

    /**
     * Duration in beats.
     */
    duration: number;

    /**
     * MIDI pitch.
     *
     * Middle C = 60.
     */
    pitch: number;

    instrument: Instrument;

    /**
     * 0..1
     */
    volume?: number;
}

export interface Loop {
    start: number;
    end: number;
}

export type TransportState =
    | "stopped"
    | "playing"
    | "paused";

export interface AudioTransportOptions {
    tempo?: number;

    /**
     * Number of beats to schedule ahead of the playhead.
     *
     * 1-2 bars is usually sufficient.
     */
    scheduleAheadTime?: number;

    masterVolume?: number;

    /**
     * Called periodically while playing.
     */
    onPositionChange?: (position: number) => void;

    onStateChange?: (state: TransportState) => void;

    onEnded?: () => void;
}


// -----------------------------------------------------------------------------
// Player
// -----------------------------------------------------------------------------

export class AudioTransportPlayer {
    private readonly ctx: AudioContext;
    private readonly player: any;
    private readonly masterGain: GainNode;

    private readonly scheduleAheadTime: number;

    private notes: Note[] = [];

    private initialized = false;

    private state: TransportState = "stopped";

    /**
     * Musical position where playback currently is.
     *
     * This is always measured in beats.
     */
    private position = 0;

    /**
     * AudioContext time at which the current transport
     * position started.
     */
    private transportStartTime = 0;

    /**
     * Musical position corresponding to transportStartTime.
     */
    private transportStartPosition = 0;

    private tempo: number;

    private loop: Loop | null = null;

    private animationFrame: number | null = null;

    /**
     * Notes that have already been scheduled.
     */
    private scheduledNotes: any[] = [];

    /**
     * Position of the last scheduled note.
     */
    private scheduledUntil = 0;

    private readonly onPositionChange?: (
        position: number
    ) => void;

    private readonly onStateChange?: (
        state: TransportState
    ) => void;

    private readonly onEnded?: () => void;

    constructor(options: AudioTransportOptions = {}) {
        this.ctx = new AudioContext();

        this.player = new WebAudioFontPlayer();

        this.masterGain = this.ctx.createGain();

        this.masterGain.gain.value =
            options.masterVolume ?? 1;

        this.masterGain.connect(
            this.ctx.destination
        );

        this.tempo = options.tempo ?? 120;

        this.scheduleAheadTime =
            options.scheduleAheadTime ?? 2;

        this.onPositionChange =
            options.onPositionChange;

        this.onStateChange =
            options.onStateChange;

        this.onEnded =
            options.onEnded;
    }


    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }

        const sources: Record<Instrument, string> = {
            piano:
                "_tone_0000_GeneralUserGS_sf2_file",

            kick:
                "_drum_36_1_Chaos_sf2_file",

            snare:
                "_drum_38_1_Chaos_sf2_file",

            highHat:
                "_drum_42_1_Chaos_sf2_file",

            guitar:
                "_tone_0241_GeneralUserGS_sf2_file",

            bass:
                "_tone_0321_GeneralUserGS_sf2_file",

            slapBass:
                "_tone_0282_GeneralUserGS_sf2_file",

            disGuitar:
                "_tone_0331_GeneralUserGS_sf2_file",

            synthPad:
                "_tone_0882_GeneralUserGS_sf2_file",

            synthLead:
                "_tone_0851_GeneralUserGS_sf2_file",

            sax:
                "_tone_0650_GeneralUserGS_sf2_file",

            uprightBass:
                "_tone_0430_GeneralUserGS_sf2_file",

            trumpet:
                "_tone_0560_GeneralUserGS_sf2_file",

            cello:
                "_tone_0421_GeneralUserGS_sf2_file",

            elBass:
                "_tone_0340_GeneralUserGS_sf2_file",

            synthBass:
                "_tone_0382_GeneralUserGS_sf2_file",

            elGuitar:
                "_tone_0271_GeneralUserGS_sf2_file",

            violin:
                "_tone_0401_GeneralUserGS_sf2_file",
        };

        for (const instrument of Object.keys(
            instruments
        ) as Instrument[]) {
            this.player.loader.decodeAfterLoading(
                this.ctx,
                sources[instrument]
            );
        }

        this.initialized = true;
    }


    // -------------------------------------------------------------------------
    // Loading
    // -------------------------------------------------------------------------

    load(notes: Note[]): void {
        this.stop();

        this.notes = [...notes].sort(
            (a, b) => a.time - b.time
        );

        this.position = 0;
        this.scheduledUntil = 0;
    }


    // -------------------------------------------------------------------------
    // Transport
    // -------------------------------------------------------------------------

    async play(): Promise<void> {
        if (!this.initialized) {
            throw new Error(
                "Call await player.init() before playing."
            );
        }

        await this.resumeContext();

        if (this.state === "playing") {
            return;
        }

        this.state = "playing";

        this.transportStartTime =
            this.ctx.currentTime;

        this.transportStartPosition =
            this.position;

        this.scheduledUntil =
            this.position;

        this.setState("playing");

        this.schedule();

        this.startUpdateLoop();
    }


    async pause(): Promise<void> {
        if (this.state !== "playing") {
            return;
        }

        this.position =
            this.getPosition();

        this.cancelScheduledNotes();

        this.state = "paused";

        this.setState("paused");

        this.stopUpdateLoop();
    }


    stop(): void {
        this.cancelScheduledNotes();

        this.position = 0;

        this.scheduledUntil = 0;

        this.state = "stopped";

        this.setState("stopped");

        this.stopUpdateLoop();
    }


    // -------------------------------------------------------------------------
    // Seeking
    // -------------------------------------------------------------------------

    seek(position: number): void {
        const duration = this.getDuration();

        this.position = Math.max(
            0,
            Math.min(position, duration)
        );

        this.cancelScheduledNotes();

        this.scheduledUntil =
            this.position;

        if (this.state === "playing") {
            this.transportStartTime =
                this.ctx.currentTime;

            this.transportStartPosition =
                this.position;

            this.schedule();
        }

        this.emitPosition();
    }


    // -------------------------------------------------------------------------
    // Tempo
    // -------------------------------------------------------------------------

    setTempo(bpm: number): void {
        if (bpm <= 0) {
            throw new Error(
                "Tempo must be greater than zero."
            );
        }

        /*
         * Preserve the current musical position when
         * changing tempo.
         */
        if (this.state === "playing") {
            this.position =
                this.getPosition();

            this.transportStartTime =
                this.ctx.currentTime;

            this.transportStartPosition =
                this.position;

            this.cancelScheduledNotes();

            this.scheduledUntil =
                this.position;
        }

        this.tempo = bpm;

        if (this.state === "playing") {
            this.schedule();
        }
    }

    getTempo(): number {
        return this.tempo;
    }


    // -------------------------------------------------------------------------
    // Looping
    // -------------------------------------------------------------------------

    setLoop(
        start: number,
        end: number
    ): void {
        if (end <= start) {
            throw new Error(
                "Loop end must be greater than loop start."
            );
        }

        this.loop = {
            start,
            end,
        };
    }

    clearLoop(): void {
        this.loop = null;
    }

    getLoop(): Loop | null {
        return this.loop;
    }


    // -------------------------------------------------------------------------
    // Position / duration
    // -------------------------------------------------------------------------

    getPosition(): number {
        if (this.state !== "playing") {
            return this.position;
        }

        const elapsed =
            this.ctx.currentTime -
            this.transportStartTime;

        return (
            this.transportStartPosition +
            this.secondsToBeats(elapsed)
        );
    }


    getDuration(): number {
        if (this.notes.length === 0) {
            return 0;
        }

        return Math.max(
            ...this.notes.map(
                note =>
                    note.time +
                    note.duration
            )
        );
    }


    // -------------------------------------------------------------------------
    // Volume
    // -------------------------------------------------------------------------

    setVolume(volume: number): void {
        this.masterGain.gain.value =
            Math.max(
                0,
                Math.min(1, volume)
            );
    }

    getVolume(): number {
        return this.masterGain.gain.value;
    }


    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    getState(): TransportState {
        return this.state;
    }


    // -------------------------------------------------------------------------
    // Scheduling
    // -------------------------------------------------------------------------

    private schedule(): void {
        if (this.state !== "playing") {
            return;
        }

        const currentPosition =
            this.getPosition();

        const scheduleUntil =
            currentPosition +
            this.secondsToBeats(
                this.scheduleAheadTime
            );

        /*
         * Handle looping before scheduling notes
         * beyond the loop end.
         */
        if (
            this.loop &&
            currentPosition >= this.loop.end
        ) {
            this.seek(this.loop.start);
            return;
        }

        for (const note of this.notes) {
            if (
                note.time < this.scheduledUntil
            ) {
                continue;
            }

            if (
                note.time >= scheduleUntil
            ) {
                break;
            }

            if (
                this.loop &&
                note.time >= this.loop.end
            ) {
                break;
            }

            this.scheduleNote(note);
        }

        this.scheduledUntil =
            scheduleUntil;
    }


    private scheduleNote(note: Note): void {
        const currentPosition =
            this.getPosition();

        const beatOffset =
            note.time - currentPosition;

        /*
         * Don't schedule notes that are already
         * behind the playhead.
         */
        if (beatOffset < 0) {
            return;
        }

        const when =
            this.ctx.currentTime +
            this.beatsToSeconds(
                beatOffset
            );

        const duration =
            this.beatsToSeconds(
                note.duration
            );

        const scheduled =
            this.player.queueWaveTable(
                this.ctx,
                this.masterGain,
                instruments[note.instrument],
                when,
                note.pitch,
                duration,
                note.volume ?? 0.7
            );

        this.scheduledNotes.push(
            scheduled
        );
    }


    // -------------------------------------------------------------------------
    // Scheduling cancellation
    // -------------------------------------------------------------------------

    private cancelScheduledNotes(): void {
        for (const note of this.scheduledNotes) {
            try {
                if (note?.cancel) {
                    note.cancel();
                }
            } catch {
                // Already finished.
            }
        }

        this.scheduledNotes = [];
    }


    // -------------------------------------------------------------------------
    // Timing conversion
    // -------------------------------------------------------------------------

    private beatsToSeconds(
        beats: number
    ): number {
        return (
            beats *
            (60 / this.tempo)
        );
    }


    private secondsToBeats(
        seconds: number
    ): number {
        return (
            seconds *
            (this.tempo / 60)
        );
    }


    // -------------------------------------------------------------------------
    // Update loop
    // -------------------------------------------------------------------------

    private startUpdateLoop(): void {
        this.stopUpdateLoop();

        const update = () => {
            if (this.state !== "playing") {
                return;
            }

            const position =
                this.getPosition();

            /*
             * Loop handling.
             */
            if (
                this.loop &&
                position >= this.loop.end
            ) {
                this.seek(this.loop.start);
            }

            /*
             * End of song.
             */
            else if (
                position >= this.getDuration()
            ) {
                this.position =
                    this.getDuration();

                this.state =
                    "stopped";

                this.cancelScheduledNotes();

                this.setState(
                    "stopped"
                );

                this.stopUpdateLoop();

                this.onEnded?.();

                return;
            }

            this.schedule();

            this.emitPosition();

            this.animationFrame =
                requestAnimationFrame(
                    update
                );
        };

        this.animationFrame =
            requestAnimationFrame(update);
    }


    private stopUpdateLoop(): void {
        if (
            this.animationFrame !== null
        ) {
            cancelAnimationFrame(
                this.animationFrame
            );

            this.animationFrame =
                null;
        }
    }


    // -------------------------------------------------------------------------
    // Context
    // -------------------------------------------------------------------------

    private async resumeContext(): Promise<void> {
        if (
            this.ctx.state ===
            "suspended"
        ) {
            await this.ctx.resume();
        }
    }


    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    private emitPosition(): void {
        this.onPositionChange?.(
            this.position
        );
    }


    private setState(
        state: TransportState
    ): void {
        this.state = state;

        this.onStateChange?.(
            state
        );
    }


    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------

    async destroy(): Promise<void> {
        this.stop();

        this.cancelScheduledNotes();

        if (
            this.ctx.state !== "closed"
        ) {
            await this.ctx.close();
        }
    }
}