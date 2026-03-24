# ZipoRide - Ride Flow Documentation

This document explains the complete ride flow in the ZipoRide taxi booking application — from the moment a rider opens the app to when the ride is completed and rated. It also covers the payment flow, real-time tracking, and every API and socket event involved.

---

## Table of Contents

- [High-Level Flow](#high-level-flow)
- [Ride Statuses](#ride-statuses)
- [Step-by-Step Ride Flow](#step-by-step-ride-flow)
  - [1. Rider Gets Ride Options (API)](#1-rider-gets-ride-options-api)
  - [2. Rider Creates a Ride (API)](#2-rider-creates-a-ride-api)
  - [3. System Finds Nearby Drivers (Internal)](#3-system-finds-nearby-drivers-internal)
  - [4. System Sends Ride Request to Driver (Socket)](#4-system-sends-ride-request-to-driver-socket)
  - [5. Driver Accepts or Declines (Socket / API)](#5-driver-accepts-or-declines-socket--api)
  - [6. Real-Time Driver Tracking (Socket)](#6-real-time-driver-tracking-socket)
  - [7. Driver Arrives at Pickup (Socket / API)](#7-driver-arrives-at-pickup-socket--api)
  - [8. Ride Starts — OTP Verification (Socket / API)](#8-ride-starts--otp-verification-socket--api)
  - [9. Ride Completes (Socket / API)](#9-ride-completes-socket--api)
  - [10. Rider Rates the Driver (API)](#10-rider-rates-the-driver-api)
  - [11. Ride Cancellation (API)](#11-ride-cancellation-api)
- [No Drivers Found — Retry Flow](#no-drivers-found--retry-flow)
- [Nearby Drivers on Map](#nearby-drivers-on-map)
- [Restoring App State — Current Ride API](#restoring-app-state--current-ride-api)
- [Driver Side — Going Online/Offline](#driver-side--going-onlineoffline)
- [Payment Flow](#payment-flow)
- [Fare Calculation](#fare-calculation)
- [API Endpoints Reference](#api-endpoints-reference)
- [Socket Events Reference](#socket-events-reference)
- [Cancellation Reasons Reference](#cancellation-reasons-reference)
- [Key Files](#key-files)
- [Production Risks & Suggestions](#production-risks--suggestions)

---

## High-Level Flow

```
Rider opens app
    │
    ▼
GET ride options (API) ──► Shows available cars with estimated fares
    │
    ▼
CREATE ride (API) ──► Ride saved in DB with status "searching"
    │                  Payment hold placed on rider's card (Stripe)
    │                  4-digit pickup OTP generated
    │
    ▼
DISPATCH starts (Internal) ──► Finds nearby drivers sorted by distance
    │
    ▼
Send request to Driver #1 (Socket) ──► 15 second timer starts
    │
    ├── Driver accepts (Socket) ──► Ride status → "driver_allocated"
    │       │                        Rider notified via Socket (with driver details + ETA)
    │       │
    │       │   [Real-time driver location + ETA updates via Socket]
    │       │
    │       ▼
    │   Driver arrives ──► Ride status → "driver_arrived"
    │       │                Rider notified via Socket
    │       │
    │       ▼
    │   Rider shows 4-digit OTP to driver
    │       │
    │       ▼
    │   OTP verified, ride starts ──► Ride status → "in_progress"
    │       │                          Rider notified via Socket
    │       │
    │       ▼
    │   Ride completes ──► Ride status → "completed"
    │       │                Payment captured from card (Stripe)
    │       │                Rider notified via Socket
    │       │
    │       ▼
    │   Rider rates driver (API)
    │
    ├── Driver declines (Socket) ──► Try Driver #2 → Driver #3 → ...
    │
    └── Driver doesn't respond (15s timeout) ──► Try next driver
            │
            └── All drivers exhausted ──► Ride status → "no_drivers"
                                          Rider notified via Socket
                                          Rider can tap "Try Again" to retry
```

---

## Ride Statuses

| Status              | Meaning                                                        | What the rider sees               |
| ------------------- | -------------------------------------------------------------- | --------------------------------- |
| `searching`         | Ride created, looking for a driver                             | "Finding your driver" spinner     |
| `driver_allocated`  | A driver accepted the ride and is heading to the pickup        | Driver details, ETA, OTP, map     |
| `driver_arrived`    | Driver has arrived at the pickup location                      | "Driver has arrived" notification |
| `in_progress`       | Ride is ongoing (OTP verified, rider is in the car)            | Live trip tracking on map         |
| `completed`         | Ride finished successfully, payment captured                   | Receipt / fare summary            |
| `cancelled`         | Ride was cancelled by rider or driver                          | Cancellation confirmation         |
| `no_drivers`        | No available drivers were found in the area                    | "No Drivers Available" screen     |

---

## Step-by-Step Ride Flow

### 1. Rider Gets Ride Options (API)

**Endpoint:** `POST /v1/ride/options`

Before booking, the rider sees available vehicle types with estimated fares. This is the "Choose Your Ride" screen.

**What happens internally:**
1. Rider sends pickup location, destination, and optional stops (up to 5)
2. Server calls **Mapbox Directions API** to get the real route distance (in miles) and duration (in minutes)
3. Server fetches all active **vehicle categories** from the database (e.g. Standard, XL, Executive, Electric)
4. For each category, it calculates the estimated fare using the category's pricing (see [Fare Calculation](#fare-calculation))
5. Returns an array of ride options — each with the vehicle type, seat capacity, estimated fare, distance, and duration

**Request body:**
```json
{
  "pickup": { "coordinates": [-0.1278, 51.5074], "address": "65 Cheapside, London" },
  "destination": { "coordinates": [-0.1426, 51.5014], "address": "48 Notting Hill Gate, London" },
  "stops": [],
  "isAirportRide": false
}
```

**Files involved:**
- `src/controllers/ride.controller.js` → `getRideOptions()`
- `src/services/pricing.service.js` → `getRideOptions()`
- `src/services/mapbox.service.js` → `getDistanceAndDuration()`

---

### 2. Rider Creates a Ride (API)

**Endpoint:** `POST /v1/ride`

Rider selects a vehicle category and confirms the booking. This triggers the entire ride flow.

**What happens internally (in order):**
1. **Check for active ride** — if the rider already has a ride in `searching`, `driver_allocated`, `driver_arrived`, or `in_progress`, the request is blocked. A rider can only have one active ride at a time.
2. **Validate vehicle category** — checks the selected category exists and is active
3. **Calculate route** — calls Mapbox Directions API to get fresh distance and duration
4. **Calculate fare** — computes the full fare breakdown (base + distance + time + surge)
5. **Validate payment method** — a saved card is required to book
6. **Save ride to database** — status is set to `searching`, a unique ride number is generated (format: `ZR-{timestamp}-{random}`)
7. **Generate pickup OTP** — a random 4-digit code (e.g. `4721`) that the rider will show to the driver later
8. **Authorize payment (Stripe)** — places a hold on the rider's card for the estimated fare amount. The card is not charged yet — just a hold. If the card authorization fails, the ride is deleted and an error is returned.
9. **Start driver dispatch asynchronously** — the system begins searching for nearby drivers in the background. The API responds immediately so the rider is not kept waiting.

**Request body:**
```json
{
  "pickup": { "coordinates": [-0.1278, 51.5074], "address": "65 Cheapside, London" },
  "destination": { "coordinates": [-0.1426, 51.5014], "address": "48 Notting Hill Gate, London" },
  "stops": [],
  "categoryId": "60f7b2c4e1b1c8a4d8e4f123",
  "paymentMethod": "60f7b2c4e1b1c8a4d8e4f456",
  "isAirportRide": false
}
```

**Response:** The full ride object with status `searching` and a `pickupOtp` (shown to the rider in the app).

**Files involved:**
- `src/controllers/ride.controller.js` → `createRide()`
- `src/services/ride.service.js` → `createRide()`
- `src/services/mapbox.service.js` → `getDistanceAndDuration()`
- `src/services/payment.service.js` → `authorizeRidePayment()`

---

### 3. System Finds Nearby Drivers (Internal)

This happens automatically after ride creation. No API call needed — it's triggered internally by the dispatch service.

**What happens:**
1. Queries the `Driver` collection using MongoDB's `$nearSphere` geospatial query
2. **Search radius:** 10 km from the pickup point
3. **Filters drivers by:**
   - `isOnline: true` — must be online and available
   - `status: 'approved'` — account must be approved by admin
   - `isSubscribed: true` — must have an active ZipoRide subscription
   - `isBankLinked: true` — must have a bank account linked for payouts
   - Matching `vehicle.type` — must drive the type of vehicle the rider selected (e.g. standard, xl, electric)
4. **Excludes drivers** who already have a ride in `driver_allocated`, `driver_arrived`, or `in_progress` (busy drivers)
5. Results are sorted by distance — **nearest driver first**
6. If **no drivers found** → ride status is set to `no_drivers`, and the rider gets a `ride:no_drivers_available` socket event

**Files involved:**
- `src/services/dispatch.service.js` → `findNearbyDrivers()`, `startDispatch()`

---

### 4. System Sends Ride Request to Driver (Socket)

The system goes through the driver queue **one at a time** (not broadcast to all drivers). This ensures only one driver at a time can accept the ride.

**What happens:**
1. Pick the nearest eligible driver from the queue
2. Check if this driver is already receiving a request for another ride — if yes, skip to the next driver
3. Verify the driver is still online (they may have gone offline since the query) — if not, skip
4. **Send socket event** `ride:new_request` to the driver's private room (`user:<driverId>`) with full ride details (pickup, destination, fare, rider info)
5. Start a **15-second countdown timer**
6. If the timer expires with no response:
   - Send `ride:request_expired` event to that driver
   - Move to the next driver in the queue
   - If all drivers in the queue have been tried → set ride status to `no_drivers` and notify the rider

**Socket event sent to driver:**
```
Event: "ride:new_request"
Data: {
  ride: { pickup, destination, stops, fare, rider info, etc. },
  timeoutSeconds: 15
}
```

**Files involved:**
- `src/services/dispatch.service.js` → `dispatchToNext()`

---

### 5. Driver Accepts or Declines (Socket / API)

The driver can respond in **two ways** — via Socket (real-time, primary) or via REST API (fallback).

#### Option A: Via Socket (primary)

**Accept:**
```
Event: "driver:accept_ride"
Payload: { rideId: "..." }
```

**Decline:**
```
Event: "driver:decline_ride"
Payload: { rideId: "..." }
```

#### Option B: Via REST API (fallback)

- `POST /v1/driver/rides/:rideId/accept`
- `POST /v1/driver/rides/:rideId/decline`

#### What happens on ACCEPT:
1. Validates this driver is the one currently being offered the ride (prevents race conditions)
2. Clears the 15-second timer
3. Double-checks the ride is still in `searching` status (it could have been cancelled while waiting)
4. Updates the ride: `status → driver_allocated`, assigns the driver, records `driverAllocatedAt` timestamp
5. **Calculates ETA** — calls Mapbox to get the estimated time from the driver's current location to the pickup point (e.g. "3 min")
6. **Sends socket event to rider:** `ride:driver_assigned` with:
   - Full ride details
   - Driver details: name, phone, photo, vehicle (make, model, colour, registration), rating, total trips
   - Driver's current GPS location
   - ETA to pickup (e.g. `{ etaMinutes: 3, etaText: "3 mins" }`)

#### What happens on DECLINE:
1. Clears the timer
2. Removes the driver from the "pending request" set
3. Immediately tries the next driver in the queue

#### What happens on DISCONNECT (driver goes offline mid-offer):
- Treated as a decline — the next driver in the queue is tried immediately

**Files involved:**
- `src/services/dispatch.service.js` → `handleDriverAccept()`, `handleDriverDecline()`, `handleDriverDisconnect()`
- `src/socket/handlers/driver.js` → socket event handlers
- `src/controllers/driverRide.controller.js` → REST API handlers
- `src/services/mapbox.service.js` → `getETA()`

---

### 6. Real-Time Driver Tracking (Socket)

Once a driver accepts the ride, the rider can see the driver's location moving on the map in real time.

**How it works:**
1. The driver's app sends `driver:update_location` events periodically (every 5-10 seconds) with their current GPS coordinates
2. The server updates the driver's location in the database
3. If the driver has an active ride, the server broadcasts a `ride:driver_location` event to the rider
4. While the ride status is `driver_allocated` (driver is heading to pickup), the server also calculates and includes an **updated ETA** from the driver's current position to the pickup point
5. The rider's app uses this data to show the driver's car moving on the map and update the "arriving in X min" text

**Socket event sent to rider:**
```
Event: "ride:driver_location"
Data: {
  rideId: "...",
  location: { latitude: 51.5074, longitude: -0.1278 },
  eta: { etaMinutes: 2, etaText: "2 mins", distanceMiles: 0.5 }  // null after driver arrives
}
```

**Note:** ETA is only calculated while the driver is heading to the pickup (`driver_allocated` status). Once the driver has arrived or the ride is in progress, `eta` will be `null` to avoid unnecessary API calls.

**Files involved:**
- `src/socket/handlers/driver.js` → `driver:update_location` handler
- `src/services/mapbox.service.js` → `getETA()`

---

### 7. Driver Arrives at Pickup (Socket / API)

When the driver reaches the pickup location, they mark their arrival in the app.

**Via Socket:**
```
Event: "driver:arrived"
Payload: { rideId: "..." }
```

**Via REST API:**
`POST /v1/driver/rides/:rideId/arrived`

**What happens:**
1. Validates the driver is the one assigned to this ride
2. Checks the ride status is `driver_allocated` (can only arrive if heading to pickup)
3. Updates ride status from `driver_allocated` → `driver_arrived`
4. Records the `driverArrivedAt` timestamp
5. **Sends socket event to rider:** `ride:driver_arrived` — the rider sees a notification that their driver has arrived

**Files involved:**
- `src/services/ride.service.js` → `driverArrived()`
- `src/socket/handlers/driver.js` → `driver:arrived` handler
- `src/controllers/driverRide.controller.js` → `arrivedAtPickup()`

---

### 8. Ride Starts — OTP Verification (Socket / API)

When the driver arrives and the rider gets in the car, the driver needs to verify the rider's identity using the OTP before starting the trip.

**How it works:**
1. The rider's app displays a **4-digit OTP** (e.g. `4 7 2 1`) on their screen — this was generated when the ride was created
2. The rider shows or tells this OTP to the driver
3. The driver enters the OTP in their app
4. The server checks if the OTP matches

**Via Socket:**
```
Event: "driver:verify_otp"
Payload: { rideId: "...", otp: "4721" }
```

**Via REST API:**
`POST /v1/driver/rides/:rideId/verify/otp` with body `{ otp: "4721" }`

**What happens on correct OTP:**
1. Ride status changes from `driver_arrived` → `in_progress`
2. `startedAt` timestamp is recorded
3. **Sends socket event to rider:** `ride:started` — the rider sees "Your ride has started"
4. The trip is now officially in progress

**What happens on wrong OTP:**
- The driver gets an error message: "Invalid OTP. Please check and try again."
- The ride stays in `driver_arrived` status — the driver can retry

**Files involved:**
- `src/services/ride.service.js` → `verifyOtpAndStartRide()`
- `src/socket/handlers/driver.js` → `driver:verify_otp` handler
- `src/controllers/driverRide.controller.js` → `verifyOtp()`

---

### 9. Ride Completes (Socket / API)

When the driver reaches the destination and the rider gets out, the driver marks the ride as complete.

**Via Socket:**
```
Event: "driver:complete_ride"
Payload: { rideId: "..." }
```

**Via REST API:**
`POST /v1/driver/rides/:rideId/complete`

**What happens:**
1. Validates the ride is currently `in_progress`
2. Ride status changes from `in_progress` → `completed`
3. `completedAt` timestamp is recorded
4. **Payment is captured (Stripe)** — the hold that was placed on the rider's card at booking is now captured. The actual fare amount is charged. If the actual fare is less than the estimated hold amount, the excess is automatically released.
5. **Sends socket event to rider:** `ride:completed` with the final fare breakdown — the rider sees the receipt

**Files involved:**
- `src/services/ride.service.js` → `completeRide()`
- `src/services/payment.service.js` → `captureRidePayment()`
- `src/socket/handlers/driver.js` → `driver:complete_ride` handler
- `src/controllers/driverRide.controller.js` → `completeRide()`

---

### 10. Rider Rates the Driver (API)

**Endpoint:** `POST /v1/ride/:rideId/rating`

After the ride is completed, the rider can rate their experience.

**How it works:**
1. Rider submits a rating: stars (1-5), behaviour tags, and optional text feedback
2. Only allowed for rides with `status: completed`
3. Duplicate ratings are blocked — each ride can only be rated once
4. The driver's `avgRating` and `totalRatings` are updated automatically

**Files involved:**
- `src/services/rating.service.js` → `submitRating()`

---

### 11. Ride Cancellation (API)

Rides can be cancelled by either the **rider** or the **driver**, depending on the current status.

#### Rider Cancellation

**Endpoint:** `POST /v1/ride/:rideId/cancel`

**When allowed:** Only when the ride status is `searching` or `driver_allocated` (before the driver arrives).

**What happens:**
1. Ride status → `cancelled`
2. Cancellation details are saved: who cancelled, the reason, and when
3. **Payment hold is released (Stripe)** — the hold on the rider's card is cancelled and no charge is made
4. If ride was in `searching` (dispatch in progress):
   - The dispatch loop is stopped immediately
   - If a driver was currently being offered this ride → they receive a `ride:cancelled_by_rider` socket event
5. If ride was in `driver_allocated` (driver already accepted):
   - The assigned driver receives a `ride:cancelled_by_rider` socket event

#### Driver Cancellation

**Endpoint:** `POST /v1/driver/rides/:rideId/cancel`

**Via Socket:**
```
Event: "driver:cancel_ride"
Payload: { rideId: "...", reason: "changed_mind" }
```

**When allowed:** Only when the ride status is `driver_allocated` or `driver_arrived` (before the trip starts).

**What happens:**
1. Ride status → `cancelled`
2. Cancellation details are saved
3. **Payment hold is released (Stripe)** — the rider is not charged
4. The rider receives a `ride:cancelled_by_driver` socket event with a message: "Your driver has cancelled the ride"

**Files involved:**
- `src/services/ride.service.js` → `cancelRide()`, `cancelRideByDriver()`
- `src/services/dispatch.service.js` → `cancelDispatch()`
- `src/services/payment.service.js` → `releaseRidePayment()`
- `src/controllers/ride.controller.js` → `cancelRide()`
- `src/controllers/driverRide.controller.js` → `cancelRide()`

---

## No Drivers Found — Retry Flow

When no drivers are available in the rider's area, the rider sees a "No Drivers Available" screen with two options:

1. **Try Again** — searches for drivers again
2. **Change Pickup Location** — goes back to change the pickup (handled on the frontend)

### Try Again API

**Endpoint:** `POST /v1/ride/:rideId/retry`

**When allowed:** Only when the ride status is `no_drivers`.

**What happens:**
1. Validates the ride belongs to this rider and is in `no_drivers` status
2. Resets the ride status back to `searching`
3. Starts a fresh dispatch — searches for nearby drivers again from scratch
4. The rider's app goes back to the "Finding your driver" searching screen

This way the rider doesn't need to create a new ride (which would require a new payment authorization). The same ride and payment hold are reused.

**Files involved:**
- `src/services/ride.service.js` → `retryDispatch()`
- `src/controllers/ride.controller.js` → `retryDispatch()`

---

## Nearby Drivers on Map

While the rider is on the searching screen ("Finding your driver"), the app shows nearby drivers as car icons moving on the map. This is purely visual — it doesn't affect the dispatch.

**Endpoint:** `POST /v1/ride/nearby/drivers`

**Request body:**
```json
{
  "latitude": 51.5074,
  "longitude": -0.1278,
  "vehicleType": "standard"     // optional — filter by vehicle type
}
```

**Response:**
```json
{
  "success": true,
  "message": "5 driver(s) found nearby",
  "data": {
    "drivers": [
      {
        "id": "60f7b2c4e1b1c8a4d8e4f789",
        "location": { "latitude": 51.5080, "longitude": -0.1290 },
        "vehicleType": "standard",
        "vehicleMake": "Tesla",
        "vehicleModel": "Model 5"
      }
    ]
  }
}
```

**Details:**
- Searches within **10 km** of the given location
- Returns up to **20 drivers** maximum
- Only shows drivers who are online and have an approved account
- Does not filter by subscription, bank, or busy status (this is just for visual display)
- The frontend can call this periodically (e.g. every 10-15 seconds) to refresh the map

**Files involved:**
- `src/services/ride.service.js` → `getNearbyDrivers()`
- `src/controllers/ride.controller.js` → `getNearbyDrivers()`

---

## Restoring App State — Current Ride API

When the rider closes and reopens the app (or the app crashes and restarts), it needs to know if there's an active ride so it can show the correct screen.

### Rider Current Ride

**Endpoint:** `GET /v1/ride/current`

**What it returns:**
- If the rider has an active ride (`searching`, `driver_allocated`, `driver_arrived`, or `in_progress`), returns the full ride object with populated driver details
- If a driver is assigned and heading to the pickup, also returns the **current ETA** from the driver's position to the pickup
- If no active ride, returns `{ ride: null, eta: null }`

**Response example (with active ride):**
```json
{
  "success": true,
  "message": "Active ride found",
  "data": {
    "ride": {
      "_id": "...",
      "status": "driver_allocated",
      "pickup": { "coordinates": [-0.1278, 51.5074], "address": "65 Cheapside" },
      "destination": { "coordinates": [-0.1426, 51.5014], "address": "48 Notting Hill Gate" },
      "pickupOtp": "4721",
      "fare": { "totalFare": 16.50, "currency": "GBP" },
      "driver": {
        "name": "Albert Jazzof",
        "phone": "+447700900123",
        "profilePhotoUrl": "...",
        "vehicle": { "make": "Tesla", "model": "Model 5", "colour": "Silver", "registrationNumber": "EYN82381693" },
        "avgRating": 4.8,
        "totalRatings": 860,
        "currentLocation": { "type": "Point", "coordinates": [-0.1300, 51.5090] }
      },
      "category": { "name": "Standard", "vehicleType": "standard", "seatCapacity": 4 }
    },
    "eta": { "etaMinutes": 3, "etaText": "3 mins", "distanceMiles": 0.8 }
  }
}
```

**How the app uses it:** Based on the ride status, the app shows the right screen:
- `searching` → "Finding your driver" screen with spinner
- `driver_allocated` → Driver details screen with ETA, map, and OTP
- `driver_arrived` → "Driver has arrived" screen with OTP
- `in_progress` → Live trip tracking screen

### Driver Current Ride

**Endpoint:** `GET /v1/driver/rides/current`

- Returns the driver's active ride (if any) with populated rider details
- Used when the driver app restarts to resume the current trip

**Files involved:**
- `src/services/ride.service.js` → `getCurrentRideForRider()`, `getCurrentRideForDriver()`
- `src/controllers/ride.controller.js` → `getCurrentRide()`
- `src/controllers/driverRide.controller.js` → `getCurrentRide()`

---

## Driver Side — Going Online/Offline

Before a driver can receive ride requests, they must go online.

### Going Online (Socket or API)

**Socket:**
```
Event: "driver:go_online"
Payload: { latitude: 51.5074, longitude: -0.1278 }
```

**API:** `POST /v1/driver/status/online`

**Prerequisites checked (all must be true):**
- Account status is `approved` (admin-verified)
- Subscription is active (`isSubscribed: true`)
- Bank account is linked (`isBankLinked: true`)

**What happens:**
- `isOnline` flag set to `true`
- `socketId` saved (for socket method)
- `currentLocation` updated with the driver's GPS coordinates (stored as GeoJSON `[longitude, latitude]`)
- The driver is now discoverable by the dispatch system and will start receiving ride requests

### Going Offline (Socket or API)

**Socket:** `driver:go_offline`
**API:** `POST /v1/driver/status/offline`

**What happens:**
- `isOnline` set to `false`
- `socketId` cleared
- If the driver had a pending ride request → treated as a decline, and the next driver in the queue is tried immediately

### Location Updates (Socket)

**Socket:** `driver:update_location` with `{ latitude, longitude }`
**API:** `PATCH /v1/driver/status/location`

- Updates the driver's `currentLocation` in real-time
- Called periodically by the driver's app (every 5-10 seconds)
- Ensures the dispatch system always queries fresh, accurate locations
- During an active ride, the location is also broadcast to the rider (see [Real-Time Driver Tracking](#6-real-time-driver-tracking-socket))

### Server Restart Handling

On server startup, **all drivers are set to offline**. This prevents stale `isOnline: true` flags from drivers who were online when the server previously crashed or restarted. Drivers will need to go online again after a server restart.

**Files involved:**
- `src/services/driverStatus.service.js` → `goOnline()`, `goOffline()`, `updateLocation()`
- `src/socket/handlers/driver.js` → socket event handlers
- `src/socket/index.js` → server startup reset

---

## Payment Flow

ZipoRide uses **Stripe** with an **authorize-and-hold** pattern. This means the rider's card is not charged immediately — a hold is placed at booking, and the actual charge happens only when the ride completes.

### How It Works

```
Step 1: Rider adds a card
    │   → Stripe SetupIntent created
    │   → Card saved to rider's account
    │
Step 2: Rider books a ride
    │   → Stripe PaymentIntent created with "manual capture"
    │   → Hold placed on card for the estimated fare (e.g. £16.50)
    │   → Ride payment status: "authorized"
    │
Step 3a: Ride completes
    │   → PaymentIntent captured for the actual fare
    │   → If actual fare < estimated hold → excess is released automatically
    │   → Ride payment status: "paid"
    │
Step 3b: Ride cancelled
        → PaymentIntent cancelled → hold released
        → Rider is NOT charged anything
        → Ride payment status: "waived"
```

### Payment Method Management

| Endpoint                                          | Purpose                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `POST /v1/payment/setup-intent`                   | Start adding a new card (returns Stripe client_secret) |
| `POST /v1/payment/methods`                        | Save a card after Stripe confirmation    |
| `GET /v1/payment/methods`                         | List rider's saved cards                 |
| `DELETE /v1/payment/methods/:paymentMethodId`     | Remove a saved card (soft-delete)        |
| `PATCH /v1/payment/methods/:paymentMethodId/default` | Set a card as the default              |

### Payment Statuses

| Status       | Meaning                                                       |
| ------------ | ------------------------------------------------------------- |
| `pending`    | Ride created, payment not yet processed                       |
| `authorized` | Card hold placed successfully at booking                      |
| `paid`       | Ride completed and payment captured from card                 |
| `failed`     | Payment capture failed (card declined, expired, etc.)         |
| `refunded`   | Payment was refunded after completion                         |
| `waived`     | Ride was cancelled — no charge applied, hold released         |

**Files involved:**
- `src/services/payment.service.js` → all payment operations
- `src/controllers/payment.controller.js` → HTTP handlers
- `src/routes/v1/payment.route.js` → route definitions
- `src/models/payment.model.js` → payment transaction records
- `src/models/paymentMethod.model.js` → saved card details

---

## Fare Calculation

The fare is computed per vehicle category using this formula:

```
baseFare                                (fixed starting price per category)
+ (distanceMiles x pricePerMile)        (distance-based charge)
+ (durationMinutes x pricePerMinute)    (time-based charge)
+ airportParkingCharge                  (if this is an airport ride)
─────────────────────────────────────
= subtotal

subtotal x surgeMultiplier              (if surge pricing is enabled)
─────────────────────────────────────
= adjustedFare

totalFare = max(adjustedFare, minimumFare)   (never goes below the minimum)
```

**Currency:** GBP (British Pounds)

**Pricing is stored in the database** as a singleton document (one document in the `Pricing` collection) — this means pricing can be updated by an admin without redeploying the server.

Each vehicle category has its own:
- `baseFare` — the fixed starting price
- `pricePerMile` — cost per mile
- `pricePerMinute` — cost per minute
- `minimumFare` — the floor price (fare never goes below this)
- `cancellationFee` — fee if rider cancels after driver is allocated
- `surgePricing` — enabled flag + multiplier (e.g. 1.5x during peak hours)
- `airportParkingCharge` — extra charge for airport pickups/drop-offs

**Files involved:**
- `src/services/pricing.service.js` → `estimateFare()`, `getRideOptions()`
- `src/models/pricing.model.js` → global pricing config
- `src/models/inventory.model.js` → vehicle category pricing

---

## API Endpoints Reference

### Rider Endpoints

| Method | Endpoint                      | Purpose                                              | Auth    |
| ------ | ----------------------------- | ---------------------------------------------------- | ------- |
| POST   | `/v1/ride/options`            | Get available ride options with estimated fares       | Rider   |
| POST   | `/v1/ride`                    | Create a new ride (triggers dispatch + payment hold)  | Rider   |
| GET    | `/v1/ride/current`            | Get rider's current active ride + ETA                 | Rider   |
| GET    | `/v1/ride`                    | List rider's ride history (paginated)                 | Rider   |
| GET    | `/v1/ride/:rideId`            | Get single ride details                               | Rider   |
| POST   | `/v1/ride/:rideId/retry`      | Retry driver search (when no drivers were found)      | Rider   |
| POST   | `/v1/ride/:rideId/cancel`     | Cancel a ride                                         | Rider   |
| POST   | `/v1/ride/nearby/drivers`     | Get nearby drivers for map display                    | Rider   |

### Driver Endpoints

| Method | Endpoint                              | Purpose                                      | Auth    |
| ------ | ------------------------------------- | -------------------------------------------- | ------- |
| POST   | `/v1/driver/rides/:rideId/accept`     | Accept a ride offer                          | Driver  |
| POST   | `/v1/driver/rides/:rideId/decline`    | Decline a ride offer                         | Driver  |
| GET    | `/v1/driver/rides/current`            | Get current active ride                      | Driver  |
| GET    | `/v1/driver/rides`                    | List driver's ride history (paginated)       | Driver  |
| GET    | `/v1/driver/rides/:rideId`            | Get single ride details                      | Driver  |
| POST   | `/v1/driver/rides/:rideId/arrived`    | Mark arrival at pickup                       | Driver  |
| POST   | `/v1/driver/rides/:rideId/verify/otp` | Verify OTP and start the ride                | Driver  |
| POST   | `/v1/driver/rides/:rideId/complete`   | Complete the ride at destination             | Driver  |
| POST   | `/v1/driver/rides/:rideId/cancel`     | Cancel an assigned ride                      | Driver  |

### Driver Status Endpoints

| Method | Endpoint                        | Purpose                          | Auth    |
| ------ | ------------------------------- | -------------------------------- | ------- |
| POST   | `/v1/driver/status/online`      | Go online with GPS location      | Driver  |
| POST   | `/v1/driver/status/offline`     | Go offline                       | Driver  |
| PATCH  | `/v1/driver/status/location`    | Update current GPS location      | Driver  |
| GET    | `/v1/driver/status`             | Get current online/offline status| Driver  |

### Payment Endpoints

| Method | Endpoint                                             | Purpose                          | Auth    |
| ------ | ---------------------------------------------------- | -------------------------------- | ------- |
| POST   | `/v1/payment/setup-intent`                           | Create Stripe SetupIntent        | Rider   |
| POST   | `/v1/payment/methods`                                | Save a card                      | Rider   |
| GET    | `/v1/payment/methods`                                | List saved cards                 | Rider   |
| DELETE | `/v1/payment/methods/:paymentMethodId`               | Remove a card                    | Rider   |
| PATCH  | `/v1/payment/methods/:paymentMethodId/default`       | Set card as default              | Rider   |

---

## Socket Events Reference

### Events the Server SENDS

| Event                       | Sent To  | When                                         | Data                                                                 |
| --------------------------- | -------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `ride:new_request`          | Driver   | New ride offer dispatched to this driver      | `{ ride, timeoutSeconds: 15 }`                                       |
| `ride:request_expired`      | Driver   | 15s timeout, offer expired                   | `{ rideId }`                                                         |
| `ride:driver_assigned`      | Rider    | A driver accepted the ride                   | `{ ride, driver: { name, phone, photo, vehicle, rating, trips }, eta }` |
| `ride:no_drivers_available` | Rider    | All drivers exhausted or none found           | `{ rideId, message }`                                                |
| `ride:driver_location`      | Rider    | Real-time driver GPS update during ride       | `{ rideId, location: { lat, lng }, eta }`                            |
| `ride:driver_arrived`       | Rider    | Driver has arrived at the pickup point        | `{ rideId, message }`                                                |
| `ride:started`              | Rider    | OTP verified, ride has begun                  | `{ rideId, message }`                                                |
| `ride:completed`            | Rider    | Ride finished, payment captured               | `{ rideId, fare, message }`                                          |
| `ride:cancelled_by_rider`   | Driver   | Rider cancelled while driver had the offer    | `{ rideId, message }`                                                |
| `ride:cancelled_by_driver`  | Rider    | Driver cancelled the assigned ride            | `{ rideId, message }`                                                |

### Events the Server LISTENS TO (from driver)

| Event                    | Payload                                   | Purpose                              |
| ------------------------ | ----------------------------------------- | ------------------------------------ |
| `driver:go_online`       | `{ latitude, longitude }`                 | Go online, start receiving requests  |
| `driver:go_offline`      | —                                         | Go offline, stop receiving requests  |
| `driver:update_location` | `{ latitude, longitude }`                 | Real-time GPS update                 |
| `driver:accept_ride`     | `{ rideId }`                              | Accept a ride offer                  |
| `driver:decline_ride`    | `{ rideId }`                              | Decline a ride offer                 |
| `driver:arrived`         | `{ rideId }`                              | Mark arrival at pickup               |
| `driver:verify_otp`      | `{ rideId, otp }`                         | Enter OTP to start ride              |
| `driver:complete_ride`   | `{ rideId }`                              | Mark ride as completed               |
| `driver:cancel_ride`     | `{ rideId, reason, customReason? }`       | Cancel an assigned ride              |

### Socket Authentication

All socket connections require a valid JWT token. The token is sent during the connection handshake:

```javascript
const socket = io('wss://api.ziporide.com', {
  auth: { token: 'Bearer <jwt_token>' }
});
```

The server authenticates the token and creates a private room for the user: `user:<userId>`. All events for that user are emitted to this room.

---

## Cancellation Reasons Reference

When cancelling a ride, both riders and drivers must provide a reason. If the reason is `other`, a `customReason` text (up to 300 characters) is required.

### Rider Cancellation Reasons

| Reason Value               | What it means (displayed in app)                  |
| -------------------------- | ------------------------------------------------- |
| `taking_too_long`          | Taking too much time to get Driver                |
| `driver_taking_too_long`   | Driver is taking too long to arrive               |
| `changed_mind`             | Change of plans                                   |
| `ordered_by_mistake`       | Booked by mistake                                 |
| `wrong_location`           | Wrong pickup or destination location              |
| `incorrect_pickup_location`| Incorrect pickup location                         |
| `found_another_ride`       | Found another ride                                |
| `driver_not_moving`        | Driver is not moving towards pickup               |
| `driver_asked_to_cancel`   | Driver asked to cancel                            |
| `safety_concerns`          | Safety concerns                                   |
| `other`                    | Other (requires custom reason text)               |

### Driver Cancellation Reasons

Drivers use the same set of reasons listed above when cancelling an assigned ride.

### Driver Decline Reasons (when declining a ride offer)

| Reason Value          | What it means                          |
| --------------------- | -------------------------------------- |
| `busy`                | Currently busy                         |
| `too_far`             | Pickup is too far away                 |
| `wrong_vehicle_type`  | Rider selected wrong vehicle type      |
| `personal_reason`     | Personal reason                        |
| `other`               | Other                                  |

---

## Key Files

| File                                       | Responsibility                                                    |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `src/models/ride.model.js`                 | Ride schema, statuses, timestamps, geospatial indexes             |
| `src/models/driver.model.js`               | Driver schema, online status, location, vehicle, ratings          |
| `src/models/payment.model.js`              | Payment transaction records                                       |
| `src/models/paymentMethod.model.js`        | Saved card details (Stripe)                                       |
| `src/models/inventory.model.js`            | Vehicle categories with pricing                                   |
| `src/models/pricing.model.js`              | Global pricing configuration (singleton)                          |
| `src/services/ride.service.js`             | Core ride CRUD, lifecycle transitions, nearby drivers, retry      |
| `src/services/dispatch.service.js`         | Driver matching, dispatch loop, accept/decline, ETA               |
| `src/services/pricing.service.js`          | Fare calculation, ride options                                    |
| `src/services/mapbox.service.js`           | Distance/duration and ETA from Mapbox Directions API              |
| `src/services/driverStatus.service.js`     | Driver online/offline/location management                         |
| `src/services/payment.service.js`          | Stripe authorize/capture/release payment operations               |
| `src/controllers/ride.controller.js`       | Rider-side HTTP handlers                                          |
| `src/controllers/driverRide.controller.js` | Driver-side HTTP handlers                                         |
| `src/controllers/payment.controller.js`    | Payment method HTTP handlers                                      |
| `src/socket/handlers/driver.js`            | Driver socket event handlers (go online, accept, location, etc.)  |
| `src/socket/handlers/rider.js`             | Rider socket connection lifecycle                                 |
| `src/socket/index.js`                      | Socket.io initialization, auth middleware, room management        |
| `src/socket/socketAuth.js`                 | JWT-based socket authentication                                   |
| `src/routes/v1/ride.route.js`              | Rider-side route definitions                                      |
| `src/routes/v1/driverRide.route.js`        | Driver-side route definitions                                     |
| `src/routes/v1/payment.route.js`           | Payment route definitions                                         |
| `src/validations/ride.validation.js`       | Request validation schemas (Joi)                                  |

---

## Production Risks & Suggestions

### 1. Dispatch State is In-Memory (HIGH RISK)

**Problem:** The `activeDispatches` Map and `driversWithPendingRequest` Set in `dispatch.service.js` are stored in server memory. If the server crashes or restarts, all ongoing dispatches are lost — rides get stuck in `searching` status forever, and riders are left hanging.

**Suggestion:** Use **Redis** to store dispatch state. On server restart, resume or clean up in-progress dispatches. Alternatively, add a background job that detects stale `searching` rides (e.g. older than 2 minutes) and either retries dispatch or sets them to `no_drivers`.

---

### 2. Race Conditions in Driver Accept (MEDIUM RISK)

**Problem:** If a driver somehow sends two rapid `accept_ride` events, or if both socket and REST API accept are called simultaneously, the current validation should catch it — but there's no database-level lock.

**Suggestion:** Use MongoDB's `findOneAndUpdate` with a condition like `{ _id: rideId, status: 'searching' }` so that only the first update wins atomically. The code already does this partially but ensure it's the single source of truth.

---

### 3. No Ride Timeout for `driver_allocated` Status (MEDIUM RISK)

**Problem:** After a driver accepts, there's no timeout if they never arrive. The ride can stay in `driver_allocated` forever.

**Suggestion:** Add a timeout (e.g. 10-15 minutes). If the driver hasn't arrived, auto-cancel or notify the rider. This can be a background cron job or a delayed job via a queue (Bull/BullMQ with Redis).

---

### 4. Socket CORS Accepts All Origins (MEDIUM RISK)

**Problem:** In `src/socket/index.js`, CORS is set to `origin: "*"` which accepts connections from any domain.

**Suggestion:** Restrict to your app's domains in production. For mobile apps this is less critical, but if you have a web client this is important.

---

### 5. All Drivers Reset to Offline on Server Restart (LOW-MEDIUM RISK)

**Problem:** When the server restarts, all drivers are set offline (`isOnline: false`). This means every server deploy kicks all drivers offline — they must manually go online again.

**Suggestion:** This is acceptable for now. Consider using Redis to track online state so it persists across deploys, or only reset drivers whose `socketId` doesn't match any active connection.

---

### 6. No Rate Limiting on Dispatch (LOW RISK)

**Problem:** If a rider rapidly creates and cancels rides, it triggers dispatch loops each time, wasting driver attention and server resources.

**Suggestion:** Add a cooldown period after cancellation (e.g. 30 seconds before the rider can create a new ride). Also consider tracking cancellation frequency — too many cancellations could temporarily restrict the rider.

---

### 7. Mapbox API Costs (OPERATIONAL RISK)

**Problem:** Every ride creation calls the Mapbox API, and ETA calculations are made on each driver location update (during `driver_allocated` status). With high traffic, API costs can grow quickly.

**Suggestion:** Cache route calculations for short periods (e.g. 5 minutes for the same origin-destination pair). The `getRideOptions` result could be reused during `createRide` if the rider books within a time window. For ETA updates, consider throttling to once every 30 seconds instead of every location update.

---

### 8. OTP is Not Cryptographically Secure (LOW RISK)

**Problem:** The OTP is generated with `Math.floor(1000 + Math.random() * 9000)` — using `Math.random()` which is not cryptographically secure. With only 9000 possible values, brute-forcing is theoretically possible.

**Suggestion:** Use `crypto.randomInt(1000, 10000)` for better randomness. For a taxi OTP this risk is low since it requires physical presence, but it's a quick fix.

---

### 9. Single-Server Architecture (SCALABILITY RISK)

**Problem:** Socket.io and in-memory dispatch state only work on a single server instance. You cannot horizontally scale to multiple servers.

**Suggestion:** When you need to scale:
- Use **Redis adapter** for Socket.io (`@socket.io/redis-adapter`) so events are broadcast across instances
- Move dispatch state to Redis
- Use a job queue (BullMQ) for dispatch loops instead of `setTimeout`

---

*Last updated: March 2026*
