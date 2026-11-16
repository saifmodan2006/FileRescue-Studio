import {Component, lazy, Suspense, useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {Link, NavLink, Route, Routes, useLocation} from 'react-router-dom';
import {ArrowUpRight, Menu, Moon, Sun, X} from 'lucide-react';
import {MotionConfig, motion, useReducedMotion} from 'motion/react';
import {Button} from './components/ui/button';
import {Home} from './pages/home';
import {useStudio} from './state';
import {api} from './api';
import type {PublicConfig} from './api';

const Workspace = lazy(() => import('./pages/workspace'));
const Report = lazy(() => import('./pages/report'));
const Info = lazy(() => import('./pages/info'));
const Admin = lazy(() => import('./pages/admin'));

const links = [['Home','/'],['Repair Files','/repair'],['Features','/features'],['How It Works','/how-it-works'],['Documentation','/docs'],['About','/about']];
export const Brand = () => <Link to="/" className="brand"><img src="/mark.svg" alt="" width="34" height="34"/><span>FileRescue<span className="brand-studio"> Studio</span></span></Link>;

function Header({dark}: {dark:boolean}) {
  const [open,setOpen] = useState(false);
  const {pathname} = useLocation();
  const setPrefs = useStudio(state => state.setPrefs);
  useEffect(() => {setOpen(false);},[pathname]);
  useEffect(() => {
    if (!open) return;
    const escape = (event:KeyboardEvent) => {if (event.key === 'Escape') setOpen(false);};
    window.addEventListener('keydown',escape);
    return () => window.removeEventListener('keydown',escape);
  },[open]);
  return <header className="topbar">
    <div className="site-width top-inner">
      <Brand/>
      <nav id="main-navigation" aria-label="Main navigation" className={open ? 'nav open' : 'nav'}>
        {links.map(([label,path]) => <NavLink to={path} key={path} end={path === '/'} onClick={() => setOpen(false)}>{label}</NavLink>)}
      </nav>
      <div className="header-actions">
        <button className="icon-button" type="button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setPrefs({theme:dark ? 'light' : 'dark'})}>
          {dark ? <Sun size={17}/> : <Moon size={17}/>}
        </button>
        <Button asChild className="launch"><Link to="/repair">Launch App <ArrowUpRight size={15}/></Link></Button>
        <button type="button" className="icon-button menu-button" aria-controls="main-navigation" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
          {open ? <X size={21}/> : <Menu size={21}/>}
        </button>
      </div>
    </div>
  </header>;
}

function Footer() {
  return <footer className="footer">
    <div className="site-width footer-inner">
      <div><Brand/><p>Recover What Matters.</p></div>
      <div><strong>Studio</strong><Link to="/repair">Repair files</Link><Link to="/features">Features</Link><Link to="/how-it-works">How it works</Link></div>
      <div><strong>Resources</strong><Link to="/docs">Documentation</Link><Link to="/about">About</Link><Link to="/feedback">Send feedback</Link></div>
      <div><strong>Information</strong><Link to="/privacy">Privacy & terms</Link><Link to="/settings">Preferences</Link><Link to="/admin">Admin</Link></div>
    </div>
    <div className="site-width footer-end"><span>FileRescue Studio</span><span>File processing runs on your device.</span></div>
  </footer>;
}

class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  render() {
    if (this.state.failed) return <section className="site-width page"><h1>This page could not open</h1><p>Refresh to try again. Files in the workspace are held in this tab’s memory.</p>
      <Button onClick={() => window.location.reload()}>Refresh page</Button></section>;
    return this.props.children;
  }
}

export function App() {
  const {pathname,hash} = useLocation();
  const previousPath = useRef(pathname);
  const preferences = useStudio(state => state.preferences);
  const reducedMotion = useReducedMotion() || preferences.reduced;
  const [systemDark,setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [announcement,setAnnouncement] = useState('');
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change',update);
    return () => media.removeEventListener('change',update);
  },[]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.reduce = preferences.reduced ? 'true' : 'false';
  },[dark,preferences.reduced]);
  useEffect(() => {
    const controller = new AbortController();
    api<PublicConfig>('config',{signal:controller.signal}).then(config => setAnnouncement(config.announcement)).catch(() => {
      // Public processing is independent of announcements.
    });
    return () => controller.abort();
  },[]);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (!hash) window.scrollTo(0,0);
    document.getElementById('main-content')?.focus({preventScroll:true});
  },[hash,pathname]);

  return <MotionConfig reducedMotion={preferences.reduced ? 'always' : 'user'}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Header dark={dark}/>
    {announcement && <div className="announcement">{announcement}</div>}
    <main id="main-content" tabIndex={-1}>
      <ErrorBoundary key={pathname}>
        <Suspense fallback={<div className="site-width page" role="status"><div className="skeleton"/><p>Opening page…</p></div>}>
          <motion.div key={pathname} initial={reducedMotion ? false : {opacity:0.92}} animate={{opacity:1}} transition={{duration:0.18}}>
            <Routes>
              <Route path="/" element={<Home/>}/>
              <Route path="/repair" element={<Workspace/>}/>
              <Route path="/report" element={<Report/>}/>
              <Route path="/admin" element={<Admin/>}/>
              {['features','how-it-works','docs','about','privacy','settings','feedback'].map(page => <Route path={'/'+page} element={<Info page={page}/>} key={page}/>)}
              <Route path="*" element={<Info page="missing"/>}/>
            </Routes>
          </motion.div>
        </Suspense>
      </ErrorBoundary>
    </main>
    <Footer/>
  </MotionConfig>;
}
