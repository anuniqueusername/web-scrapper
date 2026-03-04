export async function POST(request) {
  try {
    // In a real scenario, this would trigger the actual scraper
    // For now, we'll return a success response

    const response = {
      success: true,
      message: 'Scraper run triggered successfully',
      timestamp: new Date().toISOString(),
    };

    return Response.json(response);
  } catch (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 }
    );
  }
}
