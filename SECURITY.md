# Security Policy

## Supported Versions
| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅        |

## Reporting a Vulnerability
Please report security vulnerabilities to: aabhashukla7534@gmail.com

Do NOT open a public GitHub issue for security vulnerabilities.

## Security Features
- JWT authentication with 7-day expiry
- bcrypt password hashing (12 salt rounds)
- Rate limiting: 5 emergency requests/minute
- RBAC: 4 roles with strict endpoint access control
- Input validation on all coordinates
- Audit logging of every action
- Helmet.js security headers
- CORS restricted to known domains
