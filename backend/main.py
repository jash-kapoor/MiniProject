import base64
import csv
import io
import os
import shutil
import sys
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

import cv2
import numpy as np
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    Request,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Add current directory to path for local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database
import models
import asyncio
from auth import get_current_user, require_hr
from monitoring import analyze_frame
from routers import interviews, stream, users, questions
from cleanup import cleanup_old_recordings
from pdf_generator import generate_interview_pdf
from rate_limit import limiter
from upload_security import secure_filename, validate_audio_upload
from config import settings
from pathlib import Path
from scoring import (
    analyze_sentiment,
    calculate_rolling_confidence,
    calculate_score,
    extract_speech_features,
    score_with_gemini,
)
from whisper_model import transcribe_audio

# Create database tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="VoxAssess API", description="AI Interview Evaluation System API")

# Configure CORS — must be added before routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(interviews.router)
app.include_router(stream.router)
app.include_router(questions.router)

@app.on_event("startup")
async def on_startup():
    # Seed default questions if table is empty
    db = next(database.get_db())
    try:
        if db.query(models.Question).count() == 0:
            default_questions = [
                models.Question(text="Tell me about yourself and your professional background.", category="general", difficulty="easy"),
                models.Question(text="What is your greatest strength and how has it helped you professionally?", category="behavioral", difficulty="easy"),
                models.Question(text="Describe a challenging project you led. What was the outcome?", category="behavioral", difficulty="medium"),
                models.Question(text="Where do you see yourself in 5 years?", category="general", difficulty="easy"),
                models.Question(text="Why are you interested in this role?", category="general", difficulty="easy"),
                models.Question(text="Tell me about a time you had to handle a conflict with a teammate.", category="behavioral", difficulty="medium"),
                models.Question(text="What is your approach to problem-solving under pressure?", category="situational", difficulty="medium"),
                models.Question(text="Describe a situation where you had to learn something new quickly.", category="behavioral", difficulty="medium"),
                models.Question(text="How do you prioritize tasks when you have multiple deadlines?", category="situational", difficulty="medium"),
                models.Question(text="What makes you a good fit for our team?", category="general", difficulty="easy"),
            ]
            db.add_all(default_questions)
            db.commit()
            logger.info("Seeded %d default questions", len(default_questions))
    finally:
        db.close()

    # Start background cleanup
    asyncio.create_task(cleanup_old_recordings())

# Temp directory for uploaded files
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "temp_uploads")
RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RECORDINGS_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────
#  Helper: Get or create an InterviewReport row in the DB
# ─────────────────────────────────────────────────────────
def _get_or_create_report(db: Session, interview_id: int) -> models.InterviewReport:
    report = (
        db.query(models.InterviewReport)
        .filter(models.InterviewReport.interview_id == interview_id)
        .first()
    )
    if not report:
        report = models.InterviewReport(
            interview_id=interview_id,
            answers=[],
            monitoring=[],
            violations=[],
        )
        db.add(report)
        db.commit()
        db.refresh(report)
    return report


@app.get("/")
def read_root():
    return {"message": "Welcome to VoxAssess API"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "database": "configured"}


# ─────────────────────────────────────────────────────────
#  Live Sessions — SQLite-backed
# ─────────────────────────────────────────────────────────
@app.post("/live-sessions")
def create_live_session(
    interview_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    meeting_id = str(uuid.uuid4())
    live_session = models.LiveSession(
        meeting_id=meeting_id,
        interview_id=interview_id,
    )
    db.add(live_session)
    db.commit()
    return {"meetingId": meeting_id, "interview_id": interview_id}


@app.get("/live-sessions/{meeting_id}")
def get_live_session(
    meeting_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.LiveSession)
        .filter(models.LiveSession.meeting_id == meeting_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return {"interview_id": session.interview_id}


# ─────────────────────────────────────────────────────────
#  WebRTC Signaling (ephemeral, in-memory is acceptable)
# ─────────────────────────────────────────────────────────
class SDPPayload(BaseModel):
    meetingId: str
    sdp: Any

offers: dict = {}
answers: dict = {}
meeting_alerts: dict = {}


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, meeting_id: str, websocket: WebSocket):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)

    def disconnect(self, meeting_id: str, websocket: WebSocket):
        if meeting_id in self.active_connections:
            self.active_connections[meeting_id].remove(websocket)

    async def broadcast(self, meeting_id: str, message: dict):
        if meeting_id in self.active_connections:
            for connection in self.active_connections[meeting_id]:
                await connection.send_json(message)

manager = ConnectionManager()


@app.websocket("/ws/meeting/{meeting_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str):
    await manager.connect(meeting_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Broadcast signaling or other messages
            await manager.broadcast(meeting_id, data)
    except WebSocketDisconnect:
        manager.disconnect(meeting_id, websocket)
    except Exception:
        manager.disconnect(meeting_id, websocket)


class AlertPayload(BaseModel):
    meetingId: str
    isSuspicious: bool
    alerts: list


@app.post("/offer")
def post_offer(
    payload: SDPPayload,
    current_user: models.User = Depends(get_current_user),
):
    offers[payload.meetingId] = payload.sdp
    return {"status": "success"}


@app.get("/offer/{meeting_id}")
def get_offer(
    meeting_id: str,
    current_user: models.User = Depends(get_current_user),
):
    if meeting_id in offers:
        return {"sdp": offers[meeting_id]}
    return {"sdp": None}


@app.post("/answer")
def post_answer(
    payload: SDPPayload,
    current_user: models.User = Depends(get_current_user),
):
    answers[payload.meetingId] = payload.sdp
    return {"status": "success"}


@app.get("/answer/{meeting_id}")
def get_answer(
    meeting_id: str,
    current_user: models.User = Depends(get_current_user),
):
    if meeting_id in answers:
        return {"sdp": answers[meeting_id]}
    return {"sdp": None}


@app.post("/meeting-alerts")
def post_meeting_alerts(
    payload: AlertPayload,
    current_user: models.User = Depends(get_current_user),
):
    meeting_alerts[payload.meetingId] = {
        "is_suspicious": payload.isSuspicious,
        "alerts": payload.alerts
    }
    return {"status": "success"}


@app.get("/meeting-alerts/{meeting_id}")
def get_meeting_alerts(
    meeting_id: str,
    current_user: models.User = Depends(get_current_user),
):
    if meeting_id in meeting_alerts:
        return meeting_alerts[meeting_id]
    return {"is_suspicious": False, "alerts": []}


# ─────────────────────────────────────────────────────────
#  1. POST /transcribe — Whisper transcription
# ─────────────────────────────────────────────────────────
@app.post("/transcribe")
@limiter.limit("10/minute")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    """
    Accepts an audio file and returns the transcribed text.
    """
    content, original_name = await validate_audio_upload(file)
    file_name = f"{uuid.uuid4().hex}_{original_name}"
    file_path = Path(UPLOAD_DIR) / file_name
    try:
        with open(file_path, "wb") as f:
            f.write(content)

        transcript = transcribe_audio(str(file_path))
        
        # Real-time analytics for Live Room
        sentiment = analyze_sentiment(transcript)
        features = extract_speech_features(str(file_path), transcript)
        confidence_rolling = calculate_rolling_confidence(features)

        return {
            "transcript": transcript, 
            "filename": original_name,
            "sentiment": sentiment,
            "confidence_rolling": confidence_rolling
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass


# ─────────────────────────────────────────────────────────
#  2. POST /analyze-answer — Speech features + scoring
# ─────────────────────────────────────────────────────────
@app.post("/analyze-answer")
@limiter.limit("10/minute")
async def analyze_answer(
    request: Request,
    file: UploadFile = File(...),
    question: str = Form(""),
    interview_id: Optional[int] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Accepts an audio file, transcribes it, extracts speech features,
    and calculates an interview score.
    """
    content, original_name = await validate_audio_upload(file)
    temp_file_name = f"{uuid.uuid4().hex}_{original_name}"
    temp_file_path = Path(UPLOAD_DIR) / temp_file_name
    try:
        with open(temp_file_path, "wb") as f:
            f.write(content)

        # Step 1: Transcribe
        transcript = transcribe_audio(str(temp_file_path))

        # Step 2: Extract features
        features = extract_speech_features(str(temp_file_path), transcript)
        features["transcript"] = transcript

        # Step 3: Score
        ai_scored = False
        scores = None
        if os.environ.get("GEMINI_API_KEY"):
            scores = score_with_gemini(question, transcript)
            if scores:
                ai_scored = True
                
        if not scores:
            scores = calculate_score(features)

        # Step 4: Persist Audio
        timestamp = int(time.time())
        os.makedirs(RECORDINGS_DIR, exist_ok=True)
        safe_name = secure_filename(f"{timestamp}_{interview_id or 'anon'}_{original_name}")
        permanent_path = os.path.join(RECORDINGS_DIR, safe_name)
        shutil.move(str(temp_file_path), permanent_path)

        result = {
            "transcript": transcript,
            "audio_file_path": permanent_path,
            "features": {k: v for k, v in features.items() if k != "transcript"},
            "scores": scores,
            "ai_scored": ai_scored,
        }

        # Store in database if interview_id provided
        if interview_id:
            db_interview = db.query(models.Interview).filter(models.Interview.id == interview_id).first()
            if db_interview:
                report = _get_or_create_report(db, interview_id)
                current_answers = list(report.answers or [])
                current_answers.append(result)
                report.answers = current_answers
                report.updated_at = datetime.utcnow()
                db.commit()
                
                db_interview.status = "evaluating"
                db.commit()

        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        if temp_file_path.exists():
            try:
                temp_file_path.unlink()
            except Exception:
                pass


@app.post("/finalize-interview/{interview_id}")
async def finalize_interview(
    interview_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Calculates final scores from all answers and saves to the database.
    """
    report = (
        db.query(models.InterviewReport)
        .filter(models.InterviewReport.interview_id == interview_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="No interview data found for this session")

    answers_list = report.answers or []
    
    if not answers_list:
        raise HTTPException(status_code=400, detail="No answers recorded for this interview")

    # Calculate average scores
    avg_scores = {}
    score_keys = [
        "content_relevance", "fluency", "vocabulary", "confidence", 
        "structure", "fairness_score", "fairness_adjustment", "overall_score"
    ]
    for key in score_keys:
        values = [a["scores"][key] for a in answers_list if key in a.get("scores", {})]
        avg_scores[key] = sum(values) / len(values) if values else 0

    # Save to Database
    db_evaluation = models.Evaluation(
        interview_id=interview_id,
        speech_score=avg_scores.get("fluency", 0),
        nlp_score=avg_scores.get("content_relevance", 0),
        vision_score=avg_scores.get("confidence", 0),  # Simplified mapping
        fairness_score=avg_scores.get("fairness_score", 0),
        fairness_adjustment=avg_scores.get("fairness_adjustment", 0),
        overall_score=avg_scores.get("overall_score", 0),
        detailed_feedback={
            "summary": "Interview completed successfully",
            "metrics": avg_scores,
            "answers": answers_list,
            "monitoring": report.monitoring or [],
            "violations": report.violations or [],
        }
    )
    
    db.add(db_evaluation)
    
    db_interview = db.query(models.Interview).filter(models.Interview.id == interview_id).first()
    if db_interview:
        db_interview.status = "completed"
    
    db.commit()
    
    # Cleanup: delete the report row now that it's been finalized
    db.delete(report)
    db.commit()
    
    return {"message": "Interview finalized and saved", "evaluation_id": db_evaluation.id}


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    """
    Dedicated endpoint for real-time YOLO detection.
    """
    try:
        print("\n=== /detect API HIT ===")

        content = await file.read()

        if not content:
            raise HTTPException(status_code=400, detail="Empty file")

        nparr = np.frombuffer(content, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        print("FRAME RECEIVED:", frame.shape)

        # 🔥 CALL YOLO
        result = analyze_frame(frame)

        print("DETECTION ALERTS:", result.get("alerts", []))

        return {
            "alerts": result.get("alerts", []),
            "is_suspicious": result.get("is_suspicious", False),
            "person_count": result.get("person_count", 0),
            "objects": result.get("objects", [])
        }

    except Exception as e:
        print("❌ ERROR IN /detect:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/monitor-frame")
async def monitor_frame(
    file: UploadFile = File(None),
    interview_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Accepts a video frame (image file or base64-encoded in body)
    and runs face detection, eye contact, and object detection.
    """
    try:
        content = await file.read()
        nparr = np.frombuffer(content, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        s_id = str(interview_id) if interview_id else None
        result = analyze_frame(frame, s_id)

        # Store in report if interview_id provided
        if result["is_suspicious"] or result["person_count"] != 1:
            if interview_id:
                report = _get_or_create_report(db, interview_id)
                current_monitoring = list(report.monitoring or [])
                current_monitoring.append({
                    "face_detected": bool(result["face"]["detected"]),
                    "eye_contact": bool(result["eye_contact"]["detected"]),
                    "person_count": int(result["person_count"]),
                    "alerts": result["alerts"],
                    "is_suspicious": bool(result["is_suspicious"]),
                })
                report.monitoring = current_monitoring
                report.updated_at = datetime.utcnow()
                db.commit()
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame analysis failed: {str(e)}")


class ViolationLog(BaseModel):
    violation_type: str
    message: str

@app.post("/log-violation/{interview_id}")
async def log_violation(
    interview_id: int,
    violation: ViolationLog,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Logs a proctoring violation (e.g., tab switch) to the database.
    """
    report = _get_or_create_report(db, interview_id)
    current_violations = list(report.violations or [])
    current_violations.append({
        "timestamp": datetime.utcnow().isoformat(),
        "type": violation.violation_type,
        "message": violation.message,
    })
    report.violations = current_violations
    report.updated_at = datetime.utcnow()
    db.commit()
    
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────
#  4. GET /interview-report — Aggregated report
# ─────────────────────────────────────────────────────────
@app.get("/interview-report")
def get_interview_report(
    interview_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns an aggregated interview report for the given interview_id,
    including all answer scores and monitoring alerts.
    """
    report = (
        db.query(models.InterviewReport)
        .filter(models.InterviewReport.interview_id == interview_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Interview report not found")

    # Aggregate answer scores
    answer_data = report.answers or []
    if answer_data:
        avg_scores = {}
        score_keys = ["content_relevance", "fluency", "vocabulary", "confidence", "structure", "overall_score"]
        for key in score_keys:
            values = [a["scores"][key] for a in answer_data if key in a.get("scores", {})]
            avg_scores[key] = float("{:.1f}".format(sum(values) / len(values))) if values else 0.0
    else:
        avg_scores = {}

    # Aggregate monitoring data
    monitoring_data = report.monitoring or []
    total_frames = len(monitoring_data)
    suspicious_frames = sum(1 for m in monitoring_data if m.get("is_suspicious"))
    all_alerts = []
    for m in monitoring_data:
        all_alerts.extend(m.get("alerts", []))

    # Deduplicate alerts by type
    unique_alert_types = {}
    for alert in all_alerts:
        if isinstance(alert, str):
            atype = alert
            alert_obj = {"type": atype, "message": atype}
        else:
            atype = alert.get("type", "unknown")
            alert_obj = alert

        if atype not in unique_alert_types:
            unique_alert_types[atype] = {**alert_obj, "occurrences": 1}
        else:
            unique_alert_types[atype]["occurrences"] += 1

    return {
        "interview_id": interview_id,
        "total_answers": len(answer_data),
        "average_scores": avg_scores,
        "answers": answer_data,
        "monitoring_summary": {
            "total_frames_analyzed": total_frames,
            "suspicious_frames": suspicious_frames,
            "suspicion_rate": float("{:.2f}".format(suspicious_frames / max(total_frames, 1))),
            "unique_alerts": list(unique_alert_types.values()),
        },
    }


@app.get("/export-dataset")
def export_dataset(
    format: str = "json",
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_hr),
):
    """
    Exports all interview evaluation data as CSV or JSON.
    """
    evaluations = db.query(models.Evaluation).all()
    
    data = []
    for ev in evaluations:
        # Flatten the data structure for export
        base_info = {
            "evaluation_id": ev.id,
            "interview_id": ev.interview_id,
            "overall_score": ev.overall_score,
            "speech_score": ev.speech_score,
            "nlp_score": ev.nlp_score,
            "vision_score": ev.vision_score,
            "fairness_score": ev.fairness_score,
            "fairness_adjustment": ev.fairness_adjustment,
            "created_at": ev.created_at.isoformat(),
        }
        
        # Add detailed metrics if available
        feedback = ev.detailed_feedback if isinstance(ev.detailed_feedback, dict) else {}
        metrics = feedback.get("metrics", {})
        for k, v in metrics.items():
            base_info[f"metric_{k}"] = v
            
        # Add answer details (this will create multiple rows for CSV)
        answers = feedback.get("answers", [])
        if not answers:
            data.append(base_info)
        else:
            for i, ans in enumerate(answers):
                row = base_info.copy()
                row["answer_index"] = i + 1
                row["transcript"] = ans.get("transcript", "")
                row["audio_path"] = ans.get("audio_file_path", "")
                
                # Add per-answer scores
                ans_scores = ans.get("scores", {})
                for sk, sv in ans_scores.items():
                    row[f"ans_score_{sk}"] = sv
                
                # Add per-answer features
                ans_features = ans.get("features", {})
                for fk, fv in ans_features.items():
                    row[f"ans_feat_{fk}"] = fv
                    
                data.append(row)

    if format.lower() == "csv":
        output = io.StringIO()
        if not data:
            return {"message": "No data to export"}
            
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=voxassess_dataset.csv"}
        )
    
    return data


@app.get("/reports/{interview_id}/pdf")
def download_report_pdf(
    interview_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        pdf_bytes = generate_interview_pdf(interview_id, db)
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=voxassess_report_{interview_id}.pdf"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
