import cv2
import numpy as np
import time
import threading
from dataclasses import dataclass, field
from typing import Optional, Any, Dict

from logger import logger

try:
    face_cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(face_cascade_path)
    if face_cascade.empty():
        face_cascade = None
except Exception as e:
    logger.warning("Haar cascade face detection unavailable: %s", e)
    face_cascade = None


_yolo_model = None
_face_mesh = None

def get_yolo_model():
    global _yolo_model
    if _yolo_model is not None:
        return _yolo_model
    try:
        from ultralytics import YOLO
        _yolo_model = YOLO("yolov8n.pt")
        return _yolo_model
    except Exception as e:
        logger.warning("YOLO object detection unavailable: %s", e)
        return None

def get_face_mesh():
    global _face_mesh
    if _face_mesh is not None:
        return _face_mesh
    try:
        import mediapipe as mp
        mp_face_mesh = mp.solutions.face_mesh
        _face_mesh = mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        return _face_mesh
    except Exception as e:
        logger.warning("MediaPipe Eye Contact Tracking unavailable: %s", e)
        return None




@dataclass
class SessionState:
    interview_id: str
    phone_confirmation_buffer: list[bool] = field(default_factory=list)
    eye_contact_tracker: Dict[str, Any] = field(
        default_factory=lambda: {"last_lookaway_time": None, "is_alerting": False}
    )
    lock: threading.Lock = field(default_factory=threading.Lock)


_session_states: Dict[str, SessionState] = {}
_session_states_lock = threading.Lock()


def get_session_state(interview_id: str) -> SessionState:
    with _session_states_lock:
        if interview_id not in _session_states:
            _session_states[interview_id] = SessionState(interview_id=interview_id)
        return _session_states[interview_id]


def cleanup_session_state(interview_id: int | str) -> None:
    with _session_states_lock:
        _session_states.pop(str(interview_id), None)




def detect_face(frame: np.ndarray) -> dict:
    """
    Detects faces in a video frame using OpenCV Haar Cascade.

    Args:
        frame: BGR image as numpy array (from OpenCV).

    Returns:
        Dictionary with face_detected, face_count, and bounding boxes.
    """
    if face_cascade is None or face_cascade.empty():
        faces = []
    else:
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=3, minSize=(40, 40)
        )

    face_count = len(faces)
    face_boxes = [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for (x, y, w, h) in faces]

    if face_count == 0 and face_mesh is not None:
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(image_rgb)
        if results.multi_face_landmarks:
            face_count = 1
            face_boxes = [{"x": 0, "y": 0, "w": 0, "h": 0}]

    return {
        "face_detected": face_count > 0,
        "face_count": face_count,
        "faces": face_boxes,
    }


def detect_eye_contact(frame: np.ndarray) -> dict:
    """
    Estimates whether the candidate is looking at the camera using MediaPipe Face Mesh
    to calculate 3D head pose orientation (Pitch, Yaw, Roll).
    """
    face_mesh = get_face_mesh()
    if face_mesh is None:
        return {
            "eye_contact": True, # Assume contact if we can't track
            "gaze_direction": "unknown (tracking disabled)",
            "confidence": 0.0
        }
    
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(image_rgb)

    if not results.multi_face_landmarks:
        return {
            "eye_contact": False,
            "gaze_direction": "no_face",
            "confidence": 0.0
        }

    # Use the first detected face
    face_landmarks = results.multi_face_landmarks[0]
    img_h, img_w, _ = frame.shape
    
    # 2D and 3D Model Points for head pose estimation
    face_2d = []
    face_3d = []

    for idx, lm in enumerate(face_landmarks.landmark):
        if idx == 33 or idx == 263 or idx == 1 or idx == 61 or idx == 291 or idx == 199:
            if idx == 1:
                nose_2d = (lm.x * img_w, lm.y * img_h)
                nose_3d = (lm.x * img_w, lm.y * img_h, lm.z * 3000)
            
            x, y = int(lm.x * img_w), int(lm.y * img_h)
            
            face_2d.append([x, y])
            face_3d.append([x, y, lm.z])

    face_2d = np.array(face_2d, dtype=np.float64)
    face_3d = np.array(face_3d, dtype=np.float64)

    focal_length = img_w
    cam_matrix = np.array(
        [[focal_length, 0, img_w / 2],
         [0, focal_length, img_h / 2],
         [0, 0, 1]], dtype=np.float64
    )
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    success, rot_vec, trans_vec = cv2.solvePnP(
        face_3d, face_2d, cam_matrix, dist_coeffs
    )
    rmat, jac = cv2.Rodrigues(rot_vec)
    angles, mtxR, mtxQ, Qx, Qy, Qz = cv2.RQDecomp3x3(rmat)

    # Get the angles
    x = angles[0] * 360 # Pitch (up/down)
    y = angles[1] * 360 # Yaw (left/right)
    # z = angles[2] * 360 # Roll (tilt)

    # Determine direction
    if y < -10:
        direction = "left"
    elif y > 10:
        direction = "right"
    elif x < -10:
        direction = "down"
    elif x > 10:
        direction = "up"
    else:
        direction = "forward"

    eye_contact = (direction == "forward")
    confidence = 1.0 - (min(abs(y), 20)/20) if eye_contact else 0.5 

    return {
        "eye_contact": eye_contact,
        "gaze_direction": direction,
        "confidence": round(float(confidence), 2)
    }



def detect_objects(frame: np.ndarray, face_boxes: list = []) -> dict:
    """
    Simplified detection for debugging.
    """
    logger.debug("Frame received for object detection with shape=%s", frame.shape)

    model = get_yolo_model()
    if model is None:
        return {
            "alerts": [],
            "is_suspicious": False,
            "person_count": 1,
            "objects": [],
            "raw_phone_detected": False
        }

    # 1 & 2. Ensure YOLO model runs on the frame
    results = model(frame)

    alerts = []
    detected_objects = []
    person_count: int = 0

    # 3. Add STRICT detection
    for r in results:
        for box in r.boxes:
            label = model.names[int(box.cls[0])]
            conf = float(box.conf[0])

            logger.debug("Detected object=%s confidence=%.3f", label, conf)

            if label == "cell phone" and conf > 0.75:
                alerts.append("Phone detected")

            # 4. ALSO detect multiple persons
            if label == "person":
                person_count = person_count + 1

            detected_objects.append({
                "class": label,
                "confidence": conf,
                "bbox": box.xyxy[0].tolist()
            })

    if person_count > 1:
        alerts.append("Multiple people detected")

    # 5. RETURN alerts clearly
    return {
        "alerts": alerts,
        "is_suspicious": len(alerts) > 0,
        "person_count": person_count,
        "objects": detected_objects,
        "raw_phone_detected": any("Phone" in a for a in alerts)
    }


def analyze_frame(frame: np.ndarray, interview_id: Optional[str] = None) -> dict:
    """
    Analyzes frame for objects (YOLO) and eye contact (MediaPipe).
    """
    face_result = detect_face(frame)
    object_result = detect_objects(frame)
    eye_contact_result = detect_eye_contact(frame)
    current_time = time.time()
    
    # Start with non-phone alerts
    alerts = [a for a in object_result["alerts"] if "Phone" not in a]
    is_suspicious = object_result["person_count"] > 1

    phone_detected = object_result.get("raw_phone_detected", False)

    if interview_id:
        s_id = str(interview_id)
        state = get_session_state(s_id)

        with state.lock:
            state.phone_confirmation_buffer.append(phone_detected)
            if len(state.phone_confirmation_buffer) > 3:
                state.phone_confirmation_buffer.pop(0)

            if sum(state.phone_confirmation_buffer) >= 2:
                alerts.append("Phone detected")
                is_suspicious = True

            tracker = state.eye_contact_tracker

            if not eye_contact_result["eye_contact"] and eye_contact_result["gaze_direction"] != "no_face":
                if tracker["last_lookaway_time"] is None:
                    tracker["last_lookaway_time"] = current_time
                elif current_time - tracker["last_lookaway_time"] > 3.0:
                    tracker["is_alerting"] = True
                    alerts.append("Please maintain eye contact with the camera.")
            else:
                tracker["last_lookaway_time"] = None
                tracker["is_alerting"] = False
    else:
        # Without interview_id, alert immediately
        if phone_detected:
            alerts.append("Phone detected")
            is_suspicious = True

    return {
        "is_suspicious": is_suspicious,
        "alerts": alerts,
        "objects": object_result["objects"],
        "person_count": object_result["person_count"],
        "eye_contact": eye_contact_result,
        "face": face_result
    }
