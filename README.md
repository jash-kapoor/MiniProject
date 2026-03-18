# VoxAssess — AI Interview Evaluation Platform

An intelligent, AI-powered interview evaluation system with real-time proctoring, speech analysis, and role-based dashboards.

![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688?logo=fastapi)

---

## Features

- **AI-Powered Evaluation** — Whisper Speech-to-Text + NLP scoring for fluency, vocabulary, confidence, and content relevance
- **Real-Time Proctoring** — YOLOv8 object detection for phone/person monitoring during interviews
- **Eye Contact Tracking** — MediaPipe-based gaze analysis
- **Role-Based Dashboards** — Separate views for Candidates and HR/Recruiters
- **Live Interview Sessions** — Real-time video interviews with AI monitoring
- **Dynamic Homepage** — Content adapts based on login state and user role

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Next.js 16, React, Tailwind CSS, Framer Motion |
| Backend   | FastAPI, SQLAlchemy, SQLite         |
| AI/ML     | OpenAI Whisper, YOLOv8, MediaPipe   |
| Auth      | JWT (python-jose), bcrypt           |

---

## Project Structure

```
voxassess-ai/
├── backend/              # FastAPI backend
│   ├── main.py           # Main application & API routes
│   ├── models.py         # SQLAlchemy database models
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── auth.py           # JWT authentication utilities
│   ├── database.py       # Database connection setup
│   ├── monitoring.py     # YOLO + proctoring logic
│   ├── scoring.py        # NLP scoring engine
│   ├── whisper_model.py  # Whisper transcription
│   ├── routers/          # Modular API routers
│   └── requirements.txt  # Python dependencies
├── frontend/             # Next.js frontend
│   ├── src/
│   │   ├── app/          # Next.js app router pages
│   │   └── components/   # Reusable React components
│   └── package.json
└── README.md
```

---

## Prerequisites

- **Python** 3.10+ (3.12 recommended)
- **Node.js** 18+ (with npm)
- **Git**

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/jash-kapoor/MiniProject.git
cd MiniProject
```

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn main:app --reload
```

The backend will be running at **http://127.0.0.1:8000**.

> **Note:** On first run, YOLO model weights (`yolov8x.pt`) will be downloaded automatically if not present.

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be running at **http://localhost:3000**.

### 4. Open the App

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

---

## Usage

### Sign Up & Login

1. Go to `/signup` and create an account (default role: `candidate`).
2. Log in at `/login`.

### Candidate Flow

- **Homepage** — Personalized welcome, quick stats, links to practice and dashboard
- **Practice Interview** (`/practice`) — Start AI-monitored practice interviews
- **Interview Page** (`/interview`) — Answer questions with webcam, get real-time proctoring + AI scoring
- **Dashboard** (`/dashboard`) — View past interviews and scores

### HR / Recruiter Flow

- **Homepage** — Recruiter welcome, link generation
- **HR Dashboard** (`/hr-dashboard`) — View all candidate assessments, generate live interview links, export data

> To set a user as HR, update their `role` field to `"hr"` in the database.

---

## API Documentation

Once the backend is running, visit:

- **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## Environment Variables (Optional)

| Variable            | Default               | Description              |
|---------------------|-----------------------|--------------------------|
| `SECRET_KEY`        | (hardcoded fallback)  | JWT signing secret       |
| `STREAM_API_KEY`    | `placeholder_api_key` | Stream Video API key     |
| `STREAM_API_SECRET` | `placeholder_api_secret` | Stream Video API secret |

---

## License

This project is for educational and demonstration purposes.
