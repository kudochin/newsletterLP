const { getStore } = require("@netlify/blobs");

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
    const { name, email, date, time, message } = JSON.parse(event.body);

    // Validate required fields
    if (!name || !email || !date || !time) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "名前、メールアドレス、日付、時間は必須です" }),
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

    const month = date.substring(0, 7); // "YYYY-MM"

    const availabilityStore = getStore({ name: "availability", siteID: "d2a3ebaa-7b96-4e48-8b25-ca615473749e", token: process.env.NETLIFY_API_TOKEN });
    const bookingsStore = getStore({ name: "bookings", siteID: "d2a3ebaa-7b96-4e48-8b25-ca615473749e", token: process.env.NETLIFY_API_TOKEN });

    // Check if the slot is actually available
    let availability = {};
    try {
      const data = await availabilityStore.get(month, { type: "json" });
      if (data) availability = data;
    } catch (e) {
      // pass
    }

    if (!availability[date] || !availability[date].includes(time)) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: "この時間枠は予約できません" }),
      };
    }

    // Check if already booked (prevent double booking — includes pending_payment)
    let bookings = {};
    try {
      const data = await bookingsStore.get(month, { type: "json" });
      if (data) bookings = data;
    } catch (e) {
      // pass
    }

    const existingBookings = bookings[date] || [];
    const conflicting = existingBookings.find((b) => b.time === time);

    if (conflicting) {
      // If it's a stale pending booking (>15 min old), remove it and allow rebooking
      const bookingAge = Date.now() - new Date(conflicting.createdAt).getTime();
      const FIFTEEN_MINUTES = 15 * 60 * 1000;

      if (conflicting.status === "pending_payment" && bookingAge > FIFTEEN_MINUTES) {
        // Remove stale pending booking
        bookings[date] = existingBookings.filter((b) => b.id !== conflicting.id);
        if (bookings[date].length === 0) delete bookings[date];
      } else {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "この時間枠はすでに予約されています。別の時間をお選びください。" }),
        };
      }
    }

    // Create the booking with pending_payment status
    const bookingId = `${date}-${time.replace(":", "")}-${Date.now()}`;
    const booking = {
      id: bookingId,
      name,
      email,
      date,
      time,
      message: message || "",
      status: "pending_payment",
      createdAt: new Date().toISOString(),
    };

    const updatedBookings = bookings[date] || [];
    updatedBookings.push(booking);
    bookings[date] = updatedBookings;

    // Save booking immediately
    await bookingsStore.setJSON(month, bookings);

    // Determine the site URL for redirects
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://rad-chebakia-a45187.netlify.app";

    // Try to create Stripe Checkout Session
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripePriceId = process.env.STRIPE_PRICE_ID;

    if (stripeSecretKey && stripePriceId) {
      // Dynamic require to avoid issues when stripe is not installed
      let Stripe;
      try {
        Stripe = require("stripe");
      } catch (e) {
        console.error("Stripe module not found:", e);
        // Fall back to non-Stripe flow
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, booking }),
        };
      }

      const stripe = Stripe(stripeSecretKey);

      // Format date for display
      const dateObj = new Date(date + "T00:00:00+09:00");
      const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      const dayOfWeek = dayNames[dateObj.getDay()];

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: email,
        success_url: `${siteUrl}/booking-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/booking.html?cancelled=true`,
        metadata: {
          booking_id: bookingId,
          booking_month: month,
          name,
          email,
          date,
          time,
          message: (message || "").substring(0, 500), // Stripe metadata limit
        },
        payment_intent_data: {
          description: `お試しオンライン相談 — ${formattedDate}（${dayOfWeek}）${time} — ${name}様`,
        },
        // Auto-expire the session after 30 minutes to release the slot
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          booking,
          checkoutUrl: session.url,
        }),
      };
    }

    // Stripe not configured — return success without payment
    // (for development/testing)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, booking }),
    };
  } catch (error) {
    console.error("Error creating booking:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "予約処理中にエラーが発生しました。時間を置いて再度お試しください。" }),
    };
  }
};
