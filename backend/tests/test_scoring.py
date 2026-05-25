import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scoring import calculate_score


def test_calculate_score_basic():
    features = {
        "transcript": "I have experience in software development with Python and React. I led a team of five engineers to deliver a cloud migration project that reduced latency by forty percent.",
        "word_count": 30,
        "speech_rate": 130,
        "filler_words": 0,
        "pause_duration": 1.0,
        "sentence_count": 2,
        "duration_seconds": 15.0,
    }
    result = calculate_score(features)
    assert "overall_score" in result
    assert "content_relevance" in result
    assert "fluency" in result
    assert "vocabulary" in result
    assert "confidence" in result
    assert "structure" in result
    assert "fairness_score" in result
    assert "fairness_adjustment" in result
    assert 0 <= result["overall_score"] <= 100


def test_calculate_score_empty_transcript():
    features = {
        "transcript": "",
        "word_count": 0,
        "speech_rate": 0,
        "filler_words": 0,
        "pause_duration": 0,
        "sentence_count": 0,
        "duration_seconds": 0,
    }
    result = calculate_score(features)
    assert result["overall_score"] >= 0


def test_fairness_boost_applies():
    """When content is much better than delivery, fairness adjustment should be positive."""
    features = {
        "transcript": "I implemented a microservices architecture using Kubernetes, optimized database queries resulting in improved performance, and coordinated cross-functional teams to deliver the project.",
        "word_count": 25,
        "speech_rate": 40,  # Very slow (poor delivery)
        "filler_words": 5,  # Many fillers (poor delivery)
        "pause_duration": 8.0,  # Long pauses
        "sentence_count": 1,
        "duration_seconds": 20.0,
    }
    result = calculate_score(features)
    assert result["fairness_adjustment"] >= 0
