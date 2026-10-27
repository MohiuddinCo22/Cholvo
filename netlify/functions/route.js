
exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  try {
    const key = process.env.GEOAPIFY_API_KEY;

    if (!key) {
      throw new Error("Geoapify API key is not configured");
    }

    const origin = event.queryStringParameters?.origin?.trim();
    const destination =
      event.queryStringParameters?.destination?.trim();

    if (!origin || !destination) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Pickup and delivery addresses are required"
        })
      };
    }

    async function geocode(address) {
      const params = new URLSearchParams({
        text: address,
        filter: "countrycode:bd",
        limit: "1",
        apiKey: key
      });

      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/search?${params}`
      );

      if (!response.ok) {
        throw new Error("Address search failed");
      }

      const data = await response.json();
      const point = data.features?.[0];

      if (!point) {
        throw new Error("Address not found: " + address);
      }

      const [lon, lat] = point.geometry.coordinates;
      return { lat, lon };
    }

    const start = await geocode(origin);
    const end = await geocode(destination);

    const params = new URLSearchParams({
      waypoints:
        `${start.lat},${start.lon}|${end.lat},${end.lon}`,
      mode: "drive",
      apiKey: key
    });

    const response = await fetch(
      `https://api.geoapify.com/v1/routing?${params}`
    );

    if (!response.ok) {
      throw new Error("Road route could not be calculated");
    }

    const data = await response.json();
    const meters = data.features?.[0]?.properties?.distance;

    if (typeof meters !== "number") {
      throw new Error("Route distance was not returned");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        distanceKm: Math.round((meters / 1000) * 100) / 100
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: error.message || "Unable to calculate road distance"
      })
    };
  }
};
