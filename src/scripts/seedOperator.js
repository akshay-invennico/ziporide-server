/**
 * Seed script to create the initial Super Admin operator.
 *
 * Usage:
 *   node src/scripts/seedOperator.js
 *
 * Environment variables (from .env):
 *   MONGODB_URL - MongoDB connection string
 *
 * This script is idempotent — it will not create a duplicate
 * if an operator with the same email already exists.
 */

const mongoose = require('mongoose');
const config = require('../config/config');
const Operator = require('../models/operator.model');
const { ALL_PERMISSIONS } = require('../config/permissions');

const SUPER_ADMIN = {
  name: 'Super Admin',
  email: 'admin@ziporide.com',
  password: 'Admin@1234',
  role: 'admin',
  permissions: ALL_PERMISSIONS,
  status: 'active',
};

const seed = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('Connected to MongoDB');

    const existing = await Operator.findOne({ email: SUPER_ADMIN.email });
    if (existing) {
      console.log(`Operator with email ${SUPER_ADMIN.email} already exists (ID: ${existing.operatorId}). Skipping.`);
    } else {
      const operator = await Operator.create(SUPER_ADMIN);
      console.log(`Super Admin created successfully!`);
      console.log(`  Operator ID : ${operator.operatorId}`);
      console.log(`  Email       : ${operator.email}`);
      console.log(`  Password    : ${SUPER_ADMIN.password}`);
      console.log(`  Role        : ${operator.role}`);
      console.log(`  Permissions : ${operator.permissions.length} granted`);
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
};

seed();
