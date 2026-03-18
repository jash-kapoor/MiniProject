import os
import io
import cv2
import numpy as np
import base64
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime
import csv
import io

import os
import sys

# Add current directory to path for local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database
import models
from routers import users, interviews, stream
from whisper_model import transcribe_audio
from scoring import extract_speech_features, calculate_score
from monitoring import analyze_frame
from auth import get_current_user

# Create database tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="VoxAssess API", description="AI Interview Evaluation System API")

# Include routers
app.include_router(users.router)
app.include_router(interviews.router)
app.include_router(stream.router)

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temp directory for uploaded files
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "temp_uploads")
RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RECORDINGS_DIR, exist_ok=True)

# In-memory store for interview reports (per session)
interview_reports: dict = {}


@app.get("/")
def read_root():
    return {"message": "Welcome to VoxAssess API"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "database": "configured"}


# In-memory store for live session mapping
live_sessions: dict = {}

@app.post("/live-sessions")
def create_live_session(interview_id: int):
    import uuid
    meeting_id = str(uuid.uuid4())
    live_sessions[meeting_id] = interview_id
    return {"meetingId": meeting_id, "interview_id": interview_id}

@app.get("/live-sessions/{meeting_id}")
def get_live_session(meeting_id: str):
    if meeting_id not in live_sessions:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return {"interview_id": live_sessions[meeting_id]}

from pydantic import BaseModel
# from typing import Any # Already imported above

class SDPPayload(BaseModel):
    meetingId: str
    sdp: Any

# In-memory storage for signaling and alerts
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
def post_offer(payload: SDPPayload):
    offers[payload.meetingId] = payload.sdp
    return {"status": "success"}

@app.get("/offer/{meeting_id}")
def get_offer(meeting_id: str):
    if meeting_id in offers:
        return {"sdp": offers[meeting_id]}
    return {"sdp": None}

@app.post("/answer")
def post_answer(payload: SDPPayload):
    answers[payload.meetingId] = payload.sdp
    return {"status": "success"}

@app.get("/answer/{meeting_id}")
def get_answer(meeting_id: str):
    if meeting_id in answers:
        return {"sdp": answers[meeting_id]}
    return {"sdp": None}

@app.post("/meeting-alerts")
def post_meeting_alerts(payload: AlertPayload):
    meeting_alerts[payload.meetingId] = {
        "is_suspicious": payload.isSuspicious,
        "alerts": payload.alerts
    }
    return {"status": "success"}

@app.get("/meeting-alerts/{meeting_id}")
def get_meeting_alerts(meeting_id: str):
    if meeting_id in meeting_alerts:
        return meeting_alerts[meeting_id]
    return {"is_suspicious": False, "alerts": []}

# ─────────────────────────────────────────────────────────
#  1. POST /transcribe — Whisper transcription
# ─────────────────────────────────────────────────────────
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Accepts an audio file and returns the transcribed text.
    """
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        transcript = transcribe_audio(file_path)
        
        # Real-time analytics for Live Room
        from scoring import analyze_sentiment, calculate_rolling_confidence, extract_speech_features
        sentiment = analyze_sentiment(transcript)
        features = extract_speech_features(file_path, transcript)
        confidence_rolling = calculate_rolling_confidence(features)

        return {
            "transcript": transcript, 
            "filename": file.filename,
            "sentiment": sentiment,
            "confidence_rolling": confidence_rolling
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


# ─────────────────────────────────────────────────────────
#  2. POST /analyze-answer — Speech features + scoring
# ─────────────────────────────────────────────────────────
@app.post("/analyze-answer")
async def analyze_answer(
    file: UploadFile = File(...),
    interview_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
):
    """
    Accepts an audio file, transcribes it, extracts speech features,
    and calculates an interview score.
    """
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Step 1: Transcribe
        transcript = transcribe_audio(file_path)

        # Step 2: Extract features
        features = extract_speech_features(file_path, transcript)
        features["transcript"] = transcript

        # Step 3: Score
        scores = calculate_score(features)

        # Step 4: Persist Audio
        timestamp = int(time.time())
        safe_name = f"{timestamp}_{interview_id or 'anon'}_{file.filename}"
        permanent_path = os.path.join(RECORDINGS_DIR, safe_name)
        
        # Use shutil to move the file
        import shutil
        shutil.move(file_path, permanent_path)

        result = {
            "transcript": transcript,
            "audio_file_path": permanent_path,
            "features": {k: v for k, v in features.items() if k != "transcript"},
            "scores": scores,
        }

        # Store in database if interview_id provided
        if interview_id:
            db_interview = db.query(models.Interview).filter(models.Interview.id == interview_id).first()
            if db_interview:
                # Add to a temporary list or update a running aggregate
                # For now, let's keep the interview_reports dict for detailed per-answer tracking
                # but update the interview status to 'evaluating'
                s_id = str(interview_id)
                if s_id not in interview_reports:
                    interview_reports[s_id] = {"answers": [], "monitoring": []}
                interview_reports[s_id]["answers"].append(result)
                
                db_interview.status = "evaluating"
                db.commit()

        return result
    except Exception as e:
        # If it failed before moving, cleanup the temp file
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/finalize-interview/{interview_id}")
async def finalize_interview(interview_id: int, db: Session = Depends(database.get_db)):
    """
    Calculates final scores from all answers and saves to the database.
    """
    s_id = str(interview_id)
    if s_id not in interview_reports:
        raise HTTPException(status_code=404, detail="No interview data found for this session")

    report = interview_reports[s_id]
    answers = report.get("answers", [])
    
    if not answers:
        raise HTTPException(status_code=400, detail="No answers recorded for this interview")

    # Calculate average scores
    avg_scores = {}
    score_keys = [
        "content_relevance", "fluency", "vocabulary", "confidence", 
        "structure", "fairness_score", "fairness_adjustment", "overall_score"
    ]
    for key in score_keys:
        values = [a["scores"][key] for a in answers if key in a.get("scores", {})]
        avg_scores[key] = sum(values) / len(values) if values else 0

    # Save to Database
    db_evaluation = models.Evaluation(
        interview_id=interview_id,
        speech_score=avg_scores.get("fluency", 0),
        nlp_score=avg_scores.get("content_relevance", 0),
        vision_score=avg_scores.get("confidence", 0), # Simplified mapping
        fairness_score=avg_scores.get("fairness_score", 0),
        fairness_adjustment=avg_scores.get("fairness_adjustment", 0),
        overall_score=avg_scores.get("overall_score", 0),
        detailed_feedback={
            "summary": "Interview completed successfully",
            "metrics": avg_scores,
            "answers": answers,
            "monitoring": report.get("monitoring", []),
            "violations": report.get("violations", [])
        }
    )
    
    db.add(db_evaluation)
    
    db_interview = db.query(models.Interview).filter(models.Interview.id == interview_id).first()
    if db_interview:
        db_interview.status = "completed"
    
    db.commit()
    
    # Cleanup in-memory store
    interview_reports.pop(s_id, None)
    
    return {"message": "Interview finalized and saved", "evaluation_id": db_evaluation.id}


@app.post("/detect")
async def detect(file: UploadFile = File(...), current_user: models.User = Depends(get_current_user)):
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
    current_user: models.User = Depends(get_current_user)
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
            s_id = str(interview_id) if interview_id else "unknown"
            if s_id not in interview_reports:
                interview_reports[s_id] = {"answers": [], "monitoring": []}
            # Store summary only (not full frame data)
            interview_reports[s_id]["monitoring"].append({
                "face_detected": bool(result["face"]["detected"]), # Ensure boolean type
                "eye_contact": bool(result["eye_contact"]["detected"]), # Ensure boolean type
                "person_count": int(result["person_count"]), # Ensure integer type
                "alerts": result["alerts"],
                "is_suspicious": bool(result["is_suspicious"]), # Ensure boolean type
            })
            
            # Broadcast alert in real-time if meeting context is known
            # (Note: monitoring currently uses interview_id, we'd need meeting_id for WS broadcast)
            # For now, we rely on the client sending meeting-alerts via REST which we'll upgrade later
        
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
    current_user: models.User = Depends(get_current_user)
):
    """
    Logs a proctoring violation (e.g., tab switch) to the in-memory store.
    """
    s_id = str(interview_id)
    if s_id not in interview_reports:
        interview_reports[s_id] = {"answers": [], "monitoring": [], "violations": []}
    
    if "violations" not in interview_reports[s_id]:
        interview_reports[s_id]["violations"] = []
        
    interview_reports[s_id]["violations"].append({
        "timestamp": datetime.utcnow().isoformat(),
        "type": violation.violation_type,
        "message": violation.message,
    })
    
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────
#  4. GET /interview-report — Aggregated report
# ─────────────────────────────────────────────────────────
@app.get("/interview-report")
def get_interview_report(interview_id: str, current_user: models.User = Depends(get_current_user)):
    """
    Returns an aggregated interview report for the given interview_id,
    including all answer scores and monitoring alerts.
    """
    if interview_id not in interview_reports:
        raise HTTPException(status_code=404, detail="Interview report not found")

    report = interview_reports[interview_id]

    # Aggregate answer scores
    answer_data = report.get("answers", [])
    if answer_data:
        avg_scores = {}
        score_keys = ["content_relevance", "fluency", "vocabulary", "confidence", "structure", "overall_score"]
        for key in score_keys:
            values = [a["scores"][key] for a in answer_data if key in a.get("scores", {})]
            avg_scores[key] = float("{:.1f}".format(sum(values) / len(values))) if values else 0.0
    else:
        avg_scores = {}

    # Aggregate monitoring data
    monitoring_data = report.get("monitoring", [])
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
def export_dataset(format: str = "json", db: Session = Depends(database.get_db)):
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
        metrics = ev.detailed_feedback.get("metrics", {})
        for k, v in metrics.items():
            base_info[f"metric_{k}"] = v
            
        # Add answer details (this will create multiple rows for CSV)
        answers = ev.detailed_feedback.get("answers", [])
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
        import csv
        import io
        from fastapi.responses import StreamingResponse
        
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
