// Types for talkRig.js (generated; see its header).
export type ArmSpec = { a?: [number, number]; T?: [number, number]; hand?: string; ang?: number };
export type Pose = Record<string, unknown>;
export type Rig = {
  c: { id: string; name: string; base: 'adult' | 'young' };
  VB: { full: number[]; waist: number[] };
  make(svg: SVGSVGElement, viewBox: number[]): SVGSVGElement;
  apply(svg: SVGSVGElement, pose: Pose): void;
};
export type Talk = { sentences: { text: string; t0: number; dur: number }[]; dur: number; cue?: { emotion: string; action: string } };
export class Performance {
  constructor(rig: Rig, talk: Talk | null, options?: { seed?: number; live?: boolean; still?: false | 'idle' | 'hair' });
  t: number;
  listen(t: number): void;
  think(t: number): void;
  speak(talk: Talk, t0: number): void;
  stop(t: number): void;
  idle(t: number): void;
  advance(t: number): this;
  pose(): Pose;
}
export function makeRig(id: string): Rig;
export function alignSpeech(text: string, pcm: Float32Array, rate: number): Talk;
export function alignTimed(pcm: Float32Array, rate: number, timing: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Talk;
export function estimateSpeech(text: string): Talk;
