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
    const { email, photo_data, displayFrameWidth, displayFrameHeight, devicePixelRatio } = req.body;

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

    // Load decorative assets early
    const witchPath = path.join(__dirname, '../public/images/Witch.png');
    const pumpkinPath = path.join(__dirname, '../public/images/Pumpkin.png');
    const ghostPath = path.join(__dirname, '../public/images/Floating ghost.png');

    const witchBuffer = fs.existsSync(witchPath) ? fs.readFileSync(witchPath) : null;
    const pumpkinBuffer = fs.existsSync(pumpkinPath) ? fs.readFileSync(pumpkinPath) : null;
    const ghostBuffer = fs.existsSync(ghostPath) ? fs.readFileSync(ghostPath) : null;

    // Resize decorative assets
    const witchResized = witchBuffer ? await sharp(witchBuffer).resize(150, 150, { fit: 'contain' }).png().toBuffer() : null;
    const pumpkinResized = pumpkinBuffer ? await sharp(pumpkinBuffer).resize(120, 120, { fit: 'contain' }).png().toBuffer() : null;
    const ghostResized = ghostBuffer ? await sharp(ghostBuffer).resize(100, 100, { fit: 'contain' }).png().toBuffer() : null;

    // Load gold frame asset
    const framePath = path.join(__dirname, '../public/images/gold frame.png');

    if (!fs.existsSync(framePath)) {
      return res.status(500).json({ success: false, error: 'Frame image not found on server.' });
    }

    const frameBuffer = fs.readFileSync(framePath);

    // Use client-provided display sizes for responsive sizing
    const clientDisplayFrameWidth = parseInt(displayFrameWidth, 10) || 400;
    const clientDisplayFrameHeight = parseInt(displayFrameHeight, 10) || 600;
    const dpr = Math.max(1, Number(devicePixelRatio) || 1);

    // Scale for DPR
    const scale = Math.min(Math.max(dpr, 1), 2);
    const finalFrameWidth = Math.round(clientDisplayFrameWidth * scale);
    const finalFrameHeight = Math.round(clientDisplayFrameHeight * scale);

    // Resize frame to final size
    const resizedFrameBuffer = await sharp(frameBuffer)
      .resize(finalFrameWidth, finalFrameHeight, { fit: 'contain' })
      .png()
      .toBuffer();

    // Process each photo frame (matching desktop html2canvas rendering)
    const processedImages = await Promise.all(
      photo_data.map(async (b64, index) => {
        const photoBuf = Buffer.from(b64, 'base64');

        // Calculate wrapper dimensions from frame size
        // Frame overlay is 140% width, 130% height of wrapper
        const wrapperWidth = Math.round(finalFrameWidth / 1.4);
        const wrapperHeight = Math.round(finalFrameHeight / 1.3);

        // Photo slot: 55% width, 92% height of wrapper, centered within frame (slightly wider)
        const photoWidth = Math.round(wrapperWidth * 0.55);
        const photoHeight = Math.round(wrapperHeight * 0.92);
        const photoLeft = Math.round((finalFrameWidth - photoWidth) / 2);
        const photoTop = Math.round((finalFrameHeight - photoHeight) / 2);

        const resizedPhoto = await sharp(photoBuf)
          .resize(photoWidth, photoHeight, { fit: 'cover' })
          .png()
          .toBuffer();

        // Create canvas with photo centered
        const photoCanvas = await sharp({
          create: {
            width: finalFrameWidth,
            height: finalFrameHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 0 } // White background for photo canvas to avoid black lines
          }
        })
          .composite([
            { input: resizedPhoto, top: photoTop, left: photoLeft }
          ])
          .png()
          .toBuffer();

        // Composite frame on top (assuming frame has transparent center)
        let frameWithPhoto = await sharp(photoCanvas)
          .composite([
            { input: resizedFrameBuffer, top: 0, left: 0 }
          ])
          .png()
          .toBuffer();

        // Add decorations on the frame
        let decorationComposites = [];
        if (index === 0 && witchResized) {
          decorationComposites.push({ input: witchResized, top: 10, left: finalFrameWidth - 160 });
        }
        if (index === 1 && pumpkinResized) {
          decorationComposites.push({ input: pumpkinResized, top: finalFrameHeight - 130, left: 10 });
        }
        if (index === 2 && ghostResized) {
          decorationComposites.push({ input: ghostResized, top: 20, left: 10 });
        }

        if (decorationComposites.length > 0) {
          frameWithPhoto = await sharp(frameWithPhoto)
            .composite(decorationComposites)
            .png()
            .toBuffer();
        }

        return frameWithPhoto;
      })
    );
    // Calculate minimal strip dimensions based on frames
    const stripWidth = finalFrameWidth;
    const stripHeight = finalFrameHeight * processedImages.length;

    let composites = processedImages.map((img, i) => ({
      input: img,
      top: i * finalFrameHeight,
      left: 0
    }));

    const finalStrip = await sharp({
      create: {
        width: stripWidth,
        height: stripHeight,
        channels: 4,
        background: { r: 26, g: 26, b: 26, alpha: 1 } // Dark background
      }
    })
      .composite(composites)
      .png()
      .toBuffer();

    // Prepare email attachment
    const attachment = {
      content: finalStrip.toString('base64'),
      filename: `halloween-photo-strip.png`,
      type: `image/png`,
      disposition: 'attachment'
    };

    const htmlContent = `
        <div style="font-family: 'Creepster', cursive; text-align: center; background: linear-gradient(135deg, #8B0000, #2D1B69); color: #ff9800; padding: 30px; border-radius: 15px; border: 3px solid #FF6B00; box-shadow: 0 0 30px rgba(255, 107, 0, 0.5);">
          <h1 style="font-size: 36px; color: #ffcc00; text-shadow: 4px 4px 0 #000; margin: 0;">Muso's Spooky Make-a-Snap</h1>
          <h2 style="color: #ffcc00; margin: 20px 0;">🎃 Your Spooky Photo Strip! 👻</h2>
          <p style="font-size: 18px;">Thanks for joining our Halloween fun! Your themed photo strip is attached below.</p>
          <p style="font-size: 16px;">🕸️ Stay spooky & have a fang-tastic night! 🦇</p>
          <div style="margin-top: 20px; font-size: 14px; color: #ccc;">
            <p>🧙‍♀️ Witches, pumpkins, and ghosts await your next visit!</p>
          </div>
        </div>
      `;

    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL,
        name: process.env.FROM_NAME || "Muso's Spooky Photobooth 🎃"
      },
      subject: "👻 Your Spooky Halloween Photobooth Strip!",
      content: [{ type: 'text/html', value: htmlContent }],
      attachments: [attachment]
    };

    await sgMail.send(msg);
    res.json({ success: true, message: 'Halloween email sent successfully!' });

  } catch (err) {
    console.error('❌ Email send failed:', err);
    if (err.response && err.response.body) {
      console.error('SendGrid error details:', err.response.body);
    }
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎃 Spooky server running on http://localhost:${PORT}`));
