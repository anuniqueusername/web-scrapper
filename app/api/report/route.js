const DISCORD_WEBHOOK_URL =
  'https://discord.com/api/webhooks/1482059001603686512/gEkEYsWaSVnk6ga-hn4RXITsR7EQBN35S0LckTufDlToVHra6FiPCb641brdCEsCZFCF';

// 0xd8b4fe as a decimal integer for the Discord embed color field
const EMBED_COLOR = 14209278;

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, message } = body;

    // Validate all required fields
    if (!name || !name.trim()) {
      return Response.json(
        { success: false, message: 'Name is required.' },
        { status: 400 }
      );
    }
    if (!email || !email.trim()) {
      return Response.json(
        { success: false, message: 'Email is required.' },
        { status: 400 }
      );
    }
    if (!message || !message.trim()) {
      return Response.json(
        { success: false, message: 'Message is required.' },
        { status: 400 }
      );
    }

    const discordPayload = {
      embeds: [
        {
          title: '🐛 New Report Submitted',
          color: EMBED_COLOR,
          fields: [
            {
              name: 'Name',
              value: name.trim(),
              inline: true,
            },
            {
              name: 'Email',
              value: email.trim(),
              inline: true,
            },
            {
              name: 'Message',
              value: message.trim(),
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      console.error('Discord webhook error:', discordRes.status, errText);
      return Response.json(
        { success: false, message: 'Failed to send report to Discord.' },
        { status: 502 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Report route error:', error);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
