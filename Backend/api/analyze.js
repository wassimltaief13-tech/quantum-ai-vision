const OpenAI = require("openai");

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function allowedOrigin(req) {
  const configured = process.env.FRONTEND_ORIGIN || "";
  const origin = req.headers.origin || "";
  if (!configured) return origin || "*";
  return origin === configured ? origin : configured;
}

module.exports = async (req, res) => {
  const origin = allowedOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return send(res, 500, { error: "OPENAI_API_KEY غير مضبوط في Backend." });
  }

  try {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return send(res, 413, { error: "الصورة كبيرة جداً. الحد الأقصى 8MB." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const image = body?.image;
    const userPrompt = body?.prompt;

    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return send(res, 400, { error: "لم يتم إرسال صورة صالحة." });
    }

    if (image.length > MAX_BODY_BYTES * 1.4) {
      return send(res, 413, { error: "حجم الصورة بعد الترميز كبير جداً." });
    }

    const prompt = typeof userPrompt === "string" && userPrompt.trim()
      ? userPrompt
      : `حلل صورة الشارت بصرياً فقط. لا تخترع أي قيمة غير ظاهرة.
أخرج:
SIGNAL: CALL | PUT | NO TRADE
CONFIDENCE: 0-100%
MOMENTUM:
TREND:
FILTERS:
SUPPORT_RESISTANCE:
REASON:
RISK:
إذا كانت الصورة غير واضحة أو المعلومات غير كافية اختر NO TRADE وConfidence 0.`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-6-astra",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: image,
              detail: "low"
            }
          ]
        }
      ],
      max_output_tokens: 600
    });

    return send(res, 200, {
      output_text: response.output_text || "",
      model: process.env.OPENAI_MODEL || "gpt-6-astra"
    });
  } catch (error) {
    console.error(error);
    return send(res, 500, {
      error: error?.message || "حدث خطأ أثناء تحليل الصورة."
    });
  }
};
