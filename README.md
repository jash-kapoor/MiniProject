# VoxAssess — AI Interview Evaluation Platform

An intelligent, AI-powered interview evaluation system with real-time proctoring, speech analysis, and role-based dashboards.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688?logo=fastapi)

---

## 🌟 Features

- **AI-Powered Evaluation** — Whisper Speech-to-Text + NLP scoring for fluency, vocabulary, confidence, and content relevance.
- **Real-Time Proctoring** — YOLOv8 object detection for phone/person monitoring during interviews.
- **Eye Contact Tracking** — MediaPipe-based gaze analysis.
- **Role-Based Dashboards** — Separate views for Candidates and HR/Recruiters.
- **Live Interview Sessions** — Real-time video interviews with AI monitoring.

---

## 🛠️ Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Next.js 16, React, Tailwind CSS, Framer Motion |
| Backend   | FastAPI, SQLAlchemy, SQLite         |
| AI/ML     | OpenAI Whisper, YOLOv8, MediaPipe   |
| Auth      | JWT (python-jose), bcrypt           |

---

## 💻 Prerequisites

Before running this project, ensure your system has the following installed:

- **Python** 3.10+ (3.12 recommended)
- **Node.js** 18+ (with npm)
- **Git**
- **FFmpeg** (Required for Whisper audio processing)
  - **Windows**: Install via Winget: `winget install Gyan.FFmpeg`
  - **macOS**: Install via Homebrew: `brew install ffmpeg`
  - **Linux**: Install via apt: `sudo apt install ffmpeg`

---

## 🚀 Complete Local Setup Guide

Follow these steps to get both the frontend and backend running locally on your machine.

### 1. Clone the Repository

```bash
git clone https://github.com/jash-kapoor/MiniProject.git
cd MiniProject
```

### 2. Backend Setup (FastAPI & AI Models)

The backend handles the AI video analysis, transcription, scoring, and database interactions.

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create a Python virtual environment
python -m venv venv

# 3. Activate the virtual environment
# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# 4. Install all required dependencies
pip install -r requirements.txt

# 5. Initialize/Seed the database (Optional but recommended for test users)
python seed_db.py

# 6. Start the backend server
uvicorn main:app --reload
```

> **Important Notes:** 
> - The backend will run on **http://127.0.0.1:8000**.
> - On the very first run, YOLO model weights (`yolov8n.pt`) and Whisper base models will be downloaded automatically. This may take a few minutes depending on your internet speed.

### 3. Frontend Setup (Next.js Application)

The frontend provides the user interface for candidates and recruiters. Open a **new terminal window** (keep the backend running) and follow these steps:

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node.js dependencies
npm install

# 3. Start the development server
npm run dev
```

> The frontend will run on **http://localhost:3000**.

---

## ⚙️ Environment Variables (Optional)

If you plan on using live video streams, you will need to configure environment variables.

1. Navigate to the `backend/` directory.
2. Copy the example file: `cp .env.example .env`
3. Update the values in `.env`:

| Variable            | Description              | Default / Fallback |
|---------------------|--------------------------|--------------------|
| `SECRET_KEY`        | JWT signing secret       | `your_secret_key`  |
| `STREAM_API_KEY`    | Stream Video API key     | Required for Live  |
| `STREAM_API_SECRET` | Stream Video API secret  | Required for Live  |

---

## 🎮 Usage Guide

Once both servers are running, navigate to [http://localhost:3000](http://localhost:3000) in your browser.

### Authentication
- **Sign Up**: Go to `/signup` to create a candidate account.
- **Login**: Go to `/login` to access the platform.

### Candidate Experience
- **Homepage**: Personalized welcome and quick stats.
- **Practice Interview**: Navigate to `/practice` to test your environment and start AI-monitored interviews.
- **Live Interview Room**: During the interview (`/interview`), your webcam captures your responses, monitors your eye contact, and ensures proctoring compliance.
- **Results Dashboard**: Navigate to `/dashboard` to view detailed insights and scores on past performances.

### Recruiter (HR) Experience
- **HR Dashboard**: Access `/hr-dashboard` to view all candidate assessments.
- **Link Generation**: Generate unique live interview links to distribute to applicants.
> *Note: To set a user as HR, manually update their `role` field to `"hr"` in the local SQLite database.*

---

## 📚 API Documentation

Once the backend is actively running, you can explore the interactive API docs:
- **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
