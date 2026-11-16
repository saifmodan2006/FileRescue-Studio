import {Link} from 'react-router-dom';
import {motion,useReducedMotion} from 'motion/react';
import * as Accordion from '@radix-ui/react-accordion';
import {ArrowRight, ArrowUpRight, ChevronDown, CircleCheck, FileText, Fingerprint, Layers3, LockKeyhole, ScanLine, ShieldCheck, TriangleAlert} from 'lucide-react';
import {Button} from '../components/ui/button';
import {capabilities,formats,questions,workflow} from '../content';
import {useStudio} from '../state';

export function FAQ() {
  return <Accordion.Root type="single" collapsible className="faq">
    {questions.map(([question,answer],index) => <Accordion.Item value={String(index)} className="faq-item" key={question}>
      <Accordion.Header><Accordion.Trigger className="faq-trigger">{question}<ChevronDown size={19}/></Accordion.Trigger></Accordion.Header>
      <Accordion.Content className="faq-content"><p>{answer}</p></Accordion.Content>
    </Accordion.Item>)}
  </Accordion.Root>;
}

function ProductPreview() {
  return <div className="preview-scene" aria-label="Recovery workspace example">
    <div className="scene-orbit orbit-one"/><div className="scene-orbit orbit-two"/>
    <div className="product-window">
      <div className="window-top"><span className="window-lights"><i/><i/><i/></span><span>Recovery workspace</span><LockKeyhole size={13}/></div>
      <div className="window-body">
        <div className="sample-heading"><div className="tile violet"><FileText size={23}/></div><div><strong>sample-document.pdf</strong><span>PDF document</span></div><span className="mini-tag">Sample</span></div>
        <div className="sample-separator"/>
        <div className="sample-row"><span className="mini-icon teal"><CircleCheck size={17}/></span><div><strong>PDF signature detected</strong><small>File format identified</small></div></div>
        <div className="sample-row"><span className="mini-icon amber"><TriangleAlert size={17}/></span><div><strong>End marker missing</strong><small>The parser can still check the pages</small></div></div>
        <div className="sample-row"><span className="mini-icon violet"><Layers3 size={17}/></span><div><strong>Rebuild readable pages</strong><small>Open the sample to run the checks</small></div></div>
        <Link to="/repair?sample=1" className="sample-link">Try this sample <ArrowRight size={16}/></Link>
      </div>
    </div>
    <div className="scene-badge"><span className="mini-icon teal"><ShieldCheck size={18}/></span><span><strong>On-device processing</strong><small>Your files stay yours.</small></span></div>
  </div>;
}

export function Home() {
  const preference = useStudio(state => state.preferences.reduced);
  const reduced = useReducedMotion() || preference;
  return <>
    <section className="hero">
      <div className="site-width hero-inner">
        <div className="hero-copy">
          <div className="eyebrow"><span className="signal"/> PRIVATE FILE RECOVERY</div>
          <h1><span>Your Files Deserve</span> <em>a Second Chance.</em></h1>
          <p>Diagnose damaged files, recover what you can, and understand exactly what was saved — privately, right in your browser.</p>
          <div className="hero-actions">
            <Button asChild><Link to="/repair">Start Recovering <ArrowRight size={18}/></Link></Button>
            <Button asChild variant="secondary"><Link to="/how-it-works">See How It Works</Link></Button>
          </div>
          <div className="hero-trust"><span><LockKeyhole size={15}/> No file uploads</span><span><CircleCheck size={15}/> No account required</span></div>
        </div>
        <ProductPreview/>
      </div>
    </section>
    <section className="site-width format-strip" aria-labelledby="format-label">
      <div className="format-intro"><span className="overline" id="format-label">SUPPORTED FORMATS</span><h2>Made for the files you need back.</h2></div>
      {formats.map(({icon:Icon,title,extension,tone,detail}) => <Link className="format-card" to={'/docs#'+extension.slice(1).toLowerCase()} key={title}>
        <span className={'tile '+tone}><Icon size={23}/></span><div><strong>{title}</strong><span>{detail}</span></div><ArrowUpRight className="format-arrow" size={16}/>
      </Link>)}
    </section>
    <section className="section band">
      <div className="site-width">
        <div className="section-heading"><span className="overline">FROM DAMAGE TO DOWNLOAD</span><h2>See what can be saved.</h2><p>Follow the evidence from the first file check to a verified download.</p></div>
        <div className="steps-home">{workflow.map(({icon:Icon,title,text}) => <article key={title}><span className="tile violet"><Icon size={22}/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div>
    </section>
    <section className="section site-width">
      <div className="section-heading align-left"><span className="overline">INSIDE THE STUDIO</span><h2>Recovery you can understand.</h2></div>
      <div className="feature-grid">{capabilities.map(({icon:Icon,label,title,text,tone}) => <motion.article
        className={'feature-card '+tone} key={label} initial={reduced ? false : {opacity:0,y:12}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:0.15}}>
        <span className="tile"><Icon size={26}/></span><span className="overline">{label}</span><h3>{title}</h3><p>{text}</p>
      </motion.article>)}</div>
    </section>
    <section className="section band"><div className="site-width faq-layout"><div><span className="overline">HELP CENTER</span><h2>Common questions</h2><Link className="text-link" to="/docs">Read the documentation <ArrowRight size={16}/></Link></div><FAQ/></div></section>
    <section className="section site-width">
      <div className="open-note"><span className="tile teal"><Fingerprint size={23}/></span><div><h3>Built for transparency</h3><p>Read how the recovery engine is structured and how to contribute to the local source.</p></div><Link className="text-link" to="/about">About the project <ArrowUpRight size={16}/></Link></div>
      <div className="final-cta"><ScanLine size={42}/><h2>Ready to check your file?</h2><Button asChild><Link to="/repair">Open the workspace <ArrowRight size={17}/></Link></Button></div>
    </section>
  </>;
}
