require('dotenv').config();
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

sgMail.send({
  to: 'kamerkararyan3@gmail.com',
  from: process.env.FROM_EMAIL,
  subject: 'Test',
  text: 'Test email'
}).then(() => {
  console.log('Email sent');
}).catch((err) => {
  console.error('SendGrid error:', err.response ? err.response.body : err);
});