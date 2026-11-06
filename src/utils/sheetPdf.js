const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * 화면에 그린 서류(node)를 A4 한 장 PDF(Blob)로 만듭니다. 내용이 A4보다 길면 한 장에 맞게 줄입니다.
 * 바깥 웹 글꼴은 가져오지 않습니다(skipFonts) — 서류는 시스템 명조체로 그립니다.
 */
export async function renderSheetPdf(node) {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const dataUrl = await toJpeg(node, { quality: 0.9, pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true });
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  let width = A4_WIDTH_MM;
  let height = (image.height * A4_WIDTH_MM) / image.width;
  if (height > A4_HEIGHT_MM) {
    width = (width * A4_HEIGHT_MM) / height;
    height = A4_HEIGHT_MM;
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pdf.addImage(dataUrl, 'JPEG', (A4_WIDTH_MM - width) / 2, 0, width, height);
  return pdf.output('blob');
}
