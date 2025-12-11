# 📦 AssetVault – Smart IT Asset Management System

AssetVault is a lightweight but powerful system for tracking company IT equipment such as laptops, desktops, printers, UPS units and more.
It helps organisations know:

* **What items they own**
* **Who is using them**
* **Where they are**
* **When they were last serviced**
* **What happened to them over time**

This project includes both a **React frontend** and a **FastAPI backend** connected to a **MySQL database**.

---

# 🚀 Main Features

### ✅ Inventory Management

Store details of all IT equipment with:

* Item ID
* Name
* Serial number
* Model
* Department
* Owner
* Notes
* Photos

### ✅ Assign → Transfer → Return

Easily track who is currently holding which item:

* Assign items to employees
* Transfer items between employees
* Mark items as returned
* View full history of movements

### ✅ People & Departments

Manage employees and organise them into departments.
See which employees currently hold active assets.

### ✅ Service / Maintenance Tracking

Record:

* Last service date
* Notes
* Service location

Automatically shows whether an item is:

* **OK**
* **Due Soon**
* **Overdue**
* **Never Serviced**

### ✅ Dashboard

A quick overview of:

* Total items
* In-use vs available
* Category breakdown (Laptops, Desktops, Printers, UPS, Other)
* Department usage summary

### ✅ Event Log

Every action recorded:

* Assignments
* Returns
* Transfers
* Services

Transparent and auditable.

---

# 🧩 System Architecture (Simple Explanation)

```
React (Frontend)  →  FastAPI (Backend)  →  MySQL (Database)  
         ↑                 ↓  
     Axios API         File Uploads
```

* **React** handles all screens, user actions, and visuals
* **Axios** sends requests to the backend
* **FastAPI** contains all business logic
* **MySQL** stores item details, people, assignments, entries, and service records

---

# 📁 Frontend Pages (Simple Guide)

### 🔐 Login

User enters username + password → system returns a JWT token for authentication.

---

### 📊 Dashboard

A clean summary of:

* Total assets
* Assets in-use
* Availability
* Category statistics
* Department distribution

---

### 📁 Items

Manage all equipment:

* View list
* Search by name, ID, or serial
* Add new items
* Edit items
* Upload photos
* Delete items (only if not assigned)

---

### 👥 Directory

A quick view of all people and departments in the organisation.

---

### 🧑‍💼 People (Admin)

Add, edit, or remove employees.
System prevents deleting someone who still has assigned equipment.

---

### 🏢 Departments (Admin)

Organise people by departments.
Prevents deleting departments with existing staff.

---

### 🧾 Assignments

Select an item → Select a person → Assign.
Includes:

* Transfer to another person
* Mark return to stock
* See who currently holds an item

---

### 🔧 Services

Track maintenance and servicing:

* Add service records
* View history
* See items overdue for service

---

### 📜 Entries

Timeline of all system actions:
assign, return, transfer, service.

Useful for audits and transparency.

---

### 🛠️ Admin Panel

A central place for:

* Managing users
* Departments
* People
* CSV imports
* Advanced item tools

---

# 🔌 Backend Summary (Simple)

### Major API Groups

| Purpose        | Endpoints                                   |
| -------------- | ------------------------------------------- |
| Authentication | `/auth/login`, `/auth/me`, `/auth/register` |
| Users          | `/users` CRUD (Admin only)                  |
| Items          | Add, edit, delete, search, photos           |
| Assignments    | Assign → Transfer → Return                  |
| People         | CRUD + history + active items               |
| Departments    | CRUD                                        |
| Services       | Add record, list, check status              |
| Dashboard      | `/dashboard/summary`                        |
| Entry Logs     | `/entries`                                  |

### Special Backend Rules

* Prevent deleting people with active assignments
* Prevent deleting departments with people inside
* Prevent deleting items that are still assigned
* Ensures max 5 photos per item
* Auto-detects category from name if not provided
  (Laptop, Desktop, Printer, UPS, Other)

---

# 📦 How to Run (Very Simple)

### ▶️ Start Backend (FastAPI)

1. Install Python packages:

```bash
pip install fastapi uvicorn mysql-connector-python python-multipart python-jose passlib[bcrypt]
```

2. Start API:

```bash
uvicorn api:app --reload --port 8000
```

### ▶️ Start Frontend (React)

```bash
npm install
npm run dev
```

Make sure your Vite proxy redirects `/api` → `http://localhost:8000`.

---

# 🌱 Why This Project Exists

AssetVault was built to solve a real-world IT problem:

> Companies often lose track of who holds what laptop, which printer belongs to which room, and when devices were last serviced.

This system gives clarity, accountability, and a professional way to manage IT equipment.

---

# 💡 Future Improvements

* Role-based UI hiding admin components
* Export reports (PDF/CSV)
* Alerts for service due dates
* QR code & barcode scanning
* Mobile-friendly layout

---


