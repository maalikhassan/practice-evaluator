import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const COUNTER_PROMPT =
  "You are a friendly filler word counter reviewing someone's speech. Speak directly to them in first person, like a real person giving feedback. Count every filler word (um, uh, like, you know, basically, literally, actually, right, okay, so). List each one with its count. Give a total. Keep it conversational and encouraging. Max 4 sentences.";

const GRAMMARIAN_PROMPT =
  "You are a warm grammar coach reviewing someone's speech transcript. Speak directly to them like a real person. Point out 2-3 specific grammar issues with friendly corrections, and mention what they did well. Be encouraging and specific. Max 5 sentences.";

const EVALUATOR_PROMPT =
  "You are an enthusiastic speech coach giving overall feedback. Speak directly to them like a real mentor. Comment on clarity, structure, vocabulary, and confidence. Give them a score out of 10 and 2 quick actionable tips. Be warm and motivating. Max 5 sentences.";

async function analyzeWithGroq(
  systemPrompt: string,
  transcript: string
): Promise<string> {
  const result = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcript },
    ],
  });
  return result.choices[0]?.message?.content ?? "No response generated.";
}

export async function POST(request: NextRequest) {
  try {
    const incomingFormData = await request.formData();
    const audio = incomingFormData.get("audio");

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "No audio file provided." },
        { status: 400 }
      );
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs API key is not configured." },
        { status: 500 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "Groq API key is not configured." },
        { status: 500 }
      );
    }

    const elevenLabsForm = new FormData();
    elevenLabsForm.append("model_id", "scribe_v1");
    elevenLabsForm.append("file", audio, "recording.webm");

    const sttResponse = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
        },
        body: elevenLabsForm,
      }
    );

    if (!sttResponse.ok) {
      const errorText = await sttResponse.text();
      return NextResponse.json(
        { error: `Speech-to-text failed: ${errorText}` },
        { status: 502 }
      );
    }

    const sttData = (await sttResponse.json()) as { text?: string };
    const transcript = sttData.text?.trim();

    if (!transcript) {
      return NextResponse.json(
        { error: "No speech was detected in the recording." },
        { status: 422 }
      );
    }

    const [counter, grammarian, evaluator] = await Promise.all([
      analyzeWithGroq(COUNTER_PROMPT, transcript),
      analyzeWithGroq(GRAMMARIAN_PROMPT, transcript),
      analyzeWithGroq(EVALUATOR_PROMPT, transcript),
    ]);

    return NextResponse.json({ transcript, counter, grammarian, evaluator });
  } catch (error) {
    console.error("Analyze route error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
