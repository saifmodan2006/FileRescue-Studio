import {ScanLine, Layers3, ShieldCheck, CircleCheck, FileText, Film, FileUp, SlidersHorizontal, Download} from 'lucide-react';

export const capabilities = [
  {icon:ScanLine, label:'Structural diagnosis',tone:'violet', title:'Find out what broke.', text:'Read actual file signatures and container structure. See which PDF pages render or which tracks and boxes a video still contains.'},
  {icon:Layers3,label:'Partial recovery',tone:'teal',title:'Keep the pages that still open.',text:'Choose readable pages and rebuild a PDF. Save the visible page images or pull out selectable text when it’s available.'},
  {icon:ShieldCheck,label:'Browser-local processing',tone:'blue',title:'Private by design.',text:'Your files stay on this device during analysis, repair and verification. The workspace works without an account.'},
  {icon:CircleCheck,label:'Output verification',tone:'amber',title:'Check before you download.',text:'The studio reopens rebuilt PDFs and renders each output page. For repaired video, it checks container structure and samples browser decoding.'},
];

export const workflow = [
  {icon:FileUp,title:'Select a file',text:'Drop a PDF or MP4 into the workspace or choose one from your device.'},
  {icon:ScanLine,title:'Diagnose damage',text:'The studio checks the signature, structure and content it can read.'},
  {icon:SlidersHorizontal,title:'Choose a method',text:'Review the findings and select an available recovery option.'},
  {icon:Layers3,title:'Attempt recovery',text:'The local worker builds a new output from the content it can access.'},
  {icon:Download,title:'Verify and download',text:'Open the verified preview, save the output and export the report.'},
];

export const formats = [
  {icon:FileText,title:'PDF Documents',extension:'.PDF',tone:'violet', detail:'Inspect pages, rebuild readable content and extract selectable text.'},
  {icon:Film,title:'MP4 Videos',extension:'.MP4',tone:'teal', detail:'Inspect container structure and remove certain invalid trailers.'},
];

export const questions = [
  ['Do my files leave my device?', 'File analysis, recovery and verification all run in your browser. The optional feedback form sends the message you enter. Opt-in usage events contain a format and outcome only.'],
  ['Can every damaged file be recovered?', 'Recovery depends on what data is still present. A PDF needs accessible page data. An MP4 needs an intact movie index, complete media boxes and a browser-supported codec for verification.'],
  ['What does verified mean?', 'A verified PDF was reopened and every saved page rendered. A verified MP4 passed container inspection and browser checks at the start, middle and near the end. The report lists exactly which checks ran.'],
  ['How large can my files be?', 'The workspace accepts up to 64 MB per file and checks up to 60 PDF pages per operation. File processing is sequential, with a two-minute worker limit.'],
];
