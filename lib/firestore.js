// firestore.js

// Load environment variables
require('dotenv').config();

const admin = require("firebase-admin");

// Log environment variables to check if they are loaded correctly
console.log("Firebase Project ID:", process.env.FIREBASE_PROJECT_ID);
console.log("Firebase Client Email:", process.env.FIREBASE_CLIENT_EMAIL);
console.log("Firebase Private Key:", process.env.FIREBASE_PRIVATE_KEY);

// Check if the required variables exist
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  throw new Error("Missing Firebase environment variables!");
}

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
} catch (error) {
  console.error('Firebase Initialization Error:', error);
}


const db = admin.firestore();
module.exports = db;
