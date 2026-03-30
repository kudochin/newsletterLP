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

  try {
    const availabilityStore = getStore("availability");

    if (event.httpMethod === "GET") {
      // Get availability for a month
      const month = event.queryStringParameters?.month;
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "month parameter required (format: YYYY-MM)" }),
        };
      }

      let availability = {};
      try {
        const data = await availabilityStore.get(month, { type: "json" });
        if (data) availability = data;
      } catch (e) {
        // No availability set
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ month, availability }),
      };
    }

    if (event.httpMethod === "POST") {
      // Set availability for a date
      const { month, date, slots } = JSON.parse(event.body);

      if (!month || !date || !Array.isArray(slots)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "month, date, slots are required" }),
        };
      }

      let availability = {};
      try {
        const data = await availabilityStore.get(month, { type: "json" });
        if (data) availability = data;
      } catch (e) {
        // pass
      }

      if (slots.length === 0) {
        delete availability[date];
      } else {
        availability[date] = slots;
      }

      await availabilityStore.setJSON(month, availability);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, availability }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("Error managing availability:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
