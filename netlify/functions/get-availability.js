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

    const availabilityStore = getStore("availability");
    const bookingsStore = getStore("bookings");

    // Get availability for the month
    let availability = {};
    try {
      const data = await availabilityStore.get(month, { type: "json" });
      if (data) availability = data;
    } catch (e) {
      // No availability set for this month
    }

    // Get bookings for the month
    let bookings = {};
    try {
      const data = await bookingsStore.get(month, { type: "json" });
      if (data) bookings = data;
    } catch (e) {
      // No bookings for this month
    }

    // Clean up stale pending bookings (older than 15 minutes)
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const now = Date.now();
    let bookingsModified = false;

    for (const [date, dateBookings] of Object.entries(bookings)) {
      const filtered = dateBookings.filter((b) => {
        if (b.status === "pending_payment") {
          const age = now - new Date(b.createdAt).getTime();
          if (age > FIFTEEN_MINUTES) {
            bookingsModified = true;
            return false; // Remove stale pending booking
          }
        }
        return true;
      });
      if (filtered.length !== dateBookings.length) {
        bookings[date] = filtered;
        if (filtered.length === 0) delete bookings[date];
      }
    }

    // Persist cleaned bookings if any were removed
    if (bookingsModified) {
      try {
        await bookingsStore.setJSON(month, bookings);
      } catch (e) {
        console.error("Failed to save cleaned bookings:", e);
      }
    }

    // Build response: for each date, show available slots minus booked/pending ones
    const result = {};
    for (const [date, slots] of Object.entries(availability)) {
      const bookedSlots = bookings[date] ? bookings[date].map((b) => b.time) : [];
      const availableSlots = slots.filter((slot) => !bookedSlots.includes(slot));
      if (availableSlots.length > 0) {
        result[date] = availableSlots;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ month, availability: result }),
    };
  } catch (error) {
    console.error("Error getting availability:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
