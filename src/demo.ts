export async function sampleFile() {
  const {PDFDocument,StandardFonts,rgb} = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const titles = ['Your files deserve a second chance.', 'A fresh start for readable pages.'];
  for (const title of titles) {
    const page = doc.addPage([540,680]);
    page.drawRectangle({x:0,y:575,width:540,height:105,color:rgb(0.91,0.89,1)});
    page.drawText('FILERESCUE STUDIO  /  SAMPLE DOCUMENT',{x:42,y:625,size:13,font,color:rgb(0.28,0.22,0.73)});
    page.drawText(title,{x:42,y:523,size:21,font});
    ['This sample was created locally in your browser.', 'The terminal marker is intentionally missing.', 'Use the workspace to diagnose and rebuild the PDF.'].forEach((line,index) => {
      page.drawText(line,{x:42,y:478-index*26,size:14,font,color:rgb(0.3,0.29,0.35)});
    });
  }
  const bytes = await doc.save({useObjectStreams:false});
  return new File([bytes.slice(0,-5)],'sample-document.pdf',{type:'application/pdf'});
}
