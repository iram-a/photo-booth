// Load environment variables from .env at the very top
require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();

// Increase payload size limit for images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());
app.use(express.static(__dirname));

// Debugging to make sure env variables are loaded
console.log('GMAIL_USER:', process.env.GMAIL_USER);
console.log('GMAIL_PASS:', process.env.GMAIL_PASS ? '***hidden***' : 'not set');

// SMTP Configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS // ← Use Gmail App Password here
    }
  });
};

// Serve the main HTML file for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'trial.html'));
});

app.post('/send-email', async (req, res) => {
  try {
    const { email, photo_data } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    console.log('Sending email to:', email);

    if (!photo_data) {
      return res.status(400).json({ success: false, error: 'No photo data provided' });
    }

    // Convert base64 to buffer
    const base64Data = photo_data.replace(/^data:image\/jpeg;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    console.log('Image size:', (imageBuffer.length / 1024 / 1024).toFixed(2), 'MB');

    const transporter = createTransporter();

    // Optional: verify transporter connection
    transporter.verify((error, success) => {
      if (error) console.error('Transporter verification failed:', error);
      else console.log('Transporter is ready to send emails');
    });

    const mailOptions = {
      from: `"Muso Photos" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Your Spooky Photo Strip from Muso's! 🎃",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff6b00; text-align: center;">Your Spooky Photo Strip from Muso's!</h2>
          <p style="font-size: 16px; color: #333;">
            Thanks for using our spooky photo booth! Your photo strip is attached to this email.
          </p>
          <p style="font-size: 16px; color: #333;">
            Keep it safe and share it with your friends! 👻
          </p>
          <div style="text-align: center; margin: 20px 0;">
            <div style="background: linear-gradient(135deg, #8B0000, #2D1B69); padding: 10px; border-radius: 10px; display: inline-block;">
              <p style="color: white; margin: 0; font-family: Arial; font-size: 18px;">
                Muso's Spooky Make-a-Snap
              </p>
            </div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'spooky-photo-strip.jpg',
          content: imageBuffer,
          contentType: 'image/jpeg'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send email. Please check your email configuration.' 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view your app`);
});
