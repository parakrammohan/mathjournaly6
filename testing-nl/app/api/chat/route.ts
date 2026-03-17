import { NextResponse } from "next/server";

const fallbackMessages: Record<string, string> = {
  intro: "We will keep this quick. Start with your age range.",
  age: "What is your biological sex?",
  biologicalSex: "What listening device are you using for this test?",
  listeningDevice: "What phone model are you using?",
  phoneModel: "Do you have tinnitus?",
  tinnitus: "Now give your average music listening time per day.",
  listening: "How loud does your average day feel, on a scale from calm to noisy?",
  noise: "How often do you actively protect your ears when things get loud?",
  protection:
    "Place your phone 20 cm away from your ear in a quiet room, use max volume, then run the hearing checks.",
  complete: "All set. Submit the anonymous response whenever you are ready.",
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    step: string;
    summary?: string;
  };

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      message: fallbackMessages[body.step] ?? fallbackMessages.complete,
    });
  }

  const prompt = `
You are writing one short assistant message for an audio and hearing survey.
Tone: calm, natural, efficient, light.
Current step: ${body.step}
Known summary: ${body.summary ?? "none"}
Return plain text only. One or two sentences max. Ask the next question or guide the user into the next widget.
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Gemini request failed.");
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const message =
      data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ||
      fallbackMessages[body.step] ||
      fallbackMessages.complete;

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({
      message: fallbackMessages[body.step] ?? fallbackMessages.complete,
    });
  }
}
