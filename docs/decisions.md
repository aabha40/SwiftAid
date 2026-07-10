# Architectural Decision Records (ADR)

> This document explains the key technical decisions made while building SwiftAid
> and the reasoning behind each choice.

---

## ADR-001: Redis for Geo-Matching instead of MongoDB

**Date:** January 2025
**Status:** Accepted

### Context
We needed to find the nearest available ambulance to a patient's GPS location in real time. This query runs on every emergency request — potentially hundreds per minute.

### Options considered
| Option | Latency | Notes |
|--------|---------|-------|
| MongoDB $near query | ~50ms | Disk-based, slower under load |
| Redis GEORADIUS | <5ms | In-memory, 10x faster |
| PostGIS (PostgreSQL) | ~30ms | Requires separate DB setup |

### Decision
**Redis GEORADIUS / GEOSEARCH** for ambulance geo-pool.

### Reasoning
- Redis stores geo data as a sorted set in RAM — no disk I/O
- GEORADIUS returns sorted results (nearest first) in a single command
- Our ambulance pool is small (<1000 entries) — fits entirely in memory
- Redis also handles our priority queue and rate limiting — fewer moving parts

### Consequences
- Redis must be kept running (data lost on restart) → solved by `syncAmbulancesToRedis()` on startup
- Added complexity of managing two databases → justified by 10x latency improvement

---

## ADR-002: Socket.io instead of raw WebSockets

**Date:** January 2025
**Status:** Accepted

### Context
Ambulance GPS coordinates need to be pushed to patients every 3 seconds. This requires a persistent bidirectional connection.

### Options considered
| Option | Pros | Cons |
|--------|------|------|
| Raw WebSocket (ws library) | Lightweight, standard | No rooms, no auto-reconnect, manual heartbeat |
| Socket.io | Rooms, auto-reconnect, fallback | Slightly heavier |
| Server-Sent Events (SSE) | Simple | One-way only, can't receive from driver |
| Long polling | Universal | High latency, wasteful |

### Decision
**Socket.io** with room-based architecture.

### Reasoning
- **Rooms** let us scope broadcasts: only the patient for trip X receives ambulance X's location updates — no broadcast flooding
- **Auto-reconnect** handles mobile network drops without user action
- **Fallback to long polling** ensures it works on restrictive networks
- **JWT middleware** integrates cleanly with our existing auth system

### Consequences
- Socket.io adds ~200KB to frontend bundle → acceptable for the features gained
- Server must maintain WebSocket connections in memory → stateful, but manageable for our scale

---

## ADR-003: JWT instead of Session-based auth

**Date:** January 2025
**Status:** Accepted

### Context
We have 4 different user roles accessing the API from a web frontend and (eventually) a mobile app.

### Options considered
| Option | Pros | Cons |
|--------|------|------|
| JWT (stateless) | No server storage, works across domains, mobile-friendly | Token revocation is harder |
| Session + Redis | Easy revocation | Requires session store, sticky sessions for horizontal scale |
| OAuth2 (Firebase Auth) | Managed, Google login | External dependency, overkill for our use case |

### Decision
**JWT with 7-day expiry** stored in localStorage.

### Reasoning
- Stateless — no session store needed, scales horizontally without sticky sessions
- Works identically for web and mobile (just send the header)
- Role is embedded in the token payload — no database lookup on every request
- 7-day expiry balances security and UX (emergency app shouldn't log out mid-trip)

### Consequences
- Cannot instantly revoke a token if compromised → mitigated by short expiry + rate limiting
- localStorage is vulnerable to XSS → mitigated by Helmet.js CSP headers

---

## ADR-004: MongoDB instead of PostgreSQL

**Date:** January 2025
**Status:** Accepted

### Context
We need to store users, ambulances, hospitals, emergency requests, trips, and audit logs.

### Options considered
| Option | Pros | Cons |
|--------|------|------|
| MongoDB | Native GeoJSON, flexible schema, Mongoose ODM | No ACID transactions by default |
| PostgreSQL + PostGIS | Full ACID, powerful geo queries | More setup, rigid schema |
| MySQL | Simple, familiar | No native geo support |

### Decision
**MongoDB** for primary storage.

### Reasoning
- **Native GeoJSON** support: `$near`, `$geoWithin`, `2dsphere` index work out of the box
- **Flexible schema**: EmergencyRequest fields evolved during development — no migrations needed
- **Capped collections**: AuditLog uses MongoDB capped collection for automatic FIFO rotation
- **Mongoose ODM**: Pre-save hooks let us auto-calculate `priorityScore` before saving

### Consequences
- No foreign key constraints → enforced at application level via Mongoose validators
- Multi-document transactions possible but not needed for our use cases

---

## ADR-005: Node.js + Express instead of Python/FastAPI or Java/Spring

**Date:** January 2025
**Status:** Accepted

### Context
Choosing the backend language and framework for the API server.

### Options considered
| Option | Pros | Cons |
|--------|------|------|
| Node.js + Express | Non-blocking I/O, same language as frontend, huge ecosystem | Single-threaded |
| Python + FastAPI | ML-friendly, async support | Different language from frontend |
| Java + Spring Boot | Enterprise-grade, strong typing | Verbose, slower development |
| Go + Gin | Very fast | Steeper learning curve |

### Decision
**Node.js + Express**.

### Reasoning
- **Non-blocking I/O** is critical for our use case: handling 100+ concurrent WebSocket connections (GPS pings every 3 seconds from multiple drivers) without blocking the event loop
- **Same language as frontend** — share validation logic, constants, and types
- **Socket.io** is a Node.js-native library with best-in-class support
- **Express middleware** pattern maps perfectly to our auth → RBAC → rate-limit → handler pipeline

### Consequences
- CPU-intensive tasks (like running ML models) would block the event loop → not a concern for our use case
- Should add clustering (`cluster` module) before handling 1000+ concurrent users in production

---

## ADR-006: Docker Compose for local development

**Date:** February 2025
**Status:** Accepted

### Context
SwiftAid requires 3 services to run: Node.js backend, MongoDB, and Redis. New developers setting this up manually is error-prone and time-consuming.

### Decision
**Docker Compose** with separate service definitions for MongoDB, Redis, and backend.

### Reasoning
- `docker-compose up --build` starts the entire stack in one command
- Consistent environment across Windows, Mac, and Linux
- Named volumes persist data between container restarts
- Port remapping (27018:27017, 6380:6379) avoids conflicts with local installations

### Consequences
- Docker Desktop required → adds ~2GB to developer machine requirements
- Build time ~2 minutes on first run → cached on subsequent runs
