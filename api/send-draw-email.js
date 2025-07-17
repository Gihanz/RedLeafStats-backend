const { Resend } = require('resend');
const admin = require('firebase-admin');

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const { drawname, drawdata, drawcrs, drawsize } = req.body;

  try {
    const snapshot = await admin.firestore()
      .collection('users')
      .where('subscribed', '==', true)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ message: 'No subscribers found' });
    }

    const usersToNotify = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data.notified || data.notified !== drawdata) {
        usersToNotify.push({ id: doc.id, email: data.email });
      }
    }

    const promises = usersToNotify.map(user => {
      return resend.emails.send({
        from: 'RedLeaf Stats <notify@redleafstats.com>',
        to: user.email,
        subject: `🆕 New IRCC Draw: ${drawname} on ${drawdata}`,
        text: `
Hello,

A new Express Entry draw has been published:

🔹 Draw Name: ${drawname}
📅 Draw Date: ${drawdata}
🎯 CRS Cut-off: ${drawcrs}
📩 Invitations Issued: ${drawsize}

You're receiving this because you subscribed to draw alerts.

To unsubscribe or update your preferences, click here:
https://redleafstats/preferences?id=${user.id}

- RedLeaf Stats
        `.trim()
      });
    });

    await Promise.all(promises);

    // Update notified field
    for (const user of usersToNotify) {
      await admin.firestore().collection('users').doc(user.id).update({
        notified: drawdata
      });
    }

    res.status(200).json({ message: `Sent ${usersToNotify.length} emails` });
  } catch (err) {
    console.error('❌ Email send error:', err.message);
    res.status(500).json({ error: 'Failed to send emails' });
  }
}
