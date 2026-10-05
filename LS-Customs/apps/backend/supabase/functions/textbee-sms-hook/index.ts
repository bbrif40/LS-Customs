import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // Parse the Supabase auth hook payload
  const payload = await req.json()

  const { user, sms } = payload

  // OTP code provided by Supabase Auth
  const otpCode = sms.otp
  const phone = user.phone

  // Construct TextBee API request
  const apiKey = Deno.env.get("TEXTBEE_API_KEY")
  const deviceId = Deno.env.get("TEXTBEE_DEVICE_ID")

  if (!apiKey || !deviceId) {
    console.error("TextBee credentials missing.")
    return new Response(JSON.stringify({ error: "Configuration missing" }), { status: 500 })
  }

  const message = `Your LS Customs verification code is: ${otpCode}`

  try {
    const response = await fetch(
      `https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/sendSMS`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey
        },
        body: JSON.stringify({
          recipients: [phone],
          message: message
        })
      }
    )

    const data = await response.json()
    console.log("TextBee Response:", data)

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Failed to send SMS via TextBee", error)
    return new Response(JSON.stringify({ error: "Failed to send SMS" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
