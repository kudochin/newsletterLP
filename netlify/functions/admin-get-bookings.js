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

  if (!authenticate(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "認証に失敗しました" }) };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const month = event.queryStringParameters?.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "month parameter required (format: YYYY-MM)" }),
      };
    }

    const bookingsStore = getStore({ name: "bookings", siteID: "d2a3ebaa-7b96-4e48-8b25-ca615473749e", token: process.env.NETLIFY_API_TOKEN });

    let bookings = {};
    try {
      const data = await bookingsStore.get(month, { type: "json" });
      if (data) bookings = data;
    } catch (e) {
      // No bookings
    }

    // Flatten bookings into a list
    const bookingList = [];
    for (const [date, dateBookings] of Object.entries(bookings)) {
      for (const booking of dateBookings) {
        bookingList.push({ ...booking, date });
      }
    }

    // Sort by date and time
    bookingList.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ month, bookings: bookingList }),
    };
  } catch (error) {
    console.error("Error getting bookings:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
