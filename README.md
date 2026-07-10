<div align="center">

<img src="https://img.shields.io/badge/SwiftAid-Emergency%20Response-e94560?style=for-the-badge&logo=ambulance&logoColor=white" alt="SwiftAid"/>

# 🚑 SwiftAid
### Smart Emergency Ride Allocation System

**An Uber-like dispatch platform for ambulances — built for India's emergency response gap**

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-swift--aid--pi.vercel.app-e94560?style=for-the-badge)](https://swift-aid-pi.vercel.app)
[![Backend](https://img.shields.io/badge/🔧%20API-Railway-8b5cf6?style=for-the-badge)](https://swiftaid-production.up.railway.app/health)
[![GitHub](https://img.shields.io/badge/GitHub-aabha4O%2FSwiftAid-24292e?style=for-the-badge&logo=github)](https://github.com/aabha4O/SwiftAid)

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18.x-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-7.x-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7.x-DC382D?style=flat-square&logo=redis&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?style=flat-square&logo=socket.io&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Containerised-2496ED?style=flat-square&logo=docker&logoColor=white)
[![CI](https://github.com/aabha40/SwiftAid/actions/workflows/ci.yml/badge.svg)](https://github.com/aabha40/SwiftAid/actions/workflows/ci.yml)

</div>

---

## 📋 Table of Contents

- [Problem Statement](#-problem-statement)
- [Solution](#-solution)
- [Live Demo](#-live-demo)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Data Models](#-data-models)
- [API Reference](#-api-reference)
- [Real-time Events](#-real-time-events)
- [Getting Started](#-getting-started)
- [Docker Setup](#-docker-setup)
- [Project Structure](#-project-structure)
- [User Roles](#-user-roles)
- [Algorithms](#-algorithms)
- [Deployment](#-deployment)
- [Screenshots](#-screenshots)
- [Author](#-author)

---

## 🚨 Problem Statement

In emergency situations across India:

| Problem | Impact |
|---------|--------|
| 🕐 Ambulances arrive late | Patients lose the golden hour |
| 🏥 No hospital coordination | Patients sent to full hospitals |
| 📍 No real-time tracking | Family has no idea where help is |
| 🚑 No smart dispatch | Nearest ambulance often missed |
| 🆘 Manual coordination | Dispatcher bottleneck under pressure |

> **Every minute matters in a medical emergency. SwiftAid cuts response time by automating dispatch, routing, and tracking.**

---

## 💡 Solution

SwiftAid is a **full-stack emergency dispatch platform** that:

- ⚡ Finds the **nearest available ambulance** using Redis geo-spatial queries
- 🏥 Routes patients to the **best hospital** — not just the nearest — based on bed availability, distance, and specialty match
- 🚨 Prioritises **critical cases first** using a priority queue (cardiac = 100, trauma = 80, general = 50)
- 📍 Tracks ambulances in **real-time** via WebSockets with live ETA updates
- 🔄 **Auto-reassigns** if a driver doesn't respond within 30 seconds
- 📱 Sends **push notifications** to patients, drivers, and hospital admins

---

## 🌐 Live Demo

| Resource | URL |
|----------|-----|
| 🌐 Frontend | https://swift-aid-pi.vercel.app |
| 🔧 Backend API | https://swiftaid-production.up.railway.app |
| ❤️ Health Check | https://swiftaid-production.up.railway.app/health |

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| 🏥 Patient | rahul@gmail.com | password123 |
| 🚑 Driver | ramesh@swiftaid.com | driver123 |
| 🏨 Hospital Admin | hospital@swiftaid.com | hospital123 |
| ⚙️ Super Admin | admin@swiftaid.com | admin123 |

---

## ✨ Key Features

### ⚡ 1. Real-Time GPS Tracking
- Driver app broadcasts GPS coordinates every 3 seconds via WebSocket
- Patient sees ambulance moving on live Leaflet.js map
- ETA recalculates dynamically as ambulance moves
- Heartbeat detection — ambulance auto-marked OFFLINE if no ping in 90 seconds

### 📍 2. Geo-Based Smart Matching (Uber Logic)
- Ambulance locations stored in **Redis geo pool** using `GEOADD`
- `GEORADIUS` / `GEOSEARCH` query finds nearest available ambulance in <5ms
- Starts at 10km radius, auto-expands to 20km → 50km if none found
- **Atomic locking** with Redis `SET NX` prevents double-assignment

### 🏥 3. Hospital Availability Routing (Main USP)
```
Score = (availableBeds/totalBeds × 0.4) + (1/distance × 0.4) + (specialtyMatch × 0.2)
```
- Scores ALL hospitals within 20km
- Assigns highest-scoring hospital — not just nearest
- Bed count auto-decrements on assignment, restores on trip completion

### 🚨 4. Priority-Based Dispatch Queue
```
Cardiac      → Priority Score: 100  (served first)
Trauma       → Priority Score: 80
Respiratory  → Priority Score: 70
General      → Priority Score: 50
Non-emergency→ Priority Score: 10   (served last)
```
- Implemented using **Redis Sorted Sets**
- Critical cases jump ahead of general cases automatically

### 🔄 5. Auto-Reassignment
- If driver doesn't accept within **30 seconds** → system claims next nearest ambulance
- If ambulance claimed but assignment fails → automatic cleanup releases it back to pool
- Prevents fleet depletion from unresponsive drivers

### 🔒 6. Security & Reliability
- JWT authentication with role-based access control (RBAC)
- Rate limiting: 5 emergency requests/minute per IP
- Audit logging of every action to MongoDB capped collection
- Input validation on all coordinates and emergency types
- Error boundary prevents full app crashes

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  React (Patient) │ React (Driver) │ React (Hospital) │ Admin │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                      GATEWAY LAYER                           │
│     Express.js │ JWT Auth │ Rate Limiter │ RBAC              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     CORE SERVICES                            │
│  Request Service  │  Geo-Match  │  Hospital Scorer  │  Auth  │
│  Tracking Service │  ETA Calc   │  Notification     │  Audit │
└──────────┬────────────────────────────────────┬─────────────┘
           │                                    │
┌──────────▼──────────┐              ┌──────────▼──────────────┐
│       MONGODB        │              │         REDIS            │
│  Users, Trips       │              │  Geo pool (ambulances)   │
│  Hospitals          │              │  Priority queue          │
│  Emergency Requests │              │  Heartbeat TTLs          │
│  Audit Logs         │              │  Rate limit counters     │
└─────────────────────┘              └─────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose | Why chosen |
|-----------|---------|------------|
| **Node.js + Express** | REST API server | Non-blocking I/O, handles 100+ concurrent GPS pings |
| **MongoDB + Mongoose** | Persistent storage | Flexible schema, native GeoJSON support |
| **Redis** | Geo-matching + queues | In-memory = <5ms geo queries vs 50ms MongoDB |
| **Socket.io** | Real-time communication | Auto-reconnect, rooms, fallback to polling |
| **JWT** | Authentication | Stateless, scalable across multiple servers |
| **bcryptjs** | Password hashing | 12 salt rounds, industry standard |
| **Firebase Admin SDK** | Push notifications | Reaches offline devices |

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 18** | Component-based UI |
| **React Router v6** | Client-side routing |
| **Leaflet.js + React-Leaflet** | Interactive maps (free, no API key) |
| **Socket.io Client** | Real-time map updates |
| **Axios** | HTTP client with interceptors |

### DevOps
| Technology | Purpose |
|-----------|---------|
| **Docker + Docker Compose** | Containerisation |
| **Railway** | Backend + DB hosting |
| **Vercel** | Frontend hosting |
| **GitHub Actions** | CI/CD pipeline |

---

## 📊 Data Models

### User
```javascript
{
  name: String,
  email: String (unique),
  phone: String (unique, Indian format),
  password: String (bcrypt hashed),
  role: Enum ['patient', 'driver', 'hospital_admin', 'super_admin'],
  ambulanceId: ObjectId → Ambulance,   // drivers only
  hospitalId: ObjectId → Hospital,     // hospital_admin only
  fcmToken: String,                    // push notifications
  isActive: Boolean
}
```

### Ambulance
```javascript
{
  vehicleNumber: String (unique, uppercase),
  driverId: ObjectId → User,
  status: Enum ['available', 'busy', 'offline'],
  location: GeoJSON Point { coordinates: [longitude, latitude] },
  ambulanceType: Enum ['basic', 'advanced', 'cardiac', 'neonatal'],
  currentTripId: ObjectId → Trip,
  totalTripsCompleted: Number,
  lastActiveAt: Date
}
```

### Hospital
```javascript
{
  name: String,
  registrationNumber: String (unique),
  location: GeoJSON Point,
  address: { street, city, state, pincode },
  totalBeds: Number,
  availableBeds: Number,
  emergencyCapacity: { total, available },
  specialties: Array ['cardiology', 'trauma', 'neurology', ...],
  isAcceptingEmergencies: Boolean,
  adminId: ObjectId → User
}
```

### EmergencyRequest
```javascript
{
  patientId: ObjectId → User,
  pickupLocation: GeoJSON Point,
  emergencyType: Enum ['cardiac', 'trauma', 'respiratory', 'general', 'non_emergency'],
  priorityScore: Number,              // auto-calculated on save
  status: Enum ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'completed', 'failed'],
  assignedAmbulanceId: ObjectId → Ambulance,
  assignedHospitalId: ObjectId → Hospital,
  assignmentAttempts: Number
}
```

### Trip
```javascript
{
  requestId: ObjectId → EmergencyRequest,
  ambulanceId: ObjectId → Ambulance,
  patientId: ObjectId → User,
  hospitalId: ObjectId → Hospital,
  timeline: {
    requestedAt, assignedAt, acceptedAt, arrivedAt, completedAt
  },
  estimatedArrivalMinutes: Number,
  distanceKm: Number
}
```

---

## 📡 API Reference

### Authentication
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/register` | Public | Register new user |
| POST | `/api/auth/login` | Public | Login, returns JWT |
| GET | `/api/auth/me` | Protected | Get current user |
| PATCH | `/api/auth/fcm-token` | Protected | Update push token |

### Emergency Requests
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/requests` | Patient | Submit emergency request |
| GET | `/api/requests/my` | Patient | Get my requests |
| GET | `/api/requests/:id` | All | Get request details |
| PATCH | `/api/requests/:id/status` | Driver | Update trip status |

### Ambulances
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/ambulances` | Super Admin | Add ambulance to fleet |
| GET | `/api/ambulances` | Super Admin | Get all ambulances |
| GET | `/api/ambulances/my` | Driver | Get my ambulance |
| PATCH | `/api/ambulances/status` | Driver | Update online/offline status |
| PATCH | `/api/ambulances/:id/assign-driver` | Super Admin | Assign driver |

### Hospitals
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/hospitals` | Super Admin | Register hospital |
| GET | `/api/hospitals` | Super Admin | Get all hospitals |
| GET | `/api/hospitals/my` | Hospital Admin | Get my hospital |
| PATCH | `/api/hospitals/beds` | Hospital Admin | Update bed count |
| PATCH | `/api/hospitals/toggle-emergency` | Hospital Admin | Toggle acceptance |

### Admin
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/admin/stats` | Super Admin | System statistics |
| GET | `/api/admin/users` | Super Admin | All users |
| GET | `/api/admin/ambulances` | Super Admin | All ambulances |
| GET | `/api/admin/hospitals` | Super Admin | All hospitals |
| PATCH | `/api/admin/users/:id/toggle` | Super Admin | Activate/deactivate user |

---

## 📡 Real-Time Events (Socket.io)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join_trip` | `{ tripId }` | Join trip room for updates |
| `location_update` | `{ tripId, ambulanceId, longitude, latitude }` | Driver sends GPS |
| `status_update` | `{ tripId, requestId, status }` | Driver updates status |
| `heartbeat` | `{ ambulanceId }` | Keep-alive ping every 30s |
| `ping_server` | — | Connection test |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `ambulance_location` | `{ longitude, latitude, etaMinutes }` | Live location broadcast |
| `trip_status_update` | `{ status, message }` | Status change notification |
| `heartbeat_ack` | `{ timestamp }` | Heartbeat confirmed |
| `joined_trip` | `{ tripId }` | Room join confirmed |
| `error` | `{ message }` | Error notification |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- MongoDB 7+
- Redis 7+ (or Memurai on Windows)
- Git

### 1. Clone the repository
```bash
git clone https://github.com/aabha4O/SwiftAid.git
cd SwiftAid
```

### 2. Install backend dependencies
```bash
npm install
```

### 3. Configure environment variables
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/swiftaid
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_key_minimum_32_chars
JWT_EXPIRES_IN=7d
```

### 4. Start the backend
```bash
node server/index.js
```

Backend runs at `http://localhost:5000`
Health check: `http://localhost:5000/health`

### 5. Install and start frontend
```bash
cd client
npm install
npm start
```

Frontend runs at `http://localhost:3000`

---

## 🐳 Docker Setup

Run the entire stack with one command:

```bash
# Start all services (MongoDB + Redis + Backend)
docker-compose up --build

# Run in background
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f backend
```

Services started:
- Backend API → `http://localhost:5000`
- MongoDB → `localhost:27018`
- Redis → `localhost:6380`

---

## 📁 Project Structure

```
SwiftAid/
├── server/
│   ├── config/
│   │   ├── db.js              # MongoDB connection + Redis sync on startup
│   │   ├── redis.js           # Redis client with auto-reconnect
│   │   ├── socket.js          # Socket.io server setup
│   │   └── firebase.js        # FCM push notifications
│   ├── models/
│   │   ├── User.js            # All 4 roles, bcrypt password hashing
│   │   ├── Ambulance.js       # 2dsphere geo index
│   │   ├── Hospital.js        # Bed management, specialties
│   │   ├── EmergencyRequest.js# Auto priority score on save
│   │   ├── Trip.js            # Full timeline tracking
│   │   └── AuditLog.js        # Capped collection, 10k entries
│   ├── controllers/
│   │   ├── authController.js  # Register, login, JWT
│   │   ├── ambulanceController.js
│   │   ├── hospitalController.js
│   │   ├── requestController.js # Main dispatch logic
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   ├── rbac.js            # Role-based access control
│   │   ├── rateLimiter.js     # 3 limiters (general/emergency/auth)
│   │   └── errorHandler.js    # Global error handling
│   ├── services/
│   │   ├── geoMatch.js        # Redis GEORADIUS + atomic locking
│   │   ├── hospitalScore.js   # Weighted scoring + Haversine formula
│   │   ├── eta.js             # ETA calculation
│   │   ├── notification.js    # FCM push templates
│   │   └── auditLogger.js     # Non-blocking audit logging
│   ├── socket/
│   │   ├── index.js           # Connection handler + JWT auth
│   │   ├── locationHandler.js # GPS updates → Redis + broadcast
│   │   ├── statusHandler.js   # Trip status events
│   │   └── heartbeatHandler.js# Offline detection via TTL
│   ├── routes/                # Express routers
│   └── utils/
│       └── constants.js       # All magic strings centralised
├── client/
│   └── src/
│       ├── api/axios.js       # Axios with JWT interceptor
│       ├── context/AuthContext.js
│       ├── components/
│       │   ├── Sidebar.jsx    # Role-aware navigation
│       │   └── ErrorBoundary.jsx
│       └── pages/
│           ├── auth/          # Login + Register
│           ├── patient/       # Dashboard + live map + request
│           ├── driver/        # Console + status management
│           ├── hospital/      # Bed management + incoming patients
│           └── admin/         # Fleet + hospitals + users + stats
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 👥 User Roles

### 🏥 Patient
- Submit emergency ambulance request with GPS location
- Select emergency type (cardiac, trauma, respiratory, general)
- View assigned ambulance details (vehicle number, driver, ETA)
- Track ambulance on live map in real-time
- See assigned hospital with bed availability
- View full request history

### 🚑 Ambulance Driver
- Toggle online/offline status (adds/removes from geo pool)
- Automatically receive nearby emergency assignments
- Send live GPS coordinates via WebSocket every 3 seconds
- Update trip status (accepted → en route → arrived → completed)
- View trip statistics and history

### 🏨 Hospital Admin
- Update real-time bed availability (general + emergency)
- Toggle emergency acceptance on/off
- View incoming patients with ETA
- See bed capacity bars with warnings at <10%

### ⚙️ Super Admin
- Add ambulances to fleet, assign drivers
- Register hospitals, link hospital admins
- View real-time system statistics
- Monitor all active trips on dashboard
- Activate/deactivate user accounts
- View entire fleet and hospital status

---

## 🧮 Algorithms

### Geo-Matching Algorithm
```
1. Patient submits request at [lng, lat]
2. GEORADIUS search in Redis within 10km
3. For each result (sorted by distance):
   a. SET lock:ambulance:ID "locked" NX EX 30
   b. If OK → ambulance claimed atomically
   c. If null → already claimed, try next
4. If no ambulances in 10km → expand to 20km → 50km
5. If still none → mark request FAILED
```

### Hospital Scoring Algorithm
```
For each hospital within 20km:
  bedScore      = availableBeds / totalBeds           (weight: 40%)
  distanceScore = 1 - (distanceKm / 50)               (weight: 40%)
  specialtyScore = 1 if specialty matches, else 0      (weight: 20%)
  
  finalScore = (bedScore × 0.4) + (distanceScore × 0.4) + (specialtyScore × 0.2)

Sort hospitals by finalScore descending → assign highest scoring
```

### Priority Queue
```
Redis Sorted Set: request:priority_queue
Score = priorityScore (100 for cardiac, 50 for general)
Higher score = served first (ZREVRANGE)
```

### Haversine Distance Formula
```javascript
// Calculates real-world distance between two GPS coordinates
// Accounts for Earth's curvature
distance = 2R × arcsin(√(sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)))
// R = 6371 km (Earth's radius)
```

---

## 🚀 Deployment

### Backend — Railway
- Dockerfile-based deployment
- Managed MongoDB and Redis included
- Auto-deploys on GitHub push
- Environment variables injected securely

### Frontend — Vercel
- Zero-config React deployment
- CDN distribution globally
- Automatic HTTPS
- Preview deployments on PRs

### One-command local deployment
```bash
docker-compose up --build
```
## 📈 Performance

> Load tested with [autocannon](https://github.com/mcollina/autocannon) — 50 concurrent connections, 10 seconds

| Operation | Result |
|-----------|--------|
| **Throughput** | 1,190 req/sec average (peak: 1,455 req/sec) |
| **Avg latency** | 41ms |
| **P50 latency** | 36ms |
| **P99 latency** | 163ms |
| **Total handled** | 12,000 requests in 10 seconds |
| **Data transferred** | 12.3 MB in 10 seconds |
| **Concurrent connections** | 50 |

*Tested on local Node.js server. Production Railway deployment may vary.*

---

## 🎯 What Makes SwiftAid Different

| Feature | Traditional 108 | SwiftAid |
|---------|----------------|----------|
| Ambulance matching | Manual dispatcher | Automatic geo-matching (<100ms) |
| Hospital selection | Nearest hospital | Scored by beds + distance + specialty |
| Patient tracking | Phone calls | Live map with moving ambulance pin |
| Critical prioritisation | First come first served | Priority queue (cardiac first) |
| Driver offline handling | Manual follow-up | Auto-reassign in 30 seconds |
| Response transparency | None | Full status timeline with timestamps |

---

## 🛡️ Security Features

- **JWT tokens** with 7-day expiry
- **bcrypt** password hashing (12 salt rounds)
- **Rate limiting**: 5 emergency requests/minute, 10 login attempts/15 minutes
- **RBAC**: 4 roles with strict endpoint access control
- **Input validation**: coordinates range check, emergency type whitelist
- **Audit logging**: every action logged with actor, IP, timestamp
- **Atomic operations**: Redis `SET NX` prevents race conditions
- **CORS**: restricted to known frontend domains in production
- **Helmet.js**: 14 security HTTP headers

---

## 📈 Performance

| Operation | Technology | Latency |
|-----------|-----------|---------|
| Find nearest ambulance | Redis GEORADIUS | < 5ms |
| User authentication | JWT verify | < 1ms |
| Database queries | MongoDB indexed | < 20ms |
| Real-time location update | Socket.io | < 50ms |
| Full dispatch flow | End-to-end | < 200ms |

---

## 👩‍💻 Author

**Aabha Shukla**

---



<div align="center">

**Built with ❤️ for India's emergency response system**

*SwiftAid — Because every second counts* 🚑

[![Live Demo](https://img.shields.io/badge/Try%20SwiftAid%20Live-swift--aid--pi.vercel.app-e94560?style=for-the-badge)](https://swift-aid-pi.vercel.app)

</div>
