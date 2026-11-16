import {Link} from 'react-router-dom';
import {ArrowLeft, ClipboardList, Download, Printer} from 'lucide-react';
import {useWorkspace} from './workspace-state';
import {Button} from '../components/ui/button';
import {Findings,OutputPanel,download} from '../components/recovery';
import {formatSize} from '../engine/types';

export default function ReportPage() {
  const report = useWorkspace(({state}) => 'report' in state ? state.report : undefined);
  if (!report) return <div className="site-width page narrow"><div className="panel"><span className="tile violet"><ClipboardList size={25}/></span>
    <h1>No report yet</h1><p>Analyze a file to generate a recovery report for this tab.</p><Button asChild><Link to="/repair">Open workspace</Link></Button></div></div>;
  const {diagnosis,result,attempts} = report;
  function exportJSON() {
    const {pages,...details} = diagnosis;
    const data = {
      version:1, diagnosis:{...details,pages:pages?.map(({number,readable,detail}) => ({number,readable,detail}))},
      attempts,
      output:result && {name:result.name,size:result.blob.size,type:result.blob.type,partial:result.partial,checks:result.checks,limitations:result.limitations},
    };
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'filerescue-report.json');
  }
  return <div className="site-width page narrow report-page">
    <Link className="text-link no-print" to="/repair"><ArrowLeft size={16}/> Back to workspace</Link>
    <div className="page-heading"><span className="overline">FILE RESCUE STUDIO</span><h1>Recovery report</h1><p className="wrap">{diagnosis.name}</p></div>
    <div className="button-row no-print"><Button onClick={exportJSON}><Download size={17}/> Export JSON</Button>
      <Button variant="secondary" onClick={() => window.print()}><Printer size={17}/> Print / save PDF</Button></div>
    <section className="panel"><h2>File information</h2><dl className="property-list report-properties">
      <div><dt>Detected format</dt><dd>{diagnosis.format}</dd></div><div><dt>Original size</dt><dd>{formatSize(diagnosis.size)} ({diagnosis.size} bytes)</dd></div>
      <div><dt>Signature</dt><dd>{diagnosis.signature}</dd></div><div><dt>Result</dt><dd>{result ? result.partial ? 'Partially recovered' : 'Verified output' : attempts.at(-1)?.state ?? 'Analysis only'}</dd></div>
    </dl></section>
    <section className="panel"><h2>What the studio found</h2><Findings items={diagnosis.findings}/>
      {diagnosis.pages && <details><summary>Technical page checks</summary><ul>{diagnosis.pages.map(page =>
        <li key={page.number}>Page {page.number} · {page.readable ? 'Rendered' : page.detail ?? 'Unreadable'}</li>)}</ul></details>}
    </section>
    <section className="panel"><h2>Recovery attempts</h2>{attempts.length ? <ul className="attempts">{attempts.map((attempt,index) =>
      <li key={index}><strong>{diagnosis.options.find(option => option.id === attempt.operation)?.title ?? attempt.operation} · {attempt.state}</strong><p>{attempt.detail}</p></li>)}</ul> : <p>Recovery has yet to be attempted on this file.</p>}</section>
    {result && <OutputPanel output={result}/>}
  </div>;
}
