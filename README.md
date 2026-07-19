<div align="center">

<img src="https://img.shields.io/badge/SwiftAid-Emergency%20Response-e94560?style=for-the-badge&logoColor=white" alt="SwiftAid"/>

# 🚑 SwiftAid
### Smart Emergency Ride Allocation System

**An Uber-like dispatch platform for ambulances — built for India's emergency response gap**

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-swift--aid--pi.vercel.app-e94560?style=for-the-badge)](https://swift-aid-pi.vercel.app)
[![Backend](https://img.shields.io/badge/🔧%20API-Render-8b5cf6?style=for-the-badge)](https://swiftaid-klqt.onrender.com/health)
[![GitHub](https://img.shields.io/badge/GitHub-aabha40%2FSwiftAid-24292e?style=for-the-badge&logo=github)](https://github.com/aabha40/SwiftAid)
[![CI](https://github.com/aabha40/SwiftAid/actions/workflows/ci.yml/badge.svg)](https://github.com/aabha40/SwiftAid/actions/workflows/ci.yml)

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18.x-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Upstash-DC382D?style=flat-square&logo=redis&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?style=flat-square&logo=socket.io&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Containerised-2496ED?style=flat-square&logo=docker&logoColor=white)

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
- [Performance](#-performance)
- [Testing](#-testing)
- [Architecture Decisions](#-architecture-decisions)
- [Deployment](#-deployment)
- [Security Features](#-security-features)
- [What Makes SwiftAid Different](#-what-makes-swiftaid-different)
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

- ⚡ Finds the **nearest available ambulance** using Redis geo-spatial queries in **<5ms**
- 🏥 Routes patients to the **best hospital** — scored on bed availability, distance, and specialty
- 🚨 Prioritises **critical cases first** using a priority queue (cardiac = 100, trauma = 80, general = 50)
- 📍 Tracks ambulances in **real-time** via WebSockets with live ETA updates every 3 seconds
- 🔄 **Auto-reassigns** if a driver doesn't respond within 30 seconds
- 📱 Sends **push notifications** to patients, drivers, and hospital admins via FCM

---

## 🌐 Live Demo

| Resource | URL |
|----------|-----|
| 🌐 Frontend | https://swift-aid-pi.vercel.app |
| 🔧 Backend API | https://swiftaid-klqt.onrender.com |
| ❤️ Health Check | https://swiftaid-klqt.onrender.com/health |

> ⚠️ **Note:** Backend runs on Render free tier — first request after inactivity may take ~30 seconds to wake up. Open the health check URL before your demo.

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
- Driver broadcasts GPS coordinates every **3 seconds** via Socket.io WebSocket
- Patient sees ambulance moving on live **Leaflet.js map**
- ETA recalculates dynamically as ambulance moves using **Haversine formula**
- Heartbeat TTL detection — ambulance auto-marked **OFFLINE** if no ping in 90 seconds
- Auto-reassignment to next nearest ambulance within 30 seconds

### 📍 2. Geo-Based Smart Matching
- Ambulance locations stored in **Redis geo pool** using `GEOADD`
- `GEORADIUS` / `GEOSEARCH` finds nearest available ambulance in **<5ms**
- Search radius auto-expands: 10km → 20km → 50km if no ambulance found
- **Atomic locking** with Redis `SET NX` prevents double-assignment race conditions

### 🏥 3. Hospital Availability Routing
```
Score = (availableBeds/totalBeds × 0.4) + (distanceScore × 0.4) + (specialtyMatch × 0.2)
```
- Scores ALL hospitals within 20km simultaneously
- Routes to **highest-scoring** hospital — not just nearest
- Bed count **auto-decrements** on assignment, **restores** on trip completion
- Specialty matching (cardiac → cardiology, trauma → trauma unit)

### 🚨 4. Priority-Based Dispatch
```
Cardiac      → Score 100  ← served first
Trauma       → Score 80
Respiratory  → Score 70
General      → Score 50
Non-emergency→ Score 10   ← served last
```

### 🔒 5. Security & Reliability
- JWT auth + 4-role RBAC (patient / driver / hospital_admin / super_admin)
- Rate limiting: 5 emergency requests/minute, 10 login attempts/15 minutes
- Audit logging: every action logged with actor, IP, timestamp
- Error boundary: React crashes show friendly error screen

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
│   MONGODB ATLAS      │              │    UPSTASH REDIS         │
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
| **Node.js + Express** | REST API server | Non-blocking I/O — handles 1,190+ req/sec |
| **MongoDB Atlas** | Persistent storage | Native GeoJSON, flexible schema |
| **Upstash Redis** | Geo-matching + queues | In-memory = <5ms vs 50ms MongoDB |
| **Socket.io** | Real-time tracking | Rooms, auto-reconnect, fallback polling |
| **JWT** | Authentication | Stateless, mobile-friendly |
| **bcryptjs** | Password hashing | 12 salt rounds |
| **Firebase Admin** | Push notifications | Reaches offline devices |

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 18** | Component UI |
| **React Router v6** | Client-side routing |
| **Leaflet.js** | Interactive maps (free, no API key) |
| **Socket.io Client** | Real-time location updates |
| **Axios** | HTTP with JWT interceptor |

### DevOps & Infrastructure
| Technology | Purpose |
|-----------|---------|
| **Docker + Compose** | Local containerisation |
| **Render** | Backend hosting (Node) |
| **Vercel** | Frontend hosting (React) |
| **MongoDB Atlas** | Cloud database (free tier) |
| **Upstash Redis** | Cloud Redis (free tier, Mumbai) |
| **GitHub Actions** | CI pipeline (32s, runs on every push) |

---

## 📊 Data Models

### User
```javascript
{
  name, email (unique), phone (unique),
  password (bcrypt 12 rounds),
  role: ['patient', 'driver', 'hospital_admin', 'super_admin'],
  ambulanceId, hospitalId, fcmToken, isActive
}
```

### Ambulance
```javascript
{
  vehicleNumber (unique), driverId,
  status: ['available', 'busy', 'offline'],
  location: GeoJSON Point,
  ambulanceType: ['basic', 'advanced', 'cardiac', 'neonatal'],
  currentTripId, totalTripsCompleted, lastActiveAt
}
```

### Hospital
```javascript
{
  name, registrationNumber, location: GeoJSON Point,
  address, totalBeds, availableBeds,
  emergencyCapacity: { total, available },
  specialties: ['cardiology', 'trauma', 'general', ...],
  isAcceptingEmergencies, adminId
}
```

### EmergencyRequest
```javascript
{
  patientId, pickupLocation: GeoJSON Point,
  emergencyType: ['cardiac', 'trauma', 'respiratory', 'general', 'non_emergency'],
  priorityScore (auto-calculated),
  status: ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'completed', 'failed'],
  assignedAmbulanceId, assignedHospitalId, assignmentAttempts
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

### Emergency Requests
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/requests` | Patient | Submit emergency (rate limited: 5/min) |
| GET | `/api/requests/my` | Patient | Get my requests |
| GET | `/api/requests/:id` | All | Get request details |
| PATCH | `/api/requests/:id/status` | Driver | Advance trip status |

### Ambulances
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/ambulances` | Super Admin | Add to fleet |
| GET | `/api/ambulances/my` | Driver | Get my ambulance |
| PATCH | `/api/ambulances/status` | Driver | Go online/offline |
| PATCH | `/api/ambulances/:id/assign-driver` | Super Admin | Assign driver |

### Hospitals
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/hospitals` | Super Admin | Register hospital |
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

---

## 📡 Real-Time Events (Socket.io)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join_trip` | `{ tripId }` | Join trip room |
| `location_update` | `{ tripId, ambulanceId, lng, lat }` | Driver GPS (every 3s) |
| `status_update` | `{ tripId, requestId, status }` | Driver status change |
| `heartbeat` | `{ ambulanceId }` | Keep-alive every 30s |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `ambulance_location` | `{ lng, lat, etaMinutes }` | Live location broadcast |
| `trip_status_update` | `{ status, message }` | Status notification |
| `heartbeat_ack` | `{ timestamp }` | Heartbeat confirmed |

---

## 🚀 Getting Started

```bash
git clone https://github.com/aabha40/SwiftAid.git
cd SwiftAid
cp .env.example .env      # fill in your values
npm install
node server/index.js      # backend at localhost:5000

cd client
npm install
npm start                 # frontend at localhost:3000
```

---

## 🐳 Docker Setup

```bash
docker-compose up --build   # starts backend + MongoDB + Redis
docker-compose down         # stop all
docker-compose logs -f      # view logs
```

---

## 📁 Project Structure

```
SwiftAid/
├── server/
│   ├── config/         # db, redis, socket, firebase
│   ├── controllers/    # auth, ambulance, hospital, request, admin
│   ├── middleware/     # auth, rbac, rateLimiter, errorHandler
│   ├── models/         # User, Ambulance, Hospital, EmergencyRequest, Trip, AuditLog
│   ├── routes/         # Express routers
│   ├── services/       # geoMatch, hospitalScore, eta, notification, auditLogger
│   ├── socket/         # locationHandler, statusHandler, heartbeatHandler
│   ├── tests/          # algorithms.test.js (20 unit tests)
│   └── utils/          # constants
├── client/src/
│   ├── api/            # axios with JWT interceptor
│   ├── context/        # AuthContext
│   ├── components/     # Sidebar, ErrorBoundary
│   └── pages/          # auth, patient, driver, hospital, admin
├── docs/
│   └── decisions.md    # 6 Architectural Decision Records (ADR)
├── .github/workflows/  # ci.yml — GitHub Actions
├── Dockerfile
├── docker-compose.yml
├── render.yaml         # Render deployment config
└── .env.example
```

---

## 👥 User Roles

| Role | Can do |
|------|--------|
| **Patient** | Request ambulance, track live on map, view history |
| **Driver** | Go online/offline, receive assignments, update trip status |
| **Hospital Admin** | Update bed count, toggle emergency acceptance, see incoming patients |
| **Super Admin** | Add ambulances/hospitals, assign drivers, view all stats |

---

## 🧮 Algorithms

### Geo-Matching
```
1. GEORADIUS search within 10km
2. For each result (nearest first):
   → SET lock:ambulance:ID NX EX 30
   → If OK → claimed atomically
   → If null → try next nearest
3. Expand to 20km, then 50km if empty
4. Mark request FAILED if none found
```

### Hospital Scoring
```
bedScore      = availableBeds / totalBeds         (40%)
distanceScore = 1 - (distanceKm / 50)             (40%)
specialtyScore = 1 if specialty matches, else 0   (20%)
finalScore = (bed × 0.4) + (dist × 0.4) + (spec × 0.2)
```

### Haversine Distance
```
d = 2R × arcsin(√(sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlng/2)))
R = 6371 km
```

---

## 📈 Performance

> Load tested with autocannon — 50 concurrent connections, 10 seconds

```bash
autocannon -c 50 -d 10 http://localhost:5000/health
```

| Metric | Result |
|--------|--------|
| **Throughput (avg)** | **1,190 req/sec** |
| **Throughput (peak)** | 1,455 req/sec |
| **Average latency** | **41ms** |
| **P50 latency** | 36ms |
| **P99 latency** | 163ms |
| **Total (10s)** | 12,000 requests |
| **Geo-matching** | <5ms (Redis) |
| **Auth verify** | <1ms (JWT) |
| **DB queries** | <20ms (MongoDB indexed) |

---

## 🧪 Testing

```bash
npm test    # runs 20 unit tests
```

```
✓ Priority Queue — 8 tests (cardiac=100, trauma=80 ...)
✓ ETA Calculation — 6 tests
✓ Haversine Distance — 5 tests
✓ Hospital Scoring — 7 tests
────────────────────────────
Tests: 20 passed ✅
```

CI runs on every push to `main` — syntax check + algorithm tests in 32 seconds.

---

## 📐 Architecture Decisions

Full reasoning in [`docs/decisions.md`](docs/decisions.md):

| ADR | Decision | Why |
|-----|----------|-----|
| ADR-001 | Redis for geo-matching | <5ms vs 50ms MongoDB |
| ADR-002 | Socket.io over raw WS | Rooms, auto-reconnect, fallback |
| ADR-003 | JWT over sessions | Stateless, scales horizontally |
| ADR-004 | MongoDB over PostgreSQL | Native GeoJSON, flexible schema |
| ADR-005 | Node.js over Java/Python | Non-blocking I/O for concurrent GPS pings |
| ADR-006 | Docker Compose | One-command local stack |

---

## 🚀 Deployment

| Layer | Platform | URL |
|-------|----------|-----|
| Frontend | Vercel | swift-aid-pi.vercel.app |
| Backend | Render (Node, free) | swiftaid-klqt.onrender.com |
| Database | MongoDB Atlas (free M0) | ap-south-1 Mumbai |
| Cache | Upstash Redis (free) | ap-south-1 Mumbai |
| CI/CD | GitHub Actions | triggers on every push |

```bash
# Local full stack
docker-compose up --build
```

---

## 🎯 What Makes SwiftAid Different

| Feature | Traditional 108 | SwiftAid |
|---------|----------------|----------|
| Ambulance matching | Manual dispatcher | Redis geo in <5ms |
| Hospital selection | Nearest | Weighted score (beds+dist+specialty) |
| Patient tracking | Phone calls | Live WebSocket map |
| Priority handling | First-come | Priority queue (cardiac first) |
| Driver offline | Manual follow-up | Auto-reassign in 30s |
| Concurrent safety | None | Atomic Redis locking |
| Throughput | — | 1,190 req/sec |

---

## 🛡️ Security

- JWT (7-day expiry) + bcrypt (12 rounds)
- Rate limiting: 5 emergency/min, 10 login/15min
- RBAC: 4 roles, strict endpoint access
- Coordinate validation + emergency type whitelist
- Audit log: every action with actor + IP + timestamp
- Helmet.js security headers
- CORS: production domains only

---

## 👩‍💻 Author

**Aabha Shukla**
- 🎓 B.Tech CS-AI, Banasthali Vidyapith (CGPA: 9.20, graduating May 2026)
- 💼 Salesforce Futureforce Intern
- 🔬 CDAC Research Intern — HBase/Hadoop/Phoenix
- 💻 200+ LeetCode problems
- 📧 aabhashukla7534@gmail.com
- 🔗 [LinkedIn](https://linkedin.com/in/aabha-shukla)
- 🐙 [GitHub](https://github.com/aabha40)

---

<div align="center">

**Built with ❤️ for India's emergency response system**

*SwiftAid — Because every second counts* 🚑

[![Live Demo](https://img.shields.io/badge/Try%20SwiftAid%20Live-swift--aid--pi.vercel.app-e94560?style=for-the-badge)](https://swift-aid-pi.vercel.app)

</div>
