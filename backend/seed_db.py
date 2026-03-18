import sqlite3
import os
from datetime import datetime

DB_PATH = "/Users/JashKapoor/Desktop/voxassess-ai/backend/voxassess_dev.db"

def seed_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Pre-calculated bcrypt hash for 'password123'
    password_hash = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGGa31S."
    
    # Seed Users
    users = [
        (1, "alice@example.com", "Alice Thompson", password_hash, "candidate", datetime.utcnow().isoformat()),
        (2, "bob@example.com", "Bob Miller", password_hash, "hr", datetime.utcnow().isoformat()),
        (3, "charlie@example.com", "Charlie Davis", password_hash, "candidate", datetime.utcnow().isoformat()),
        (4, "dana@example.com", "Dana White", password_hash, "candidate", datetime.utcnow().isoformat()),
    ]
    cursor.executemany("INSERT OR IGNORE INTO users (id, email, full_name, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)", users)

    # Seed Interviews
    interviews = [
        (1, 1, "Senior React Developer", "completed", datetime.utcnow().isoformat()),
        (2, 2, "Fullstack Engineer", "evaluating", datetime.utcnow().isoformat()),
        (3, 3, "Product Manager", "completed", datetime.utcnow().isoformat()),
        (4, 4, "UX Researcher", "pending", datetime.utcnow().isoformat()),
    ]
    cursor.executemany("INSERT OR IGNORE INTO interviews (id, candidate_id, job_title, status, created_at) VALUES (?, ?, ?, ?, ?)", interviews)

    # Seed Evaluations
    evaluations = [
        (1, 1, 85.0, 90.0, 80.0, 85.0, 
         '{"metrics": {"fluency": 85, "content_relevance": 90, "confidence": 80, "structure": 85, "vocabulary": 88, "overall_score": 85}, '
         '"answers": [{"transcript": "I am a React developer with 5 years of experience. I specialize in building high-performance web applications using Next.js and Tailwind CSS.", "scores": {"overall_score": 88, "fluency": 90, "content_relevance": 86, "vocabulary": 85, "confidence": 88, "structure": 90}}], '
         '"monitoring": [{"alerts": [{"type": "no_eye_contact", "message": "Looking away from camera", "severity": "low", "confidence": 0.8}]}]}', 
         datetime.utcnow().isoformat()),
        (3, 3, 92.0, 88.0, 95.0, 91.0, 
         '{"metrics": {"fluency": 92, "content_relevance": 88, "confidence": 95, "structure": 90, "vocabulary": 91, "overall_score": 91}, '
         '"answers": [{"transcript": "I led a team of 5 to deliver a complex cloud migration. We successfully reduced latency by 40% and improved system reliability.", "scores": {"overall_score": 93, "fluency": 94, "content_relevance": 92, "vocabulary": 90, "confidence": 95, "structure": 92}}], '
         '"monitoring": []}', 
         datetime.utcnow().isoformat()),
    ]
    cursor.executemany("INSERT OR IGNORE INTO evaluations (id, interview_id, speech_score, nlp_score, vision_score, overall_score, detailed_feedback, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", evaluations)

    conn.commit()
    conn.close()
    print("Database seeded successfully!")

if __name__ == "__main__":
    seed_db()
