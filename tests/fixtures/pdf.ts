import {PDFDocument,PDFName,PDFRawStream,StandardFonts} from 'pdf-lib';

export async function makePdfFixture(kind: 'healthy'|'marker-missing'|'unreadable-page'|'unparseable' = 'healthy') {
  const document = await PDFDocument.create({updateMetadata:false});
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const text of ['First page survives.','Second page contains useful text.']) {
    const page = document.addPage([360,480]);
    page.drawText(text,{x:24,y:420,size:17,font});
  }
  if (kind === 'unreadable-page') {
    const page = document.getPage(1);
    const dict = document.context.obj({Filter:'FlateDecode'});
    // This stream declares zlib compression but its payload cannot be inflated.
    const stream = PDFRawStream.of(dict,Uint8Array.of(0x00,0xff,0x00,0xff,0x07));
    page.node.set(PDFName.of('Contents'),document.context.register(stream));
  }
  const saved = await document.save({useObjectStreams:false});
  if (kind === 'marker-missing') return Buffer.from(saved.slice(0,-5));
  if (kind === 'unparseable') return Buffer.from(saved.slice(0,32));
  return Buffer.from(saved);
}
