const { getStore } = require("@netlify/blobs");

function authenticate(event) {
  const authHeader = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return authHeader === adminPassword;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!authenticate(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "認証に失敗しました" }) };
  }

  try {
    const { date, time, month } = JSON.parse(event.body);

    if (!date || !time || !month) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "date, time, month are required" }),
      };
    }

    const bookingsStore = getStore({ name: "bookings", siteID: "d2a3ebaa-7b96-4e48-8b25-ca615473749e", token: process.env.NETLIFY_API_TOKEN });

    let bookings = {};
    try {
      const data = await bookingsStore.get(month, { type: "json" });
      if (data) bookings = data;
    } catch (e) {
      // pass
    }

    if (!bookings[date]) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "予約が見つかりません" }),
      };
    }

    const index = bookings[date].findIndex((b) => b.time === time);
    if (index === -1) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "予約が見つかりません" }),
      };
    }

    // Remove the booking
    const cancelled = bookings[date].splice(index, 1)[0];
    if (bookings[date].length === 0) {
      delete bookings[date];
    }

    await bookingsStore.setJSON(month, bookings);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, cancelled }),
    };
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
