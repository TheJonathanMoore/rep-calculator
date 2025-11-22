import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { file: base64File, filename, related_id, attachment_type, description } = body;

    console.log('Received send-to-zapier request');
    console.log('File type:', typeof base64File);
    console.log('File length:', base64File?.length);
    console.log('Related ID:', related_id);

    // Convert base64 data URL to clean base64 string
    let base64String = base64File;

    // Remove the "data:application/pdf;base64," prefix if present
    if (base64String.startsWith('data:')) {
      console.log('Removing data URL prefix...');
      base64String = base64String.split(',')[1];
    }

    console.log('Base64 string length after cleanup:', base64String?.length);

    // Convert base64 to Buffer
    const buffer = Buffer.from(base64String, 'base64');

    // Upload to Vercel Blob Storage
    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const blobPath = `scope-summaries/${timestamp}-${safeFilename}`;

    console.log('Uploading to Vercel Blob Storage:', blobPath);

    const blob = await put(blobPath, buffer, {
      contentType: 'application/pdf',
      access: 'public',
    });

    console.log('File uploaded to Blob Storage:', blob.url);

    // Prepare payload for Zapier with the public URL
    const zapierPayload = {
      file_url: blob.url,
      filename,
      related_id,
      attachment_type,
      description,
    };

    // Forward to Zapier webhook
    const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/24628620/u8ekbpf/';

    console.log('=====================================');
    console.log('SENDING TO ZAPIER WEBHOOK');
    console.log('=====================================');
    console.log('Webhook URL:', zapierWebhookUrl);
    console.log('Filename:', filename);
    console.log('Related ID (JNID):', related_id);
    console.log('Attachment Type:', attachment_type);
    console.log('Description:', description);
    console.log('File URL:', blob.url);
    console.log('=====================================');

    const response = await fetch(zapierWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zapierPayload),
    });

    console.log('Zapier webhook response status:', response.status);

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
      file_url: blob.url,
    });
  } catch (error) {
    console.error('Error sending to Zapier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send to Zapier' },
      { status: 500 }
    );
  }
}
