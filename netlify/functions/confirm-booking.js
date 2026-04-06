const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");

/**
 * Stripe Webhook Handler
 * Handles checkout.session.completed events to:
 * 1. Update booking status to "confirmed"
 * 2. Send confirmation email with Google Meet link
 * 3. Notify admin
 * 4. Add event to Google Calendar
 */
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    console.error("STRIPE_SECRET_KEY not configured");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  let stripeEvent;

  try {
    const Stripe = require("stripe");
    const stripe = Stripe(stripeSecretKey);

    // Verify webhook signature if secret is set
    if (stripeWebhookSecret) {
      const sig = event.headers["stripe-signature"];
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, stripeWebhookSecret);
    } else {
      // For development: parse without verification
      stripeEvent = JSON.parse(event.body);
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Webhook verification failed" }) };
  }

  // Only handle checkout.session.completed
  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
  }

  const session = stripeEvent.data.object;
  const metadata = session.metadata || {};

  const {
    booking_id: bookingId,
    booking_month: month,
    name,
    email,
    date,
    time,
    message,
  } = metadata;

  if (!bookingId || !month || !date || !time) {
    console.error("Missing booking metadata in Stripe session:", metadata);
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing booking metadata" }) };
  }

  try {
    const bookingsStore = getStore({ name: "bookings", siteID: "d2a3ebaa-7b96-4e48-8b25-ca615473749e", token: process.env.NETLIFY_API_TOKEN });

    // Update booking status to confirmed
    let bookings = {};
    try {
      const data = await bookingsStore.get(month, { type: "json" });
      if (data) bookings = data;
    } catch (e) {
      // pass
    }

    const dayBookings = bookings[date] || [];
    const bookingIndex = dayBookings.findIndex((b) => b.id === bookingId);

    if (bookingIndex >= 0) {
      dayBookings[bookingIndex].status = "confirmed";
      dayBookings[bookingIndex].stripeSessionId = session.id;
      dayBookings[bookingIndex].confirmedAt = new Date().toISOString();
      bookings[date] = dayBookings;
      await bookingsStore.setJSON(month, bookings);
    } else {
      console.error("Booking not found:", bookingId);
    }

    // Format date for email
    const dateObj = new Date(date + "T00:00:00+09:00");
    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dayOfWeek = dayNames[dateObj.getDay()];

    // ---- Google Calendar Integration ----
    let calendarEventCreated = false;
    try {
      const serviceAccountKeyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      const calendarId = process.env.GOOGLE_CALENDAR_ID;

      if (serviceAccountKeyStr && calendarId) {
        const { google } = require("googleapis");
        const serviceAccountKey = JSON.parse(serviceAccountKeyStr);

        const auth = new google.auth.JWT(
          serviceAccountKey.client_email,
          null,
          serviceAccountKey.private_key,
          ["https://www.googleapis.com/auth/calendar"]
        );

        const calendar = google.calendar({ version: "v3", auth });

        // Parse time to create start/end datetime
        const [hours, minutes] = time.split(":").map(Number);
        const startDate = new Date(dateObj);
        startDate.setHours(hours, minutes, 0, 0);

        // Session duration: 60 minutes
        const endDate = new Date(startDate);
        endDate.setMinutes(endDate.getMinutes() + 60);

        // Format as ISO string with timezone offset (+09:00)
        const formatJST = (d) => {
          const pad = (n) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+09:00`;
        };

        const calendarEvent = {
          summary: `【オンライン相談】${name}様`,
          description: [
            `■ お客様情報`,
            `名前: ${name}`,
            `メール: ${email}`,
            ``,
            `■ プラン`,
            `お試しオンライン相談（1回） ¥2,980`,
            ``,
            message ? `■ ご相談内容\n${message}` : "",
            ``,
            `■ Stripe Session ID`,
            session.id,
          ].filter(Boolean).join("\n"),
          start: {
            dateTime: formatJST(startDate),
            timeZone: "Asia/Tokyo",
          },
          end: {
            dateTime: formatJST(endDate),
            timeZone: "Asia/Tokyo",
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 30 },
              { method: "popup", minutes: 10 },
            ],
          },
        };

        await calendar.events.insert({
          calendarId: calendarId,
          resource: calendarEvent,
        });

        calendarEventCreated = true;
        console.log("Google Calendar event created successfully");
      } else {
        console.log("Google Calendar not configured (missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CALENDAR_ID)");
      }
    } catch (calErr) {
      console.error("Failed to create Google Calendar event:", calErr);
      // Don't fail the webhook — calendar is a nice-to-have
    }

    // ---- Send confirmation emails ----
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL || "kudochinpt@gmail.com";
    const meetingUrl = process.env.MEETING_URL || "（ビデオ通話URLは後日お送りします）";

    if (resendApiKey && email) {
      const resend = new Resend(resendApiKey);

      // Email to customer — with gratitude and meeting link
      try {
        await resend.emails.send({
          from: "Health Consulting <onboarding@resend.dev>",
          to: [email],
          subject: "【ご予約確定】オンライン相談のご予約ありがとうございます",
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1E2D3D;">
              <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="color: #1E2D3D; font-size: 18px; font-weight: 500; letter-spacing: 0.15em; margin-bottom: 4px;">HEALTH CONSULTING</h1>
                <p style="color: #8899A8; font-size: 12px;">かかりつけの理学療法士</p>
              </div>
              
              <div style="background: #F4F8FC; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
                <h2 style="color: #1E2D3D; font-size: 18px; margin-bottom: 16px; font-weight: 500;">ご予約・お支払いありがとうございます</h2>
                <p style="color: #4A5E70; line-height: 1.9; font-size: 14px;">
                  ${name}様<br><br>
                  この度はお試しオンライン相談にお申し込みいただき、誠にありがとうございます。<br>
                  以下の内容でご予約が確定いたしました。<br><br>
                  当日のご相談を楽しみにしております。<br>
                  お身体のお悩みについて、一緒に最善の方法を見つけていきましょう。
                </p>
              </div>

              <div style="border: 1px solid #DAE4ED; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                <h3 style="color: #5A9FCA; font-size: 14px; margin-bottom: 16px; letter-spacing: 0.05em;">ご予約内容</h3>
                <table style="width: 100%; font-size: 14px; color: #4A5E70;">
                  <tr>
                    <td style="padding: 10px 0; font-weight: 500; width: 100px; vertical-align: top;">プラン</td>
                    <td style="padding: 10px 0;">お試しオンライン相談（1回）</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: 500;">日時</td>
                    <td style="padding: 10px 0;">${formattedDate}（${dayOfWeek}） ${time}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: 500;">お名前</td>
                    <td style="padding: 10px 0;">${name}様</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: 500;">料金</td>
                    <td style="padding: 10px 0;">¥2,980（税込・お支払い済み）</td>
                  </tr>
                  ${message ? `
                  <tr>
                    <td style="padding: 10px 0; font-weight: 500; vertical-align: top;">ご相談内容</td>
                    <td style="padding: 10px 0;">${message.replace(/\n/g, "<br>")}</td>
                  </tr>
                  ` : ""}
                </table>
              </div>

              <div style="background: linear-gradient(135deg, #F0F7FF, #E0EFFF); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                <h3 style="color: #3D7FAD; font-size: 14px; margin-bottom: 12px;">🖥 ビデオ通話について</h3>
                <p style="color: #4A5E70; font-size: 14px; line-height: 1.8;">
                  当日は以下のリンクからご参加ください。<br>
                  <strong style="color: #3D7FAD;">
                    <a href="${meetingUrl}" style="color: #3D7FAD; text-decoration: underline;">${meetingUrl}</a>
                  </strong>
                </p>
                <p style="color: #8899A8; font-size: 12px; margin-top: 10px; line-height: 1.6;">
                  ※ Google Meetを使用します。ブラウザからそのまま参加可能です。<br>
                  ※ 開始5分前にはリンクにアクセスしてお待ちください。
                </p>
              </div>

              <div style="background: #FFF8F0; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #4A5E70; font-size: 13px; line-height: 1.8;">
                  ※ ご都合が悪くなった場合は、お早めにご連絡ください。<br>
                  ※ 動きやすい服装でご参加いただくと、動作チェックがスムーズです。
                </p>
              </div>

              <div style="text-align: center; padding-top: 24px; border-top: 1px solid #DAE4ED;">
                <p style="color: #8899A8; font-size: 11px; line-height: 1.6;">
                  Health Consulting — かかりつけの理学療法士<br>
                  このメールは自動送信されています。
                </p>
              </div>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("Failed to send customer email:", emailErr);
      }

      // Notification email to admin
      try {
        await resend.emails.send({
          from: "Health Consulting <onboarding@resend.dev>",
          to: [adminEmail],
          subject: `【予約が入りました！】${formattedDate}（${dayOfWeek}）${time} - ${name}様`,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1E2D3D;">🎉 予約が入りました！</h2>
              <p style="color: #4A5E70; font-size: 14px; line-height: 1.8;">
                決済が完了し、予約が確定しました。${calendarEventCreated ? "Googleカレンダーにも自動で追加されています。" : ""}
              </p>
              <table style="width: 100%; font-size: 14px; color: #4A5E70; border-collapse: collapse;">
                <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">日時</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formattedDate}（${dayOfWeek}） ${time}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">お名前</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">メール</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Stripe Session</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${session.id}</td></tr>
                ${message ? `<tr><td style="padding: 8px; font-weight: bold; vertical-align: top;">相談内容</td><td style="padding: 8px;">${message.replace(/\n/g, "<br>")}</td></tr>` : ""}
              </table>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("Failed to send admin email:", emailErr);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error("Error processing webhook:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
