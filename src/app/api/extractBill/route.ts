import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured in .env.local' }, { status: 500 });
    }

    // Convert file to base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Data = buffer.toString('base64');
    const mimeType = file.type;

    const prompt = `
      Extract the following details from this electricity bill:
      1. DISCOM Provider Name (e.g. BSES Yamuna, TATA Power Delhi, UPPCL, etc)
      2. Customer ID / Consumer Number / CA No.

      IMPORTANT: Return ONLY a raw JSON object string with exactly these two keys:
      {
        "discom": "extracted provider name or null",
        "customerId": "extracted customer id or null"
      }
      Do not include any extra text, markdown blocks, or greetings. Just the JSON object.
      Map the provider to a standardized name if possible (e.g., TATA Power Delhi, BSES Yamuna, BSES Rajdhani, UPPCL, BESCOM Bangalore).
    `;

    const genAI = new GoogleGenerativeAI(apiKey);
    // let model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    let model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let textPayload = '';

    try {
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        }
      ]);
      textPayload = result.response.text();
    } catch (primaryError) {
      console.warn('Primary model failed, falling back to gemini-pro. Error:', primaryError);
      // Fallback model
      // model = genAI.getGenerativeModel({ model: "gemini-pro" });
      model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const fallbackResult = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        }
      ]);
      textPayload = fallbackResult.response.text();
    }

    // Parse JSON
    let extracted;
    try {
      // Clean potential markdown blocks just in case
      const cleaned = textPayload.replace(/```json/gi, '').replace(/```/g, '').trim();
      extracted = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse Gemini output:', textPayload, parseError);
      extracted = { discom: null, customerId: null };
    }

    return NextResponse.json(extracted);

  } catch (error) {
    console.error('Error in extractBill API:', error);
    return NextResponse.json({ error: 'Internal server error processing the file' }, { status: 500 });
  }
}
