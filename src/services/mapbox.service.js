const axios = require('axios');
const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const MAPBOX_DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';

/**
 * Build a "lng,lat" string that Mapbox expects (note: Mapbox uses lng,lat order).
 */
const _toCoordString = (coordinates) => `${coordinates[0]},${coordinates[1]}`;

/**
 * Get distance and duration between origin and destination using Mapbox Directions API.
 * Supports intermediate waypoints (stops).
 *
 * @param {Object}   origin      - { coordinates: [lng, lat] }
 * @param {Object[]} stops       - array of { coordinates: [lng, lat] }
 * @param {Object}   destination - { coordinates: [lng, lat] }
 * @returns {Promise<{ distanceMiles: number, durationMinutes: number, distanceText: string, durationText: string }>}
 */
const getDistanceAndDuration = async (origin, stops = [], destination) => {
  try {
    // Build waypoints string: origin;stop1;stop2;...;destination
    const waypoints = [origin, ...stops, destination].map((pt) => _toCoordString(pt.coordinates)).join(';');

    const response = await axios.get(`${MAPBOX_DIRECTIONS_URL}/${waypoints}`, {
      params: {
        access_token: config.mapbox.accessToken,
        geometries: 'geojson',
        overview: false,
      },
    });

    const data = response.data;

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      logger.error('Mapbox Directions API error:', data.code || 'No routes');
      throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Unable to calculate route distance');
    }

    const route = data.routes[0];

    // route.distance is in meters, route.duration is in seconds
    const distanceMiles = _round(_metersToMiles(route.distance));
    const durationMinutes = Math.round(route.duration / 60);

    return {
      distanceMiles,
      durationMinutes,
      distanceText: `${distanceMiles} mi`,
      durationText: `${durationMinutes} mins`,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Mapbox Directions API request failed:', error.message);
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Unable to calculate route. Please try again.');
  }
};

/**
 * Get ETA from a driver's location to a pickup point.
 * Used during dispatch to show "X min away" to the rider.
 *
 * @param {number[]} driverCoordinates - [lng, lat]
 * @param {number[]} pickupCoordinates - [lng, lat]
 * @returns {Promise<{ etaMinutes: number, etaText: string, distanceMiles: number }>}
 */
const getETA = async (driverCoordinates, pickupCoordinates) => {
  try {
    const waypoints = `${_toCoordString(driverCoordinates)};${_toCoordString(pickupCoordinates)}`;

    const response = await axios.get(`${MAPBOX_DIRECTIONS_URL}/${waypoints}`, {
      params: {
        access_token: config.mapbox.accessToken,
        geometries: 'geojson',
        overview: false,
      },
    });

    const data = response.data;

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return { etaMinutes: 0, etaText: 'N/A', distanceMiles: 0 };
    }

    const route = data.routes[0];

    return {
      etaMinutes: Math.round(route.duration / 60),
      etaText: `${Math.round(route.duration / 60)} mins`,
      distanceMiles: _round(_metersToMiles(route.distance)),
    };
  } catch (error) {
    logger.error('Mapbox ETA request failed:', error.message);
    return { etaMinutes: 0, etaText: 'N/A', distanceMiles: 0 };
  }
};

const _metersToMiles = (meters) => meters / 1609.344;
const _round = (val) => Math.round(val * 100) / 100;

module.exports = {
  getDistanceAndDuration,
  getETA,
};
