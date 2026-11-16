import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {Activity, LayoutDashboard, LockKeyhole, LogOut, MessageSquare, Settings2} from 'lucide-react';
import {Button} from '../components/ui/button';
import {api,ApiError} from '../api';
import type {PublicConfig} from '../api';

type Session = {username:string;csrf:string};
type Item = {id:number;category:string;message:string;state:'new'|'reviewed'|'resolved';created:number};
type Overview = {feedback:number;events:number;health:string;formats:string[]};
type Analytics = {format:string;outcome:string;count:number}[];
type Data = {overview:Overview;feedback:Item[];analytics:Analytics;settings:PublicConfig};
type Tab = 'Overview'|'Feedback'|'Settings';
const tabs = [{title:'Overview',icon:LayoutDashboard},{title:'Feedback',icon:MessageSquare},{title:'Settings',icon:Settings2}] as const;

export default function AdminPage() {
  const [session,setSession] = useState<Session | null>();
  const [data,setData] = useState<Data>();
  const [tab,setTab] = useState<Tab>('Overview');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [next,setNext] = useState(false);

  const fail = useCallback((failure:unknown) => {
    setNotice('');
    if (failure instanceof ApiError && failure.status === 401) {setSession(null);setData(undefined);}
    setError(failure instanceof Error ? failure.message : 'The request failed.');
  },[]);

  useEffect(() => {
    const controller = new AbortController();
    api<Session>('admin/session',{signal:controller.signal}).then(value => {
      if (!controller.signal.aborted) setSession(value);
    }).catch(failure => {
      if (controller.signal.aborted) return;
      setSession(null);
      if (!(failure instanceof ApiError && failure.status === 401)) fail(failure);
    });
    return () => controller.abort();
  },[fail]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const opts = {signal:controller.signal};
    Promise.all([api<Overview>('admin/overview',opts),api<Item[]>('admin/feedback',opts),api<Analytics>('admin/analytics',opts),api<PublicConfig>('admin/settings',opts)])
      .then(([overview,feedback,analytics,settings]) => {
        if (controller.signal.aborted) return;
        setData({overview,feedback,analytics,settings});setNext(feedback.length === 50);
      }).catch(failure => {if (!controller.signal.aborted) fail(failure);});
    return () => controller.abort();
  },[session,fail]);

  async function action(work:() => Promise<void>) {
    setBusy(true);setError('');setNotice('');
    try {await work();} catch (failure) {fail(failure);}
    finally {setBusy(false);}
  }

  function login(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action(async () => setSession(await api<Session>('admin/login',{method:'POST',body:{username:form.get('username'),password:form.get('password')}})));
  }

  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = new FormData(event.currentTarget);
    const body = {feedbackEnabled:form.has('feedbackEnabled'),analyticsEnabled:form.has('analyticsEnabled'),announcement:form.get('announcement')};
    void action(async () => {
      const settings = await api<PublicConfig>('admin/settings',{method:'PATCH',csrf:session.csrf,body});
      setData(current => current && {...current,settings});setNotice('Settings saved.');
    });
  }

  return <div className={'site-width page admin-page '+(!session ? 'narrow' : '')}>
    <div className="page-heading"><span className="overline">FILE RESCUE STUDIO</span><h1>{session ? 'Administration' : 'Admin sign-in'}</h1>
      <p>{session ? 'Manage feedback, announcements, and optional usage counters.' : 'Sign in with an administrator account created on this local server.'}</p></div>
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p className="status-positive" role="status">{notice}</p>}
    {session === undefined && <div className="skeleton" role="status" aria-label="Checking admin session"/>}
    {session === null && <form className="panel form-stack admin-login" onSubmit={login}>
      <span className="tile violet"><LockKeyhole size={24}/></span>
      <label className="field">Username<input name="username" autoComplete="username" required maxLength={64}/></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
      <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>}
    {session && <div className="admin-grid">
      <aside className="panel admin-nav" aria-label="Admin sections">
        <p className="wrap">Signed in as <strong>{session.username}</strong></p>
        {tabs.map(({title,icon:Icon}) => <Button key={title} variant={tab === title ? 'secondary' : 'ghost'} aria-pressed={tab === title} onClick={() => setTab(title)}><Icon size={17}/> {title}</Button>)}
        <Button variant="ghost" disabled={busy} onClick={() => void action(async () => {
          await api('admin/logout',{method:'POST',csrf:session.csrf});setSession(null);setData(undefined);setTab('Overview');
        })}><LogOut size={17}/> Sign out</Button>
      </aside>
      <div>
        {!data && !error && <div className="skeleton" role="status" aria-label="Loading admin data"/>}
        {data && tab === 'Overview' && <>
          <div className="stat-grid">
            <div className="panel"><MessageSquare size={20}/><strong>{data.overview.feedback}</strong><span>Feedback entries</span></div>
            <div className="panel"><Activity size={20}/><strong>{data.overview.events}</strong><span>Consented events</span></div>
            <div className="panel"><Activity size={20}/><strong>{data.overview.health}</strong><span>Formats · {data.overview.formats.join(', ')}</span></div>
          </div>
          <section className="panel"><h2>Processing outcomes</h2>
            <p>Usage collection is {data.settings.analyticsEnabled ? 'enabled' : 'disabled'}.</p>
            {data.analytics.length ? <ul className="history">{data.analytics.map(row => <li key={row.format+row.outcome}><strong>{row.format} · {row.outcome}</strong><span>{row.count}</span></li>)}</ul>
              : <p>No consented processing outcomes have been recorded.</p>}
          </section>
        </>}
        {data && tab === 'Feedback' && <section className="panel"><h2>Feedback</h2>
          {!data.feedback.length && <p>No feedback has been submitted.</p>}
          <ul className="feedback-list">{data.feedback.map(item => <li key={item.id}>
            <div><strong>{item.category}</strong><small>{new Date(item.created).toLocaleString()}</small><p>{item.message}</p></div>
            <label className="field">Review state<select value={item.state} disabled={busy} onChange={event => {
              const state = event.target.value;
              void action(async () => {
                const updated = await api<Item>('admin/feedback/'+item.id,{method:'PATCH',csrf:session.csrf,body:{state}});
                setData(current => current && {...current,feedback:current.feedback.map(entry => entry.id === updated.id ? updated : entry)});
                setNotice('Review state saved.');
              });
            }}><option value="new">New</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></label>
          </li>)}</ul>
          {next && <Button variant="secondary" disabled={busy} onClick={() => void action(async () => {
            const more = await api<Item[]>('admin/feedback?before='+data.feedback.at(-1)!.id);
            setData(current => current && {...current,feedback:[...current.feedback,...more]});setNext(more.length === 50);
          })}>Load older entries</Button>}
        </section>}
        {data && tab === 'Settings' && <form className="panel form-stack" onSubmit={save}>
          <h2>Product settings</h2>
          <label className="setting"><input type="checkbox" name="feedbackEnabled" defaultChecked={data.settings.feedbackEnabled}/><span>Accept public feedback</span></label>
          <label className="setting"><input type="checkbox" name="analyticsEnabled" defaultChecked={data.settings.analyticsEnabled}/><span>Accept opt-in usage events</span></label>
          <label className="field">Public announcement<textarea name="announcement" maxLength={300} rows={3} defaultValue={data.settings.announcement}/></label>
          <Button disabled={busy} type="submit">Save settings</Button>
        </form>}
      </div>
    </div>}
  </div>;
}
