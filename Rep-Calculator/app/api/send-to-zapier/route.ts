import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { file: base64File, filename, related_id, attachment_type, description } = body;

    // Convert base64 data URL to buffer
    let base64String = base64File;

    // Remove the "data:application/pdf;base64," prefix if present
    if (base64String.startsWith('data:')) {
      base64String = base64String.split(',')[1];
    }

    const buffer = Buffer.from(base64String, 'base64');

    // Save to temp directory
    const tempDir = path.join(process.cwd(), 'tmp-pdfs');
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
    const filepath = path.join(tempDir, `${timestamp}_${safeFilename}`);

    await fs.writeFile(filepath, buffer);
    console.log(`PDF saved to: ${filepath}`);

    // Get the file URL (assuming the app is publicly accessible)
    // For local development, this might not work. You may need to use a cloud storage solution.
    const fileUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/get-pdf/${timestamp}/${safeFilename}`;

    // Prepare payload for Zapier with file URL instead of base64
    const zapierPayload = {
      file: fileUrl,
      filename,
      related_id,
      attachment_type,
      description,
    };

    // Forward to Zapier webhook
    const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/24628620/u8ekbpf/';

    console.log('Forwarding to Zapier webhook with file URL...');

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
        { error: `Zapier webhook failed: ${response.status}` },
        { status: response.status }
      );
    }

    console.log('Zapier webhook called successfully');

    return NextResponse.json({
      success: true,
      message: 'Document sent to JobNimbus via Zapier',
      fileUrl,
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
    const parts = pathname.split('/api/get-pdf/')[1].split('/');
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
