import {useEffect, useState} from 'react';
import type {FormEvent, ReactNode} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {ArrowRight, Code2, FileQuestion, ShieldCheck} from 'lucide-react';
import {Button} from '../components/ui/button';
import {FAQ} from './home';
import {capabilities,workflow} from '../content';
import {useStudio} from '../state';
import {formatSize} from '../engine/types';
import {api} from '../api';

const headings: Record<string,[string,string]> = {
  features:['Built to recover what remains','Inspect damage, save usable content, and check the output directly in your browser.'],
  'how-it-works':['How recovery works','Follow your file through diagnosis, recovery, and verification.'],
  docs:['Documentation','Find supported formats, recovery methods, troubleshooting, and developer notes.'],
  about:['About FileRescue Studio','Recover What Matters.'],
  privacy:['Privacy & terms','Understand how the studio handles your files, preferences, and optional feedback.'],
  settings:['Preferences','Control the appearance and local behavior of your workspace.'],
  feedback:['Send feedback','Tell us what happened or what would improve the studio.'],
};
const cta = <Button asChild><Link to="/repair">Open recovery workspace <ArrowRight size={16}/></Link></Button>;

function Card({title,children,id}: {title:string;children:ReactNode;id?:string}) {
  return <section className="panel article-card" id={id}><h2>{title}</h2>{children}</section>;
}

function Features() {
  return <div className="feature-grid">{capabilities.map(({icon:Icon,tone,label,title,text}) =>
    <article className={'feature-card '+tone} key={label}><span className="tile"><Icon size={27}/></span><span className="overline">{label}</span><h3>{title}</h3><p>{text}</p></article>)}</div>;
}

function How() {
  return <><ol className="workflow-details">{workflow.map(({icon:Icon,title,text},index) =>
    <li className="panel" key={title}><span className="tile violet"><Icon size={25}/></span><div><span className="overline">STEP {index + 1}</span><h2>{title}</h2><p>{text}</p></div></li>)}</ol>
    <Card title="What recovery can preserve"><p>Readable PDF pages can retain text and drawing instructions when copied, or be saved as page images. A video with intact media and metadata may be playable after removing invalid trailing data.</p>
      <p>Pages whose data are gone and frames missing from a video cannot be recreated. The report records what the studio checked and what remains uncertain.</p></Card>
    {cta}</>;
}

function Docs() {
  return <>
    <nav className="toc" aria-label="Documentation sections">{['Start','PDF','MP4','Privacy','Troubleshooting','Developer'].map(part => <a key={part} href={'#'+part.toLowerCase()}>{part}</a>)}</nav>
    <Card id="start" title="Getting started"><p>Choose a file in the <Link to="/repair">recovery workspace</Link>. After diagnosis, select an available recovery method. For PDFs, you can select specific pages. Save the verified output and export a report before closing the tab.</p><p>Limits are 64 MB per file, 60 checked PDF pages per operation and 10 files per queue. The workspace handles one operation at a time.</p></Card>
    <Card id="pdf" title="PDF documents"><p>The studio looks for a PDF signature and end marker, then tries to render individual pages. It can export pages as JPEG-based PDF pages, copy page content with text and drawing instructions, or extract selectable text.</p><p>Image exports omit selectable text and interactive features. Copied pages exclude annotations and document-level features. Password-protected files, missing page trees and scanned-only text extraction are unsupported.</p></Card>
    <Card id="mp4" title="MP4 videos"><p>The inspector reads top-level boxes, looks for the movie index and media data, and lists track and codec identifiers. The repair option preserves an intact container prefix and discards a malformed auxiliary trailer or incomplete final box header.</p><p>Output has to pass structural checks and browser decoding samples. Missing movie indexes, truncated media payloads, arbitrary segments and codecs the current browser cannot decode are unsupported.</p></Card>
    <Card id="privacy" title="Local processing"><p>Files, filenames, previews and results stay in tab memory. The app processes binary data in a worker, uses short-lived object URLs for previews, and never uploads selected files. Optional services use separate endpoints for text feedback and consented format-and-outcome counters.</p></Card>
    <Card id="troubleshooting" title="Browser requirements and troubleshooting"><p>Use a current Chromium, Firefox or Safari release with module workers and OffscreenCanvas. MP4 support depends on your browser and system codecs. If rendering times out, use a smaller file. If copied pages fail verification, try exporting page images.</p><FAQ/></Card>
    <Card id="developer" title="Developer guide"><p>The project README covers local setup, database migrations and tests. The worker owns binary inspection and PDF rendering. The UI checks video decoding and only exposes a downloadable output after verification. The optional Fastify service uses SQLite for settings, feedback and admin sessions.</p><p>To contribute locally, reproduce the issue with a synthetic fixture, add a test that verifies the output, and run type checks, lint and the browser tests. Keep fixtures free of private or licensed source files.</p></Card>
  </>;
}

function About() {
  return <>
    <Card title="Give useful files a second chance"><p>FileRescue Studio helps you understand a damaged file and preserve the information you can still access. Its reports document the checks performed and the limits of each result.</p></Card>
    <div className="feature-grid about-grid">
      <article className="feature-card violet"><span className="tile"><Code2 size={25}/></span><h3>Open development</h3><p>The local source is organized for inspection and contribution. See the documentation for engine boundaries and fixture-based tests.</p><Link className="text-link" to="/docs#developer">Developer guide <ArrowRight size={15}/></Link></article>
      <article className="feature-card teal"><span className="tile"><ShieldCheck size={25}/></span><h3>Privacy principles</h3><p>Keep files on-device, separate optional services from processing, and give users control over what they send.</p><Link className="text-link" to="/privacy">Privacy & terms <ArrowRight size={15}/></Link></article>
    </div>
    <Card title="Technology"><p>React and TypeScript power the studio. PDF.js renders documents, pdf-lib rebuilds pages, and a bounded parser reads MP4 structures. Fastify and SQLite power the optional local service.</p></Card>
    <Card title="Roadmap"><p>Areas for further research include more MP4 damage patterns, additional codecs, stronger output comparison, and accessible document reconstruction.</p></Card>
  </>;
}

function Privacy() {
  return <>
    <Card title="Files and recovery data"><p>Selected files are read and processed on your device. The workspace holds the active file, its findings and output in memory. Reloading or closing the tab clears these. Reports and recovered files are saved only when you export them.</p></Card>
    <Card title="Preferences and optional services"><p>Your preferences are saved in browser storage. If you enable session history, the tab keeps format, size, time and outcome in memory. File names and file bytes are excluded from history.</p><p>The site can request public configuration from the local backend. Usage statistics are off by default. Only with your opt-in and backend enablement does the service receive format and outcome. It stores those fields with a timestamp, without persistent identifiers.</p></Card>
    <Card title="Feedback and admin"><p>Feedback sends the category and message you enter to the local server. Authorized admins can read and update its review state. Avoid putting sensitive information in your message. Admin sign-in uses a limited-duration session cookie.</p></Card>
    <Card title="Terms of use"><p>Use the workspace with files you are authorized to access. Keep the original before attempting recovery. A verified result passed the checks shown in its report. Review the recovered file for completeness before relying on it.</p></Card>
  </>;
}

function Preferences() {
  const {preferences,setPrefs,history,clearHistory} = useStudio();
  return <>
    <Card title="Appearance">
      <label className="field">Theme<select value={preferences.theme} onChange={event => {
        const theme = event.target.value;
        if (theme === 'system' || theme === 'light' || theme === 'dark') setPrefs({theme});
      }}><option value="system">System setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label className="setting"><input type="checkbox" checked={preferences.reduced} onChange={event => setPrefs({reduced:event.target.checked})}/><span><strong>Reduce motion</strong><small>Limit animations even if the system allows them.</small></span></label>
    </Card>
    <Card title="Privacy and history">
      <label className="setting"><input type="checkbox" checked={preferences.history} onChange={event => setPrefs({history:event.target.checked})}/><span><strong>Keep history for this tab</strong><small>Record format, size and outcome until the tab closes.</small></span></label>
      <label className="setting"><input type="checkbox" checked={preferences.analytics} onChange={event => setPrefs({analytics:event.target.checked})}/><span><strong>Share usage statistics</strong><small>Send format and outcome only when the local service accepts usage events.</small></span></label>
      {preferences.history && (history.length ? <>
        <ul className="history">{history.map((item,index) => <li key={index}><strong>{item.format} · {formatSize(item.size)}</strong><span>{item.outcome} · {new Date(item.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></li>)}</ul>
        <Button variant="secondary" onClick={clearHistory}>Clear history</Button>
      </> : <p>There are no processing outcomes in this tab yet.</p>)}
    </Card>
  </>;
}

function Feedback() {
  const [state,setState] = useState({busy:false,error:'',sent:false});
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({busy:true,error:'',sent:false});
    try {
      await api('feedback',{method:'POST',body:{category:data.get('category'),message:data.get('message')}});
      form.reset();
      setState({busy:false,error:'',sent:true});
    } catch (error) {setState({busy:false,error:(error as Error).message,sent:false});}
  }
  return <form className="panel form-stack" onSubmit={submit}>
    <label className="field">Category<select name="category"><option value="bug">Bug report</option><option value="idea">Feature idea</option><option value="other">Other</option></select></label>
    <label className="field">Message<textarea name="message" required minLength={10} maxLength={2000} rows={6} placeholder="Describe what you encountered."/></label>
    <p>Feedback sends only your message and category. Avoid including filenames or private content.</p>
    {state.error && <p className="alert" role="alert">{state.error}</p>}
    {state.sent && <p className="status-positive" role="status">Feedback submitted.</p>}
    <Button disabled={state.busy} type="submit">{state.busy ? 'Sending…' : 'Send feedback'} <ArrowRight size={16}/></Button>
  </form>;
}

export default function InfoPage({page}: {page:string}) {
  const {hash} = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  },[hash,page]);
  if (!headings[page]) return <div className="site-width page narrow"><div className="panel"><span className="tile violet"><FileQuestion size={25}/></span><h1>Page not found</h1><Button asChild><Link to="/">Go home</Link></Button></div></div>;
  const [title,description] = headings[page];
  return <div className={'site-width page info-page ' + (page === 'features' ? '' : 'narrow')}>
    <div className="page-heading"><span className="overline">FILE RESCUE STUDIO</span><h1>{title}</h1><p>{description}</p></div>
    {page === 'features' && <><Features/>{cta}</>}
    {page === 'how-it-works' && <How/>}
    {page === 'docs' && <Docs/>}
    {page === 'about' && <About/>}
    {page === 'privacy' && <Privacy/>}
    {page === 'settings' && <Preferences/>}
    {page === 'feedback' && <Feedback/>}
  </div>;
}
