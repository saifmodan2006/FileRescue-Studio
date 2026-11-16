import {getDocument, PDFWorker, AnnotationMode, VerbosityLevel} from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {PDFArray, PDFDocument, PDFName, PDFRawStream} from 'pdf-lib';
import type {Diagnosis, Operation, Output, PageCheck} from './types';
import {outputName} from './types';

const MAX_PAGES = 60;
const MAX_TEXT = 200_000;
const MAX_PAGE_STREAM = 8 * 1024 * 1024;

async function loadForCopy(bytes: Uint8Array) {
  try {
    const source = await PDFDocument.load(bytes,{throwOnInvalidObject:true,updateMetadata:false});
    return source.getPageCount() > 0 ? source : undefined;
  }
  catch {return undefined;}
}

async function checkPageStreams(pdf: PDFDocument | undefined, number: number) {
  if (!pdf || number > pdf.getPageCount()) return;
  const contents = pdf.getPage(number - 1).node.Contents();
  const streams = contents instanceof PDFArray
    ? Array.from({length:contents.size()},(_, index) => contents.lookup(index))
    : [contents];
  for (const stream of streams) {
    // Check the common single-filter case independently. The renderer can
    // silently treat a broken Flate stream as an empty page.
    if (!(stream instanceof PDFRawStream) || stream.dict.lookup(PDFName.of('Filter')) !== PDFName.of('FlateDecode')) continue;
    const reader = new Blob([new Uint8Array(stream.getContents())]).stream()
      .pipeThrough(new DecompressionStream('deflate')).getReader();
    let total = 0;
    try {
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_PAGE_STREAM) {
          await reader.cancel();
          throw new Error('A decoded content stream exceeded the page safety limit.');
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      if (detail.includes('page safety limit')) throw error;
      throw new Error('A compressed page content stream could not be decoded.');
    } finally {reader.releaseLock();}
  }
}

class WorkerCanvasFactory {
  getNoAlphaContext(canvas: OffscreenCanvas) {
    return canvas.getContext('2d',{alpha:false,willReadFrequently:true});
  }
  create(width: number, height: number) {
    if (width < 1 || height < 1 || width * height > 12_000_000) throw new Error('An image exceeds the canvas limit.');
    const canvas = new OffscreenCanvas(width,height);
    return {canvas, context:canvas.getContext('2d', {willReadFrequently:true})!};
  }
  reset(target: {canvas: OffscreenCanvas}, width: number, height: number) {
    if (width < 1 || height < 1 || width * height > 12_000_000) throw new Error('An image exceeds the canvas limit.');
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: {canvas: OffscreenCanvas}) {
    target.canvas.width = 1;
    target.canvas.height = 1;
  }
}

async function scan(bytes: Uint8Array<ArrayBuffer>, stage: (status: string) => void, source?: PDFDocument) {
  const port = new Worker(new URL(pdfWorker,self.location.href),{type:'module'});
  const worker = PDFWorker.create({port, verbosity:VerbosityLevel.ERRORS});
  const task = getDocument({
    data:bytes.slice(), worker, stopAtErrors:true, verbosity:VerbosityLevel.ERRORS, disableFontFace:true,
    useSystemFonts:false, useWasm:false, CanvasFactory:WorkerCanvasFactory, disableWorkerRendering:true,
    enableXfa:false, maxImageSize:12_000_000, canvasMaxAreaInBytes:48_000_000, docBaseUrl:undefined,
    useWorkerFetch:true,
    standardFontDataUrl:new URL('/pdf-assets/standard_fonts/',self.location.href).href,
    cMapUrl:new URL('/pdf-assets/cmaps/',self.location.href).href,
  });
  try {
    const doc = await task.promise;
    const pages: PageCheck[] = [];
    for (let number = 1; number <= Math.min(doc.numPages, MAX_PAGES); number++) {
      stage(`Rendering page ${number} of ${Math.min(doc.numPages, MAX_PAGES)}`);
      try {
        await checkPageStreams(source,number);
        const page = await doc.getPage(number);
        const original = page.getViewport({scale:1});
        const viewport = page.getViewport({scale:Math.min(1.5, 960 / Math.max(original.width, original.height))});
        const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        await page.render({
          canvas:canvas as unknown as HTMLCanvasElement, viewport, annotationMode:AnnotationMode.DISABLE,
        }).promise;
        const image = await canvas.convertToBlob({type:'image/jpeg', quality:0.88});
        const text = await page.getTextContent().then(content => content.items.map(item =>
          'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim().slice(0,MAX_TEXT), () => '');
        pages.push({number, readable:true, text, image});
        page.cleanup();
      } catch (error) {
        pages.push({number, readable:false, detail:error instanceof Error ? error.message : 'Page rendering failed.'});
      }
    }
    return {pages,pageCount:doc.numPages};
  } finally {
    try {await task.destroy();}
    finally {worker.destroy();port.terminate();}
  }
}

export async function inspectPDF(bytes: Uint8Array<ArrayBuffer>, diagnosis: Diagnosis, stage: (status: string) => void) {
  const tail = new TextDecoder().decode(bytes.subarray(-4096));
  if (!tail.trimEnd().endsWith('%%EOF')) diagnosis.findings.push({
    severity:'warning', title:'PDF end marker is missing or followed by extra bytes',
    detail:'A valid PDF normally ends with an EOF marker. A parser may still be able to read earlier page data.',
  });
  const xref = /startxref\s+(\d+)\s*(?:%%EOF)?\s*$/.exec(tail)?.[1];
  const offset = Number(xref);
  const target = Number.isSafeInteger(offset) && offset < bytes.length
    ? new TextDecoder().decode(bytes.subarray(offset,offset + 50)) : '';
  if (!/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(target)) diagnosis.findings.push({
    severity:'warning',title:'The PDF cross-reference pointer could not be verified',
    detail:'The pointer normally locates the object index. Diagnosis will check whether the page tree can still be opened.',
  });
  try {
    const source = await loadForCopy(bytes);
    const {pages,pageCount} = await scan(bytes,stage,source);
    const readable = pages.filter(page => page.readable).length;
    diagnosis.pages = pages;
    diagnosis.pageCount = pageCount;
    diagnosis.findings.push({
      severity:readable < pages.length ? 'warning' : 'info', title:`${readable} of ${pages.length} checked pages rendered`,
      detail:readable < pages.length ? 'Export can preserve the pages the renderer could open.' : 'Each checked page opened in the browser renderer.',
    });
    if (pageCount > pages.length) diagnosis.findings.push({
      severity:'warning',title:'Page check limit reached',detail:`Only the first ${MAX_PAGES} of ${pageCount} pages were checked.`,
    });
    if (readable) {
      if (source?.getPageCount() === pageCount) {
        diagnosis.options.push({
          id:'copy-pdf', title:'Rebuild selected pages',
          description:'Copy readable pages into a fresh PDF while preserving page-level text and vectors.',
        });
      } else {
        diagnosis.findings.push({severity:'info',title:'Page copying unavailable',detail:'The secondary PDF parser could not open this document for page copying.'});
      }
      diagnosis.options.push({id:'render-pdf',title:'Save page images as PDF',description:'Make a new PDF from the visible page previews.'});
      if (pages.some(page => page.text)) diagnosis.options.push({
        id:'extract-text',title:'Extract plain text',description:'Save selectable text found on the selected pages.',
      });
    }
  } catch (error) {
    diagnosis.findings.push({
      severity:'error',title:'The PDF could not be opened',
      detail:error instanceof Error ? error.message : 'The document parser rejected the file.',
    });
  }
}

export async function recoverPDF(
  file: File, bytes: Uint8Array<ArrayBuffer>, operation: Operation, selected: number[], stage: (status:string) => void,
): Promise<Output> {
  const source = await loadForCopy(bytes);
  const original = await scan(bytes,stage,source);
  const pages = original.pages.filter(page => page.readable && selected.includes(page.number));
  if (!pages.length || pages.length !== new Set(selected).size) throw new Error('Select pages that passed rendering.');
  const partial = pages.length < original.pageCount;
  if (operation === 'extract-text') {
    const extracted = pages.filter(page => page.text);
    if (!extracted.length) throw new Error('No selectable text was found on the selected pages.');
    const text = extracted.map(page => `Page ${page.number}\n\n${page.text}`).join('\n\n');
    const blob = new Blob([text],{type:'text/plain;charset=utf-8'});
    stage('Verifying extracted text');
    if (await blob.text() !== text) throw new Error('The text export could not be verified.');
    return {
      blob, name:outputName(file.name,'txt'), partial:true,
      checks:[`Verified UTF-8 text extracted from ${extracted.length} page(s).`],
      limitations:['Plain text omits layout and images. Pages without extractable text are omitted. Text extraction is limited to 200,000 characters per page.'],
    };
  }
  stage('Building a new PDF');
  const output = await PDFDocument.create();
  if (operation === 'copy-pdf') {
    if (!source || source.getPageCount() !== original.pageCount) throw new Error('The source could not be opened for page copying.');
    const copies = await output.copyPages(source,pages.map(page => page.number - 1));
    for (const page of copies) {
      // Exclude annotation actions, form widgets and links in reconstructed pages.
      page.node.delete(PDFName.of('Annots'));
      page.node.delete(PDFName.of('AA'));
      output.addPage(page);
    }
  } else if (operation === 'render-pdf') {
    for (const page of pages) {
      const image = await output.embedJpg(await page.image!.arrayBuffer());
      output.addPage([image.width,image.height]).drawImage(image,{x:0,y:0,width:image.width,height:image.height});
    }
  } else throw new Error('This operation does not apply to PDF files.');
  const saved = new Uint8Array(await output.save());
  const verified = await scan(saved, message => stage(`Verifying output · ${message}`));
  if (verified.pageCount !== pages.length || verified.pages.some(page => !page.readable)) {
    throw new Error('The saved PDF could not be reopened and rendered. Try saving page images instead.');
  }
  if (operation === 'copy-pdf' && verified.pages.some((page,index) => pages[index].text && page.text !== pages[index].text)) {
    throw new Error('Selectable text changed during page copying. Try saving page images instead.');
  }
  return {
    blob:new Blob([saved],{type:'application/pdf'}), name:outputName(file.name,'pdf'), partial,
    pages:verified.pages,
    checks:[`Reopened and rendered all ${pages.length} output page(s).`, `Source pages saved: ${pages.map(page => page.number).join(', ')}.`],
    limitations:[operation === 'copy-pdf'
      ? 'Page content is copied. Annotations, form widgets and document-level features such as bookmarks are excluded.'
      : 'Image-only PDF. Selectable text, links, annotations and forms are excluded. Page previews are rasterized at up to 960 px on the long edge.',
    ...(partial ? ['Unselected, unreadable and unchecked pages are excluded.'] : []),
    'Rendering checks do not establish fidelity to the original document.'],
  };
}
