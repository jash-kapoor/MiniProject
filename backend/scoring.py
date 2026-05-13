import re
import spacy
import librosa
import numpy as np
import google.generativeai as genai
import os
import json
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("WARNING: GEMINI_API_KEY environment variable is missing. AI scoring will be disabled.")
else:
    genai.configure(api_key=api_key)

# Load spaCy model
nlp = spacy.load("en_core_web_sm")

# Common filler words to detect
FILLER_WORDS = {
    "um", "uh", "er", "ah", "like", "you know", "basically",
    "actually", "literally", "sort of", "kind of", "i mean",
    "right", "so", "well", "okay"
}

# Keywords by category for content relevance scoring
STRONG_VOCABULARY = {
    "implemented", "developed", "optimized", "architected", "designed",
    "collaborated", "analyzed", "delivered", "managed", "led",
    "spearheaded", "streamlined", "engineered", "integrated", "deployed",
    "scalable", "efficient", "robust", "innovative", "strategic",
    "pursuing", "coordinator", "engineering", "computer", "science",
    "experience", "university", "graduate", "undergraduate", "degree",
    "passionate", "skills", "team", "project", "research", "internship",
    "academic", "professional", "responsible", "achieved"
}

# Simple sentiment words
POSITIVE_WORDS = {
    "successfully", "positive", "strong", "excellent", "great", "win", "achieved",
    "improved", "efficient", "best", "good", "happy", "excited", "opportunity"
}
NEGATIVE_WORDS = {
    "failed", "bad", "difficult", "struggle", "problem", "issue", "error",
    "weak", "negative", "poor", "slow", "hard", "stuck", "worried"
}


def extract_speech_features(audio_path: str, transcript: str) -> dict:
    """
    Extracts speech quality features from the audio and its transcript.

    Args:
        audio_path: Path to the audio file.
        transcript: Transcribed text from Whisper.

    Returns:
        Dictionary containing speech features.
    """
    # --- Audio-based features ---
    y, sr = librosa.load(audio_path, sr=None)
    duration = librosa.get_duration(y=y, sr=sr)

    # Word count and speech rate (words per minute)
    words = transcript.split()
    word_count = len(words)
    speech_rate = (word_count / duration) * 60 if duration > 0 else 0

    # Pause detection using silence intervals
    intervals = librosa.effects.split(y, top_db=30)
    total_speech_time = sum((end - start) for start, end in intervals) / sr
    pause_duration = max(0, duration - total_speech_time)

    # --- Transcript-based features ---
    transcript_lower = transcript.lower()

    # Filler word count
    filler_count = 0
    for filler in FILLER_WORDS:
        filler_count += len(re.findall(r'\b' + re.escape(filler) + r'\b', transcript_lower))

    # Answer length (sentence count via spaCy)
    doc = nlp(transcript)
    sentence_count = len(list(doc.sents))

    return {
        "speech_rate": float(round(float(speech_rate), 2)),
        "pause_duration": float(round(float(pause_duration), 2)),
        "filler_words": int(filler_count),
        "word_count": int(word_count),
        "sentence_count": int(sentence_count),
        "answer_length": int(word_count),
        "duration_seconds": float(round(float(duration), 2)),
    }

def compute_all_scores(audio_path: str, transcript: str):
    features = extract_speech_features(audio_path, transcript)
    features["transcript"] = transcript
    score = calculate_score(features)
    
    return {
        "features": features,
        "score": score
    }

def calculate_score(features: dict) -> dict:
    """
    Calculates an interview answer score from 0-100 based on extracted features.

    Scoring dimensions:
        - Content Relevance (20 pts): Strength of vocabulary used
        - Fluency (20 pts): Low filler word ratio and smooth delivery
        - Vocabulary (20 pts): Lexical diversity & strong word usage
        - Confidence (20 pts): Steady speech rate, minimal long pauses
        - Structure (20 pts): Well-formed sentences, appropriate length

    Args:
        features: Dictionary from extract_speech_features, plus the transcript.

    Returns:
        Dictionary with dimension scores and overall score.
    """
    transcript = features.get("transcript", "")
    transcript_lower = transcript.lower()
    words = transcript.split()
    word_count = features.get("word_count", len(words))
    speech_rate = features.get("speech_rate", 0)
    filler_count = features.get("filler_words", 0)
    pause_duration = features.get("pause_duration", 0)
    sentence_count = features.get("sentence_count", 1)
    duration = features.get("duration_seconds", 1)

    # --- 1. Content Relevance (0-20) ---
    content_relevance = 0.0
    
    # Start with a base of 10/20 for ANY answer over 15 words
    if word_count > 15:
        content_relevance = 10.0
        
    # Add up to 6 bonus points for strong vocabulary words found (cap at 2 points per word, max 6 points total)
    strong_word_count = sum(1 for w in words if w.lower() in STRONG_VOCABULARY)
    vocab_bonus = min(6.0, strong_word_count * 2.0)
    content_relevance += vocab_bonus
    
    # Add 2 bonus points if answer is over 50 words
    if word_count > 50:
        content_relevance += 2.0
        
    # Add 2 bonus points if answer is over 100 words
    if word_count > 100:
        content_relevance += 2.0
        
    # Hard cap at 20
    content_relevance = min(20.0, content_relevance)

    # --- 2. Fluency (0-20) [Fairness Normalized] ---
    filler_ratio = filler_count / max(word_count, 1)
    # Be more forgiving: bump the thresholds
    if filler_ratio < 0.05: # Was 0.02
        fluency = 20
    elif filler_ratio < 0.10: # Was 0.05
        fluency = 16
    elif filler_ratio < 0.15: # Was 0.10
        fluency = 12
    elif filler_ratio < 0.20: # Was 0.15
        fluency = 8
    else:
        fluency = 4

    # --- 3. Vocabulary (0-20) ---
    unique_words = set(w.lower() for w in words if w.isalpha())
    lexical_diversity = len(unique_words) / max(word_count, 1)

    doc = nlp(transcript)
    avg_word_length = np.mean([len(token.text) for token in doc if token.is_alpha]) if word_count > 0 else 0

    # Ideal vocabulary score
    vocabulary = float(min(20.0, float((lexical_diversity * 25) + (avg_word_length * 1.5))))

    # --- 4. Confidence (0-20) [Fairness Normalized] ---
    # Ideal speech rate: 90-180 wpm (Was 120-160)
    if 90 <= speech_rate <= 180:
        rate_score = 10
    elif 70 <= speech_rate <= 200:
        rate_score = 7
    elif 50 <= speech_rate <= 220:
        rate_score = 4
    else:
        rate_score = 2

    # Pause penalty: [Fairness Normalized]
    pause_ratio = pause_duration / max(duration, 1)
    if pause_ratio < 0.25: # Was 0.15
        pause_score = 10
    elif pause_ratio < 0.40: # Was 0.30
        pause_score = 7
    elif pause_ratio < 0.60: # Was 0.50
        pause_score = 4
    else:
        pause_score = 2

    confidence = rate_score + pause_score

    # --- 5. Structure (0-20) ---
    avg_sentence_length = word_count / max(sentence_count, 1)

    if 10 <= avg_sentence_length <= 25:
        structure = 16
    elif 5 <= avg_sentence_length <= 35:
        structure = 12
    else:
        structure = 6

    # Bonus for multi-sentence answers
    if sentence_count >= 3:
        structure = min(20, structure + 4)

    # --- 6. Fairness Score (0-20) [NEW] ---
    # Fairness score rewards content relevance over delivery mechanics
    # High vocabulary/relevance but low fluency/confidence = high fairness boost
    fairness_score = (content_relevance * 0.5) + (vocabulary * 0.5)
    
    # Calculate adjustment
    # If delivery (fluency/confidence) is significantly lower than content (relevance/vocab)
    content_avg = (content_relevance + vocabulary) / 2
    delivery_avg = (fluency + confidence) / 2
    
    fairness_adjustment = 0.0
    if content_avg > delivery_avg:
        # Provide a boost proportional to the gap
        fairness_adjustment = (content_avg - delivery_avg) * 0.5

    # --- Overall ---
    base_overall = float(content_relevance + fluency + vocabulary + confidence + structure)
    overall = float(round(float(base_overall + fairness_adjustment), 1))

    return {
        "content_relevance": float(round(float(content_relevance), 1)),
        "fluency": float(round(float(fluency), 1)),
        "vocabulary": float(round(float(vocabulary), 1)),
        "confidence": float(round(float(confidence), 1)),
        "structure": float(round(float(structure), 1)),
        "fairness_score": float(round(float(fairness_score), 1)),
        "fairness_adjustment": float(round(float(fairness_adjustment), 1)),
        "overall_score": float(min(100.0, float(overall))),
    }


def analyze_sentiment(text: str) -> dict:
    """
    Performs basic sentiment analysis on the text.
    Returns a score from -1 (negative) to 1 (positive).
    """
    words = re.findall(r'\b\w+\b', text.lower())
    if not words:
        return {"score": 0.0, "label": "neutral"}
    
    pos_count = sum(1 for w in words if w in POSITIVE_WORDS)
    neg_count = sum(1 for w in words if w in NEGATIVE_WORDS)
    
    score = (pos_count - neg_count) / len(words)
    # Scale score to be more visible
    scaled_score = float(max(-1.0, float(min(1.0, float(score * 10)))))
    
    label = "neutral"
    if scaled_score > 0.2:
        label = "positive"
    elif scaled_score < -0.2:
        label = "negative"
        
    return {"score": float(round(float(scaled_score), 2)), "label": label}


def calculate_rolling_confidence(features: dict) -> float:
    """
    Calculates a quick confidence metric (0-100) based on fluency and rate.
    Ideal for real-time meters.
    """
    speech_rate = features.get("speech_rate", 0)
    filler_count = features.get("filler_words", 0)
    word_count = max(features.get("word_count", 1), 1)
    
    # 1. Fluency (50 pts)
    filler_ratio = filler_count / word_count
    fluency_score = max(0, 50 - (filler_ratio * 200)) # Penalize heavily
    
    # 2. Rate (50 pts) - Target 110-150 wpm
    if 110 <= speech_rate <= 150:
        rate_score = 50
    else:
        diff = min(50, abs(speech_rate - 130) / 2)
        rate_score = 50.0 - float(diff)
        
    return float(round(float(fluency_score + rate_score), 1))

def score_with_gemini(question: str, transcript: str) -> dict:
    prompt = f"""You are a strict professional interview evaluator. Evaluate ONLY what is literally written — do not give benefit of the doubt or infer intent. Most answers should score 11-15 out of 20. Scores of 18-20 are rare and only for truly exceptional answers.

Question: {question}
Candidate's Answer: {transcript}

Score each dimension using ONLY these specific rules:

FLUENCY (0-20) — measure actual smoothness of expression:
- Deduct 3 points for each grammatically broken or incomplete sentence
- Deduct 2 points for each filler phrase ("I think", "and then", "like", "basically")
- Deduct 2 points for repeated words or ideas within same answer
- Start at 20 and subtract. Minimum 0.

VOCABULARY (0-20) — measure word quality:
- Count professional/precise words used (implemented, coordinated, optimized, etc.)
- Penalize vague words: "things", "stuff", "good", "nice", "very", "a lot"
- Penalize grammatically incorrect word usage ("companies like values who can")
- Average answer with mixed vocabulary = 12-14. Only rich precise vocabulary = 17+.

CONTENT_RELEVANCE (0-20) — does it directly answer the question:
- Does the answer address exactly what was asked? 
- Generic answers that could apply to any question = 10-13
- Specific, question-targeted answer with examples = 15-18

CONFIDENCE (0-20) — assertiveness and certainty:
- Hedging phrases ("I think", "maybe", "I feel like") each deduct 2 points
- Clear assertive statements add points
- Start at 16, add/subtract based on above

STRUCTURE (0-20) — organization:
- No clear structure (just stream of consciousness) = 8-10
- Some structure but rambling = 11-14  
- Clear intro → body → conclusion = 15-18
- Perfect STAR format = 19-20

feedback: Identify the single most impactful weakness with a specific example from their answer.

overall_score: Sum of all 5 scores.

Return ONLY this JSON, no markdown, no explanation:
{{"content_relevance": X, "fluency": X, "vocabulary": X, "confidence": X, "structure": X, "feedback": "...", "overall_score": X}}"""
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:-3]
        elif text.startswith("```"):
            text = text[3:-3]
            
        result = json.loads(text.strip())
        
        if result.get("overall_score", 0) > 95:
            dimensions = ["content_relevance", "fluency", "vocabulary", "confidence", "structure"]
            if all(result.get(dim, 0) > 18 for dim in dimensions):
                for dim in dimensions:
                    result[dim] = max(0, result[dim] - 3)
                result["overall_score"] = sum(result[dim] for dim in dimensions)
                
        return result
    except Exception as e:
        print(f"Gemini scoring failed: {e}")
        return None
