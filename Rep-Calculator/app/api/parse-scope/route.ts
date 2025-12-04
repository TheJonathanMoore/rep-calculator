import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an expert insurance document parser for construction projects. Your job is to extract ALL scope items from insurance documents and organize them by trade with COMPLETE accuracy.

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
1. Quantity (number and unit, e.g., "120 LF", "45 SQ", "1 EA", "8 HR") - if no quantity listed, use "1 EA"
2. Description (the complete work description exactly as written)
3. RCV value (Replacement Cost Value in dollars - extract the number only, no symbols) - ALWAYS REQUIRED
4. ACV value (Actual Cash Value in dollars - extract DIFFERENT value if available in document, NOT the same as RCV)

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
          "quantity": "1 EA",
          "description": "Tear off existing shingles",
          "rcv": 2500.00,
          "acv": 1500.00,
          "checked": false,
          "notes": ""
        },
        {
          "id": "unique-item-id-2",
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
- CRITICAL: Did you exclude all sales tax, material tax, and tax-related line items? Extract only actual work/material items.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const text = formData.get('text') as string | null;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text content is required' },
        { status: 400 }
      );
    }

    const extractedText = text;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please parse this insurance document and extract the scope items.\n\n${extractedText}`,
        },
      ],
    });

    const result = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // Strip markdown code blocks if present (more robust approach)
    let jsonString = result.trim();

    // Remove markdown code blocks with any language identifier
    if (jsonString.startsWith('```')) {
      // Remove opening ``` and everything until newline
      jsonString = jsonString.replace(/^```[a-z]*\n/i, '');
      // Remove closing ```
      jsonString = jsonString.replace(/\n```\s*$/, '');
    }

    // Parse the JSON response
    const parsedResult = JSON.parse(jsonString.trim());

    return NextResponse.json(parsedResult);
  } catch (error) {
    console.error('Error parsing insurance document:', error);

    // Provide more specific error messages
    let errorMessage = 'Failed to parse insurance document';

    if (error instanceof Error) {
      if (error.message.includes('429') || error.message.includes('rate_limit')) {
        errorMessage = 'API rate limit reached. Please wait a moment and try again.';
      } else if (error.message.includes('Unexpected token')) {
        errorMessage = 'Unable to parse the AI response. Please try again or use the text input method.';
      } else if (error.message.includes('No text could be extracted') || error.message.includes('Failed to extract text')) {
        errorMessage = error.message; // Use the specific PDF extraction error
      } else {
        errorMessage = `Error: ${error.message}`;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
