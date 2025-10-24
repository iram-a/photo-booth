require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const sharp = require('sharp');
const fs = require('fs');

const app = express();

app.use(express.json({ limit: '30mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.static(path.join(__dirname, '../public')));

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function isBase64(str) {
  try {
    const cleanStr = str.replace(/\s/g, '');
    return Buffer.from(cleanStr, 'base64').toString('base64') === cleanStr;
  } catch (e) {
    return false;
  }
}

app.post('/send-email', async (req, res) => {
  try {
    const { email, photo_data } = req.body;

    if (!email || !photo_data || !Array.isArray(photo_data) || photo_data.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing or invalid photo data' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    for (const img of photo_data) {
      if (!isBase64(img)) {
        return res.status(400).json({ success: false, error: 'Invalid base64 image data in array' });
      }
    }

    // Load your custom frame image
    const framePath = path.join(__dirname, '../public/images/image-removebg-preview (5).png');
    if (!fs.existsSync(framePath)) {
      return res.status(500).json({ success: false, error: 'Golden frame image not found on server.' });
    }
    const frameBuffer = fs.readFileSync(framePath);

    // Set desired width/height for each photo
    const width = 400;
    const height = 600;

    // Composite frame over each photo
    const processedImages = await Promise.all(
      photo_data.map(async (b64) => {
        // Resize photo
        const photoBuf = Buffer.from(b64, 'base64');
        const resizedPhoto = await sharp(photoBuf)
          .resize(width, height)
          .toBuffer();
        // Composite frame
        return await sharp(resizedPhoto)
          .composite([{ input: frameBuffer, top: 0, left: 0 }])
          .png()
          .toBuffer();
      })
    );

    // Stack vertically
    const strip = await sharp({
      create: {
        width: width,
        height: height * processedImages.length,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite(
        processedImages.map((img, i) => ({
          input: img,
          top: i * height,
          left: 0
        }))
      )
      .png()
      .toBuffer();

    const attachment = {
      content: strip.toString('base64'),
      filename: `photobooth-strip.png`,
      type: `image/png`,
      disposition: 'attachment'
    };

    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL,
        name: process.env.FROM_NAME || "Muso's Photobooth"
      },
      subject: "🎉 Your Photobooth Strip from Muso's!",
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center;">
          <h2 style="color: #ff6b00;">Your Photobooth Strip from Muso's!</h2>
          <p>Thanks for capturing the moment! Your photo strip is attached below.</p>
          <p>📸 Have fun!</p>
        </div>
      `,
      attachments: [attachment]
    };

    await sgMail.send(msg);
    res.json({ success: true, message: 'Email sent successfully!' });

  } catch (err) {
    console.error('❌ Email send failed:', err);
    if (err.response && err.response.body) {
      console.error('SendGrid error details:', err.response.body);
    }
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));