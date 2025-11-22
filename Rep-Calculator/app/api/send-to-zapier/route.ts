import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { writeFile } from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { file: base64File, filename, related_id, attachment_type, description } = body;

    // Convert base64 data URL to clean base64 string
    let base64String = base64File;

    // Remove the "data:application/pdf;base64," prefix if present
    if (base64String.startsWith('data:')) {
      base64String = base64String.split(',')[1];
    }

    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'tmp-pdfs');
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch {
      console.log('Temp directory already exists or could not create');
    }

    // Save the PDF file temporarily
    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filepath = path.join(tempDir, `${timestamp}_${safeFilename}`);

    // Decode base64 to binary
    const binaryBuffer = Buffer.from(base64String, 'base64');
    await writeFile(filepath, binaryBuffer);

    console.log('PDF saved to:', filepath);

    // Create a public URL for the file - use environment variable for app URL
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const fileUrl = `${appUrl}/api/send-to-zapier/get-pdf/${timestamp}/${safeFilename}`;

    // Prepare payload for Zapier with file URL
    const zapierPayload = {
      file_url: fileUrl,
      filename,
      related_id,
      attachment_type,
      description,
    };

    // Forward to Zapier webhook
    const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/24628620/u8ekbpf/';

    console.log('Forwarding to Zapier webhook with file URL...');
    console.log('Filename:', filename);
    console.log('Related ID (JNID):', related_id);
    console.log('File URL:', fileUrl);
    console.log('Attachment Type:', attachment_type);
    console.log('Description:', description);

    const response = await fetch(zapierWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zapierPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Zapier webhook error:', errorText);
      return NextResponse.json(
        { error: `Zapier webhook failed: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    console.log('Zapier webhook called successfully');

    return NextResponse.json({
      success: true,
      message: 'Document sent to JobNimbus via Zapier',
      filename,
      related_id,
      file_url: fileUrl,
    });
  } catch (error) {
    console.error('Error sending to Zapier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send to Zapier' },
      { status: 500 }
    );
  }
}

// GET endpoint to serve the PDF
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;
    const parts = pathname.split('/api/send-to-zapier/get-pdf/')[1].split('/');
    const timestamp = parts[0];
    const safeFilename = parts.slice(1).join('/');

    const tempDir = path.join(process.cwd(), 'tmp-pdfs');
    const filepath = path.join(tempDir, `${timestamp}_${safeFilename}`);

    // Security: Ensure the file path is within the temp directory
    if (!filepath.startsWith(tempDir)) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 403 }
      );
    }

    const fileBuffer = await fs.readFile(filepath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
      },
    });
  } catch (error) {
    console.error('Error retrieving PDF:', error);
    return NextResponse.json(
      { error: 'PDF not found' },
      { status: 404 }
    );
  }
}
