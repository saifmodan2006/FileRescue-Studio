import {useEffect,useState} from 'react';
import {Check, CircleAlert, CircleCheck, Download, FileText, Info, TriangleAlert} from 'lucide-react';
import {formatSize} from '../engine/types';
import type {Finding, Output, PageCheck} from '../engine/types';
import {Button} from './ui/button';

export function useObjectUrl(blob?: Blob) {
  const [value,setValue] = useState<{blob:Blob;url:string}>();
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setValue({blob,url});
    return () => URL.revokeObjectURL(url);
  },[blob]);
  return value?.blob === blob ? value?.url : undefined;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url),1000);
}

export function Findings({items}: {items:Finding[]}) {
  const icons = {info:Info,warning:TriangleAlert,error:CircleAlert};
  const tones = {info:'blue',warning:'amber',error:'red'};
  return <ul className="finding-list">{items.map(({severity,title,detail},index) => {
    const Icon = icons[severity];
    return <li key={index}><span className={'mini-icon '+tones[severity]}><Icon size={17}/></span><div><strong>{title}</strong><p>{detail}</p></div></li>;
  })}</ul>;
}

function PageImage({page}: {page:PageCheck}) {
  const url = useObjectUrl(page.image);
  return url ? <img src={url} alt={`Page ${page.number} preview`} loading="lazy"/> : <FileText size={26}/>;
}

export function Pages({pages,selected,onToggle}: {pages:PageCheck[]; selected?:number[]; onToggle?:(page:number) => void}) {
  return <div className="page-grid">{pages.map(page => <div className="page-preview" key={page.number}>
    <div className="page-image"><PageImage page={page}/></div>
    {onToggle && page.readable
      ? <label><input type="checkbox" checked={selected?.includes(page.number)} onChange={() => onToggle(page.number)}/> Page {page.number}</label>
      : <span>Page {page.number} · {page.readable ? 'Rendered' : 'Unreadable'}</span>}
    {page.detail && <details><summary>Details</summary><p>{page.detail}</p></details>}
  </div>)}</div>;
}

export function Video({blob,label}: {blob:Blob;label:string}) {
  const url = useObjectUrl(blob);
  return url ? <video className="video-preview" src={url} controls preload="metadata" playsInline aria-label={label}/> : null;
}

export function OutputPanel({output}: {output:Output}) {
  return <section className="panel result-card">
    <div className="panel-heading"><span className="tile teal"><CircleCheck size={24}/></span><div>
      <span className="overline">{output.partial ? 'PARTIALLY RECOVERED' : 'VERIFIED OUTPUT'}</span>
      <h2>Ready to download</h2><p className="wrap">{output.name} · {formatSize(output.blob.size)}</p>
    </div></div>
    {output.pages && <details><summary>Preview saved pages</summary><Pages pages={output.pages}/></details>}
    {output.blob.type === 'video/mp4' && <Video blob={output.blob} label="Verified recovered video"/>}
    {output.blob.type.startsWith('text/') && <TextPreview blob={output.blob}/>}
    <ul className="check-list">{output.checks.map(check => <li key={check}><Check size={16}/>{check}</li>)}</ul>
    {output.limitations.length > 0 && <ul className="limitations">{output.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>}
    <Button onClick={() => download(output.blob,output.name)}><Download size={17}/> Download file</Button>
  </section>;
}

function TextPreview({blob}: {blob:Blob}) {
  const [text,setText] = useState('');
  useEffect(() => {
    let current = true;
    blob.slice(0,8000).text().then(value => {if (current) setText(value);}).catch(() => {if (current) setText('Preview unavailable.');});
    return () => {current = false;};
  },[blob]);
  return <details><summary>Preview extracted text</summary><pre className="text-preview">{text}{blob.size > 8000 && '\n…'}</pre></details>;
}
