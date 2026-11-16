import {useEffect, useRef, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {ArrowRight, CircleAlert, CircleCheck, ClipboardList, FileSearch, FileText, FileUp, Film, LockKeyhole, Plus, RotateCcw, ScanLine, UploadCloud, X} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Findings, OutputPanel, Pages, Video} from '../components/recovery';
import {useStudio} from '../state';
import {runJob,verifyPlayback} from '../engine/client';
import {formatSize,MAX_BYTES} from '../engine/types';
import type {Diagnosis, Report} from '../engine/types';
import {api} from '../api';
import type {PublicConfig} from '../api';
import {useWorkspace} from './workspace-state';

const steps = [['Select','Choose a PDF or MP4'],['Diagnose','Inspect the file structure'],['Recover','Rebuild readable content'],['Verify','Check and download results']];

function getError(error: unknown) {
  return error instanceof Error ? error.message : 'The operation could not be completed.';
}

function sendOutcome(diagnosis: Diagnosis, outcome: 'verified'|'partial'|'failed'|'unsupported'|'cancelled') {
  const store = useStudio.getState();
  store.addHistory({format:diagnosis.format,size:diagnosis.size,outcome,time:Date.now()});
  if (!store.preferences.analytics) return;
  void api<PublicConfig>('config').then(async config => {
    if (config.analyticsEnabled && useStudio.getState().preferences.analytics) {
      await api('events',{method:'POST',body:{consent:true,format:diagnosis.format,outcome}});
    }
  }).catch(() => {
    // A missing optional service does not change the local result.
  });
}

export default function Workspace() {
  const [query] = useSearchParams();
  const {state,setState,queue,setQueue,selection,setSelection,operation,setOperation} = useWorkspace();
  const [over,setOver] = useState(false);
  const [queueNotice,setQueueNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const current = useRef<AbortController | null>(null);
  const busy = state.phase === 'analyzing' || state.phase === 'recovering';
  const report = 'report' in state ? state.report : undefined;
  const diagnosis = report?.diagnosis;
  const file = 'file' in state ? state.file : undefined;
  const currentStep = report?.result || (state.phase === 'recovering' && state.stage?.startsWith('Verifying')) ? 3
    : state.phase === 'recovering' ? 2 : report || state.phase === 'analyzing' ? 1 : 0;
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline setup was unavailable.',error));
    }
  },[]);

  function updateQueue(file:File,status:string) {
    setQueue(old => old.map(item => item.file === file ? {...item,status} : item));
  }

  async function analyze(source: File | Promise<File>) {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    let selectedFile = source instanceof File ? source : undefined;
    setOperation(undefined);
    setSelection([]);
    setState({phase:'analyzing',file:selectedFile,stage:selectedFile ? 'Checking the file' : 'Preparing the sample PDF'});
    try {
      const selected = await source;
      controller.signal.throwIfAborted();
      selectedFile = selected;
      updateQueue(selected,'Analyzing');
      setState({phase:'analyzing',file:selected,stage:'Checking the file'});
      const result = await runJob({action:'analyze',file:selected},controller.signal,stage =>
        setState({phase:'analyzing',file:selected,stage}));
      if (!('diagnosis' in result)) throw new Error('The processor returned an unexpected result.');
      const resultDiagnosis = result.diagnosis;
      let playable = false;
      if (resultDiagnosis.format === 'MP4' && resultDiagnosis.tracks?.some(track => track.startsWith('Video · ')) &&
          !resultDiagnosis.findings.some(finding => finding.severity === 'error')) {
        setState({phase:'analyzing',file:selected,stage:'Checking browser decoding'});
        try {
          const detail = await verifyPlayback(selected,controller.signal);
          resultDiagnosis.findings.push({severity:'info',title:'Browser playback sampled',detail});
          playable = true;
        } catch (error) {
          controller.signal.throwIfAborted();
          resultDiagnosis.findings.push({severity:'warning',title:'Browser playback unverified',detail:getError(error)});
        }
      }
      controller.signal.throwIfAborted();
      const next = {diagnosis:resultDiagnosis,attempts:[]};
      setOperation(resultDiagnosis.options[0]?.id);
      setSelection(resultDiagnosis.pages?.filter(page => page.readable).map(page => page.number) ?? []);
      setState({phase:'ready',file:selected,report:next,playable});
      updateQueue(selected,resultDiagnosis.format === 'Unknown' ? 'Unsupported' : 'Diagnosed');
      if (resultDiagnosis.format === 'Unknown') sendOutcome(resultDiagnosis,'unsupported');
      else if (!resultDiagnosis.options.length && resultDiagnosis.findings.some(finding => finding.severity === 'error')) {
        sendOutcome(resultDiagnosis,'failed');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (selectedFile) updateQueue(selectedFile,'Could not analyze');
      setState({phase:'paused',file:selectedFile,message:getError(error)});
    } finally {
      if (current.current === controller) current.current = null;
    }
  }

  async function trySample() {
    setQueue([]);
    setQueueNotice('');
    await analyze(import('../demo').then(module => module.sampleFile()));
  }
  const sampleRequested = query.get('sample') === '1';
  const sampleAction = useRef(trySample);
  useEffect(() => {
    const session = useWorkspace.getState();
    const isSampleReady = session.state.phase === 'ready' && session.state.file.name === 'sample-document.pdf';
    if (sampleRequested && !isSampleReady) void sampleAction.current();
    return () => {
      current.current?.abort();
      const {state,setState,operation} = useWorkspace.getState();
      if (state.phase === 'analyzing') setState({phase:'paused',file:state.file,message:'Analysis stopped when you left the workspace.'});
      if (state.phase === 'recovering' && operation) setState({...state,phase:'ready',report:{
        ...state.report,attempts:[...state.report.attempts,{operation,state:'Cancelled',detail:'The operation stopped when you left the workspace.'}],
      }});
    };
  },[sampleRequested]);

  function selectFiles(files: FileList | File[]) {
    const chosen = Array.from(files).slice(0,10);
    if (!chosen.length) return;
    setQueueNotice(files.length > 10 ? 'The first 10 files were added to the queue.' : '');
    setQueue(chosen.map(file => ({file,status:'Waiting'})));
    void analyze(chosen[0]);
  }

  async function recover() {
    if (state.phase !== 'ready' || !operation || current.current) return;
    const {file,report,playable} = state;
    const controller = new AbortController();
    current.current = controller;
    const working = {...report,result:undefined};
    setState({phase:'recovering',file,report:working,stage:'Preparing recovery',playable});
    try {
      const got = await runJob({action:'recover',file,operation,pages:selection},controller.signal,stage =>
        setState({phase:'recovering',file,report:working,stage,playable}));
      if (!('output' in got)) throw new Error('The processor did not return an output.');
      const {output} = got;
      if (output.requiresPlayback) {
        setState({phase:'recovering',file,report:working,stage:'Verifying recovered video',playable});
        const check = await verifyPlayback(output.blob,controller.signal);
        output.checks.push(check);
        delete output.requiresPlayback;
      }
      controller.signal.throwIfAborted();
      const next: Report = {...working,result:output,attempts:[...working.attempts,{
        operation,state:'Verified',detail:output.partial ? 'Partial output passed the listed checks.' : 'Output passed the listed checks.',
      }]};
      setState({phase:'ready',file,report:next,playable});
      updateQueue(file,output.partial ? 'Partial output' : 'Verified');
      sendOutcome(next.diagnosis,output.partial ? 'partial' : 'verified');
    } catch (error) {
      if (controller.signal.aborted) return;
      const detail = getError(error);
      const next: Report = {...working,attempts:[...working.attempts,{operation,state:'Failed',detail}]};
      setState({phase:'ready',file,report:next,error:detail,playable});
      updateQueue(file,'Recovery failed');
      sendOutcome(next.diagnosis,'failed');
    } finally {
      if (current.current === controller) current.current = null;
    }
  }

  function cancel() {
    current.current?.abort();
    current.current = null;
    if (state.phase === 'recovering' && operation) {
      const next:Report = {...state.report,attempts:[...state.report.attempts,{operation,state:'Cancelled',detail:'The operation was stopped by the user.'}]};
      setState({...state,phase:'ready',report:next,error:'Recovery cancelled. You can try again.'});
      updateQueue(state.file,'Cancelled');
      sendOutcome(next.diagnosis,'cancelled');
    } else {
      if (file) updateQueue(file,'Cancelled');
      setState({phase:'paused',file,message:'Analysis cancelled. You can retry or choose another file.'});
    }
  }

  function reset() {
    current.current?.abort();
    current.current = null;
    setQueue([]);
    setQueueNotice('');
    setSelection([]);
    setOperation(undefined);
    setState({phase:'idle'});
  }

  const nextWaiting = queue.find(item => item.status === 'Waiting');
  return <div className="workspace-bg" onDragOver={event => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
  }} onDrop={event => {
    if (event.dataTransfer.files.length) event.preventDefault();
  }}>
    <div className="site-width workspace page">
      <div className="workspace-title"><div><span className="overline">FILE RESCUE STUDIO</span><h1>Recovery workspace</h1><p>Diagnose a file, choose what to save, and verify the result.</p></div>
        <Link className="subtle-link" to="/settings"><LockKeyhole size={15}/> Processing preferences</Link></div>
      <input className="visually-hidden" type="file" multiple ref={input} tabIndex={-1} aria-label="Files to analyze" onChange={event => {
        if (event.target.files) selectFiles(event.target.files);
        event.target.value = '';
      }}/>
      <div className="workspace-grid">
        <aside className="workspace-aside">
          <div className="panel steps-panel"><h2>Recovery steps</h2><ol>
            {steps.map(([title,detail],index) => <li key={title} className={index === currentStep ? 'current' : ''} aria-current={index === currentStep ? 'step' : undefined}>
              <span className="step-index">{index < currentStep || report?.result ? <CircleCheck size={16}/> : index + 1}</span><div><strong>{title}</strong><small>{detail}</small></div>
            </li>)}
          </ol></div>
          {file && <div className="panel file-panel"><span className="tile violet">{diagnosis?.format === 'MP4' ? <Film size={22}/> : <FileText size={22}/>}</span><h2 className="wrap">{file.name}</h2>
            <dl className="property-list"><div><dt>Size</dt><dd>{formatSize(file.size)}</dd></div><div><dt>Extension</dt><dd>{/\.([^.]{1,16})$/.exec(file.name)?.[1] ?? 'None'}</dd></div>
              {diagnosis && <><div><dt>Detected</dt><dd>{diagnosis.format}</dd></div><div><dt>Signature</dt><dd>{diagnosis.signature}</dd></div></>}</dl></div>}
          {queue.length > 1 && <div className="panel queue"><h2>File queue</h2><p>Select the next file when you’re ready.</p>{queue.map((item,index) =>
            <button type="button" disabled={busy} onClick={() => void analyze(item.file)} key={index} aria-current={file === item.file ? 'true' : undefined}>
              <strong className="wrap">{item.file.name}</strong><small>{item.status}</small></button>)}</div>}
        </aside>
        <section className="workspace-main" aria-label="File processing">
          <span className="visually-hidden" role="status">{state.phase === 'ready' && (report?.result ? 'Verified output ready to download.' : 'File diagnosis ready.')}</span>
          {queueNotice && <p className="status-positive" role="status">{queueNotice}</p>}
          {state.phase === 'idle' && <div className="panel intake"><div className="panel-heading"><span className="tile violet"><FileUp size={24}/></span><div><h2>Select a file</h2><p>Start with a PDF document or MP4 video.</p></div></div>
            <div className={over ? 'dropzone drag-over' : 'dropzone'} onDragOver={event => {event.preventDefault();setOver(true);}} onDragLeave={() => setOver(false)} onDrop={event => {
              event.preventDefault();setOver(false);selectFiles(event.dataTransfer.files);
            }}>
              <span className="upload-icon"><UploadCloud size={30}/></span><strong>Drop files here</strong><p>PDF and MP4 · Up to {Math.round(MAX_BYTES / 1024 / 1024)} MB each · 10 files per queue</p>
              <Button onClick={() => input.current?.click()}>Browse files <Plus size={16}/></Button>
            </div>
            <div className="intake-end"><span><LockKeyhole size={15}/> Files stay on your device</span><button type="button" className="text-link" onClick={() => void trySample()}>Try a sample PDF <ArrowRight size={16}/></button></div>
          </div>}
          {busy && <div className="panel process-card" role="status"><span className="tile violet processing-icon"><ScanLine size={26}/></span><h2>{state.stage}</h2><p>Processing on this device</p><div className="progress" aria-label="Processing in progress" role="progressbar"><span/></div>
            <Button variant="secondary" onClick={cancel}><X size={15}/> Cancel</Button></div>}
          {state.phase === 'paused' && <div className="panel"><div className="panel-heading"><span className="tile amber"><CircleAlert size={24}/></span><div><h2>Analysis stopped</h2><p role="alert">{state.message}</p></div></div><div className="button-row">
            {state.file && <Button onClick={() => void analyze(state.file!)}>Retry analysis</Button>}
            <Button variant="secondary" onClick={() => input.current?.click()}>Choose another file</Button>
          </div></div>}
          {state.phase === 'ready' && diagnosis && <>
            <div className="panel diagnosis-panel"><div className="panel-heading"><span className="tile violet"><FileSearch size={24}/></span><div>
              <span className="overline">{diagnosis.format === 'Unknown' ? 'UNSUPPORTED' : 'DIAGNOSIS READY'}</span><h2>{diagnosis.format === 'Unknown' ? 'File type not recognized' : `${diagnosis.format} findings`}</h2></div></div>
              <Findings items={diagnosis.findings}/>
              {!diagnosis.options.length && <p>{diagnosis.format === 'Unknown' ? 'Choose a PDF or MP4 to continue.' : diagnosis.findings.some(item => item.severity === 'error') ? 'This studio could not identify a supported recovery method for the damage found.' : 'No supported repair is indicated by these checks.'}</p>}
              {state.playable && <details><summary>Preview source video</summary><Video blob={state.file} label="Source video"/></details>}
              {Boolean(diagnosis.pages?.length) && <details open><summary>Page inspection and selection</summary><Pages pages={diagnosis.pages!} selected={selection}
                onToggle={page => setSelection(old => old.includes(page) ? old.filter(number => number !== page) : [...old,page])}/></details>}
            </div>
            {state.error && <p className="alert" role="alert">{state.error}</p>}
            {state.report.result && <OutputPanel output={state.report.result}/>}
            {diagnosis.options.length > 0 && <div className="panel"><h2>Recovery methods</h2><p>Choose what to save from this file.</p>
              <fieldset className="operation-list"><legend className="visually-hidden">Recovery method</legend>
                {diagnosis.options.map(option => <label key={option.id} className={operation === option.id ? 'selected' : ''}>
                  <input type="radio" name="operation" value={option.id} checked={operation === option.id} onChange={() => setOperation(option.id)}/>
                  <span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}
              </fieldset>
              <Button disabled={!operation || (diagnosis.format === 'PDF' && !selection.length)} onClick={() => void recover()}>Attempt recovery <ArrowRight size={17}/></Button>
            </div>}
            <div className="button-row"><Button variant="secondary" asChild><Link to="/report"><ClipboardList size={17}/> View report</Link></Button>
              {nextWaiting && <Button variant="secondary" onClick={() => void analyze(nextWaiting.file)}>Analyze next file <ArrowRight size={16}/></Button>}
              <Button variant="ghost" onClick={reset}><RotateCcw size={16}/> Start over</Button>
              <Button variant="ghost" onClick={() => input.current?.click()}><Plus size={16}/> Choose files</Button></div>
          </>}
        </section>
        <aside className="workspace-aside workspace-guide">
          <div className="panel local-panel"><span className="tile teal"><LockKeyhole size={21}/></span><h2>Private workspace</h2><p>File contents and filenames stay in this tab. Save your output before closing it.</p><Link className="text-link" to="/privacy">How privacy works <ArrowRight size={14}/></Link></div>
          <div className="panel"><h2>Need help?</h2><p>Learn which types of damage the studio can handle.</p><Link className="text-link" to="/docs">Open documentation <ArrowRight size={14}/></Link></div>
        </aside>
      </div>
    </div>
  </div>;
}
