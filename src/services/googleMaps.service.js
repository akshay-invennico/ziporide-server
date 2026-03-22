const { Client } = require('@googlemaps/google-maps-services-js');
const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const client = new Client({});

/**
 * Convert [lng, lat] coordinates to a "lat,lng" string that Google APIs expect.
 */
const _toLatLng = (coordinates) => `${coordinates[1]},${coordinates[0]}`;

/**
 * Get distance and duration between origin and destination using Google Distance Matrix API.
 * Supports intermediate waypoints (stops).
 *
 * @param {Object}   origin      - { coordinates: [lng, lat] }
 * @param {Object[]} stops       - array of { coordinates: [lng, lat] }
 * @param {Object}   destination - { coordinates: [lng, lat] }
 * @returns {Promise<{ distanceMiles: number, durationMinutes: number, distanceText: string, durationText: string }>}
 */
const getDistanceAndDuration = async (origin, stops = [], destination) => {
  // If there are stops we need to use Directions API with waypoints
  // to get the total route distance (Distance Matrix only does origin → destination)
  if (stops.length > 0) {
    return _getRouteWithWaypoints(origin, stops, destination);
  }

  // Simple origin → destination: use Distance Matrix API
  return _getSimpleDistance(origin, destination);
};

/**
 * Simple distance calculation between two points using Distance Matrix API.
 */
const _getSimpleDistance = async (origin, destination) => {
  try {
    console.log('API Key:', config.googleMaps.apiKey);
    console.log('Origin:', JSON.stringify(origin));
    console.log('Destination:', JSON.stringify(destination));
    const response = await client.distancematrix({
      params: {
        origins: [_toLatLng(origin.coordinates)],
        destinations: [_toLatLng(destination.coordinates)],
        mode: 'driving',
        units: 'imperial',
        key: config.googleMaps.apiKey,
      },
    });

    const result = response.data;

    if (result.status !== 'OK') {
      logger.error('Google Distance Matrix API error:', result.status);
      throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Unable to calculate route distance');
    }

    const element = result.rows[0].elements[0];

    if (element.status !== 'OK') {
      logger.error('Google Distance Matrix element error:', element.status);
      throw new ApiError(httpStatus.BAD_REQUEST, 'No route found between the selected locations');
    }

    // distance.value is in meters, duration.value is in seconds
    const distanceMiles = _round(_metersToMiles(element.distance.value));
    const durationMinutes = Math.round(element.duration.value / 60);

    return {
      distanceMiles,
      durationMinutes,
      distanceText: element.distance.text,
      durationText: element.duration.text,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('ACTUAL ERROR:', error.message);
    console.error('ERROR RESPONSE:', error.response?.status, error.response?.statusText);
    console.error('ERROR DATA:', JSON.stringify(error.response?.data));
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Unable to calculate route. Please try again.');
  }
};

/**
 * Route calculation with intermediate stops using Directions API.
 * Returns total distance and duration across all legs.
 */
const _getRouteWithWaypoints = async (origin, stops, destination) => {
  try {
    const waypoints = stops.map((stop) => _toLatLng(stop.coordinates));

    const response = await client.directions({
      params: {
        origin: _toLatLng(origin.coordinates),
        destination: _toLatLng(destination.coordinates),
        waypoints,
        optimize: false, // preserve stop order as rider specified
        mode: 'driving',
        units: 'imperial',
        key: config.googleMaps.apiKey,
      },
    });

    const result = response.data;

    if (result.status !== 'OK') {
      logger.error('Google Directions API error:', result.status);
      throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Unable to calculate route distance');
    }

    const route = result.routes[0];

    // Sum up all legs (origin → stop1, stop1 → stop2, ... → destination)
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;

    for (const leg of route.legs) {
      totalDistanceMeters += leg.distance.value;
      totalDurationSeconds += leg.duration.value;
    }

    const distanceMiles = _round(_metersToMiles(totalDistanceMeters));
    const durationMinutes = Math.round(totalDurationSeconds / 60);

    return {
      distanceMiles,
      durationMinutes,
      distanceText: `${distanceMiles} mi`,
      durationText: `${durationMinutes} mins`,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Google Maps Directions API request failed:', error.message);
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
    const response = await client.distancematrix({
      params: {
        origins: [_toLatLng(driverCoordinates)],
        destinations: [_toLatLng(pickupCoordinates)],
        mode: 'driving',
        units: 'imperial',
        key: config.googleMaps.apiKey,
      },
    });

    const element = response.data.rows[0].elements[0];

    if (element.status !== 'OK') {
      return { etaMinutes: 0, etaText: 'N/A', distanceMiles: 0 };
    }

    return {
      etaMinutes: Math.round(element.duration.value / 60),
      etaText: element.duration.text,
      distanceMiles: _round(_metersToMiles(element.distance.value)),
    };
  } catch (error) {
    logger.error('Google Maps ETA request failed:', error.message);
    return { etaMinutes: 0, etaText: 'N/A', distanceMiles: 0 };
  }
};

const _metersToMiles = (meters) => meters / 1609.344;
const _round = (val) => Math.round(val * 100) / 100;

module.exports = {
  getDistanceAndDuration,
  getETA,
};
