const { Resend } = require("resend");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { name, email, age, message } = JSON.parse(event.body);

    // Validate required fields
    if (!name || !email || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "お名前、メールアドレス、ご相談内容は必須です" }),
      };
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "メールアドレスの形式が正しくありません" }),
      };
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const notifyEmail = process.env.NOTIFY_EMAIL || "kudochinpt@gmail.com";

    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "メール送信の設定に問題があります。しばらくしてから再度お試しください。" }),
      };
    }

    const resend = new Resend(resendApiKey);

    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = jstDate.toISOString().replace("T", " ").substring(0, 19);

    // Send notification email to admin
    await resend.emails.send({
      from: "Health Consulting <onboarding@resend.dev>",
      to: [notifyEmail],
      subject: `【メール相談】${name}様よりご相談がありました`,
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6BAF8D; border-bottom: 2px solid #A8D5BA; padding-bottom: 10px;">
            📩 新しいメール相談が届きました
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px; vertical-align: top;">お名前</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; vertical-align: top;">メールアドレス</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; vertical-align: top;">ご年齢</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">${age || "未回答"}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; vertical-align: top;">ご相談内容</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee; white-space: pre-wrap;">${message}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold; vertical-align: top;">受信日時</td>
              <td style="padding: 12px;">${dateStr} (JST)</td>
            </tr>
          </table>
          <p style="color: #888; font-size: 12px; margin-top: 20px;">
            ✅ 利用規約・免責事項に同意済み<br>
            このメールは Health Consulting のお問い合わせフォームから自動送信されました。
          </p>
        </div>
      `,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Error sending contact email:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "送信中にエラーが発生しました。時間を置いて再度お試しください。" }),
    };
  }
};
