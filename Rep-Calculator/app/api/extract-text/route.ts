import { NextRequest, NextResponse } from 'next/server';

interface ExtractionRequest {
  file: string; // base64 encoded file
  filename: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExtractionRequest;
    const { file: base64File, filename } = body;

    // Decode base64 to buffer
    let base64String = base64File;
    if (base64String.startsWith('data:')) {
      base64String = base64String.split(',')[1];
    }

    const fileBuffer = Buffer.from(base64String, 'base64');
    const isPDF = filename.toLowerCase().endsWith('.pdf');

    let extractedText = '';

    if (isPDF) {
      // For PDFs, extract text using pdfjs
      extractedText = await extractTextFromPDF(fileBuffer);
    } else {
      // For images, return a message that client-side OCR is needed
      return NextResponse.json({
        success: false,
        requiresOCR: true,
        message: 'Image files require client-side OCR processing',
      });
    }

    // Clean up the text
    const cleanedText = cleanExtractedText(extractedText);

    return NextResponse.json({
      success: true,
      text: cleanedText,
      filename,
      sourceType: 'pdf',
    });
  } catch (error) {
    console.error('Error extracting text:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract text' },
      { status: 500 }
    );
  }
}

async function extractTextFromPDF(
  buffer: Buffer
): Promise<string> {
  try {
    // Dynamically import pdfjs to avoid DOMMatrix issues at build time
    const pdfjs = await import('pdfjs-dist');

    // Set up the worker for pdfjs
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

    // Extract text from PDF using pdfjs
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    let fullText = '';
    let hasImages = false;

    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      fullText += pageText + '\n';

      // Check if page has images (scanned document indicator)
      const operatorList = await page.getOperatorList();
      if (operatorList.fnArray.includes(pdfjs.OPS.paintInlineImageXObject)) {
        hasImages = true;
      }
    }

    // If we got good text, return it
    if (fullText.trim().length > 100) {
      return fullText;
    }

    // If text is minimal, it might be a scanned PDF
    if (hasImages || fullText.trim().length < 100) {
      console.log('PDF contains scanned images. Client-side OCR may be needed.');
      return fullText || 'Unable to extract text from scanned PDF. Please use the image upload and OCR option.';
    }

    return fullText;
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    throw error;
  }
}

function cleanExtractedText(text: string): string {
  // Remove extra whitespace
  let cleaned = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // Remove control characters by filtering non-printable characters
  cleaned = cleaned.split('').filter((char) => {
    const code = char.charCodeAt(0);
    // Keep printable ASCII and common whitespace
    return (code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13;
  }).join('');

  cleaned = cleaned
    .replace(/([^\w\s\n\-$.])\1{3,}/g, '') // Remove repeated junk characters
    .replace(/\n{3,}/g, '\n\n'); // Remove excessive newlines

  return cleaned.trim();
}
