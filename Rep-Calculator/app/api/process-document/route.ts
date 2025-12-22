import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Configure route to accept larger request bodies (20MB for large PDFs)
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for processing large documents

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const PARSING_PROMPT = `You are an expert insurance document parser for construction projects. Your job is to extract ALL scope items from insurance documents and organize them by trade with COMPLETE accuracy.

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE document carefully - do not skip any sections
2. Extract EVERY SINGLE line item, no matter how small
3. Look for items in tables, lists, appendices, and summary sections
4. Also extract the deductible amount if mentioned in the document
5. Extract insurance claim information:
   - Claim number (usually labeled "Claim #", "Claim Number", etc.)
   - Insurance claim adjuster name and email if available
6. Common trade categories include but are not limited to:
   - Roofing (tear-off, shingles, underlayment, ridge cap, valley metal, drip edge, ice & water shield, etc.)
   - Gutters & Downspouts (gutters, downspouts, end caps, miters, hangers, etc.)
   - Siding (removal, installation, trim, soffit, fascia, etc.)
   - Windows & Doors
   - Painting (exterior, interior, prep work, etc.)
   - Decking/Framing
   - Fencing
   - Miscellaneous/General Conditions (permits, dumpster, cleanup, supervision, etc.)

For each line item, extract:
1. Document Line Number (the original line item number from the document, e.g., "01", "02", "Line 1", etc.) - PRESERVE ORIGINAL NUMBERING FROM DOCUMENT
2. Quantity (number and unit, e.g., "120 LF", "45 SQ", "1 EA", "8 HR") - if no quantity listed, use "1 EA"
3. Description (the complete work description exactly as written)
4. RCV value (Replacement Cost Value in dollars - extract the number only, no symbols) - ALWAYS REQUIRED
5. ACV value (Actual Cash Value in dollars - extract DIFFERENT value if available in document, NOT the same as RCV)

IMPORTANT RCV vs ACV CLARIFICATION:
- RCV (Replacement Cost Value) = the cost to replace the item as new
- ACV (Actual Cash Value) = the RCV minus depreciation
- ACV is typically LOWER than RCV due to depreciation
- If document shows two different dollar amounts (one labeled RCV, one labeled ACV), extract both
- If document only shows one amount, use that for RCV and LEAVE ACV FIELD EMPTY (do not duplicate RCV value)
- Common patterns: RCV column and ACV column side-by-side, or two separate price lists, or depreciation percentages shown

PARSING GUIDELINES:
- If an item says "R&R" or "Remove and Replace", include the full description
- Include labor AND material line items separately if listed
- Extract unit prices and quantities separately (e.g., "10 SQ @ $350/SQ = $3,500" should show quantity "10 SQ")
- Look for subtotals and line items under each trade section
- Include allowances, overhead, profit if listed
- Don't combine line items - keep each separate
- Look for deductible information (typically stated as "$X deductible" or "Deductible: $X")
- DO NOT extract sales tax, material tax, or any tax-related line items - only extract actual work/material items

Output the result as a JSON object with this exact structure:

{
  "deductible": 0,
  "claimNumber": "",
  "claimAdjuster": {
    "name": "",
    "email": ""
  },
  "trades": [
    {
      "id": "unique-id-1",
      "name": "Roof",
      "checked": false,
      "supplements": [],
      "lineItems": [
        {
          "id": "unique-item-id-1",
          "documentLineNumber": "01",
          "quantity": "1 EA",
          "description": "Tear off existing shingles",
          "rcv": 2500.00,
          "acv": 1500.00,
          "checked": false,
          "notes": ""
        },
        {
          "id": "unique-item-id-2",
          "documentLineNumber": "02",
          "quantity": "45 SQ",
          "description": "Install GAF Timberline HDZ shingles",
          "rcv": 8500.00,
          "checked": false,
          "notes": ""
        }
      ]
    },
    {
      "id": "unique-id-2",
      "name": "Gutters",
      "checked": false,
      "supplements": [],
      "lineItems": [
        {
          "id": "unique-item-id-3",
          "documentLineNumber": "03",
          "quantity": "120 LF",
          "description": "Replace 5 inch K-style gutters",
          "rcv": 1200.00,
          "checked": false,
          "notes": ""
        }
      ]
    }
  ]
}

Important rules:
- All items should be checked: false by default (user will manually select items they want to include)
- Use descriptive trade names (capitalize properly: "Roofing", "Gutters & Downspouts", etc.)
- Parse RCV values carefully, removing any currency symbols or commas
- Deductible: Extract as a number (e.g., 2500), default to 0 if not found
- Generate unique IDs for trades and line items (use format: "trade-1", "trade-2", "item-1", "item-2", etc.)
- PRESERVE DOCUMENT LINE NUMBERS: Each line item MUST include its original document line number in "documentLineNumber" field
- PRESERVE DOCUMENT ORDER: Line items within each trade should be in the SAME ORDER as they appear in the original document
- Group related items logically by trade
- If you can't determine the trade, use "Miscellaneous" or "General Conditions"
- If the document has page numbers or references multiple pages, make sure to read ALL pages
- Return ONLY the JSON, no additional text or explanation
- COMPLETENESS IS CRITICAL: Extract every single line item from the document

DOUBLE-CHECK before returning:
- Did you read the entire document?
- Did you extract items from all sections/pages?
- Are all dollar amounts captured?
- Did you include small items like nails, caulking, cleanup, etc.?
- Did you find and extract the deductible amount?
- Did you find the claim number?
- Did you find the claim adjuster name and email?
- CRITICAL: Did you extract DIFFERENT ACV values (not matching RCV) for items where available in the document?
- If only one price was available per item, is ACV field omitted (not set equal to RCV)?
- CRITICAL: Did you exclude all sales tax, material tax, and tax-related line items? Extract only actual work/material items.
- CRITICAL: Did you include the documentLineNumber field for EVERY line item with the original document line number?
- CRITICAL: Are line items within each trade in the SAME ORDER as they appear in the original document?`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blobUrl, fileName } = body;

    if (!blobUrl || !fileName) {
      return NextResponse.json(
        { error: 'Missing blob URL or file name' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    // Fetch the file from blob storage
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch file from blob storage' },
        { status: 500 }
      );
    }

    // Convert blob to base64 for Gemini
    const arrayBuffer = await blobResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // Determine MIME type from blob response or default to PDF
    const mimeType = blobResponse.headers.get('content-type') || 'application/pdf';

    // Initialize Gemini model with JSON response mode
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType,
      },
    };

    // Send to Gemini for combined OCR + parsing
    const response = await model.generateContent([
      PARSING_PROMPT,
      imagePart,
    ]);

    const result = response.response.text();

    // Parse the JSON response with comprehensive cleaning
    let jsonString = result.trim();

    // Remove markdown code blocks if present
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```[a-z]*\n/i, '');
      jsonString = jsonString.replace(/\n```\s*$/, '');
    }

    jsonString = jsonString.trim();

    // Function to repair common JSON issues
    function repairJSON(str: string): string {
      let repaired = str;

      // Remove trailing commas before closing braces/brackets
      repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

      // Fix unescaped quotes in strings (common issue)
      // This is a simplified fix - matches strings and escapes internal quotes
      repaired = repaired.replace(/"([^"]*)"(\s*:\s*)"([^"]*)"/g, (match, key, colon, value) => {
        // Escape any unescaped quotes in the value
        const escapedValue = value.replace(/\\"/g, '\uffff').replace(/"/g, '\\"').replace(/\uffff/g, '\\"');
        return `"${key}"${colon}"${escapedValue}"`;
      });

      return repaired;
    }

    // Try to parse with progressive repair attempts
    let parsedResult;
    let lastError;

    // Attempt 1: Parse as-is with basic cleaning
    try {
      const cleaned = repairJSON(jsonString);
      parsedResult = JSON.parse(cleaned);
    } catch (parseError) {
      lastError = parseError;
      console.error('Attempt 1 failed:', parseError);

      // Attempt 2: Extract JSON object and retry
      try {
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = repairJSON(jsonMatch[0]);
          parsedResult = JSON.parse(extracted);
        } else {
          throw new Error('No JSON object found in response');
        }
      } catch (retryError) {
        lastError = retryError;
        console.error('Attempt 2 failed:', retryError);

        // Attempt 3: Ask Gemini to regenerate with stricter JSON requirement
        console.error('All parsing attempts failed. Raw response:', result);
        console.error('Cleaned JSON string (first 1000 chars):', jsonString.substring(0, 1000));

        throw new Error(
          `Failed to parse JSON response after multiple attempts: ${
            lastError instanceof Error ? lastError.message : 'Unknown error'
          }. The AI response may contain unescaped quotes or invalid JSON. Response preview: ${jsonString.substring(0, 500)}`
        );
      }
    }

    return NextResponse.json(parsedResult);
  } catch (error) {
    console.error('Gemini document processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to process document: ${errorMessage}` },
      { status: 500 }
    );
  }
}
