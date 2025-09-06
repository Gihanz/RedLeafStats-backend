const { Resend } = require("resend");
const db = require("../lib/firestore");
const crypto = require("crypto");

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const { stream, dateIssued, scoreRange, invitationsIssued } = req.body;

  try {
    const snapshot = await db
      .collection("users")
      .where("consentToEmails", "==", true)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ message: "No subscribers found" });
    }

    const usersToNotify = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      if (!data.lastNotifiedOn || data.lastNotifiedOn !== dateIssued) {
        const unsubscribeToken = crypto.randomBytes(32).toString("hex");

        await db.collection("users").doc(doc.id).update({ unsubscribeToken });

        usersToNotify.push({
          id: doc.id,
          email: data.email,
          fullName: data.fullName,
          unsubscribeToken,
        });
      }
    }

    const promises = usersToNotify.map((user) =>
      resend.emails.send({
        from: "RedLeaf Stats <notify@redleafstats.com>",
        to: user.email,
        subject: `🍁 New OINP ${stream} Draw on ${dateIssued} 🍁`,
        text: `
Hi ${user.fullName},

A new OINP ${stream} draw has been published:

📌 Stream: ${stream}
📅 Date Issued: ${dateIssued}
🎯 Score Range: ${scoreRange}
📩 Invitations Issued: ${invitationsIssued}

You're receiving this email because you subscribed to draw alerts from RedLeaf Stats.

To unsubscribe or update your preferences, click here:
https://redleafstats.com/preferences?token=${user.unsubscribeToken}

Auto generated email by,  
🇨🇦 RedLeaf Stats
        `.trim(),
      })
    );

    await Promise.all(promises);

    for (const user of usersToNotify) {
      await db.collection("users").doc(user.id).update({
        lastNotifiedOn: dateIssued,
      });
    }

    res.status(200).json({ message: `Sent ${usersToNotify.length} OINP emails` });
  } catch (err) {
    console.error("❌ OINP email send error:", err.message);
    res.status(500).json({ error: "Failed to send OINP emails" });
  }
}
