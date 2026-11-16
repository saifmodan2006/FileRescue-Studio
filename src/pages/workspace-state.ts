import {create} from 'zustand';
import type {Operation, Report} from '../engine/types';

export type WorkspaceState =
  | {phase:'idle'}
  | {phase:'analyzing'; file?:File; stage:string}
  | {phase:'paused'; file?:File; message:string}
  | {phase:'ready'|'recovering'; file:File; report:Report; stage?:string; error?:string; playable?:boolean};
type QueueItem = {file:File; status:string};
type ValueOrUpdater<T> = T | ((previous:T) => T);

type WorkspaceStore = {
  state:WorkspaceState; setState:(state:WorkspaceState) => void;
  queue:QueueItem[]; setQueue:(queue:ValueOrUpdater<QueueItem[]>) => void;
  selection:number[]; setSelection:(selection:ValueOrUpdater<number[]>) => void;
  operation?:Operation; setOperation:(operation?:Operation) => void;
};

export const useWorkspace = create<WorkspaceStore>((set) => ({
  state:{phase:'idle'},setState:state => set({state}),
  queue:[],setQueue:queue => set(old => ({queue:typeof queue === 'function' ? queue(old.queue) : queue})),
  selection:[],setSelection:selection => set(old => ({selection:typeof selection === 'function' ? selection(old.selection) : selection})),
  setOperation:operation => set({operation}),
}));
