const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { User, Driver } = require('../models');
const { tokenTypes } = require('../config/tokens');

/**
 * Socket.io middleware that validates the JWT token sent during handshake.
 *
 * The client must pass the token in one of two ways:
 *   1. socket.handshake.auth.token  (recommended)
 *   2. Authorization header: "Bearer <token>"
 *
 * On success, attaches to the socket:
 *   - socket.userId   (string)
 *   - socket.userRole ('driver' | 'rider')
 *   - socket.user     (Mongoose document)
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth.token ||
      (socket.handshake.headers.authorization || '').replace('Bearer ', '').trim();

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      return next(new Error('Authentication error: Invalid or expired token'));
    }

    if (payload.type !== tokenTypes.ACCESS) {
      return next(new Error('Authentication error: Invalid token type'));
    }

    // Try User (rider) first, then Driver — mirrors passport.js behaviour
    const user = await User.findById(payload.sub);
    if (user) {
      socket.userId = payload.sub;
      socket.userRole = 'rider';
      socket.user = user;
      return next();
    }

    const driver = await Driver.findById(payload.sub);
    if (driver) {
      socket.userId = payload.sub;
      socket.userRole = 'driver';
      socket.user = driver;
      return next();
    }

    return next(new Error('Authentication error: User not found'));
  } catch (err) {
    return next(new Error('Authentication error'));
  }
};

module.exports = { socketAuthMiddleware };
