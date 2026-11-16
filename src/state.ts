import {create} from 'zustand';

type HistoryItem = {format:string; size:number; outcome:string; time:number};
type Theme = 'light' | 'dark' | 'system';
type Preferences = {theme:Theme; reduced:boolean; analytics:boolean; history:boolean};
function readPrefs(): Preferences {
  const defaults: Preferences = {theme:'system',reduced:false,analytics:false,history:false};
  try {
    const saved = JSON.parse(localStorage.getItem('fr-preferences') ?? '{}');
    return {
      theme:['light','dark','system'].includes(saved?.theme) ? saved.theme : 'system',
      reduced:saved?.reduced === true, analytics:saved?.analytics === true, history:saved?.history === true,
    };
  } catch {return defaults;}
}

type State = {
  preferences:Preferences; setPrefs:(preferences:Partial<Preferences>) => void;
  history:HistoryItem[]; addHistory:(item:HistoryItem) => void; clearHistory:() => void;
};

export const useStudio = create<State>((set) => ({
  preferences:readPrefs(),
  setPrefs:patch => set(state => {
    const preferences = {...state.preferences,...patch};
    try {localStorage.setItem('fr-preferences',JSON.stringify(preferences));}
    catch { /* Preferences remain available for this session. */ }
    return {preferences,...(!preferences.history ? {history:[]} : {})};
  }),
  history:[], addHistory:item => set(state => state.preferences.history ? {history:[item,...state.history].slice(0,20)} : {}),
  clearHistory:() => set({history:[]}),
}));
