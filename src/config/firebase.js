const admin = require('firebase-admin');
const config = require('./config');
const logger = require('./logger');

let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  if (!config.firebase.projectId || !config.firebase.clientEmail || !config.firebase.privateKey) {
    logger.warn('Firebase credentials not configured — push notifications will be disabled');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
    logger.info('Firebase Admin SDK initialised');
    return firebaseApp;
  } catch (err) {
    logger.error(`Firebase initialisation failed: ${err.message}`);
    return null;
  }
};

const getMessaging = () => {
  if (!firebaseApp) initFirebase();
  if (!firebaseApp) return null;
  return admin.messaging();
};

module.exports = { initFirebase, getMessaging };
