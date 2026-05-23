# 🚼 DevPulse – Internal Tech Issue & Feature Tracker

A collaborative platform for software teams to report bugs, suggest features, coordinate resolutions, and track internal system metrics efficiently.

---

## 🚀 Live URL
- **Backend API Deployment:** `https://your-deployed-api-link.com` 

---

## ✨ Features
- **Role-Based Access Control (RBAC):** Distinct permissions enforced automatically for `contributor` and `maintainer` roles.
- **Secure Authentication System:** Password protection using `bcrypt` (8-12 salt rounds) and session management via signed JSON Web Tokens (JWT).
- **Comprehensive Issues Management:** Supports creating, retrieving, updating, and deleting system issues with automated validation.
- **Advanced Filtering & Sorting:** Fetch issues with dynamic queries based on `type`, `status`, and creation time (`newest`/`oldest`).
- **Smart Data Aggregation:** Fetches related reporter details for entries natively using batching optimization without utilizing heavy SQL JOINs.

---

## 🛠️ Technology Stack
- **Runtime Environment:** Node.js (LTS v24.x or higher)
- **Language:** TypeScript
- **Framework:** Express.js (Modular router architecture)
- **Database:** PostgreSQL (Neon DB via native `pg` driver only)
- **Query Execution:** Raw SQL (Direct `pool.query()` calls without ORMs/Query Builders)
- **Security:** `bcrypt` for hashing, `jsonwebtoken` (JWT) for authentication

---

## 🗄️ Database Schema Summary

### 1. `users` Table
| Field | Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique identifier for each account |
| `name` | VARCHAR(50) | NOT NULL | Full display name of the member |
| `email` | VARCHAR(100) | UNIQUE, NOT NULL | Valid unique login address |
| `password` | VARCHAR(100) | NOT NULL | Encrypted hashed password string |
| `role` | VARCHAR(20) | DEFAULT 'contributor' | Level access: `contributor` or `maintainer` |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last account update timestamp |

### 2. `issues` Table
| Field | Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique identifier for each reported item |
| `title` | VARCHAR(150) | NOT NULL | Descriptive headline (max 150 chars) |
| `description`| TEXT | NOT NULL | Detailed problem/suggestion (min 20 chars)|
| `type` | VARCHAR(50) | NOT NULL | Categorizes entry: `bug` or `feature_request`|
| `status` | VARCHAR(20) | DEFAULT 'open' | State: `open`, `in_progress`, or `resolved` |
| `reporter_id` | INT | NOT NULL | References `users.id` (Validated in logic) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Issue submission timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last issue update timestamp |

---

## ⚙️ Setup Steps

### Prerequisites
Make sure you have **Node.js (v24.x+)** and **npm** installed on your system.

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd express-server